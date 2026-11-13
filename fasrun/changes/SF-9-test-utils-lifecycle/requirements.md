# SF-9 公共测试连接生命周期维护

工作入口：[公共 test-utils 未处理 PostgreSQL 异常 #90](https://github.com/fasrun/fasrun/issues/90)。本次在已有测试宿主能力内维护连接收束、错误脱敏及回归，不改变 M1 产品范围或数据库迁移语义。

用户本轮会话已确认按 #90 登记的最小范围，先完成必要规格确认与定向根因验证，再独立实现。来源见[会话确认回写](https://github.com/fasrun/fasrun/issues/90#issuecomment-6847663746)；这是 agent 对会话来源的记录，不是 GitHub 人工批准。沿用已合入 SF-4 的小变更入口：需求登记由 PontusAI 评审并实际合入后，独立代码 PR 引用 SF-9，请 zjh1978 评审。不另建任务层，不以 SF-1 归档或 SF-8 的单文件授权代替本登记。

## 已核事实与确认程度

SF-8 观测 PR #89 的提交 `ff6632e` 在 [CI 43386041845](https://github.com/fasrun/fasrun/actions/runs/43386041845) 的 test job131754652528 失败：test-utils 的 17 个断言通过，但 Vitest 捕获未处理的 PostgreSQL `57P01`，归属 schema-isolation-a 测试运行期。Turbo 49/67 为中断计数，CLI 未完成；不把断言通过或重跑成功当成修复，也不把它归为 TC025、T010 或 SF-7 生命周期预算问题。原始 driver 错误附带连接配置，由私有证据保留，不公开原对象或凭据。

现有 afterAll 已先等待 backend.stop() 再删除数据库，并非遗漏 stop。公共宿主 stop 只等待 pool.end()；已安装 pg-pool 可在客户端实际 end 之前完成池结束回调。mockServices.database 未注册池 idle error 处理。数据库删除使用 WITH(FORCE)。已合入 #66 的治理测试私有池修复不覆盖公共 test-utils，不能称为 #66 回退。

一次有界真实 PostgreSQL 对照已验证候选机制：受控延后 client.end 后，pool.end 已返回而真实数据库中仍有一个 backend；此时强制删除数据库产生 `57P01`，错误对象附带 client 及连接参数。相同条件下先等待实际 client end 再删除，删除在释放前未发生，结束后成功且没有 idle error。该构造验证证明连接结束边界的缺口及原始对象暴露风险；没有历史 CI 的精确时序，不能宣称其全部因果已还原。字段是否可枚举不构成脱敏保证，禁止依赖默认序列化隐藏凭据。

## 追溯与用户场景

[现行 R-platform-010.S1/S2](../../specs/platform/spec.md) → [归档 SF-1 D-14](../archive/2026-11-12-SF-1-engineering-skeleton/design.md) → [归档 SF-1 T009](../archive/2026-11-12-SF-1-engineering-skeleton/tasks.md) → TC-PLATFORM-032/033。原平台测试能力和并行 schema 隔离验收保持，不修改历史归档。

### US-1 测试宿主结束后可安全销毁数据库

实现它的需求条目：R-platform-010

作为集成测试维护者，我要宿主的受管数据库连接实际结束后才销毁测试资源；异常仍使测试失败，同时失败日志不暴露连接凭据或 driver 对象。真实 PostgreSQL、可替换服务与并行 schema 隔离保留，不能靠忽略 `57P01` 或串行所有测试掩盖问题。

## 精确维护范围

代码仅允许下列路径及用途；每个文件是否需要修改由定向验证决定：

- `packages/test-utils/src/mock-services.ts`：受管测试数据库服务的连接与错误收集。
- `packages/test-utils/src/test-backend.ts`：测试宿主资源收束、停止与失败报告。
- `packages/test-utils/src/pool-lifecycle.ts`：必要的同包私有生命周期辅助，不新增对外服务契约。
- `packages/test-utils/src/pool-lifecycle.test.ts`、`packages/test-utils/src/pool-lifecycle.int.test.ts`、`packages/test-utils/src/test-backend.test.ts`、`packages/test-utils/src/schema-isolation-a.int.test.ts`、`packages/test-utils/src/schema-isolation-b.int.test.ts`：必要的正常、异常与并行回归。
- `.changeset/`：公共包修改对应的 Changeset。

不修改 `postgres.ts`、global setup、生产 backend/迁移代码、依赖版本或锁文件、CI/保护规则、SF-8 诊断语义、其他任务实现或规格进度。需要增加文件或改变契约时先按既有缺项流程说明证据。test-utils 保持 Apache-2.0，不从 AGPL 治理包或 backend-defaults 导入私有辅助；可复用 #66 的设计原则，不增加不允许的依赖。

## 维护验收

- stop 的完成不能仅依赖 pool.end 回调：在关闭前记录受管客户端，并等待其实际结束。正常及失败路径均有有限截止；清理错误不得被吞掉或被误报为成功。重复停止不得重新触发冲突清理。
- 池 idle error 与关闭失败保留固定阶段、允许的 SQLSTATE/安全错误码等最小诊断；不输出原始 Error、client/pool、SQL 正文、URL、环境、地址或凭据。出错仍明确使测试失败，错误处理不是忽略 `57P01`。
- 清理步骤尽可能完成后才报告脱敏失败；停止未能确认实际结束时不得声称资源已安全销毁。保留受管连接的所有权边界，不承诺清理外部创建、未由宿主管理的连接。
- 使用真实 PostgreSQL 与可控延后结束的故障注入，证明 pool.end 返回时实际连接可能尚存，并验证维护后的停止不会提前完成、调用方不会提前删除数据库；释放后关闭及删除正常完成。
- 使用真实 idle backend 终止验证错误仍可见、输出仅有允许字段，不用模拟的成功替代。覆盖关闭超时/失败、重复停止及正常停止，不能只验证 happy path。
- 保留 TC-PLATFORM-032/033 的宿主、并行文件和 schema 隔离断言；新增生命周期场景沿这些用例标识细分，不重排其他编号。测试故障注入仅在同包测试或临时隔离探针，不影响生产代码。
- 不增加 TC025 的 200×25ms、45秒或60秒预算，也不修改 SF-7 的 220秒总预算、通用测试超时、并发策略或失败门禁。新清理辅助的有限截止应依据受控验证记录，不能以无限等待或重试求绿。

## 验证与交付

实现 PR 保留历史失败、受控复现和修复后的独立证据；至少覆盖真实 PG 生命周期及并行 schema 隔离、受影响 test-utils 包，并在新提交上完成 frozen install、typecheck、lint、format、无缓存测试、spec validate/check、Changesets、gitleaks 与适用提交检查。若公共宿主的行为影响既有消费者，按实际调用范围选择回归，不以断言总数替代未处理错误检查。

本机标准入口、显式 Colima 环境的替代入口、PR CI、实际 merge_group 和 main 分别记录。原 #17 Colima 限制不借本维护关闭；尚未发生或被中断的运行不称通过。本登记只确认范围，不包含实现、不关闭 #90；代码实际合入并完成受影响验证后再对账。#89 的 TC025 诊断与 #81 锁等待根因继续独立，公共修复实际合入后才复验 #89。

## 待澄清
