# FAQ

## Is this a remote MCP endpoint?

No. `@voidly/pay-mcp@0.7.3` runs locally over stdio in a Node 20+ MCP host. For remote-only hosts, this repository [documents a separate hosted Voidpay endpoint](../README.md#hosted-voidpay-four-public-tools) with four public read/link tools; it does not expose the local package's creator catalog. Check the current served endpoint before relying on it.

## Does public discovery require a credential?

No. `voidpay_status`, `voidpay_services`, `voidpay_storefront`, `voidpay_checkout_link`, and `voidpay_checkout_recovery_link` do not require a creator grant. Public read results are descriptive and do not prove current paid-service capacity.

## Does `voidpay_status` check payment readiness?

No. It reports local connector capabilities and setup. Its `hostedServiceAvailability` is always `not-asserted` in this release.

## Can the connector buy a service or sign for me?

No. It holds no wallet keys and makes no autonomous purchases. A checkout link sends the buyer to a browser to review service, chain, amount, and authorization. `paymentPerformed` is `false` in the link response.

## How does creator access work?

The owner approves a scoped grant at [marketplace creation](https://voidly.ai/pay/marketplace/create). The trusted host stores the actual setup JSON privately and passes only its absolute path in `VOIDPAY_CREATOR_SETUP_FILE`. Reads, drafts, and publishing need the corresponding server-side scopes. Do not substitute a browser cookie, human JWT, invented grant, or tool argument for that setup.

## Why does a listed service say `not-asserted`?

The projection records an approved public description, not a real-time readiness check. The buyer browser and hosted service perform the actual eligibility, chain, amount, and authorization checks later.

## What if a publication changes after I read it?

`voidpay_checkout_link` re-reads it. A digest or selected-service mismatch returns `STOREFRONT_SELECTION_CHANGED` instead of a generic checkout URL. Re-read the storefront and ask the buyer to review the current selection.

## Can I retry a creator mutation after a timeout?

Do not send a replacement mutation. The connector journals the exact original before dispatch; `OUTCOME_UNKNOWN` means it may have committed. Recover the original with its operation and key. A `null` recovery is unresolved and does not authorize another key or a journal reset.

## Can I use the old credit or escrow tools?

No. This 0.7.3 interface has 12 marketplace tools and no retired credit, escrow, stream, or transfer tools. The migration from 0.6.x is intentionally breaking.

## Does a repository file or MCP Registry record prove the service is live?

No. Package source, npm publication, directory metadata, served site copy, and an actual buyer checkout are different evidence. The tool and docs describe package behavior. A current hosted capability needs its own served readback and transaction-specific proof.
