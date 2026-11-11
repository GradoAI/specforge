## ADDED Requirements

### Requirement: R-platform-017 仓库配置与 Fasfile
单仓根目录必须有 fasrun.yaml 与 Fasfile，并在 .gitignore 中忽略 fasrun.local.yaml。fasrun.yaml 必须声明 version 与规格根目录 fasrun/。Fasfile 必须使用 YAML，顶层声明 version: 1，并写明单仓现行的约束：Node.js 24、pnpm 12、TypeScript 6.0、ESLint 10.13、Vitest 4.1.12；质量门槛与测试方案 3.1 一致（合并前必须通过的检查；application 层行覆盖率不低于 80%；校验器、条件表达式、权限规则与可信度传递的分支覆盖率不低于 90%）；高风险路径为 .github/、fasrun/specs/、数据库迁移与依赖清单。本阶段的 schema 只校验 version 与已知的顶层字段：version 不为 1 或出现未知的顶层字段时校验不通过；完整的 schema 随 spec 插件在 M1 发布。
#### Scenario: R-platform-017.S1 单仓的两份文件通过最小 schema
- GIVEN 单仓根目录的 fasrun.yaml 与 Fasfile
- WHEN 按本阶段的 schema 校验两份文件
- THEN 都通过；fasrun.yaml 的规格根目录为 fasrun/；Fasfile 的高风险路径包含 .github/ 与 fasrun/specs/
#### Scenario: R-platform-017.S2 未知顶层字段与错误版本被拒绝
- GIVEN 一份含未知顶层字段的 Fasfile，以及一份 version 为 2 的 Fasfile
- WHEN 按本阶段的 schema 校验
- THEN 两份都不通过，错误中指明字段名或版本
#### Scenario: R-platform-017.S3 本地覆盖文件不进仓库
- GIVEN 根目录有一份 fasrun.local.yaml
- WHEN 查看 git 的忽略规则
- THEN 该文件被忽略

### Requirement: R-platform-018 统一命名与品牌文档
单仓中的目录、包、命令、环境变量、设计令牌、链路与日志属性、数据库会话变量、镜像、命名空间、Kubernetes 标签与文档必须按技术方案 2.1「命名规范」使用 fasrun：规格根目录 fasrun/；根包名 fasrun，工作区包为 @fasrun/*；宿主目录 apps/fasrun-*；组件写作 FASRUN-<组件>-<类型>；命令行 fasrun（别名 fas）；环境变量前缀 FASRUN_；设计令牌 --fasrun-；属性与会话变量 fasrun.*；Kubernetes 标签前缀 fasrun.dev/。仓库必须有 docs/brand-and-naming.md（品牌规范全文），CONTRIBUTING.md 必须引用它；README 首段必须使用固定的实体定义句，顶端链接到 https://fasrun.dev。全仓不得残留 specforge、SpecForge、SF_、--sf- 或独立的 sf 命令；例外为 GradoAI/sf-optio，以及 SF-2 的变更目录 fasrun/changes/SF-2-rename-fasrun/ 及其归档目录。
#### Scenario: R-platform-018.S1 没有旧名残留
- GIVEN main 分支
- WHEN 全仓不区分大小写搜索 specforge、SF_、--sf- 与独立的 sf 命令
- THEN 除 GradoAI/sf-optio，以及 SF-2 的变更目录 fasrun/changes/SF-2-rename-fasrun/ 及其归档目录外没有结果
#### Scenario: R-platform-018.S2 工作区包使用新名字
- GIVEN 单仓的全部 package.json
- WHEN 读取包名
- THEN 根包名为 fasrun，其余包名都以 @fasrun/ 开头
#### Scenario: R-platform-018.S3 品牌文档与 README
- GIVEN 单仓的 README.md 与 CONTRIBUTING.md
- WHEN 读取 README 的顶端与首段，以及 CONTRIBUTING.md
- THEN README 顶端链接到 https://fasrun.dev，首段是实体定义句；CONTRIBUTING.md 链接到 docs/brand-and-naming.md

## MODIFIED Requirements

### Requirement: R-platform-015 fasrun 命令行骨架
FASRUN-DEV-CLI 必须基于 oclif 提供 `fasrun` 命令行，包的 bin 同时提供 fasrun 与别名 fas，至少包含 `spec validate`、`spec archive`、`migrate`、`seed`、`plugin new`、`init`、`check` 命令；每个命令有帮助说明，出错时以非零状态退出。`fasrun init` 必须在目标目录生成 fasrun.yaml、Fasfile 模板与规格目录（specs/ 与 changes/），已存在的文件不覆盖。`fasrun check` 必须依次运行 `fasrun spec validate` 与 Fasfile、fasrun.yaml 的 schema 校验（R-platform-017），任一失败即以非零状态退出。命令行读取的环境变量为 FASRUN_ENDPOINT、FASRUN_API_KEY、FASRUN_CONFIG、FASRUN_LOG_LEVEL，不带组件段。
#### Scenario: R-platform-015.S1 列出命令
- GIVEN 已完成构建
- WHEN 执行 `fasrun --help`，再执行 `fas --help`
- THEN 两次输出相同，都包含 spec validate、spec archive、migrate、seed、plugin new、init 与 check
#### Scenario: R-platform-015.S2 init 生成仓库配置且不覆盖已有文件
- GIVEN 一个空目录，以及一个已有 Fasfile 的目录
- WHEN 分别执行 `fasrun init`
- THEN 空目录中生成 fasrun.yaml、Fasfile 与 fasrun/specs/、fasrun/changes/；已有的 Fasfile 内容不变
#### Scenario: R-platform-015.S3 check 依次运行规格自检与配置校验
- GIVEN 单仓根目录
- WHEN 执行 `fasrun check`
- THEN 先运行 `fasrun spec validate fasrun/`，再校验 Fasfile 与 fasrun.yaml，全部通过时以 0 退出；把 Fasfile 的 version 改为 2 后再执行，以非零状态退出并指明 Fasfile
