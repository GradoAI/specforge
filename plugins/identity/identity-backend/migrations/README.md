# identity.organization（SF-1 T011 / D-7）

`0000_organization.sql` 由 Drizzle Kit 0.31.9（MIT）从 Drizzle ORM 0.45.4 的表定义生成；唯一人工调整是将 schema 创建改为 `IF NOT EXISTS`，兼容 D-8 在迁移前预建 schema。`0001_organization-comments.sql` 由 `generate --custom` 建立，补充 FORCE ROW LEVEL SECURITY 和表、列注释。保留 `meta/` 的快照与 journal 顺序，后续变更只能新增迁移。

生成命令在本包目录执行：

```sh
node "$DRIZZLE_KIT_DIR/node_modules/drizzle-kit/bin.cjs" generate --name organization
node "$DRIZZLE_KIT_DIR/node_modules/drizzle-kit/bin.cjs" generate --custom --name organization-comments
```

`DRIZZLE_KIT_DIR` 是仓库外的固定版本工具目录，使用禁用安装脚本的方式安装 Drizzle Kit 0.31.9，并让该工具可解析项目相同版本的 drizzle-orm 与 pg。仓库未新增 Drizzle Kit 依赖或修改供应链配置；本次生成工具不作为生产迁移执行器。

迁移以 `fasrun_owner` 执行，不包含对应用角色的授权。T011 集成测试复用 T009 的角色和 Testcontainers，测试准备显式授权 `fasrun_app`；正式迁移编排、统一授权、基础数据同步由 T012 交付。T013 的规范检查尚未交付，本次不将其记为通过。

运行时代码可用 `organizationDatabase(database).withOrg(orgId, fn)` 包装现有数据库服务的 `db`。回调必须使用传入的事务连接；组织设置仅在该事务内生效。`fasrun_app` 不拥有表且为 NOBYPASSRLS，不能用 owner 的查询证明隔离。
