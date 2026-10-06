# Voidpay Marketplace MCP documentation

These pages document `@voidly/pay-mcp` **0.7.4** and an unreleased source extension. The published package requires Node 20 or newer and exposes 12 tools; this source branch defines 16. It can read public descriptive services, work on owner-approved marketplace drafts, and return a checkout link for buyer review. The source extension adds an independent x402 marketplace page and four public board tools. It does not sign transactions, hold wallet keys, or pay autonomously.

Start here:

- [Quickstart](quickstart.md): install, public discovery, and optional creator setup.
- [Concepts](concepts.md): public projections, scoped creator grants, revisions, and checkout boundaries.
- [Tool reference](tools.md): tool arguments, source extensions, and result examples.
- [Programmatic API](api.md): the exported tool list, runner, and server builder.
- [Errors and recovery](errors.md): safe error codes, private journal, and uncertain outcomes.
- [FAQ](faq.md): common setup and capability questions.

The [package guide](../voidly-pay-mcp/README.md) is the source for the full workflow. The [tool schemas](../voidly-pay-mcp/src/tools.ts) and [runner](../voidly-pay-mcp/src/index.ts) define the actual arguments and MCP result envelope. These docs use synthetic examples; they are not evidence that a service is currently available or accepting payment.
