import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { log } from './logger.js';

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status =
    error instanceof HttpError ? error.status
    : typeof (error as { status?: number })?.status === 'number' ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (status >= 500) log.error('Request failed', { message, stack: (error as Error)?.stack });
  res.status(status).json({
    error: message,
    ...(error instanceof HttpError && error.details !== undefined ? { details: error.details } : {}),
  });
}

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

export function queryString(req: Request, name: string): string | undefined {
  const value = firstValue(req.query[name]);
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

export function queryNumber(req: Request, name: string): number | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function queryBool(req: Request, name: string): boolean | undefined {
  const raw = queryString(req, name);
  if (raw === undefined) return undefined;
  if (['1', 'true', 'yes'].includes(raw.toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(raw.toLowerCase())) return false;
  return undefined;
}

/** Accepts `?status=new&status=called` and `?status=new,called`. */
export function queryList(req: Request, name: string): string[] | undefined {
  const raw = req.query[name];
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const flat = values
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');
  return flat.length > 0 ? flat : undefined;
}

/** Express 5 types path params loosely; collapse to a single string. */
export function pathParam(req: Request, name: string): string {
  const raw = (req.params as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}

export function requireId(req: Request, name = 'id'): number {
  const id = Number.parseInt(pathParam(req, name), 10);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${name}`);
  return id;
}
