# n8n + Voidly hosted MCP servers

Maintained by Voidly.

An importable n8n workflow, `voidly-hosted-mcp-agent.workflow.json`: **Chat Trigger → AI Agent**, with an **OpenAI Chat Model** and two **MCP Client Tool** nodes (`@n8n/n8n-nodes-langchain.mcpClientTool`, typeVersion 1.4, transport *HTTP Streamable*, authentication *None*):

| Node | Endpoint | Tools given to the agent |
|---|---|---|
| Voidpay MCP (read-only discovery) | `https://api.voidly.ai/mcp/voidpay` | *Selected*: `voidpay_status`, `voidpay_services`, `voidpay_storefront`, `voidpay_checkout_link` |
| Voidly Atlas MCP | `https://atlas-mcp.voidly.ai/mcp` | All (four public read tools) |

Ask it, for example: *"Which services are on the Voidpay marketplace right now, and what do they cost?"* or *"What is the current censorship status of Russia?"*

## What the Voidly tools can and cannot do

- Voidpay is a read-only discovery connector. It never signs, pays or holds keys. To buy, either the agent pays the seller via x402 (standard x402, USDC on Base) from its **own** wallet within a per-payment price cap and an owner-controlled off switch, or the owner opens a checkout link and approves the payment in their own browser. This workflow never pays.
- The hosted Voidpay connector also exposes `board_*` tools (`board_post` writes). The Voidpay node uses *Tools to Include: Selected* so the agent sees only the four read-only discovery tools.
- Listings are descriptive and do not prove availability. Today's catalog is Voidly's own first-party services. Atlas data carries freshness caveats; missing data does not mean accessible.

## Prerequisites

- n8n 2.x (built against n8n 2.42.3 node definitions). The MCP Client Tool's HTTP Streamable transport needs node typeVersion 1.2 or later; older n8n builds that only offer "SSE Endpoint" will not work.
- An OpenAI credential in n8n. None is included in the JSON.

## Environment variables / credentials

| Item | Required | Purpose |
|---|---|---|
| n8n credential *OpenAI* (`openAiApi`) | yes | Select it on the **OpenAI Chat Model** node after import |
| none for Voidly | – | Both MCP servers need no auth |

## Import and run

1. In n8n: **Workflows → Import from File** (or paste the JSON onto the canvas).
2. Open **OpenAI Chat Model**, pick your OpenAI credential (model defaults to `gpt-5-mini`).
3. Click **Open chat** and send a question.

## Expected output

The chat reply lists the Voidpay services the agent found (from `voidpay_services`) and/or an Atlas country summary with its freshness caveat. In the execution log, the MCP Client Tool nodes show the tool calls. Exact wording varies by model and by live data.

## Smoke test (no n8n instance, no API key)

```bash
npm install --ignore-scripts     # installs @n8n/n8n-nodes-langchain 2.42.3 only
npm run smoke                    # node smoke-test.cjs
```

`smoke-test.cjs` loads the real MCP Client Tool code from `@n8n/n8n-nodes-langchain` 2.42.3 and, for each MCP node in the workflow JSON, calls the node's own `getTools` load-options method (what the n8n editor uses to list a server's tools: MCP handshake + `tools/list`) and its `getSelectedTools` include/exclude filter. It uses n8n's own `passthroughEgressFilter` in place of the host's SSRF egress filter. It does not start n8n or run the AI Agent.

Observed on 2026-10-06:

```
Voidpay node: listed  voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private
              to agent voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link
Atlas node:   listed / to agent voidly_incident_stats, voidly_incident_detail, voidly_country_data, voidly_measurement_summary
```

**Verification status (2026-10-06):** the n8n MCP Client Tool node code PASSED the smoke test above. The workflow's node types, typeVersions and parameter names were checked against the 2.42.3 node descriptions (Chat Trigger 1.5, OpenAI Chat Model 1.3, MCP Client Tool 1.4; the AI Agent 3.1 description could not be loaded without native sqlite bindings, so its `options.systemMessage` parameter was checked in the source). The workflow was **not** imported into a running n8n instance: a full `npm i n8n@2.42.3` failed on this machine (Node 25 has no prebuilt binary for a native Kafka dependency), and the agent was not run (no LLM key used).

## Docs used

- https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/ (this page still describes only the SSE field; the parameters here come from the node source)
- Node source: `packages/@n8n/nodes-langchain/nodes/mcp/McpClientTool/` in github.com/n8n-io/n8n (tag `n8n@2.42.3`)

---
Maintained by Voidly · https://voidly.ai/pay · questions: info@voidly.ai
