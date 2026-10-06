"""No-key smoke test: MCP handshake + tools/list with Pydantic AI's own MCPToolset.

Also runs the agent once with a local stub model (FunctionModel, no LLM call, no API key) to confirm
which tools the filtered toolsets offer to a model.
"""
import asyncio
import json

from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from main import ATLAS_URL, VOIDPAY_READ_ONLY, VOIDPAY_URL, atlas, voidpay


async def main() -> None:
    for name, url in (("voidpay", VOIDPAY_URL), ("atlas", ATLAS_URL)):
        toolset = MCPToolset(url)
        async with toolset:
            names = [t.name for t in await toolset.list_tools()]
        print(json.dumps({"server": name, "tools": names}))
        assert names, f"no tools from {url}"

    offered: list[str] = []

    def stub(messages, info: AgentInfo) -> ModelResponse:
        offered.extend(t.name for t in info.function_tools)
        return ModelResponse(parts=[TextPart("stub")])

    agent = Agent(FunctionModel(stub), toolsets=[voidpay, atlas])
    async with agent:
        await agent.run("smoke")
    print(json.dumps({"agent_tools_after_filter": offered}))
    assert VOIDPAY_READ_ONLY <= set(offered) and "board_post" not in offered
    print("SMOKE PASS")


asyncio.run(main())
