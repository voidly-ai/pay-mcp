# Voidpay MCP

[![npm version](https://img.shields.io/npm/v/%40voidly%2Fpay-mcp?label=npm)](https://www.npmjs.com/package/@voidly/pay-mcp)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/?q=io.github.voidly-ai%2Fpay-mcp)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933)](https://nodejs.org/)

`@voidly/pay-mcp` is the small public connector for Voidpay's hosted marketplace. Version **0.7.4** requires Node 20+ and exposes 12 current marketplace tools. The connector contains public request builders and validators. It does not distribute the hosted authorization, settlement, provider execution or delivery implementation.

## What agents can do

- Discover descriptive services and read published storefronts without credentials.
- Create and edit a marketplace, then publish or withdraw a selected revision with an owner-approved, scoped creator grant.
- Recover the exact original creator operation after an interruption without automatically sending it again.
- Produce a checkout link bound to the selected storefront publication and service. The owner reviews and authorizes the purchase in the browser.
- Open the existing checkout recovery page in the original owner's browser.

A listed service is not proof of current availability. Provider descriptions are untrusted data. Creator publishing authority is not payment authority. This version does **not** perform autonomous purchases, sign transactions, hold wallet keys, or expose the retired credit, escrow, stream or transfer tools. Checkout recovery links do not recover private results into the agent; that remains in the authenticated owner browser.

## Tools

Each tool has an MCP title, description and safety annotations. The [tool reference](https://github.com/voidly-ai/pay-mcp/blob/main/docs/tools.md) covers exact inputs and example responses; examples are synthetic.

| Tool | Purpose | Creator grant |
| --- | --- | --- |
| `voidpay_status` | Describe local connector capabilities and setup. | No |
| `voidpay_services` | Browse public descriptive services. | No |
| `voidpay_storefront` | Read a published storefront by slug. | No |
| `voidpay_checkout_link` | Prepare a link for owner review in the browser; never signs or pays. | No |
| `voidpay_checkout_recovery_link` | Open the original checkout recovery page in the owner's browser. | No |
| `voidpay_creator_read` | Read a grant-scoped marketplace and its versions. | Yes |
| `voidpay_creator_inventory` | Read grant-scoped service inventory. | Yes |
| `voidpay_creator_create` | Create a draft with one stable original key. | Yes |
| `voidpay_creator_save` | Save selected services and presentation as a draft. | Yes |
| `voidpay_creator_publish` | Publish an exact saved revision with publishing scope. | Yes |
| `voidpay_creator_unpublish` | Withdraw the exact current publication. | Yes |
| `voidpay_creator_recover` | Read the privately journaled original mutation without resending it. | Yes |

## Install

Use a trusted host with **Node 20 or newer**. In a client that supports local stdio MCP servers, configure:

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

This starts in credential-free discovery mode. `voidpay_status` describes the local connector, not the live service's health. The executable is a **stdio server**, not a remote MCP URL. A remote-only host can use the separate hosted public-read connector at `https://api.voidly.ai/mcp/voidpay`; it does not expose this package's creator tools. Installing this npm package does not configure that hosted connector.

Normal host consent and installation warnings remain in effect. No prompt can bypass those permissions.

## Set up creator access once

1. Open [marketplace creation](https://voidly.ai/pay/marketplace/create), sign in as the owner and approve agent access. Choose a marketplace-specific grant where possible. `creator:read` permits reads and recovery; `creator:draft` permits drafts; `creator:publish` permits publication and withdrawal. Owner-wide access is needed to create a new marketplace.
2. Save the **actual approved setup output** `{credential, ownerAccountId, targetSpaceId}` to a private JSON file on the trusted host. Do not invent these values or paste the credential into a chat, prompt, tool argument, repository or published configuration. On Unix the file must be owned by the current user with mode `0600`, and must not be a symlink or hard link.
3. Add `VOIDPAY_CREATOR_SETUP_FILE` to the MCP process environment with that file's absolute path. Optionally set `VOIDPAY_MCP_STATE_DIR` to a private absolute directory. Its default is `~/.voidly/pay-mcp-journal`.

The journal directory must be owned by the current user with mode `0700`; journal files are `0600`. Symlinked journal paths are refused. This release is qualified for Unix file permissions, not Windows. Keep the journal across restarts and preserve its private backup. It contains unpublished draft content and original requests but no configured credential.

Credentials are loaded only by the trusted host and used only at the fixed `https://api.voidly.ai/v2/marketplace/agents/` API. There is no endpoint override, ambient browser cookie or human JWT substitution. Server-side scopes, target, expiry and revocation remain authoritative. `ownerAccountId` binds local request hashes; it does not assert ownership to the server.

## Agent workflow

Use `voidpay_services` for public discovery. With a grant, call `voidpay_creator_read` and `voidpay_creator_inventory`. If creating a new marketplace, call `voidpay_creator_create` with a deliberate slug and a stable idempotency key.

For `voidpay_creator_save`, pass the exact `owned` object from the creator read, a `presentation` containing `name`, `description`, and `brandPreset` (`slate`, `ocean`, or `forest`), and 1–16 complete `selectedServices` from inventory. The connector computes the public projection hashes and observed draft versions. Saving does not publish.

Read the saved state. Only when publication is intended, call `voidpay_creator_publish` with its exact `spaceId`, `expectedVersion`, saved `revision`, `configDigest` and a stable original key. The hosted service refuses stale state or insufficient scope. `voidpay_creator_unpublish` requires the exact current `publicationId` and version.

`voidpay_storefront` returns a validated publication. Pass its slug, publication digest and selected service projection ID to `voidpay_checkout_link`. It rereads that publication and refuses a changed selection. The browser performs the actual readiness, owner, wallet, amount and chain checks. The MCP never treats a link as authorization or payment success.

## Interrupted operations

Every mutation first durably reserves its exact original in the private journal. Only the process that reserves it may send it. Repeating the same call or calling `voidpay_creator_recover` reads the original result; it **never resends the mutation**. A changed payload with the same key is refused.

A timeout or uncertain response is `OUTCOME_UNKNOWN`. A crash before dispatch can leave an original reserved but unsent. A null recovery is unresolved, not permission to create a replacement key. Preserve the original and reconcile it; there is intentionally no automatic replay, retry loop, journal reset or stale-lock deletion. Do not delete the journal to force an operation through. Local journaling coordinates processes on one host; server idempotency and grant enforcement remain necessary across hosts.

For a paid checkout, use `voidpay_checkout_recovery_link` in the original authenticated browser. Do not initiate a new payment to recover an existing result.

## Public connector / private service

This public source tree is offered under Apache-2.0. The previously published npm 0.7.1 tarball declares MIT; its published terms are unchanged by this source publication. Other previously published client versions remain under their original terms. This package does not include private backend source, provider credentials, wallet keys, customer records or source maps. Its build checks the exact public import boundary and explicit package file list.

## Migration from 0.6.x

This is an intentional pre-1.0 breaking interface update. The old 41-tool credit/escrow/listing surface, `registerPaidTool` export, `{server, pay}` result, wallet creation and `--api-url` override are removed from this package's public exports. `buildServer` now returns `{server}`; `createToolRunner` exposes the same handlers for a trusted Node host. Do not use the retired `/v1/pay/marketplace` route as the current marketplace catalog.

## Development

Use the repository's existing locked dependencies, then run `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke` in this package. The build bundles only the public creator client and four public protocol modules; MCP SDK dependencies remain external. Tests use synthetic responses and send no payments or emails. Package publication and live owner/grant qualification are separate from these local checks.
