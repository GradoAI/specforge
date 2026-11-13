# SF-7 CLI 构建产物生命周期设计

## 已批准输入与故障事实

需求层 [#65](https://github.com/fasrun/fasrun/pull/65) 已合入 `d5f8dba5`；本设计基于 `035e0b01`，不改需求增量 R-platform-001.S1–S4，不修改 SF-5 业务。工作入口 [#64](https://github.com/fasrun/fasrun/issues/64)。本层只定设计，设计人工合入后再提交任务层；尚未交付实现或修复验收。

队列 [43253437830](https://github.com/fasrun/fasrun/actions/runs/43253437830) 的 test job 131305178603 报 `apps/fasrun-dev-cli/dist/index.mjs` 缺失。基线真实 Turbo 图内 CLI build 与 CLI test 没有互相依赖；CLI package 的两条脚本都执行相同 tsdown，后者随后运行 Vitest。migration-check 的 workspace 依赖和 `^build` 会将 CLI build 加入根 test 图。默认清理使两个任务可能删除同一产物。

已有隔离实验运行真实 tsdown 与真实 CLI，在 `dist/index.mjs` 被清理后设置最长20秒屏障：构建前CLI成功、屏障内报ERR_MODULE_NOT_FOUND、释放构建后CLI成功。它证明双写与清理窗口能触发同类错误；分组CI日志不能证明具体删除进程或精确时刻，也不能将所有历史CLI失败归为此因。详细诊断由工作#64关联；后续实现PR保存可复现用例与实际结果。

### D-1 单生产者与显式消费者依赖
对应需求：R-platform-001

在根 `turbo.json` 为 `@fasrun/fasrun-dev-cli#test` 定义包级任务，显式 `dependsOn: ["^build", "build"]`，保留测试覆盖率输出。通用 build 的 `^build` 与 `dist/**` 输出保持不变。CLI `package.json` 的 build 保留现有 tsdown 命令与默认clean，test改为只执行 `vitest run`。不在test、pretest或其他隐式钩子中重建CLI；一次任务图内CLI build是该目录唯一生产者。

CLI test等待自身build及上游成功。migration-check test继续通过其现有CLI workspace依赖和`^build`等待同一个CLI build；两消费者无需彼此排序，可同时运行。无关包仍可并行；不采用全局concurrency=1、关闭clean、缓存旁路、重试或扩大超时掩盖缺陷。

核对真实 `tools/migration-check/prepare.mjs`：它安装锁定工具、生成自身 `dist/schemas` 和自身CLI/worker，未写 `apps/fasrun-dev-cli/dist`，因此不改该准备流程。现有 migration-check build 的 `--no-clean` 是既有工具行为，不是本修复给共享CLI关闭clean。保留真实迁移CLI调用与数据库断言，不因无容器回归替代它们。

### D-2 成功前置、缓存与包级入口
对应需求：R-platform-001

标准CI `pnpm test` 使用Turbo默认失败停止语义；保留此入口。需要继续收集无依赖任务结果时，使用 `pnpm test --force --continue=dependencies-successful`，依赖失败的消费者不得启动、其他已满足前置的任务仍可运行，整体保留非零退出。AGENTS.md本地检查仅将裸`--continue`明确为该值；不改其他纪律或CI门禁。

已安装Turbo 2.11.10的帮助与[官方run说明](https://turborepo.dev/docs/reference/run#--continueoption)一致：裸`--continue`等同`always`，会运行失败依赖的后继，不能用它声称“构建失败不运行消费者”。用默认模式及`dependencies-successful`分别做失败注入验收；`--only`、`--parallel`或显式`always`绕过依赖的诊断调用不列为受支持测试入口。生产者/消费者修复仍依赖D-1，不能只换失败参数。

设计阶段已在临时工作区用真实Turbo 2.11.10及故意退出23的合成生产者做三组失败探针：默认模式不启动依赖消费者；裸`--continue`实际启动该消费者；`dependencies-successful`不启动它且独立任务完成，三组整体均返回23。该证据只验证调度参数，不冒充真实CLI生命周期修复验收。首次探针错误组合`--cache`与`--force`被CLI拒绝，修正实验参数后取得上述结果，未修改产品。脚本及原始输出由实现工作证据保留。

包级推荐入口在仓库根执行 `pnpm exec turbo run test --filter=@fasrun/fasrun-dev-cli --force`，由任务图取得自身及上游build。直接 `pnpm --filter @fasrun/fasrun-dev-cli test` 明确定义为消费已完成的产物；从无产物状态必须先执行 `pnpm exec turbo run build --filter=@fasrun/fasrun-dev-cli`，成功后再执行直接测试。文档用`set -euo pipefail`的顺序命令，不用会忽略前置失败的分隔方式。原始 `vitest run` 不承诺自动构建。

冷启动删除隔离副本输出及本地缓存后执行；强制无缓存用`--force`；缓存恢复先成功填充隔离本地cache，再删除输出并重跑相同图，确认CLI build命中缓存且恢复入口后消费者启动。保留 `dist/**` 缓存声明。保证限定同一Turbo任务图；独立终端同时启动两个写同一工作树的命令仍须由操作者隔离或顺序执行，本工作不增加跨进程全局锁。

### D-3 有界真实CLI回归与失效证明
对应需求：R-platform-001

回归落在tools/scripts的现有Vitest测试链，新增专用生命周期测试及所需测试夹具，不修改产品CLI逻辑。测试检查仓库实际 `turbo run test --dry=json` 的CLI build/test及migration-check test依赖可达关系，确认只有CLI build声明真实tsdown生产命令，test没有重复构建。不能只读取预先写死的理想图。

动态部分使用测试临时目录中的隔离仓库副本，复制本轮CLI源码、配置与必要上游产物/只读依赖；所有输出、缓存、屏障与标记只写副本。运行固定版本真实Turbo、真实tsdown和 `apps/fasrun-dev-cli/bin/run.js`；不写开发者工作树，不递归执行根全套测试。测试用消费者探针代替副本的完整Vitest套件，仅在真实任务图已核对的依赖关系上观测开始/结束，并真正启动CLI `--version`或无数据库规格命令。探针不声称完成数据库迁移验收；原migration-check集成套件仍必须单独通过。

确定性屏障放在真实tsdown已清理入口且重写前，以进程间确认控制调度，不靠随机sleep或概率压测。修复后生产者阻塞期间两个消费者均不得产生启动标记；释放并完成构建后，两消费者均实际运行CLI并成功。标记记录构建清理、完成、消费者开始与结果，不从Turbo分组日志推断事件顺序。

在副本恢复旧双写配置或移除自身依赖边，作为失效检查：屏障窗口内的真实CLI必须可复现缺失或顺序断言失败；恢复修复配置后通过。失败注入在生产者已清理后、输出恢复前使其非零结束，并验证默认及`dependencies-successful`两模式无消费者启动（即使先前有旧dist也不能用它冒充成功）。独立任务仍可在允许继续模式完成。

每个屏障、子进程及整组实验有明确截止时间，超时即失败；finally释放屏障、终止残留子进程并清理临时目录。使用有界等待而非无限重试，不放宽现有产品用例超时。记录冷/force/缓存恢复的任务状态、实际CLI结果与输出摘要；缓存恢复必须验证CLI build实际命中，不能把重建成功当作命中。

### D-4 影响范围与交付证据
对应需求：R-platform-001

以下是任务层应收敛的精确落点，不是设计层代码授权：

| 路径 | 必要变化 |
| --- | --- |
| `turbo.json` | CLI test包级自身build依赖与保留上游依赖/输出 |
| `apps/fasrun-dev-cli/package.json` | test移除重复tsdown，仅消费产物 |
| `apps/fasrun-dev-cli/README.md` | 包级入口、直接测试前置及同一图保证边界 |
| `AGENTS.md` | 本地测试命令仅明确安全continue策略，保留其他规则 |
| `tools/scripts/src/cli-build-lifecycle.test.ts` | 实际任务图、隔离真实构建/CLI及缓存/失败回归 |
| `tools/scripts/src/fixtures/cli-build-lifecycle/` | 仅测试所需屏障与探针；不放产品命令替身 |
| `.changeset/` | 仅在实际包变更按仓库既有检查需要时说明；不借此改版本策略 |

不修改根package.json、pnpm锁/依赖版本、migration-check产品/prepare、CI工作流或保护规则；使用仓库已安装工具，不新增依赖。若实现发现必须增加路径，先说明实际证据并按既有范围流程处理，不能以本表扩大至整个tools或apps。任务层另明确规格进度/交付记录的范围，设计层不提前定义任务编号。

| 场景 | 设计覆盖 | 后续验证 |
| --- | --- | --- |
| R-platform-001.S1 | D-1/D-2 | frozen install、build、typecheck保持；从无产物恢复 |
| R-platform-001.S2 | D-4 | pnpm安装脚本/依赖配置不变，保留现有安装安全回归 |
| R-platform-001.S3 | D-1/D-2/D-3 | 实际图单生产者；两消费者；冷/force/cache；原缺陷失效检查；构建失败不启动后继 |
| R-platform-001.S4 | D-2/D-3 | 文档推荐包级命令从无产物通过，直接入口的成功构建前置可执行 |

保留所有原CLI与迁移测试，不将生命周期无容器探针冒充完整迁移检查。测试命名及用例编号由任务层分配，已有TC-PLATFORM-001/002与其他编号不重排。验证记录区分本地标准入口、显式Colima变量的替代入口、PR CI、实际merge_group及main；没有发生的队列/主干运行记为待核验，不用重跑成功覆盖历史失败。#17的Colima环境问题及其他限制继续保留。

## 项目约束与评审

仅处理构建消费顺序，不涉及M1业务、数据库迁移或CLI命令语义。受影响文件先经任务层确认，回归先证明缺陷再验证修复；安全相关安装规则、Changesets及所有门禁保持。设计由zjh1978评审并人工合入，随后才编制任务；如后续确需`.github/`变化，另明确范围并请PontusAI放行。本设计不批准、入队、合并或实施代码。
