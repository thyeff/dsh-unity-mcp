# Unity 桥接排障手册（Troubleshooting: Unity bridge）

本页补充 README 的 FAQ，给出 mcp-unity 桥接侧（Unity 编辑器内）的具体排障步骤。

## 症状 1：`get_scenes_hierarchy` 返回空 / 工具总是「连接失败」

- [ ] 确认 Unity 编辑器**已打开且加载了项目**（网桥跑在编辑器进程内，关着 ⇒ 必然失败）
- [ ] 确认项目已装入网桥包：`Packages/manifest.json` 含 `com.gamelovers.mcp-unity`
- [ ] 确认网桥已启动监听：编辑器内菜单 **GameLovers → MCP Unity → Start**（或自动启动）
- [ ] 确认端口是 8090（默认）；被占用时在 Unity 网桥设置中更改，并通过插件 `config.env.UNITY_PORT` 覆盖（服务端也读取 `ProjectSettings/McpUnitySettings.json`）
- [ ] `unity_status` 做 WebSocket 握手而非普通 TCP 检查；握手成功只证明端点接受 WebSocket，不保证 MCP 工具调用或编辑器操作正常

## 症状 2：工具列表里根本没有 unity 工具

- [ ] DSH 已安装本插件（`dsh plugin list --profile web` 可见）
- [ ] 未与手动配置的 `serverName: unity` 冲突（二选一，不要并存）
- [ ] harness 启动后等 10~20s（服务端自动拉起 + 握手）
- [ ] 若仍无：从 profile 根目录跑 `node <repo>/scripts/smoke.mjs`，看服务端本身能不能 handshake

## 症状 3：某工具能连通但报参数错误

- [ ] 先调用 `get_scene_info` 或 `get_console_logs`，用真实字段再回填参数（工具 schema 很严格）
- [ ] 有怀疑时用 `batch_execute` 组合多条只读命令一次诊断

## 症状 4：插件加载时报命名空间冲突

- [ ] 移除 profile `cordis.patch.yml` 中手写的 mcp-unity/`serverName: unity` 条目，交由插件接管
- [ ] 重启 harness

## 兜底

- 所有 DSH 侧问题，先跑烟雾测试 + 看 harness 日志（`$DSH_HOME` 的 logs 目录）
- 所有 Unity 侧问题，看编辑器 Console（运行/编辑均有红色报错会显示）