// The role table of specforge/dependency-direction (design D-2), as a pure function.
import { describe, expect, it } from 'vitest';
import { violation } from '../src/rules/dependency-direction.js';
import { classify } from '../src/workspace.js';

const plugin = (name: string) => classify(`@specforge/plugin-${name}`, 'plugins');
const base = (name: string) => classify(`@specforge/${name}`, 'packages');
const host = classify('@specforge/sf-core-svc', 'apps');
const allowed = (from: ReturnType<typeof classify>, to: ReturnType<typeof classify>, test = false) =>
  violation(from, to, test) === null;

describe('package classification', () => {
  it('splits plugin and role, including module roles and hyphenated plugin names', () => {
    expect(plugin('connect-backend-module-github')).toMatchObject({ plugin: 'connect', role: 'backend-module-github' });
    expect(plugin('spec-common')).toMatchObject({ plugin: 'spec', role: 'common' });
    expect(plugin('work-item-node')).toMatchObject({ plugin: 'work-item', role: 'node' });
    expect(classify('react', undefined).kind).toBe('external');
    expect(host.kind).toBe('host');
  });
});

describe('dependency direction table', () => {
  it('-common may only use other -common packages and contracts-core', () => {
    expect(allowed(plugin('a-common'), plugin('b-common'))).toBe(true);
    expect(allowed(plugin('a-common'), base('contracts-core'))).toBe(true);
    expect(allowed(plugin('a-common'), plugin('b-node'))).toBe(false);
    expect(allowed(plugin('a-common'), base('backend-plugin-api'))).toBe(false);
  });

  it('-node may use -common, -node, backend-plugin-api and contracts-core', () => {
    expect(allowed(plugin('a-node'), plugin('b-node'))).toBe(true);
    expect(allowed(plugin('a-node'), base('backend-plugin-api'))).toBe(true);
    expect(allowed(plugin('a-node'), base('backend-defaults'))).toBe(false);
    expect(allowed(plugin('a-node'), plugin('b-react'))).toBe(false);
  });

  it('-backend packages are assembled by hosts only; modules may use their own plugin backend', () => {
    expect(allowed(plugin('a-backend'), plugin('b-backend'))).toBe(false);
    expect(allowed(plugin('a-backend'), plugin('a-backend-module-x'))).toBe(false);
    expect(allowed(plugin('a-backend-module-x'), plugin('a-backend'))).toBe(true);
    expect(allowed(plugin('a-backend-module-x'), plugin('b-backend'))).toBe(false);
    expect(allowed(plugin('a-backend'), base('backend-defaults'))).toBe(true);
    expect(allowed(plugin('a-backend'), base('ui'))).toBe(false);
    expect(allowed(host, plugin('a-backend'))).toBe(true);
  });

  it('-react and -web stay on the frontend side', () => {
    expect(allowed(plugin('a-react'), plugin('b-react'))).toBe(true);
    expect(allowed(plugin('a-web'), plugin('b-react'))).toBe(true);
    expect(allowed(plugin('a-web'), plugin('b-web'))).toBe(false);
    expect(allowed(plugin('a-web-module-x'), plugin('a-web'))).toBe(true);
    expect(allowed(plugin('a-react'), plugin('b-node'))).toBe(false);
    expect(allowed(plugin('a-web'), base('backend-defaults'))).toBe(false);
  });

  it('base packages never depend on plugins; test-utils only from test files; hosts cannot be imported', () => {
    expect(allowed(base('backend-defaults'), plugin('a-common'))).toBe(false);
    expect(allowed(base('backend-defaults'), base('contracts-core'))).toBe(true);
    expect(allowed(plugin('a-backend'), base('test-utils'))).toBe(false);
    expect(allowed(plugin('a-backend'), base('test-utils'), true)).toBe(true);
    expect(allowed(plugin('a-backend'), host)).toBe(false);
  });
});
