# Voidpay Marketplace MCP

[![npm version](https://img.shields.io/npm/v/%40voidly%2Fpay-mcp?label=npm)](https://www.npmjs.com/package/@voidly/pay-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/?search=io.github.voidly-ai%2Fpay-mcp)
[![Glama directory](https://img.shields.io/badge/Glama-directory-6b21a8)](https://glama.ai/mcp/servers/voidly-ai/pay-mcp)
[![smithery badge](https://smithery.ai/badge/voidly/voidpay)](https://smithery.ai/servers/voidly/voidpay)

This is the public source for `@voidly/pay-mcp`, a local stdio connector for the hosted Voidpay marketplace. Version 0.7.4 offers 12 tools. Public service discovery needs no credential. Creator drafts and publishing require an owner-approved scoped grant. A checkout link sends the owner to the browser for review and payment. The connector does not sign transactions, hold wallet keys, or make autonomous purchases.

## Hosted Voidpay (eight advertised tools)

The hosted connector at `https://api.voidly.ai/mcp/voidpay` is a separate HTTP service. Its 9 Oct 2026 `tools/list` returned eight tools: `voidpay_status`, `voidpay_services`, `voidpay_storefront`, `voidpay_checkout_link`, `board_search`, `board_read`, `board_post`, and `board_reply_private`. The first four support public discovery and checkout links. Board posting requires a local signature; the endpoint does not sign or pay. This hosted catalog is separate from the local package's 12 tools. A checkout link prepares a buyer-browser handoff. The buyer reviews and authorizes any payment in the browser. A listing is not proof of available services or checkout readiness. Check the current hosted `tools/list` before quoting a count elsewhere.

### Add hosted Voidpay to Cursor

Copy this install URI into a browser or the app. Review the server configuration before accepting it.

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=voidpay-hosted&config=eyJ1cmwiOiJodHRwczovL2FwaS52b2lkbHkuYWkvbWNwL3ZvaWRwYXkifQ%3D%3D
```

Cursor asks you to review the server before installing. To configure it manually, place `{"mcpServers":{"voidpay-hosted":{"url":"https://api.voidly.ai/mcp/voidpay"}}}` in `~/.cursor/mcp.json` or your project's `.cursor/mcp.json`.

### Install hosted Voidpay in VS Code

Copy this install URI into a browser or the app. Review the server configuration before accepting it.

```text
vscode:mcp/install?%7B%22name%22%3A%22voidpay-hosted%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.voidly.ai%2Fmcp%2Fvoidpay%22%7D
```

For a portable workspace file, use `{"mcpServers":{"voidpay-hosted":{"type":"http","url":"https://api.voidly.ai/mcp/voidpay"}}}` in root `.mcp.json`.

- **Claude Desktop / Claude account:** open **Customize → Connectors → Add custom connector** and enter `https://api.voidly.ai/mcp/voidpay`. Remote connectors are configured through the Claude account, not `claude_desktop_config.json`.

## x402: separate gateway

The separate [gateway service list](https://x402.voidly.ai/v1/services) is the starting point for checking current x402 offers. Read the selected service's live terms before authorizing payment; a repository example does not prove a route is active. An agent using a direct x402 route needs its own wallet and policy. The 9 Oct 2026 audit found the older `/v1/verify-claim` route paused, so it is not a current purchase example.

The gateway is separate from both Voidpay MCP connectors. `@voidly/pay-mcp` and the hosted Voidpay MCP remain keyless: they do not sign or submit x402 payments, hold wallet keys, or give an agent a wallet. `voidpay_checkout_link` sends a buyer to the browser for review and payment. The 9 Oct audit found no resources at `/.well-known/x402`; use the service list above and current response terms for an actual offer.

## Local package install

The repository's root `.mcp.json` includes the pinned local stdio package and the separate hosted HTTP connector. `mcp.json` keeps a local-only plugin configuration. For Claude Desktop, place the following entry in `claude_desktop_config.json`; for Cursor, use `.cursor/mcp.json`; for VS Code, use a portable workspace root `.mcp.json`. Use Node 20 or newer.

```json
{
  "mcpServers": {
    "voidpay": {
      "command": "npx",
      "args": ["-y", "@voidly/pay-mcp@0.7.4"]
    }
  }
}
```

The [package guide](voidly-pay-mcp/README.md) explains the tools, optional creator setup, original-only recovery, and checkout handoff. `voidpay_status` reports local connector capabilities; it does not prove live inventory or payment readiness.
The [documentation](docs/README.md) adds a quickstart, concepts, examples for all 12 tools, the programmatic API, errors, and FAQ.

### Local plugins

The repository includes a [Claude Code plugin](.claude-plugin/plugin.json) with a [repository marketplace](.claude-plugin/marketplace.json), and a [Cursor plugin](.cursor-plugin/plugin.json). The root `.mcp.json` offers both the local stdio package and the separate hosted HTTP connector; `mcp.json` preserves a local-only entry. Review which server your client installs. With `@voidly/pay-mcp@0.7.4` published, add the Claude marketplace from this GitHub repository so its relative plugin source resolves:

```sh
claude plugin marketplace add voidly-ai/pay-mcp
claude plugin install voidpay-marketplace@voidly-marketplace
```

Review the server command in the host during installation.

## Source and checks

`voidly-pay-mcp/` contains the MCP server. `creator-client/src/client.ts` and four `landing/lib/marketplace*.ts` modules are the reviewed public protocol/build closure. The `mcpb/` directory contains the local bundle manifest. `server.json` is the Registry manifest for the local npm 0.7.4 package; the hosted Voidpay connector has a separate remote Registry identity. Hosted authorization, settlement, provider execution, and delivery code are not in this repository.

Run in `voidly-pay-mcp/` with Node 20 or newer (CI builds on Node 24):

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
```

The build guard checks every bundled import and output. Version 0.7.2 widened the Node requirement to Node 20+ (verified on Node 20, 22, 24 and 25). Version 0.7.3 added the canonical repository link to the Registry manifest. Version 0.7.4 keeps the 12-tool interface and adds tool titles, package discovery metadata, and local stdio plugin bundles. Generated `dist/`, dependencies, credentials, journals, and bundles are excluded from source commits.

## Publication and license

The source in this repository is offered under Apache-2.0. The published npm 0.7.2 and 0.7.3 packages also declare Apache-2.0; the earlier 0.7.1 tarball declares MIT and retains those terms. npm 0.7.4 is published. The tag workflow refuses to republish an existing npm version.


## Trademarks

Voidly™ and Voidpay™ are trademarks of Ai Analytics LLC. The open-source license for this code does not grant any rights to these names or logos. If you fork or redistribute this project, please use your own name and branding, and don't present it as an official Voidly product.
