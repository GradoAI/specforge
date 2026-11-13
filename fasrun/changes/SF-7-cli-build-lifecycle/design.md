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

#### 原生CI单次诊断设施（范围修订，尚未实施）

2026-11-13用户在执行会话明确接受[#64最小设施方案](https://github.com/fasrun/fasrun/issues/64#issuecomment-6850574718)，授权“先仅修订SF-7 D-3/D-4与T001的精确范围”；用户确认不是GitHub批准。现有生命周期实现及历史证据保留；#96/#94出现的六包真实构建60秒截止根因仍为UNPROVEN。此补充只授权后续诊断设施的设计边界，不预报实现或修复结果，不重新决定R-platform-001.S1–S4业务验收。

诊断设施仅由人工workflow_dispatch触发，一次运行无矩阵、循环、自动重试或自动后续触发。不是必需检查，不写#96的check/status，不批准、入队或合并；原CI、保护规则和业务PR保持不变。须先实际人工合入本规格修订，再实施设施；设施代码经对应人工评审且实际合入后，才允许人工发起一次有界取证。预检失败也结束本次运行，不自动再次调度。

**固定输入与隔离。** 目标为失败运行43405544342/attempt1/test131818888492实际checkout `b59b9f4b588d4aa819baa071fec8b902692fa884`，其来源PR HEAD `88e5c18fe1a5bb2acad97a7fe320c020663aa834`、base `101cb1807411eb834e6ce940dbe5324671e1d09a`；目标tree必须为 `ed499ca7e027965a564a0517922d49c74ed18bbe`（已核实与PR HEAD tree相同）。无任意SHA/仓库/命令输入；目标不可取、tree不符即停止，不降级为最新main。另记录设施/工作流提交及工具版本；设施脚本从已合入的设施提交取出，在RUNNER_TEMP执行，不覆盖、补丁修改或加入目标的git ls-files。安装及测试前后核对受控源码与受控文件清单，允许原构建写忽略的产物及原夹具写临时目录，不把“只读”误解释为禁止测试必要输出。

**原入口与预算。** 使用原生x64 ubuntu-24.04 runner、Node24.22.2、目标packageManager与冻结锁安装；沿用原固定版本Actions。根命令仍为`pnpm test`，不加filter/force/concurrency或改变缓存策略；六包原build命令、真实DTS、全套断言及原失败停止行为均保留。现有六包为backend-defaults、backend-plugin-api、cli-templates、contracts-core、plugin-spec-common、test-utils；启动前验证闭包与原命令而非以这份名单替代真实图。保留job20分钟、单命令60秒、夹具总220秒、屏障45秒、完成30秒、wrapper240秒、Vitest245秒及其余既有截止，不用诊断设施延长被测过程。采集的准备/收尾也在同一job预算内。只做无执行dry解析，不预热构建。

**预检与完整退出证据。** 采集器须在测试启动前通过短合成进程探针，证实能识别进程启动、PID复用、exec/父子及进程组关系、正常/非零/信号退出，特别是SIGKILL和短命子进程；仅Node exit回调或/proc轮询不足以宣称完整。系统级进程/等待/信号跟踪可配合200ms的/proc及系统/cgroup采样；具体后端在实现时记录版本与权限，不临时安装未审核工具，不放宽runner或仓库权限。后端不可用、权限不足、退出事件不完整或无法安全采集时，预检非零结束且不得启动pnpm test。工具能力未交付，不能把本条规范写成已有检查能力。

**证据语义。** 使用单调时钟和UTC对齐任务图、调度/依赖等待、exec/exit、CPU、RSS、I/O/压力、内存事件及进程组收束；按PID+启动时刻识别进程。保留原全仓并发背景及六包实际路径，区分未启动、取消、超时和未观察到结束；完整关键路径必须有对应图和事件支持。记录采集自身CPU、采样频率、时间精度、丢失事件及探针开销，短进程资源取不到时标明界限，不编造RSS或CPU。原测试退出码与取证完整性分别报告，原非零不被吞掉；测试通过但采集失败/缺事件仍为取证不完整，不能写根因已修复。

**安全与收束。** 权限仅contents:read，checkout不持久化凭据；不读额外secret、不发布外部check/status、不改保护。仅收集允许字段，不导出完整环境、认证信息、请求正文或任意文件内容；路径及可能含密钥的参数先脱敏，原始敏感数据不上传。诊断产物有总量上限64MiB和7天保留期；达到上限停止追加采集并显式记缺失，不能把截断当完整，不通过杀死被测过程改变原预算。正常/失败/取消路径先收束采样和跟踪进程，保留原fixture finally及先收束后删目录顺序；不得抢先删除目标资源。硬中止无法保存的证据如实记缺失，不承诺任意逃逸进程组的daemon回收。

记录runner image/内核/架构、CPU型号/配额、内存、Node/pnpm/Turbo/tsdown/TS、cache key与hit、checkout/tree和设施SHA。runner image不可重建、manual与pull_request事件差异、探针开销均单列；不得将诊断成功作为#96原attempt成功或门禁替代。本次有效执行结束即回传#64；根因未证明不提出猜测性修复，不重复本机实验或运行求绿。仅在证据定位具体原因后按原归属提出最小修法。

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
| `.github/workflows/sf7-native-diagnostics.yml` | 仅人工单次诊断入口；固定目标、只读权限、原入口/预算、预检及脱敏产物保存；不成为required check |
| `tools/scripts/src/fixtures/cli-build-lifecycle/diagnostics/collect.mjs` | RUNNER_TEMP内预检、外部进程/资源采集、上限与收束；不改目标源码 |
| `tools/scripts/src/fixtures/cli-build-lifecycle/diagnostics/analyze.mjs` | 归并图、任务时序/关键路径与CPU/RSS/调度/退出；不完整明确失败 |
| `tools/scripts/src/fixtures/cli-build-lifecycle/diagnostics/diagnostics.test.ts` | 短合成进程、拒绝边界、固定输入/命令/预算、脱敏/丢样/收束自测 |

除上述唯一人工诊断工作流外，不修改现有CI/nightly工作流、根package.json、pnpm锁/依赖版本、migration-check产品/prepare或保护规则；使用已安装工具，不新增依赖。诊断设施增量仅限新增的四个精确文件，不据原T001历史路径重新修改已交付CLI/Turbo/夹具逻辑。若实现发现必须增加路径，先说明实际证据并按既有范围流程处理，不能以本表扩大至整个tools或apps。任务层另明确规格进度/交付记录的范围，设计层不提前定义任务编号。

| 场景 | 设计覆盖 | 后续验证 |
| --- | --- | --- |
| R-platform-001.S1 | D-1/D-2 | frozen install、build、typecheck保持；从无产物恢复 |
| R-platform-001.S2 | D-4 | pnpm安装脚本/依赖配置不变，保留现有安装安全回归 |
| R-platform-001.S3 | D-1/D-2/D-3 | 实际图单生产者；两消费者；冷/force/cache；原缺陷失效检查；构建失败不启动后继 |
| R-platform-001.S4 | D-2/D-3 | 文档推荐包级命令从无产物通过，直接入口的成功构建前置可执行 |

原生诊断仅扩展R-platform-001.S3的故障证据手段，D-3/D-4→T001→TC-SF7-DIAG-001–004；原S1–S4及全部旧用例不变。确认来源及方案见D-3，设施/一次人工取证的实际结果后续集中关联#64，不在本规格中预记成功。

保留所有原CLI与迁移测试，不将生命周期无容器探针冒充完整迁移检查。测试命名及用例编号由任务层分配，已有TC-PLATFORM-001/002与其他编号不重排。验证记录区分本地标准入口、显式Colima变量的替代入口、PR CI、实际merge_group及main；没有发生的队列/主干运行记为待核验，不用重跑成功覆盖历史失败。#17的Colima环境问题及其他限制继续保留。

## 项目约束与评审

仅处理构建消费顺序，不涉及M1业务、数据库迁移或CLI命令语义。受影响文件先经任务层确认，回归先证明缺陷再验证修复；安全相关安装规则、Changesets及所有门禁保持。设计由zjh1978评审并人工合入，随后才编制任务；如后续确需`.github/`变化，另明确范围并请PontusAI放行。本设计不批准、入队、合并或实施代码。
