// No-key smoke test: MCP handshake + tools/list with the AI SDK's own MCP client (no LLM call).
import { createMCPClient } from '@ai-sdk/mcp';
import { ATLAS_URL, VOIDPAY_READ_ONLY, VOIDPAY_URL, connect } from './mcp.mjs';

for (const [server, url] of [['voidpay', VOIDPAY_URL], ['atlas', ATLAS_URL]]) {
  const client = await createMCPClient({ transport: { type: 'http', url } });
  try {
    const { tools } = await client.listTools();
    console.log(JSON.stringify({ server, tools: tools.map((t) => t.name) }));
    if (!tools.length) throw new Error(`no tools from ${url}`);
  } finally {
    await client.close();
  }
}
const { clients, tools } = await connect();
try {
  const names = Object.keys(tools);
  console.log(JSON.stringify({ agent_tools_after_allowlist: names }));
  if (!VOIDPAY_READ_ONLY.every((t) => names.includes(t)) || names.includes('board_post')) throw new Error('allowlist mismatch');
  console.log('SMOKE PASS');
} finally {
  await Promise.all(clients.map((c) => c.close()));
}
