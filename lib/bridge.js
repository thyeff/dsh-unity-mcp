import { readFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8090;
const SETTINGS_FILE = path.join("ProjectSettings", "McpUnitySettings.json");
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export async function resolveBridgeTarget({ environment = process.env, cwd = process.cwd(), modulePath } = {}) {
  const settings = await findProjectSettings({ environment, cwd, modulePath });
  const hostFromEnv = normalizeString(environment.UNITY_HOST);
  const portFromEnv = parseInteger(environment.UNITY_PORT);
  const hostFromSettings = normalizeString(settings?.Host);
  const portFromSettings = parseInteger(settings?.Port);
  return {
    host: hostFromEnv ?? hostFromSettings ?? DEFAULT_HOST,
    port: validPort(portFromEnv) ? portFromEnv : validPort(portFromSettings) ? portFromSettings : DEFAULT_PORT,
    hostSource: hostFromEnv ? "UNITY_HOST" : hostFromSettings ? "McpUnitySettings.json" : "default",
    portSource: validPort(portFromEnv) ? "UNITY_PORT" : validPort(portFromSettings) ? "McpUnitySettings.json" : "default",
  };
}

async function findProjectSettings({ environment, cwd, modulePath }) {
  const explicitPath = normalizeString(environment.MCP_UNITY_SETTINGS_PATH);
  if (explicitPath) {
    const settings = await readSettings(path.resolve(cwd, explicitPath));
    if (settings) return settings;
  }

  const roots = [modulePath ? path.dirname(modulePath) : cwd, cwd];
  const visited = new Set();
  for (const root of roots) {
    let directory = path.resolve(root);
    while (!visited.has(directory)) {
      visited.add(directory);
      const settings = await readSettings(path.join(directory, SETTINGS_FILE));
      if (settings) return settings;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return undefined;
}

async function readSettings(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseInteger(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function probeWebSocket(host, port, timeoutMs, signal) {
  return new Promise((resolve) => {
    const addressHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    let socket;
    const startedAt = Date.now();
    try {
      socket = new WebSocket(`ws://${addressHost}:${port}/McpUnity`);
    } catch (error) {
      resolve({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => settle(false, `WebSocket handshake timeout after ${timeoutMs} ms`), timeoutMs);
    const onAbort = () => settle(false, "aborted");

    function settle(ok, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.on("error", () => {});
        socket.once("close", () => socket.removeAllListeners());
        socket.close();
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.terminate();
      }
      socket.removeAllListeners("open");
      socket.removeAllListeners("message");
      socket.removeAllListeners("ping");
      socket.removeAllListeners("pong");
      resolve({ ok, latencyMs: Date.now() - startedAt, ...(error ? { error } : {}) });
    }

    socket.once("open", () => settle(true));
    socket.once("error", (error) => settle(false, error.message || "WebSocket connection failed"));
    if (signal) {
      if (signal.aborted) return settle(false, "aborted");
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export { MAX_TIMER_DELAY_MS };
