# 任务：SF-1 M0 工程骨架

每个任务一个分支 `feat/SF-1-T<nnn>-<简述>`、一个代码 PR，PR 标题以「SF-1 T<nnn>」开头。用例编号由场景派生（TC-PLATFORM-<序号> 对应 platform 的场景，TC-SPEC-<序号> 对应 spec 的场景，按规格增量中的出现顺序编号），写在测试名中。

- [x] T001 单仓骨架与工具链 — 对应 R-platform-001、D-1；修改范围 package.json、pnpm-workspace.yaml、pnpm-lock.yaml、turbo.json、tsconfig.json、.npmrc、.nvmrc、.gitignore、.changeset/、tools/tsconfig/；用例 TC-PLATFORM-001（R-platform-001.S1）、TC-PLATFORM-002（R-platform-001.S2）
- [x] T002 [P] 统一代码规范与依赖方向规则 — 对应 R-platform-002、D-2；依赖 T001；修改范围 tools/eslint-config/、tools/eslint-plugin-fasrun/、tools/prettier-config/、tools/commitlint-config/、eslint.config.js、prettier.config.js、commitlint.config.js、package.json；用例 TC-PLATFORM-003（R-platform-002.S1）、TC-PLATFORM-004（R-platform-002.S2）、TC-PLATFORM-005（R-platform-002.S3）、TC-PLATFORM-006（R-platform-002.S4）
- [x] T003 [P] CLAUDE.md（含批准分工）与 CODEOWNERS — 对应 R-platform-003、D-3；依赖 T001；修改范围 CLAUDE.md、.github/CODEOWNERS、tools/scripts/；用例 TC-PLATFORM-007（R-platform-003.S1）、TC-PLATFORM-008（R-platform-003.S2）、TC-PLATFORM-009（R-platform-003.S3）
- [x] T004 CI 基线与「先规格后代码」检查 — 对应 R-platform-012、D-16；依赖 T002、T003；修改范围 .github/workflows/、tools/scripts/；用例 TC-PLATFORM-037（R-platform-012.S1）、TC-PLATFORM-038（R-platform-012.S2）、TC-PLATFORM-039（R-platform-012.S3）、TC-PLATFORM-040（R-platform-012.S4）
- [x] T005 [P] 许可证与 DCO 检查 — 对应 R-platform-016、D-19；依赖 T004；修改范围 LICENSE、CONTRIBUTING.md、tools/scripts/、.github/workflows/；用例 TC-PLATFORM-046（R-platform-016.S1）、TC-PLATFORM-047（R-platform-016.S2）、TC-PLATFORM-048（R-platform-016.S3）、TC-PLATFORM-049（R-platform-016.S4）、TC-PLATFORM-050（R-platform-016.S5）
- [x] T006 [P] 平台基础包骨架与后端插件框架 — 对应 R-platform-005、D-4；依赖 T004；修改范围 packages/；用例 TC-PLATFORM-016（R-platform-005.S1）、TC-PLATFORM-017（R-platform-005.S2）
- [x] T007 服务宿主与就绪检查 — 对应 R-platform-004、D-5；依赖 T006；修改范围 apps/fasrun-core-svc/、apps/fasrun-connect-svc/、apps/fasrun-node-svc/、apps/fasrun-portal-web/、tsconfig.json；用例 TC-PLATFORM-010（R-platform-004.S1）、TC-PLATFORM-011（R-platform-004.S2）、TC-PLATFORM-012（R-platform-004.S3）、TC-PLATFORM-014（R-platform-004.S5）、TC-PLATFORM-015（R-platform-004.S6）
- [x] T008 fasrun 命令行骨架（bin 同时提供 fasrun 与 fas；`--json`、固定退出码与非交互运行；init 含 AGENTS.md 与 CLAUDE.md 引用；login 设备授权；其余命令先声明参数与帮助）— 对应 R-platform-015、R-platform-004、D-10、D-5；依赖 T007；修改范围 apps/fasrun-dev-cli/、tsconfig.json；用例 TC-PLATFORM-045（R-platform-015.S1）、TC-PLATFORM-060（R-platform-015.S2）、TC-PLATFORM-062（R-platform-015.S4）、TC-PLATFORM-063（R-platform-015.S5）、TC-PLATFORM-064（R-platform-015.S6）、TC-PLATFORM-065（R-platform-015.S7）、TC-PLATFORM-066（R-platform-015.S8）、TC-PLATFORM-013（R-platform-004.S4）
- [x] T009 [P] test-utils 测试宿主与 Testcontainers — 对应 R-platform-010、D-14；依赖 T006；修改范围 packages/test-utils/；用例 TC-PLATFORM-032（R-platform-010.S1）、TC-PLATFORM-033（R-platform-010.S2）
- [x] T010 插件脚手架与九个能力域插件骨架 — 对应 R-platform-006、D-6；依赖 T008；修改范围 packages/cli-templates/、apps/fasrun-dev-cli/、apps/fasrun-core-svc/、apps/fasrun-connect-svc/、plugins/、tsconfig.json；用例 TC-PLATFORM-018（R-platform-006.S1）、TC-PLATFORM-019（R-platform-006.S2）、TC-PLATFORM-020（R-platform-006.S3）
- [ ] T011 表规范、标识工具、数据库角色与样例表 identity.organization — 对应 R-platform-007、R-platform-006、D-7、D-6；依赖 T009、T010；修改范围 packages/contracts-core/、packages/backend-defaults/、plugins/identity/、apps/fasrun-dev-cli/src/plugin-new.test.ts、apps/fasrun-dev-cli/test/fixtures/plugin-new/（后两项仅用于 #35 的脚手架回归边界修订）；用例 TC-PLATFORM-021（R-platform-007.S1）、TC-PLATFORM-022（R-platform-007.S2）、TC-PLATFORM-023（R-platform-007.S3）、TC-PLATFORM-067（R-platform-006.S4，保留 TC-PLATFORM-018–020）
- [ ] T012 fasrun migrate 与基础数据同步 — 对应 R-platform-008、D-8；依赖 T011；修改范围 packages/backend-defaults/、packages/test-utils/、apps/fasrun-dev-cli/；用例 TC-PLATFORM-024（R-platform-008.S1）、TC-PLATFORM-025（R-platform-008.S2）、TC-PLATFORM-026（R-platform-008.S3）、TC-PLATFORM-027（R-platform-008.S4）
- [ ] T013 [P] 迁移检查 — 对应 R-platform-009、D-9；依赖 T012；修改范围 tools/migration-check/、.squawk.toml、.github/workflows/；用例 TC-PLATFORM-028（R-platform-009.S1）、TC-PLATFORM-029（R-platform-009.S2）、TC-PLATFORM-030（R-platform-009.S3）、TC-PLATFORM-031（R-platform-009.S4）
- [ ] T014 [P] 规格解析、fasrun spec validate 与 fasrun check — 对应 R-spec-001、R-spec-002、R-platform-015、D-11、D-10；依赖 T010；修改范围 plugins/spec/spec-common/、apps/fasrun-dev-cli/、fasrun/config.yaml、fasrun/README.md、.github/workflows/；用例 TC-SPEC-001（R-spec-001.S1）、TC-SPEC-002（R-spec-001.S2）、TC-SPEC-003（R-spec-001.S3）、TC-SPEC-004（R-spec-001.S4）、TC-SPEC-005（R-spec-001.S5）、TC-SPEC-006（R-spec-001.S6）、TC-SPEC-007（R-spec-002.S1）、TC-SPEC-008（R-spec-002.S2）、TC-SPEC-009（R-spec-002.S3）、TC-SPEC-010（R-spec-002.S4）、TC-SPEC-011（R-spec-002.S5）、TC-PLATFORM-061（R-platform-015.S3）
- [ ] T015 现行规格骨架 — 对应 R-spec-003、D-12；依赖 T014；修改范围 fasrun/specs/；用例 TC-SPEC-012（R-spec-003.S1）
- [ ] T016 规格归档 fasrun spec archive — 对应 R-spec-004、D-13；依赖 T015；修改范围 plugins/spec/spec-common/、apps/fasrun-dev-cli/；用例 TC-SPEC-013（R-spec-004.S1）、TC-SPEC-014（R-spec-004.S2）
- [ ] T017 [P] 「星河科技」数据集与 fasrun seed（以 fasrun_app 经 withOrg 写入） — 对应 R-platform-011、D-15；依赖 T012；修改范围 packages/test-utils/、apps/fasrun-dev-cli/；用例 TC-PLATFORM-034（R-platform-011.S1）、TC-PLATFORM-035（R-platform-011.S2）、TC-PLATFORM-036（R-platform-011.S3）
- [ ] T018 [P] 容器镜像与漏洞扫描 — 对应 R-platform-013、D-17；依赖 T012；修改范围 deploy/docker/、.github/workflows/；用例 TC-PLATFORM-041（R-platform-013.S1）
- [ ] T019 Helm chart、k3d 一键部署与每日完整集 — 对应 R-platform-014、D-18；依赖 T018；修改范围 deploy/helm/、deploy/k3d/、.github/workflows/；用例 TC-PLATFORM-042（R-platform-014.S1）、TC-PLATFORM-043（R-platform-014.S2）、TC-PLATFORM-044（R-platform-014.S3）
- [ ] T020 收尾：归档 SF-1 — 对应 R-spec-004、D-13；依赖 T005、T013、T016、T017、T019；修改范围 fasrun/；用例 无新增（完成标准：`fasrun spec validate fasrun/` 通过，变更目录位于 changes/archive/ 下）

## 说明

- T004 先建立 CI 基线：typecheck、lint、format、commitlint、test、changesets、spec-first、gitleaks。后续任务各自在 ci.yml 中加入本任务的作业：T005 加 license-check 与 dco，T013 加 migration-check，T014 加 spec-validate，T018 加 trivy，T019 加 nightly.yml。T004 合入后，之后的代码 PR 都受「先规格后代码」检查约束。
- 修改 .github/ 的任务（T003、T004、T005、T013、T014、T018、T019）按 CODEOWNERS 由 PontusAI 放行。
- 修改 fasrun/specs/ 的任务（T015、T020）同样由 PontusAI 放行：CODEOWNERS 中 fasrun/specs/ 归 PontusAI。T020 归档时还会移动本变更目录中的 requirements.md，该路径也归 PontusAI。
- 许可证（T005）合入前创建的包，由 T005 一并补上 LICENSE 与 license 字段；T005 之后由脚手架按角色写入。
- 数据库角色的落点：
  - T009：test-utils 在 Testcontainers 的 PostgreSQL 中建 `fasrun_owner`（BYPASSRLS）与 `fasrun_app`（NOBYPASSRLS）；
  - T011：行级安全与 `withOrg`，以及用 `fasrun_app` 连接时的隔离测试；
  - T012：迁移执行器以 `fasrun_owner` 运行并对 `fasrun_app` 授权；
  - T017：`fasrun seed` 以 `fasrun_app` 经 `withOrg` 写入；
  - T019：Helm 托管角色的 `bypassrls` 属性。
- 命令行的环境变量统一为 `FASRUN_*`：`FASRUN_MIGRATE_DATABASE_URL`、`FASRUN_DATABASE_URL`、`FASRUN_ENVIRONMENT`。
- 各任务都可以同时修改根 package.json 的依赖与脚本、pnpm-lock.yaml 与 .changeset/ 中本任务的变更说明，不再逐项列出。
- 各任务都可以同时修改根 tsconfig.json 的 references，以收录本任务新增的包。
- 引入新检查的任务（如 T002 的 lint 与 format、T005 的许可声明检查、T013 的迁移检查）可以同时修正已合并代码中不符合该检查的部分，并在 PR 中列出这些修正。
- T020 只修改 fasrun/：用 `fasrun spec archive` 归档本变更目录，规格增量合并进 fasrun/specs/。
