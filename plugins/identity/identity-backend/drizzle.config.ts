// drizzle-kit configuration of the identity plugin: only its own schema, migrations in migrations/ (SF-1 D-7).
export default {
  dialect: 'postgresql',
  schema: './src/infrastructure/schema/organization.ts',
  out: './migrations',
  schemaFilter: ['identity'],
};
