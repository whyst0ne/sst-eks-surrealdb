import { describe, it } from 'node:test';
import assert from 'node:assert';
import mod from './dist/index.js';

const app = mod.default || mod;

describe('Hono SurrealDB Service Endpoints', () => {
  it('GET /health returns status ok', async () => {
    const res = await app.request('/health');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.ok('database' in body);
    assert.ok('timestamp' in body);
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await app.request('/nonexistent');
    assert.strictEqual(res.status, 404);
  });
});
