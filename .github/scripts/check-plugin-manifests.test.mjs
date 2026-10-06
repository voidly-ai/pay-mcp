import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkHostedServer } from './check-plugin-manifests.mjs';

const hosted = JSON.parse(readFileSync(new URL('../../.mcp.json', import.meta.url), 'utf8')).mcpServers['voidpay-hosted'];

test('hosted server accepts only its current type and URL', () => {
  assert.doesNotThrow(() => checkHostedServer(hosted));
  for (const extra of ['headers', 'futureOption']) {
    assert.throws(() => checkHostedServer({ ...hosted, [extra]: 'unexpected' }), /only type and url/);
  }
});
