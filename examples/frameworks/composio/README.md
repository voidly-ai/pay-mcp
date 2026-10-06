# Composio + Voidly hosted MCP server (Custom MCP, experimental)

Maintained by Voidly.

Composio **can** attach an arbitrary hosted MCP URL, through its **Custom MCP** feature ("custom toolkits"). Composio marks the feature experimental ("API contracts may change"), and it needs a **Composio account and project API key**. This example registers Voidly's hosted Voidpay discovery server as a custom toolkit, creates a Composio session that exposes only the read-only Voidpay tools, and runs one Vercel AI SDK `generateText` loop over them.

| Server | URL |
|---|---|
| Voidpay marketplace discovery | `https://api.voidly.ai/mcp/voidpay` (Streamable HTTP, no auth) |

Task (override with `TASK`): *"List the services currently on the Voidpay marketplace with their price and network. Do not pay for anything."*

## What the Voidly tools can and cannot do

- Voidpay is a read-only discovery connector. It never signs, pays or holds keys. To buy, either the agent pays the seller via x402 (standard x402, USDC on Base) from its **own** wallet within a per-payment price cap and an owner-controlled off switch, or the owner opens a checkout link and approves the payment in their own browser. This example never pays.
- The hosted connector also exposes `board_*` tools (`board_post` writes). The example enables only `voidpay_status`, `voidpay_services`, `voidpay_storefront` and `voidpay_checkout_link` in the Composio session (`tools: { [slug]: { enable } }`).
- Listings are descriptive and do not prove availability. Today's catalog is Voidly's own first-party services.
- Registering the toolkit makes Composio's backend call the Voidpay MCP server for you; the tool calls run through Composio, not directly from your machine.

## Prerequisites

- Node.js 20+.
- A Composio account and project API key (https://docs.composio.dev). Voidly did not create one for this example.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `COMPOSIO_API_KEY` | yes | Composio project API key |
| `OPENAI_API_KEY` | yes | Used by `@ai-sdk/openai` |
| `COMPOSIO_USER_ID` | no | Composio user id for the session (default `voidly-example-user`) |
| `MODEL` | no | OpenAI model id (default `gpt-5-mini`) |
| `TASK` | no | Override the task |

## Install and run

```bash
npm install
export COMPOSIO_API_KEY=...  OPENAI_API_KEY=sk-...
npm start            # node index.mjs
```

`index.mjs` does three things:

1. `composio.experimental.customToolkits.upsert({ slug: 'VOIDPAY', toolkitConfig: { name, appUrl: 'https://api.voidly.ai/mcp/voidpay', authSchemes: [{ mode: 'NO_AUTH' }] } })`, then `customToolkits.sync(slug)`. The upsert is idempotent; `appUrl` and `authSchemes` cannot change later (delete and re-register instead).
2. `composio.tools.getRawComposioTools({ toolkits: [slug] })` to find Composio's slugs for the four read-only tools. Composio renames MCP tools, so the example matches by suffix.
3. `composio.sessions.create(userId, { toolkits: [slug], tools: { [slug]: { enable } }, sessionPreset: SessionPreset.DIRECT_TOOLS })`, then `session.tools()` wrapped by `@composio/vercel` and passed to `generateText`.

## Expected output

A line listing the Composio tool slugs that were enabled, then the model's answer listing the Voidpay services it found. Exact slugs and wording are not verified (see below).

## Smoke test (no Composio account)

```bash
npm install
npm run smoke        # node smoke-test.mjs
```

This does **not** exercise Composio. It runs the MCP handshake + `tools/list` against the hosted URL with the official MCP TypeScript SDK, and checks that `@composio/core` 0.22.0 exposes `experimental.customToolkits.upsert` and `sessions.create`.

**Verification status (2026-10-06):** **not executed locally** through Composio, because it requires a Composio account and API key. Generic MCP check PASSED (`@modelcontextprotocol/sdk` 1.32.1; tools: voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private). `index.mjs` type-checks against the `@composio/core` 0.22.0 / `@composio/vercel` 0.12.1 / `ai` 7.0.129 type definitions (`tsc --checkJs`). Unverified: the exact tool slugs Composio assigns, whether `getRawComposioTools` needs a toolkit version for a fresh custom toolkit (Composio's docs mention `toolkit_versions=latest` for the REST tools API), and the transport Composio uses to reach the server.

## Docs used

- https://docs.composio.dev/docs/extending-sessions/custom-mcp
- `@composio/core` 0.22.0 type definitions (`composio.experimental.customToolkits`, `composio.sessions.create`, `SessionPreset.DIRECT_TOOLS`)
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling

---
Maintained by Voidly · https://voidly.ai/pay · questions: info@voidly.ai
