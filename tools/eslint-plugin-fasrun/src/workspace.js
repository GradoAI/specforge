// @ts-check
/**
 * Locates the workspace package a file belongs to and classifies packages by role (tech plan 2.1).
 * Results are cached per process; ESLint runs one rule instance per file.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/** Base packages grouped by the side they serve. */
export const BASE_PACKAGES = {
  backend: ['backend-plugin-api', 'backend-defaults'],
  frontend: ['frontend-plugin-api', 'frontend-app', 'ui'],
  shared: ['contracts-core', 'cli-templates'],
  test: ['test-utils'],
};

const PLUGIN_NAME =
  /^@fasrun\/plugin-(.+?)-(common|node|react|backend|web|backend-module-[a-z0-9-]+|web-module-[a-z0-9-]+)$/;
const BASE_NAME = /^@fasrun\/([a-z0-9-]+)$/;

/**
 * @typedef {{ kind: 'plugin', name: string, plugin: string, role: string }
 *   | { kind: 'base', name: string, base: string }
 *   | { kind: 'host', name: string }
 *   | { kind: 'tool', name: string }
 *   | { kind: 'external', name: string }} PackageInfo
 */

/**
 * Classifies a package by name; `location` (the first directory under the workspace root) decides between
 * hosts (apps/), base packages (packages/) and tools (tools/).
 * @param {string} name
 * @param {string | undefined} location
 * @returns {PackageInfo}
 */
export function classify(name, location) {
  const plugin = PLUGIN_NAME.exec(name);
  if (plugin)
    return { kind: 'plugin', name, plugin: /** @type {string} */ (plugin[1]), role: /** @type {string} */ (plugin[2]) };
  if (location === 'apps') return { kind: 'host', name };
  if (location === 'tools') return { kind: 'tool', name };
  const base = BASE_NAME.exec(name);
  if (base && (location === 'packages' || location === undefined))
    return { kind: 'base', name, base: /** @type {string} */ (base[1]) };
  return { kind: 'external', name };
}

/** The generic role of a plugin package: backend-module-x → backend-module, web-module-x → web-module. */
export function roleGroup(/** @type {string} */ role) {
  if (role.startsWith('backend-module-')) return 'backend-module';
  if (role.startsWith('web-module-')) return 'web-module';
  return role;
}

/** @type {Map<string, string | null>} */
const rootCache = new Map();

/** The nearest directory upwards that contains pnpm-workspace.yaml. */
export function findWorkspaceRoot(/** @type {string} */ from) {
  if (rootCache.has(from)) return rootCache.get(from) ?? null;
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break;
    const parent = dirname(dir);
    if (parent === dir) {
      dir = '';
      break;
    }
    dir = parent;
  }
  rootCache.set(from, dir || null);
  return dir || null;
}

/** @type {Map<string, { dir: string, manifest: Record<string, any> } | null>} */
const packageCache = new Map();

/** The nearest package.json upwards from a file, below the workspace root. */
export function findPackage(/** @type {string} */ file) {
  let dir = dirname(file);
  for (;;) {
    if (packageCache.has(dir)) return packageCache.get(dir) ?? null;
    const manifestPath = join(dir, 'package.json');
    if (existsSync(manifestPath)) {
      const found = { dir, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) };
      packageCache.set(dir, found);
      return found;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The first path segment of `dir` relative to the workspace root, e.g. "plugins". */
export function locationOf(/** @type {string} */ root, /** @type {string} */ dir) {
  const rel = relative(root, dir);
  return rel.split(sep)[0];
}

/** @type {Map<string, Map<string, { dir: string, manifest: Record<string, any> }>>} */
const workspaceIndex = new Map();

/**
 * All workspace packages by name, read from the conventional locations
 * (apps/*, packages/*, plugins/*\/*, tools/*).
 */
export function workspacePackages(/** @type {string} */ root) {
  const cached = workspaceIndex.get(root);
  if (cached) return cached;
  /** @type {Map<string, { dir: string, manifest: Record<string, any> }>} */
  const index = new Map();
  const read = (/** @type {string} */ dir) => {
    const p = join(dir, 'package.json');
    if (!existsSync(p)) return;
    const manifest = JSON.parse(readFileSync(p, 'utf8'));
    if (typeof manifest.name === 'string') index.set(manifest.name, { dir, manifest });
  };
  for (const top of ['apps', 'packages', 'tools']) for (const d of listDirs(join(root, top))) read(d);
  for (const group of listDirs(join(root, 'plugins'))) for (const d of listDirs(group)) read(d);
  workspaceIndex.set(root, index);
  return index;
}

function listDirs(/** @type {string} */ dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
    .map((e) => join(dir, e.name));
}
