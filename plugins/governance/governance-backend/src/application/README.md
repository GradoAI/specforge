# 治理应用边界

`createGovernanceService` 由宿主注入可信身份授权、治理仓储和独立保留的审计链头。策略版本变化不替代 identity 的显式授权撤销；敏感读取在当前策略判定、审计持久化和独立链头发布后，再检查当前授权。

`createRedactor(secretValues)` 在审计持久化之前处理整个事件，保留 `authorizationId` 和链路标识。内置处理覆盖敏感对象字段、Bearer/GitHub token、URL userinfo，以及 `password=...`、`token=...`、`api_key=...` 等常见赋值形式；`safeDiagnostics` 在日志输出及错误信息返回之前调用同一遮蔽函数。这些规则不能识别任意格式的秘密。宿主仍须通过 `secretValues` 提供当前实际凭据值，并在轮换后更新遮蔽器；不要把未经遮蔽的 provider 异常另写到日志。应用公共端口对未预期的 adapter 错误只返回固定错误文本，不暴露原异常或 cause。

`consumeAudit` 接收 `governance.audit.requested`，校验信封与审计对象的组织、事件标识和时间。消费回执与审计追加同事务提交；独立链头发布在提交后执行，重复投递可恢复此前提交成功但链头发布失败的状态。
