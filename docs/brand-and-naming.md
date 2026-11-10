# Fasrun 品牌与技术规范

**版本**：v1.3  
**状态**：正式  
**最后更新**：2026-11-10  
**适用范围**：产品品牌、工程命名、文档架构、SEO 与实体信号

## 1. 品牌定位

| 项目 | 规范 |
|------|------|
| **产品名** | Fasrun |
| **中文主译名** | 帆驭 (Fasrun) |
| **技术标识** | `fasrun`（全小写） |
| **核心隐喻** | Fas（罗马法“公理 / 正道”）+ Run（执行） |
| **产品定位** | Spec 驱动的 AI Agent 控制面与运行时护栏（Spec-driven control plane and runtime guardrails for autonomous AI agents） |
| **中文定位** | 帆驭 (Fasrun) 是一套 Spec 驱动的面向软件交付团队的 AI Agent 控制平面与运行时基础设施。它通过 Fasfile 将企业治理公理与安全约束代码化，为自主 Agent 提供确定性执行保障。 |
| **目标用户** | 开发者、平台工程团队、企业 AI 治理负责人 |

### 1.1 中文品牌使用规范

#### 标准呈现形式

| 场景 | 推荐写法 | 说明 |
|------|----------|------|
| 正式文档 / 官网 / README 首段 | 帆驭 (Fasrun) | 首选，中英联合，实体最清晰 |
| 标题 / 导航 / 短文案 | Fasrun 帆驭 | 英文在前，中文作为补充 |
| 社交媒体 / 社群讨论 | 帆驭 (Fasrun) | 避免单独使用「帆驭」 |
| 代码 / CLI / 包名 / 域名 | 仅使用 `fasrun` | 技术标识保持全小写英文 |

#### 禁止事项

- **初期禁止单独使用「帆驭」**作为网站标题、域名、社交媒体账号名或独立品牌词。必须与 Fasrun 联合呈现，防止与「帆软（FineReport）」产生实体混淆或 SEO 流量吞噬。
- 不使用「帆软」「帆*」其他变体作为产品名称。
- 不在正式材料中使用「帆行」「帆策」等备选译名，除非明确标注为技术比喻而非品牌名。

#### 固定实体定义句式

所有中文 README、文档首页、技术博客、知乎 / 掘金 / 公众号文章的**第一段**，必须使用以下句式（可微调但核心实体不可缺失）：

> 帆驭 (Fasrun) 是一套 Spec 驱动的面向软件交付团队的 AI Agent 控制平面与运行时基础设施。它通过 Fasfile 将企业治理公理与安全约束（Guardrails）代码化，为自主 Agent 提供确定性执行保障。

#### 三元组关系（GEO 强化）

在外部内容中反复强化以下关系：

- [帆驭 / Fasrun] — 提供 — Agent 控制平面 (Agent Control Plane)
- [帆驭 / Fasrun] — 核心机制 — 规格驱动 (Spec-driven Architecture)
- [帆驭 / Fasrun] — 配置文件 — Fasfile (运行公理与约束)

#### 结构化数据要求

中文页面的 JSON-LD 必须包含：

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Fasrun",
  "alternateName": ["帆驭", "帆驭 Agent 控制平面"],
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "All",
  "description": "Spec-driven control plane and deterministic runtime guardrails for autonomous AI agents."
}
```

#### 社区与内容规范

- 在知乎、掘金、微信公众号、技术论坛发布内容时，标题或首段必须出现「帆驭 (Fasrun)」。
- 对比文章中明确区分：  
  > 与 Temporal / LangGraph 侧重任务工作流不同，帆驭 (Fasrun) 侧重的是 Agent 运行公理约束（Fasfile）与策略注入（Policy Gates）。
- 避免在无上下文的情况下单独提及「帆驭」，以防读者联想到帆软。

#### 内部与外部一致性

- 组织 README、主仓 README、官网中文版、文档站中文版必须统一使用上述规范。
- 英文材料保持原样，仅在需要双语呈现的位置补充中文品牌。

## 2. 域名与数字资产

| 资产 | 定位 | 优先级 | 规则 |
|------|------|--------|------|
| `fasrun.dev` | 主站 / 文档 / 开发者门户 | P0 | 全部内容与 SEO 权重集中于此 |
| `fas.run` | 短链 / CLI 安装入口 | P0 | 仅用于跳转与安装脚本；网页访问一律 301 至 `fasrun.dev` 对应路径 |
| `github.com/fasrun` | 代码与文档组织 | P0 | 立即锁定 |
| npm `@fasrun` | 包生态 | P0 | 创建组织并发布占位包 |
| PyPI `fasrun` / `fasrun-cli` | 包生态 | P0 | 抢注并填写 homepage / repository |

## 3. 工程命名规范

### 3.1 CLI
- 主命令：`fasrun`
- 可选别名：`fas`（安装脚本提供）
- 常用子命令：`init`、`run`、`dev`、`check`、`apply`

### 3.2 配置与规则文件
- 主配置：`fasrun.yaml`
- 规则文件：`Fasfile`（声明 Agent 运行公理与约束）
- 本地覆盖：`fasrun.local.yaml`

### 3.3 环境变量
统一前缀 `FASRUN_`：  
`FASRUN_API_KEY`、`FASRUN_ENDPOINT`、`FASRUN_RULESET_PATH`、`FASRUN_CONFIG`、`FASRUN_LOG_LEVEL`

### 3.4 包命名
| 生态 | 规范 |
|------|------|
| npm | `@fasrun/core`、`@fasrun/cli`、`@fasrun/sdk` |
| PyPI | `fasrun`、`fasrun-cli` |
| crates.io | `fasrun`、`fasrun-core`、`fasrun-cli` |
| Go | `github.com/fasrun/fasrun`（Monorepo）或 `github.com/fasrun/fasrun-go` |

### 3.5 Kubernetes
- API Group 分层：`policy.fasrun.dev`、`core.fasrun.dev`（预留）
- 核心资源：`FasrunPolicy`（shortName: `fpol`）
- Label / Annotation 前缀：`fasrun.dev/`

### 3.6 Core API
主域名优先 `api.fas.run`，路径 `/v1/`：  
`POST /v1/specs/validate`、`POST /v1/runs`、`GET /v1/runs/{run_id}`、`POST /v1/runs/{run_id}/terminate`、`GET /v1/policies`

## 4. 文档与 URL 架构

```
fasrun.dev/
├── docs/
│   ├── quickstart
│   ├── fasfile-spec
│   └── guides/
│       ├── human-in-the-loop
│       └── guardrail-enforcement
├── concepts/
│   └── spec-driven-architecture
├── compare/
│   ├── fasrun-vs-temporal
│   └── fasrun-vs-custom-orchestrators
└── blog/
    └── engineering/
```

## 5. SEO 关键词分层

| 层级 | 核心词模式 | 承接页面 |
|------|------------|----------|
| L1 品牌与分发 | fasrun, 帆驭 (Fasrun), fasrun cli, fasrun docs, install fasrun | `/`、`/docs/quickstart` |
| L2 核心范式 | spec-driven agent control plane, fasfile spec, deterministic agent execution, Agent 控制平面 | `/concepts/spec-driven-architecture`、`/docs/fasfile-spec` |
| L3 场景与痛点 | ai agent guardrails, human-in-the-loop agent orchestration, policy as code for ai agents | `/docs/guides/*`、`/blog/*` |
| L4 选型对比 | fasrun vs temporal, agent control plane alternatives | `/compare/*` |

## 6. 页面标题与 Meta 模板

| 页面类型 | Title | Meta Description |
|----------|-------|------------------|
| 首页 / 中文门户 | 帆驭 (Fasrun) - 规格驱动的 AI Agent 控制平面与运行时基础设施 | Spec 驱动的面向软件交付团队的 AI Agent 控制平面。通过 Fasfile 将治理公理与安全约束代码化。 |
| 规范页 | Fasfile Specification \| Fasrun Agent Control Plane | Define deterministic constraints, permissions, and guardrails for autonomous agents using Fasfile spec. |
| 中文规范页 | Fasfile 规范文档 \| 帆驭 (Fasrun) Agent 策略与确定性运行公理 | 使用 Fasfile 声明 Agent 运行公理、权限与安全约束。 |
| 场景页 | Human-in-the-Loop Orchestration for AI Agents \| Fasrun | Inject policy gates and asynchronous human review steps into agent runtimes. |
| 对比页 | Fasrun vs Temporal: Agent Control Plane vs Workflow Engine | Architectural differences between workflow engines and spec-driven agent control planes. |
| 中文对比页 | 帆驭 (Fasrun) vs Temporal: Agent 控制平面与工作流引擎架构对比 | 理解工作流引擎与 Spec 驱动 Agent 控制平面的架构差异。 |

## 7. 实体信号（Entity SEO）

### GitHub
- About：`Spec-driven control plane and runtime guardrails for autonomous AI agents. 帆驭 (Fasrun).`
- Topics：`agent-control-plane`, `ai-guardrails`, `spec-driven`, `orchestration`, `developer-tools`, `runtime`
- README 顶端固定链接至 `https://fasrun.dev`

### 包管理器
统一描述包含 “fasrun”、“agent runtime control plane”、“fasfile”。  
必须填写：  
- `homepage`: `https://fasrun.dev`  
- `repository`: `https://github.com/fasrun/fasrun`

### 结构化数据
文档与 CLI 参考页植入 `TechArticle` + `SoftwareApplication` JSON-LD，声明 `applicationCategory: DeveloperApplication`。

中文页面建议示例：

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Fasrun",
  "alternateName": ["帆驭", "帆驭 Agent 控制平面"],
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "All",
  "description": "Spec-driven control plane and deterministic runtime guardrails for autonomous AI agents."
}
```

## 8. 落地优先级

| 优先级 | 动作 |
|--------|------|
| P0 | 创建 GitHub 组织 `fasrun` |
| P0 | 注册 `fasrun.dev` 与 `fas.run` |
| P0 | 抢注 npm `@fasrun`、PyPI `fasrun` / `fasrun-cli` |
| P1 | 上线 `/docs/quickstart` 与 `/docs/fasfile-spec` |
| P1 | 统一 GitHub README 与包描述文案（含中文品牌） |
| P2 | 撰写对比页与技术博客 |
| P2 | 文档页添加 JSON-LD（含 alternateName） |

---

**执行建议**：将本文件保存为仓库 `docs/brand-and-naming.md`，并在 `CONTRIBUTING.md` 中引用。
