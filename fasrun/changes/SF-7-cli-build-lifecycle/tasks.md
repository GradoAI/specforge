# SF-7 CLI 构建产物生命周期任务

初始任务层提交背景（历史）：需求#65、设计#70已人工合入；任务基线main `34539049070f07bf0c681ffcec0c491d11578b43`。本层保留已批准需求与设计，任务层人工合入前不实施代码。

## 任务清单

- [x] T001 CLI单生产者编排、包级入口与真实生命周期回归 — 对应 R-platform-001、D-1、D-2、D-3、D-4；修改范围 turbo.json、apps/fasrun-dev-cli/package.json、apps/fasrun-dev-cli/README.md、AGENTS.md、tools/scripts/src/cli-build-lifecycle.test.ts、tools/scripts/src/fixtures/cli-build-lifecycle/、.changeset/；用例 TC-PLATFORM-001（R-platform-001.S1）、TC-PLATFORM-002（R-platform-001.S2）、TC-SF7-PLATFORM-001（R-platform-001.S3）、TC-SF7-PLATFORM-002（R-platform-001.S4）

## T001 实施与完成断言

这是一个紧耦合修复：CLI test移除内联tsdown与其自身build依赖必须同PR交付，真实回归证明两者同时生效。仅拆成不同PR会留下缺少产物前置或仍有双生产者的中间状态，因此本工作不人为拆分可独立交付任务。

- `turbo.json`仅增加CLI test包级 `dependsOn: ["^build", "build"]`，保留coverage输出、通用`^build`及`dist/**`；CLI package test只执行Vitest，build原命令与默认clean不变，不添加pretest重复构建。migration-check仍经原workspace依赖等待同一个CLI build。
- README只补构建/测试入口与边界；AGENTS.md仅将本地测试命令裸`--continue`改为`--continue=dependencies-successful`，不改其他纪律。标准CI默认`pnpm test`不变，显式绕过依赖的参数不列为受支持入口。
- 保留所有原CLI与迁移断言。TC-SF7-PLATFORM-001从实际仓库dry-run取得CLI build/test与migration-check test依赖图，证明单生产者和两个消费者成功前置，而不是只核对静态理想配置。
- 在临时隔离副本使用真实Turbo、tsdown与bin/run.js，以真实清理后的有界屏障观察启动标记；生产者停在屏障时消费者均未启动，完成后两者真实CLI调用成功。按D-3使用无数据库消费者探针避免递归全库测试，完整migration-check真实集成套件仍另行运行，不把探针算成迁移验收。
- 冷构建、force无缓存、缓存恢复分别取证。缓存恢复必须确认生产任务实际命中本地隔离缓存，并恢复入口后再消费；不能以重新构建通过充当缓存命中。
- 在隔离副本恢复原双写/缺少依赖配置，保留原缺失或顺序失败证据；恢复修复配置后通过。生产者在清理后失败时，默认和`dependencies-successful`两模式均不启动依赖消费者且整体非零，后者仍允许独立任务完成；旧dist不能使失败前置被当成功。
- 每个子进程、屏障和实验总时长有有限截止；失败清理屏障、子进程及临时目录。不得无限重试、全局串行、跳过用例、关闭CLI clean或扩大既有用例超时。新实验的有限预算由真实步骤所需时间设定并记录，不修改其他测试超时。
- TC-SF7-PLATFORM-002从无产物副本运行文档推荐包级Turbo入口，取得自身及上游build后测试；另验证显式先build成功再直接包测试的顺序入口。直接`vitest run`不隐式构建，共享工作树独立终端并发写不在同图保证内。
- 保持TC-PLATFORM-001/002既有构建、类型检查与安装脚本安全回归；不新增外部依赖、不改锁文件。Changesets仅按本任务实际包变化及既有门槛需要补充，不改发布策略。

## 验证与追溯

| 场景 | 设计 | 稳定用例 | 实际验证位置/证据 |
| --- | --- | --- | --- |
| R-platform-001.S1 全新构建 | D-1、D-2 | TC-PLATFORM-001 | 既有构建检查不移动；frozen install、build、typecheck，冷副本产物验证 |
| R-platform-001.S2 安装脚本默认不执行 | D-4 | TC-PLATFORM-002 | 保留既有工具回归及pnpm安全配置，受影响测试与安装结果 |
| R-platform-001.S3 生产消费有序 | D-1、D-2、D-3 | TC-SF7-PLATFORM-001 | `tools/scripts/src/cli-build-lifecycle.test.ts`及专用夹具：实际DAG、两消费者、冷/force/cache、反例和失败阻断 |
| R-platform-001.S4 包级前置明确 | D-2、D-3 | TC-SF7-PLATFORM-002 | 同一生命周期测试及README准确命令：无产物入口、上游前置、失败非零 |

实现PR记录具体命令、HEAD、退出码、缓存状态、屏障事件与反例失败原因；完整CLI/迁移测试仍按原入口验证。至少执行frozen install、typecheck、lint、format、无缓存测试、规格validate/check、changesets、gitleaks及适用commit检查。标准本机入口与显式Colima变量的替代入口分别记录；Linux PR CI、实际合并队列和main结果分开回写，尚未发生的结果不得声称通过。TC-PLATFORM-039已有5秒预算超限仅作历史记录，本任务不修改该用例、其预算或门禁；一次重跑成功不算根因修复。#17环境变量限制不包含在本修复。

## 并行、共享文件与阶段边界

T001无未合入的外部任务依赖，任务层人工合入后即可独立开展；不依赖SF-5 T006/T007评审。测试与代码可在同一隔离工作树内协调，但只由一个写入者维护turbo.json、CLI package/README及AGENTS.md，同PR完整交付。数据库/容器验证与其他工作预约资源；无容器生命周期测试不全局阻塞其他已就绪任务。

只授权清单中的精确路径及用途；不改根package.json、pnpm-lock.yaml、migration-check产品/prepare、.github/、保护规则、SF-5业务或历史归档。`fasrun/config.yaml`本任务层PR仅追加准确`AGENTS.md`允许路径，使D-4已批准路径可被机械校验；不授权T001任意修改该配置。

任务/设计编号保持稳定，现行TC编号不重排。T001代码PR不凭本任务授权改规格进度；人工合入后用独立规格进度记录回写T001完成、代码PR及真实CI证据，再按既有归档流程处理，不把任务层PR当实现或归档批准。需求由PontusAI、设计/任务/代码由zjh1978按既定分工评审；本任务无新增CI检查接入事项。agent不批准、入队或合并。

## T001 实际交付与集成记录

代码 [#78](https://github.com/fasrun/fasrun/pull/78) 已于 2026-11-13T05:09:59Z 由人工合入，main 提交 `f6ded99c218e14538b90f44a1369a68d3cabbf51`。T001 勾选表示本任务代码已实际交付，不改变上述任务定义，不表示后续 main 全量门禁已经成功。需求 #65、设计 #70、任务 #74 的原批准来源保持不变；任务层 #74 于 03:10:51Z 合入 `9e4b1863fd28dfe5f4fa15e14da3d5cd22525db7`；zjh1978 于 03:15:44Z 对 `73fe2bf1bd8374df93e878a452046adb3e6326b3` [记录 APPROVED](https://github.com/fasrun/fasrun/pull/74#pullrequestreview-5885479380)。这是合入后补齐的实际评审记录，不改写其先后顺序；过期 `in_review` 元数据现同步为 `approved`。

- 最终代码 HEAD `26ba80d8347c478aa2d67bd75c803409eeb3a9de` 的 PR CI [43362985944](https://github.com/fasrun/fasrun/actions/runs/43362985944) 成功；本机标准与替代入口、真实 Linux 夹具及包级验证详见代码 PR，不相互替代。
- 历史失败保留：首两轮 PR CI `43359783744`、`43360533067` 的夹具问题已在该代码 PR 内修正；后续队列失败分别包含公共身份矩阵预算、TC-PLATFORM-025 锁等待观测等独立问题，不能把每次失败都归为 CLI 产物缺失。组合队列 `43365032692` 中身份矩阵与 SF-7 真实夹具通过，但 TC025 失败，整轮仍失败。后续独立 #77 队列 `43369355803` 为 TC025 等待者预期 2、实际 1（68/69）；组合队列 `43369353178` 为 TC-PLATFORM-039 超过 5 秒（67/69 为中断时计数），两者也不能归入 CLI 生命周期缺失。
- 最终实际合并队列 [43369814834](https://github.com/fasrun/fasrun/actions/runs/43369814834) 成功：9 个执行检查通过、4 个 PR 专属检查跳过，test 69/69、零缓存、440 个断言通过，随后发生上述实际合入；只引用最终实际合入对应队列，不以过期组合运行代替。
- 合入后的 main CI [43370206070](https://github.com/fasrun/fasrun/actions/runs/43370206070) 实际失败。完整日志确认唯一失败为旧版 TC-SF5-IDENTITY-005 聚合权限矩阵超过默认 5 秒，归属独立维护 #77；不是 CLI 产物缺失或 TC-SF5-CONNECT-005。其他 8 个执行检查成功、4 个 PR 专属检查跳过；test 的 25/43 是中断时任务计数，不能当成完整通过率。该次主干运行不能宣称全量验证成功，也不撤销代码实际交付事实。

本进度 PR 只回写 T001 与交付元数据，不归档 SF-7，不关闭 #17 或 #64。#81/其他公共测试维护继续独立处理，不混入本任务或本进度 PR；agent 未批准、入队或合并。

### 后续主干与本进度 PR 复验

- #77 实际合入 `8a1f73b64b77eae0575066899ab99b053e91f37d` 后，main CI [43374563103](https://github.com/fasrun/fasrun/actions/runs/43374563103) 成功；这不覆盖 #78 最初主干失败记录。
- 本进度 PR #85 原提交 `b2591eb5bb9640cd5197c8a4ada0a201f45e9e00` 的 CI [43371159427](https://github.com/fasrun/fasrun/actions/runs/43371159427) 失败于 TC-PLATFORM-025（CLI 80/81、Turbo 68/69），该历史失败保留。
- 独立 SF-8 维护 #87 已实际合入 `318977510ddba14f550f7a386b9a9e5f2914290f`，实际队列 [43378459397](https://github.com/fasrun/fasrun/actions/runs/43378459397) 成功。本进度分支据此变基复验，没有复制公共测试修复。其合入后 main CI [43378912506](https://github.com/fasrun/fasrun/actions/runs/43378912506) 的 test 仍失败于 TC-PLATFORM-025：observe-waiters 记录 waiting=1、attempts=200、elapsed=6982ms，两真实 CLI 均 SIGKILL、closed=true、timedOut=false，输出为空；CLI 83/84、Turbo 68/69。新清理与诊断已取得证据，但等待条件失败尚未彻底解决，#81 保留未解决，不能把队列成功写成所有运行稳定。
- #80 提交 `7fa1807` 的 SF-7 生命周期总预算 220 秒耗尽（CI 43375678457、退出 124）另归 #64 的独立可靠性维护 #88。T010 定向业务与身份矩阵通过不替代这次公共测试失败；本进度 PR 不包含 #88 代码，也不将该问题改写为业务语义。

本轮新提交的 PR CI、后续实际队列与主干结果分别记录在 #85，尚未发生的结果不预先计为成功。#17 的 Colima 环境限制仍独立保留。

### SF-7 可靠性维护实际交付后对账

独立可靠性维护 [#88](https://github.com/fasrun/fasrun/pull/88) 已实际合入 `9c855fd`，合入后 main CI [43388131179](https://github.com/fasrun/fasrun/actions/runs/43388131179) 成功。该交付复用真实构建产物作为重复故障场景的前置、合并上游真实构建图并加强子进程收束；保留真实构建、缓存、旧缺陷反例、失败消费断言和原 220 秒预算。#80 提交 `7fa1807` 的历史 CI 43375678457 退出 124 记录不覆盖或改称原提交成功。交付元数据关联 #78 与 #88，不改变 T001 定义或验收，不据此归档 SF-7 或关闭 #64。

本进度 PR #85 前次提交 `0e61d9a` 的 CI [43379640605](https://github.com/fasrun/fasrun/actions/runs/43379640605) 仍因 TC025 失败：waiting=0、attempts=200、elapsed=7927ms，两 CLI 均 SIGKILL/closed=true，timedOut=false/error=null、输出为空；CLI 83/84、Turbo 68/69 零缓存。该轮 SF7 旧夹具 210220ms、scripts40/40及身份矩阵484项通过，不能由此抹去失败或宣称等待根因已修复。

本次基于最新 main `d41250f` 再次变基；#76 已合入的任务层 approved 元数据保持，不重复提交该修正。公共 test-utils 的未处理 PostgreSQL 57P01 归 [#90](https://github.com/fasrun/fasrun/issues/90)，按 SF-9 独立规格登记待人工确认合入；17 个断言通过不能替代异常门禁。该公共维护不混入本进度 PR，后续新提交 CI 按实际结果另录，不借重跑关闭已知限制。
