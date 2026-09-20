import { env } from './env.js';
import { log } from './logger.js';

export interface FetchTextResult {
  ok: boolean;
  status: number;
  url: string;
  body: string;
  contentType: string | null;
  elapsedMs: number;
  error?: string;
}

const lastRequestByHost = new Map<string, number>();

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keeps at least CRAWL_DELAY_MS between requests to the same host. */
async function throttle(host: string, delayMs = env.crawlDelayMs): Promise<void> {
  const last = lastRequestByHost.get(host) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < delayMs) await wait(delayMs - elapsed);
  lastRequestByHost.set(host, Date.now());
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  throttleHost?: boolean;
  maxBytes?: number;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<FetchTextResult> {
  const started = Date.now();
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, status: 0, url, body: '', contentType: null, elapsedMs: 0, error: 'Invalid URL' };
  }

  if (options.throttleHost !== false) await throttle(host);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? env.httpTimeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': env.userAgent,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        ...options.headers,
      },
      ...(options.body ? { body: options.body } : {}),
    });

    const contentType = response.headers.get('content-type');
    const maxBytes = options.maxBytes ?? 2_000_000;
    const raw = await response.text();
    const body = raw.length > maxBytes ? raw.slice(0, maxBytes) : raw;

    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      body,
      contentType,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.debug(`fetch failed ${url}`, message);
    return {
      ok: false,
      status: 0,
      url,
      body: '',
      contentType: null,
      elapsedMs: Date.now() - started,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const result = await fetchText(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  });
  if (!result.ok) {
    return { ok: false, status: result.status, data: null, error: result.error ?? result.body.slice(0, 300) };
  }
  try {
    return { ok: true, status: result.status, data: JSON.parse(result.body) as T };
  } catch (error) {
    return { ok: false, status: result.status, data: null, error: `Invalid JSON: ${String(error)}` };
  }
}

const robotsCache = new Map<string, string[]>();

/**
 * Minimal robots.txt support: collects Disallow paths from the `*` and our own
 * user-agent groups. On any failure we assume allowed, which matches how
 * mainstream crawlers behave when robots.txt is unreachable.
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  if (!env.respectRobotsTxt) return true;
  let origin: string;
  let path: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    path = parsed.pathname || '/';
  } catch {
    return false;
  }

  let disallow = robotsCache.get(origin);
  if (!disallow) {
    const result = await fetchText(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 100_000 });
    disallow = result.ok ? parseRobots(result.body) : [];
    robotsCache.set(origin, disallow);
  }

  return !disallow.some((rule) => rule !== '' && path.startsWith(rule));
}

export function parseRobots(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const rules: string[] = [];
  let applies = false;

  for (const line of lines) {
    const clean = line.split('#')[0]!.trim();
    if (clean === '') continue;
    const [rawKey, ...rest] = clean.split(':');
    const key = (rawKey ?? '').trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      applies = value === '*' || env.userAgent.toLowerCase().includes(value.toLowerCase());
    } else if (key === 'disallow' && applies) {
      if (value !== '') rules.push(value);
    }
  }
  return rules;
}

export { wait };
