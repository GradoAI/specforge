## ADDED Requirements

### Requirement: R-platform-001 单仓结构与构建
单仓必须是一个 pnpm 工作区，目录结构为 apps/、packages/、plugins/、tools/、deploy/、docs/ 与 fasrun/；构建由 Turborepo 编排，TypeScript 以项目引用组织并全部开启严格模式，库包用 tsdown 打包，版本与变更记录由 Changesets 管理。pnpm 必须设置新版本的最短等待期，并默认不执行依赖的安装脚本。
#### Scenario: R-platform-001.S1 全新克隆后构建通过
- GIVEN 一份全新克隆的仓库
- WHEN 执行 `pnpm install --frozen-lockfile` 与 `pnpm build`
- THEN 所有包构建成功，`pnpm typecheck` 在严格模式下没有错误
#### Scenario: R-platform-001.S2 依赖安装脚本默认不执行
- GIVEN 一个声明了 postinstall 脚本、且不在允许清单中的依赖
- WHEN 执行 `pnpm install`
- THEN 该脚本没有被执行

### Requirement: R-platform-002 统一代码规范与依赖方向检查
ESLint、Prettier、TypeScript 基础配置与 commitlint 的统一配置必须放在 tools/ 中，由所有包共用。ESLint 必须按包角色检查依赖方向：插件之间只能依赖对方的 -common、-node、-react 包；-backend、-backend-module-*、-web、-web-module-* 包不能被其他包依赖；平台基础包不能依赖插件包。违规时报错，并指明文件、行与违反的规则。提交信息必须符合 Conventional Commits。
#### Scenario: R-platform-002.S1 引用其他插件的后端包被拦下
- GIVEN 一个插件包的源码导入了另一个插件的 -backend 包
- WHEN 执行 `pnpm lint`
- THEN ESLint 报错，输出中包含该文件与行号，以及依赖方向规则的名称
#### Scenario: R-platform-002.S2 契约包依赖后端包被拦下
- GIVEN 一个 -common 包导入了任意 -backend 包
- WHEN 执行 `pnpm lint`
- THEN ESLint 报错
#### Scenario: R-platform-002.S3 允许的依赖不报错
- GIVEN 一个 -backend 包导入了另一个插件的 -common 包
- WHEN 执行 `pnpm lint`
- THEN 没有依赖方向的错误
#### Scenario: R-platform-002.S4 不合规范的提交信息被拒
- GIVEN 提交信息为「update stuff」
- WHEN commitlint 检查该提交信息
- THEN 检查失败

### Requirement: R-platform-003 仓库协作规则
仓库根目录必须有 CLAUDE.md，写明本仓库的开发纪律：先规格后代码、分支与提交规则、命名规范、发现缺项时的做法；只写规则，不写方案文档的内部细节。仓库必须有 CODEOWNERS：fasrun/changes/**/requirements.md 与 fasrun/specs/** 归需求评审人；.github/** 单独归 PontusAI，CI 配置的修改由人放行；其余路径至少有两名所有者，使每个 PR 都有作者之外的评审人。
#### Scenario: R-platform-003.S1 每条路径都有作者之外的所有者
- GIVEN 仓库中的 CODEOWNERS
- WHEN 对仓库中的任意文件路径求所有者
- THEN 结果非空；除单独归属一人的路径外，所有者不少于两人
#### Scenario: R-platform-003.S2 规格路径归需求评审人
- GIVEN 仓库中的 CODEOWNERS
- WHEN 对 fasrun/specs/platform/spec.md 与 fasrun/changes/SF-1-engineering-skeleton/requirements.md 求所有者
- THEN 所有者为需求评审人
#### Scenario: R-platform-003.S3 CI 配置单独归 PontusAI
- GIVEN 仓库中的 CODEOWNERS
- WHEN 对 .github/workflows/ci.yml 与 .github/CODEOWNERS 求所有者
- THEN 所有者只有 PontusAI

### Requirement: R-platform-004 服务宿主
apps/ 下必须有 fasrun-core-svc、fasrun-connect-svc、fasrun-node-svc、fasrun-portal-web、fasrun-dev-cli 五个宿主，都能启动。后端宿主（fasrun-core-svc、fasrun-connect-svc、fasrun-node-svc）必须用 Fastify 5 提供 HTTP，用 Awilix 为每个后端插件建立隔离的依赖注入容器并装配插件，用 pino 输出结构化日志，并提供 /healthz（进程存活）与 /readyz（依赖就绪）。只有 fasrun-core-svc 的 /readyz 检查数据库；fasrun-connect-svc 的 /readyz 检查能否连到 fasrun-core-svc，不直连数据库；fasrun-node-svc 没有数据库，/readyz 只检查进程内初始化完成。fasrun-portal-web 也必须提供 /healthz 与 /readyz。
#### Scenario: R-platform-004.S1 fasrun-core-svc 在数据库可用时就绪
- GIVEN fasrun-core-svc 已启动，配置的数据库可以连接
- WHEN 请求 GET /readyz
- THEN 返回 200
#### Scenario: R-platform-004.S2 fasrun-core-svc 在数据库不可用时 readyz 失败而 healthz 正常
- GIVEN fasrun-core-svc 已启动，配置的数据库无法连接
- WHEN 分别请求 GET /readyz 与 GET /healthz
- THEN /readyz 返回 503，/healthz 返回 200
#### Scenario: R-platform-004.S3 日志为结构化日志
- GIVEN 任一后端宿主已启动
- WHEN 它处理一次 HTTP 请求
- THEN 标准输出中对应的日志行是 JSON，包含级别、时间、消息与请求标识
#### Scenario: R-platform-004.S4 前端宿主与命令行可以启动
- GIVEN 已完成构建
- WHEN 启动 fasrun-portal-web 并请求首页与 /readyz，再执行 `fasrun --version`
- THEN fasrun-portal-web 返回首页，/readyz 返回 200；`fasrun --version` 输出版本号并以 0 退出
#### Scenario: R-platform-004.S5 fasrun-connect-svc 的就绪取决于 fasrun-core-svc
- GIVEN fasrun-connect-svc 已启动，没有配置任何数据库连接
- WHEN fasrun-core-svc 可以连接时请求 GET /readyz，再停止 fasrun-core-svc 后分别请求 GET /readyz 与 GET /healthz
- THEN 第一次 /readyz 返回 200；停止后 /readyz 返回 503，/healthz 返回 200
#### Scenario: R-platform-004.S6 fasrun-node-svc 在初始化完成后就绪
- GIVEN fasrun-node-svc 已启动，没有配置任何数据库连接
- WHEN 进程内初始化完成后分别请求 GET /readyz 与 GET /healthz
- THEN 两者都返回 200

### Requirement: R-platform-005 后端插件框架基础包
packages/ 下必须有 backend-plugin-api、backend-defaults、contracts-core、test-utils、cli-templates、frontend-plugin-api、frontend-app、ui 八个基础包。backend-plugin-api 必须能定义后端插件、插件模块、服务引用与扩展点，插件声明自己依赖的服务。backend-defaults 必须实现配置、日志、数据库三项默认服务，其余默认服务只定义接口。frontend-plugin-api、frontend-app、ui 只需建包并提供占位导出。
#### Scenario: R-platform-005.S1 插件拿到声明的默认服务
- GIVEN 一个声明依赖配置、日志与数据库服务的后端插件
- WHEN 宿主启动并装配它
- THEN 插件的初始化收到三项服务的实现，且每个插件的容器互相隔离
#### Scenario: R-platform-005.S2 依赖未实现的服务时启动失败
- GIVEN 一个声明依赖尚未实现的默认服务的后端插件
- WHEN 宿主启动
- THEN 宿主以非零状态退出，错误中包含错误码、插件名与服务名

### Requirement: R-platform-006 插件脚手架
`fasrun plugin new <插件> --role <角色>` 必须按插件包角色生成包：包名为 @fasrun/plugin-<插件>-<角色>；-backend 包按 starter、application、infrastructure、common 四层生成目录并带 migrations/；生成后自动在对应的宿主中注册。九个能力域插件（entry、identity、spec、knowledge、orchestration、environment、governance、insight、connect）的 -common 与 -backend 空骨架必须由它生成。
#### Scenario: R-platform-006.S1 生成并注册后端插件
- GIVEN 一个不存在的插件名
- WHEN 执行 `fasrun plugin new demo --role backend`
- THEN 生成 plugins/demo/demo-backend，含四层目录与 migrations/；fasrun-core-svc 的插件注册中包含它；构建、代码检查与测试通过
#### Scenario: R-platform-006.S2 角色不合法时不写入
- GIVEN 角色为 server
- WHEN 执行 `fasrun plugin new demo --role server`
- THEN 命令以非零状态退出并列出合法的角色，没有写入任何文件
#### Scenario: R-platform-006.S3 包已存在时拒绝覆盖
- GIVEN plugins/demo/demo-backend 已存在
- WHEN 再次执行 `fasrun plugin new demo --role backend`
- THEN 命令以非零状态退出，已有文件不变

### Requirement: R-platform-007 数据库表规范与样例表
每个后端插件必须使用一个以插件名命名的 PostgreSQL schema，表在插件的 infrastructure 层用 Drizzle 定义，迁移放在插件的 migrations/ 中。必须提供带类别前缀的 ULID 生成与校验工具，以及按表设计模板生成主键检查约束的写法。identity.organization 必须作为表设计模板的样例实现：标准列、命名、检查约束、注释齐全，行级安全同时启用 ENABLE 与 FORCE ROW LEVEL SECURITY；服务必须使用不拥有表的数据库角色连接。
#### Scenario: R-platform-007.S1 生成带前缀的标识
- GIVEN 类别前缀 org
- WHEN 调用标识生成工具
- THEN 结果匹配 ^org_[0-9A-HJKMNP-TV-Z]{26}$
#### Scenario: R-platform-007.S2 主键前缀错误被数据库拒绝
- GIVEN 已执行迁移的数据库
- WHEN 向 identity.organization 插入 id 为 wrk_ 开头的行
- THEN 插入因检查约束 ck_organization_id 失败
#### Scenario: R-platform-007.S3 行级安全按组织隔离
- GIVEN 以服务使用的非所有者角色连接，identity.organization 中有两个组织的行
- WHEN 在会话中设置 fasrun.org_id 为其中一个组织后查询
- THEN 只返回该组织的行

### Requirement: R-platform-008 迁移执行
`fasrun migrate` 必须先取得数据库的咨询锁，再逐个后端插件执行其 schema 的迁移；每个 schema 使用自己的迁移记录表；某个插件的迁移失败时立即停止并以非零状态退出，已完成的插件保持已迁移。迁移全部成功后，必须同步各插件以带版本的定义文件声明的基础数据：可以重复执行，只更新 Fasrun 自带的条目，不覆盖组织的定制。
#### Scenario: R-platform-008.S1 第二次执行没有变化
- GIVEN 一个空库
- WHEN 连续执行两次 `fasrun migrate`
- THEN 第一次执行全部迁移；第二次报告没有待执行的迁移，各迁移记录表与表结构不变
#### Scenario: R-platform-008.S2 两个进程同时执行只有一个迁移
- GIVEN 一个空库
- WHEN 两个 `fasrun migrate` 进程同时启动
- THEN 只有一个进程执行了迁移；另一个等待锁释放后报告没有待执行的迁移；每个迁移只记录一次
#### Scenario: R-platform-008.S3 迁移失败即停
- GIVEN 插件 B 的一个迁移包含错误的 SQL，插件按 A、B、C 的顺序执行
- WHEN 执行 `fasrun migrate`
- THEN 命令以非零状态退出；A 已迁移，B 的错误迁移未记录，C 未执行
#### Scenario: R-platform-008.S4 基础数据同步不覆盖定制
- GIVEN 示例的基础数据定义已同步过一次，组织修改了其中一条可定制条目
- WHEN 再次执行 `fasrun migrate`
- THEN Fasrun 自带的条目保持定义文件中的内容，被组织修改的条目保持修改后的值

### Requirement: R-platform-009 迁移检查
迁移检查必须：用 squawk 检查迁移 SQL，拦下会长时间锁表的操作；在空库上执行全部迁移后，结果与 Drizzle 的表定义一致；按数据库设计规范检查新增与修改的表，包括约束与索引的命名前缀（pk_、fk_、uq_、ix_、ck_）、标准列、timestamptz、不使用 varchar(n) 与浮点金额、行级安全与注释。任一项不通过时以非零状态退出，并指明迁移文件、表与违反的规则。
#### Scenario: R-platform-009.S1 不用 CONCURRENTLY 建索引被拦下
- GIVEN 一个迁移在已有表上执行不带 CONCURRENTLY 的 CREATE INDEX
- WHEN 运行迁移检查
- THEN 检查失败，输出中包含该迁移文件与 squawk 的规则名
#### Scenario: R-platform-009.S2 不合规范的新表被拦下
- GIVEN 一个迁移新建的表使用 varchar(100)、缺少 created_at 与注释、未启用行级安全
- WHEN 运行迁移检查
- THEN 检查失败，逐条列出违反的规则与表名
#### Scenario: R-platform-009.S3 迁移与表定义不一致被拦下
- GIVEN Drizzle 表定义中有一列在迁移中不存在
- WHEN 运行迁移检查
- THEN 检查失败，指明表与列
#### Scenario: R-platform-009.S4 合规的迁移通过
- GIVEN 样例表 identity.organization 的迁移
- WHEN 运行迁移检查
- THEN 检查通过

### Requirement: R-platform-010 测试工具
test-utils 必须提供测试宿主：在内存中装配后端插件，默认服务可以替换为模拟实现；集成测试必须能由 Testcontainers 启动 PostgreSQL，并为每个插件使用独立的 schema，测试之间互不影响。
#### Scenario: R-platform-010.S1 测试宿主使用模拟服务
- GIVEN 一个依赖日志服务的插件
- WHEN 在测试宿主中以模拟日志服务启动它，并调用它的接口
- THEN 模拟日志服务记录到该插件写出的日志
#### Scenario: R-platform-010.S2 集成测试使用独立的 schema
- GIVEN 两个插件的集成测试共用一个 Testcontainers 启动的 PostgreSQL
- WHEN 两组测试并行运行
- THEN 各自的表只出现在自己的 schema 中，两组测试都通过

### Requirement: R-platform-011 示例数据集「星河科技」
必须以带类型的定义文件描述「星河科技」数据集：组织、四个团队、成员与 14 个内置角色、机器、工作与执行（含 SF-1051 的三次执行）、预算、安全策略与插件，内容与原型一致。示例数据的标识必须带固定前缀，可以整体清除。`fasrun seed --dataset xinghe` 只写入当前已有表的部分，可以重复执行；当前环境为正式环境时必须拒绝执行且不写入任何数据。
#### Scenario: R-platform-011.S1 重复执行结果不变
- GIVEN 已执行迁移的数据库
- WHEN 连续执行两次 `fasrun seed --dataset xinghe`
- THEN 两次执行后各表的行数与内容相同
#### Scenario: R-platform-011.S2 正式环境拒绝执行
- GIVEN 环境被设置为正式环境
- WHEN 执行 `fasrun seed --dataset xinghe`
- THEN 命令以非零状态退出，数据库中没有新增或修改的行
#### Scenario: R-platform-011.S3 定义文件完整
- GIVEN 数据集的定义文件
- WHEN 运行数据集的校验测试
- THEN 组织 1 个、团队 4 个、内置角色 14 个、SF-1051 的执行 3 次，且所有标识都带示例前缀

### Requirement: R-platform-012 CI 合并门槛
每个 PR 必须在 GitHub Actions 中运行：类型检查；ESLint（含依赖方向）；Prettier 检查；commitlint；单元测试与集成测试，application 层行覆盖率不低于 80%；迁移检查；`fasrun spec validate fasrun/`；Changesets 检查；「先规格后代码」检查；gitleaks；Trivy 依赖与镜像漏洞扫描（严重漏洞阻断）与 SBOM 生成。「先规格后代码」检查要求代码 PR 的标题引用工作编号与任务编号，且对应的变更目录与 tasks.md 中的任务已存在于 main；只修改 fasrun/、文档或 CI 配置的 PR 不受此限。每日运行一次完整集：在 k3d 中部署并运行冒烟测试。所有工作流的 GITHUB_TOKEN 默认只读，需要写权限的作业单独声明。
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

### Requirement: R-platform-013 容器镜像
fasrun-core-svc、fasrun-connect-svc、fasrun-portal-web 与 fasrun migrate 所用的命令行必须各有容器镜像，用多阶段构建，以非 root 用户运行。
#### Scenario: R-platform-013.S1 镜像以非 root 运行
- GIVEN 构建好的各服务镜像
- WHEN 检查镜像配置的运行用户并在容器中执行 id -u
- THEN 用户不是 root，id -u 的结果不为 0

### Requirement: R-platform-014 Helm 部署与 k3d 一键脚本
必须提供 Helm chart，部署 fasrun-core-svc、fasrun-connect-svc、fasrun-portal-web 与 CloudNativePG（运营者与一个单实例集群，本里程碑只建 Fasrun 数据库）；`fasrun migrate` 作为 Helm 的升级前任务运行，全部成功后才更新服务。Keycloak、可观测后端、TokenHub 与备份在 chart 中留有位置。deploy/k3d/ 中必须有一键脚本：在 k3d 集群 fasrun-dev 中构建并导入镜像、安装或升级 chart，可以重复执行；所有端口只绑定 127.0.0.1。
#### Scenario: R-platform-014.S1 一键部署成功
- GIVEN 一个空的 k3d 集群 fasrun-dev
- WHEN 执行一键部署脚本
- THEN 所有 Pod 就绪，迁移任务成功，fasrun-core-svc、fasrun-connect-svc 与 fasrun-portal-web 的 /readyz 返回 200
#### Scenario: R-platform-014.S2 重复执行结果不变
- GIVEN 已经部署成功的 fasrun-dev
- WHEN 再次执行一键部署脚本
- THEN 脚本成功；迁移任务报告没有待执行的迁移；所有 Pod 就绪，镜像与配置与上一次相同
#### Scenario: R-platform-014.S3 迁移失败时服务不更新
- GIVEN 一个包含失败迁移的新版本
- WHEN 执行升级
- THEN 升级失败，各服务仍运行原版本

### Requirement: R-platform-015 fasrun 命令行骨架
FASRUN-DEV-CLI 必须基于 oclif 提供 `fasrun` 命令行，至少包含 `spec validate`、`spec archive`、`migrate`、`seed`、`plugin new` 命令；每个命令有帮助说明，出错时以非零状态退出。
#### Scenario: R-platform-015.S1 列出命令
- GIVEN 已完成构建
- WHEN 执行 `fasrun --help`
- THEN 输出中包含 spec validate、spec archive、migrate、seed 与 plugin new

### Requirement: R-platform-016 许可证与贡献签名
仓库根目录必须放 AGPL-3.0 的 LICENSE。供插件开发使用的包（backend-plugin-api、frontend-plugin-api、contracts-core、ui、test-utils、cli-templates，以及各插件的 -common、-node、-react 包）必须各自放 Apache-2.0 的 LICENSE，并在 package.json 中声明 Apache-2.0；其余包声明 AGPL-3.0-only。声明为 Apache-2.0 的包不能依赖声明为 AGPL-3.0-only 的工作区包。CI 必须检查许可声明的一致性；外部贡献者（不是组织成员或仓库协作者）提交的 PR 中，每个提交都必须带 DCO 签名（Signed-off-by），组织成员与本仓库 GitHub App 的提交不要求。
#### Scenario: R-platform-016.S1 许可声明与包角色一致
- GIVEN 仓库中全部工作区包
- WHEN 运行许可声明一致性检查
- THEN 根目录有 AGPL-3.0 的 LICENSE；插件开发用包都有 Apache-2.0 的 LICENSE 且 license 字段为 Apache-2.0；其余包的 license 字段为 AGPL-3.0-only；检查通过
#### Scenario: R-platform-016.S2 许可声明错误被拦下
- GIVEN 一个 -common 包的 license 字段为 AGPL-3.0-only，或缺少 LICENSE 文件
- WHEN 运行许可声明一致性检查
- THEN 检查失败，指明包名与问题
#### Scenario: R-platform-016.S3 Apache-2.0 的包依赖 AGPL 包被拦下
- GIVEN 一个声明为 Apache-2.0 的包依赖了 backend-defaults
- WHEN 运行许可声明一致性检查
- THEN 检查失败，指明两个包名
#### Scenario: R-platform-016.S4 外部贡献者缺少 DCO 签名被拦下
- GIVEN 一个外部贡献者的 PR，其中一个提交没有 Signed-off-by
- WHEN DCO 检查运行
- THEN 检查失败，并列出缺少签名的提交
#### Scenario: R-platform-016.S5 组织成员与 GitHub App 的提交不要求签名
- GIVEN 由本仓库 GitHub App 提交、或由组织成员提交的 PR，提交没有 Signed-off-by
- WHEN DCO 检查运行
- THEN 检查通过
