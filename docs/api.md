# Programmatic package API

`@voidly/pay-mcp@0.7.3` exports `tools`, `createToolRunner`, and `buildServer` from its main package entry. It also exports the `ServerConfig` TypeScript interface. The executable `voidly-pay-mcp` starts the same server over stdio. Most MCP hosts should use the [pinned stdio setup](quickstart.md); these exports are for a trusted Node host integrating the connector directly.

## `tools`

`tools` is the array of 12 public MCP tool definitions. Each definition has `name`, `description`, `inputSchema`, and annotations. It is metadata; reading it does not contact the hosted service or establish payment readiness.

```ts
import { tools } from '@voidly/pay-mcp';

const names = tools.map(tool => tool.name); // 12 names, from voidpay_status through voidpay_creator_recover
```

The [tool reference](tools.md) gives one request and parsed response example for each name.

## `createToolRunner(config?)`

`createToolRunner` returns an async function that accepts a tool name and its argument object. It returns the MCP result envelope. Public discovery works with no config:

```ts
import { createToolRunner } from '@voidly/pay-mcp';

const call = createToolRunner();
const result = await call('voidpay_status', {});
if ('isError' in result && result.isError) throw new Error(result.content[0].text);
const status = JSON.parse(result.content[0].text);
console.log(status.version, status.hostedServiceAvailability);
// 0.7.3 not-asserted
```

The call above returns a text content block whose parsed JSON begins with `{"version":"0.7.3","discovery":"public"}` and includes `"autonomousPayments":false`, `"walletKeysHeld":false`, and `"hostedServiceAvailability":"not-asserted"`. These are local connector flags, not a live service probe.

For creator tools, `ServerConfig` may include `creator` with an **actual approved** `credential`, `ownerAccountId`, and optional `targetSpaceId`, plus a private absolute `stateDirectory` for the original-operation journal. The process must keep those values private; passing a credential in an MCP tool argument, prompt, or repository is unsupported. Use the CLI's private setup file flow in [Quickstart](quickstart.md) when possible. Creator calls without both a creator client and journal return `CREATOR_SETUP_REQUIRED`.

## `buildServer(config?)`

`buildServer` returns a Promise of `{server}` with the 12 tools registered through the MCP SDK. The host connects that server to a transport; building it alone does not perform a network call or payment.

```ts
import { buildServer } from '@voidly/pay-mcp';

const { server } = await buildServer();
// Connect server to the host's MCP transport using the MCP SDK.
```

The concrete response is an MCP `Server` object, not JSON. The package's own [stdio executable](../voidly-pay-mcp/src/cli.ts) shows the transport connection. There is no remote URL override in this release.
