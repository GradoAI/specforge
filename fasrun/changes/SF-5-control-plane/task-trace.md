# SF-5 任务、场景与测试追溯

本表为待评审的测试分配，不是执行报告。全部41需求/75场景原文以已合入的specs为准，设计映射沿用 [design-trace.md](design-trace.md)。每行用例必须覆盖对应场景全部GIVEN/WHEN/THEN，不以场景标题代替断言；任务的额外负例见tasks.md细则。测试路径是计划新增/扩展的位置，不伪装现有文件链接。

TC-CF-001–020保留原编号；R-platform-017.S1–S3仍为TC-PLATFORM-051–053。其余52场景使用本工作命名空间TC-SF5，避免复用3.10中TC-ID（后续服务账号/定时任务/离职）或现有TC-SPEC编号。已分配后不重排，后续新增仅追加。独立任务辅助测试不替代场景验收。

| 场景 | 用例 | 交付任务 | 计划测试落点/证据 |
| --- | --- | --- | --- |
| R-connect-001.S1 授权仓库接入 | TC-SF5-CONNECT-001 | T008 | `plugins/connect/connect-backend/src/application/integration.int.test.ts` |
| R-connect-001.S2 越界接入被拒绝 | TC-SF5-CONNECT-002 | T008 | `plugins/connect/connect-backend/src/application/integration.int.test.ts` |
| R-connect-001.S3 凭据隔离与轮换 | TC-SF5-CONNECT-003 | T008 | `plugins/connect/connect-backend/src/application/integration.int.test.ts` |
| R-connect-001.S4 专用环境真实接入 | TC-SF5-CONNECT-004 | T024 | `deploy/validation/sf5/（真实GitHub对象与评审证据）` |
| R-connect-002.S1 验签与持久应答 | TC-SF5-CONNECT-005 | T008、T009 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-002.S2 重复及乱序交付 | TC-SF5-CONNECT-006 | T009 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-002.S3 对账补漏 | TC-SF5-CONNECT-007 | T009 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-003.S1 一次受理一次确认 | TC-SF5-CONNECT-008 | T009 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-003.S2 提交及投递故障 | TC-SF5-CONNECT-009 | T009 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-003.S3 外部失败如实呈现 | TC-SF5-CONNECT-010 | T009 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-004.S1 当前版本评审 | TC-SF5-CONNECT-011 | T009、T017 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-004.S2 旧评审失效 | TC-SF5-CONNECT-012 | T009、T017 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-connect-004.S3 外部文字不是批准 | TC-SF5-CONNECT-013 | T009、T017 | `plugins/connect/connect-backend-module-github/src/github.int.test.ts` |
| R-entry-001.S1 两个入口相同规则 | TC-SF5-ENTRY-001 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-001.S2 无会话粘连 | TC-SF5-ENTRY-002 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-002.S1 重复创建与并发冲突 | TC-SF5-ENTRY-003 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-002.S2 读取分页与真实状态 | TC-SF5-ENTRY-004 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-002.S3 回答及指示重投不重复推进 | TC-SF5-ENTRY-005 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-003.S1 可追溯且不泄密的错误 | TC-SF5-ENTRY-006 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-003.S2 客户端不能冒充授权者 | TC-SF5-ENTRY-007 | T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-003.S3 外部数据返回不丢失标签 | TC-SF5-ENTRY-008 | T010、T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-004.S1 暂停与恢复不会越过关卡 | TC-SF5-ENTRY-009 | T015、T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-entry-004.S2 取消与人工行动入口 | TC-SF5-ENTRY-010 | T015、T018 | `plugins/entry/entry-backend/src/application/entry.int.test.ts` |
| R-governance-001.S1 合法规则与非法结构 | TC-SF5-GOVERNANCE-001 | T003 | `plugins/governance/governance-common/src/conditions.test.ts` |
| R-governance-002.S1 约束在各入口一致 | TC-SF5-GOVERNANCE-002 | T005 | `plugins/governance/governance-backend/src/application/policy.int.test.ts（T021跨入口组合）` |
| R-identity-001.S1 真实身份认证 | TC-SF5-IDENTITY-001 | T006、T024 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-001.S2 无效或停用身份 | TC-SF5-IDENTITY-002 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-001.S3 外部身份不能猜测 | TC-SF5-IDENTITY-003 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-002.S1 范围继承与隔离 | TC-SF5-IDENTITY-004 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-002.S2 矩阵与动态条件 | TC-SF5-IDENTITY-005 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-002.S3 不允许自我批准 | TC-SF5-IDENTITY-006 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-002.S4 每次检查立即生效 | TC-SF5-IDENTITY-007 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-003.S1 明确请求与授权快照 | TC-SF5-IDENTITY-008 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-003.S2 推断候选不能直接启动 | TC-SF5-IDENTITY-009 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-003.S3 自动模式仍须准入 | TC-SF5-IDENTITY-010 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-003.S4 范围和策略变化 | TC-SF5-IDENTITY-011 | T006 | `plugins/identity/identity-backend/src/application/identity.int.test.ts` |
| R-identity-004.S1 审计链完整且可验 | TC-SF5-IDENTITY-012 | T005 | `plugins/governance/governance-backend/src/application/audit.int.test.ts` |
| R-identity-004.S2 秘密与审计访问隔离 | TC-SF5-IDENTITY-013 | T005 | `plugins/governance/governance-backend/src/application/audit.int.test.ts` |
| R-orchestration-001.S1 步骤中断后恢复 | TC-CF-001 | T013、T022 | `plugins/orchestration/orchestration-backend/src/infrastructure/runtime/recovery.int.test.ts；plugins/orchestration/orchestration-backend/test/full/ 真实k3d故障/排空` |
| R-orchestration-002.S1 外部效果已发生时崩溃 | TC-CF-002 | T009、T022 | `plugins/connect/connect-backend-module-github/src/actions.int.test.ts；plugins/orchestration/orchestration-backend/test/full/ 真实k3d故障/排空` |
| R-orchestration-003.S1 指令后的步骤复用 | TC-CF-003 | T014 | `plugins/orchestration/orchestration-backend/src/application/plans/versions.int.test.ts` |
| R-orchestration-004.S1 等待跨重启且不阻塞其他工作 | TC-CF-004 | T015、T022 | `plugins/orchestration/orchestration-backend/src/application/gates/gates.int.test.ts；plugins/orchestration/orchestration-backend/test/full/ 真实k3d故障/排空` |
| R-orchestration-005.S1 原截止时间与独立主题 | TC-CF-005 | T015、T022 | `plugins/orchestration/orchestration-backend/src/application/gates/gates.int.test.ts；plugins/orchestration/orchestration-backend/test/full/ 真实k3d故障/排空` |
| R-orchestration-006.S1 不合格计划全部拦截 | TC-CF-006 | T012 | `plugins/orchestration/orchestration-backend/src/application/plans/validation/validation.test.ts` |
| R-orchestration-007.S1 随机计划验证一致性 | TC-CF-007 | T012、T014 | `plugins/orchestration/orchestration-backend/src/application/plans/validation/properties.int.test.ts` |
| R-orchestration-008.S1 命中复用与结构变化 | TC-CF-008 | T014 | `plugins/orchestration/orchestration-backend/src/application/plans/cache.int.test.ts` |
| R-orchestration-009.S1 超过默认上限 | TC-CF-009 | T014 | `plugins/orchestration/orchestration-backend/src/application/plans/versions.int.test.ts` |
| R-orchestration-010.S1 确认是规划可信边界 | TC-CF-010 | T014、T016 | `plugins/orchestration/orchestration-backend/src/application/interpreter/trusted-inputs.int.test.ts` |
| R-orchestration-011.S1 相同文字不同授权 | TC-CF-011 | T014 | `plugins/orchestration/orchestration-backend/src/application/plans/instructions.int.test.ts` |
| R-orchestration-012.S1 步骤结束后的消息不丢失 | TC-CF-012 | T015 | `plugins/orchestration/orchestration-backend/src/application/messages/messages.int.test.ts` |
| R-orchestration-013.S1 计划形状字段被剥离 | TC-CF-013 | T011 | `plugins/orchestration/orchestration-backend/src/application/agents/invoker.int.test.ts` |
| R-orchestration-014.S1 同内容不同标签 | TC-CF-014 | T010 | `plugins/orchestration/orchestration-backend/src/application/data/refs.int.test.ts` |
| R-orchestration-015.S1 混合输入不提升可信度 | TC-CF-015 | T010 | `plugins/orchestration/orchestration-backend/src/application/data/trust.int.test.ts` |
| R-orchestration-016.S1 内容排除只阻止违规动作 | TC-CF-016 | T010 | `plugins/orchestration/orchestration-backend/src/application/data/outbound.int.test.ts` |
| R-orchestration-017.S1 工作排满仍受理消息 | TC-CF-017 | T013、T015、T022 | `plugins/orchestration/orchestration-backend/src/infrastructure/runtime/queue.int.test.ts；plugins/orchestration/orchestration-backend/test/full/ 真实k3d故障/排空` |
| R-orchestration-018.S1 回放结果与原执行一致 | TC-CF-018 | T019 | `plugins/orchestration/orchestration-backend/src/application/replay/replay.int.test.ts` |
| R-orchestration-019.S1 逐项验证登记资格 | TC-CF-019 | T011、T019 | `plugins/orchestration/orchestration-backend/src/application/steps/determinism.test.ts` |
| R-orchestration-020.S1 排空发布并升级步骤实现 | TC-CF-020 | T019、T022 | `plugins/orchestration/orchestration-backend/src/application/versioning/drain.int.test.ts；plugins/orchestration/orchestration-backend/test/full/ 真实k3d故障/排空` |
| R-platform-017.S1 单仓的两份文件通过 schema | TC-PLATFORM-051 | T002 | `tools/scripts/src/repo-config.test.ts` |
| R-platform-017.S2 未知字段与错误版本被拒绝 | TC-PLATFORM-052 | T002 | `tools/scripts/src/repo-config.test.ts` |
| R-platform-017.S3 本地覆盖文件不进仓库 | TC-PLATFORM-053 | T002 | `tools/scripts/src/repo-config.test.ts` |
| R-platform-017.S4 评审声明与工具入口一致 | TC-SF5-PLATFORM-001 | T002 | `apps/fasrun-dev-cli/src/config.test.ts（同时spec-common schema单测）` |
| R-spec-005.S1 大工作逐层推进 | TC-SF5-SPEC-001 | T016、T017 | `plugins/spec/spec-backend/src/application/spec-flow.int.test.ts` |
| R-spec-005.S2 小改动与终点 | TC-SF5-SPEC-002 | T016 | `plugins/spec/spec-backend/src/application/spec-flow.int.test.ts` |
| R-spec-005.S3 工单变化回到受影响阶段 | TC-SF5-SPEC-003 | T016 | `plugins/spec/spec-backend/src/application/spec-flow.int.test.ts` |
| R-spec-006.S1 缺项阻止提交 | TC-SF5-SPEC-004 | T016 | `plugins/spec/spec-backend/src/application/spec-flow.int.test.ts` |
| R-spec-006.S2 无效规格与有效修订 | TC-SF5-SPEC-005 | T016 | `plugins/spec/spec-backend/src/application/spec-flow.int.test.ts` |
| R-spec-007.S1 领域确认不可遗漏 | TC-SF5-SPEC-006 | T017 | `plugins/spec/spec-backend/src/application/reviews/reviews.int.test.ts` |
| R-spec-007.S2 确认只对应当前版本 | TC-SF5-SPEC-007 | T017 | `plugins/spec/spec-backend/src/application/reviews/reviews.int.test.ts` |
| R-spec-008.S1 固定提交与拒绝放宽 | TC-SF5-SPEC-008 | T007 | `plugins/knowledge/knowledge-backend/src/application/project-context.int.test.ts；plugins/spec/spec-common/src/archive-authorization/archive.test.ts` |
| R-spec-008.S2 归档的有限授权 | TC-SF5-SPEC-009 | T007 | `plugins/knowledge/knowledge-backend/src/application/project-context.int.test.ts；plugins/spec/spec-common/src/archive-authorization/archive.test.ts` |
| R-spec-009.S1 工单到规格确认可追溯 | TC-SF5-SPEC-010 | T024 | `deploy/validation/sf5/（真实对象证据写evidence/）` |
| R-spec-009.S2 重试不会重复创建 | TC-SF5-SPEC-011 | T009、T017 | `plugins/spec/spec-backend/src/application/reviews/reviews.int.test.ts` |
| R-spec-010.S1 更换实现不改变控制平面规则 | TC-SF5-SPEC-012 | T011、T024 | `plugins/orchestration/orchestration-backend/src/application/agents/invoker.int.test.ts` |
| R-spec-010.S2 桩不能成为绕过检查的路径 | TC-SF5-SPEC-013 | T011 | `plugins/orchestration/orchestration-backend/src/application/agents/invoker.int.test.ts` |

## 完整集与阶段证据的完成条件

- TC-CF-001/002/004/005/017/020最终完成必须有T022真实k3d证据；T013/T015/T019的局部测试不替代SIGKILL、原deadline跨重启、饱和队列五秒SLA及两个版本Deployment排空。其他TC在真实DBOS/Postgres适配/组合中验证，纯函数单元测试作为补充。
- TC-SF5-IDENTITY-001、TC-SF5-CONNECT-004、TC-SF5-SPEC-010/012必须在T024专用环境留真实身份/外部对象证据；agent桩版本与模拟部分单列，脚本准备好但未有人完成评审/合并时仍未验收。
- T021的TC-SF5-INTEGRATION-001/002分别覆盖工单到规格闭环组合、跨入口权限/策略/标签/审计负例；不取代上表所有单场景断言。T023的TC-SF5-CI-001检查快/全清单和CI实际执行证据；T025的TC-SF5-ARCHIVE-001检查验收齐全及实际archive结果，合入后main证据另补。
- TC-SF5-CONTRACT-001、FIXTURE-001、RUNTIME-001、ASSEMBLY-001、DATA-001、DEPLOY-001是服务契约/测试资源/运行时隔离/装配/seed/部署的辅助测试，各自对应tasks.md的需求和D条目，不扩展M1范围。

## 本层自检边界

机械工具验证编号、需求覆盖、依赖无环及路径；另核对75场景有稳定用例与任务、D-1–D-19均落地、每用例具全部场景断言、共享文件与运行资源归属明确、依赖能从无前置任务到达且全部收敛T025。已批准requirements/design及追溯来源文件逐字保留。本层没有执行任何新产品用例，不声称M1验收通过。
