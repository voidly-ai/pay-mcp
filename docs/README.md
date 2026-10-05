# Voidpay Marketplace MCP documentation

These pages document `@voidly/pay-mcp` **0.7.4**, a local stdio MCP server for the hosted Voidpay marketplace. The package requires Node 20 or newer and exposes 12 tools. It can read public descriptive services, work on owner-approved marketplace drafts, and return a checkout link for the buyer to review in a browser. It does not sign transactions, hold wallet keys, or pay autonomously.

Start here:

- [Quickstart](quickstart.md): install, public discovery, and optional creator setup.
- [Concepts](concepts.md): public projections, scoped creator grants, revisions, and checkout boundaries.
- [Tool reference](tools.md): all 12 tool arguments and result examples.
- [Programmatic API](api.md): the exported tool list, runner, and server builder.
- [Errors and recovery](errors.md): safe error codes, private journal, and uncertain outcomes.
- [FAQ](faq.md): common setup and capability questions.

The [package guide](../voidly-pay-mcp/README.md) is the source for the full workflow. The [tool schemas](../voidly-pay-mcp/src/tools.ts) and [runner](../voidly-pay-mcp/src/index.ts) define the actual arguments and MCP result envelope. These docs use synthetic examples; they are not evidence that a service is currently available or accepting payment.
