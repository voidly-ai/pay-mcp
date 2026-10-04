#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildServer, type ServerConfig } from './index.js';
import { readPrivateJson } from './journal.js';
async function main() {
  if (process.argv.length !== 2 || process.env.VOIDLY_PAY_API_URL) throw new Error('UNSUPPORTED_CONFIGURATION');
  const file = process.env.VOIDPAY_CREATOR_SETUP_FILE;
  const creator = file ? readPrivateJson(file, 4096) as ServerConfig['creator'] : undefined;
  const { server } = await buildServer({ creator, stateDirectory: process.env.VOIDPAY_MCP_STATE_DIR ?? join(homedir(), '.voidly', 'pay-mcp-journal') });
  await server.connect(new StdioServerTransport());
}
main().catch(() => { process.stderr.write('[voidly-pay-mcp] Setup failed. Check the private creator setup file, Node version and fixed-origin configuration.\n'); process.exitCode = 1; });
