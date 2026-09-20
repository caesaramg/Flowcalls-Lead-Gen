export interface Args {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** Minimal `--key value` / `--flag` / `--key=value` parser. */
export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i += 1;
    } else {
      flags[body] = true;
    }
  }
  return { positional, flags };
}

export function flagString(args: Args, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === 'string' ? value : undefined;
}

export function flagNumber(args: Args, name: string): number | undefined {
  const value = flagString(args, name);
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function flagBool(args: Args, name: string): boolean {
  const value = args.flags[name];
  if (value === true) return true;
  return typeof value === 'string' && ['1', 'true', 'yes'].includes(value.toLowerCase());
}
