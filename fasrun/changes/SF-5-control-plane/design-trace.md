# SF-5 设计层追溯与自检

依据已合入 #52 的41需求/75场景；本表不是执行通过报告。需求原文与 confirmation.md 不改写。每个场景以其 GIVEN/WHEN/THEN 为测试断言来源，任务层再落实文件、编号和依赖；不提前把当前设计当代码授权。

| 需求 | 全部场景 | 设计 | 验证方式 |
| --- | --- | --- | --- |
| R-connect-001 | R-connect-001.S1、R-connect-001.S2、R-connect-001.S3、R-connect-001.S4 | D-1、D-4、D-5、D-17、D-18 | 真实专用GitHub接入；隔离适配器重投、乱序、失败与对账测试 |
| R-connect-002 | R-connect-002.S1、R-connect-002.S2、R-connect-002.S3 | D-5、D-16 | 真实专用GitHub接入；隔离适配器重投、乱序、失败与对账测试 |
| R-connect-003 | R-connect-003.S1、R-connect-003.S2、R-connect-003.S3 | D-6、D-16 | 真实专用GitHub接入；隔离适配器重投、乱序、失败与对账测试 |
| R-connect-004 | R-connect-004.S1、R-connect-004.S2、R-connect-004.S3 | D-5、D-13 | 真实专用GitHub接入；隔离适配器重投、乱序、失败与对账测试 |
| R-entry-001 | R-entry-001.S1、R-entry-001.S2 | D-1、D-15、D-18、D-19 | 同用例HTTP/MCP对照、并发重试/多副本、SSE和权限负例 |
| R-entry-002 | R-entry-002.S1、R-entry-002.S2、R-entry-002.S3 | D-6、D-15 | 同用例HTTP/MCP对照、并发重试/多副本、SSE和权限负例 |
| R-entry-003 | R-entry-003.S1、R-entry-003.S2、R-entry-003.S3 | D-2、D-4、D-11、D-15 | 同用例HTTP/MCP对照、并发重试/多副本、SSE和权限负例 |
| R-entry-004 | R-entry-004.S1、R-entry-004.S2 | D-7、D-15 | 同用例HTTP/MCP对照、并发重试/多副本、SSE和权限负例 |
| R-governance-001 | R-governance-001.S1 | D-3 | 纯函数条件表与属性测试、策略限制负例 |
| R-governance-002 | R-governance-002.S1 | D-3、D-4 | 纯函数条件表与属性测试、策略限制负例 |
| R-identity-001 | R-identity-001.S1、R-identity-001.S2、R-identity-001.S3 | D-1、D-2、D-17、D-18 | 真实Keycloak/权限矩阵/组织隔离与审计负例；真实及模拟结果分别记录 |
| R-identity-002 | R-identity-002.S1、R-identity-002.S2、R-identity-002.S3、R-identity-002.S4 | D-1、D-2、D-3、D-15 | 真实Keycloak/权限矩阵/组织隔离与审计负例；真实及模拟结果分别记录 |
| R-identity-003 | R-identity-003.S1、R-identity-003.S2、R-identity-003.S3、R-identity-003.S4 | D-3、D-7、D-16 | 真实Keycloak/权限矩阵/组织隔离与审计负例；真实及模拟结果分别记录 |
| R-identity-004 | R-identity-004.S1、R-identity-004.S2 | D-4、D-16 | 真实Keycloak/权限矩阵/组织隔离与审计负例；真实及模拟结果分别记录 |
| R-orchestration-001 | R-orchestration-001.S1 | D-10、D-16、D-17、D-19 | TC-CF-001；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-002 | R-orchestration-002.S1 | D-6 | TC-CF-002；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-003 | R-orchestration-003.S1 | D-6、D-10 | TC-CF-003；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-004 | R-orchestration-004.S1 | D-10 | TC-CF-004；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-005 | R-orchestration-005.S1 | D-10 | TC-CF-005；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-006 | R-orchestration-006.S1 | D-9 | TC-CF-006；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-007 | R-orchestration-007.S1 | D-9、D-19 | TC-CF-007；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-008 | R-orchestration-008.S1 | D-9 | TC-CF-008；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-009 | R-orchestration-009.S1 | D-9 | TC-CF-009；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-010 | R-orchestration-010.S1 | D-7、D-8 | TC-CF-010；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-011 | R-orchestration-011.S1 | D-9、D-11 | TC-CF-011；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-012 | R-orchestration-012.S1 | D-11 | TC-CF-012；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-013 | R-orchestration-013.S1 | D-8 | TC-CF-013；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-014 | R-orchestration-014.S1 | D-11、D-16 | TC-CF-014；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-015 | R-orchestration-015.S1 | D-11 | TC-CF-015；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-016 | R-orchestration-016.S1 | D-11 | TC-CF-016；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-017 | R-orchestration-017.S1 | D-10 | TC-CF-017；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-018 | R-orchestration-018.S1 | D-12 | TC-CF-018；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-019 | R-orchestration-019.S1 | D-8、D-12 | TC-CF-019；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-orchestration-020 | R-orchestration-020.S1 | D-12、D-17、D-18 | TC-CF-020；真实DBOS/Postgres，适配器桩；崩溃/升级列入完整集 |
| R-platform-017 | R-platform-017.S1、R-platform-017.S2、R-platform-017.S3、R-platform-017.S4 | D-14、D-19 | 配置schema合法/非法夹具，init/check/CI一致性及模板回归 |
| R-spec-005 | R-spec-005.S1、R-spec-005.S2、R-spec-005.S3 | D-7、D-13、D-16 | 逐层PR状态机、当前head/权限/领域确认、可替换调用与真实阶段闭环 |
| R-spec-006 | R-spec-006.S1、R-spec-006.S2 | D-7、D-13 | 逐层PR状态机、当前head/权限/领域确认、可替换调用与真实阶段闭环 |
| R-spec-007 | R-spec-007.S1、R-spec-007.S2 | D-13、D-14 | 逐层PR状态机、当前head/权限/领域确认、可替换调用与真实阶段闭环 |
| R-spec-008 | R-spec-008.S1、R-spec-008.S2 | D-14 | 逐层PR状态机、当前head/权限/领域确认、可替换调用与真实阶段闭环 |
| R-spec-009 | R-spec-009.S1、R-spec-009.S2 | D-5、D-6、D-7、D-13、D-17 | 逐层PR状态机、当前head/权限/领域确认、可替换调用与真实阶段闭环 |
| R-spec-010 | R-spec-010.S1、R-spec-010.S2 | D-1、D-8、D-17 | 逐层PR状态机、当前head/权限/领域确认、可替换调用与真实阶段闭环 |

## 控制流验证分组

TC-CF-001–020 与 R-orchestration-001–020.S1 一一对应，不以第6轮仅19通过1跳过的历史记录冒称全部通过。

| 用例 | 重点故障/反例 | 通道 |
| --- | --- | --- |
| 001–003 | agent中断；外部效果后检查点前中断；未变/变更/上游重跑的动作键与结果 | 真实运行时完整集；003同时有快速确定性用例 |
| 004–005 | 关卡重启不占队列；原deadline及错主题消息；提醒升级重复触发 | 完整集，快速集覆盖状态与路由 |
| 006–007 | 五类拒绝、非祖先引用、无时限；fast-check接受域一致 | 快速集，拒绝计划零步骤 |
| 008–011 | 同键缓存与重命名签名；默认三次重规划；前段零规划；可信/普通同文指令对照 | 快速集 |
| 012–016 | 已结束步骤晚到消息；输出夹带计划；相同内容不同标签；混合输入；排除内容发送 | 快速集，审计及外部效果计数可核对 |
| 017 | 长步骤占满队列仍五秒内受理人工消息 | 真实队列完整集，隔离负载 |
| 018–019 | 系统重新执行、agent录制输出、回放零外部效果；每个目录系统步骤确定性 | 快速集，步骤目录登记门禁 |
| 020 | 等待中的旧解释器/步骤版本继续，新work用新版本；旧工作清零前不下线 | k3d完整集真实排空升级 |

## 真实接入证据

专用环境记录同一构建的CORE/CONNECT、Keycloak/真实GitHub安装及仓库、fixture/契约版本。保留登录及拒绝、原工单、澄清回答、实际PR/head、独立评审/撤销/合入、对账与写回链接，秘密脱敏。不把模拟异常回归计成真实接入证据，不称agent桩为真实自动起草。M2沿用调用契约再补真实调用链，二十项回归不减。

## 设计自检

- D-1–D-19均映射已批准需求；全部41条均有设计映射，75场景未删减，编号不复用。无tasks.md，无产品代码、CI或依赖修改。
- 对照现有服务工厂/插件scope、数据库withOrg、migration-check、spec-common和CLI：明确需要新增的上下文契约、双宿主connect状态边界及DBOS适配，没有宣称M0骨架已具备这些实现。
- 持久化失败点按收件箱、业务outbox、DBOS检查点、外部效果、确认head分别处理；未知外部效果先查询，不自动重发；跨插件各自事务与事件去重，不绕过schema归属。
- 角色与领域确认、当前head、撤销、消息时限、可信度、回放及升级覆盖已合并要求；Fasfile约束逐条列明。专用真实验收和普通自动回归按#51确认分开。
- 本层不改变#51边界，不将SF-6共享根文档迁移混入产品；其他#17维护项保留。代码/CI的具体范围必须在后续任务层批准，依赖版本在实现前按政策核验。
- 本工作需求/增量/确认原文与#52合入版本逐字对账；meta只把已合入需求记approved/pr52，设计记in_review。后续PR中的本机标准、环境替代与CI事实分别记录。
