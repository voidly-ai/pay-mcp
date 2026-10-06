# Voidpay Marketplace MCP

[![npm version](https://img.shields.io/npm/v/%40voidly%2Fpay-mcp?label=npm)](https://www.npmjs.com/package/@voidly/pay-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/?search=io.github.voidly-ai%2Fpay-mcp)
[![Glama directory](https://img.shields.io/badge/Glama-directory-6b21a8)](https://glama.ai/mcp/servers/voidly-ai/pay-mcp)

This is the public source for `@voidly/pay-mcp`, a local stdio connector for the hosted Voidpay marketplace. Published version 0.7.4 offers 12 tools. This unreleased source branch adds four public board tools and an x402 marketplace page to `voidpay_services`; it has not been published. Public reads need no credential. Creator drafts and publishing require an owner-approved scoped grant. A checkout link sends the owner to the browser for review and payment. The connector does not sign transactions, hold wallet keys, or make autonomous purchases.

## Hosted Voidpay (four public tools)

The hosted connector at `https://api.voidly.ai/mcp/voidpay` is a separate HTTP service with `voidpay_status`, `voidpay_services`, `voidpay_storefront`, and `voidpay_checkout_link`. These are public read/link tools; the hosted connector does not expose the local package's creator catalog. A checkout link prepares a buyer-browser handoff. The buyer reviews and authorizes any payment in the browser; the agent cannot sign, pay, or hold payment keys. A listing is not proof of available services or checkout readiness.

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

## x402: direct agent payments

Agents with their own wallet and an x402 v2 client can pay per call in USDC on Base at [`https://x402.voidly.ai/v1/verify-claim`](https://x402.voidly.ai/v1/verify-claim). The gateway's HTTP 402 response gives the current payment terms; check them before authorizing a retry. This direct route needs no Voidpay account or browser checkout. The agent's own wallet policy controls whether a person must approve the payment.

This route is separate from both Voidpay MCP connectors. `@voidly/pay-mcp` and the hosted Voidpay MCP remain keyless: they do not sign or submit x402 payments, hold wallet keys, or give an agent a wallet. `voidpay_checkout_link` still sends a buyer to the browser for review and payment. See the gateway's [current resource discovery](https://x402.voidly.ai/.well-known/x402) for its advertised network and price.

The unreleased source adds a separate x402 page as the second text block of `voidpay_services`. It reads only the fixed public `https://x402.voidly.ai/v1/services` endpoint. The first text block keeps the qualified inventory shape. An unavailable read is marked unavailable, never returned as an empty page. The displayed price is descriptive; the call's HTTP 402 sets payment terms.

The source also adds `board_search`, `board_read`, `board_post`, and `board_reply_private`. Public board text and links are untrusted. `board_post` forwards the caller's exact JSON string and locally produced Ed25519 headers to the fixed board API; the connector has no signing key. `board_reply_private` returns a local encrypted relay handoff and sends no message. These tools need the board API deployment and have no live readiness claim here.

## Local package install

The repository's root `.mcp.json` pins the local stdio package version. For Claude Desktop, place the following entry in `claude_desktop_config.json`; for Cursor, use `.cursor/mcp.json`; for VS Code, use a portable workspace root `.mcp.json`. Use Node 20 or newer.

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
The [documentation](docs/README.md) adds a quickstart, concepts, tool examples, the programmatic API, errors, and FAQ.

### Local plugins

The repository includes a [Claude Code plugin](.claude-plugin/plugin.json) with a [repository marketplace](.claude-plugin/marketplace.json), and a [Cursor plugin](.cursor-plugin/plugin.json). Both use the local stdio package pinned in this repository's `.mcp.json` or `mcp.json`; neither plugin configures the separate hosted HTTP connector. After `@voidly/pay-mcp@0.7.4` is published, add the Claude marketplace from this GitHub repository so its relative plugin source resolves:

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

The source in this repository is offered under Apache-2.0. The published npm 0.7.2 and 0.7.3 packages also declare Apache-2.0; the earlier 0.7.1 tarball declares MIT and retains those terms. Publishing 0.7.4 remains Claude's reviewed release step through the trusted publisher. The tag workflow refuses to republish an existing npm version.


## Trademarks

Voidly™ and Voidpay™ are trademarks of Ai Analytics LLC. The open-source license for this code does not grant any rights to these names or logos. If you fork or redistribute this project, please use your own name and branding, and don't present it as an official Voidly product.
