import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
import { MAX_TIMER_DELAY_MS, probeWebSocket, resolveBridgeTarget } from "./bridge.js";

/**
 * dsh-unity-mcp: DeepSeek Harness 插件封装。
 *
 * 加载时以子插件形式挂载官方 @deepseek-ai/dsh-mcp-client，将其指向内置的
 * mcp-unity 服务端（vendored，来自 CoderGamester/mcp-unity，MIT）。
 * 服务端通过 WebSocket 连接 Unity 编辑器内的 MCP Unity Bridge（默认 8090 端口），
 * 把 Unity 编辑器操作以 MCP 工具的形式暴露给 Agent。
 *
 * 另注册一个本地诊断工具 unity_status：执行 WebSocket 握手，确认 Unity MCP 网桥
 * 接受 WebSocket 连接；这不代替 MCP 工具调用或编辑器状态验证。
 */

const SERVER_ENTRY = fileURLToPath(
  new URL("../vendor/mcp-unity-server/build/index.js", import.meta.url)
);

export const name = "unity-mcp";

/** 需要工具注册服务：挂载 MCP 子客户端（其自身也声明 ['tools']）+ 注册 unity_status。 */
export const inject = ["tools"];

/**
 * 配置 schema（非法值在插件加载期直接报错，而不是带病运行）：
 * - toolCallTimeoutMs / probeTimeoutMs 必须为正数——超时非正的工具会被
 *   工具注册表拒绝，宁可在 schema 层拒绝整个配置也不悄悄注销工具；
 * - reconnect 各时间/次数参数同理由下限约束。
 */
export const Config = z.object({
  /** MCP 工具命名空间（默认 "unity"，工具名形如 mcp__unity__xxx）。 */
  serverName: z.string().pattern(/^[A-Za-z0-9_-]{1,32}$/).default("unity"),
  /** MCP 子进程可执行文件；省略时使用当前 Node runtime。 */
  nodePath: z.string().min(1).default(process.execPath),
  /**
   * 传给服务端进程的额外环境变量。UNITY_PORT / UNITY_HOST 可覆盖网桥
   * 端口/地址，unity_status 与服务端使用相同设置来源。
   */
  env: z.dict(String).default({}),
  /** 单次 MCP 工具调用超时（毫秒）。 */
  toolCallTimeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(60000),
  /** unity_status WebSocket 握手超时（毫秒）。 */
  probeTimeoutMs: z.number().min(100).max(MAX_TIMER_DELAY_MS).default(2000),
  /** 重连策略（Unity 编辑器重启后自动恢复连接）。 */
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      initialDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(1000),
      maxDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(30000),
      maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10),
    })
    .default({ enabled: true, initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 10 }),
});

/**
 * @param ctx - cordis 上下文。
 * @param config - 经 Config schema 校验/补全后的配置。
 */
export async function apply(ctx, config = {}) {
  const env = { ...(config.env ?? {}) };
  // 兜底：宿主若运行在 Electron 内，标记子进程为纯 Node 模式。
  if (process.versions.electron !== undefined) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const serverName = config.serverName ?? "unity";
  const probeTimeoutMs = config.probeTimeoutMs ?? 2000;
  const target = await resolveBridgeTarget({
    environment: { ...process.env, ...env },
    cwd: process.cwd(),
    modulePath: SERVER_ENTRY,
  });

  ctx.plugin(mcpClient, {
    transport: "stdio",
    serverName,
    command: config.nodePath ?? process.execPath,
    args: [SERVER_ENTRY],
    env,
    cwd: "",
    toolCallTimeoutMs: config.toolCallTimeoutMs ?? 60000,
    failOnStartupError: false,
    reconnect: {
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      maxAttempts: 10,
      ...(config.reconnect ?? {}),
    },
  });

  // 与 vendored server 使用相同的 environment > project settings > defaults 顺序。
  const bridgeHost = target.host;
  const bridgePort = target.port;

  ctx.tools.register(
    defineTool({
      name: "unity_status",
      description:
        "诊断 Unity MCP 网桥：尝试 WebSocket 握手（不是完整 MCP/Unity 健康检查）。" +
        "在调用 mcp__unity__* 工具前可先检查端点；握手失败时请提示用户检查 Unity 编辑器和网桥配置。",
      parameters: {},
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            host: { type: "string", required: true },
            port: { type: "number", required: true },
            hostSource: { type: "string", required: true },
            portSource: { type: "string", required: true },
            bridgeReachable: { type: "boolean", required: true },
            latencyMs: { type: "number" },
            error: { type: "string" },
            toolNamespace: { type: "string", required: true },
          },
        },
        render: (_args, value) => [{ type: "text", text: renderStatus(value) }],
      },
      timeoutMs: Math.min(probeTimeoutMs + 1000, MAX_TIMER_DELAY_MS),
      isConcurrencySafe: () => true,
      async execute(_args, exec) {
        const probe = await probeWebSocket(bridgeHost, bridgePort, probeTimeoutMs, exec?.signal);
        return {
          host: bridgeHost,
          port: bridgePort,
          hostSource: target.hostSource,
          portSource: target.portSource,
          bridgeReachable: probe.ok,
          latencyMs: probe.latencyMs,
          ...(typeof probe.error === "string" ? { error: probe.error } : {}),
          toolNamespace: serverName,
        };
      },
    })
  );
}

function renderStatus(value) {
  const lines = [];
  const sources = `目标来源：host=${value.hostSource}，port=${value.portSource}。`;
  if (value.bridgeReachable) {
    lines.push(
      `Unity MCP 网桥 ${value.host}:${value.port} 接受 WebSocket 握手（${value.latencyMs} ms）。`
    );
    lines.push("这仅验证 WebSocket 端点，不保证 MCP 会话或 Unity 编辑器操作可用。");
  } else {
    lines.push(
      `Unity MCP 网桥 ${value.host}:${value.port} 握手失败${value.error ? `（${value.error}）` : ""}。`
    );
    lines.push("请检查 Unity 编辑器、网桥包以及 host/port 配置；不要把端口监听等同于服务可用。");
  }
  lines.push(sources);
  lines.push(`工具命名空间：mcp__${value.toolNamespace}__*`);
  return lines.join("\n");
}
