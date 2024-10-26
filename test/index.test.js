import {MonoRoot} from '../lib/index.js';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('index', async() => {
  const m = await new MonoRoot({cwd: root}).init();
  assert.equal(m.name, '@cto.af/monopub');
  assert.match(m.version, /\d+\.\d+\.\d+/);
  assert.equal(m.private, false);
  assert.deepEqual(m.workspaces, []);
});
