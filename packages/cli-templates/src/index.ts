// Templates of `fasrun plugin new` (SF-1 D-6): one directory per package role under templates/, files ending in
// .tmpl with {{placeholder}} names; rendering only replaces placeholders.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Roles of tech plan 2.1; module roles carry the module name, e.g. backend-module-github. */
export const ROLE_HINT = 'common, node, react, backend, backend-module-<name>, web, web-module-<name>';

const APACHE_ROLES = new Set(['common', 'node', 'react']);
const SIMPLE_ROLES = new Set(['common', 'node', 'react', 'backend', 'web']);
const MODULE_ROLE = /^(backend|web)-module-([a-z][a-z0-9-]*)$/;

export interface ParsedRole {
  role: string;
  /** Template directory: common, node, react, backend, backend-module, web or web-module. */
  group: string;
  module?: string;
  license: 'Apache-2.0' | 'AGPL-3.0-only';
  /** Backend roles are registered in a host's plugin list. */
  backend: boolean;
}

export function parseRole(role: string): ParsedRole | undefined {
  if (SIMPLE_ROLES.has(role)) {
    return {
      role,
      group: role,
      license: APACHE_ROLES.has(role) ? 'Apache-2.0' : 'AGPL-3.0-only',
      backend: role === 'backend',
    };
  }
  const module = MODULE_ROLE.exec(role);
  if (!module) return undefined;
  const [, side = '', name = ''] = module;
  return { role, group: `${side}-module`, module: name, license: 'AGPL-3.0-only', backend: side === 'backend' };
}

const pascal = (kebab: string) =>
  kebab.replace(/(^|-)([a-z0-9])/g, (_match, _dash, char: string) => char.toUpperCase());

export function placeholders(plugin: string, role: ParsedRole): Record<string, string> {
  const Plugin = pascal(plugin);
  return {
    plugin,
    Plugin,
    pluginCamel: Plugin.charAt(0).toLowerCase() + Plugin.slice(1),
    PLUGIN: plugin.toUpperCase().replaceAll('-', '_'),
    schema: plugin.replaceAll('-', '_'),
    role: role.role,
    module: role.module ?? '',
    license: role.license,
  };
}

export interface RenderedFile {
  /** Path inside the package directory. */
  path: string;
  content: string;
}

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATES = join(PACKAGE_ROOT, 'templates');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Renders every file of the role's template; Apache-2.0 roles also get the Apache LICENSE (R-platform-016). */
export function renderPackage(plugin: string, role: ParsedRole): RenderedFile[] {
  if (!PLUGIN_NAME_PATTERN.test(plugin)) throw new Error(`Invalid plugin name "${plugin}"`);
  const values = placeholders(plugin, role);
  const dir = join(TEMPLATES, role.group);
  const files = listFiles(dir)
    .filter((file) => file.endsWith('.tmpl'))
    .map((file) => {
      const content = readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
        const value = values[name];
        if (value === undefined) throw new Error(`Unknown placeholder ${match} in ${relative(TEMPLATES, file)}`);
        return value;
      });
      return { path: relative(dir, file).replace(/\.tmpl$/, ''), content };
    });
  if (role.license === 'Apache-2.0') {
    files.push({ path: 'LICENSE', content: readFileSync(join(PACKAGE_ROOT, 'LICENSE'), 'utf8') });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Directory of a plugin package relative to the repository root, e.g. plugins/demo/demo-backend. */
export function packageDirectory(plugin: string, role: ParsedRole): string {
  return `plugins/${plugin}/${plugin}-${role.role}`;
}
