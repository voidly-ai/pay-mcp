#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const version = read('voidly-pay-mcp/package.json').version;
const claude = read('.claude-plugin/plugin.json');
const marketplace = read('.claude-plugin/marketplace.json');
const cursor = read('.cursor-plugin/plugin.json');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(claude.name === 'voidpay-marketplace' && cursor.name === claude.name, 'plugin names differ');
check(claude.version === version && cursor.version === version, 'plugin versions differ from package');
check(!Object.hasOwn(claude, 'mcpServers') && !Object.hasOwn(cursor, 'mcpServers'), 'plugin manifest duplicates the MCP server');
check(marketplace.plugins?.length === 1 && marketplace.plugins[0].name === claude.name && marketplace.plugins[0].source === './', 'Claude marketplace entry differs from root plugin');

for (const path of ['.mcp.json', 'mcp.json']) {
  const servers = read(path).mcpServers;
  const expectedNames = path === '.mcp.json' ? ['voidpay', 'voidpay-hosted'] : ['voidpay'];
  check(servers && JSON.stringify(Object.keys(servers).sort()) === JSON.stringify(expectedNames), `${path} MCP server names differ`);
  const server = servers.voidpay;
  check(server.command === 'npx' && JSON.stringify(server.args) === JSON.stringify(['-y', `@voidly/pay-mcp@${version}`]), `${path} pin differs from package`);
  check(server.type === undefined || server.type === 'stdio', `${path} must use stdio`);
  check(!['url', 'headers', 'env'].some(key => Object.hasOwn(server, key)), `${path} local server adds a remote or secret-bearing setting`);
  if (path === '.mcp.json') {
    const hosted = servers['voidpay-hosted'];
    check(hosted.type === 'http' && hosted.url === 'https://api.voidly.ai/mcp/voidpay', 'root hosted Voidpay URL differs');
    check(!['command', 'args', 'headers', 'env'].some(key => Object.hasOwn(hosted, key)), 'root hosted Voidpay adds an execution or secret-bearing setting');
  }
}

console.log(`plugin manifests: local stdio pinned @voidly/pay-mcp@${version}; root also declares hosted Voidpay HTTP`);
