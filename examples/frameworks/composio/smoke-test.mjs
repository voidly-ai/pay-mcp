// No-account smoke test. Composio's own path needs a Composio API key, so this checks the hosted MCP
// URL with the official MCP TypeScript SDK instead (handshake + tools/list), and that the Composio
// SDK exposes the experimental custom-toolkit API used by index.mjs. It does NOT exercise Composio.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

const client = new Client({ name: 'voidly-composio-smoke', version: '0.0.1' });
await client.connect(new StreamableHTTPClientTransport(new URL('https://api.voidly.ai/mcp/voidpay')));
const { tools } = await client.listTools();
console.log(JSON.stringify({ server: 'voidpay', via: '@modelcontextprotocol/sdk', tools: tools.map((t) => t.name) }));
await client.close();

const composio = new Composio({ apiKey: 'placeholder-no-network-call', provider: new VercelProvider() });
const ok = typeof composio.experimental?.customToolkits?.upsert === 'function' && typeof composio.sessions?.create === 'function';
console.log(JSON.stringify({ composio_custom_toolkit_api_present: ok }));
if (!tools.length || !ok) throw new Error('smoke failed');
console.log('SMOKE PASS (generic MCP check; Composio path not executed)');
