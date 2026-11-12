# SF-6 仓库自身采用共享执行器纪律入口

## 目标

帆驭 (Fasrun) 的不同执行器从共享入口读取同一套仓库纪律，消除根目录仅有 CLAUDE.md 的自身采用缺口，保留所有既有规则且只维护一份正文。工作 [#53](https://github.com/fasrun/fasrun/issues/53)，基线 main `548be4d`。

## 范围与依据

技术方案 2.11 已明确 AGENTS.md 共享入口和 CLAUDE.md 引用。#30 的 R-platform-015.S4/S8 与 #33（SF-1 T008）已交付 init 生成、引用、不覆盖和幂等行为；本工作不重做或重新判定初始化能力未实现。

现行 R-platform-003 尚指定把纪律正文写在 CLAUDE.md，根目录也尚无 AGENTS.md。本工作以完整 MODIFIED 增量修订该条，保留 S1–S3 的 CODEOWNERS 义务，增加 S4/S5；根 AGENTS.md 原样接收基线 CLAUDE.md 正文，根 CLAUDE.md 缩为 `@AGENTS.md` 单独一行。只改变说明入口及正文归属，不增删纪律、批准分工或工程门槛。

这是独立的小改动，规格增量与根文档迁移在同一文档 PR 评审；不含产品代码、测试代码、依赖、CI、Fasfile 或 CODEOWNERS 修改，不创建无必要的设计/任务层，不改已归档 SF-1 或 R-platform-015。fasrun/config.yaml 的任务范围清单本次不扩大：未新增代码任务，也不授予未来任务修改 AGENTS.md 的权限。

## 用户场景

### US-1 不同执行器读取同一纪律（P1）
作为使用不同执行器的开发者，我要直接读取 AGENTS.md 或通过 CLAUDE.md 引用读取时得到同一完整规则，避免某个执行器漏读，或两份正文逐渐分歧。
独立验证：检查根文件引用精确且可解析；解析后内容与直接读取 AGENTS.md 相同；迁移前后正文逐字比较，原有 CODEOWNERS 场景继续成立。
实现它的需求条目：R-platform-003

### US-2 已有仓库重新 init 不破坏纪律（P1）
作为仓库维护者，我要已采用的两个入口与现有 init 保持兼容，保留仓库自己维护的规则，而不是被通用模板覆盖。
独立验证：把两个文件复制到隔离临时仓库，以已交付 CLI 连续 init 两次，两个文件逐字不变；第二次 JSON 中 created/modified 为空。测试只在临时目录运行，不对 Fasrun 根目录直接 init。
实现它的需求条目：R-platform-003

## 成功标准与交付

- 根 AGENTS.md 与基线 `548be4d:CLAUDE.md` 字节相同，根 CLAUDE.md 恰为 `@AGENTS.md` 加换行；不存在另一份根纪律正文。
- 上述临时目录 init 验收及原 CODEOWNERS 用例通过，spec validate/check 和仓库所需门禁通过；标准测试、环境替代和 CI 实际结果分别记录。
- #17 中已交付的 R-platform-015 子项回写 #30/#33 证据，本次自身采用单独关联 #53；其他未解决项保持原状态。M1 #50/#52 不依赖本工作，互不阻塞。
- 本 PR 请求 PontusAI 评审需求修订，zjh1978 核对规则迁移；不自行批准或合并。合入后再按既有 spec archive 流程归入现行规格并补最终对账；本次不提前把待评审增量写成已批准现行规则，也不改写历史归档。

## 待澄清
