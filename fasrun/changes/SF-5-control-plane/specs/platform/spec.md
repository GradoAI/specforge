## MODIFIED Requirements

### Requirement: R-platform-017 仓库配置与 Fasfile
单仓根目录必须有 fasrun.yaml 与 YAML 格式的 Fasfile，version 为 1；fasrun.yaml 声明项目、规格根目录、模板与共享文件；fasrun.local.yaml 被 Git 忽略。Fasfile 保留本仓现行技术约束、质量门槛、高风险及禁止修改路径、工具命令，增加按路径或领域的专门评审规则、事前确认领域与确认人。现行门槛不降低：application 行覆盖率 80%，校验器、条件表达式、权限及可信度传递分支覆盖率 90%。spec-common 发布完整 schema，检查各层字段类型、合法值及未知字段；init 模板、本机 check 与 CI 使用一致契约。Node.js 24、pnpm 12、TypeScript 6.0、ESLint 10.13、Vitest 4.1.12 约束与 .github/、fasrun/specs/、迁移及依赖清单的高风险标记保留。
#### Scenario: R-platform-017.S1 单仓的两份文件通过 schema
- GIVEN 单仓根目录的 fasrun.yaml 与 Fasfile
- WHEN 按完整 schema 校验两份文件
- THEN 都通过；fasrun.yaml 的规格根目录为 fasrun/；Fasfile 的高风险路径包含 .github/ 与 fasrun/specs/，现行技术与质量门槛不降低
#### Scenario: R-platform-017.S2 未知字段与错误版本被拒绝
- GIVEN 含未知顶层或嵌套字段、字段类型错误的 Fasfile，以及 version 为 2 的 Fasfile
- WHEN 按完整 schema 校验
- THEN 都不通过，错误中指明文件及字段路径或版本
#### Scenario: R-platform-017.S3 本地覆盖文件不进仓库
- GIVEN 根目录有一份 fasrun.local.yaml
- WHEN 查看 git 的忽略规则
- THEN 该文件被忽略
#### Scenario: R-platform-017.S4 评审声明与工具入口一致
- GIVEN 带合法专门评审及事前确认声明的配置，另有缺少领域或确认人的无效配置
- WHEN 分别运行契约校验、本机 check 和 CI 同一检查，并用 init 新建配置
- THEN 合法声明保留并通过，无效声明均被拒绝且定位相同；新模板通过同一 schema；不因 M1 解析评审声明而宣称 M2 AI 代码评审已实现
