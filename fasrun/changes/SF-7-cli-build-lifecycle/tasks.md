# SF-7 CLI 构建产物生命周期任务

需求#65、设计#70已人工合入；任务基线main `34539049070f07bf0c681ffcec0c491d11578b43`。本层保留已批准需求与设计，任务层人工合入前不实施代码。

## 任务清单

- [ ] T001 CLI单生产者编排、包级入口与真实生命周期回归 — 对应 R-platform-001、D-1、D-2、D-3、D-4；修改范围 turbo.json、apps/fasrun-dev-cli/package.json、apps/fasrun-dev-cli/README.md、AGENTS.md、tools/scripts/src/cli-build-lifecycle.test.ts、tools/scripts/src/fixtures/cli-build-lifecycle/、.changeset/；用例 TC-PLATFORM-001（R-platform-001.S1）、TC-PLATFORM-002（R-platform-001.S2）、TC-SF7-PLATFORM-001（R-platform-001.S3）、TC-SF7-PLATFORM-002（R-platform-001.S4）

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
