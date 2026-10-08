// No-key smoke test: MCP handshake + tools/list with Mastra's own MCPClient (no LLM call).
import { mcp, loadTools, VOIDPAY_READ_ONLY } from './mcp.mjs';

try {
  const grouped = await mcp.listToolsets(); // { serverName: { toolName: tool } }, un-namespaced
  for (const [server, tools] of Object.entries(grouped)) {
    console.log(JSON.stringify({ server, tools: Object.keys(tools) }));
  }
  const agentTools = Object.keys(await loadTools());
  console.log(JSON.stringify({ agent_tools_after_allowlist: agentTools }));
  if (!VOIDPAY_READ_ONLY.every((t) => agentTools.includes(`voidpay_${t}`))) throw new Error('read-only tools missing');
  if (agentTools.some((t) => t.endsWith('board_post'))) throw new Error('write tool leaked');
  if (!agentTools.some((t) => t.startsWith('atlas_'))) throw new Error('no Atlas tools');
  console.log('SMOKE PASS');
} finally {
  await mcp.disconnect();
}
