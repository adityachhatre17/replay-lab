import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// This check creates a synthetic account and replay records in the local demo database.
const base = (process.env.REPLAY_PREVIEW_URL || 'http://127.0.0.1:5173') + '/api';
const identity = {
  name: 'Contest smoke test',
  email: randomUUID() + '@example.test',
  password: randomUUID(),
  type: 'individual',
};
let cookie;

async function request(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  assert.ok(response.ok, path + ' returned HTTP ' + response.status);
  const session = response.headers.get('set-cookie');
  if (session && path === '/account/signup') cookie = session.split(';')[0];
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : null;
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/legacy-checkout.json', import.meta.url), 'utf8'));

await request('/account/signup', identity);
assert.ok(cookie, 'Sign-up returned a session cookie');

try {
  const legacy = await request('/replays', { ...fixture, orderId: 'ORD-58291', subset: true });
  assert.equal(legacy.comparison.orders, 1);
  assert.equal(legacy.comparison.accounts, 1);
  assert.equal(legacy.comparison.original.status, 500);
  assert.equal(legacy.comparison.original.payments, 0);
  assert.equal(legacy.comparison.patched.status, 200);
  assert.equal(legacy.comparison.patched.payments, 1);
  assert.equal(legacy.comparison.fixVerified, true);
  console.log('PASS legacy order: original 500 / 0 payments, patch 200 / 1 payment');

  await request('/replays/' + legacy.id + '/regression', {});
  const saved = await request('/replays?saved=true');
  assert.ok(saved.some((entry) => entry.id === legacy.id && entry.saved));
  const rerun = await request('/replays/' + legacy.id + '/rerun', {});
  assert.notEqual(rerun.id, legacy.id);
  assert.deepEqual(rerun.comparison, legacy.comparison);
  console.log('PASS saved regression: rerun matches the original comparison');

  const modern = await request('/replays', { ...fixture, orderId: 'ORD-58292', subset: false });
  assert.equal(modern.comparison.orders, 2);
  assert.equal(modern.comparison.original.status, 200);
  assert.equal(modern.comparison.patched.status, 200);
  assert.equal(modern.comparison.fixVerified, false);
  console.log('PASS modern control: both succeed and no fix is asserted');
} finally {
  await request('/account/logout', {});
}
