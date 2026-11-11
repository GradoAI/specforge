# 参与贡献

感谢参与帆驭 (Fasrun) 的开发。

- 开发纪律（先规格后代码、分支与提交、评审与合并、命名）见 [CLAUDE.md](CLAUDE.md)。
- 品牌与命名以 [docs/brand-and-naming.md](docs/brand-and-naming.md)（《Fasrun 品牌与技术规范》）为准：中文正式文档首段写「帆驭 (Fasrun)」并使用固定的实体定义句，标题与导航写「Fasrun 帆驭」，代码、命令行、包名与域名只用 `fasrun`。
- 项目的长期约束在根目录的 [Fasfile](Fasfile) 中，仓库配置在 [fasrun.yaml](fasrun.yaml) 中；本机的命令行覆盖写在 `fasrun.local.yaml`，不提交。

## 许可证

- 仓库整体以 [AGPL-3.0](LICENSE) 发布，`package.json` 的 `license` 字段为 `AGPL-3.0-only`。
- 例外：供插件开发使用的包以 Apache-2.0 发布，各自带 Apache-2.0 全文的 `LICENSE`，`license` 字段为 `Apache-2.0`。这些包是：
  - backend-plugin-api、frontend-plugin-api、contracts-core、ui、test-utils、cli-templates；
  - 各插件的 `-common`、`-node`、`-react` 包。
- 第三方插件可以只依赖这些包，不受 AGPL 约束。
- 声明为 Apache-2.0 的包不能依赖 AGPL-3.0-only 的工作区包。CI 的 `license-check` 检查以上规则；新包的 `license` 字段由脚手架按角色写入。

## DCO 签名

外部贡献者（不是组织成员或仓库协作者）提交的 PR 中，每个提交都必须带与提交作者一致的签名行，表示你按 [Developer Certificate of Origin](https://developercertificate.org/) 提交这些改动：

```
Signed-off-by: 你的名字 <你的邮箱>
```

- 提交时加 `-s` 即可自动添加：`git commit -s`。
- 补签已有的提交：`git rebase --signoff main`，然后强制推送。
- 组织成员、仓库协作者与本仓库 GitHub App 的提交不要求签名。CI 的 `dco` 检查列出缺少签名的提交。
