# 设计：SF-1 M0 工程骨架

## 方案

### D-1 单仓与工具链
对应需求：R-platform-001
做法：
- 根目录：`pnpm-workspace.yaml` 收录 `apps/*`、`packages/*`、`plugins/*/*`、`tools/*`；`package.json` 用 `packageManager` 固定 pnpm 版本，`engines` 要求 Node.js 24；`.nvmrc` 写 24；`.npmrc` 固定 `registry=https://registry.npmjs.org/`，不依赖开发机的全局配置。
- 供应链（2.6「依赖的供应链风险」）：`pnpm-workspace.yaml` 设 `minimumReleaseAge`（7 天）与 `strictDepBuilds`，只有 `onlyBuiltDependencies` 清单中的依赖可以执行安装脚本；依赖版本由锁文件固定，CI 用 `--frozen-lockfile`。
- TypeScript：`tools/tsconfig` 提供 `tsconfig.base.json`（`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`module`/`moduleResolution` 为 `nodenext`），各包 `composite: true`，根 `tsconfig.json` 只列 `references`；类型检查为 `tsc -b`。TypeScript 固定在 6.0 系列：typescript-eslint 8.72 只支持到 `<6.1.0`，7.0 待其支持后再升级。
- 构建：Turborepo 编排 `build`、`typecheck`、`lint`、`test`，`build` 依赖上游包的 `build`；库包（packages/、plugins/）用 tsdown 输出 ESM 与 `.d.ts`，`package.json` 的 `exports` 只暴露公开入口；宿主（apps/）用 tsdown 打成可执行入口，fasrun-portal-web 的前端用 Rsbuild。
- 版本：Changesets 独立版本；宿主与 tools/ 标为 private，不发布。

### D-2 统一代码规范与依赖方向规则
对应需求：R-platform-002
做法：
- `tools/eslint-config`：flat config，含 typescript-eslint 的类型感知规则与本仓库的规则插件 `tools/eslint-plugin-fasrun`；`tools/prettier-config`；`tools/commitlint-config`（扩展 config-conventional，类型限定为 feat、fix、refactor、docs、chore、test、build、ci、perf、revert）。
- 依赖方向规则 `fasrun/dependency-direction` 自己实现，不用通用插件：通用插件按目录匹配，无法表达「包角色 + 跨插件」的组合。规则读取导入方所在包与被导入包的包名（`@fasrun/plugin-<插件>-<角色>` 或 `@fasrun/<基础包>`），按下表判定：

  | 导入方 | 可以导入 |
  | --- | --- |
  | `-common` | 任意 `-common`；`contracts-core` |
  | `-node` | 任意 `-common`、`-node`；`backend-plugin-api`、`contracts-core` |
  | `-backend`、`-backend-module-*` | 任意 `-common`、`-node`；本插件的 `-backend`（仅模块）；后端基础包 |
  | `-react` | 任意 `-common`、`-react`；前端基础包 |
  | `-web`、`-web-module-*` | 任意 `-common`、`-react`；本插件的 `-web`（仅模块）；前端基础包 |
  | 平台基础包 | 其他基础包；不能导入任何插件包 |
  | 宿主（apps/） | 任意包；只有宿主可以导入 `-backend`、`-backend-module-*` 以完成装配 |

  另外禁止：越过 `exports` 的深层导入（如 `@fasrun/plugin-x-common/src/...`）；以相对路径跨出本包目录的导入。报错信息含规则名、导入方与被导入的包名。
- 违例样例只放在规则自己的测试中（ESLint 的 RuleTester 与一个测试用的临时工作区），不放进真实的插件目录。

### D-3 仓库协作规则
对应需求：R-platform-003
做法：
- CLAUDE.md 只写规则：先规格后代码（没有已合并的任务层规格就没有代码 PR）；分支名与提交信息；提交作者与共同作者；PR 标题以「SF-<n> T<nnn>」开头并链接变更目录；命名规范的要点；批准分工：需求层规格 PR 与修改 .github/ 的 PR 由 PontusAI 批准，设计层、任务层规格 PR 与代码 PR 由 zjh1978 批准，批准人负责合并，GitHub App 不批准、不合并；发现缺项时先提澄清工单、不在代码里自行决定；公开仓库不入库任何密钥、令牌、内部主机名与 IP，推送前运行 gitleaks。
- `.github/CODEOWNERS`（GitHub 取最后一条匹配的规则，顺序如下）：
  ```
  *                                        @PontusAI @zjh1978
  /fasrun/specs/                        @PontusAI
  /fasrun/changes/**/requirements.md    @PontusAI
  /.github/                                @PontusAI
  ```
- CODEOWNERS 让每个 PR 都有作者之外的评审人；批准分工（见上）在自举 A 阶段靠约定执行：「其余路径」虽然列了两名所有者，代码、设计与任务层 PR 仍由 zjh1978 批准。M1 起由平台的授权记录与权限规则强制（2.6「权限检查点」）。
- `tools/scripts/codeowners-check`：按 GitHub 的匹配语义对仓库中的每个文件求所有者，验证 R-platform-003 的三个场景，作为单元测试运行。

### D-4 后端插件框架
对应需求：R-platform-005
做法：接口形态参照 Backstage 新后端系统，运行时用 Awilix。
- `backend-plugin-api`：
  - `createServiceRef<T>({ id, scope: 'root' | 'plugin' })`、`createServiceFactory`；
  - `createBackendPlugin({ pluginId, register(env) })`，`env.registerInit({ deps, init })` 声明依赖的服务；`createBackendModule`；`createExtensionPoint`；
  - `coreServices`：rootConfig、logger、database、httpRouter，以及 2.5「平台提供的资源」中其余服务（密钥、遥测、文件存储、数据引用、鉴权、审计、事件、出站）的服务引用与接口。
- `backend-defaults`：
  - `createBackend({ component })`：Fastify 5 实例；Awilix 根容器放 root 级服务，每个插件 `createScope()` 得到隔离的容器，plugin 级服务在各自容器中实例化；
  - 默认服务工厂只实现三项：配置（环境变量 `FASRUN_<组件>_<名称>`，用 Zod 校验）、日志（pino，每个插件一个带 `plugin` 字段的子日志器）、数据库（pg 连接池 + Drizzle；见 D-7）；外加 httpRouter（把插件路由挂到 `/api/<插件>/v1`）；
  - 其余服务没有默认工厂。插件依赖它们时，启动阶段抛出 `FASRUN_SERVICE_NOT_IMPLEMENTED`（带插件名与服务标识），进程以非零状态退出。
- `contracts-core`：`SfError`（带错误码）与错误码常量、带前缀的 ULID 工具（D-7）、分页与审计上下文的类型。
- `frontend-plugin-api`、`frontend-app`、`ui`：建包，导出占位常量与类型，M3 实现。
- `test-utils`、`cli-templates` 见 D-14、D-6。

### D-5 服务宿主与就绪检查
对应需求：R-platform-004
做法：
- 三个后端宿主都由 `createBackend` 装配，入口 `src/index.ts`，插件清单 `src/plugins.ts`（由脚手架维护，见 D-6）。
- 健康检查由宿主注册，不经插件：`/healthz` 只表示进程存活；`/readyz` 由各宿主提供的就绪检查组成：
  - fasrun-core-svc：`select 1`，超时 2 秒；
  - fasrun-connect-svc：请求 `FASRUN_CONNECT_CORE_URL` 的 `/healthz`，超时 2 秒；不配置任何数据库连接；
  - fasrun-node-svc：进程内初始化（插件装配）完成即就绪；不配置任何数据库连接。
- 日志：pino 输出 JSON，Fastify 的 `genReqId` 取请求头 `x-request-id`，没有则生成 ULID；每条请求日志带 `reqId`。接入 OpenTelemetry 后改为链路标识（2.8，后续里程碑）。
- fasrun-portal-web：Rsbuild 构建的 React 19 占位页面；由一个 Fastify 静态服务提供页面、`/healthz` 与 `/readyz`（静态资源目录可读即就绪）。
- fasrun-dev-cli 见 D-10。

### D-6 插件脚手架
对应需求：R-platform-006
做法：
- `cli-templates` 按角色提供模板目录，文件中用 `{{plugin}}`、`{{Plugin}}` 等占位符，渲染器自己实现（只做占位替换）。`-backend` 模板含 `src/starter`、`src/application`、`src/infrastructure`、`src/common`、`migrations/`、`drizzle.config.ts` 与示例测试。
- `fasrun plugin new <插件> --role <角色>`：
  1. 校验插件名（`^[a-z][a-z0-9-]*$`）与角色（common、node、backend、backend-module-<名称>、web、web-module-<名称>、react），不合法时列出合法值并退出，不写文件；
  2. 目标目录已存在时拒绝；
  3. 先在临时目录渲染，全部成功后再移入 `plugins/<插件>/<插件>-<角色>`；
  4. 注册：后端角色写入宿主 `src/plugins.ts` 中 `// fasrun:plugins:begin` 与 `// fasrun:plugins:end` 之间的导入，并把依赖加入宿主的 `package.json` 与根 `tsconfig.json` 的 `references`。宿主按插件归属选择：connect 归 fasrun-connect-svc，其余归 fasrun-core-svc；`--host` 可以指定。
- 九个能力域插件的 `-common` 与 `-backend` 骨架由该命令生成后提交，生成命令记录在任务的 PR 中。

### D-7 数据库表规范与样例表
对应需求：R-platform-007
做法：
- 每个插件一个 `pgSchema('<插件>')`，表定义在 `src/infrastructure/schema/`，`drizzle.config.ts` 用 `schemaFilter` 只管理本插件的 schema，迁移输出到插件的 `migrations/`。
- 标识：`contracts-core` 提供 `newId(prefix)`、`isId(prefix, value)`，ULID 部分用 Crockford Base32；`backend-defaults` 提供 `idCheck(column, prefix)`，生成 `ck_<表>_id` 检查约束的 SQL。
- 数据库角色：
  - `fasrun_owner`（BYPASSRLS）：拥有各插件的 schema 与表，只用于迁移与基础数据同步（D-8）。FORCE ROW LEVEL SECURITY 对表所有者同样生效，所以迁移与同步需要 BYPASSRLS；
  - `fasrun_app`（NOBYPASSRLS）：服务运行时与 `fasrun seed`（D-15）使用，不拥有任何表，读写一律受行级安全约束。`fasrun migrate` 在创建 schema 后执行 `grant usage` 与 `alter default privileges ... grant select, insert, update, delete on tables to fasrun_app`，插件的迁移不写授权语句。
- 行级安全：每张带 org_id 的表 `enable` 并 `force row level security`，策略为 `org_id = current_setting('fasrun.org_id', true)`；数据库服务提供 `withOrg(orgId, fn)`，在事务内 `set_config('fasrun.org_id', orgId, true)`。没有 org_id 的平台级表不建策略，按 D-9 的例外元数据声明为平台级表。
- Drizzle 不支持 FORCE ROW LEVEL SECURITY 与 COMMENT，这两类语句写在同一插件紧随其后的自定义迁移（`drizzle-kit generate --custom`）中。
- 样例表 `identity.organization`：id（`org_` 前缀）、org_id（与 id 相同，`ck_organization_org_id_self`）、name（text，1–200 字符）、slug（text，`uq_organization_slug`）、deactivated_at、created_at、updated_at、created_by、version；每列写 COMMENT。

### D-8 迁移执行与基础数据同步
对应需求：R-platform-008
做法：
- 迁移执行器放在 `backend-defaults`，由 `fasrun migrate` 与 Helm 的迁移任务调用；以 `fasrun_owner` 连接（`FASRUN_MIGRATE_DATABASE_URL`）。
- 步骤：
  1. `pg_advisory_lock(<固定键>)`，阻塞等待，持有到结束；
  2. 按插件清单的固定顺序逐个处理；每个插件：建 schema（如不存在）、建迁移记录表 `<schema>.schema_migration`（文件名、内容哈希、执行时间）、对 `fasrun_app` 授权；
  3. 按 drizzle-kit 的 `meta/_journal.json` 顺序取未执行的迁移，每个迁移一个事务，成功后记录；已执行的迁移内容哈希变化时报错（迁移只向前）；
  4. 任一迁移失败：回滚该事务，以非零状态退出，不再处理后续插件；
  5. 全部成功后同步基础数据（同样以 `fasrun_owner` 执行，靠 BYPASSRLS 写入各组织范围的基础数据），最后释放锁。
- 报告：每个插件执行了哪些迁移；没有待执行迁移时输出「没有待执行的迁移」。
- 基础数据：插件导出带版本的定义 `{ key, version, table, keyColumn, rows, customizableColumns }`。同步用 `insert ... on conflict (<key>) do update`：Fasrun 自带的列总是更新；`customizableColumns` 只在目标行的 `is_customized` 为 false 时更新；同步记录写入 `<schema>.base_data_sync`，版本未变时跳过。
- M0 的示例定义与示例表只放在 test-utils 的测试插件中，证明可以重复执行、不覆盖定制，不在真实插件中新增表。

### D-9 迁移检查
对应需求：R-platform-009
做法：`tools/migration-check`，作为 CI 作业与本地命令运行，三步都执行，汇总后再决定退出码。
1. squawk 检查所有迁移 SQL；规则配置在 `.squawk.toml`，被排除的规则写明理由。
2. 用 Testcontainers 启动空的 PostgreSQL，执行 `fasrun migrate`；再用 drizzle-kit 计算 Drizzle 表定义与该数据库之间的差异，差异非空即失败，并列出表与列（具体命令以 drizzle-kit 当前版本的文档为准）。
3. 规范检查：查询 `pg_catalog`，对各插件 schema 中的表逐条检查：
   - 约束与索引的命名前缀；
   - 标准列与类型（timestamptz、不用 varchar(n)、不用浮点类型）；
   - id 的前缀检查约束；
   - 启用并强制行级安全；
   - 表与每列都有 COMMENT。

   只追加表、平台级表的例外，由表定义旁导出的元数据声明：只追加表没有 updated_at 与 version；平台级表没有 org_id，不检查行级安全与策略。每个问题指明表名，并按「创建该表的迁移文件」定位到文件。
- 违例样例只放在检查工具自己的测试夹具中。

### D-10 fasrun 命令行
对应需求：R-platform-015
做法：
- `apps/fasrun-dev-cli` 用 oclif（`@oclif/core`），可执行名 `fasrun`。
- 命令与实现所在的包：

  | 命令 | 实现 |
  | --- | --- |
  | `spec validate` | `@fasrun/plugin-spec-common` 中的纯函数 |
  | `spec archive` | 同上 |
  | `migrate` | `backend-defaults` 的迁移执行器 |
  | `seed` | `test-utils` 的数据集 |
  | `plugin new` | `cli-templates` |

- 命令行只负责读写文件、连接数据库与输出；出错时以非零状态退出，`--json` 输出机器可读的结果。

### D-11 规格自检
对应需求：R-spec-001、R-spec-002
做法：
- 解析与校验放在 `@fasrun/plugin-spec-common`，输入是「路径 → 文本」的映射，不直接读文件，以后 spec 后端插件与前端都可以复用。
- 解析结果带行号：
  - 现行规格的需求与场景；
  - 每个变更目录的用户场景与引用、待澄清、规格增量（四个分区）、设计条目与对应需求、任务（编号、并行标记、对应、修改范围、用例、依赖）。
- 2.11 没有给出写法的格式，按以下约定并写入 `fasrun/README.md`：
  - REMOVED 条目下写「原因：…」与「迁移：…」两行；
  - RENAMED 写「- FROM: R-x-001 旧名称」与「- TO: R-x-001 新名称」；
  - 任务行的「—」之后用「；」分段，每段以「对应」「修改范围」「用例」「依赖」开头。
- 错误码与需求的对应：

  | 错误码 | 检查 |
  | --- | --- |
  | SPEC_ID_FORMAT | 编号格式（R-spec-001.S2） |
  | SPEC_NO_SCENARIO | 需求缺少场景（S3） |
  | SPEC_MODIFIED_INCOMPLETE | MODIFIED 不完整，或指向不存在的条目（S4） |
  | SPEC_REMOVED_NO_REASON | REMOVED 缺少原因或迁移方式（S5） |
  | SPEC_OPEN_QUESTIONS | 待澄清不为空（S6） |
  | SPEC_US_COVERAGE | 用户场景没有对应需求（R-spec-002.S1） |
  | SPEC_DESIGN_MAPPING | 设计条目没有对应需求（S2） |
  | SPEC_TASK_COVERAGE | 需求没有任务覆盖；任务没有对应需求（S3） |
  | SPEC_TASK_CYCLE | 任务依赖成环（S4） |
  | SPEC_TASK_UNKNOWN_DEP | 任务依赖不存在的任务（S4） |
  | SPEC_SCOPE | 修改范围越界（S5） |

- 允许的路径由 `fasrun/config.yaml` 的 `allowedPaths` 声明。
- `changes/archive/` 下的目录只检查格式，不检查覆盖。
- 每类错误一个不合格样例，放在 spec-common 的测试夹具中。

### D-12 现行规格骨架
对应需求：R-spec-003
做法：`fasrun/specs/<能力>/spec.md` 共十个能力：九个能力域加 platform。每个文件的结构为「# <能力>」、一段说明、「## Requirements」；需求条目与场景的写法与规格增量相同。自检把没有条目的「## Requirements」视为合法。

### D-13 规格归档
对应需求：R-spec-004
做法：
- `fasrun spec archive <变更目录> [--date YYYY-MM-DD]`，日期默认取 UTC 当天。
- 步骤：
  1. 先对整个规格目录自检；
  2. 在内存中依次应用 ADDED、MODIFIED、REMOVED、RENAMED，遇到冲突即中止；
  3. 对合并后的结果再次自检；
  4. 写临时文件后逐个替换，最后把变更目录移到 `changes/archive/<日期>-<工作编号>-<简述>/`。
- 任何一步失败都不改动文件。

### D-14 测试工具
对应需求：R-platform-010
做法：
- `test-utils`（Apache-2.0）只依赖 `backend-plugin-api` 与 `contracts-core`，不依赖 `backend-defaults`（AGPL-3.0，R-platform-016.S3）。它提供：
  - `startTestBackend({ features, services })`：自带一个精简的测试宿主（Fastify + Awilix），在内存中装配插件，返回可注入请求的 Fastify 实例；
  - `mockServices`：配置、日志、数据库的模拟实现，日志模拟可断言写出的条目。
- 数据库：Vitest 的 globalSetup 用 `@testcontainers/postgresql` 启动一个 PostgreSQL，执行全部迁移后作为模板库；每个测试文件从模板库建一个独立的数据库。各插件的表本来就在各自的 schema 中，测试之间互不影响。
- colima 下，Testcontainers 需要 `DOCKER_HOST` 指向 colima 的 socket，写入开发说明。

### D-15 示例数据集「星河科技」
对应需求：R-platform-011
做法：
- 定义文件在 `test-utils/src/datasets/xinghe/`，按实体分文件：组织、团队、成员、角色分配、机器、工作、执行、预算、安全策略、插件，类型由数据集模块自己定义。
- 内容以 1.6 原型（Figma 文件）为准，实现时逐项对照原型画框；只用原型中的虚构人名。
- 标识：示例数据的 ULID 时间部分固定为全零（如 `org_0000000000` + 16 位），既是合法的 ULID，又是固定前缀，可以按前缀整体清除。
- `fasrun seed --dataset xinghe`：
  - 只写入当前已有表的部分（M0 为 identity.organization），以 upsert 写入，可以重复执行；
  - 以 `fasrun_app`（`FASRUN_DATABASE_URL`）连接，每个组织的数据在 `withOrg(<该组织>, …)` 中写入，与服务一样受行级安全约束，不使用 `fasrun_owner`；
  - 环境由 `FASRUN_ENVIRONMENT` 给出（development、test、staging、production，默认 development）；为 production 时在连接数据库前退出。
- 数据集校验测试检查数量（组织 1、团队 4、内置角色 14、SF-1051 的执行 3）与前缀。

### D-16 CI 合并门槛与每日完整集
对应需求：R-platform-012
做法：
- `.github/workflows/ci.yml` 在 `pull_request` 与推送到 main 时运行；`.github/workflows/nightly.yml` 每日定时运行，也可以手动触发。
- 全部工作流顶层声明 `permissions: contents: read`，需要写权限的作业单独声明。第三方 Action 固定到提交 SHA；不使用 `pull_request_target`。
- ci.yml 的作业（作业名即必须通过的检查名）：

  | 作业 | 内容 |
  | --- | --- |
  | typecheck | `tsc -b` |
  | lint | ESLint（含依赖方向） |
  | format | Prettier 检查 |
  | commitlint | PR 中的全部提交 |
  | test | 单元与集成测试；application 层行覆盖率阈值 80% 写在 Vitest 配置中 |
  | migration-check | D-9 |
  | spec-validate | `fasrun spec validate fasrun/` |
  | changesets | `changeset status --since=origin/main`；修改了包源码而没有 changeset 时失败 |
  | spec-first | 「先规格后代码」检查（见下） |
  | gitleaks | 用 gitleaks 命令行扫描（gitleaks-action 对组织账号需要付费许可，不使用） |
  | trivy | 依赖与镜像扫描，严重级别为 CRITICAL 时失败；生成 CycloneDX 格式的 SBOM，作为构件上传 |
  | license-check | 许可声明一致性（D-19） |
  | dco | 外部贡献者的 DCO 签名（D-19） |

- spec-first 由 `tools/scripts/spec-first` 实现：
  - 改动文件全部位于 `fasrun/`、`docs/`、`*.md` 或 `.github/` 时通过；
  - 否则要求标题匹配 `^SF-(\d+) T(\d{3})`，且 main 上存在 `fasrun/changes/SF-<n>-*/tasks.md`，其中有该任务；
  - 失败时说明缺什么。
- nightly.yml：在 ubuntu 运行器上安装 k3d 与 Helm，执行 deploy/k3d 的部署脚本与冒烟测试（三个集群内服务的 /readyz）。

### D-17 容器镜像
对应需求：R-platform-013
做法：
- 每个镜像一个 Dockerfile，放在 `deploy/docker/`：fasrun-core-svc、fasrun-connect-svc、fasrun-portal-web，以及 fasrun-dev-cli（供迁移任务使用）。
- 多阶段构建：构建阶段 `node:24-bookworm-slim`，执行 `pnpm install --frozen-lockfile`、构建，再用 `pnpm deploy` 导出生产依赖；运行阶段使用 distroless 的 Node.js 24 非 root 镜像（uid 65532）。
- 镜像标签为构建内容的哈希，内容不变则标签不变。

### D-18 Helm 部署与 k3d 一键脚本
对应需求：R-platform-014
做法：
- 分三个 Helm release 安装，顺序固定：
  1. CloudNativePG 运营者：上游 chart，固定版本，命名空间 cnpg-system；
  2. `deploy/helm/fasrun-database`：单实例 Cluster（只建 Fasrun 数据库），用托管角色建 `fasrun_owner`（`bypassrls: true`）与 `fasrun_app`（`bypassrls: false`，即 NOBYPASSRLS），两者都不是超级用户、不能建库建角色；密码放在部署时生成的 Secret 中（不入库）；
  3. `deploy/helm/fasrun`：fasrun-core-svc、fasrun-connect-svc、fasrun-portal-web 与迁移任务。
- 拆分理由：
  - Cluster 资源依赖运营者的 CRD；
  - 迁移任务作为 `pre-install,pre-upgrade` 钩子运行时，数据库必须已经存在；
  - 放在同一个 release 中，首次安装会失败。
- 迁移任务失败时 Helm 中止，Deployment 不更新，服务保持原版本。
- 服务的存活探针用 /healthz，就绪探针用 /readyz。
- 「fasrun」chart 的 values 中为 Keycloak、可观测后端、TokenHub、备份留出键与说明，默认关闭，暂无模板。
- `deploy/k3d/up.sh`：
  1. 集群 fasrun-dev 不存在时创建：API 端口绑定 127.0.0.1，不映射其他端口；
  2. 构建镜像并 `k3d image import`；
  3. 依次 `helm upgrade --install` 三个 release；
  4. 等待 Cluster 就绪与所有 Pod 就绪；
  5. 用绑定 127.0.0.1 的 port-forward 检查三个服务的 /readyz。

  重复执行时：镜像标签不变；迁移任务报告没有待执行的迁移；Pod 不重建。

### D-19 许可证与贡献签名
对应需求：R-platform-016
做法：
- 根目录 `LICENSE` 为 AGPL-3.0 全文；插件开发用包各放 Apache-2.0 全文的 `LICENSE`。各包的 `license` 字段由脚手架（D-6）按角色写入：插件开发用包 `Apache-2.0`，其余 `AGPL-3.0-only`。
- `tools/scripts/license-check`：
  - 按包名与角色计算应有的许可，核对 `license` 字段与 LICENSE 文件；
  - 检查声明为 Apache-2.0 的包的 `dependencies` 与 `peerDependencies` 中没有 AGPL-3.0-only 的工作区包；
  - 输出包名与问题。
- `dco` 作业：
  - 读取 PR 的 `author_association`，为 OWNER、MEMBER、COLLABORATOR 或 PR 作者是本仓库的 GitHub App 时直接通过；
  - 否则检查 PR 中每个提交都有与提交作者一致的 `Signed-off-by` 行，列出缺少签名的提交；
  - 规则本身作为纯函数单元测试，覆盖 R-platform-016.S4、S5。
- CONTRIBUTING.md 说明许可、DCO 签名方法（`git commit -s`）与插件开发用包的 Apache-2.0 例外。

## 接口与数据的变化
- **HTTP：** fasrun-core-svc、fasrun-connect-svc、fasrun-node-svc、fasrun-portal-web 各自提供 `GET /healthz`、`GET /readyz`。
- **数据库：**
  - 新建 schema identity，表 identity.organization（D-7）；
  - 每个插件 schema 中的 `schema_migration` 与 `base_data_sync`；
  - 角色 `fasrun_owner`（BYPASSRLS，只用于迁移与基础数据同步）、`fasrun_app`（NOBYPASSRLS，服务与 `fasrun seed`）。
- **环境变量：**
  - `FASRUN_CORE_DATABASE_URL`、`FASRUN_CORE_PORT`；
  - `FASRUN_CONNECT_CORE_URL`、`FASRUN_CONNECT_PORT`；
  - `FASRUN_NODE_PORT`；
  - `FASRUN_PORTAL_PORT`；
  - `FASRUN_MIGRATE_DATABASE_URL`、`FASRUN_DATABASE_URL`、`FASRUN_ENVIRONMENT`（2.1 命名规范：命令行读取的变量不带组件段）。
- **命令：** `fasrun spec validate`、`fasrun spec archive`、`fasrun migrate`、`fasrun seed`、`fasrun plugin new`。
- **规格目录：** `fasrun/config.yaml`（allowedPaths）、`fasrun/README.md`（格式约定）、`fasrun/specs/` 下十个能力。

## 影响范围
- 新仓库的全部初始结构：apps/、packages/、plugins/、tools/、deploy/、docs/、fasrun/、.github/。
- 合并后，main 的 ruleset 需要加入 D-16 的检查名作为必须通过的检查（由 PontusAI 在 GitHub 中设置）。
- 后续里程碑在本骨架上增加插件、表与服务；插件包角色与依赖方向规则从本工作起生效。

## 风险与回退
| 风险 | 应对 |
| --- | --- |
| TypeScript 7 与 typescript-eslint 不兼容 | 固定 6.0 系列；升级作为单独的工作 |
| drizzle-kit 1.0 仍是候选版 | 使用 0.31 正式版；表定义与迁移的写法以该版本文档为准 |
| `minimumReleaseAge` 挡住刚发布的版本 | 只选发布超过 7 天的版本；确需例外时在 PR 中说明 |
| CNPG 的 CRD 与安装顺序 | 拆成三个 release（D-18）；部署脚本按顺序等待 |
| Testcontainers 在 colima 下找不到 Docker | 开发说明与测试配置中设置 `DOCKER_HOST`；CI 在 ubuntu 运行器上直接使用 Docker |
| squawk 规则误报 | 在 `.squawk.toml` 中排除并写明理由，由设计评审人确认 |
| 每日完整集在 Actions 中超时或资源不足 | 冒烟只部署 M0 的组件；失败时保留日志构件 |

- 回退：本工作只新增文件，每个任务一个 PR；任一 PR 可以单独回退。数据库只有样例表，回退时删除 fasrun-dev 中的数据库即可重建。

## 项目长期约束检查
Fasrun 单仓的项目长期约束以根目录的 Fasfile 为准（SF-2 引入，2.11）。

| 约束 | 本设计 | 是否满足 |
| --- | --- | --- |
| 2.1 技术栈：Fastify 5、Awilix、Zod、Drizzle、pino、oclif、pnpm、Turborepo、tsdown、Changesets、ESLint、Prettier、Vitest | D-1、D-2、D-4、D-5、D-10 | 满足。TypeScript 固定 6.0 系列（见风险） |
| 2.1 工程目录与插件包角色 | D-1、D-6 | 满足 |
| 2.1 后端插件四层结构 | D-6 模板 | 满足 |
| 2.1 依赖规则 1：插件之间只依赖 -common、-node、-react，由 ESLint 检查 | D-2 | 满足 |
| 2.1 依赖规则 2：插件只读写自己的 schema | D-7、D-8：每个插件一个 schema，迁移按插件执行 | 满足；跨 schema 访问的运行时限制留到 M1 的数据库角色细分 |
| 2.1 依赖规则 3：行类型不出 infrastructure 层 | D-6 模板的示例按此书写 | 部分满足：M0 没有自动检查，由评审把关；建议后续在依赖方向规则中加入层间检查 |
| 2.1 依赖规则 4：starter 只做装配 | D-6 模板 | 满足（评审把关） |
| 2.1 命名规范 | D-5 环境变量、D-7 表与约束、D-10 命令 | 满足 |
| 2.3 分支与提交、评审与合并 | D-2 commitlint、D-3 CODEOWNERS 与批准分工、D-16 门槛 | 满足；批准分工在自举 A 阶段靠约定，M1 起由授权记录强制 |
| 2.3 代码规范：类型化错误、结构化日志、测试与源码放在一起、application 层覆盖率下限 | D-4 SfError、D-5 pino、D-16 | 满足 |
| 2.3 数据库的部署与迁移：咨询锁、每个 schema 的迁移记录、失败即停、升级前任务、迁移检查 | D-8、D-9、D-18 | 满足；「在上一版本结构上执行新迁移并跑上一版本的测试」在 M0 没有上一版本，从第一次带迁移的发布起加入 |
| 2.3 初始数据：基础数据随迁移同步、不覆盖定制；示例数据在正式环境拒绝 | D-8、D-15 | 满足 |
| 2.4 数据库设计规范与表设计模板 | D-7、D-9 | 满足；另加 FORCE ROW LEVEL SECURITY、非所有者的 `fasrun_app`（NOBYPASSRLS），`fasrun_owner` 的 BYPASSRLS 只用于迁移与基础数据同步 |
| 2.6 依赖的供应链风险：锁定版本、最短等待期、默认不执行安装脚本 | D-1 | 满足 |
| 3.1 application 层行覆盖率不低于 80% | D-16 | 满足；安全相关代码的分支覆盖率要求从 M1 起适用 |
| 公开仓库不入库密钥、令牌、内部主机名与 IP | D-3、D-16 gitleaks、D-18 Secret 在部署时生成 | 满足 |
| 只用开源许可的免费功能 | 全部依赖为 MIT / Apache-2.0；不使用 gitleaks-action | 满足 |
| 许可证：根目录 AGPL-3.0，插件开发用包 Apache-2.0，外部贡献者 DCO（#2） | D-19、D-14 | 满足 |
| 端口只绑定 127.0.0.1 | D-18 | 满足 |
