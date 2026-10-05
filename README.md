# Voidpay Marketplace MCP

This is the public source for `@voidly/pay-mcp`, a local stdio connector for the hosted Voidpay marketplace. Version 0.7.2 offers 12 tools. Public service discovery needs no credential. Creator drafts and publishing require an owner-approved scoped grant. A checkout link sends the owner to the browser for review and payment. The connector does not sign transactions, hold wallet keys, or make autonomous purchases.

## Hosted Voidpay (four public tools)

The hosted connector at `https://api.voidly.ai/mcp/voidpay` is a separate HTTP service with `voidpay_status`, `voidpay_services`, `voidpay_storefront`, and `voidpay_checkout_link`. These are public read/link tools; the hosted connector does not expose the local package's 12-tool creator catalog. A checkout link prepares a buyer-browser handoff. The buyer reviews and authorizes any payment in the browser; the agent cannot sign, pay, or hold payment keys. A listing is not proof of available services or checkout readiness.

### Add hosted Voidpay to Cursor

Copy this install URI into a browser or the app. Review the server configuration before accepting it.

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=voidpay-hosted&config=eyJ2b2lkcGF5LWhvc3RlZCI6eyJ1cmwiOiJodHRwczovL2FwaS52b2lkbHkuYWkvbWNwL3ZvaWRwYXkifX0%3D
```

Cursor asks you to review the server before installing. To configure it manually, place `{"mcpServers":{"voidpay-hosted":{"url":"https://api.voidly.ai/mcp/voidpay"}}}` in `~/.cursor/mcp.json` or your project's `.cursor/mcp.json`.

### Install hosted Voidpay in VS Code

Copy this install URI into a browser or the app. Review the server configuration before accepting it.

```text
vscode:mcp/install?%7B%22name%22%3A%22voidpay-hosted%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.voidly.ai%2Fmcp%2Fvoidpay%22%7D
```

review the HTTP server configuration in VS Code. For a portable workspace file, use `{"mcpServers":{"voidpay-hosted":{"type":"http","url":"https://api.voidly.ai/mcp/voidpay"}}}` in root `.mcp.json`.

- **Claude Desktop / Claude account:** open **Customize → Connectors → Add custom connector** and enter `https://api.voidly.ai/mcp/voidpay`. Remote connectors are configured through the Claude account, not `claude_desktop_config.json`.

## Local package install

The repository's root `.mcp.json` pins the published local stdio package. For Claude Desktop, place the following entry in `claude_desktop_config.json`; for Cursor, use `.cursor/mcp.json`; for VS Code, use a portable workspace root `.mcp.json`. Use Node 20 or newer.

```json
{
  "mcpServers": {
    "voidpay": {
      "command": "npx",
      "args": ["-y", "@voidly/pay-mcp@0.7.2"]
    }
  }
}
```

The [package guide](voidly-pay-mcp/README.md) explains the tools, optional creator setup, original-only recovery, and checkout handoff. `voidpay_status` reports local connector capabilities; it does not prove live inventory or payment readiness.

## Source and checks

`voidly-pay-mcp/` contains the MCP server. `creator-client/src/client.ts` and four `landing/lib/marketplace*.ts` modules are the reviewed public protocol/build closure. The `mcpb/` directory contains the local bundle manifest. `server.json` describes the local npm 0.7.2 Registry entry; the hosted Voidpay connector has a separate remote Registry identity. Hosted authorization, settlement, provider execution, and delivery code are not in this repository.

Run in `voidly-pay-mcp/` with Node 20 or newer (CI builds on Node 24):

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
```

The build guard checks every bundled import and output. 0.7.2 is the 0.7.1 code with its Node requirement widened to Node 20+ (verified on Node 20, 22, 24 and 25) and its version strings updated. Generated `dist/`, dependencies, credentials, journals, and bundles are excluded from source commits.

## Publication and license

The source in this repository is offered under Apache-2.0. The previously published npm 0.7.1 tarball declares MIT and retains those terms; publishing this source does not change that release. A later npm release needs its own version bump, owner review, and trusted publisher setup. The CI workflow refuses to republish an existing npm version.
