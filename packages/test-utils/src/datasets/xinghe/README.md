# 星河科技原型数据

对应 SF-1 D-15、R-platform-011.S3、TC-PLATFORM-036。入口为 `@fasrun/test-utils/datasets/xinghe`；导出 `xingheDataset`、各实体数组及本模块自己的类型，不依赖任何 AGPL 后端。这里只定义原型数据，不创建后续业务表。M0 seed 只持久化 organizations。

## 来源与逐字段映射

来源：[Figma 原型](https://www.figma.com/design/ocHD7dHRTiAbog784HlNyE)，需求方案 1.6；本次逐图读取已交付的 `~/arch-eval/figma-proto/A/`、`B/`、`C/` 导出中下列画框，辅以同目录 REPORT.md 的示例数据与修订记录。没有执行历史生成脚本。下表的画框文件均为 `.png`，中文名保留以便重新查证。

| 定义             | 字段来源                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| organizations    | `name`：C15 组织 - 桌面；`slug` = xinghe 是 M0 数据库要求的稳定技术映射，不是画框字段；`createdBy` 指向韩青，仅为必填审计字段的确定性示例映射（C15 的组织管理员），不声称韩青实际创建了组织。                                        |
| teams            | `name`：C1 总控调度 - 桌面、C6 成本与度量 - 桌面；`orgId` 指向星河科技。                                                                                                                                                             |
| members          | `name/email/occupation/source/status`：C4 成员与角色 - 桌面左侧已展示的 11 行；不纳入尚未应用的右侧同步预览。                                                                                                                        |
| roles            | `name/scope`：需求方案 1.2 内置角色表；C4 明确 14 个内置权限角色。系统 Agent 身份不是人的内置角色，不计入这 14 个。                                                                                                                  |
| roleAssignments  | `memberId/roleId/scopeLabel`：C4 各行标签。平台管理员、平台审计员按需求方案归平台范围；画框中项目角色只显示团队标签，保留原始 scopeLabel，不凭空生成项目授权。环境模板管理员显示移动端组，同样保留标签，不把它更改为全组织。         |
| machines         | `name/ownerLabel/teamIds/platform/architecture/nodeVersion/status/invocation`：C3 机器与执行节点 - 桌面已展示的 10 行；可识别个人的 `ownerId` 链到 members，显示团队共享的用 null，不虚构成员。                                      |
| works            | `key/title/repository/status/ownerId/costCny`：B3 工作列表 - 桌面已展示的 8 行；`teamId` 是该页支付平台组。SF-1047 当前状态是检查中，红色最近失败标识不替换工作状态。SF-1063 成本显示「订阅」，用 null 表达不计 API 金额，不写零元。 |
| executions       | 全部业务字段：B4 工作详情 - 桌面 · 执行标签；`workId` = SF-1051，`machineId` 按机器名关联。耗时转换秒、成本人民币数值、k tokens 转换整数；`startTime` 保留 HH:mm，不补造日期或时区。                                                 |
| budgets          | `scope/scopeName/amountCny/spentCny/rules`：C6 成本与度量 - 桌面预算表及右侧规则；未展示移动端组和风控组单独规则，用空数组，不推断缺省规则。                                                                                         |
| securityPolicies | `category/target/scope/rule/proposerId/confirmerId`：C8 安全策略 - 桌面四块表；权限、保留与训练约定、禁止/评估状态保留。`api.anthropic.com 等 2 个` 是画框原文，不猜测另一个域名。此模块是展示数据，不是可以直接执行的出站配置。     |
| plugins          | `name/version/scope/permissions/status/compatibility`：C5 插件管理 - 桌面的已安装 6 行；安装审批中的两项提案不冒充已安装版本。                                                                                                       |

所有 `id` 与关联 ID 均为数据集技术标识：实体前缀 + 全零的 10 位 ULID 时间部分 + 固定 16 位 Crockford 字符；不调用随机数或时钟。标识不是原型展示编号；工作展示编号保留在 `key`。数据库必需的 slug/createdBy 映射已单独说明。

## 画框差异与未展开信息

- C4 展示成员 47、C15 展示星河科技成员 27；数据集保留 C4 实际展示的 11 人，不把任一聚合值当作可还原的完整名单，不补造其余人名。
- C15 显示预算 8000/月，C6 专门预算页与 C1 额度均为 6500。预算实体按 C6 的组织、四团队及两个项目记录；未把 C15 数字改写成一致。四团队预算之和为 6500，成本之和为 4458。
- C3 聚合 14 台，只展开 10 台；B3 聚合我的 24 项，只展开 8 项。数据集保存这些可核对的实体，不伪造未展示分页。
- 原型另有云帆研究院，T017 明定组织 1 个，因此只定义星河科技；不提前建立第二组织。
- C8 的未展开域名、项目角色的具体项目、未展示分页与历史日期均不为 M0 organization 写入所需；保留可观察信息，不假定缺失字段值。后续任务需要这些具体字段时再按缺项流程确认。
