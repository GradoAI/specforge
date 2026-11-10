## ADDED Requirements

### Requirement: R-spec-001 规格格式自检
`sf spec validate [目录]` 必须检查规格目录中现行规格与各变更目录的格式：需求条目、场景、用户场景、设计条目与任务的编号合规；每条需求至少一个场景；MODIFIED 中的条目写出完整内容（说明与至少一个场景），且指向现行规格中已有的条目；REMOVED 中的条目写明原因与迁移方式；需求层的「待澄清」为空。每个错误必须报出错误类别、文件与行号；有任何错误时以非零状态退出。「场景的 THEN 可以判定」不在本命令的检查范围内。
#### Scenario: R-spec-001.S1 单仓规格目录通过
- GIVEN 单仓的 specforge/ 目录
- WHEN 执行 `sf spec validate specforge/`
- THEN 以 0 退出，没有错误
#### Scenario: R-spec-001.S2 编号不合规
- GIVEN 一个规格增量中有需求条目编号为 R-search-3
- WHEN 执行 `sf spec validate`
- THEN 报出编号格式错误，指明该文件与行号
#### Scenario: R-spec-001.S3 需求缺少场景
- GIVEN 一条 ADDED 需求下没有任何场景
- WHEN 执行 `sf spec validate`
- THEN 报出缺少场景的错误，指明该需求所在的文件与行号
#### Scenario: R-spec-001.S4 MODIFIED 没有写全
- GIVEN 一条 MODIFIED 需求只有说明、没有场景，或指向现行规格中不存在的条目
- WHEN 执行 `sf spec validate`
- THEN 报出 MODIFIED 不完整的错误，指明文件与行号
#### Scenario: R-spec-001.S5 REMOVED 没有写明原因
- GIVEN 一条 REMOVED 需求没有写原因或迁移方式
- WHEN 执行 `sf spec validate`
- THEN 报出 REMOVED 缺少原因的错误，指明文件与行号
#### Scenario: R-spec-001.S6 待澄清不为空
- GIVEN 一个变更目录的 requirements.md 中「待澄清」下有内容
- WHEN 执行 `sf spec validate`
- THEN 报出待澄清不为空的错误，指明文件与行号

### Requirement: R-spec-002 规格覆盖与依赖自检
`sf spec validate` 必须检查每个变更目录内的覆盖与依赖：每个用户场景至少指向一条需求条目，且指向的条目存在；每条设计条目都对应到至少一条需求条目；每条需求条目至少被一个任务覆盖，每个任务都对应到需求条目；任务依赖无环，且依赖的任务存在；任务的修改范围不超出项目配置中允许的路径。没有 design.md 或 tasks.md 的变更目录只检查已有的层。错误的报告方式同 R-spec-001。
#### Scenario: R-spec-002.S1 用户场景没有对应的需求
- GIVEN 一个用户场景没有列出实现它的需求条目，或列出的条目不存在
- WHEN 执行 `sf spec validate`
- THEN 报出用户场景覆盖错误，指明该用户场景
#### Scenario: R-spec-002.S2 设计条目没有对应的需求
- GIVEN design.md 中一条设计条目没有写对应需求
- WHEN 执行 `sf spec validate`
- THEN 报出设计对应错误，指明该设计条目
#### Scenario: R-spec-002.S3 需求没有任务覆盖
- GIVEN 规格增量中有一条需求条目，tasks.md 中没有任务对应它
- WHEN 执行 `sf spec validate`
- THEN 报出任务覆盖错误，指明该需求条目
#### Scenario: R-spec-002.S4 任务依赖有环
- GIVEN tasks.md 中 T002 依赖 T003，T003 依赖 T002
- WHEN 执行 `sf spec validate`
- THEN 报出依赖成环的错误，列出环上的任务
#### Scenario: R-spec-002.S5 修改范围超出允许的路径
- GIVEN 项目配置只允许 apps/、packages/、plugins/、tools/、deploy/、docs/、specforge/ 与 .github/，一个任务的修改范围是 /etc/hosts
- WHEN 执行 `sf spec validate`
- THEN 报出修改范围越界的错误，指明该任务

### Requirement: R-spec-003 现行规格骨架
规格目录的 specs/ 下必须为 entry、identity、spec、knowledge、orchestration、environment、governance、insight、connect 九个能力域各建一个能力目录与 spec.md，另建 platform 能力存放工程与部署类需求；每个 spec.md 至少有标题与说明，可以暂无需求条目。`sf spec validate` 必须接受没有需求条目的现行规格。
#### Scenario: R-spec-003.S1 空的现行规格通过自检
- GIVEN specs/ 下十个能力的 spec.md 都只有标题与说明
- WHEN 执行 `sf spec validate`
- THEN 以 0 退出

### Requirement: R-spec-004 规格归档
`sf spec archive <变更目录>` 必须把变更目录中的规格增量合并进现行规格：ADDED 追加条目，MODIFIED 替换同编号的条目，REMOVED 删除条目，RENAMED 修改条目名称而保留编号；然后把变更目录移到 changes/archive/<日期>-<工作编号>-<简述>/。合并前先运行自检，自检不通过或增量与现行规格冲突（如 ADDED 的编号已存在、MODIFIED 或 REMOVED 的编号不存在）时不做任何修改并以非零状态退出。归档后的规格目录必须通过自检。
#### Scenario: R-spec-004.S1 归档合并增量
- GIVEN 一个变更目录含一条 ADDED、一条 MODIFIED、一条 REMOVED 与一条 RENAMED
- WHEN 执行 `sf spec archive` 于该目录
- THEN 现行规格中新增、替换、删除与改名都已生效；变更目录移入 changes/archive/ 且目录名以归档日期开头；`sf spec validate` 通过
#### Scenario: R-spec-004.S2 冲突时不做修改
- GIVEN 一个变更目录 ADDED 的条目编号已存在于现行规格
- WHEN 执行 `sf spec archive` 于该目录
- THEN 命令以非零状态退出，现行规格与变更目录都没有变化
