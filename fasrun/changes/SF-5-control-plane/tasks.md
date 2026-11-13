# 任务：SF-5 M1 控制平面核心

初始提交背景：需求 #52 已合入 fbe9d6d、设计 #56 已合入 8014163 后，本任务层以 main `8014163082f113c62971a7c21807b8e9f16b72cf` 为基线提交；当时只提交规格，全部任务待实现。该背景不代表当前执行阶段。已批准的需求、设计及 #51 确认原文不修改。

当前执行阶段（2026-11-13 合入对账）：任务层 [#57](https://github.com/fasrun/fasrun/pull/57) 已合入 f542ebd，zjh1978 对任务提交 1e5284f 的 [APPROVED](https://github.com/fasrun/fasrun/pull/57#pullrequestreview-5875098938) 已核验，实施阶段已开始。main 已同步 3453904；T001–T005 已实际合入，T005 集成异常修复 #66 已合入 035e0b0，主干 CI 43349185810 成功。最小范围修订 #69 已合入 b986b1a，实际队列 43351132421 与主干 43351588795 均成功，T006/T007 已按修订后的范围并行恢复。层状态同步于 meta.yaml，执行进度以本页及关联 PR 的实际合入事实对账，#50 为工作入口。

| 任务 | 已核验的交付与当前状态 |
| --- | --- |
| T001 | [#60](https://github.com/fasrun/fasrun/pull/60) 已合入 bd0e91a；REBASE 队列 [43240001589](https://github.com/fasrun/fasrun/actions/runs/43240001589) 成功。主干 [43240659102](https://github.com/fasrun/fasrun/actions/runs/43240659102) 首轮 TC-PLATFORM-039 超时，第二次成功；保留首轮失败，不宣称根因已修复。 |
| T002 | [#58](https://github.com/fasrun/fasrun/pull/58) 已合入 9835a5f；队列 43229824791、主干 43230302298 成功。 |
| T003 | [#59](https://github.com/fasrun/fasrun/pull/59) 已合入 c2db62d；队列 43229954481、主干 43230402387 成功。 |
| T004 | [#61](https://github.com/fasrun/fasrun/pull/61) 已合入 49cfc3f；队列 43230306398、主干 43230808076 成功。 |
| T005 | [#62](https://github.com/fasrun/fasrun/pull/62) 已实际合入 2dbd35c。PR CI 43246732150 成功；首次 merge_group [43248084930](https://github.com/fasrun/fasrun/actions/runs/43248084930) 因 TC-PLATFORM-039 超时退队，同提交唯一一次对照重跑 attempt2 成功，超时根因未充分证明；后续实际队列 [43253272364](https://github.com/fasrun/fasrun/actions/runs/43253272364) 成功并合入。主干 [43253811493](https://github.com/fasrun/fasrun/actions/runs/43253811493) 的治理集成套件虽断言通过，仍因未处理 PostgreSQL 57P01 失败；清理竞态已真实 PG 复现；异常与错误输出脱敏修复 [#66](https://github.com/fasrun/fasrun/pull/66) 已合入 035e0b0，队列 43348850400、主干 43349185810 成功（65/65 任务、治理 24/24，无未处理 57P01）；修复依据包括真实 client end 屏障、脱敏与故障注入、移除屏障的 mutation 失败，主干成功是补充集成证据。原失败保留，TC-PLATFORM-039 的超时根因不据此视为修复。 |

T006/T007 的实际依赖与 #69 修订合入条件现均满足，各自独立工作树从已保存实现恢复并同步 main b986b1a，仍未交付、不勾选。进度维护 PR 不构成额外开工前置。T006 先前真实 Keycloak/PG 后端 29 项与迁移检查通过，标准入口 60/66 为六项 Colima 失败，替代全量 65/66 被 TC-PLATFORM-024 固定 M0 两份迁移的断言阻塞；[#68](https://github.com/fasrun/fasrun/issues/68) 对应的维护范围已由 #69 合入，现按完整受版本控制清单及重复执行不变要求补齐验证。T007 先前项目上下文部分保存为 fc9f46e，17 项组件测试与迁移检查拆分步骤通过；[#67](https://github.com/fasrun/fasrun/issues/67) 对应真实归档授权接缝现按 #69 已合入的 R-spec-008.S2/D-14/TC-SF5-SPEC-009 实施。旧组件测试不代表恢复后最终代码验收；#67/#68 均保留至对应代码交付对账，不能凭规格 CI 关闭。

当前代码评审入口：T006 [#72](https://github.com/fasrun/fasrun/pull/72) 已提交并请求 zjh1978，保持未完成。本地标准 60/66、原并发替代 66/66；首次 CI 43354009014 的 migration-check 暴露 identity schema 对尚未构建的 identity-common 产物依赖，已定位为本任务新增导入，本机既有 dist 掩盖了缺项；正在本任务范围内修复并验证干净产物状态，不归入 #17 或 SF-7，也不以本机成功替代 CI。T007 [#73](https://github.com/fasrun/fasrun/pull/73) 已提交并请求 zjh1978，保持未完成；标准受影响入口 16/19（3 个 Colima 容器任务失败），直接 Vitest 替代加非容器测试共 175 项通过，真实 migration-check 通过，当前 3bc6e60 的首轮 CI 43354406554 已 13/13 实际成功。两项均待当前代码人工评审、实际合入与集成核对；#67/#68 不因规格或本机测试通过关闭。

独立维护历史：#63 原提交 837d64e 的 PR CI 43251538786 成功，队列 43253437830 因 CLI dist 产物缺失失败；最终 #63 已合入 fc4d79f，队列 43348186654、主干 43348630001 成功。公共构建修复按 #17 独立维护为 SF-7 [#64](https://github.com/fasrun/fasrun/issues/64)，需求 [#65](https://github.com/fasrun/fasrun/pull/65) 已合入 d5f8dba5，设计 [#70](https://github.com/fasrun/fasrun/pull/70) 以 c4f3bb6 获人工批准并实际合入 c58122b，队列 43354144177 成功，PR CI 43350806479 attempt1 因 TC-PLATFORM-039 耗时 5166ms 超过 5000ms 失败；保存日志后同 HEAD 唯一一次对照重跑 attempt2 成功，13/13 检查通过。三次本机定向与一次受影响包并发对照通过，但无法定位具体子进程或运行环境耗时来源，不能宣称根因已修复；没有修改公共测试或门禁。SF-7 现按已合入需求/设计独立进入任务层，尚未实现；同批 #71 已合入 3453904，队列 43354208374 成功，主干 43354508410 的 test 因 CLI dist/index.mjs 缺失失败（CLI 10 失败/41 通过，全仓 64/65），这是 SF-7 已追踪的产物缺失表象，不是 TC-PLATFORM-039 超时；不从分组日志推断具体删除进程，保留失败继续独立维护。纯进度/设计 PR 均未夹带公共测试修复。#17 的 Colima/Turbo 环境限制与 CLI dist 产物缺失分别保留；TC-PLATFORM-039 超时、治理 57P01 与 CLI 缺失分别记录，后续成功不覆盖首次失败。

每任务独立分支 `feat/SF-5-T<nnn>-<简述>`、独立 PR，标题以 `SF-5 T<nnn>` 开头。依赖表示前置任务的 PR **已人工合入**，不能用本机完成、打开 PR 或仅获批准替代。`[P]` 表示依赖满足即可与其他就绪任务并行，不等编号前一项，也不等整批评审。下列范围是最大允许范围，具体交付边界见同页细则；不能借目录范围修改无关功能。

## 任务清单

- [x] T001 [P] 共享契约与带上下文的服务扩展点 — 对应 R-identity-002、R-connect-001、R-entry-001、R-spec-010、D-1、D-8、D-15、D-19；修改范围 packages/contracts-core/、packages/backend-plugin-api/、plugins/identity/identity-common/、plugins/identity/identity-node/、plugins/connect/connect-common/、plugins/connect/connect-node/、plugins/orchestration/orchestration-common/、plugins/orchestration/orchestration-node/、plugins/spec/spec-common/、plugins/spec/spec-node/、plugins/entry/entry-common/、plugins/entry/entry-node/、plugins/governance/governance-common/、plugins/governance/governance-node/、plugins/knowledge/knowledge-common/、plugins/knowledge/knowledge-node/、plugins/environment/environment-common/、plugins/environment/environment-node/、.changeset/、pnpm-lock.yaml、tsconfig.json；用例 TC-SF5-CONTRACT-001
- [x] T002 [P] 完整配置schema、模板与CLI检查一致性 — 对应 R-platform-017、R-spec-007、R-spec-008、D-14、D-19；修改范围 plugins/spec/spec-common/src/config/、plugins/spec/spec-common/src/index.ts、plugins/spec/spec-common/package.json、plugins/spec/spec-common/test/fixtures/config/、apps/fasrun-dev-cli/src/commands/check.ts、apps/fasrun-dev-cli/src/commands/init.ts、apps/fasrun-dev-cli/src/lib/init.ts、apps/fasrun-dev-cli/src/lib/spec.ts、apps/fasrun-dev-cli/src/lib/repo-config.ts、apps/fasrun-dev-cli/src/config.test.ts、apps/fasrun-dev-cli/src/spec.test.ts、packages/cli-templates/、tools/scripts/src/repo-config.ts、tools/scripts/src/repo-config.test.ts、tools/scripts/package.json、tools/scripts/tsconfig.json、fasrun/README.md、.changeset/、pnpm-lock.yaml；用例 TC-PLATFORM-051、TC-PLATFORM-052、TC-PLATFORM-053、TC-SF5-PLATFORM-001
- [x] T003 [P] 条件目录与确定性规则求值 — 对应 R-governance-001、R-identity-002、D-3；修改范围 plugins/governance/governance-common/、.changeset/、pnpm-lock.yaml；用例 TC-SF5-GOVERNANCE-001
- [x] T004 [P] 控制平面回归夹具与真实运行时测试资源 — 对应 R-orchestration-001、R-spec-010、R-connect-002、D-17、D-19；修改范围 packages/test-utils/、.changeset/、pnpm-lock.yaml、tsconfig.json；用例 TC-SF5-FIXTURE-001
- [x] T005 [P] 治理策略、事务事件端口与只追加审计 — 对应 R-governance-002、R-identity-004、D-4、D-6、D-16；修改范围 plugins/governance/governance-backend/、plugins/governance/governance-common/、plugins/governance/governance-node/、packages/backend-defaults/src/events/、packages/backend-defaults/src/index.ts、packages/backend-defaults/package.json、packages/backend-defaults/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-SF5-GOVERNANCE-002、TC-SF5-IDENTITY-012、TC-SF5-IDENTITY-013；依赖 T001、T003、T004
- [ ] T006 [P] Keycloak身份、权限矩阵与两层准入 — 对应 R-identity-001、R-identity-002、R-identity-003、R-platform-008（既有迁移回归维护）、D-2、D-3、D-16；修改范围 plugins/identity/identity-backend/、plugins/identity/identity-common/、plugins/identity/identity-node/、apps/fasrun-dev-cli/src/migrate.int.test.ts、.changeset/、pnpm-lock.yaml；用例 TC-SF5-IDENTITY-001、TC-SF5-IDENTITY-002、TC-SF5-IDENTITY-003、TC-SF5-IDENTITY-004、TC-SF5-IDENTITY-005、TC-SF5-IDENTITY-006、TC-SF5-IDENTITY-007、TC-SF5-IDENTITY-008、TC-SF5-IDENTITY-009、TC-SF5-IDENTITY-010、TC-SF5-IDENTITY-011、TC-PLATFORM-024；依赖 T001、T003、T004、T005
- [ ] T007 [P] 提交固定的项目上下文与最小流程目录 — 对应 R-spec-008、R-spec-007、R-governance-002、R-orchestration-010、D-7、D-14、D-16；修改范围 plugins/knowledge/knowledge-backend/、plugins/knowledge/knowledge-common/、plugins/knowledge/knowledge-node/、plugins/environment/environment-backend/、plugins/environment/environment-common/、plugins/environment/environment-node/、plugins/spec/spec-common/src/archive-authorization/、plugins/spec/spec-common/src/index.ts、apps/fasrun-dev-cli/src/lib/spec-archive.ts、apps/fasrun-dev-cli/src/lib/spec-archive.test.ts、apps/fasrun-dev-cli/README.md、.changeset/、pnpm-lock.yaml；用例 TC-SF5-SPEC-008、TC-SF5-SPEC-009；依赖 T001、T002、T003、T005
- [ ] T008 [P] CONNECT与CORE状态边界、凭据和持久收件箱 — 对应 R-connect-001、R-connect-002、D-1、D-4、D-5、D-6、D-16、D-18；修改范围 plugins/connect/connect-backend/、plugins/connect/connect-common/、plugins/connect/connect-node/、.changeset/、pnpm-lock.yaml；用例 TC-SF5-CONNECT-001、TC-SF5-CONNECT-002、TC-SF5-CONNECT-003、TC-SF5-CONNECT-005；依赖 T001、T004、T005、T006
- [ ] T009 [P] GitHub适配、对账补漏与可恢复外部动作 — 对应 R-connect-001、R-connect-002、R-connect-003、R-connect-004、R-spec-009、R-orchestration-002、D-5、D-6、D-13；修改范围 plugins/connect/connect-backend-module-github/、plugins/connect/connect-node/、plugins/connect/connect-backend/src/application/actions/、plugins/connect/connect-backend/src/infrastructure/actions/、plugins/connect/connect-backend/src/starter/、plugins/connect/connect-backend/src/index.ts、plugins/connect/connect-backend/package.json、plugins/connect/connect-backend/tsconfig.json、.changeset/、pnpm-lock.yaml、tsconfig.json；用例 TC-SF5-CONNECT-005、TC-SF5-CONNECT-006、TC-SF5-CONNECT-007、TC-SF5-CONNECT-008、TC-SF5-CONNECT-009、TC-SF5-CONNECT-010、TC-SF5-CONNECT-011、TC-SF5-CONNECT-012、TC-SF5-CONNECT-013、TC-SF5-SPEC-011、TC-CF-002；依赖 T008
- [ ] T010 [P] 不可变数据引用与可信度传播 — 对应 R-orchestration-014、R-orchestration-015、R-orchestration-016、R-entry-003、D-11、D-16；修改范围 plugins/orchestration/orchestration-backend/src/application/data/、plugins/orchestration/orchestration-backend/src/infrastructure/data/、plugins/orchestration/orchestration-backend/src/infrastructure/schema/、plugins/orchestration/orchestration-backend/migrations/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-common/、packages/backend-defaults/src/storage/、packages/backend-defaults/src/index.ts、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/tsconfig.json、packages/backend-defaults/package.json、packages/backend-defaults/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-CF-014、TC-CF-015、TC-CF-016、TC-SF5-ENTRY-008；依赖 T001、T004、T005、T006
- [ ] T011 [P] 可替换agent调用、步骤目录与确定性登记 — 对应 R-spec-010、R-orchestration-013、R-orchestration-019、D-8、D-12、D-16；修改范围 plugins/orchestration/orchestration-backend/src/application/agents/、plugins/orchestration/orchestration-backend/src/application/steps/、plugins/orchestration/orchestration-backend/src/infrastructure/agents/、plugins/orchestration/orchestration-backend/src/infrastructure/schema/、plugins/orchestration/orchestration-backend/migrations/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-common/、plugins/orchestration/orchestration-node/、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-SF5-SPEC-012、TC-SF5-SPEC-013、TC-CF-013、TC-CF-019；依赖 T001、T004、T005、T010
- [ ] T012 [P] 计划五项校验与属性测试 — 对应 R-orchestration-006、R-orchestration-007、R-governance-002、D-9、D-19；修改范围 plugins/orchestration/orchestration-backend/src/application/plans/validation/、plugins/orchestration/orchestration-common/src/plans/、plugins/orchestration/orchestration-common/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-CF-006、TC-CF-007；依赖 T003、T007、T011
- [ ] T013 [P] 真实DBOS运行时与工作持久化 — 对应 R-orchestration-001、R-orchestration-003、R-orchestration-017、R-entry-002、D-6、D-10、D-16、D-19；修改范围 plugins/orchestration/orchestration-backend/src/application/runtime/、plugins/orchestration/orchestration-backend/src/infrastructure/runtime/、plugins/orchestration/orchestration-backend/src/infrastructure/work/、plugins/orchestration/orchestration-backend/src/infrastructure/schema/、plugins/orchestration/orchestration-backend/migrations/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-CF-001、TC-CF-017、TC-SF5-RUNTIME-001；依赖 T001、T004、T005、T006、T010、T011
- [ ] T014 [P] 计划解释、缓存与有界重规划 — 对应 R-orchestration-003、R-orchestration-007、R-orchestration-008、R-orchestration-009、R-orchestration-010、R-orchestration-011、D-7、D-9、D-10；修改范围 plugins/orchestration/orchestration-backend/src/application/plans/、plugins/orchestration/orchestration-backend/src/application/interpreter/、plugins/orchestration/orchestration-backend/src/infrastructure/plans/、plugins/orchestration/orchestration-backend/src/infrastructure/schema/、plugins/orchestration/orchestration-backend/migrations/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-CF-003、TC-CF-007、TC-CF-008、TC-CF-009、TC-CF-010、TC-CF-011；依赖 T012、T013
- [ ] T015 [P] 持久关卡、消息交接与控制指令 — 对应 R-orchestration-004、R-orchestration-005、R-orchestration-012、R-orchestration-017、R-entry-004、D-7、D-10、D-11、D-15；修改范围 plugins/orchestration/orchestration-backend/src/application/gates/、plugins/orchestration/orchestration-backend/src/application/messages/、plugins/orchestration/orchestration-backend/src/application/control/、plugins/orchestration/orchestration-backend/src/infrastructure/gates/、plugins/orchestration/orchestration-backend/src/infrastructure/messages/、plugins/orchestration/orchestration-backend/src/infrastructure/schema/、plugins/orchestration/orchestration-backend/migrations/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-CF-004、TC-CF-005、TC-CF-012、TC-CF-017、TC-SF5-ENTRY-009、TC-SF5-ENTRY-010；依赖 T006、T010、T013
- [ ] T016 [P] 澄清、自检与规格前段状态机 — 对应 R-spec-005、R-spec-006、R-spec-009、R-orchestration-010、D-7、D-8、D-13、D-16；修改范围 plugins/spec/spec-backend/、plugins/spec/spec-common/、plugins/spec/spec-node/、plugins/orchestration/orchestration-backend/src/application/spec-flow/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-SF5-SPEC-001、TC-SF5-SPEC-002、TC-SF5-SPEC-003、TC-SF5-SPEC-004、TC-SF5-SPEC-005、TC-CF-010；依赖 T002、T006、T007、T009、T011、T014、T015
- [ ] T017 [P] 规格PR发布与当前版本独立确认 — 对应 R-spec-005、R-spec-007、R-spec-009、R-connect-004、D-6、D-13、D-14；修改范围 plugins/spec/spec-backend/src/application/reviews/、plugins/spec/spec-backend/src/application/submission/、plugins/spec/spec-backend/src/infrastructure/reviews/、plugins/spec/spec-backend/src/infrastructure/schema/、plugins/spec/spec-backend/migrations/、plugins/spec/spec-backend/src/starter/、plugins/spec/spec-common/、plugins/connect/connect-backend-module-github/src/、plugins/spec/spec-backend/src/index.ts、plugins/spec/spec-backend/package.json、plugins/spec/spec-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-SF5-SPEC-001、TC-SF5-SPEC-006、TC-SF5-SPEC-007、TC-SF5-SPEC-011、TC-SF5-CONNECT-011、TC-SF5-CONNECT-012、TC-SF5-CONNECT-013；依赖 T016
- [ ] T018 [P] HTTP/MCP同源接口与SSE — 对应 R-entry-001、R-entry-002、R-entry-003、R-entry-004、R-identity-002、D-2、D-11、D-15、D-19；修改范围 plugins/entry/entry-backend/、plugins/entry/entry-common/、plugins/entry/entry-node/、packages/contracts-core/、packages/backend-defaults/src/http/、packages/backend-defaults/src/services.ts、packages/backend-defaults/src/backend.ts、packages/backend-defaults/src/backend.test.ts、packages/backend-defaults/src/index.ts、apps/fasrun-dev-cli/src/errors.ts、apps/fasrun-dev-cli/src/errors.test.ts、docs/api/、packages/backend-defaults/package.json、packages/backend-defaults/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-SF5-ENTRY-001、TC-SF5-ENTRY-002、TC-SF5-ENTRY-003、TC-SF5-ENTRY-004、TC-SF5-ENTRY-005、TC-SF5-ENTRY-006、TC-SF5-ENTRY-007、TC-SF5-ENTRY-008、TC-SF5-ENTRY-009、TC-SF5-ENTRY-010；依赖 T006、T008、T010、T014、T015、T016
- [ ] T019 [P] 无副作用回放与版本保留 — 对应 R-orchestration-018、R-orchestration-019、R-orchestration-020、D-8、D-12；修改范围 plugins/orchestration/orchestration-backend/src/application/replay/、plugins/orchestration/orchestration-backend/src/application/versioning/、plugins/orchestration/orchestration-backend/src/infrastructure/runtime/、plugins/orchestration/orchestration-backend/src/starter/、plugins/orchestration/orchestration-backend/src/index.ts、plugins/orchestration/orchestration-backend/package.json、plugins/orchestration/orchestration-backend/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-CF-018、TC-CF-019、TC-CF-020；依赖 T014、T015
- [ ] T020 CORE/CONNECT真实服务装配与最小数据接入 — 对应 R-identity-001、R-connect-001、R-entry-001、R-spec-009、D-1、D-16、D-18、D-19；修改范围 apps/fasrun-core-svc/、apps/fasrun-connect-svc/、packages/backend-defaults/src/services.ts、packages/backend-defaults/src/backend.ts、packages/backend-defaults/src/run.ts、packages/backend-defaults/src/backend.test.ts、apps/fasrun-node-svc/src/http.ts、apps/fasrun-node-svc/src/host.test.ts、apps/fasrun-node-svc/package.json、apps/fasrun-portal-web/src/http.ts、apps/fasrun-portal-web/src/host.test.ts、apps/fasrun-portal-web/package.json、packages/test-utils/src/datasets/xinghe/、apps/fasrun-dev-cli/src/commands/seed.ts、apps/fasrun-dev-cli/src/seed.int.test.ts、packages/backend-defaults/src/index.ts、packages/backend-defaults/package.json、packages/backend-defaults/tsconfig.json、.changeset/、pnpm-lock.yaml；用例 TC-SF5-ASSEMBLY-001、TC-SF5-DATA-001；依赖 T005、T006、T007、T008、T009、T010、T011、T014、T015、T016、T017、T018、T019
- [ ] T021 [P] M1自动闭环、跨入口安全与快速集 — 对应 R-spec-009、R-spec-010、R-connect-001、R-identity-001、R-governance-002、R-entry-001、R-entry-002、R-entry-003、R-entry-004、D-17；修改范围 apps/fasrun-core-svc/src/control-plane.int.test.ts、apps/fasrun-connect-svc/src/control-plane.int.test.ts、packages/test-utils/src/control-plane/、docs/testing/sf5/、.changeset/、pnpm-lock.yaml；用例 TC-SF5-INTEGRATION-001、TC-SF5-INTEGRATION-002；依赖 T020
- [ ] T022 [P] 部署、故障恢复与真实排空完整集 — 对应 R-orchestration-001、R-orchestration-002、R-orchestration-004、R-orchestration-005、R-orchestration-017、R-orchestration-020、R-identity-001、R-connect-001、D-10、D-12、D-17、D-18；修改范围 deploy/helm/、deploy/k3d/、deploy/docker/、plugins/orchestration/orchestration-backend/test/full/、docs/testing/sf5/、.changeset/、pnpm-lock.yaml；用例 TC-CF-001、TC-CF-002、TC-CF-004、TC-CF-005、TC-CF-017、TC-CF-020、TC-SF5-DEPLOY-001；依赖 T020
- [ ] T023 [P] 快速/完整回归CI接入与质量门槛 — 对应 R-orchestration-001、R-orchestration-007、R-orchestration-020、R-platform-017、R-spec-009、D-17、D-19；修改范围 .github/workflows/ci.yml、.github/workflows/nightly.yml、tools/scripts/src/ci-workflows.test.ts、tools/scripts/src/control-plane-checks.test.ts、tools/scripts/src/control-plane-checks.ts、Fasfile、.changeset/、pnpm-lock.yaml；用例 TC-SF5-CI-001；依赖 T021、T022
- [ ] T024 [P] 专用环境真实接入与阶段验收 — 对应 R-identity-001、R-connect-001、R-spec-009、R-spec-010、D-17、D-18；修改范围 deploy/validation/sf5/、docs/testing/sf5/、fasrun/changes/SF-5-control-plane/evidence/、.changeset/、pnpm-lock.yaml；用例 TC-SF5-IDENTITY-001、TC-SF5-CONNECT-004、TC-SF5-SPEC-010、TC-SF5-SPEC-012、TC-SF5-ACCEPTANCE-001；依赖 T021、T022
- [ ] T025 M1对账、SF-5归档与合入后集成回写 — 对应 R-spec-005、R-spec-009、R-platform-017、D-17；修改范围 fasrun/、docs/testing/sf5/；用例 TC-SF5-ARCHIVE-001；依赖 T023、T024

## 交付与测试细则

### T001 共享契约与带上下文的服务扩展点

发布ActorContext/授权、错误及引用标签、AgentCall/Result、Planner/DurableRuntime、各领域用例与claim/ack端口；新增必要node包及目录登记接口。明确服务scope与插件schema归属；保留authenticate兼容包装，禁止无上下文read用于受保护数据。只实现契约/端口，不以mock当产品实现。

完成断言：契约序列化、错误/未知字段、版本拒绝及依赖方向；core接口不引入backend，跨插件不暴露数据库行；无ActorContext的受保护读取不能通过。

### T002 完整配置schema、模板与CLI检查一致性

完整Zod schema迁入spec-common；init模板、CLI check与现有repo-config检查共用，保留所有现行Fasfile字段并增加review_rules/prior_confirmations。形状与路径合法性在本任务，成员存在及只收紧语义由T007完成。不得把未批准的新字段直接填入本仓Fasfile。

完成断言：现行根配置、嵌套未知字段/类型/版本、受限glob与越界路径、声明必填项、init后检查和CLI JSON一致；保留051–053原场景，不重编号；不改Turbo或CLI构建调度。

### T003 条件目录与确定性规则求值

实现单根must/should/must_not、深度五层及2.17有类型条件目录；返回字段路径和可解释结果，明确空组合语义。存储和使用前复用同一检查器。

完成断言：全部目录项和布尔组合、空组合、第五/第六层边界、未知参数/多根/文本注入拒绝；求值无IO/时间隐式依赖，分支覆盖≥90%。

### T004 控制平面回归夹具与真实运行时测试资源

在现有test-utils增加隔离GitHub适配器、两种版本化agent桩、可注入故障点、时钟/稳定ID与真实Postgres/DBOS测试资源管理接口；依赖版本按D-19核验。只暴露可复用测试资源，不把DBOS模拟器替代真实运行时。

完成断言：重复/乱序/429/外部成功响应丢失、非法agent字段可确定复现；资源独立命名、并发隔离与清理只限本测试拥有资源；复用星河数据，不改原型字段语义、不预建未来业务表。

### T005 治理策略、事务事件端口与只追加审计

持久化policy_version/budget_constraint/audit_event/chain_checkpoint，提供有效策略和审计端口。抽象各插件自身outbox/consumer_receipt的转发协议，平台只调用登记claim/ack，不跨schema扫描。链头外部保留、追加触发器、敏感访问先记意图及遮蔽。

完成断言：真实PG非owner/RLS、幂等消费、事务回滚、租约超时/丢NOTIFY仍可投递；审计篡改/删除/尾截断与独立链头比较；敏感读取审计失败不得返回数据；约束跨入口一致在T021再验证。

### T006 Keycloak身份、权限矩阵与两层准入

实现OIDC/PKCE/JWKS与会话、外部不可变ID账号关联、全部14角色/权限点、职责分离、来源/请求强度及候选模式、只追加authorization_record与独立revocation。新增D-16 identity实体及版本化基础数据，保留organization与组织定制。

完成断言：真实Keycloak集成认证、issuer/audience/exp/算法/state/nonce/CSRF/停用拒绝；矩阵/动态条件/跨租户、agent不能批准；重复intake只一授权，显式撤销立即拒绝，规则变化不自动撤销；专用账号真实端到端另由T024取证。

TC-PLATFORM-024维护范围仅为apps/fasrun-dev-cli/src/migrate.int.test.ts：用独立于待测迁移发现函数的当前受版本控制identity迁移文件排序清单，与真实CLI报告精确比较，既有M0两份迁移必须保留；验证无漏项、无重复及顺序一致。重复执行无待执行迁移，迁移记录与表结构不变；保留九插件注册、真实PG、业务角色权限及两张迁移执行器内部表保护断言，以遗漏/重复清单反例或mutation证明精确断言有效。只维护既有R-platform-008.S1回归，不修改迁移需求、产品实现、历史迁移、构建或门禁。

### T007 提交固定的项目上下文与最小流程目录

按repo/baseCommit固定配置缓存、流程与模板、组织规范；environment仅模板版本与允许能力快照。规则成员语义经identity端口解析（独立测试使用契约桩）；执行交集/并集/覆盖下限收紧检查。限定ArchiveOperation为M0计算的动作清单，接入CLI真实归档执行器并复用原冲突预检与回滚，不改历史归档；README仅补归档入口及能力边界说明。

完成断言：A/B提交旧新工作分别绑定；无Fasfile仍受组织限制、未知成员/不同比较约束拒绝。TC-SF5-SPEC-009经真实执行路径验证：受保护历史普通写拒绝；有效授权只执行绑定仓库/规格根、变更、日期、输入快照、目标和完整内容的既定动作；同路径额外/替换内容、附属文件变化、增删动作、换源/目标、旧快照、缺失/无效/撤销授权均在写入前拒绝且完整文件树不变，无临时残留。M1失败不得回落人工入口，不接受系统actor或布尔标记豁免；真实M1程序调用只能选择受控入口，原人工命令不进入agent允许命令/执行端口。合法操作通过现有writer完成，冲突、符号链接、目标已存在和注入写入/rename失败分别验证无写或原有回滚恢复。保留M0原参数/退出码/JSON及TC-SPEC-013/014回归。独占访问为调用方前置，不把测试通过宣称为跨进程锁、并发编辑或崩溃恢复保证；不新增M1归档业务流程，终点仍为规格PR确认。

### T008 CONNECT与CORE状态边界、凭据和持久收件箱

提供core-state/gateway两种装配；持久接入/仓库归属/外部对象/inbox/cursor/action/密文表由CORE专属仓储维护，网关无Fasrun数据库依赖。内部mTLS身份认证、权限再判定、主密钥外置AES-GCM与轮换；持久ACK端口及事务outbox/去重。

完成断言：各模式启动依赖、错误证书/身份/权限拒绝、跨schema/RLS拒绝；有效签名验证结果与安装归属受理，数据库失败不ACK；数据库/日志无明文及主密钥，新旧密钥轮换；宿主实际装配由T020验收。

### T009 GitHub适配、对账补漏与可恢复外部动作

新GitHub模块实现原始字节HMAC、15分钟分页/重叠水位对账、稳定合成事件、真实当前对象重读；外部账号只按不可变ID关联。动作登记先于发送、稳定标记/分支查询兜底、unknown不盲重发；同步当前head/review/撤销/合并事实，不批准或合并。

完成断言：模拟远端有效/无效签名，未完成分页不推进水位，仅轮询链路；重复乱序至多一工作/确认，429/403/超时真实状态；成功后本地提交前故障重试查询同一评论/PR；CF002真实SIGKILL组合由T022执行。

### T010 不可变数据引用与可信度传播

实现data_object、FileStorage内容地址PV端口、原子写入后索引、按插件解析器读取。版本hash同时含内容/标签；当前权限/撤销/范围检查、访问审计、任一不可信输入传播，人工确认生成新引用，出站排除拒绝。

完成断言：同内容异标签版本不同、不可变UPDATE/DELETE拒绝、孤儿/缺文件不成功、跨租户/撤销拒绝；拒绝发送分支不阻断独立分支，人工确认不改原标签；HTTP/MCP序列化由T018/T021补组合验证。

### T011 可替换agent调用、步骤目录与确定性登记

持久agent_call和版本化步骤目录；invoke/getResult/cancel幂等，过期尝试CAS拒绝。两种受控fixture实现仅测试/专用环境显式选择，未配置真实实现不得冒充自动起草；未声明控制字段剥离审计，replan仅布尔请求。登记系统步骤前必须有确定性证据。

完成断言：切换实现不改工作流程、失败/超时/取消/迟到回包；同callId重试只一结果，schema非法/批准文本不推进；枚举全部登记系统步骤同输入两次一致，后续插件新步骤也受同一门禁。

### T012 计划五项校验与属性测试

与解释器共享声明式schema/目录，依次结构祖先及类型、权限数据范围、预算、任务双向覆盖、关卡时限校验；提供稳定错误字段路径。引入符合D-19的fast-check；不允许可执行表达式或无界循环。

完成断言：五类反例加非祖先输入和无deadline全部零步骤；随机合法/非法计划、反例收缩和固定seed可重现。解释器组合性质在T014运行同组TC，不能只对校验器自身做镜像测试。

### T013 真实DBOS运行时与工作持久化

实现DurableRuntime的真实DBOS适配、work/step_run/request_dedup、幂等业务提交与运行时检查点接缝；work编排不限队列，步骤受限、消息独立队列。DBOS独立schema/凭据，app无系统载荷权限；不扩大迁移内部表豁免。

完成断言：真实PG/DBOS启动/恢复与角色隔离；已提交业务结果检查点重试不重复；工作满载消息容量独立。真实杀进程和五秒SLA完整用例T022负责，当前任务必须提交相应用例的适配/恢复断言及故障入口。

### T014 计划解释、缓存与有界重规划

实现持久plan_version、解释执行与定义哈希；未变且上游未跑沿用结果/原键，依赖变化下游重跑。缓存按租户/项目及结构键，忽略措辞/步骤ID，命中仍校验当前权限预算；CAS计数默认三次，初始再生成也计数，超限needs_human。

完成断言：属性校验接受域与真实解释器一致，拒绝零执行；同构重命名命中、结构变化未命中、跨租户隔离；并发replan不超限；确认前规划零调用，可信指令边界生效/普通同文不改版本，执行段只受控桩验证。

### T015 持久关卡、消息交接与控制指令

持久gate_instance/message/receipt；主题及实例路由、原deadline、提醒升级幂等，批准/超时CAS。晚到转next-agent或触发人待处理，暂停/取消在边界生效，恢复重验授权；不自动同意或跳过关卡。

完成断言：真实运行时等待不占步骤队列、重启不重置deadline、错主题/旧实例不消费当前批准；晚到两分支、重复消息一次处理、取消/到期/评审竞态；满载五秒SLA与SIGKILL在T022组合。

### T016 澄清、自检与规格前段状态机

实现规格层/检查/澄清持久实体，登记澄清及各层起草schema/系统步骤；人工版本化小改动与三层流程，pin提交/模板，实际使用现有validate/check逻辑和可判定性检查。关卡事件由契约输入，本任务不得自行伪造外部确认。

完成断言：未解具体问题带选项推荐，超时不算同意；格式/引用/不可判定THEN不提交；小改动不造空层、较大逐层确认且merge；工单修改回退/取消/结束后bot不唤醒，终点spec_confirmed不派发M2。

### T017 规格PR发布与当前版本独立确认

经GitHub API固定文本清单/确定分支发布独立层PR，未知结果先查询，手改/基线冲突拒绝覆盖；持久review_fact/layer_confirmation。当前head成员权限/职责分离/领域确认齐全且合并才解锁后层，unknown领域解析阻塞，不给agent批准/合并端点。

完成断言：PR创建后本地记录前中断恢复同一PR；正常独立评审/领域缺项/旧head/撤销/请求修改/关闭未合并/乱序；bot评论声称批准无效，手改不覆盖；外部真实对象证据由T024补齐。

### T018 HTTP/MCP同源接口与SSE

汇总插件common的HTTP/MCP声明，OpenAPI3.1/TS客户端/错误目录同源生成；MCP无状态可流式HTTP/OAuth，保留来源与标签。提供工作/澄清/规格查询/控制/引用等D-15入口，幂等键、ETag、稳定游标和持久SSE。共用请求ID/日志脱敏，CLI原错误信封/退出码兼容。

完成断言：枚举每路由/工具权限、同合法/非法输入结果等价；双副本轮转、重复触发一次、409/412、分页无重复越权；SSE断点补发和撤销断开；敏感错误不泄漏、客户端正文不能冒充主体。

### T019 无副作用回放与版本保留

实现固定解释器/步骤版本回放、系统重算/agent录制输出、上游输出重组与replay动作抑制；版本路由/停止新work/等待inflight清零端口，旧工作所引步骤不可删除。部署操作由T022实现。

完成断言：记录与回放业务输出相同、外部效果计数零；系统步骤确定性枚举、旧步骤保留/新work选择新版本；普通滚动终止旧等待工作不得冒充排空测试。

### T020 CORE/CONNECT真实服务装配与最小数据接入

宿主组合根登记各服务、跨插件outbox和GitHub模块；CONNECT无DB，CORE连接正确schema及DBOS角色，明确stub启用并阻止错误生产声明。将既有星河成员/团队/角色及必要对象映射到本轮真实实体，保留seed非生产边界；不得建M2/M3表。

完成断言：全部插件启停就绪、缺配置失败、mTLS实际双向连接、schema访问主体正确；身份/审计/引用无依赖循环；四宿主共用请求日志/健康路由的兼容回归（NODE/PORTAL仅替换http薄封装，不增加身份或业务能力）；真实migrate/base-data/seed二次不变，organization存量不破坏，原脚手架金标准和宿主注册回归保持。

### T021 M1自动闭环、跨入口安全与快速集

组合真实CORE/CONNECT/PG/DBOS与测试Keycloak，外部GitHub和agent用隔离桩，验证工单至小改动/三层确认全部组合。汇总快速集清单和受影响包覆盖率；各场景详细TC按task-trace复用，不重编号。

完成断言：一次澄清、无权/旧head/领域确认、仅轮询、重复/乱序与未知PR效果、跨租户/撤销/标签/审计端到端；每个HTTP/MCP声明都有正负例，应用行≥80%、校验/条件/权限/可信度分支≥90%；快速集目标五分钟，超标记录不得删用例。

### T022 部署、故障恢复与真实排空完整集

启用Keycloak独立DB、CORE/CONNECT mTLS、DBOS独立角色初始化、内容PV及资源限制；迁移成功且DBOS初始化通过才接流量。两个Deployment真实版本路由/排空旧工作，完整集在k3d执行含SIGKILL的故障点，回滚不删PV或倒退DB。

完成断言：重启从中断处恢复、完成步骤不重跑；外部成功检查点前杀进程只一效果；关卡重启不重置deadline/不占队列；满载消息五秒内受理；旧解释器/步骤等待完成前不下线，新work新版本，初始化失败旧服务就绪；本机仅127.0.0.1。

### T023 快速/完整回归CI接入与质量门槛

把已实现快速集接入PR/merge_group/main，完整集进入每日/手动k3d；保存commit/组件版本/每项TC及覆盖率制品，秘密不进入fork普通CI。保留所有既有检查；Fasfile只同步实际新增检查名称及门槛，不借此改产品约束。

完成断言：工作流静态测试+实际PR和完整集运行，不以配置存在冒称schedule已运行；TC-CF二十项跨快/全无遗漏。涉及.github由PontusAI放行，跑通后回传检查名称/merge_group结果供保护规则接入，agent不改保护规则；不夹带#17 Turbo/CLI构建修复。

### T024 专用环境真实接入与阶段验收

提供专用验证脚本/操作清单并实际执行真实Keycloak、GitHub、CORE/CONNECT闭环；只操作授权realm/安装/仓库及本轮对象清单。澄清/起草显式stub，记录commit/契约/fixture版本、真实及模拟组件清单。证据随独立任务PR提交，不把待人工动作算完成。

完成断言：真实登录及token拒绝；真实工单读取/写回/PR/当前评审/合并/对账；三层与小改动、一次澄清、无权拒绝、新head旧确认失效。批准/合并由有权限的人执行，agent只请求并记录；缺环境/人工证据时保持未完成但不阻塞无依赖任务。

### T025 M1对账、SF-5归档与合入后集成回写

对照整体方案/已批准需求设计/全部任务及实际测试证据验收；使用已交付fasrun spec archive归档SF-5并合并增量，不手工替代工具、不改SF-1/SF-6历史。汇总#17属于M1事项的实际交付，保留未解决限制，归档PR请求PontusAI/zjh1978按分工评审。

完成断言：所有任务有已合入PR及场景证据，真实接入与模拟回归分列、TC-CF001–020无跳过；validate/check通过，归档无无关需求变化。归档合入后核对main/队列集成再回传最终验收，工单关闭不早于此；不进入M2。

## 并行、共享文件与迁移协调

- 首批 T001/T002/T003/T004 无任务依赖，可并行。T001 仅编辑 spec-common 根导出和契约，T002 在 `src/config/` 实现，T003 在 governance-common 实现条件求值；共用 `src/index.ts`、package.json 的登记由后落地者在最新main上合并检查，不另设等待整批的门槛。
- T005 合入后 T006 身份与 T007 配置上下文并行；T006 后可继续 T008 接入与 T010 引用。T008→T009 和 T010→T011 两条链独立；T011后 T012 校验与 T013 运行时并行，T013后 T015 关卡/消息可与T014解释器并行。T014/T015后 T019 回放可与满足前置的T016规格流程并行；T016后 T017确认与T018接口可并行。只有T020装配等待所列领域实现齐备，避免在各任务间用未合入后端代码作隐藏依赖。
- T020后 T021快速集与T022部署完整集独立；两者交付后 T023 CI 与T024真实接入验收并行。真实评审/合并或环境准备等待只阻塞T024及其下游，不阻塞T023。T025必须等待两条证据链都交付，不能用规格归档替代真实验收。
- 执行默认最多三个实现工作区并行，按实际资源调整；每任务隔离工作树。Colima容器全量及k3d故障/发布演练串行占用，纯函数/静态检查可并行。同一工作树内build和typecheck分开，避免产物清理干扰；此资源安排不改变CI或构建实现。
- `pnpm-lock.yaml` 仅允许本任务范围包的依赖变化，新增依赖核验官方来源、确切版本、许可、发布时间≥7天和allowBuilds；不授权根package.json任意改脚本。`.changeset/` 只添加本任务包变化说明；`tsconfig.json` 只登记T001/T004/T009需要的包引用。新node/module包沿用脚手架、许可证和依赖方向纪律。后落地任务重新生成锁文件并检查实际diff，禁止覆盖其他任务依赖。
- T010/T011/T013/T014/T015的orchestration后端分别拥有data、agents/steps、runtime/work、plans/interpreter、gates/messages/control子目录。共同schema/index、starter/plugin和package.json只作本任务登记；迁移与Drizzle快照以最新已合入序列为基准生成，后落地者重排**未合入的新迁移**并补联合迁移测试，绝不改已应用迁移。不同任务不预留虚假的已应用版本，不靠跳过migration-check解决冲突。T019扩展运行时须在T013/T014/T015合入后实施。
- 各实体的迁移、RLS、COMMENT、基础数据/只追加触发器测试随所属任务同PR：governance T005，identity T006，knowledge/environment T007，connect T008，orchestration分属T010/011/013/014/015，spec T016/017。保留两张迁移执行器内部表的精确检查；DBOS专用schema/独立角色的验证由T013/T022负责，不能扩大业务表豁免。
- `.github/workflows/ci.yml` 与 `nightly.yml` 唯一修改任务为T023；T021/T022先交付可独立运行的测试/脚本。宿主组合根由T020统一修改；各领域用真实测试宿主验证后再集成。T018统一请求日志/脱敏并保留健康路由语义，T020接入，其他宿主不伪装已具有M1身份能力。
- 每个代码PR必须包含本任务列出的测试名；同一TC可在不同层补充断言，其含义不变。详细场景/用例/任务/测试落点见 [task-trace.md](task-trace.md)。测试文件与实现同放，完整跨进程用例位于明确的test/full目录；不能把执行文档当通过测试。任何实质缺项或超出本任务范围，先回工单及规格修订，不在代码里扩权。

## 门禁、证据与收尾

- 每任务跑已交付 `fasrun spec validate fasrun/` 与 `fasrun check`，以及仓库冻结安装、typecheck、lint、format、受影响包无缓存测试、gitleaks；根/共享契约影响面较大时全量。保留application行覆盖80%，校验器/条件/权限/可信度分支90%，新增依赖/迁移/镜像仍受既有检查。任务层PR自身也按仓库门禁执行。
- 验证记录分开：本机标准入口、显式Colima环境替代、PR CI、merge_group、主干、k3d完整集、专用真实接入。#17标准Colima限制仍未修复；CLI产物缺失是另一个构建/测试可靠性事项，不在D-19产品范围内顺手改Turbo。该故障影响CLI检查证据时，保留首次失败并单独按既有缺项流程复现/修订；复跑成功不是修复。不能删测试或将失败计入通过。
- T006/T008等独立测试是真实领域组件加受控端口；T021是自动模拟回归，DBOS/Postgres仍真实；T022是真实k3d故障/排空；T024是真实Keycloak/GitHub阶段证据，仅agent允许已批准stub。测试桩标明版本及启用配置，M1不宣称真实自动起草，不读取开发者个人模型凭据，不提前建M2执行/M3页面/M4管理功能。
- TC-CF-001–020全保留；快速集不杀进程，完整集补真实SIGKILL/等待恢复/排空，并记录每个TC的实际状态。禁止把第6轮19通过1跳过当本次成功，禁止将完整集尚未执行写为已验收。新增检查须记录实际名称与merge_group结果并回传PontusAI接入保护规则；agent不调整保护或批准/合并。
- T001–T024各自PR实际人工合入后，在每批任务合入对账时及时提交独立规格进度维护PR：勾选已合入任务、关联对应PR/合并提交及集成结果，更新当前执行阶段与相关层元数据；未合入任务保持未完成并注明当前PR状态。不再等到T025统一回写，也不能只更新#50、fasrun-design或REPORT。进度维护不改变任务定义、依赖、实现范围、需求或设计；超出这些维护内容仍走既有规格修订流程，不授权任意修改规格。任务层维护按既定分工由zjh1978评审，不新增开工审批；维护PR等待评审不阻塞已经满足真实依赖的实现任务。
- T025负责汇总验收与规格归档，不替代日常合入进度对账。归档由PontusAI评审现行规格/需求归档，zjh1978核对交付；合入后再补main证据与#50最终状态，保留#17未解决部分。

## 待澄清
