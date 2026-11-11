# Contributing

感谢你考虑为 `dsh-unity-mcp` 贡献 :tada: — Thanks for considering contributing to `dsh-unity-mcp`!

## 本地开发（Development）

插件结构：

```
dsh-unity-mcp/
├── lib/index.js            # DSH 插件入口，挂载 mcp-client → vendored 服务端
├── cordis.patch.yml        # dsh.bundle 补丁，自动注册入口
├── vendor/mcp-unity-server/  # 内置 mcp-unity 服务端（上游 MIT）
└── scripts/smoke.mjs       # 从 node_modules 实际安装副本做 stdio 握手测试
```

从本目录安装到本地 profile 做集成验证：

```bash
# node 需在 PATH 中；DSH_HOME 指向你的 harness 目录
dsh plugin --profile web remove dsh-unity-mcp
dsh plugin --profile web install "file:./"
```

## 升级内置服务端（Upgrading the vendored server）

1. 从上游 [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity) 拉取最新构建到
   `vendor/mcp-unity-server/build/`，同步 `vendor/mcp-unity-server/LICENSE.md`，并记录准确的上游 tag/commit 与许可证。
2. 对比上游 package manifest，审阅新增/移除依赖和行为变更；同步更新 `package.json`，避免盲目升级 vendored 构建。
3. 更新 CHANGELOG，运行 `npm test`、`npm run smoke -- vendor`、`npm run smoke:install`，并从生成的 tarball 安装后运行 smoke。
4. 在目标 DSH Desktop/CLI 版本验证插件加载、工具注册、一次只读与一次可回滚写操作；再用隔离 Unity 项目验证真实 WebSocket/MCP 工具链。缺少宿主或 Unity 环境时，明确记录为未验证。
5. bump 版本并打新 Release。

## 提交流程（Contributing flow）

1. 新建分支提交改动，遵循 [Conventional Commits](https://www.conventionalcommits.org/)。
2. 确保 Node.js 24.9.0+ 与 pnpm 11.28.5 下 `pnpm install --config.auto-install-peers=false` 后 CI 步骤全部通过（见 `.github/workflows/ci.yml`，本地可手动跑同样命令）。
3. 开 PR，给出动机与验证方式（本地安装测试 / 烟雾测试输出）。

## 行为准则（Code of Conduct）

简单一条：对事不对人。就事论事，尊重他人时间。