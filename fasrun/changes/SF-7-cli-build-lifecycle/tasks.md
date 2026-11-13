# SF-7 CLI 构建产物生命周期任务

需求#65、设计#70已人工合入；任务基线main `34539049070f07bf0c681ffcec0c491d11578b43`。本层保留已批准需求与设计，任务层人工合入前不实施代码。

## 任务清单

- [ ] T001 CLI单生产者编排、包级入口与真实生命周期回归 — 对应 R-platform-001、D-1、D-2、D-3、D-4；修改范围 turbo.json、apps/fasrun-dev-cli/package.json、apps/fasrun-dev-cli/README.md、AGENTS.md、tools/scripts/src/cli-build-lifecycle.test.ts、tools/scripts/src/fixtures/cli-build-lifecycle/、.github/workflows/sf7-native-diagnostics.yml（仅D-3/D-4限定的人工诊断）、.changeset/；用例 TC-PLATFORM-001（R-platform-001.S1）、TC-PLATFORM-002（R-platform-001.S2）、TC-SF7-PLATFORM-001（R-platform-001.S3）、TC-SF7-PLATFORM-002（R-platform-001.S4）、TC-SF7-DIAG-001–004（R-platform-001.S3诊断证据）

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

### T001 追加原生CI诊断设施的精确交付范围

2026-11-13用户已在执行会话接受[#64方案](https://github.com/fasrun/fasrun/issues/64#issuecomment-6850574718)，只修订D-3/D-4与本任务范围；不是实现批准或GitHub评审。既有T001交付和历史失败不返工，根因保持UNPROVEN。此次后续设施实现**只允许四个文件**：`.github/workflows/sf7-native-diagnostics.yml`、`tools/scripts/src/fixtures/cli-build-lifecycle/diagnostics/collect.mjs`、同目录`analyze.mjs`、同目录`diagnostics.test.ts`。不修改现有CI/nightly、CLI/Turbo/原fixture、依赖或锁文件；不得借原任务历史范围夹带公共修复。实现发现额外路径仍按既有缺项流程处理。

- 规格修订须PontusAI确认CI边界、zjh1978确认设计/任务并实际人工合入，才开始设施代码；设施代码按原分工评审、实际人工合入后，才允许**人工**执行一次有界取证。仅workflow_dispatch、无自动触发/矩阵/重试，不自动批准/入队/合并。不增加M1前置、不使用尚未生效的#96规范。
- 固定D-3中的原失败checkout、PR/base/tree，设施与目标分开；SHA/tree/受控文件不一致即拒绝，不fallback到最新main。从RUNNER_TEMP运行观察工具，不覆盖目标源码或改变git ls-files。只读指仓库/服务权限及受控输入，保留原测试正常产物/临时目录写入。
- 原`pnpm test`全仓入口、六包build/DTS、断言、缓存与所有既有预算保持。为采样而给原命令增加filter、force、串行、预算或减少断言均不允许。记录环境差异、探针开销、时间/资源精度；诊断结果不能替代#96 required checks。
- 测试前先用短合成进程验证完整退出证据能力，工具缺失/权限不足/信号或短进程退出丢失则非零终止，确认根测试未启动；不安装未审核工具或静默降低能力。未实施前不声称已有自动预检。
- 产物白名单脱敏、64MiB上限、7天保留；不输出完整环境或凭据。采集上限/失败不吞原测试退出码、不放宽超时；测试与取证状态独立。正常/异常/取消都收束受管采集进程，原fixture资源清理顺序保持。
- 一次有效原生执行后回传#64，仍无根因就返回缺口；不新增重复工单、不跑本机样本或反复重跑求绿。#96/#94保持原提交，不夹带设施或猜测性修复。

| 用例 | 对应条款 | 可判定的完成断言 |
| --- | --- | --- |
| TC-SF7-DIAG-001 | D-3固定输入/原入口；D-4 | 合法固定checkout/tree通过；错误SHA/tree/受控清单及任意输入拒绝，拒绝时未启动根测试；工作流仅人工、只读；原根/六包命令与各预算逐项不变 |
| TC-SF7-DIAG-002 | D-3预检/退出证据 | 合成正常、非零、SIGKILL、短命后代及PID复用均可关联；后端不可用/权限不足/事件缺失时预检非零且测试未启动，不能仅凭Node exit或轮询断言完整 |
| TC-SF7-DIAG-003 | D-3证据/安全/收束 | 已知合成依赖与并发图正确还原；分开CPU/RSS/调度与墙钟，缺失不伪造；原非零与observer失败均不吞；脱敏、上限、取消收束及先收束后清理可验证 |
| TC-SF7-DIAG-004 | D-3原生单次取证；D-4 | 人工执行的一次结果具备checkout/tree/工具版本、环境差异、原命令/预算、全仓背景及六包完整时序/关键路径/CPU/RSS/退出与收束证据；缺失则明确取证不完整，测试通过不等于根因已证明；不自动重复执行 |

001–003为设施代码的合成/静态自测，不重复本机真实生命周期实验；004仅在设施代码实际人工合入后由人工执行并对账，不在设施PR CI提前启动，也不把该规格修订当作004通过。CI检查本身仍沿现有入口及规则，不删门禁。

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

只授权清单中的精确路径及用途；不改根package.json、pnpm-lock.yaml、migration-check产品/prepare、除上述唯一诊断工作流之外的.github/文件、保护规则、SF-5业务或历史归档。`fasrun/config.yaml`本任务层PR仅追加准确`AGENTS.md`允许路径，使D-4已批准路径可被机械校验；不授权T001任意修改该配置。

任务/设计编号保持稳定，现行TC编号不重排。T001代码PR不凭本任务授权改规格进度；人工合入后用独立规格进度记录回写T001完成、代码PR及真实CI证据，再按既有归档流程处理，不把任务层PR当实现或归档批准。需求由PontusAI、设计/任务/代码由zjh1978按既定分工评审；本次诊断入口由PontusAI按CI分工放行，但不新增required check或保护规则接入事项。agent不批准、入队或合并。
