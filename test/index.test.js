import {MonoRoot} from '../lib/index.js';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('index', async() => {
  const m = await new MonoRoot({cwd: root}).init();
  assert.equal(m.name, '@cto.af/monopub');
  const ver = m.version;
  assert.match(ver, /\d+\.\d+\.\d+/);
  m.version = 'foo';
  assert.equal(m.version, 'foo');
  m.version = ver;
  assert.equal(m.private, false);
  assert.deepEqual(m.workspaces, []);
  await m.save(false);
});
