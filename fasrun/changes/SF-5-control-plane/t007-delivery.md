# SF-5 T007 实际交付与集成对账

本记录维护实际进度，不修改需求、任务定义或依赖。[#73](https://github.com/fasrun/fasrun/pull/73) 最终代码提交为 `3bc6e609c4bcfe4d9ab5e1ee314352f148352335`，2026-11-13T03:18:23Z 合入 `0914fb919cdf3287c49193b4db5c758bbcd908ae`。PontusAI 于03:03:05Z、zjh1978 于03:13:56Z 均批准该最终提交；后者满足既定代码评审分工。meta继续保留需求#52、设计#56、任务#57批准基线。

## 实现与规格追溯

T007 对应 R-spec-008、R-spec-007、R-governance-002、R-orchestration-010、D-7、D-14、D-16，以及 TC-SF5-SPEC-008/009。knowledge实现固定repo/baseCommit源码解析、工作级流程/模板/组织规范版本pin、精确旧版本读取与失败拒绝；environment实现获批能力快照及实际模板目标鉴权。成员解析使用受控端口，约束只可收紧，敏感读取先审计并在返回前复核权限。真实Postgres持久化保留组织隔离和不可变版本。

#69批准的最小归档接缝已实际交付：spec-common验证精确ArchiveOperation和可信授权投影；CLI受控facade在读前授权，绑定完整内容、附件、目录、动作及快照，写入前重新授权并重验快照，复用原预检、独占工作区前提与真实writer/rollback。M0人工命令保留，不能作为M1授权fallback。TC009覆盖普通写不能越过受保护历史、篡改/撤销拒绝以及失败不残留。T020负责真实宿主绑定；当前接缝不宣称跨进程原子授权、本机沙箱或崩溃恢复。

## 验证入口与实际结果

| 阶段 | 结果与边界 |
| --- | --- |
| 本地标准入口 | 受影响包强制无缓存测试19项Turbo任务中16成功，3个容器相关包受已有Colima变量过滤限制失败；不是全绿，#17限制未修复 |
| 本地替代入口 | 显式保留Colima覆盖变量，Vitest原并发：knowledge backend 7/7、environment backend 5/5、CLI 81/81；加spec-common 76/76、knowledge-common 5/5、knowledge-node 1/1，共175个不同受影响用例通过。归档变异被测试捕获并恢复源码 |
| 其余本地检查 | frozen install、build、typecheck、lint、format、stage后标准migration-check、实际CLI spec validate/check、license、changeset和gitleaks均通过；不将替代结果写作标准入口成功 |
| 最终PR | [43354406554](https://github.com/fasrun/fasrun/actions/runs/43354406554) 对最终3bc6e60成功 |
| 最终实际队列 | [43357619105](https://github.com/fasrun/fasrun/actions/runs/43357619105)，HEAD为0914fb91，9项执行成功、4项PR-only跳过 |
| 合入后主干 | [43358064993](https://github.com/fasrun/fasrun/actions/runs/43358064993)，HEAD为0914fb91，9项执行成功、4项PR-only跳过；test 68/68任务零缓存，CLI81/81（归档41/41），identity包8/8，TC024真实迁移与历史保护均通过 |

首次#73队列[43356359955](https://github.com/fasrun/fasrun/actions/runs/43356359955)失败于既有TC-SF5-IDENTITY-005完整矩阵5543ms超过5000ms，没有CLI产物缺失证据；最终队列成功不擦除该失败。独立#77修复尚未实际合入时，不将本次成功归功于它，也不宣称身份矩阵耗时问题已永久修复。TC039历史超时、TC025锁等待观测失败、CLI dist缺失、身份矩阵超时与Colima限制分别记录，不相互替代。

## 澄清与后续边界

[#67](https://github.com/fasrun/fasrun/issues/67) 的范围缺项已有#69批准并由#73真实实现；最终代码的zjh1978批准及主干集成证据现已取得。根工作完成独立回写后，#67已于2026-11-13T03:25:15Z关闭；#68亦于03:25:22Z完成独立交付对账关闭。关闭范围仅为各自精确路径缺项，不关闭#17或独立测试稳定性事项。

#75保持原分支和HEAD，CLI构建缺失由SF-7独立处理；#17两类限制继续分别保留。T008及后续仍按真实依赖就绪推进，不提前勾选，不以此记录代替后续验收。agent不批准、入队或合并。
