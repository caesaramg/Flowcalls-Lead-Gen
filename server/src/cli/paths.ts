import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Expands a leading `~` to the user's home directory.
 *
 * Unix shells do this before the argument ever reaches us, but Windows cmd and
 * PowerShell do not — there, `~/Downloads/leads.csv` arrives verbatim and would
 * otherwise be treated as a folder literally named "~".
 */
export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

/**
 * Resolves a user-supplied path against the directory they actually ran the
 * command from. npm sets INIT_CWD when a script is run through a workspace, at
 * which point process.cwd() is the workspace directory, not theirs.
 */
export function resolveUserPath(input: string): string {
  const expanded = expandHome(input);
  if (path.isAbsolute(expanded)) return expanded;

  const bases = [process.env['INIT_CWD'], process.cwd()].filter(Boolean) as string[];
  for (const base of bases) {
    const candidate = path.resolve(base, expanded);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(bases[0] ?? process.cwd(), expanded);
}
