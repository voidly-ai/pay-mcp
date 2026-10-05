# Voidpay MCP installation

Install `@voidly/pay-mcp@0.7.3` on a trusted host with Node 20 or newer. Configure a stdio-capable MCP client to run `npx -y @voidly/pay-mcp@0.7.3`.

Start with `voidpay_status`, then `voidpay_services`. Public discovery needs no credential. For marketplace creation and publishing, the owner must approve a scoped creator grant at https://voidly.ai/pay/marketplace/create and save its actual setup JSON in a user-owned 0600 file. Set `VOIDPAY_CREATOR_SETUP_FILE` to that private file path in the host environment. Never paste the credential into a prompt, tool arguments or public config.

Follow the README workflow for draft creation, exact service selection, save, explicit publication and original-only recovery. Preserve the private journal. Repeated mutations only read the original result; a null recovery is unresolved and must not cause a replacement key or payment.

Purchases use `voidpay_checkout_link` and genuine owner-browser authorization. This connector holds no wallet keys and makes no autonomous payments. Hosted enforcement remains private. The old credit/escrow/transfer tools are not available. This stdio package is not a remote MCP URL. Keep normal host permissions and installation warnings enabled.
