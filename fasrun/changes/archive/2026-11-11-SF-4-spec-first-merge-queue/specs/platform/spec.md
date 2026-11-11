## MODIFIED Requirements

### Requirement: R-platform-012 CI 合并门槛
每个 PR 必须在 GitHub Actions 中运行：类型检查；ESLint（含依赖方向）；Prettier 检查；commitlint；单元测试与集成测试，application 层行覆盖率不低于 80%；迁移检查；`fasrun spec validate fasrun/`；Changesets 检查；「先规格后代码」检查；gitleaks；Trivy 依赖与镜像漏洞扫描（严重漏洞阻断）与 SBOM 生成。CI 必须同时在合并队列（merge_group 事件）上运行，main 使用合并队列合并；只在 PR 上运行的检查（如 commitlint、「先规格后代码」）在合并队列中跳过。「先规格后代码」检查要求代码 PR 的标题引用一个任务编号（SF-<n> T<nnn>，变更目录含 tasks.md 的较大工作）或一个变更编号（SF-<n>，变更目录不含 tasks.md 的小改动）：引用任务编号时，main 上该工作的 tasks.md 中必须有该任务；只引用变更编号时，main 上该工作的变更目录必须不含 tasks.md；两种情况下该变更目录（fasrun/changes/SF-<n>-*/，归档目录不算）都必须已在 main 上。只修改 fasrun/、文档或 CI 配置的 PR 不受此限。每日运行一次完整集：在 k3d 中部署并运行冒烟测试。所有工作流的 GITHUB_TOKEN 默认只读，需要写权限的作业单独声明。
#### Scenario: R-platform-012.S1 未引用已有任务的代码 PR 被拦下
- GIVEN 一个修改了 packages/ 的 PR，标题为「SF-1 T999 示例」，main 的 tasks.md 中没有 T999
- WHEN 「先规格后代码」检查运行
- THEN 检查失败，并说明找不到的任务
#### Scenario: R-platform-012.S2 只改规格的 PR 不受限
- GIVEN 一个只修改 fasrun/ 下文件的 PR，标题不含任务编号
- WHEN 「先规格后代码」检查运行
- THEN 检查通过
#### Scenario: R-platform-012.S3 修改了包却没有变更说明被拦下
- GIVEN 一个修改了 packages/ 下某个包的源码、没有附带 changeset 的 PR
- WHEN Changesets 检查运行
- THEN 检查失败
#### Scenario: R-platform-012.S4 工作流令牌默认只读
- GIVEN 仓库中的全部工作流文件
- WHEN 检查其权限声明
- THEN 每个工作流在顶层声明只读权限，写权限只出现在单独声明的作业中
#### Scenario: R-platform-012.S5 引用小改动变更编号的代码 PR 通过
- GIVEN main 上有不含 tasks.md 的变更目录 fasrun/changes/SF-9-example/，以及一个修改了 packages/、标题为「SF-9 示例修复」的 PR
- WHEN 「先规格后代码」检查运行
- THEN 检查通过
#### Scenario: R-platform-012.S6 变更编号无效的代码 PR 被拦下
- GIVEN 两个修改了 packages/ 的 PR：一个标题为「SF-1 示例」，SF-1 的变更目录含 tasks.md；另一个标题为「SF-99 示例」，main 上没有 SF-99 的变更目录
- WHEN 「先规格后代码」检查运行
- THEN 两者都失败：前者要求引用任务编号，后者说明找不到变更目录
#### Scenario: R-platform-012.S7 CI 在合并队列上运行
- GIVEN 仓库的 .github/workflows/ci.yml
- WHEN 读取它的触发条件
- THEN 包含 pull_request、merge_group 与推送到 main
