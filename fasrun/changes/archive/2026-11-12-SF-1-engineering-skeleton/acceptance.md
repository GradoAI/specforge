# SF-1 M0 收尾对账（T020）

2026-11-12，基线 `7ccaa8917e52ed77e38ae1502c85fb4f6a7462da`。本文是归档 PR 的验收证据与范围对账，不是人工批准记录。T020 归档尚待人工合入；M0 的最终验收结论在归档合入、集成检查核实后回传。

## 范围与真相源

按方案《4. 编码》4.0 的 M0 行：工程骨架、规范与 CI、k3d/Helm、数据库与初始数据、统一命名、CLI/init/check/spec validate、test-utils 与星河科技数据集；对应 UC-21 的部署部分。系统行为由现行规格约束，阶段 0–3 是顶层输入。对账同时检查技术方案 2.1、2.3、2.4、2.10、2.11、测试方案 3.1、3.8、3.10，以及需求方案 1.6 的已有原型数据映射。

现行规格为 [platform](../../../specs/platform/spec.md) 与 [spec](../../../specs/spec/spec.md)，其余八能力保留骨架。SF-1 的 16 条 platform 与 4 条 spec 增量归入现行规格；已有 R-platform-017/018（SF-2/SF-3）保持原文，共 22 条需求、82 个场景。R-platform-012 的小改动/合并队列增量来自已合入 SF-4，不丢失其场景。

## 方案—规格—实现—证据

| M0 方案输入 | 现行需求 / 设计 / 任务 | 实现落点 | 验证用例与证据 |
| --- | --- | --- | --- |
| 2.1 单仓、严格类型、构建与供应链 | R-platform-001 / D-1 / T001 | 根工作区/锁文件、tools/tsconfig、turbo | TC-PLATFORM-001–002；frozen install、严格类型、完整构建与安装脚本反例 |
| 2.1 依赖方向、2.3 提交与规范 | R-platform-002 / D-2 / T002 | tools/eslint-*、prettier/commitlint 配置 | TC-PLATFORM-003–006；允许/违规导入与非法提交反例 |
| 2.3 评审分工；4.0 人工驱动 | R-platform-003 / D-3 / T003 | CLAUDE.md、CODEOWNERS | TC-PLATFORM-007–009；真实规则与路径归属 |
| 2.1 五宿主与后端基础包 | R-platform-004/005 / D-4/5 / T006–008 | apps/ 五宿主，packages/ 八基础包 | TC-PLATFORM-010–017；真实 CLI/HTTP、依赖失败、隔离容器与未实现服务失败 |
| 2.1 包角色与四层结构 | R-platform-006 / D-6 / T010/011 | cli-templates、plugin new、独立夹具、九插件注册 | TC-PLATFORM-018–020/067；按 #35 独立夹具回归，不冻结真实插件业务源码 |
| 2.4 表规范与租户隔离 | R-platform-007 / D-7 / T011 | contracts-core 标识、backend-defaults withOrg、identity.organization | TC-PLATFORM-021–023；真实 PostgreSQL 前缀约束与非所有者角色 RLS |
| 2.3 咨询锁、只向前迁移、基础数据 | R-platform-008 / D-8 / T012 | backend-defaults/migrate、CLI migrate | TC-PLATFORM-024–027；重复执行、双进程锁、失败即停、定制保留 |
| 2.3/2.4 迁移检查 | R-platform-009 / D-9 / T013 | tools/migration-check、squawk、实际 catalog/Drizzle diff | TC-PLATFORM-028–031/068；#42 两内部表精确检查，业务表无扩大豁免 |
| 3.8 测试宿主与数据库 | R-platform-010 / D-14 / T009 | test-utils 测试宿主/mock/Testcontainers | TC-PLATFORM-032–033；共享容器下数据库/schema 隔离 |
| 1.6 原型、3.8 星河科技 | R-platform-011 / D-15 / T017 | test-utils/datasets/xinghe、CLI seed | TC-PLATFORM-034–036；app 角色经 RLS、重复内容不变、production 连接前拒绝 |
| 2.3、3.1 CI 与每日集 | R-platform-012 / D-16 / T004/013/014/018/019 | ci.yml、nightly.yml、仓库检查与 protect-main | TC-PLATFORM-037–040/057–059；PR/队列/main 实际结果见下 |
| 2.3/2.10 容器与部署（UC-21 部署部分） | R-platform-013/014 / D-17/18 / T018/019 | deploy/docker、helm、k3d | TC-PLATFORM-041–044；最终 distroless 实测 UID65532，真实首装/重复/失败升级 |
| 2.7 CLI、2.11 init/check | R-platform-015 / D-10 / T008/014 | apps/fasrun-dev-cli | TC-PLATFORM-045/060–066；真实子进程、固定退出码/JSON、模拟授权服务 |
| 2.3 开源协作与许可 | R-platform-016 / D-19 / T005 | LICENSE、CONTRIBUTING、license-check、dco | TC-PLATFORM-046–050；许可与外部 DCO 反例，App/成员豁免按规则 |
| 2.1 命名、2.11 配置 | R-platform-017/018 / SF-2/SF-3 | Fasfile、fasrun.yaml、brand-and-naming、残留检查 | TC-PLATFORM-051–056；配置反例、包名、品牌、旧名清单 |
| 2.11 格式、覆盖、依赖自检 | R-spec-001/002 / D-11 / T014 | spec-common、CLI validate/check | TC-SPEC-001–011；错误类别/位置、无环与范围、真实仓库校验 |
| 2.11 现行规格骨架 | R-spec-003 / D-12 / T015 | fasrun/specs 十能力 | TC-SPEC-012 单独命令验收，见下；不冒称已纳入 Vitest |
| 2.11 交付归档 | R-spec-004 / D-13 / T016/020 | spec-common/archive、CLI spec archive、本归档目录 | TC-SPEC-013–014；四种操作、冲突无写入、错误回滚；本次真实命令及字节对账 |

用例源码索引列在文末；源码中存在编号不是执行通过的替代，执行证据分别引用完整套件、真实部署及独立验收。

## 前置与集成证据

T020 的全部前置实际合入：[T005 #21](https://github.com/fasrun/fasrun/pull/21)、[T013 #47](https://github.com/fasrun/fasrun/pull/47)、[T016 #43](https://github.com/fasrun/fasrun/pull/43)、[T017 #45](https://github.com/fasrun/fasrun/pull/45)、[T019 #48](https://github.com/fasrun/fasrun/pull/48)。#48 合入时间 2026-11-12T10:37:27Z，main 安全快进至上述基线。

- #48 最终 [PR CI](https://github.com/fasrun/fasrun/actions/runs/43200134431)：13/13 成功。
- #48 [Linux 完整集](https://github.com/fasrun/fasrun/actions/runs/43200134322)：标准全量 43/43、规格与迁移检查、Helm 与真实 k3d TC042–044 成功。日志构件已下载核验首装/重复/失败 SQL、旧服务 readyz 与恢复 release revision4 deployed；上传及集群清理成功。该次为 PR 事件，尚不代表每日 schedule 已实际发生。
- 合入后的 [merge_group](https://github.com/fasrun/fasrun/actions/runs/43201567151) 与 [main push](https://github.com/fasrun/fasrun/actions/runs/43202009255) 成功：9 项实际执行成功，4 项 PR-only 检查按条件跳过。
- protect-main 已接入 13 个 required contexts，包含 spec-validate/migration-check/trivy（GitHub Actions，App15368）。migration-check/trivy 已有实际队列成功结果并回传 PontusAI；agent 未修改保护规则。nightly 是条件触发的完整集，不擅自作为全局必需 context。

## 本次真实归档与验收方法

使用已交付 CLI 的同一 bin，未手工拼接现行规格或用 mv 替代归档：

```sh
pnpm install --frozen-lockfile
pnpm --filter @fasrun/fasrun-dev-cli... build
node apps/fasrun-dev-cli/bin/run.js spec validate fasrun/
node apps/fasrun-dev-cli/bin/run.js check
node apps/fasrun-dev-cli/bin/run.js spec archive fasrun/changes/SF-1-engineering-skeleton --date 2026-11-12 --json
node apps/fasrun-dev-cli/bin/run.js spec validate fasrun/ --json
node apps/fasrun-dev-cli/bin/run.js check --json
```

归档返回 ok=true，仅更新 specs/platform/spec.md 与 specs/spec/spec.md。归档前后自检均退出0（23个被解析文件，errors=[]），check三项通过。requirements/design/两个增量文件对 main 原文逐字不变，tasks 仅勾 T020；八个未扩充能力文件逐字不变；逐条比较需求块确认已有两条与全部新增内容保留。meta.yaml 根据已合入 #6 将 tasks 从过期的 in_review 对账为 approved，按既有归档格式登记 T001–T019 交付 PR 与归档日期；不把归档 PR 标为已批准。规格修订 #10、#30、#36、#44 的结论保留在已批准三层文档中。本文为额外收尾证据，不改变需求或测试预期。

TC-SPEC-012 在归档前单独复验：真实十能力集合/标题/说明/Requirements 结构正确，platform 与 T015 基线逐字一致；从十文件提取标题和说明，在临时根目录构造十份空 Requirements，以实际 CLI `spec validate <临时根目录>` 退出0，报告10文件。这是 T015 已有外部验收脚本本轮复跑，不是仓库内 Vitest 测试；归档后 platform/spec 应包含已交付需求，不再要求真实目录为空。

T020 本轮 frozen install、CLI构建、typecheck、lint、format、许可39包、changeset status及gitleaks通过。标准 `pnpm test --force --continue` 为38/43，五个容器任务报无法发现运行时（#17）；显式设置 Colima 的 DOCKER_HOST、TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE，并用 `pnpm test --force --continue --env-mode=loose` 的替代完整运行43/43、零缓存通过。归档后新增文件已暂存，仓库清单检查实际覆盖它们。PR CI的最终head与运行链接由本PR检查页和正文记录，不以旧执行结果冒充本轮CI。

## 已知限制与范围对账

- [#17](https://github.com/fasrun/fasrun/issues/17) 保持 OPEN。Colima 的 Turbo 严格环境变量透传仍未修复；本机标准入口失败与显式 socket + loose 替代方式分别记录，Linux CI 成功不等于本机问题消失。
- #17 的 Fasfile 专门评审/事前确认字段、protected_paths 语义补全、M3 e2e-affected、宿主请求日志复用、TC002 YAML 改写、CLI 错误码共用及 portal 测试构建依赖等仍保留原跟踪。已由 SF-3/SF-4/T008 交付的条目有各自证据，但不据此关闭整个 #17。
- #35/#41/#42 随相应代码人工合入闭环；归档保留澄清原文及历史确认语境，不把会话确认改写为 GitHub 人工批准。
- 数据集按已导出的 Figma 画框逐字段映射，见 [来源说明](../../../../packages/test-utils/src/datasets/xinghe/README.md)。C4/C15 成员聚合、C6/C15 预算与未展示分页的差异如实保留；只录可见实体，不补造人名、日期或域名，不提前建立后续业务表。M0 seed 只写 identity.organization。
- M0 的 Keycloak/可观测后端/TokenHub/备份只保留关闭的位置；前端框架只是包占位，CLI login 使用模拟授权服务。没有宣称安装向导、真实工单/成员/模型、M1 控制流或 M3 界面/试点已验收。3.10 的后续完整业务用例及每日自动追溯能力不能由本次人工对账冒充已交付。
- 归档自检检查格式与声明覆盖，不检查 THEN 可判定性或实现正确性；本次用实现和运行证据补足验收对账。层间行类型和 starter 装配纪律仍由评审把关；跨插件数据库角色细分及上一版本迁移兼容演练按已批准 D-7/D-16 长期约束边界保留。
- 归档 CLI 的事务性是运行时错误回滚，需独占规格目录；不把它写成进程崩溃日志恢复机制。未引入新依赖、修改代码/CI 或放宽质量规则。

## 用例源码索引

以下索引覆盖平台 68 个及规格 14 个场景对应编号；TC-SPEC-012 是上文独立验收，其余列出已跟踪的测试/部署检查文件。编号相同的多个断言共同验证场景。

| 用例 | 源码或独立验收 |
| --- | --- |
| TC-PLATFORM-001 | [tools/tsconfig/test/toolchain.test.ts](../../../../tools/tsconfig/test/toolchain.test.ts) |
| TC-PLATFORM-002 | [tools/tsconfig/test/toolchain.test.ts](../../../../tools/tsconfig/test/toolchain.test.ts) |
| TC-PLATFORM-003 | [tools/eslint-config/test/lint.test.ts](../../../../tools/eslint-config/test/lint.test.ts) |
| TC-PLATFORM-004 | [tools/eslint-config/test/lint.test.ts](../../../../tools/eslint-config/test/lint.test.ts) |
| TC-PLATFORM-005 | [tools/eslint-config/test/lint.test.ts](../../../../tools/eslint-config/test/lint.test.ts) |
| TC-PLATFORM-006 | [tools/commitlint-config/test/commitlint.test.ts](../../../../tools/commitlint-config/test/commitlint.test.ts) |
| TC-PLATFORM-007 | [tools/scripts/src/codeowners.test.ts](../../../../tools/scripts/src/codeowners.test.ts) |
| TC-PLATFORM-008 | [tools/scripts/src/codeowners.test.ts](../../../../tools/scripts/src/codeowners.test.ts) |
| TC-PLATFORM-009 | [tools/scripts/src/codeowners.test.ts](../../../../tools/scripts/src/codeowners.test.ts) |
| TC-PLATFORM-010 | [apps/fasrun-core-svc/src/host.test.ts](../../../../apps/fasrun-core-svc/src/host.test.ts) |
| TC-PLATFORM-011 | [apps/fasrun-core-svc/src/host.test.ts](../../../../apps/fasrun-core-svc/src/host.test.ts) |
| TC-PLATFORM-012 | [apps/fasrun-core-svc/src/host.test.ts](../../../../apps/fasrun-core-svc/src/host.test.ts) |
| TC-PLATFORM-013 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts)；[apps/fasrun-portal-web/src/host.test.ts](../../../../apps/fasrun-portal-web/src/host.test.ts) |
| TC-PLATFORM-014 | [apps/fasrun-connect-svc/src/host.test.ts](../../../../apps/fasrun-connect-svc/src/host.test.ts) |
| TC-PLATFORM-015 | [apps/fasrun-node-svc/src/host.test.ts](../../../../apps/fasrun-node-svc/src/host.test.ts) |
| TC-PLATFORM-016 | [packages/backend-defaults/src/backend.test.ts](../../../../packages/backend-defaults/src/backend.test.ts) |
| TC-PLATFORM-017 | [packages/backend-defaults/src/backend.test.ts](../../../../packages/backend-defaults/src/backend.test.ts) |
| TC-PLATFORM-018 | [apps/fasrun-dev-cli/src/plugin-new.test.ts](../../../../apps/fasrun-dev-cli/src/plugin-new.test.ts) |
| TC-PLATFORM-019 | [apps/fasrun-dev-cli/src/plugin-new.test.ts](../../../../apps/fasrun-dev-cli/src/plugin-new.test.ts) |
| TC-PLATFORM-020 | [apps/fasrun-dev-cli/src/plugin-new.test.ts](../../../../apps/fasrun-dev-cli/src/plugin-new.test.ts) |
| TC-PLATFORM-021 | [packages/contracts-core/src/ids.test.ts](../../../../packages/contracts-core/src/ids.test.ts) |
| TC-PLATFORM-022 | [plugins/identity/identity-backend/src/infrastructure/schema/organization.int.test.ts](../../../../plugins/identity/identity-backend/src/infrastructure/schema/organization.int.test.ts) |
| TC-PLATFORM-023 | [plugins/identity/identity-backend/src/infrastructure/schema/organization.int.test.ts](../../../../plugins/identity/identity-backend/src/infrastructure/schema/organization.int.test.ts) |
| TC-PLATFORM-024 | [apps/fasrun-dev-cli/src/lib/migrate.test.ts](../../../../apps/fasrun-dev-cli/src/lib/migrate.test.ts)；[apps/fasrun-dev-cli/src/migrate.int.test.ts](../../../../apps/fasrun-dev-cli/src/migrate.int.test.ts) |
| TC-PLATFORM-025 | [apps/fasrun-dev-cli/src/migrate.int.test.ts](../../../../apps/fasrun-dev-cli/src/migrate.int.test.ts) |
| TC-PLATFORM-026 | [apps/fasrun-dev-cli/src/migrate.int.test.ts](../../../../apps/fasrun-dev-cli/src/migrate.int.test.ts) |
| TC-PLATFORM-027 | [apps/fasrun-dev-cli/src/migrate.int.test.ts](../../../../apps/fasrun-dev-cli/src/migrate.int.test.ts) |
| TC-PLATFORM-028 | [tools/migration-check/src/check.int.test.ts](../../../../tools/migration-check/src/check.int.test.ts) |
| TC-PLATFORM-029 | [tools/migration-check/src/check.int.test.ts](../../../../tools/migration-check/src/check.int.test.ts)；[tools/migration-check/src/conventions.test.ts](../../../../tools/migration-check/src/conventions.test.ts) |
| TC-PLATFORM-030 | [tools/migration-check/src/check.int.test.ts](../../../../tools/migration-check/src/check.int.test.ts)；[tools/migration-check/src/check.test.ts](../../../../tools/migration-check/src/check.test.ts)；[tools/migration-check/src/project.test.ts](../../../../tools/migration-check/src/project.test.ts) |
| TC-PLATFORM-031 | [tools/migration-check/src/check.int.test.ts](../../../../tools/migration-check/src/check.int.test.ts) |
| TC-PLATFORM-032 | [packages/test-utils/src/test-backend.test.ts](../../../../packages/test-utils/src/test-backend.test.ts) |
| TC-PLATFORM-033 | [packages/test-utils/src/schema-isolation-a.int.test.ts](../../../../packages/test-utils/src/schema-isolation-a.int.test.ts)；[packages/test-utils/src/schema-isolation-b.int.test.ts](../../../../packages/test-utils/src/schema-isolation-b.int.test.ts) |
| TC-PLATFORM-034 | [apps/fasrun-dev-cli/src/lib/seed.test.ts](../../../../apps/fasrun-dev-cli/src/lib/seed.test.ts)；[apps/fasrun-dev-cli/src/seed.int.test.ts](../../../../apps/fasrun-dev-cli/src/seed.int.test.ts) |
| TC-PLATFORM-035 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts)；[apps/fasrun-dev-cli/src/lib/seed.test.ts](../../../../apps/fasrun-dev-cli/src/lib/seed.test.ts)；[apps/fasrun-dev-cli/src/seed.int.test.ts](../../../../apps/fasrun-dev-cli/src/seed.int.test.ts) |
| TC-PLATFORM-036 | [packages/test-utils/src/datasets/xinghe/dataset.test.ts](../../../../packages/test-utils/src/datasets/xinghe/dataset.test.ts) |
| TC-PLATFORM-037 | [tools/scripts/src/spec-first.test.ts](../../../../tools/scripts/src/spec-first.test.ts) |
| TC-PLATFORM-038 | [tools/scripts/src/spec-first.test.ts](../../../../tools/scripts/src/spec-first.test.ts) |
| TC-PLATFORM-039 | [tools/scripts/src/ci-workflows.test.ts](../../../../tools/scripts/src/ci-workflows.test.ts) |
| TC-PLATFORM-040 | [tools/scripts/src/ci-workflows.test.ts](../../../../tools/scripts/src/ci-workflows.test.ts) |
| TC-PLATFORM-041 | [deploy/docker/README.md](../../../../deploy/docker/README.md)；[deploy/docker/verify-runtime.mjs](../../../../deploy/docker/verify-runtime.mjs) |
| TC-PLATFORM-042 | [deploy/helm/verify.test.mjs](../../../../deploy/helm/verify.test.mjs)；[deploy/k3d/verify.sh](../../../../deploy/k3d/verify.sh) |
| TC-PLATFORM-043 | [deploy/helm/verify.test.mjs](../../../../deploy/helm/verify.test.mjs)；[deploy/k3d/verify.sh](../../../../deploy/k3d/verify.sh) |
| TC-PLATFORM-044 | [deploy/helm/verify.test.mjs](../../../../deploy/helm/verify.test.mjs)；[deploy/k3d/verify.sh](../../../../deploy/k3d/verify.sh) |
| TC-PLATFORM-045 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-046 | [tools/scripts/src/license-dco.test.ts](../../../../tools/scripts/src/license-dco.test.ts) |
| TC-PLATFORM-047 | [tools/scripts/src/license-dco.test.ts](../../../../tools/scripts/src/license-dco.test.ts) |
| TC-PLATFORM-048 | [tools/scripts/src/license-dco.test.ts](../../../../tools/scripts/src/license-dco.test.ts) |
| TC-PLATFORM-049 | [tools/scripts/src/license-dco.test.ts](../../../../tools/scripts/src/license-dco.test.ts) |
| TC-PLATFORM-050 | [tools/scripts/src/license-dco.test.ts](../../../../tools/scripts/src/license-dco.test.ts) |
| TC-PLATFORM-051 | [tools/scripts/src/repo-config.test.ts](../../../../tools/scripts/src/repo-config.test.ts) |
| TC-PLATFORM-052 | [tools/scripts/src/repo-config.test.ts](../../../../tools/scripts/src/repo-config.test.ts) |
| TC-PLATFORM-053 | [tools/scripts/src/repo-config.test.ts](../../../../tools/scripts/src/repo-config.test.ts) |
| TC-PLATFORM-054 | [tools/scripts/src/repo-config.test.ts](../../../../tools/scripts/src/repo-config.test.ts) |
| TC-PLATFORM-055 | [tools/scripts/src/repo-config.test.ts](../../../../tools/scripts/src/repo-config.test.ts) |
| TC-PLATFORM-056 | [tools/scripts/src/repo-config.test.ts](../../../../tools/scripts/src/repo-config.test.ts) |
| TC-PLATFORM-057 | [tools/scripts/src/spec-first.test.ts](../../../../tools/scripts/src/spec-first.test.ts) |
| TC-PLATFORM-058 | [tools/scripts/src/spec-first.test.ts](../../../../tools/scripts/src/spec-first.test.ts) |
| TC-PLATFORM-059 | [tools/scripts/src/ci-workflows.test.ts](../../../../tools/scripts/src/ci-workflows.test.ts) |
| TC-PLATFORM-060 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-061 | [apps/fasrun-dev-cli/src/spec.test.ts](../../../../apps/fasrun-dev-cli/src/spec.test.ts) |
| TC-PLATFORM-062 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-063 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-064 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-065 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-066 | [apps/fasrun-dev-cli/src/cli.test.ts](../../../../apps/fasrun-dev-cli/src/cli.test.ts) |
| TC-PLATFORM-067 | [apps/fasrun-dev-cli/src/plugin-new.test.ts](../../../../apps/fasrun-dev-cli/src/plugin-new.test.ts) |
| TC-PLATFORM-068 | [tools/migration-check/src/check.int.test.ts](../../../../tools/migration-check/src/check.int.test.ts)；[tools/migration-check/src/internal.test.ts](../../../../tools/migration-check/src/internal.test.ts) |
| TC-SPEC-001 | [apps/fasrun-dev-cli/src/spec.test.ts](../../../../apps/fasrun-dev-cli/src/spec.test.ts)；[plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-002 | [apps/fasrun-dev-cli/src/spec.test.ts](../../../../apps/fasrun-dev-cli/src/spec.test.ts)；[plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-003 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-004 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-005 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-006 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-007 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-008 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-009 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-010 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-011 | [plugins/spec/spec-common/src/validation.test.ts](../../../../plugins/spec/spec-common/src/validation.test.ts) |
| TC-SPEC-012 | 独立命令验收，见上文 TC-SPEC-012 |
| TC-SPEC-013 | [apps/fasrun-dev-cli/src/lib/spec-archive.test.ts](../../../../apps/fasrun-dev-cli/src/lib/spec-archive.test.ts)；[plugins/spec/spec-common/src/archive.test.ts](../../../../plugins/spec/spec-common/src/archive.test.ts) |
| TC-SPEC-014 | [apps/fasrun-dev-cli/src/lib/spec-archive.test.ts](../../../../apps/fasrun-dev-cli/src/lib/spec-archive.test.ts)；[plugins/spec/spec-common/src/archive.test.ts](../../../../plugins/spec/spec-common/src/archive.test.ts) |
