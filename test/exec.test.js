import assert from 'node:assert';
import {exec} from '../lib/exec.js';
import test from 'node:test';

test('exec', async() => {
  const good = await exec({shell: true}, 'echo foo');
  assert.deepEqual(good, {
    stdout: 'foo\n',
    stderr: '',
    ok: true,
    code: 0,
    signal: null,
  });

  const fail = await exec({}, '__NO SUCH COMMAND__');
  assert(fail.error);
  delete fail.error;
  assert.deepEqual(fail, {
    stdout: '',
    stderr: '',
    ok: false,
  });
});
