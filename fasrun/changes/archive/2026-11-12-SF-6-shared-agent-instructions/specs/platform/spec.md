## MODIFIED Requirements

### Requirement: R-platform-003 仓库协作规则
仓库根目录必须有 AGENTS.md，作为共享执行器说明的唯一正文，写明本仓库的开发纪律：先规格后代码、分支与提交规则、命名规范、发现缺项时的做法；只写规则，不写方案文档的内部细节。根 CLAUDE.md 必须仅含单独一行 `@AGENTS.md`，使 Claude Code 经引用、其他采用 AGENTS.md 的执行器经共享入口读取同一正文，不复制维护第二份规则。首次迁移必须完整保留原 CLAUDE.md 的纪律正文，不用 init 模板替换。仓库必须有 CODEOWNERS：fasrun/changes/**/requirements.md 与 fasrun/specs/** 归需求评审人；.github/** 单独归 PontusAI，CI 配置的修改由人放行；其余路径至少有两名所有者，使每个 PR 都有作者之外的评审人。
#### Scenario: R-platform-003.S1 每条路径都有作者之外的所有者
- GIVEN 仓库中的 CODEOWNERS
- WHEN 对仓库中的任意文件路径求所有者
- THEN 结果非空；除单独归属一人的路径外，所有者不少于两人
#### Scenario: R-platform-003.S2 规格路径归需求评审人
- GIVEN 仓库中的 CODEOWNERS
- WHEN 对 fasrun/specs/platform/spec.md 与 fasrun/changes/SF-1-engineering-skeleton/requirements.md 求所有者
- THEN 所有者为需求评审人
#### Scenario: R-platform-003.S3 CI 配置单独归 PontusAI
- GIVEN 仓库中的 CODEOWNERS
- WHEN 对 .github/workflows/ci.yml 与 .github/CODEOWNERS 求所有者
- THEN 所有者只有 PontusAI

#### Scenario: R-platform-003.S4 两个入口使用唯一纪律正文
- GIVEN Fasrun 仓库根目录的 AGENTS.md 与 CLAUDE.md
- WHEN 直接读取 AGENTS.md，或解析 CLAUDE.md 中的本地文件引用
- THEN 两条路径得到同一纪律正文；CLAUDE.md 恰为单独一行 @AGENTS.md，不含第二份规则且引用文件存在
#### Scenario: R-platform-003.S5 自身迁移保留规则且与 init 兼容
- GIVEN 自身采用迁移前的 CLAUDE.md，以及迁移后的两个入口文件
- WHEN 比较正文，并把迁移后两文件复制到隔离临时仓库运行已交付的 fasrun init 两次
- THEN AGENTS.md 与迁移前 CLAUDE.md 逐字相同；两次 init 均不改写已有 AGENTS.md 或重复添加 CLAUDE.md 引用；R-platform-015 的初始化能力仍按既有实现交付
