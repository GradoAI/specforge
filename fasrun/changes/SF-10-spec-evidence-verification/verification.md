# SF-10 验证与实现能力边界

基线：main 101cb18。本文件是本次规范修订的可复核证据索引，不是新的规范授权，也不把文档审查当成已交付自动功能。

## 六例文本审查

| 反例 | 检查位置 | 结论 |
| --- | --- | --- |
| CE-1 | AGENTS维护首条；R-spec-005；D-13 | 范围内复用与越界返回同时存在，符合 |
| CE-2 | AGENTS归档维护；R-spec-005；requirements归属边界 | 最小活跃变更、历史保护、小改动不强制空层，符合 |
| CE-3 | tasks交付对账条款；AGENTS投影规则 | 删除强制独立进度PR但保留同步、人工审查与定义变更边界，符合 |
| CE-4 | R-spec-007；D-13；tasks | 当前HEAD原始事实优先，meta不能推进，符合 |
| CE-5 | R-spec-009；tasks；R-platform-012.S10 | 重复对账复用入口，失败/成功分别留证，符合 |
| CE-6 | R-platform-012.S8–S10；D-17/D-19 | 实施前现有门禁不变；实施后未知回退/失败关闭，符合 |

## 已有能力与未实现能力

- `apps/fasrun-dev-cli/src/lib/spec.ts`、spec-common现有校验支持Markdown结构/引用/覆盖/任务依赖及允许路径，`fasrun check`校验配置；不自动判定GitHub当前批准、实际交付、元数据真伪、语义漂移。
- `tools/scripts/src/spec-first.ts`检查main上活跃工作/任务存在；不是变更范围自动证明。现有归档工具也不等于验收或授权通用写入。
- `.github/workflows/ci.yml`仍运行当前测试入口；没有本次所定义的提交绑定影响计划。选择器、自动证据校验、CI及保护规则的落地均未实现，本次不交付这些能力。
- 本次仅规范修订，未新增产品测试编号或实现任务；六例为人工可复核文本反例，后续自动化需独立适用的规格与评审。

## 工具验证

- `fasrun spec validate fasrun/`：54个Markdown文件通过；`fasrun check`：spec validate、Fasfile、fasrun.yaml通过。使用main已交付CLI执行，未修改工具。
- 首次草稿检查曾报US映射错误：映射须单独成行，且工具不支持跨活跃变更US映射。已改为复用SF-5 US-3及明确的人工追溯表，不复制需求、不放宽校验；修订后两条命令通过。
- `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm lint`、`pnpm format`均通过。
- 受影响规格工具回归：`pnpm test --filter=@fasrun/plugin-spec-common --force --continue=dependencies-successful`，2/2 Turbo任务、5个测试文件、76项测试通过，0缓存；这是定向标准入口，不是全仓集成通过记录。
- 静态对比：25个任务条目与勾选完全相同；tasks仅一条规范性进度条款改变；R-platform-012.S1–S7逐段相同；8个规范/证据文件，无CI、保护、代码或归档历史修改；CLAUDE.md仍仅引用AGENTS。
- 独立只读审查覆盖六例与产品追溯，未发现实质阻断；已采纳需求1.0/1.1/1.3追溯精度修正。
- CI、队列和主干结果以本PR运行链接为准；未发生的运行不预记通过。本次不以公共测试的旧通过或重跑代替新提交验证。
