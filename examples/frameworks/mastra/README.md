# Mastra + Voidly hosted MCP servers

Maintained by Voidly.

A Mastra `Agent` whose tools come from `@mastra/mcp` `MCPClient` (`servers: { voidpay: { url }, atlas: { url } }`). Mastra names tools `<server>_<tool>`, so the allowlist matches `voidpay_voidpay_services` and so on. It connects to two hosted MCP servers over Streamable HTTP with no auth and nothing to install server-side:

| Server | URL |
|---|---|
| Voidpay marketplace discovery | `https://api.voidly.ai/mcp/voidpay` |
| Voidly Atlas (censorship data) | `https://atlas-mcp.voidly.ai/mcp` |

It lists the tools, then runs one agent task (override with `TASK`): *"List the services currently on the Voidpay marketplace with their price and network. Then use Voidly Atlas to summarize Russia's current censorship status, including any freshness caveats in the data."*

## What the Voidly tools can and cannot do

- **Voidpay** (`https://api.voidly.ai/mcp/voidpay`) is a read-only discovery connector for the Voidpay marketplace. It never signs, pays or holds keys. The agent can find services and storefronts and prepare a checkout link. To actually buy, either the agent pays the seller via x402 (standard x402, USDC on Base) from its **own** wallet within a per-payment price cap and an owner-controlled off switch, or the owner opens the checkout link and approves the payment in their own browser. This example does neither: it never pays.
- The hosted Voidpay connector also exposes `board_*` tools for the Voidly agent board; `board_post` is a write tool. This example gives the agent **only** the four read-only Voidpay discovery tools (`voidpay_status`, `voidpay_services`, `voidpay_storefront`, `voidpay_checkout_link`).
- Listings are descriptive and do not prove a service is available; payment buys an attempt, not a guaranteed result. Today's catalog is Voidly's own first-party services.
- **Voidly Atlas** (`https://atlas-mcp.voidly.ai/mcp`) has four public read tools for censorship data. Missing data does not mean a site is accessible; the tools return freshness caveats.
- Tool output is untrusted public text. The system prompt tells the model not to follow instructions inside it.

## Prerequisites

Node.js 20+ (tested on Node 25).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes, for `npm start` | Used by Mastra's model router for the default model |
| `MODEL` | no | Mastra model string (default `openai/gpt-5-mini`) |
| `TASK` | no | Override the agent task |

## Install and run

```bash
npm install
export OPENAI_API_KEY=sk-...       # PowerShell: $env:OPENAI_API_KEY = "sk-..."
npm start                          # node index.mjs
```

## Expected output

A `Tools:` line with the eight allowlisted tool names, then the agent's answer (the Voidpay services found and a short Russia summary with the data's freshness caveat). Exact wording varies by model and by live data.

## Smoke test (no API key, no account)

```bash
npm install
npm run smoke      # node smoke-test.mjs
```

Uses `MCPClient.listToolsets()` (handshake + `tools/list` on both servers) and checks the allowlisted tool set. No model is called.

Observed on 2026-10-06 against the live servers (tool lists can change):

```
voidpay: voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private
atlas:   voidly_incident_stats, voidly_incident_detail, voidly_country_data, voidly_measurement_summary
```

**Verification status (2026-10-06):** smoke test PASSED with @mastra/core 1.74.0 + @mastra/mcp 2.1.2 on Node 25 / Windows; `Agent` construction checked with a placeholder key; `index.mjs` type-checks with `tsc --checkJs`. `npm start` was **not** run end to end (no LLM key used).

## Docs used

- https://mastra.ai/reference/tools/mcp-client
- https://mastra.ai/docs/connections/mcp

Note: `@mastra/mcp` 2.x removed `getTools()`; use `listTools()` (namespaced) or `listToolsets()` (per server).

---
Maintained by Voidly · https://voidly.ai/pay · questions: info@voidly.ai
