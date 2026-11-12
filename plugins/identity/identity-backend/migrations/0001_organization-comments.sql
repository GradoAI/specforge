ALTER TABLE identity.organization FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.organization IS '组织：identity 插件的组织隔离样例表';
COMMENT ON COLUMN identity.organization.id IS '组织标识：org_ 前缀的 ULID';
COMMENT ON COLUMN identity.organization.org_id IS '租户组织标识，必须与本行 id 相同';
COMMENT ON COLUMN identity.organization.name IS '组织名称，1–200 个字符';
COMMENT ON COLUMN identity.organization.slug IS '全局唯一的组织短名';
COMMENT ON COLUMN identity.organization.deactivated_at IS '停用时间；空值表示未停用';
COMMENT ON COLUMN identity.organization.created_at IS '创建时间，带时区并按 UTC 存储';
COMMENT ON COLUMN identity.organization.updated_at IS '更新时间，带时区并按 UTC 存储';
COMMENT ON COLUMN identity.organization.created_by IS '创建者标识：成员、agent 身份或插件';
COMMENT ON COLUMN identity.organization.version IS '乐观锁版本号，初始为 1';
