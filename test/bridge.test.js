import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocketServer } from "ws";
import { probeWebSocket, resolveBridgeTarget } from "../lib/bridge.js";

async function withTempDir(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dsh-unity-mcp-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function listen(server) {
  const sockets = new Set();
  server.testSockets = sockets;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    for (const socket of server.testSockets ?? []) socket.destroy();
    for (const client of server.clients ?? []) client.terminate();
  });
}

test("resolveBridgeTarget uses discovered Unity settings and environment overrides", async () => {
  await withTempDir(async (root) => {
    const project = path.join(root, "unity-project");
    const moduleDir = path.join(project, "Library", "PackageCache", "mcp-unity", "Server~");
    const cwd = path.join(root, "unrelated", "working-directory");
    await mkdir(path.join(project, "ProjectSettings"), { recursive: true });
    await mkdir(moduleDir, { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      path.join(project, "ProjectSettings", "McpUnitySettings.json"),
      JSON.stringify({ Host: "127.0.0.2", Port: 8123 })
    );

    const fromSettings = await resolveBridgeTarget({
      environment: {},
      cwd,
      modulePath: path.join(moduleDir, "build", "index.js"),
    });
    assert.deepEqual(fromSettings, {
      host: "127.0.0.2",
      port: 8123,
      hostSource: "McpUnitySettings.json",
      portSource: "McpUnitySettings.json",
    });

    const overridden = await resolveBridgeTarget({
      environment: { UNITY_HOST: "localhost", UNITY_PORT: "9001" },
      cwd,
      modulePath: path.join(moduleDir, "build", "index.js"),
    });
    assert.equal(overridden.host, "localhost");
    assert.equal(overridden.port, 9001);
    assert.equal(overridden.hostSource, "UNITY_HOST");
    assert.equal(overridden.portSource, "UNITY_PORT");
  });
});

test("resolveBridgeTarget reads explicit settings path relative to cwd", async () => {
  await withTempDir(async (root) => {
    const cwd = path.join(root, "project");
    await mkdir(cwd, { recursive: true });
    await writeFile(path.join(cwd, "unity-settings.json"), JSON.stringify({ Host: "unity.local", Port: 9002 }));
    const target = await resolveBridgeTarget({
      environment: { MCP_UNITY_SETTINGS_PATH: "unity-settings.json" },
      cwd,
      modulePath: path.join(root, "module", "index.js"),
    });
    assert.equal(target.host, "unity.local");
    assert.equal(target.port, 9002);
  });
});

test("probeWebSocket succeeds only after a WebSocket handshake", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  let requestPath;
  server.on("connection", (_socket, request) => { requestPath = request.url; });
  const port = await new Promise((resolve) => server.once("listening", () => resolve(server.address().port)));
  const result = await probeWebSocket("127.0.0.1", port, 1000);
  assert.equal(result.ok, true);
  assert.equal(requestPath, "/McpUnity");
  assert.equal(typeof result.latencyMs, "number");
  await close(server);
});

test("probeWebSocket rejects a plain TCP listener", async () => {
  const server = net.createServer((socket) => socket.end("not websocket"));
  const port = await listen(server);
  try {
    const result = await probeWebSocket("127.0.0.1", port, 1000);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, "string");
  } finally {
    await close(server);
  }
});

test("probeWebSocket returns a timeout when a listener never completes the handshake", async () => {
  const server = net.createServer((socket) => socket.on("data", () => {}));
  const port = await listen(server);
  try {
    const result = await probeWebSocket("127.0.0.1", port, 100);
    assert.equal(result.ok, false);
    assert.match(result.error, /timeout/i);
  } finally {
    await close(server);
  }
});

test("probeWebSocket reports invalid target URLs without rejecting", async () => {
  const result = await probeWebSocket("bad host", 8090, 1000);
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid/i);
});

test("probeWebSocket reports connection failures without rejecting", async () => {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);
  const result = await probeWebSocket("127.0.0.1", port, 1000);
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
});
