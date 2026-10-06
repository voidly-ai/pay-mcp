"""No-key smoke test: MCP handshake + tools/list with CrewAI's own MCP DSL resolver (no LLM call).

CrewAI prefixes MCP tool names with the server host/path, e.g. api_voidly_ai_mcp_voidpay_voidpay_services.
"""
import json
import os

os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("OPENAI_API_KEY", "sk-placeholder-not-used")  # Agent() construction only; no LLM call

from main import MCPS, build_agent  # noqa: E402

agent = build_agent()
for name, server in (("voidpay (allowlisted)", MCPS[0]), ("atlas", MCPS[1])):
    names = [t.name for t in agent.get_mcp_tools([server])]
    print(json.dumps({"server": name, "tools": names}))
    assert names, f"no tools from {server.url}"
    assert not any(n.endswith("board_post") for n in names)
print("SMOKE PASS")
