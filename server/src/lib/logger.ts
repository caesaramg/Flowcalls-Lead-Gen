type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? order.info;

function emit(level: Level, message: string, meta?: unknown): void {
  if (order[level] < threshold) return;
  const stamp = new Date().toISOString();
  const suffix = meta === undefined ? '' : ` ${safe(meta)}`;
  const line = `${stamp} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

function safe(meta: unknown): string {
  try {
    return typeof meta === 'string' ? meta : JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

export const log = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
