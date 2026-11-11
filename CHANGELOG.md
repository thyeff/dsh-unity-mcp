# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Require Node.js >=24.9.0 and DSH MCP client/tools 0.2.2-rc.1-compatible APIs.
- Resolve Unity host/port from the same environment and project settings sources as the vendored server; `unity_status` now performs a WebSocket handshake and states its limited scope.
- Validate server namespaces and timer/reconnect values, and expose the supported `nodePath` config.
- Include the smoke script in npm package files; CI now runs unit tests, stdio smoke, and a packed-install smoke on Node 24.
- Document destructive Unity operations and the absence of plugin-enforced read-only/approval controls.


## [1.1.0] - 2026-09-03

### Added

- Local diagnostic tool `unity_status`: TCP-probes the Unity bridge (host/port
  resolved from `UNITY_HOST`/`UNITY_PORT` env, default `localhost:8090`) before
  the agent calls any `mcp__unity__*` tool, so a closed Unity editor is detected
  in ~2 s instead of a 60 s tool-call timeout. Returns structured status with
  latency and an actionable hint; probe timeout configurable via `probeTimeoutMs`.
- Config schema (`Config` via `@deepseek-ai/schemastery`): `toolCallTimeoutMs`,
  `probeTimeoutMs`, and reconnect timing/attempts are validated at load time —
  invalid values (e.g. non-positive timeouts) fail loudly instead of silently
  unregistering tools.

### Fixed

- README documented the bridge port env var as `MCP_UNITY_PORT`; the vendored
  mcp-unity server actually reads `UNITY_PORT` (and `UNITY_HOST`). Docs and
  examples corrected (v1.0.0).

## [1.0.0] - 2026-08-28

### Added

- Bundled vendored [mcp-unity](https://github.com/CoderGamester/mcp-unity) 1.4.0 server (MIT)
  under `vendor/mcp-unity-server/`.
- Automatic registration of a `unity`-namespaced MCP client via
  `@deepseek-ai/dsh-mcp-client`, mounted through a `dsh.bundle` patch — install the
  plugin and the 34 Unity tools are ready, no manual profile editing.
- Auto-reconnect with exponential backoff (1s → 30s, up to 10 attempts) when the
  Unity editor (bridge) is restarted.
- Configurable Unity bridge port through `config.env.MCP_UNITY_PORT` (env passthrough
  to the vendored server, default 8090).
- Full Chinese documentation in `README.md`, covering install, the Unity-side UPM
  bridge package, config overrides, and troubleshooting.
- MIT license with upstream attribution for the vendored server.