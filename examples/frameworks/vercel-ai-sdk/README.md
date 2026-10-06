# Vercel AI SDK (v7) + Voidly hosted MCP servers

Maintained by Voidly.

`generateText` with multi-step tool use (`stopWhen: isStepCount(8)`) over tools from `createMCPClient` (`@ai-sdk/mcp`, transport `{ type: "http", url }`). It connects to two hosted MCP servers over Streamable HTTP with no auth and nothing to install server-side:

| Server | URL |
|---|---|
| Voidpay marketplace discovery | `https://api.voidly.ai/mcp/voidpay` |
| Voidly Atlas (censorship data) | `https://atlas-mcp.voidly.ai/mcp` |

It lists the tools, then runs one agent task (override with `TASK`): *"List the services currently on the Voidpay marketplace with their price and network. Then use Voidly Atlas to summarize Iran's current censorship status, including any freshness caveats in the data."*

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
| `OPENAI_API_KEY` | yes, for `npm start` | Used by `@ai-sdk/openai` |
| `MODEL` | no | OpenAI model id (default `gpt-5-mini`) |
| `TASK` | no | Override the agent task |

## Install and run

```bash
npm install
export OPENAI_API_KEY=sk-...       # PowerShell: $env:OPENAI_API_KEY = "sk-..."
npm start                          # node index.mjs
```

## Expected output

A `Tools:` line with the eight allowlisted tool names, then the model's final text (the Voidpay services found and a short Iran summary with the data's freshness caveat). Exact wording varies by model and by live data.

## Smoke test (no API key, no account)

```bash
npm install
npm run smoke      # node smoke-test.mjs
```

Opens `createMCPClient` against both servers, calls `listTools()` (handshake + `tools/list`), then checks the allowlisted `tools()` set. No model is called.

Observed on 2026-10-06 against the live servers (tool lists can change):

```
voidpay: voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private
atlas:   voidly_incident_stats, voidly_incident_detail, voidly_country_data, voidly_measurement_summary
```

**Verification status (2026-10-06):** smoke test PASSED with ai 7.0.129 + @ai-sdk/mcp 2.0.68 on Node 25 / Windows; `index.mjs` type-checks with `tsc --checkJs`. `npm start` was **not** run end to end (no LLM key used).

## Docs used

- https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools
- https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0

Notes for AI SDK 7: `createMCPClient` is exported from `@ai-sdk/mcp` (also as `experimental_createMCPClient`), not from `ai`; `stepCountIs` is now `isStepCount` (the old name is still exported); the HTTP transport rejects redirects by default (`redirect: 'error'`), and neither Voidly URL redirects.

---
Maintained by Voidly · https://voidly.ai/pay · questions: info@voidly.ai
