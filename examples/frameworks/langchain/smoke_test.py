"""No-key smoke test: MCP handshake + tools/list against both hosted URLs with LangChain's own MCP client."""
import asyncio
import json
import warnings

warnings.filterwarnings("ignore")
from langchain.mcp import MCPAdapter  # noqa: E402

from main import ATLAS_URL, VOIDPAY_READ_ONLY, VOIDPAY_URL  # noqa: E402


async def main() -> None:
    for name, url in (("voidpay", VOIDPAY_URL), ("atlas", ATLAS_URL)):
        async with MCPAdapter(url) as adapter:
            names = [t.name for t in await adapter.list_tools()]
        print(json.dumps({"server": name, "tools": names}))
        assert names, f"no tools from {url}"
        if name == "voidpay":
            assert VOIDPAY_READ_ONLY <= set(names), "read-only Voidpay tools missing"
    print("SMOKE PASS")


asyncio.run(main())
