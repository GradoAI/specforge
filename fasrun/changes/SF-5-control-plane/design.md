# 设计：SF-5 M1 控制平面核心

需求依据为已合入 #52（fbe9d6d）的 41 条需求、75 个场景；工程基线为 main 7be759f（另含独立 SF-6 共享纪律入口，不属于本产品设计范围）。#51 的会话确认原文保存在 confirmation.md，已随需求合入完成对账。本层只决定实现结构与验证方法，不创建任务或代码，不将设计自检写成产品验收通过。

## 方案

### D-1 组件与服务装配
对应需求：R-identity-001、R-identity-002、R-connect-001、R-entry-001、R-spec-010

CORE 是唯一 Fasrun 状态写入者，装配 identity、orchestration、spec、knowledge、governance、entry 与 connect 的状态侧服务。CONNECT 运行 GitHub 适配、验签、轮询和出站调用，不取得 Fasrun 数据库凭据；经 mTLS 内部接口请求 CORE 持久化。NODE 和 PORTAL 在本轮不接入实际执行或业务界面。Keycloak 使用独立数据库，属于外部身份系统。

保留现有 backend-plugin-api 的服务工厂/扩展点、Awilix 容器与四层结构。契约 DTO/Zod 放在各 `-common`，服务引用、步骤/条件/适配器登记扩展点放在必要的 `-node` 包；宿主引入各 `-backend` 的装配导出，插件不得跨引入 backend 实现。`starter` 只登记/装配，application 定义用例与端口，infrastructure 实现仓储、HTTP/DBOS 适配。

现有 connect-backend 只在网关注册，需要显式划分 `core-state` 与 `gateway` 装配模式：CORE 登记 connect schema 仓储及内部状态接口；CONNECT 登记适配与传输，不登记数据库依赖。二者共享 connect-common 契约和同一领域标识，不形成第二套工作状态。GitHub 适配放在 connect-backend-module-github，通过 connect-node 扩展点登记。各模式启动测试验证依赖缺失即失败、网关无数据库访问、只有 CORE 可改变工作/关卡。

现有 coreServices 的 AuthService/DataRefService 等只有骨架签名。新增带 ActorContext、授权记录、操作及对象上下文的权限/引用服务契约；旧 authenticate 作为兼容包装保留，旧不含上下文的 read 不允许用于受保护数据。宿主组合根提供明确工厂，不让 backend-defaults 依赖插件实现；身份、审计、数据读取通过端口与事件接缝避免循环依赖。各插件数据库访问继续绑定自身 schema，不能把一个请求插件的 scope 错用于另一插件仓储。

### D-2 身份认证与账号关联
对应需求：R-identity-001、R-identity-002、R-entry-003

identity 实现 Keycloak OIDC 适配，校验签名、允许算法、issuer、audience、exp/nbf；未知 kid 可刷新受信 JWKS，失败即拒绝，不接受任意 token 指定的 URL。浏览器采用授权码+PKCE、state/nonce，服务端保存会话摘要及有效期，Cookie 为 HttpOnly/Secure/SameSite，写请求校验 CSRF 与 Origin。M1 使用 Keycloak 原生登录页，不做 M3 主题。HTTP/MCP bearer 入口使用同一验证器，并每次检查成员停用状态。

成员按 `(issuer, subject)` 识别；GitHub 按 provider、installation/组织归属及不可变外部账号 ID 关联 member，不按 login/displayName 猜测。未关联或歧义事件进入可查询的关联问题状态，由具 member.manage 权限的人处理后重放原事件。登录时组织选择只能取该成员已获准范围，不能信任客户端传入 org_id。停用和会话撤销使用持久版本，下一次请求即失效，不仅等 JWT 自然过期。

### D-3 权限矩阵、两层准入与授权快照
对应需求：R-identity-002、R-identity-003、R-governance-001、R-governance-002

identity-common 定义 Subject、Scope、Permission、Decision（allowed、matchedRuleIds、policyVersion、reason）；identity-node 暴露判定端口。按技术 2.17 全部权限点与14角色发布版本化基础数据，由现有 migrate 的基础数据同步写入，组织定制不覆盖。作用域祖先范围的允许规则取并集，叠加组织隔离、授权记录、安全策略及数据范围的限制；平台管理员不隐式获得其他批准角色。批准权限对 agent 恒拒绝，触发人不能单独完成批准；需求确认的兼任仍按项目设置与独立评审条件共同判断。

条件求值器为确定性纯函数，位于共享契约/工具包，不依赖数据库或模型。表达式严格一根 must/should/must_not、最大五层；条件目录校验参数及允许结构化字段，未知项/类型错误拒绝。保存规则时和执行前均校验；`not a relation` 等动态条件在当前对象上求值。空组合语义明确为 must 真、should 假、must_not 真，目录规则禁止利用空条件绕过必需职责分离。所有有效权限查询返回尚待对象求值的条件，不把它伪装为最终允许。

受理分为来源/身份/请求强度判定和候选研判。明确有权请求直接进入准入；关闭模式不启动，观察模式仅保存候选，自动模式必须满足已批准主动规则且记录研判依据。bot 只产生候选。成功受理先幂等创建不可变 authorization_record，再以该记录创建工作；跨插件失败通过稳定 intake_id 重试接续，不伪造跨插件事务。授权包含主体、来源、范围、请求强度、规则及策略版本。撤销写独立 revocation 记录，不 UPDATE 原快照。规则变更通知现存工作，不自动撤销；显式撤销/成员停用在请求、步骤、引用、对外动作前重查。范围扩大重新受理，结束工作恢复须按当前规则重验。

### D-4 审计、策略与凭据
对应需求：R-identity-004、R-connect-001、R-governance-002、R-entry-003

governance 持有安全策略、预算约束快照与审计事件；M1 只提供控制流所需读取/判定和本轮配置入口，不建设预算运营或成本结算产品。预算校验按组织/团队/项目/个人剩余额度和强制上限，重试计入成本；个人订阅免金额预算只能来自可信环境选择结果，不能由 agent 输出声明。后续真实执行时的计量与扣费留 M2/M4。

业务插件在自身事务内写 audit/event outbox；governance 消费以 eventId 唯一去重，按组织串行追加 hash(prevHash, canonicalEvent)，保留序号及链头检查点。安全敏感读取先持久记录访问意图/拒绝再返回，审计写失败不得静默返回数据。链验证对照独立保留的已发布链头/序号，验证修改、删除及尾部截断；测试以原链头为基准篡改副本，不能只验证剩余链内部自洽。只追加表触发器与角色权限拒绝修改删除，不把哈希链当作抵抗数据库与独立检查点同时被控制的保证。

网关密钥服务做 AES-256-GCM 信封加密，AAD 绑定租户、接入ID和密钥版本；主密钥挂载于网关外置 Secret，CORE 只存密文/包裹密钥，不能解密。OIDC 客户端用公共PKCE配置避免把长期外部密钥交给 CORE。轮换先验证新版本再切换活动指针，重试只按仍有效的密钥版本操作。日志、问题详情、审计入库前统一遮蔽，不能先写明文后过滤。

### D-5 GitHub 收件箱与对账
对应需求：R-connect-001、R-connect-002、R-connect-004、R-spec-009

网关对原始请求字节验证 webhook HMAC 与安装归属，调用 CORE 的 `connect.inbox.accept` 后才返回成功；CORE 提交失败则网关返回可重试失败。收件箱唯一键 `(installation_id, delivery_id)`；持久化收到的来源/时间/签名验证结果及 payload 引用，不保存令牌。重复事件返回原受理标识，不重复创建工作。对账生成稳定的合成事件键，使用外部对象 ID、更新时间及状态摘要，不用每次轮询的当前时间作为事件身份。

轮询每15分钟读取相关工单、PR与评审；逐页提交并维护游标，全部页面成功后推进高水位，失败保留重叠窗口重拉。GitHub 不为所有对象提供严格全序，因此旧事件只触发重新读取当前对象，不能直接回退本地较新快照；撤销/关闭/删除等以当前 API 事实和审计记录对账。恢复后可触发相同补拉。公网入口尚未就绪时关闭 webhook，轮询路径须独立跑通。

安装、仓库、PR与账号用不可变外部 ID；展示名称变化不改变关联。正文、评论、附件及链接内容注册为不可信引用，媒体访问按接入权限限制，不将外部URL直接交给高权限任意抓取器。外部账号无法唯一关联时保留事件等待人工处理，不能通过评论里的批准声明推进关卡。

### D-6 发件箱、外部动作与幂等
对应需求：R-connect-003、R-orchestration-002、R-orchestration-003、R-spec-009、R-entry-002

每个产生业务变更的插件在自身 schema 的事务中写 outbox，后续调用方只传事件/动作引用。转发器用 SKIP LOCKED、租约与重试时间取出事件，LISTEN/NOTIFY 仅为唤醒，丢通知仍有轮询兜底。跨插件/组件至少投递一次，消费者在自身业务事务中以 event_id 去重。数据库行不跨插件暴露，不由一个插件用共享事务直接操作其他 schema。

外部动作登记 action_id、业务幂等键、请求摘要、目标、状态与外部结果引用后才发出。动作键为 `<work>:<segment>:<step>:<definitionHash>`；请求级 Idempotency-Key 另按 org/actor/operation/key 唯一，键相同内容不同为409。相同键并发请求通过数据库唯一约束及动作租约序列化；调用成功但持久化前崩溃时，先按稳定标记/分支/外部ID查询实际效果，再决定重试。对于不能确认结果的超时，保持 unknown 并对账，不能盲目重发来制造第二条评论或 PR。

GitHub 写回使用可识别的稳定工作/动作标记，开PR使用确定的工作/层分支及查询现有PR兜底，不假定 GitHub 普遍支持 Idempotency-Key。受理确认一次，过程只更新内部状态，只有需人行动/可用结果/失败时再写回。429按远端重试时间退避，403区分额度与权限，权限失败转需人处理。所有发送前重新校验授权、数据标签与渠道可见范围。

### D-7 工作状态与规格前段
对应需求：R-identity-003、R-spec-005、R-spec-006、R-spec-009、R-orchestration-010、R-entry-004

orchestration 持有工作、来源讨论关联和 PR 索引；spec 持有层版本、检查与确认；knowledge 持有流程/模板与项目约束版本。状态由持久控制流位置投影：received/clarifying/drafting/waiting_review/waiting_merge/spec_confirmed/needs_human，另有暂停/取消控制标志；M1 spec_confirmed 是交接状态，不写成 delivered/archived。对应中文展示由契约给定，不能让客户端自由回写状态。

按2.17登记小缺陷、标准缺陷与功能开发流程，默认回答8小时、规格评审24小时、重规划上限3；升级L1团队负责人、L2组织管理员。前段来自人工版本化流程，分级结果只能在允许分支中选择，不让 agent 自带计划执行。小改动需求+增量，较大工作需求→设计→任务，各层确认并合入后才解锁下一层；执行段的规划边界在受控回归中验证，生产 M1 到最终规格交接时不派发节点。

工单关闭/取消持久化停止请求，阻止启动新步骤及关卡推进；已发生效果保留，不能以取消抹去。正文实质修改记录差异，回到受影响层并使相关确认失效。暂停检查在步骤边界及可取消调用处，恢复重验授权且不跳过待处理关卡。结束工作关联不删，人的新请求按当前准入重验，bot/CI不唤醒。

### D-8 可替换调用与步骤目录
对应需求：R-spec-010、R-orchestration-010、R-orchestration-013、R-orchestration-019

orchestration-common 定义版本化 AgentCall/AgentResult：callId、org/work/stepRun、attempt、授权引用、输入引用及允许读写范围、输出schema版本、deadline、实现标识；结果为 success/failed/cancelled，含输出引用/结构化结果及使用元数据，不含任意计划字段。`AgentInvoker.invoke/getResult/cancel` 端口置于 orchestration-node，具体调用实现由宿主装配；spec登记澄清/起草各层的schema和步骤，不直接依赖调用实现。相同callId重试先取结果，取消和迟到回包有状态CAS，旧尝试不能覆盖新尝试。

M1提供受控fixture实现，经相同调用端口返回成功、失败、超时、非法字段与恶意指令。只在测试/专用验证配置显式启用，运行证据标明stub与fixture版本；未配置真实实现时禁止伪装为真实自动起草。M2替换端口实现为节点/执行器/模型链，不替换工作/授权/关卡模型；不在本轮启动本机命令执行器或读开发者个人凭据。

步骤目录以 `(plugin, stepName, implementationVersion)` 登记输入输出schema、权限、成本、允许重试/超时和确定性证据。系统步骤未经同输入两次输出一致测试不得登记；时间戳、外部流水号放元数据，业务输出使用稳定动作引用。agent输出按schema剥离未声明字段并审计，只有 replanRequested 布尔标志可请求重规划；解释文字作为不可信引用，不进入规划输入。

### D-9 计划校验、缓存与版本
对应需求：R-orchestration-006、R-orchestration-007、R-orchestration-008、R-orchestration-009、R-orchestration-011

计划JSON包括版本、steps、依赖、输入引用、对应任务和关卡；禁止表达式代码、未知步骤、无界循环。解释器和校验器共享schema及目录解析器，验证顺序为结构/祖先与类型、权限数据范围、预算、任务双向覆盖、必需关卡与时限，输出稳定错误码、步骤及字段路径；任何失败都不能创建可执行子工作流。fast-check同时生成合法和非法计划，执行器必须与校验器的结构接受域一致。

缓存键为流程版本、规格结构任务编号、环境模板版本、策略版本；按租户/项目隔离，结构稳定序列化排除措辞。结构签名对步骤重命名不敏感，以类型、目录步骤、任务、关卡角色和依赖的规范图表示比较，不简单按用户步骤ID排序。缓存保存首次计划模板，命中仅绑定当前工作参数；绑定后仍验证当前权限、预算和范围，不能复用旧授权结果。

校验通过的计划不可变；每次重新规划以工作行版本CAS分配版本号/计数，默认三次上限，超限转needs_human，禁止继续调用规划端口。首次规划失败的再次生成也计入有界重规划，不产生无限初始重试。可信指令持久排队，在当前步骤结束后形成新版本；普通消息不增版本。任务/依赖/输入绑定、目录实现版本、配置及权限范围参与步骤定义哈希；改变上游会使下游重跑。未变且上游未重跑步骤沿用结果和原键；新计划保留沿用来源，不重写旧记录。

### D-10 持久化运行时与关卡
对应需求：R-orchestration-001、R-orchestration-003、R-orchestration-004、R-orchestration-005、R-orchestration-017

解释器依赖 DurableRuntime 端口（startWorkflow、runStep、send、receiveUntil、recover、drain），DBOS为真实适配。每work一个不限并发的编排工作流；系统/agent步骤子工作流在受限工作队列，标识 `<work>:<segment>:v<planVersion>:<step>`；消息有独立队列与受理容量。关卡等待在编排层，不占工作队列名额。业务记录与DBOS检查点不是单个跨系统事务：所有业务步骤以运行/动作唯一键幂等，恢复先检查已提交结果，再让运行时完成检查点。

关卡记录gateId、层/步骤、要求角色、授权/提交版本、enteredAt、deadlineAt、remind/escalate状态。按持久化deadline计算剩余等待，不每次重启重新开始24小时。主题采用 `review:<step>` 并加工作/计划/关卡实例路由键，旧实例消息只记录不消费成当前批准；其他主题消息保留在各自收件状态。提醒和升级各有独立幂等事件，默认截止先提醒再向L1/L2升级，具体间隔来自版本化流程。到达评审和到期并发由CAS决定一次状态转换，仍重新验证授权及当前head。

DBOS系统表在专用dbos schema，用独立运行时凭据；插件不直接读写，fasrun_app不能读其原始载荷。业务表仍遵守现有迁移/Drizzle/RLS检查；迁移工具对插件schema的两张内部表精确规则不扩大。DBOS初始化/升级单独核对SDK元数据、访问权限和恢复演练，不能用名称前缀免检业务表。版本选择与升级遵守D-19，不能沿用第6轮旧PG版本。

### D-11 消息交接、引用与可信度
对应需求：R-orchestration-011、R-orchestration-012、R-orchestration-014、R-orchestration-015、R-orchestration-016、R-entry-003

人的消息先由独立入站路径鉴权、分类、持久化，再用稳定messageId路由；目标步骤结束与消息交付在工作状态版本上协调，晚到则标记next-agent待领取；没有后续agent时形成触发人待处理记录，并在工作查询与来源工单提供链接。不能把消息留在结束步骤，也不能为了交付普通消息改计划。满工作队列下消息受理/路由五秒内完成的压力用例独立计时。

orchestration数据对象记录不可变内容引用、规范化标签、读取范围及hash；格式 `ref://plugin/category/id@version`，版本对内容和标签共同哈希。结构化数据仍由所属插件保存，大对象经FileStorage端口写不可变内容地址文件，原子写入后登记索引；失败孤儿文件只能按保留策略清理，不能返回不存在对象的成功引用。引用解析按当前ActorContext、授权、对象组织/范围及排除策略检查并审计，插件解析器只访问本域存储。

任一不可信输入使输出不可信，检查成功不提升可信度。人工确认通过当前提交内容重新生成confirmed引用，记录确认人/依据/原引用，不UPDATE旧标签。HTTP/MCP序列化保留来源与可信度；出站前按目标及标签检查，拒绝某分支不阻塞无依赖合法分支。不得把原工单/附件/错误文本拼入可信规划上下文。

### D-12 回放与发布兼容
对应需求：R-orchestration-018、R-orchestration-019、R-orchestration-020

回放读取固定计划/步骤实现和记录输出：系统步骤重新运行，agent使用已存结果，后续输入取本次回放上游结果；outbound为显式replay模式，只记录意图/稳定结果而不触网。随机ID、时钟及外部响应须作为受控元数据/输入注入，业务输出不可含非确定字段。审计区分回放，不生成真实PR/评论或重复业务事件。

应用版本显式固定为解释器版本，不由整个源码hash自动变化。兼容修改保留旧工作分支并通过恢复用例；不兼容发布采用两个版本Deployment与独立版本路由：先停止旧版本接收新work，保留其消息/关卡流量，启动新版本接新work，旧版本inflight=0才下线。不能用Kubernetes普通滚动升级直接终止旧等待工作。步骤注册表同时保留计划引用的旧实现；只有无工作/回放保留引用时才允许移除。跨版本数据迁移先扩后收，旧代码仍能读，失败保留旧服务。

### D-13 分层规格与当前提交确认
对应需求：R-spec-005、R-spec-006、R-spec-007、R-spec-009、R-connect-004

spec层唯一键 `(work_id, layer, revision)`，关联仓库baseCommit、变更路径、模板版本、输出引用、PR和headSha。起草输出先按目录清单限制为当前层文件，再复用spec-common解析/校验和配置check；记录工具版本、摘要及完整错误。THEN可判定性另保存检查结果及依据，不以机械schema通过代替。问题具有questionId/回答主体/时间/引用；未解问题保持等待，不能用超时当默认批准。

通过connect以GitHub Git对象/分支/PR接口提交允许的文本文件，不在CORE调用shell执行仓库代码。分支为确定的工作/层标识，提交以agent作者、触发人共同作者；分支保护和网关动作白名单禁止批准、合并及受保护分支推送。已有分支/PR先查询，发现人工改稿或head不符用条件更新拒绝覆盖并重新同步。GitHub评审以原始reviewId/用户ID/commitId/state保存；用户映射、当前角色、职责分离、必需领域确认和当前head全部满足才标approved；merged单独记录。旧提交批准、撤销、请求修改和closed-unmerged均不能推进下一层。实际晋级时再次读取当前事实，防止读取后改稿的竞态；合入内容不符合已确认head时重新确认，不盲信merge布尔值。

需求/设计中的领域由可信流程配置及结构化影响范围匹配Fasfile规则，agent可建议但不得自行移除必需确认领域；无法确定命中时进入澄清。reviewer解析为稳定成员标识，再由账号关联得到GitHub账号；重复角色去重但职责分离仍满足，不存在/停用/未关联确认人时阻塞并给出具体原因。

### D-14 完整配置 schema 与项目约束
对应需求：R-platform-017、R-spec-008、R-spec-007

spec-common发布version:1的严格Zod schema，CLI init/check和CI调用同一契约；fasrun.yaml字段为version、project、spec_root、spec_template、shared_files，拒绝未知字段及非法类型，路径限制为规范仓库相对路径，不能越界或用本地绝对路径。Fasfile保留全部现有字段及语义：principles字符串列表；stack字符串映射（按技术名允许扩展）；quality_gates显式required_checks、coverage、flaky_quarantine_days、bugfix_requires_reproducing_test、patch_release_without_migrations_or_contract_changes；protected_paths/high_risk_paths列表；agent.commands列表。

新增 review_rules 为数组：id、paths、domains、checks；prior_confirmations 为数组：id、domains、reviewer_member_ids、layers（requirements/design）。每规则须有唯一id与至少一个匹配域/路径，确认领域和成员不能为空；未知字段拒绝，未知成员在带identity上下文的语义检查拒绝。路径匹配使用受限glob并规范化，不接受父目录逃逸；规则内容在M1完整保留和匹配，AI代码评审实施留M2。对旧合法Fasfile新字段缺省为空，不要求引入虚构领域。模板显式示例与schema同步。

knowledge按仓库+baseCommit缓存解析结果，工作pin对应版本；main更新只影响新工作。无Fasfile时使用组织规范/模板。schema校验解决形状，带策略上下文的检查解决放宽：允许能力取交集、必需检查取并集、覆盖下限取最大、禁止范围取并集；未知或不可比较的声明不能默认放行，返回具体冲突。叙述原则不由模型改写成可放宽权限。

protected_paths对普通工作写入生效。M1归档程序入口必须验证已授权的ArchiveOperation，并复用CLI lib/spec-archive.ts现有真实文件系统执行器；不在插件复制写入/回滚实现，也不以只校验回调的空壳代替真实执行路径。操作由既有planner结果构造，仅含其既定增量合并、目录移动与已有元数据写入；绑定仓库/规格根、活跃变更、日期、目标、输入快照及全部动作内容，包含目录移动中的非Markdown附属文件。执行前重验当前授权、输入及动作内容，额外/遗漏/替换动作、同路径内容变化、旧快照或授权失效在首次写入前拒绝。staging/backup仅为该次操作的内部步骤，不授予任意路径写权限。

M0人工本机命令保留原参数、退出码与JSON结果，不增加Keycloak/网络前置；M1只能使用强制授权程序入口，不能把原人工命令登记为允许的agent命令或执行端口，也不能在授权缺失/失败时降级调用它。可信ActorContext、授权记录与有效性判定来自既有端口，不接受系统actor、布尔标记或调用者自报JSON作为豁免；不新增身份系统。两入口共用真实执行器，不以M0本机文件权限宣称M1鉴权。这里的边界不是抵抗任意本机代码执行的沙箱；M1仍不执行仓库shell，不引入M2节点/执行器。

复用现有路径/符号链接检查、冲突与覆盖预检及执行中写入/rename失败的回滚；独占访问是调用方前置条件，M0没有跨进程锁或并发编辑协议。快照复核不能消除复核后外部并发写入，回滚不是崩溃恢复日志。不能把整个archive目录作为通用豁免。M1业务终点仍为规格PR确认及后续交接，不增加完整代码交付归档业务链。修订来源与验收见[已确认修订追溯](scope-revision-67-68.md)。

### D-15 HTTP、MCP 与状态入口
对应需求：R-entry-001、R-entry-002、R-entry-003、R-entry-004、R-identity-002

插件common统一Zod请求/响应、权限、风险元数据及错误码，生成OpenAPI3.1和TypeScript客户端；entry汇总路由/工具登记，不复制业务用例。HTTP `/api/<plugin>/v1/<resources>` 与MCP `<plugin>.<verb>_<noun>` 映射同一application用例。MCP采用方案指定的无状态可流式HTTP协议，OAuth成员认证，无会话粘连；本轮不做M4工具分组/长任务扩展/动态客户端注册。

M1入口集合：identity的登录回调/当前成员/有效权限及受控账号关联；connect的接入配置与对账状态；orchestration的创建/列表/详情、回答、指示、暂停恢复取消、引用读取；spec的层/检查/PR状态查询。规格批准事实只来自GitHub有效评审，不提供agent可直写approved的工具。管理请求仍逐项要求矩阵权限，阶段引导只能由授权管理员在专用环境登记初始成员/接入，不能提交通用免鉴权bootstrap端点。

创建与触发都需幂等键；相同键冲突返回409，ETag/If-Match更新冲突返回412，列表按稳定createdAt/id游标，校验排序/过滤白名单。HTTP错误RFC9457含登记插件码和traceId；MCP映射等价错误及数据标签。CLI原有FASRUN_*错误与0–5退出码以兼容映射保留，公共目录增加插件码不破坏既有脚本。请求审计标明成员经客户端，错误不泄露堆栈或凭据。

SSE用持久事件ID支持Last-Event-ID补发，LISTEN/NOTIFY只作唤醒；每次订阅/补发重验权限，撤销后断开，不以缓存授权继续送事件。暂停/取消用持久控制命令，在工作版本CAS下处理；查询返回真实阻塞原因和已有GitHub工单/PR链接，不指向尚不存在的M3页面。

### D-16 数据模型、迁移与最小持久化
对应需求：R-identity-003、R-identity-004、R-connect-002、R-connect-003、R-spec-005、R-orchestration-001、R-orchestration-014

下表是M1必须持久化的实体边界，字段按技术2.4和M0标准列扩展；同域关系可建外键，跨域仅存标识。业务表统一带前缀ULID、org_id、created_at/updated_at/created_by/version，枚举CHECK、唯一键/索引、COMMENT、ENABLE/FORCE RLS和非owner服务角色。平台级配置另行限制平台主体，不能用空org_id绕过租户隔离。

| schema | 实体与关键字段/约束 |
| --- | --- |
| identity | 已有organization保留；team/member/external_account/role_assignment/permission_rule/project_scope；外部账号唯一provider/issuer/subject；authorization_record只追加、intake_id唯一；authorization_revocation独立追加；session摘要及撤销版本 |
| connect | integration/repository_binding/external_object/discussion；inbox唯一installation/delivery；reconcile_cursor；outbound_action唯一动作键和请求摘要、lease、retry_at、外部结果；credential_envelope只有密文版本 |
| orchestration | work带source/intake唯一关联、状态/控制标志/版本；work_discussion；plan_version只追加；step_run唯一work/segment/plan/step及复用来源；gate_instance持久deadline/head；message/receipt；data_object只追加、内容+标签hash；request_dedup；agent_call尝试/结果；PR索引 |
| spec | layer_revision只追加内容版本与base/head、change_path；layer_check；review_fact唯一外部review及版本；layer_confirmation只追加；clarification/question_answer；current_spec_index |
| knowledge | project_config_cache以repo/commit唯一；workflow_definition/spec_template/organization_rule带版本基础数据；不复制Fasfile为可编辑的第二真相源 |
| governance | policy_version、budget_constraint快照、audit_event/chain_checkpoint；只追加审计与策略版本 |
| environment | 仅执行环境模板版本及允许能力快照，供计划检查；不建节点、真实执行或模型结算表 |
| entry | SSE读取持久事件、工具描述来自契约；没有必要不单独复制work状态表 |

各业务插件自身outbox/consumer_receipt由自己的仓储管理，其他插件不能直接扫描该schema；平台转发器调用插件登记的claim/ack端口。只追加实体用触发器拒绝UPDATE/DELETE，撤销和新版本另记。迁移按先扩后收，既有organization数据及seed行为不破坏；版本化默认角色/流程/条件/模板通过既有base-data机制同步，不覆盖组织定制。M1只把已有星河数据映射到本轮实际新建实体，不构造M2/M3表。

### D-17 阶段验证与自动回归隔离
对应需求：R-connect-001、R-spec-009、R-spec-010、R-identity-001、R-orchestration-001、R-orchestration-020

两条证据通道：自动回归使用test-utils替身覆盖GitHub/agent异常，DBOS/Postgres真实；专用验证环境启用真实Keycloak/GitHub与相同CORE/CONNECT构建，agent可显式stub。真实验证使用专用realm、安装、仓库和账号，有固定验证对象前缀，只允许操作本次清单中的对象；不把真实用户工单用于故障注入，不将密钥放入测试fixture或日志。阶段脚本记录构建commit、契约/fixture版本、参与者与PR head、每项真实/模拟组件清单及实际对象链接。

阶段闭环至少覆盖一个三层工作及小改动分支、一次澄清、一个无权确认拒绝、一次新head使旧批准失效，最终真实当前版本确认与合并。真实Keycloak登录、token拒绝、真实GitHub读取/写回/PR/评审/对账单独留证；模拟回归的成功不替代它们。M1报告只能称真实控制平面/接入配合stub起草验证通过，M2再验证真实自动起草与执行闭环。

快速集每PR执行，不杀进程、不调用真实模型，目标5分钟；完整集在k3d每日/手动运行，加SIGKILL恢复、外部效果与检查点间崩溃、等待关卡重启和排空发布。现有CI不得为此减项；新增工作流/检查由PontusAI放行，实际跑通后回传保护规则接入事项。应用行覆盖80%，校验/条件/权限/可信度分支90%，保持缺陷复现和flaky隔离纪律。

### D-18 配置、部署与运行资源
对应需求：R-identity-001、R-connect-001、R-entry-001、R-orchestration-020

沿用三个Helm release与本机仅127.0.0.1端口暴露。M1启用Keycloak及独立数据库，realm/client通过版本化非秘密配置引导；真实验证安装凭据由管理员通过网关密钥入口配置，仓库只保留示例。CORE/CONNECT使用独立证书和角色身份的双向TLS，检查CA、服务身份、有效期及轮换；仅内网服务身份不能绕过业务授权。DBOS初始化在业务迁移成功后、服务接流量前进行，失败不更新服务。

配置分层：CORE持有业务/DBOS数据库、OIDC issuer/audience、流程和agent实现选择；CONNECT持有网关证书、外部凭据解密材料、安装映射及对账配置。Secret不入GitHub Actions普通日志；真实接入阶段不作为任意fork PR可读取的CI任务。完整回归只需本地模拟外部服务。磁盘对象存储保留内容寻址PV，回滚不能删除已有引用对象；资源requests/limits和队列并发可配置，以测试数据确定默认值并验证满队列消息不饥饿。

### D-19 依赖与既有接缝
对应需求：R-orchestration-001、R-orchestration-007、R-entry-001、R-platform-017

实现优先复用已锁定Node24/TypeScript6、Fastify、Zod、Drizzle、pg、Vitest及现有迁移/CLI。新增DBOS TypeScript SDK、fast-check、OIDC/JWT与MCP协议适配依赖在相应任务实施前核对官方来源、许可、版本发布时间≥7天及安全扫描，锁确切版本；设计不以第6轮DBOS5.4/PG16.14替代当前平台。依赖选择只影响适配层，不改变本设计的持久语义与契约；不符合要求时按缺项流程处理，不安装未批准脚本。

#17日志复用在本轮请求入口改造时纳入backend-defaults：统一Fastify请求ID、结构化日志和脱敏，健康路由仍保持既有语义，四宿主不各自维护认证/请求日志副本；未实现身份的宿主不伪装已提供身份服务。CLI错误码只做D-15兼容共用。TC002 YAML改写、Turbo透传、portal测试构建依赖等其他维护项不顺手修改，仍保留#17。

## 接口与数据的变化

外部协议入口与业务端口分离；下表是任务层拆分前的契约清单，具体实现文件在任务层列出。

| 契约 | 关键输入/输出 | 幂等/拒绝边界 |
| --- | --- | --- |
| identity.authenticate / authorize / issueAuthorization / revoke | 凭据上下文、actor、permission、scope/object → 主体、判定/授权引用 | 当前角色与撤销必查；稳定intake_id；拒绝不产生work |
| connect.inbox.accept / reconcile / performAction / queryAction | mTLS服务身份、安装/事件/动作ID、payloadRef → 持久receipt/外部结果 | 验签先于受理；持久后ACK；未知效果先查询 |
| orchestration.createWork / answer / instruct / control / readRef | actor、idempotency、版本、授权引用 → work/state/ref | 身份与内容冲突拒绝；旧ETag不能覆盖 |
| spec.draftLayer / validateLayer / submitLayer / reconcileReviews | work/layer/base/head/schema版本 → 层/检查/PR/确认引用 | 未解澄清/检查失败不提交；只认当前有效review+merge |
| knowledge.loadProjectContext / selectWorkflow | repo/baseCommit/授权范围 → Fasfile、流程、模板版本 | 缓存按commit；无配置仍受组织限制 |
| AgentInvoker / Planner / DurableRuntime | 类型化输入与版本化引用 → 结构化结果/计划/持久运行句柄 | 三端口分开，agent结果不能写计划；规划只读可信引用 |
| audit / event outbox / SSE | 不变eventId、org/actor/object、脱敏载荷 → 持久收据/游标 | 同事务记意图，至少一次投递去重；读取按权限 |

## 影响范围与追溯

后续任务会涉及六个主要能力的common/backend与必要node扩展包、knowledge/environment的最小支撑、backend-plugin-api/defaults/contracts-core/test-utils、CORE/CONNECT装配、CLI配置契约、deploy及CI。这里只描述影响，不作为任意路径的代码授权；任务层必须给出精确范围、依赖、用例与共享文件协调。M1本轮没有NODE真实执行或PORTAL界面变更。

[design-trace.md](design-trace.md) 将全部41条需求/75场景映射到D条目与验证方式，并列TC-CF001–020、持久化故障点、负例及真实接入证据。实现验收以合并后的需求为准，不按历史实验裁剪。

## 风险与回退

- 双宿主connect装配、服务scope误绑定和跨schema写入是首要集成风险：网关无数据库配置的启动/越界测试、每插件RLS/非owner检查必须先过；不通过不能靠共享超级用户连接绕过。
- 外部成功与本地确认之间不存在原子事务：状态保留unknown、查询外部事实后补记；无法判定时需人处理，不能以“恰好一次”假设自动重发。部分成功不删除外部工单/PR来伪造回滚。
- DBOS与业务状态分别持久化：步骤/事件/动作唯一键及恢复用例防止重放重复；升级先扩后收，排空旧版本保留等待工作，禁止把数据库恢复到旧快照作为应用回退。
- 认证或网关故障采取拒绝/排队并暴露可查询原因，不退化为匿名或本机凭据；审计与引用失败不能被成功响应掩盖。事件积压、无法关联身份、长期等待、重复replan均可见且有人工入口。
- 配置和输出schema可版本化演进；不兼容变更升契约主版本并保留过渡，不静默改已确认工作。迁移只向前，回退应用版本须由兼容数据验证支持。
- 若实施中发现方案/需求未覆盖的实质问题，先记录证据和推荐并修订规格；不得借“实现细节”扩大M1为真实执行器、M3界面或M4治理产品。

## 项目长期约束检查

| Fasfile / 仓库约束 | 本设计落实 |
| --- | --- |
| 先规格后代码、人工评审 | #52已合入才提交本层；本层无代码/tasks；设计合入后再任务层；agent不批准/合并 |
| 插件依赖与四层结构 | D-1 common/node契约、宿主组合根；数据行只在infrastructure，跨插件不直接读表 |
| 自动测试不触真实对象/模型 | D-17的自动回归隔离模拟；#51已确认的专用真实接入阶段另行运行/取证，不混入普通CI测试或宣称真实模型能力 |
| 秘密、主机名与配置 | D-4/18密文/外置Secret、脱敏，版本化配置只存示例，端口本机127.0.0.1 |
| 技术栈与依赖 | D-19复用已锁定栈；新增版本/许可/7天门槛在实现任务核验，不把历史验证版本当批准 |
| required_checks与覆盖 | D-17保留全部现有门槛及80%/90%，新CI由PontusAI放行，不用替代运行宣称标准入口已修复 |
| protected_paths | D-14普通写禁止，仅已授权工具计算的归档动作清单；历史归档不任意改写 |
| high_risk_paths | CI/规格/迁移/依赖等保留人工评审；代码PR按任务范围；事前领域确认按D-13 |
| agent.commands | 本轮不运行用户仓库任意命令；未来真实执行范围留M2；M1起草只经可替换类型化契约 |
| 本机工具与格式 | 已交付spec validate/check用于本层；完整schema由D-14后续实施，不把尚未实现schema当现行CLI已支持 |
