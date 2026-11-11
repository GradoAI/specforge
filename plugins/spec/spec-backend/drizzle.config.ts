// drizzle-kit configuration of the spec plugin: only its own schema, migrations in migrations/ (SF-1 D-7).
export default {
  dialect: 'postgresql',
  schema: './src/infrastructure/schema/index.ts',
  out: './migrations',
  schemaFilter: ['spec'],
};
