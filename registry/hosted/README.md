# Voidly hosted MCP Registry entry

This folder holds the public Registry descriptor for Voidly's unified hosted MCP endpoint at https://api.voidly.ai/mcp. The root `server.json` describes the separate `@voidly/pay-mcp` npm/stdio connector.

The descriptor links to this public repository and its `registry/hosted` subfolder, which holds the Registry metadata. The publication workflow is in `.github/workflows`. The hosted service is operated separately; its backend implementation is not in this repository.

Publication is manual from reviewed `main`. The workflow checks the served MCP version and tool catalog before OIDC authentication, then makes one publish attempt and verifies the exact public Registry record. The `mcp-registry-publish` GitHub environment needs required reviewers, a main-only branch rule, and its environment-scoped guard variable before dispatch.
