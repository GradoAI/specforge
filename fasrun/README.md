# Fasrun 规格格式与自检

帆驭 (Fasrun) 的规格根目录由仓库 `fasrun.yaml` 的 `spec_root` 声明。本仓库为 `fasrun/`。

构建命令行后运行：

```sh
pnpm --filter @fasrun/fasrun-dev-cli... build
node apps/fasrun-dev-cli/bin/run.js spec validate fasrun/
node apps/fasrun-dev-cli/bin/run.js check
```

安装命令行后可使用 `fasrun` 或 `fas`。`spec validate [目录]` 默认检查当前目录下的 `fasrun/`；`check` 先拒绝非法的 `spec_root`，再运行规格自检，随后依次检查 `Fasfile` 与 `fasrun.yaml`。CLI、init 模板与仓库 CI 共享 spec-common 的完整 version: 1 Zod schema，错误标出同一文件与字段路径；拒绝嵌套未知字段、错误类型和版本。

仓库路径必须使用规范相对路径，不允许绝对路径、父目录、反斜线或重复斜线；`protected_paths`、`high_risk_paths` 和评审规则 `paths` 支持受限 glob：段内 `*`、完整段 `**`，不支持 `?`、括号、花括号或否定。目录可保留尾部 `/`。`spec_root` 和 `shared_files` 不允许 glob。`check` 还解析规格根目录及中间目录的 symlink，拒绝指向仓库外的目标；用户显式调用 `spec validate <目录>` 仍可检查外部目录。

Fasfile 保留 principles、stack、quality_gates、protected_paths、high_risk_paths、agent；stack 的技术名可扩展，其他对象严格拒绝未知字段。评审声明如下（示例，不代表本仓已批准的规则）：

```yaml
review_rules:
  - id: security
    paths: [src/auth/]
    domains: [security]
    checks: [security-review]
prior_confirmations:
  - id: architecture
    domains: [architecture]
    reviewer_member_ids: [member-id]
    layers: [requirements, design]
```

各列表内 id 唯一；评审规则至少有一个路径或领域并声明 checks；事前确认必须有非空领域、成员及 layers，层只能为 requirements/design。旧配置缺省新列表为空，init 给出注释示例与空列表，不虚构确认人。这里验证形状；成员存在、组织约束只能收紧及固定提交的语义由项目上下文检查负责，解析声明不代表已实现 M2 AI 代码评审。

## 文件与编号

- 现行规格：`specs/<能力>/spec.md`；需求格式 `### Requirement: R-<能力>-<三位序号> 名称`，场景格式 `#### Scenario: R-<能力>-<三位序号>.S<正整数> 名称`。场景编号必须属于其需求。只有标题与说明的空现行规格合法。
- 变更：`changes/<工作编号>-<简述>/requirements.md`，以 `### US-<正整数> 名称` 声明用户场景，正文用 `实现它的需求条目：R-x-001、R-x-002` 建立引用；`## 待澄清` 下必须为空。
- `design.md` 用 `### D-<正整数> 名称`，正文用 `对应需求：R-x-001` 建立引用。
- `tasks.md` 用复选框任务行。`[P]` 表示可并行。编号进入规格后不得重排或复用；用例编号保持已批准的映射，不按场景插入位置重新计算。

```text
- [ ] T001 [P] 任务名称 — 对应 R-x-001、D-1；修改范围 apps/example/；用例 TC-X-001；依赖 T002
```

任务行的 `—` 后以中文分号 `；` 分段，各段分别以 `对应`、`修改范围`、`用例`、`依赖` 开头；列表以顿号分隔。无依赖可省略依赖段。修改范围使用仓库相对路径；目录以 `/` 结尾。路径旁的中文括号可写范围说明，但不扩大路径授权。

## 规格增量

每个 `specs/<能力>/spec.md` 使用四种分区：`## ADDED Requirements`、`## MODIFIED Requirements`、`## REMOVED Requirements`、`## RENAMED Requirements`。

ADDED 的每条需求至少有一个场景。MODIFIED 必须包含完整说明与至少一个场景，并指向现行规格中的同编号条目。REMOVED 的条目下必须有两行非空内容：

```text
### Requirement: R-x-001 旧需求
原因：删除的原因
迁移：替代方式或明确说明无需迁移
```

RENAMED 保留编号：

```text
- FROM: R-x-001 旧名称
- TO: R-x-001 新名称
```

## 校验边界与结果

解析器位于 `@fasrun/plugin-spec-common`，输入为相对规格根目录的「路径 → 文本」映射，不读文件。结果包含源文件与行号、四种增量、场景、用户场景及引用、设计、任务、并行标记、范围、用例、依赖与待澄清位置。

活跃变更检查引用与覆盖：用户场景和设计指向存在的需求；每条增量需求有任务覆盖；任务对应到需求；依赖存在且无环。缺少 design.md 或 tasks.md 时仅检查已有层。`changes/archive/` 只检查格式，跳过覆盖、依赖、范围与历史目标是否仍存在的检查；MODIFIED 的完整内容和其他格式检查仍保留。自检不判断 THEN 的可判定性，也不执行归档冲突检查。

`config.yaml` 的 `allowedPaths` 是目录前缀或准确文件名清单；只列已批准路径。拒绝绝对路径、`..`、反斜线及通配符，不用字符串前缀误放行相似目录名。含活跃 tasks.md 时必须提供配置；`init` 创建的空规格树尚无任务，可没有配置。

错误输出含类别、文件、行号与说明。类别为 `SPEC_ID_FORMAT`、`SPEC_NO_SCENARIO`、`SPEC_MODIFIED_INCOMPLETE`、`SPEC_REMOVED_NO_REASON`、`SPEC_OPEN_QUESTIONS`、`SPEC_US_COVERAGE`、`SPEC_DESIGN_MAPPING`、`SPEC_TASK_COVERAGE`、`SPEC_TASK_CYCLE`、`SPEC_TASK_UNKNOWN_DEP`、`SPEC_SCOPE`。各类不合格样例位于 `plugins/spec/spec-common/test/fixtures/`。spec-common 的 Vitest 配置默认收集校验器覆盖率，并强制分支覆盖率不低于 Fasfile 规定的 90%。

退出码沿用 D-10：0 成功，1 检查失败，2 参数错误，3 缺少或无效配置，4 无法连接，5 其他错误。`--json` 在标准输出只写一个成功/失败信封；失败的 `FASRUN_CHECK_FAILED` 说明中保留每个规格错误的类别和位置。标准输出与错误输出不重复报告。

CI 的 `spec-validate` 作业构建命令行后对本仓规格执行同一命令。对 `.github/` 的修改须由 PontusAI 放行，代码由 zjh1978 评审，agent 不批准或合并。
