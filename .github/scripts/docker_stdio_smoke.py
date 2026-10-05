#!/usr/bin/env python3
"""Probe the built Docker image over stdio without calling a public service."""

import json
import os
import selectors
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4


class ProbeFailure(Exception):
    pass


EXPECTED_TOOLS = {
    "voidpay_status",
    "voidpay_services",
    "voidpay_storefront",
    "voidpay_checkout_link",
    "voidpay_checkout_recovery_link",
    "voidpay_creator_read",
    "voidpay_creator_inventory",
    "voidpay_creator_create",
    "voidpay_creator_save",
    "voidpay_creator_publish",
    "voidpay_creator_unpublish",
    "voidpay_creator_recover",
}
OVERALL_SECONDS = 85
STARTUP_SECONDS = 35
REQUEST_SECONDS = 12
MAX_STDOUT_LINE = 64 * 1024
MAX_STDERR_BYTES = 64 * 1024


def require(condition, message):
    if not condition:
        raise ProbeFailure(message)


class Session:
    def __init__(self, process, deadline):
        self.process = process
        self.deadline = deadline
        self.stdout_buffer = b""
        self.stderr_bytes = 0
        self.selector = selectors.DefaultSelector()
        self.selector.register(process.stdout, selectors.EVENT_READ, "stdout")
        self.selector.register(process.stderr, selectors.EVENT_READ, "stderr")

    def send(self, message):
        require(self.process.poll() is None, "container exited before request")
        try:
            self.process.stdin.write((json.dumps(message, separators=(",", ":")) + "\n").encode())
            self.process.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            raise ProbeFailure("container closed stdio before request") from exc

    def response(self, request_id, seconds):
        deadline = min(self.deadline, time.monotonic() + seconds)
        while True:
            while b"\n" in self.stdout_buffer:
                line, self.stdout_buffer = self.stdout_buffer.split(b"\n", 1)
                if not line:
                    continue
                require(len(line) <= MAX_STDOUT_LINE, "oversized MCP response")
                try:
                    message = json.loads(line)
                except (UnicodeDecodeError, ValueError) as exc:
                    raise ProbeFailure("non-JSON data on MCP stdout") from exc
                require(isinstance(message, dict), "invalid MCP response shape")
                require(message.get("jsonrpc") == "2.0", "invalid JSON-RPC version")
                if "id" not in message:
                    continue  # An MCP notification can arrive between responses.
                require(message["id"] == request_id, "unexpected MCP response ID")
                return message

            require(len(self.stdout_buffer) <= MAX_STDOUT_LINE, "oversized MCP stdout line")
            remaining = deadline - time.monotonic()
            require(remaining > 0, "MCP response deadline exceeded")
            events = self.selector.select(min(remaining, 1))
            if not events:
                require(self.process.poll() is None, "container exited before MCP response")
                continue
            for key, _ in events:
                data = os.read(key.fileobj.fileno(), 4096)
                if not data:
                    self.selector.unregister(key.fileobj)
                    if key.data == "stdout":
                        raise ProbeFailure("MCP stdout closed before response")
                    continue
                if key.data == "stdout":
                    self.stdout_buffer += data
                else:
                    self.stderr_bytes += len(data)
                    require(self.stderr_bytes <= MAX_STDERR_BYTES, "excess container stderr")


def request(session, request_id, method, params=None, timeout=REQUEST_SECONDS):
    session.send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})
    return session.response(request_id, timeout)


def main(image):
    manifest = Path(__file__).resolve().parents[2] / "voidly-pay-mcp" / "package.json"
    try:
        expected_version = json.loads(manifest.read_text(encoding="utf-8"))["version"]
    except (OSError, KeyError, TypeError, ValueError) as exc:
        raise ProbeFailure("package manifest unavailable") from exc
    name = "voidpay-mcp-pr-smoke-" + uuid4().hex[:12]
    command = [
        "docker", "run", "--rm", "-i", "--name", name,
        "--network", "none", "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", image,
    ]
    process = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, bufsize=0,
    )
    try:
        session = Session(process, time.monotonic() + OVERALL_SECONDS)
        hello = request(session, 1, "initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "voidpay-docker-ci", "version": "1.0.0"},
        }, STARTUP_SECONDS)
        require("error" not in hello, "initialize returned an error")
        result = hello.get("result")
        require(isinstance(result, dict), "initialize returned no result")
        require(result.get("protocolVersion") == "2025-06-18", "protocol version mismatch")
        info = result.get("serverInfo")
        require(isinstance(info, dict) and info.get("name") == "voidly-pay", "unexpected server identity")
        require(info.get("version") == expected_version, "server version differs from package manifest")
        capabilities = result.get("capabilities")
        require(isinstance(capabilities, dict), "initialize returned no capabilities")
        require(isinstance(capabilities.get("tools"), dict), "tools capability absent")
        require("resources" not in capabilities and "prompts" not in capabilities,
                "optional capability changed; update discovery assertions")
        session.send({"jsonrpc": "2.0", "method": "notifications/initialized"})

        listed = request(session, 2, "tools/list")
        listed_result = listed.get("result")
        require(isinstance(listed_result, dict), "tools/list returned no result")
        tools = listed_result.get("tools")
        require(isinstance(tools, list) and len(tools) == 12, "tool catalog is not 12 entries")
        names = [tool.get("name") for tool in tools if isinstance(tool, dict)]
        require(len(names) == 12 and set(names) == EXPECTED_TOOLS, "tool catalog names changed")
        require(all(isinstance(tool.get("description"), str) and tool["description"].strip()
                    and isinstance(tool.get("inputSchema"), dict)
                    and tool["inputSchema"].get("type") == "object" for tool in tools),
                "tool catalog has incomplete descriptors")

        # These capabilities are not advertised. Probe the negative response only;
        # a normal MCP client would not invoke them after capability negotiation.
        for request_id, method in [(3, "resources/list"), (4, "prompts/list")]:
            unsupported = request(session, request_id, method)
            error = unsupported.get("error")
            require(isinstance(error, dict) and error.get("code") == -32601,
                    method + " did not reject as an unsupported method")

        # index.ts checks the name against the local table before its dispatch
        # switch. This unknown name cannot reach a public read or creator mutation.
        missing = request(session, 5, "tools/call", {"name": "__ci_missing_tool__", "arguments": {}})
        failure = missing.get("result")
        require(isinstance(failure, dict), "unknown tool returned no result")
        content = failure.get("content")
        require(failure.get("isError") is True and isinstance(content, list) and len(content) == 1,
                "unknown tool did not return a tool error")
        require(isinstance(content[0], dict) and content[0].get("type") == "text",
                "unknown tool error is not text")
        try:
            body = json.loads(content[0]["text"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ProbeFailure("unknown tool error is not structured JSON") from exc
        require(body == {"error": {"code": "TOOL_NOT_FOUND"}},
                "unknown tool error is not sanitized")
        print("PASS: Docker stdio initialize, 12-tool catalog, optional-method rejection, sanitized failure")
    finally:
        try:
            process.stdin.close()
            process.wait(timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
        try:
            subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=5, check=False)
        except (OSError, subprocess.TimeoutExpired):
            pass


if __name__ == "__main__":
    try:
        require(len(sys.argv) == 2, "usage: docker_stdio_smoke.py IMAGE")
        main(sys.argv[1])
    except ProbeFailure as exc:
        print("FAIL: Docker stdio MCP probe: " + str(exc), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("FAIL: Docker stdio MCP probe: internal probe error", file=sys.stderr)
        sys.exit(1)
