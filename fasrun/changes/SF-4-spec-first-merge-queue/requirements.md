# SF-4 spec-first 接受小改动编号；CI 支持合并队列

## 目标
两项流程上的调整。
- 一是按 #17 中需求评审人的决定修改「先规格后代码」检查：小改动不再为了通过检查而补 tasks.md，代码 PR 可以只引用小改动的变更编号。
- 二是让 CI 在合并队列上运行，main 改用合并队列合并，不再要求每个 PR 在合并前手动更新到最新的 main。

## 范围
- 做：
  - 修改 R-platform-012：
    - 代码 PR 的标题引用任务编号（`SF-<n> T<nnn>`，变更目录含 tasks.md 的较大工作），或只引用变更编号（`SF-<n>`，变更目录不含 tasks.md 的小改动）；
    - 两种情况下该变更目录都必须已在 main 上（`fasrun/changes/SF-<n>-*/`，归档目录不算）；
  - 修改 R-platform-012：CI 同时在合并队列（`merge_group` 事件）上运行；只在 PR 上运行的检查在合并队列中跳过；
  - `tools/scripts` 中的 spec-first 检查与用例按新规则修改；`ci.yml` 加入 `merge_group` 触发；
  - 交付后归档本变更。R-platform-012 由 SF-1 新增、尚未进入现行规格，归档时修改后的全文替换 SF-1 增量中的 R-platform-012（与 SF-2 处理 R-platform-015 的方式相同）。
- 不做：
  - protect-main 的设置：本变更合并后，由 Pontus 打开「Require merge queue」，关闭「Require branches to be up to date」；
  - SF-3 已附的 T001 不返工；
  - CLAUDE.md 中「小改动有 requirements.md 与规格增量」的写法保持不变，它与新规则一致。

## 用户场景

### US-1 小改动的代码 PR 直接引用变更编号（P1）
作为提交小改动的开发者，我要在代码 PR 的标题中只写变更编号，以便小改动不必为通过检查补一个 tasks.md。
独立验证：
- main 上有一个不含 tasks.md 的变更目录时，标题为「SF-<n> …」、修改了代码的 PR 通过检查；
- 该工作的变更目录含 tasks.md 时，同样的标题失败并要求引用任务编号；
- main 上没有该变更目录时失败并说明找不到。
实现它的需求条目：R-platform-012

### US-2 用合并队列合并（P2）
作为批准人，我要把批准后的 PR 放进合并队列，以便不再逐个手动把分支更新到最新的 main。
独立验证：`ci.yml` 的触发条件包含 `merge_group`；合并队列中的提交运行 CI，只在 PR 上运行的检查显示为跳过。
实现它的需求条目：R-platform-012

## 成功标准
- spec-first 的用例覆盖：引用任务编号、引用小改动编号、小改动编号指向含 tasks.md 的工作、变更目录不存在；全部通过。
- `ci.yml` 的触发条件包含 `pull_request`、`merge_group` 与推送到 main，有用例检查。

## 待澄清
