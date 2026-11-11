# SF-2 改名为 Fasrun

## 目标
产品更名为帆驭 (Fasrun)，主仓迁到 fasrun/fasrun。让单仓的目录、包、命令、标识与文档按技术方案 2.1「命名规范」统一使用 fasrun，并按 2.11 在仓库根目录声明 fasrun.yaml 与 Fasfile，使从 SF-1 T004 起的后续任务（CI 检查名、命令行、镜像、部署）一开始就使用新名字。

## 范围
- 做：
  - 规格根目录 specforge/ 改为 fasrun/（specs、changes、archive，用 git mv 保留历史）；SF-1 的 meta.yaml 中的 issue 链接改为 fasrun/fasrun；CODEOWNERS 的路径改为 /fasrun/specs/ 与 /fasrun/changes/**/requirements.md，首行注释同步；
  - 工作区包：npm scope @specforge/* 改为 @fasrun/*，ESLint 插件与规则命名空间改为 fasrun；pnpm 工作区、tsconfig 引用、Turborepo、ESLint 依赖方向规则及其测试样例同步（样例中的 apps/sf-* 改为 apps/fasrun-*）；根包名改为 fasrun；
  - CLAUDE.md 中的目录、命名与分支规则改为新名字；
  - SF-1 尚未交付的规格文本（需求层、设计层、任务层与规格增量）只替换名称，除 R-platform-015（见规格增量）外不改语义：命令行 sf → fasrun；宿主 apps/sf-* → apps/fasrun-*；组件 SF-<组件>-<类型> → FASRUN-<组件>-<类型>；环境变量 SF_ → FASRUN_（命令行读取的变量不带组件段）；设计令牌 --sf- → --fasrun-；链路属性与数据库会话变量 sf.* → fasrun.*；数据库角色 sf_* → fasrun_*；镜像、命名空间与 k3d 集群 sf-* → fasrun-*；Helm 标签前缀 fasrun.dev/；
  - 仓库根目录新增 fasrun.yaml（规格根目录 fasrun/）与 Fasfile（version: 1，单仓现行约束）；.gitignore 加入 fasrun.local.yaml；
  - 新增 docs/brand-and-naming.md（《Fasrun 品牌与技术规范》v1.3 全文）；新增 CONTRIBUTING.md 并引用它（SF-1 T005 再补充许可证与 DCO）；README 首段使用固定的实体定义句，顶端链接到 https://fasrun.dev。
- 不做：
  - 命令行与 `fasrun spec validate` 的实现：分别由 SF-1 T008、T014 交付；`fasrun init` 与 `fasrun check` 按本工作修改后的 R-platform-015 随 T008 交付；
  - CI：由 SF-1 T004 建立，本工作合并后再开始；
  - 仓库的 About 与 Topics：修改仓库设置，经 PontusAI 确认后单独操作；
  - 归档仓库 GradoAI/sf-optio 的名称；
  - 发布 npm、PyPI 占位包与域名、组织的注册（品牌规范第 8 节的其他事项）。

## 用户场景

### US-1 单仓只使用新名字（P1）
作为 Fasrun 的开发者，我要单仓中的目录、包、命令、标识与文档都使用 fasrun 命名，以便后续的代码、CI 检查名、镜像与部署从一开始就用新名字，不出现新旧混用。
独立验证：全仓搜索 specforge、SpecForge、SF_、--sf- 与独立的 sf 命令，除 GradoAI/sf-optio，以及 SF-2 的变更目录 fasrun/changes/SF-2-rename-fasrun/ 及其归档目录外没有结果；pnpm install、typecheck、lint、format、test 全部通过；CODEOWNERS 用例以新路径通过；README 首段为实体定义句并链接 https://fasrun.dev。
实现它的需求条目：R-platform-018

### US-2 仓库声明 Fasrun 配置与长期约束（P1）
作为规划 agent 与评审人，我要在单仓根目录读到 fasrun.yaml 与 Fasfile，以便规划与检查以它们为项目长期约束的来源。
独立验证：根目录有 fasrun.yaml（规格根目录 fasrun/）与 Fasfile（version: 1）；单元测试按本阶段的最小 schema 校验两份文件通过，并拒绝未知顶层字段与错误的版本；fasrun.local.yaml 被 git 忽略。
实现它的需求条目：R-platform-017

### US-3 用一个命令初始化与检查仓库（P2）
作为开发者，我要用 `fasrun init` 生成配置与规格目录，用 `fasrun check` 在本机运行与 CI 相同的校验，以便接入新仓库与提交前自检都只需一个命令。
独立验证：SF-1 T008 交付命令行后，在空目录执行 `fasrun init` 生成 fasrun.yaml、Fasfile 模板与规格目录；对单仓执行 `fasrun check` 通过；`fas --help` 与 `fasrun --help` 输出相同。
实现它的需求条目：R-platform-015

## 成功标准
- 全仓残留检查除 GradoAI/sf-optio，以及 SF-2 的变更目录 fasrun/changes/SF-2-rename-fasrun/ 及其归档目录外没有结果。
- 自举期的本地合并门槛（pnpm install --frozen-lockfile、typecheck、lint、format、commitlint、test、gitleaks）全部通过。
- TC-PLATFORM-007、TC-PLATFORM-008、TC-PLATFORM-009 以新路径通过。
- fasrun.yaml 与 Fasfile 通过本阶段的最小 schema 校验。

## 待澄清
