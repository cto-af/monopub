import assert from 'node:assert';
import {cli} from '../lib/cli.js';
import {fileURLToPath} from 'node:url';
import snap from 'snappy-snaps';
import test from 'node:test';

const bin = fileURLToPath(new URL('../bin/monopub.js', import.meta.url));
const cwd = fileURLToPath(new URL('fixtures', import.meta.url));

async function runCli(...args) {
  let stdout = '';
  let stderr = '';
  let error = null;
  try {
    await cli([process.argv0, bin, ...args], {
      writeOut: str => (stdout += str),
      writeErr: str => (stderr += str),
    });
  } catch (er) {
    error = er;
  }
  return {stdout, stderr, code: error?.code};
}

test('help', async() => {
  const base = await runCli('-h');
  assert.deepEqual(base, await snap('base', base));

  const del = await runCli('delete', '-h');
  assert.deepEqual(del, await snap('delete', del));

  const exec = await runCli('exec', '-h');
  assert.deepEqual(exec, await snap('exec', exec));

  const version = await runCli('version', '-h');
  assert.deepEqual(version, await snap('version', version));
});

test('exec', async() => {
  const fixtures = await runCli(
    '--cwd',
    cwd,
    '-P',
    '-p',
    'foo',
    '-p',
    'bar',
    'exec',
    'exit 0'
  );
  assert.equal(fixtures.code, undefined);

  const fail = await runCli(
    '--cwd',
    cwd,
    '-P',
    '-p',
    'foo',
    '-p',
    'bar',
    'exec',
    'exit 1'
  );
  assert.deepEqual(fail, {
    stdout: '',
    stderr: 'Failed execution\n',
    code: 'commander.error',
  });
});

test('version', async() => {
  const version = await runCli(
    '--cwd',
    cwd,
    '-P',
    '-p',
    'foo',
    '-p',
    'bar',
    'version'
  );
  assert.equal(version.code, undefined);
});
