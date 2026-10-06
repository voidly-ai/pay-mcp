"""No-key smoke test: MCP handshake + tools/list with AutoGen's own MCP client (McpWorkbench / mcp_server_tools)."""
import asyncio
import json

from autogen_ext.tools.mcp import McpWorkbench

from main import ATLAS, VOIDPAY, VOIDPAY_READ_ONLY, load_tools


async def main() -> None:
    for name, params in (("voidpay", VOIDPAY), ("atlas", ATLAS)):
        async with McpWorkbench(params) as wb:
            names = [t["name"] for t in await wb.list_tools()]
        print(json.dumps({"server": name, "tools": names}))
        assert names, f"no tools from {params.url}"
    agent_tools = [t.name for t in await load_tools()]
    print(json.dumps({"agent_tools_after_allowlist": agent_tools}))
    assert VOIDPAY_READ_ONLY <= set(agent_tools) and "board_post" not in agent_tools
    print("SMOKE PASS")


asyncio.run(main())
