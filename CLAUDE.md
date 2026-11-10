# SpecForge 仓库开发纪律

本文件写给在本仓库工作的编码 agent 与开发者，只写规则。

## 先规格后代码

- 每项工作一个变更目录：`specforge/changes/<工作编号>-<简述>/`。小改动有 `requirements.md` 与规格增量 `specs/<能力>/spec.md`；较大的工作依次增加 `design.md` 与 `tasks.md`。每层一个规格 PR，确认合并后才进入下一层。
- 没有已合并的任务层规格，就没有代码 PR。一个任务一个分支、一个代码 PR，只修改任务写明的修改范围，并包含任务列出的用例。
- 规格的格式与编号以 `specforge/` 中的约定为准：需求条目 `R-<能力>-<三位序号>`，场景 `<需求条目>.S<序号>`，用户场景 `US-<序号>`，设计条目 `D-<序号>`，任务 `T<三位序号>`。编号进入现行规格后不再变化，删除的编号不复用。
- 提交规格 PR 前运行 `sf spec validate specforge/`，待澄清必须为空。
- 交付后用 `sf spec archive` 把规格增量合并进 `specforge/specs/`，变更目录移入 `changes/archive/`。

## 分支、提交与 PR

- 分支：规格 PR 为 `docs/<工作编号>-<层>`；代码 PR 为 `feat/<工作编号>-T<nnn>-<简述>`；其他人工分支为 `<类型>/<工作编号>-<简述>`，类型为 feat、fix、refactor、docs、chore、test。
- 提交信息遵循 Conventional Commits，由 commitlint 检查。
- agent 的提交以 agent 身份为作者，触发人为共同作者（`Co-authored-by:` 尾注）。
- 代码 PR 的标题以 `<工作编号> T<nnn>` 开头，正文链接变更目录并写明对应的需求、设计条目与用例。
- 修改了 `packages/` 或 `plugins/` 下的包，附带 Changesets 变更说明（`pnpm changeset`）。

## 评审、批准与合并

- 需求层规格 PR、修改 `.github/` 的 PR 与修改 `specforge/specs/` 的 PR 由 PontusAI 批准；设计层、任务层规格 PR 与代码 PR 由 zjh1978 批准。
- 批准人负责合并。agent（GitHub App）不批准、不合并，也不推送到受保护的分支。
- 触发人不能单独批准自己的 PR；每个 PR 至少一位作者之外的评审人（见 `.github/CODEOWNERS`）。
- 自举阶段以上分工靠约定执行；平台就绪后由授权记录与权限规则强制。

## 命名

- 组件在文档与界面中写作 `SF-<组件>-<类型>`（如 SF-CORE-SVC）；目录、服务、镜像与命名空间全小写、以连字符分隔（如 sf-core-svc）。
- 包名：插件包 `@specforge/plugin-<插件>-<角色>`，平台基础包 `@specforge/<基础包>`。
- 源码文件与目录小写、以连字符分隔；类型、类与 React 组件用大驼峰；函数与变量用小驼峰；常量全大写、以下划线分隔。
- 数据库 schema 为插件名，表与列为小写下划线；约束与索引以 `pk_`、`fk_`、`uq_`、`ix_`、`ck_` 开头。
- HTTP 接口 `/api/<插件>/v<主版本>/<资源复数>`；MCP 工具 `<插件>.<动词>_<名词>`；事件 `<插件>.<实体>.<过去式动词>`；环境变量 `SF_<组件>_<名称>`。

## 工程规则

- 插件之间只能依赖对方的 `-common`、`-node`、`-react` 包；`-backend` 与 `-web` 包只由宿主装配。依赖方向由 ESLint 检查。
- 后端插件按 starter、application、infrastructure、common 四层组织；数据库行类型只在 infrastructure 层出现，application 层对外只返回 `-common` 中的契约类型；starter 只做装配。
- 每个后端插件只读写自己 schema 中的表，跨插件只以标识引用，不建外键。数据库迁移只向前。
- 测试与源码放在一起（`*.test.ts`）；用例编号写在测试名中。
- 新依赖只用开源许可的免费版本，发布时间不少于 7 天（pnpm 的 `minimumReleaseAge`），在 PR 中写明版本与许可；依赖的安装脚本只在 `allowBuilds` 中显式允许后才执行。

## 发现缺项时

- 规格或设计没有覆盖、或与实际不符时，不在代码里自行决定：先在工单中写明问题与可选做法，@ 需求评审人。
- 结论属于本工作的，修改规格增量并补一个规格 PR；改变顶层设计的，由需求评审人处理设计文档。

## 公开仓库的安全

- 任何密钥、令牌、内部主机名与 IP 都不入库；`.env` 类文件只提交 `.example`。
- 每个 PR 推送前在本地运行 gitleaks。
- 服务与工具在本机只绑定 127.0.0.1。

## 本地检查

推送前至少运行：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
gitleaks git --redact .
```
