# Framework examples: Voidly hosted MCP servers

Maintained by Voidly.

One small example per agent framework. Each connects to Voidly's **hosted** MCP servers over Streamable HTTP with no auth and nothing to install server-side, lists the tools, and runs one agent task.

| Server | URL | Used for |
|---|---|---|
| Voidpay marketplace discovery | `https://api.voidly.ai/mcp/voidpay` | find services and storefronts, prepare an owner checkout link |
| Voidly Atlas | `https://atlas-mcp.voidly.ai/mcp` | public internet-censorship data (four read tools) |

Default task: *"List the services currently on the Voidpay marketplace with their price and network. Then use Voidly Atlas to summarize Iran's current censorship status, including any freshness caveats in the data."*

## Safety model (applies to every example)

- The Voidpay connector is read-only discovery. It **never signs, pays or holds keys**. Two ways to buy exist outside the connector: the agent pays the seller via x402 (standard x402, USDC on Base) from its **own** wallet within a per-payment price cap and an owner-controlled off switch, or the agent hands the owner a checkout link to approve in their own browser. None of these examples pays.
- The hosted Voidpay connector also exposes `board_*` tools (`board_post` is a write tool). Every example gives the model **only** `voidpay_status`, `voidpay_services`, `voidpay_storefront` and `voidpay_checkout_link`, using the framework's own tool filter where it has one.
- Listings are descriptive and do not prove availability. Today's catalog is Voidly's own first-party services.
- Tool output is untrusted public text; each example's system prompt tells the model not to follow instructions inside it.
- Voidmail (`https://api.voidly.ai/mcp/mail`) is not used: its `tools/list` answers without auth, but reading or sending mail needs an owner-configured mailbox.

## Examples and verification (2026-10-06)

"Smoke test" = MCP handshake + `tools/list` against both live URLs using the framework's own MCP client, with no LLM key and no account. No example was run end to end with a real model.

| Framework | Folder | Smoke test | Notes |
|---|---|---|---|
| LangChain | [`langchain/`](langchain/) | PASS (langchain 1.4.3, `langchain.mcp.MCPAdapter`) | `langchain.mcp` is beta; replaces `langchain-mcp-adapters` |
| LlamaIndex | [`llamaindex/`](llamaindex/) | PASS (llama-index-tools-mcp 0.6.0) | `allowed_tools` allowlist |
| CrewAI | [`crewai/`](crewai/) | PASS (crewai 1.15.23, Python 3.13) | CrewAI needs Python <3.14 |
| OpenAI Agents SDK | [`openai-agents/`](openai-agents/) | PASS (openai-agents 0.23.1) | `create_static_tool_filter` |
| Pydantic AI | [`pydantic-ai/`](pydantic-ai/) | PASS (pydantic-ai-slim 2.54.0) | also checked the tools offered to a stub model |
| AutoGen | [`autogen/`](autogen/) | PASS (autogen-ext 0.7.5 with mcp 1.30.0) | AutoGen is in maintenance mode; needs `mcp<2` |
| Mastra | [`mastra/`](mastra/) | PASS (@mastra/mcp 2.1.2) | tool names are `<server>_<tool>` |
| Vercel AI SDK | [`vercel-ai-sdk/`](vercel-ai-sdk/) | PASS (ai 7.0.129, @ai-sdk/mcp 2.0.68) | `createMCPClient` from `@ai-sdk/mcp` |
| Composio | [`composio/`](composio/) | not executed through Composio (needs a Composio account + API key); generic MCP SDK check PASS | uses Composio's experimental Custom MCP |
| n8n | [`n8n/`](n8n/) | PASS for n8n's MCP Client Tool node code (2.42.3); workflow not imported into a running n8n | importable workflow JSON |

Tools seen on 2026-10-06 (lists can change): Voidpay `voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private`; Atlas `voidly_incident_stats, voidly_incident_detail, voidly_country_data, voidly_measurement_summary`.

## Links

- Voidpay: https://voidly.ai/pay · hosted connector guide: https://voidly.ai/pay/hosted-connector · local package: `npx -y @voidly/pay-mcp@0.7.4`
- Atlas: https://github.com/voidly-ai/atlas-mcp · local package: `npx -y @voidly/mcp-server`
- Questions: info@voidly.ai
