// Shared MCP client setup for the Vercel AI SDK example.
// Docs: https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools
//       https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 (createMCPClient lives in @ai-sdk/mcp)
// Maintained by Voidly. The Voidpay connector is read-only discovery: it never signs, pays or holds keys.
import { createMCPClient } from '@ai-sdk/mcp';

export const VOIDPAY_URL = 'https://api.voidly.ai/mcp/voidpay'; // Voidpay marketplace discovery
export const ATLAS_URL = 'https://atlas-mcp.voidly.ai/mcp'; // Voidly Atlas censorship data

// The hosted Voidpay connector also exposes board_* tools (board_post writes); allowlist the read-only ones.
export const VOIDPAY_READ_ONLY = ['voidpay_status', 'voidpay_services', 'voidpay_storefront', 'voidpay_checkout_link'];

/** Opens both clients (Streamable HTTP, no auth) and returns { clients, tools } with the allowlist applied. */
export async function connect() {
  const voidpay = await createMCPClient({ transport: { type: 'http', url: VOIDPAY_URL } });
  const atlas = await createMCPClient({ transport: { type: 'http', url: ATLAS_URL } });
  const voidpayTools = Object.fromEntries(
    Object.entries(await voidpay.tools()).filter(([name]) => VOIDPAY_READ_ONLY.includes(name)),
  );
  return { clients: [voidpay, atlas], tools: { ...voidpayTools, ...(await atlas.tools()) } };
}
