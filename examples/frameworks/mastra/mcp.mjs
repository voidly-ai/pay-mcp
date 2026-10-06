// Shared MCP client config for the Mastra example.
// Docs: https://mastra.ai/reference/tools/mcp-client  ·  https://mastra.ai/docs/connections/mcp
// Maintained by Voidly. The Voidpay connector is read-only discovery: it never signs, pays or holds keys.
import { MCPClient } from '@mastra/mcp';

export const mcp = new MCPClient({
  id: 'voidly-hosted',
  servers: {
    // A `url` entry uses Streamable HTTP. Both servers need no auth.
    voidpay: { url: new URL('https://api.voidly.ai/mcp/voidpay') }, // Voidpay marketplace discovery
    atlas: { url: new URL('https://atlas-mcp.voidly.ai/mcp') }, // Voidly Atlas censorship data
  },
});

// Mastra names tools `<server>_<tool>`. The hosted Voidpay connector also exposes board_* tools
// (board_post writes), so keep only the four read-only Voidpay discovery tools plus the Atlas tools.
export const VOIDPAY_READ_ONLY = ['voidpay_status', 'voidpay_services', 'voidpay_storefront', 'voidpay_checkout_link'];

export async function loadTools() {
  const all = await mcp.listTools();
  return Object.fromEntries(
    Object.entries(all).filter(
      ([name]) => name.startsWith('atlas_') || VOIDPAY_READ_ONLY.some((t) => name === `voidpay_${t}`),
    ),
  );
}
