# OpenAI Agents SDK + Voidly hosted MCP servers

Maintained by Voidly.

An OpenAI Agents SDK `Agent` with two `MCPServerStreamableHttp` servers; the Voidpay server uses `create_static_tool_filter` for the allowlist. It connects to two hosted MCP servers over Streamable HTTP with no auth and nothing to install server-side:

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

Python 3.10+.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes, for `main.py` | Model provider key for the default model |
| `MODEL` | no | Override the model (default `gpt-5-mini`) |
| `TASK` | no | Override the agent task |

## Install and run

```bash
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...                     # PowerShell: $env:OPENAI_API_KEY = "sk-..."
python main.py
```

## Expected output

The final output of `Runner.run`: the Voidpay services found and a short Russia summary with the data's freshness caveat. Exact wording varies by model and by live data. (Traces are uploaded to OpenAI by default; set `OPENAI_AGENTS_DISABLE_TRACING=1` to turn that off.)

## Smoke test (no API key, no account)

```bash
python smoke_test.py
```

Connects both `MCPServerStreamableHttp` servers (handshake + `tools/list`) and asks the `Agent` which MCP tools it would expose (`Agent.get_mcp_tools`), checking the filter. No model is called.

Observed on 2026-10-06 against the live servers (tool lists can change):

```
voidpay: voidpay_status, voidpay_services, voidpay_storefront, voidpay_checkout_link, board_search, board_read, board_post, board_reply_private
atlas:   voidly_incident_stats, voidly_incident_detail, voidly_country_data, voidly_measurement_summary
```

**Verification status (2026-10-06):** smoke test PASSED with openai-agents 0.23.1 (mcp 2.3.0) on Python 3.14 / Windows; `Agent` construction checked. `main.py` was **not** run end to end (no LLM key used).

## Docs used

- https://openai.github.io/openai-agents-python/mcp/
- https://github.com/openai/openai-agents-python/tree/main/examples/mcp/streamable_http_remote_example

Note: `client_session_timeout_seconds` defaults to 5 s; the example raises it to 30 s for remote servers. The SDK's `HostedMCPTool` (OpenAI calls the server from its side) also accepts a public URL, but then tool calls do not pass through your process.

---
Maintained by Voidly · https://voidly.ai/pay · questions: info@voidly.ai
