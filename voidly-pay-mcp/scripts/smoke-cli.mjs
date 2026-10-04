#!/usr/bin/env node
// Smoke test for the built CLI: complete an MCP handshake over stdio and
// verify the declared tool count. No live service route is called. Creator
// setup is disabled and the private journal path is a temporary directory.

import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(root, "dist", "cli.js");
const packageVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// Use the built public tool table; handshake verifies the actual CLI.
const { tools } = await import('../dist/index.js');
const expected = tools.length;

const keyDir = mkdtempSync(join(tmpdir(), "voidly-pay-mcp-smoke-"));
const child = spawn(process.execPath, [cliPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    VOIDPAY_CREATOR_SETUP_FILE: "",
    VOIDLY_PAY_API_URL: "",
    VOIDPAY_MCP_STATE_DIR: join(keyDir, "journal"),
  },
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (d) => (stdout += d));
child.stderr.on("data", (d) => (stderr += d));

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

function finish(code, msg) {
  try {
    child.kill("SIGTERM");
  } catch {}
  rmSync(keyDir, { recursive: true, force: true });
  if (msg) console[code === 0 ? "log" : "error"](msg);
  process.exit(code);
}

const timer = setTimeout(() => {
  finish(1, `smoke: TIMEOUT after 20s\n--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}`);
}, 20_000);

child.on("error", (e) => finish(1, `smoke: spawn failed: ${e.message}`));
child.on("exit", (code, signal) => {
  if (signal === "SIGTERM") return; // our own teardown
  clearTimeout(timer);
  finish(1, `smoke: CLI exited early (code=${code})\n--- stderr ---\n${stderr}`);
});

// Handshake, then list.
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "voidly-pay-mcp-smoke", version: "0" },
  },
});

let initialized = false;
let buffer = "";

child.stdout.on("data", () => {
  buffer = stdout;
  const lines = buffer.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    if (msg.id === 1 && !initialized) {
      initialized = true;
      const info = msg.result?.serverInfo;
      console.log(`smoke: handshake ok — serverInfo ${info?.name}@${info?.version}`);
      if (info?.version !== packageVersion) {
        return finish(1, `smoke: FAIL — serverInfo version ${info?.version} != package ${packageVersion}`);
      }
      send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    }

    if (msg.id === 2) {
      clearTimeout(timer);
      const list = msg.result?.tools;
      if (!Array.isArray(list)) {
        return finish(1, `smoke: tools/list returned no array: ${line}`);
      }
      console.log(`smoke: tools/list returned ${list.length} tools`);
      console.log(`smoke: src/tools.ts declares  ${expected} tools`);
      if (list.length !== expected) {
        return finish(1, `smoke: FAIL — count mismatch (${list.length} vs ${expected})`);
      }
      if (list.some((t) => t.name === "voidly_fetch")) {
        return finish(1, "smoke: FAIL — voidly_fetch is present; it was removed in 0.5.2");
      }
      const bad = list.find((t) => !t.name || !t.description || !t.inputSchema);
      if (bad) {
        return finish(1, `smoke: FAIL — malformed tool entry: ${JSON.stringify(bad)}`);
      }
      console.log(`smoke: first tool  ${list[0].name}`);
      console.log(`smoke: last tool   ${list[list.length - 1].name}`);
      return finish(0, "smoke: PASS");
    }
  }
});
