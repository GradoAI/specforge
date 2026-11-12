# SF-1 M0 工程骨架

## 目标
为 Fasrun 的开发者与部署者建好单仓、平台基础包、数据库规范与迁移、`fasrun` 命令行与规格自检、测试工具与示例数据集、CI 门槛和 k3d 部署，使后续里程碑可以在统一的规范与门槛下按规格开发，并能在 k3d 上一键部署（UC-21 的部署部分）。

## 范围
- 做：
  - pnpm 工作区单仓、统一的代码规范与依赖方向检查、仓库协作规则（CLAUDE.md、CODEOWNERS）；
  - 后端插件框架的基础包（配置、日志、数据库三项默认服务）与五个宿主，九个能力域插件的 `-common` 与 `-backend` 空骨架；
  - 数据库表规范、`fasrun migrate` 与基础数据同步框架、迁移检查，以 `identity.organization` 为样例；
  - `fasrun` 命令行：`spec validate`、`spec archive`、`migrate`、`seed`、`plugin new`；现行规格骨架；
  - test-utils 与「星河科技」数据集中已有表的部分；
  - GitHub Actions 合并门槛与每日完整集；
  - 许可证（根目录 AGPL-3.0，插件开发用包 Apache-2.0）与外部贡献者的 DCO 签名检查；
  - 容器镜像、Helm chart（含 CloudNativePG 与升级前迁移任务）与 k3d 一键部署脚本。
- 不做：
  - Keycloak、可观测后端、TokenHub、备份（chart 中只留位置）；
  - 除配置、日志、数据库以外的默认服务的实现（只留接口）；
  - 前端插件框架的实现（frontend-plugin-api、frontend-app、ui 只建包与导出占位）；
  - 能力域插件的业务功能（M1 起）；
  - 安装向导 `fasrun setup` 与 `fasrun node join`（UC-21 的其余部分）；
  - 接入真实工单、真实成员与真实模型调用。

## 用户场景

### US-1 一键部署到 k3d（P1）
作为平台管理员，我要用一个脚本把 Fasrun 的后端服务、数据库与迁移部署到 k3d 集群中，并且可以重复执行，以便得到与正式环境一致的开发环境。
独立验证：在空的 k3d 集群中执行部署脚本，所有 Pod 就绪、迁移任务成功、三个集群内服务（fasrun-core-svc、fasrun-connect-svc、fasrun-portal-web）的 /readyz 返回正常；再执行一次，结果不变。
实现它的需求条目：R-platform-004、R-platform-013、R-platform-014、R-platform-008

### US-2 按统一规范新增插件（P1）
作为 Fasrun 开发者，我要用脚手架生成符合包角色与四层结构的插件，并由宿主装配、由代码检查约束依赖方向，以便每个插件从第一天起就遵守工程规范。
独立验证：用 `fasrun plugin new` 生成一个后端插件，构建、代码检查与测试通过，宿主启动时装配了它；在测试中引入一个违反依赖方向的导入，代码检查报错。脚手架输出与独立、受版本控制的预期夹具一致；真实插件按已批准任务演进后，仍通过宿主注册与现有工程检查，不再要求其业务源码等同空骨架（R-platform-006.S4）。
实现它的需求条目：R-platform-001、R-platform-002、R-platform-005、R-platform-006、R-platform-010

### US-3 按规范设计表并安全迁移（P1）
作为 Fasrun 开发者，我要按统一的表规范定义表、生成迁移，并让迁移检查拦下不合规范或会长时间锁表的迁移，以便数据库结构可评审、可重复执行。
独立验证：对样例表 `identity.organization` 执行 `fasrun migrate` 两次，第二次没有变化；在测试中提交一个不合规范的迁移，迁移检查报错。
实现它的需求条目：R-platform-007、R-platform-008、R-platform-009

### US-4 提交规格前自检（P1）
作为规划 agent 或开发者，我要在提交规格 PR 前用 `fasrun spec validate` 检查变更目录与现行规格，并在交付后用 `fasrun spec archive` 归档，以便规格的格式与覆盖关系可以机械判定。
独立验证：对单仓的 fasrun/ 目录执行 `fasrun spec validate`，通过；对每类不合格样例执行，报出对应的错误与位置；对一个变更目录执行 `fasrun spec archive`，规格增量合并进现行规格，目录移入 archive/。
实现它的需求条目：R-spec-001、R-spec-002、R-spec-003、R-spec-004、R-platform-015

### US-5 合并前由 CI 把关（P1）
作为设计评审人与合并审批人，我要每个 PR 都自动运行合并门槛，包括「先规格后代码」与密钥扫描，以便只评审通过门槛的修改。
独立验证：开一个引用了不存在任务的代码 PR，「先规格后代码」检查失败；开一个只改 fasrun/ 的 PR，该检查通过；修改了包却没有变更说明的 PR，Changesets 检查失败。
实现它的需求条目：R-platform-003、R-platform-012、R-platform-016

### US-6 用固定数据集测试（P2）
作为测试编写者，我要用 `fasrun seed --dataset xinghe` 写入与原型一致的示例数据，可以重复执行，并且在正式环境中被拒绝，以便测试使用统一的数据且不污染正式数据。
独立验证：连续执行两次 `fasrun seed --dataset xinghe`，数据不变；把环境设为正式环境后执行，命令拒绝并且不写入。
实现它的需求条目：R-platform-011

## 成功标准
- main 上 CI 全绿，R-platform-012 列出的每项检查都在运行。
- 在 fasrun-dev 中执行一键部署脚本，所有 Pod 就绪、迁移任务成功、三个集群内服务（fasrun-core-svc、fasrun-connect-svc、fasrun-portal-web）的 /readyz 返回 200；重复执行一次，结果不变。
- `fasrun spec validate fasrun/` 对单仓现有目录通过，对每类不合格样例都报出正确的错误与位置。
- `fasrun migrate` 连续执行两次，第二次没有变化；两个进程同时执行时只有一个在迁移。
- `fasrun seed --dataset xinghe` 可以重复执行；设置为正式环境时拒绝执行。
- 违反依赖方向的示例代码被 ESLint 拦下；不合规范的示例迁移被迁移检查拦下。
- 根目录与插件开发用包的许可声明一致，许可声明检查与外部贡献者的 DCO 检查在 CI 中运行。
- 本工作的变更目录已用 `fasrun spec archive` 归档，规格增量合并进 fasrun/specs/。

## 已确认的澄清

- [#35](https://github.com/fasrun/fasrun/issues/35)（2026-11-12，Human 在工作会话确认，由 agent [转述记录](https://github.com/fasrun/fasrun/issues/35#issuecomment-6814982064)，不代表 GitHub 人工评审已批准）：采用独立、受版本控制的夹具验证脚手架输出；九个真实插件允许按已批准任务演进，保留宿主注册检查及现有构建、代码检查和测试门槛。相应修订 R-platform-006、D-6 与 T011；修订合入后再实现 T011。

## 待澄清
