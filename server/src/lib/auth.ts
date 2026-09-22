import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from './env.js';

/** Hostnames that only the machine itself can reach. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host.trim().toLowerCase());
}

/** Length-independent comparison, so a wrong password leaks nothing by timing. */
function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export function checkBasicCredentials(header: string | undefined, user: string, password: string): boolean {
  if (!header?.toLowerCase().startsWith('basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;

  const suppliedUser = decoded.slice(0, separator);
  const suppliedPassword = decoded.slice(separator + 1);
  // Both are always compared, so a valid username does not answer faster.
  const userOk = safeEqual(suppliedUser, user);
  const passwordOk = safeEqual(suppliedPassword, password);
  return userOk && passwordOk;
}

/**
 * HTTP Basic auth over the whole app. Returns null when no password is
 * configured, which is only allowed on a loopback bind (see assertSafeToListen).
 */
export function createAuthMiddleware(): RequestHandler | null {
  const password = env.appPassword;
  if (!password) return null;
  const user = env.appUser;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Health checks come from the platform's load balancer, which cannot
    // authenticate. It exposes nothing but liveness.
    if (req.path === '/api/health') {
      next();
      return;
    }
    if (checkBasicCredentials(req.headers.authorization, user, password)) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Flowcalls Prospecting", charset="UTF-8"');
    res.status(401).json({ error: 'Authentication required' });
  };
}

/**
 * Refuses to start an unauthenticated server on a public interface.
 *
 * The database holds real business contact details, director names and your
 * call notes — personal data under UK GDPR. Local use stays password-free;
 * anything reachable from off the machine must set APP_PASSWORD.
 */
export function assertSafeToListen(host: string, hasPassword: boolean): void {
  if (hasPassword || isLoopbackHost(host)) return;
  throw new Error(
    `Refusing to listen on ${host} without a password.\n\n` +
      `This app has no other access control, and the database contains personal data.\n` +
      `Set APP_PASSWORD (and optionally APP_USER, default "flowcalls") before exposing it,\n` +
      `or bind to 127.0.0.1 for local use.`,
  );
}
