// D-8's demonstration is deliberately confined to a test plugin, never a production plugin.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// Structurally compatible fixture data; test-utils stays independent of the AGPL backend runtime.
interface FixtureBaseDataDefinition {
  key: string;
  version: number;
  table: string;
  keyColumn: string;
  rows: readonly Readonly<Record<string, unknown>>[];
  customizableColumns: readonly string[];
}

export function exampleBaseData(version = 1): FixtureBaseDataDefinition[] {
  return [
    {
      key: 'example-catalog',
      version,
      table: 'catalog',
      keyColumn: 'id',
      customizableColumns: ['label'],
      rows: [
        { id: 'builtin', label: `Default v${version}`, system_value: `System v${version}`, is_customized: false },
        { id: 'untouched', label: `Default v${version}`, system_value: `System v${version}`, is_customized: false },
      ],
    },
  ];
}

/** Writes a miniature repository consumable by the real CLI, with Drizzle-format migration journals. */
export async function writeMigrationFixture(
  root: string,
  plugins: readonly { schema: string; sql: readonly string[]; baseData?: readonly FixtureBaseDataDefinition[] }[],
): Promise<void> {
  for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
    const directory = join(root, 'apps', host);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        dependencies:
          host === 'fasrun-core-svc'
            ? Object.fromEntries(plugins.map((plugin) => [`@fasrun/plugin-${plugin.schema}-backend`, 'workspace:*']))
            : {},
      }),
    );
  }
  for (const plugin of plugins) {
    const directory = join(root, 'plugins', plugin.schema, `${plugin.schema}-backend`, 'migrations');
    await mkdir(join(directory, 'meta'), { recursive: true });
    const entries = plugin.sql.map((_, idx) => ({
      idx,
      version: '7',
      when: idx,
      tag: `${String(idx).padStart(4, '0')}_fixture`,
      breakpoints: true,
    }));
    await writeFile(
      join(directory, 'meta/_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
    );
    for (const [index, sql] of plugin.sql.entries())
      await writeFile(join(directory, `${entries[index]!.tag}.sql`), sql);
    if (plugin.baseData) await writeFile(join(directory, 'base-data.json'), JSON.stringify(plugin.baseData));
  }
}

export const EXAMPLE_BASE_DATA_SQL = `create table fixture.catalog (
  id text primary key, label text not null, system_value text not null, is_customized boolean not null default false
);`;
