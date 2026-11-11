import { describe, expect, it } from 'vitest';
import { packageDirectory, parseRole, placeholders, renderPackage } from './index.js';

describe('cli-templates', () => {
  it('parses the roles of tech plan 2.1 and rejects others', () => {
    expect(parseRole('common')).toMatchObject({ group: 'common', license: 'Apache-2.0', backend: false });
    expect(parseRole('backend')).toMatchObject({ group: 'backend', license: 'AGPL-3.0-only', backend: true });
    expect(parseRole('backend-module-github')).toMatchObject({
      group: 'backend-module',
      module: 'github',
      backend: true,
    });
    expect(parseRole('web-module-board')).toMatchObject({ group: 'web-module', module: 'board', backend: false });
    for (const role of ['server', 'backend-module-', 'Backend', 'web-module-1x', ''])
      expect(parseRole(role), role).toBeUndefined();
  });

  it('derives every naming form from a kebab-case plugin name', () => {
    expect(placeholders('work-items', parseRole('backend')!)).toMatchObject({
      plugin: 'work-items',
      Plugin: 'WorkItems',
      pluginCamel: 'workItems',
      PLUGIN: 'WORK_ITEMS',
      schema: 'work_items',
    });
  });

  it('renders a backend package with the four layers, migrations, drizzle config and an example test', () => {
    const files = renderPackage('demo', parseRole('backend')!);
    expect(files.map((f) => f.path)).toEqual([
      'drizzle.config.ts',
      'migrations/.gitkeep',
      'package.json',
      'src/application/status.ts',
      'src/common/index.ts',
      'src/index.ts',
      'src/infrastructure/schema/index.ts',
      'src/starter/plugin.test.ts',
      'src/starter/plugin.ts',
      'tsconfig.json',
    ]);
    expect(files.every((f) => !f.content.includes('{{'))).toBe(true);
    const manifest = JSON.parse(files.find((f) => f.path === 'package.json')?.content ?? '{}') as Record<
      string,
      string
    >;
    expect(manifest).toMatchObject({ name: '@fasrun/plugin-demo-backend', license: 'AGPL-3.0-only' });
    expect(packageDirectory('demo', parseRole('backend')!)).toBe('plugins/demo/demo-backend');
  });

  it('adds the Apache-2.0 LICENSE to plugin-development roles only', () => {
    for (const role of ['common', 'node', 'react']) {
      const files = renderPackage('demo', parseRole(role)!);
      expect(files.find((f) => f.path === 'LICENSE')?.content, role).toContain('Apache License');
    }
    for (const role of ['backend', 'web', 'backend-module-x', 'web-module-x']) {
      expect(
        renderPackage('demo', parseRole(role)!).some((f) => f.path === 'LICENSE'),
        role,
      ).toBe(false);
    }
  });

  it('renders every role without leftover placeholders', () => {
    for (const role of ['common', 'node', 'react', 'backend', 'web', 'backend-module-github', 'web-module-board']) {
      for (const file of renderPackage('work-items', parseRole(role)!))
        expect(file.content, `${role} ${file.path}`).not.toMatch(/\{\{/);
    }
  });
});
