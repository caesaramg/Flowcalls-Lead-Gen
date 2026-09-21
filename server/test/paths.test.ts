import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { expandHome, resolveUserPath } from '../src/cli/paths.js';

describe('expandHome', () => {
  it('expands a leading ~, which Windows shells do not do for us', () => {
    assert.equal(expandHome('~'), os.homedir());
    assert.equal(expandHome('~/Downloads/leads.csv'), path.join(os.homedir(), 'Downloads/leads.csv'));
    assert.equal(expandHome('~\\Downloads\\leads.csv'), path.join(os.homedir(), 'Downloads\\leads.csv'));
  });

  it('leaves everything else alone', () => {
    assert.equal(expandHome('leads.csv'), 'leads.csv');
    assert.equal(expandHome('./leads.csv'), './leads.csv');
    assert.equal(expandHome('~notahome/leads.csv'), '~notahome/leads.csv');
  });
});

describe('resolveUserPath', () => {
  let dir: string;
  let originalInitCwd: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowcalls-paths-'));
    originalInitCwd = process.env['INIT_CWD'];
  });

  afterEach(() => {
    if (originalInitCwd === undefined) delete process.env['INIT_CWD'];
    else process.env['INIT_CWD'] = originalInitCwd;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves against the directory the command was run from, not the workspace', () => {
    const file = path.join(dir, 'leads.csv');
    fs.writeFileSync(file, 'company_name\n');
    process.env['INIT_CWD'] = dir;
    assert.equal(resolveUserPath('leads.csv'), file);
  });

  it('keeps an absolute path as given', () => {
    const file = path.join(dir, 'leads.csv');
    fs.writeFileSync(file, 'company_name\n');
    process.env['INIT_CWD'] = os.tmpdir();
    assert.equal(resolveUserPath(file), file);
  });

  it('still returns a resolved path when the file does not exist, so the caller can report it', () => {
    process.env['INIT_CWD'] = dir;
    assert.equal(resolveUserPath('missing.csv'), path.join(dir, 'missing.csv'));
  });
});
