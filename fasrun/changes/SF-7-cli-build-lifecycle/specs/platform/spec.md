## MODIFIED Requirements

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

#### Scenario: R-platform-001.S3 构建产物的生产与测试消费有序
- GIVEN 同一次标准任务图内，CLI 测试与迁移检查消费 CLI 构建产物
- WHEN 执行冷构建、强制无缓存测试或从缓存恢复构建产物
- THEN 共享输出目录只有一个生产任务；消费者等待其成功后执行，不与该目录的构建清理并发；构建失败不运行消费者
#### Scenario: R-platform-001.S4 包级测试入口明确构建前置
- GIVEN 开发者只运行 CLI 的测试
- WHEN 从无构建产物的仓库按文档执行包级测试入口
- THEN 入口通过任务依赖获得 CLI 及其上游构建，或显式先构建再测试；不得暗中与另一生产任务重写共享输出
