# CrewAI + Voidly hosted MCP servers

Maintained by Voidly.

A CrewAI `Agent` using CrewAI's MCP DSL (`mcps=[MCPServerHTTP(...)]`) with `create_static_tool_filter` for the Voidpay allowlist. It connects to two hosted MCP servers over Streamable HTTP with no auth and nothing to install server-side:

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

Python **3.10 to 3.13** (CrewAI 1.15 does not support Python 3.14 yet).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes, for `main.py` | Model provider key for the default model |
| `MODEL` | no | Override the model (default `gpt-5-mini`; any CrewAI `llm` string) |
| `TASK` | no | Override the agent task |
| `CREWAI_TRACING_ENABLED` | no | Set `false` to skip the tracing prompt |

## Install and run

```bash
python3.13 -m venv .venv && . .venv/bin/activate   # Windows: py -3.13 -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...                     # PowerShell: $env:OPENAI_API_KEY = "sk-..."
python main.py
```

## Expected output

CrewAI's verbose run log, then the final answer (`.raw`): the Voidpay services found and a short Russia summary with the data's freshness caveat. Exact wording varies by model and by live data.

## Smoke test (no API key, no account)

```bash
python smoke_test.py
```

Resolves both `MCPServerHTTP` configs through the agent's own MCP resolver (`Agent.get_mcp_tools`): MCP handshake + `tools/list`, with the static filter applied. CrewAI prefixes tool names with the server, e.g. `api_voidly_ai_mcp_voidpay_voidpay_services`. No model is called (a placeholder `OPENAI_API_KEY` is set only so `Agent()` can be constructed). On Windows set `PYTHONIOENCODING=utf-8` to avoid harmless `charmap` errors from CrewAI's console event printer.

Observed on 2026-10-06 against the live servers (tool lists can change):

```
voidpay: voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private
atlas:   voidly_incident_stats, voidly_incident_detail, voidly_country_data, voidly_measurement_summary
```

**Verification status (2026-10-06):** smoke test PASSED with crewai 1.15.23 (mcp 1.28.1) on Python 3.13.16 / Windows; the static filter returned only the four read-only Voidpay tools. `main.py` was **not** run end to end (no LLM key used).

## Docs used

- https://docs.crewai.com/en/mcp/overview
- https://docs.crewai.com/en/mcp/dsl-integration
- https://docs.crewai.com/en/mcp/streamable-http

Alternative (older) API, also in CrewAI's docs: `from crewai_tools import MCPServerAdapter` with `{"url": ..., "transport": "streamable-http"}` and tool names as positional args; it worked in our test with crewai-tools 1.15.23.

---
Maintained by Voidly · https://voidly.ai/pay · questions: info@voidly.ai
