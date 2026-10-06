// No-key smoke test for the n8n workflow. Runs n8n's own MCP Client Tool code outside n8n:
// the node's `getTools` load-options method (what the n8n editor calls to list a server's tools)
// and its `getSelectedTools` include/exclude filter, against the MCP Client Tool nodes in
// voidly-hosted-mcp-agent.workflow.json. Needs: npm i --ignore-scripts @n8n/n8n-nodes-langchain@2.42.3
// It does NOT start n8n or run the AI Agent (that needs an OpenAI credential).
const path = require('path');
const wf = require('./voidly-hosted-mcp-agent.workflow.json');
const base = path.dirname(require.resolve('@n8n/n8n-nodes-langchain/package.json'));
const { getTools } = require(path.join(base, 'dist/nodes/mcp/McpClientTool/loadOptions.js'));
const { getSelectedTools } = require(path.join(base, 'dist/nodes/mcp/McpClientTool/utils.js'));
const { passthroughEgressFilter } = require('@n8n/backend-network'); // dependency of @n8n/n8n-nodes-langchain

function get(obj, dotted, fallback) {
  const v = dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  return v === undefined ? fallback : v;
}

(async () => {
  const mcpNodes = wf.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.mcpClientTool');
  for (const node of mcpNodes) {
    const ctx = {
      getNode: () => node,
      getNodeParameter: (name, fallback) => get(node.parameters, name, fallback),
      getCredentials: async () => { throw new Error('no credentials expected (authentication: none)'); },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      // n8n's SSRF egress filter is supplied by the n8n host at runtime; here we use n8n's own passthrough filter.
      helpers: { getSecureEgressFilter: () => passthroughEgressFilter },
    };
    const listed = await getTools.call(ctx);
    const selected = getSelectedTools({
      tools: listed.map((t) => ({ name: t.name })),
      mode: node.parameters.include ?? 'all',
      includeTools: node.parameters.includeTools ?? [],
      excludeTools: node.parameters.excludeTools ?? [],
    }).map((t) => t.name);
    console.log(JSON.stringify({ node: node.name, url: node.parameters.endpointUrl, tools_listed: listed.map((t) => t.name), tools_given_to_agent: selected }));
    if (!listed.length || !selected.length || selected.includes('board_post')) throw new Error(`check failed for ${node.name}`);
  }
  console.log('SMOKE PASS');
})().catch((e) => { console.error(e); process.exit(1); });
