"""No-key smoke test: MCP handshake + tools/list with LlamaIndex's own MCP client (BasicMCPClient)."""
import asyncio
import json

from llama_index.tools.mcp import BasicMCPClient, McpToolSpec

from main import ATLAS_URL, VOIDPAY_READ_ONLY, VOIDPAY_URL, load_tools


async def main() -> None:
    for name, url in (("voidpay", VOIDPAY_URL), ("atlas", ATLAS_URL)):
        names = [t.metadata.name for t in await McpToolSpec(client=BasicMCPClient(url)).to_tool_list_async()]
        print(json.dumps({"server": name, "tools": names}))
        assert names, f"no tools from {url}"
    agent_tools = [t.metadata.name for t in await load_tools()]
    print(json.dumps({"agent_tools_after_allowlist": agent_tools}))
    assert set(VOIDPAY_READ_ONLY) <= set(agent_tools) and "board_post" not in agent_tools
    print("SMOKE PASS")


asyncio.run(main())
