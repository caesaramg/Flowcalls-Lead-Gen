import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSafeToListen, checkBasicCredentials, isLoopbackHost } from '../src/lib/auth.js';

const header = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('checkBasicCredentials', () => {
  it('accepts the configured credentials', () => {
    assert.equal(checkBasicCredentials(header('flowcalls', 's3cret'), 'flowcalls', 's3cret'), true);
  });

  it('rejects everything else', () => {
    assert.equal(checkBasicCredentials(header('flowcalls', 'wrong'), 'flowcalls', 's3cret'), false);
    assert.equal(checkBasicCredentials(header('someone', 's3cret'), 'flowcalls', 's3cret'), false);
    assert.equal(checkBasicCredentials(undefined, 'flowcalls', 's3cret'), false);
    assert.equal(checkBasicCredentials('', 'flowcalls', 's3cret'), false);
    assert.equal(checkBasicCredentials('Bearer abc', 'flowcalls', 's3cret'), false);
    assert.equal(checkBasicCredentials('Basic !!!not-base64!!!', 'flowcalls', 's3cret'), false);
    assert.equal(checkBasicCredentials('Basic ' + Buffer.from('nocolon').toString('base64'), 'flowcalls', 's3cret'), false);
  });

  it('handles a password containing a colon', () => {
    assert.equal(checkBasicCredentials(header('flowcalls', 'a:b:c'), 'flowcalls', 'a:b:c'), true);
  });

  it('does not accept an empty password as a match for a set one', () => {
    assert.equal(checkBasicCredentials(header('flowcalls', ''), 'flowcalls', 's3cret'), false);
  });
});

describe('isLoopbackHost', () => {
  it('knows which binds are private to the machine', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', 'LOCALHOST']) {
      assert.equal(isLoopbackHost(host), true, host);
    }
    for (const host of ['0.0.0.0', '::', '192.168.1.10', 'fly-app.internal']) {
      assert.equal(isLoopbackHost(host), false, host);
    }
  });
});

describe('assertSafeToListen', () => {
  it('allows an open server only on loopback', () => {
    assert.doesNotThrow(() => assertSafeToListen('127.0.0.1', false));
    assert.doesNotThrow(() => assertSafeToListen('localhost', false));
  });

  it('allows a public bind once a password is set', () => {
    assert.doesNotThrow(() => assertSafeToListen('0.0.0.0', true));
  });

  it('refuses to expose personal data without a password', () => {
    assert.throws(() => assertSafeToListen('0.0.0.0', false), /Refusing to listen/);
    assert.throws(() => assertSafeToListen('0.0.0.0', false), /APP_PASSWORD/);
  });
});
