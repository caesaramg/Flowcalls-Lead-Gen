import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves a user-supplied path against the directory they actually ran the
 * command from. npm sets INIT_CWD when a script is run through a workspace, at
 * which point process.cwd() is the workspace directory, not theirs.
 */
export function resolveUserPath(input: string): string {
  const bases = [process.env['INIT_CWD'], process.cwd()].filter(Boolean) as string[];
  for (const base of bases) {
    const candidate = path.resolve(base, input);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(bases[0] ?? process.cwd(), input);
}
