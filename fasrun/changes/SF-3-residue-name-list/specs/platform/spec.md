## MODIFIED Requirements

### Requirement: R-platform-018 统一命名与品牌文档
单仓中的目录、包、命令、环境变量、设计令牌、链路与日志属性、数据库会话变量、镜像、命名空间、Kubernetes 标签与文档必须按技术方案 2.1「命名规范」使用 fasrun：规格根目录 fasrun/；根包名 fasrun，工作区包为 @fasrun/*；宿主目录 apps/fasrun-*；组件写作 FASRUN-<组件>-<类型>；命令行 fasrun（别名 fas）；环境变量前缀 FASRUN_；设计令牌 --fasrun-；属性与会话变量 fasrun.*；Kubernetes 标签前缀 fasrun.dev/。仓库必须有 docs/brand-and-naming.md（品牌规范全文），CONTRIBUTING.md 必须引用它；README 首段必须使用固定的实体定义句，顶端链接到 https://fasrun.dev。全仓不得残留旧名；旧名清单只放在残留检查配置文件 tools/scripts/old-names.yaml 中，例外为该配置文件、GradoAI/sf-optio 与 SF-2 的归档目录 fasrun/changes/archive/<日期>-SF-2-rename-fasrun/。
#### Scenario: R-platform-018.S1 没有旧名残留
- GIVEN main 分支
- WHEN 按残留检查配置中的旧名清单搜索全部受版本控制的文件
- THEN 除该配置文件、GradoAI/sf-optio 与 SF-2 的归档目录外没有结果
#### Scenario: R-platform-018.S2 工作区包使用新名字
- GIVEN 单仓的全部 package.json
- WHEN 读取包名
- THEN 根包名为 fasrun，其余包名都以 @fasrun/ 开头
#### Scenario: R-platform-018.S3 品牌文档与 README
- GIVEN 单仓的 README.md 与 CONTRIBUTING.md
- WHEN 读取 README 的顶端与首段，以及 CONTRIBUTING.md
- THEN README 顶端链接到 https://fasrun.dev，首段是实体定义句；CONTRIBUTING.md 链接到 docs/brand-and-naming.md
