"""No-key smoke test: MCP handshake + tools/list with the Agents SDK's MCPServerStreamableHttp (no LLM call)."""
import asyncio
import json

from agents import Agent
from agents.run_context import RunContextWrapper

from main import VOIDPAY_READ_ONLY, servers


async def main() -> None:
    voidpay, atlas = servers()
    async with voidpay, atlas:
        agent = Agent(name="smoke", mcp_servers=[voidpay, atlas])
        for server in (voidpay, atlas):
            raw = [t.name for t in await server.list_tools()]  # tools/list (static tool_filter applied)
            print(json.dumps({"server": server.name, "tools": raw}))
            assert raw, f"no tools from {server.name}"
        visible = [t.name for t in await agent.get_mcp_tools(RunContextWrapper(context=None))]
        print(json.dumps({"agent_tools_after_filter": visible}))
        assert set(VOIDPAY_READ_ONLY) <= set(visible) and "board_post" not in visible
    print("SMOKE PASS")


asyncio.run(main())
