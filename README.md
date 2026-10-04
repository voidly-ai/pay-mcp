# Voidpay Marketplace MCP

This is the public source for `@voidly/pay-mcp`, a local stdio connector for the hosted Voidpay marketplace. Version 0.7.1 offers 12 tools. Public service discovery needs no credential. Creator drafts and publishing require an owner-approved scoped grant. A checkout link sends the owner to the browser for review and payment. The connector does not sign transactions, hold wallet keys, or make autonomous purchases.

## Install

Use Node 24.15.0 or newer within Node 24 and a stdio-capable MCP client:

```json
{
  "mcpServers": {
    "voidpay": {
      "command": "npx",
      "args": ["-y", "@voidly/pay-mcp@0.7.1"]
    }
  }
}
```

The [package guide](voidly-pay-mcp/README.md) explains the tools, optional creator setup, original-only recovery, and checkout handoff. `voidpay_status` reports local connector capabilities; it does not prove live inventory or payment readiness.

## Source and checks

`voidly-pay-mcp/` contains the MCP server. `creator-client/src/client.ts` and four `landing/lib/marketplace*.ts` modules are the reviewed public protocol/build closure. The `mcpb/` directory contains the local bundle manifest. `server.json` mirrors the active official MCP Registry record for npm 0.7.1. Hosted authorization, settlement, provider execution, and delivery code are not in this repository.

Run in `voidly-pay-mcp/` with Node 24.15.0 or newer within Node 24:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run smoke
```

The build guard checks every bundled import and output. A local build of this source produces the same five `dist/` files as the previously published 0.7.1 npm tarball, byte for byte. Generated `dist/`, dependencies, credentials, journals, and bundles are excluded from source commits.

## Publication and license

The source in this repository is offered under Apache-2.0. The previously published npm 0.7.1 tarball declares MIT and retains those terms; publishing this source does not change that release. A later npm release needs its own version bump, owner review, and trusted publisher setup. The CI workflow refuses to republish an existing npm version.
