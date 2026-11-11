// @ts-check
/**
 * fasrun/dependency-direction — package roles and dependency direction (tech plan 2.1 "依赖规则", design D-2).
 *
 * | importer                     | may import                                                               |
 * | ---------------------------- | ------------------------------------------------------------------------ |
 * | -common                      | any -common; contracts-core                                              |
 * | -node                        | any -common, -node; backend-plugin-api, contracts-core                   |
 * | -backend, -backend-module-*  | any -common, -node; own plugin's -backend (modules only); backend bases  |
 * | -react                       | any -common, -react; frontend bases                                      |
 * | -web, -web-module-*          | any -common, -react; own plugin's -web (modules only); frontend bases    |
 * | base package                 | other base packages; no plugin packages                                  |
 * | host (apps/)                 | anything; the only place that may import -backend / -backend-module-*   |
 *
 * test-utils may be imported from test files only. Deep imports past a package's `exports` and relative
 * imports that leave the importing package are always errors.
 */
import { dirname, relative, resolve, sep } from 'node:path';
import {
  BASE_PACKAGES,
  classify,
  findPackage,
  findWorkspaceRoot,
  locationOf,
  roleGroup,
  workspacePackages,
} from '../workspace.js';

const BACKEND_BASES = [...BASE_PACKAGES.backend, 'contracts-core'];
const FRONTEND_BASES = [...BASE_PACKAGES.frontend, 'contracts-core'];
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * @param {import('../workspace.js').PackageInfo} from
 * @param {import('../workspace.js').PackageInfo} to
 * @param {boolean} isTestFile
 * @returns {string | null} why the import is not allowed, or null
 */
export function violation(from, to, isTestFile) {
  if (to.kind === 'external' || to.kind === 'tool') return null;
  if (from.name === to.name) return null;
  if (to.kind === 'base' && BASE_PACKAGES.test.includes(to.base)) {
    return isTestFile ? null : 'test-utils may only be imported from test files';
  }
  if (from.kind === 'host' || from.kind === 'tool') return null;
  if (to.kind === 'host') return 'hosts (apps/) cannot be imported';

  if (from.kind === 'base') {
    return to.kind === 'plugin' ? 'base packages must not depend on plugin packages' : null;
  }
  if (from.kind !== 'plugin') return null;

  const fromRole = roleGroup(from.role);
  if (to.kind === 'base') {
    const allowed =
      {
        common: ['contracts-core'],
        node: ['backend-plugin-api', 'contracts-core'],
        backend: BACKEND_BASES,
        'backend-module': BACKEND_BASES,
        react: FRONTEND_BASES,
        web: FRONTEND_BASES,
        'web-module': FRONTEND_BASES,
      }[fromRole] ?? [];
    return allowed.includes(to.base)
      ? null
      : `-${from.role} packages may only use the base packages ${allowed.join(', ')}`;
  }

  const toRole = roleGroup(to.role);
  if (toRole === 'backend' || toRole === 'backend-module' || toRole === 'web' || toRole === 'web-module') {
    const ownParent =
      to.plugin === from.plugin &&
      ((fromRole === 'backend-module' && toRole === 'backend') || (fromRole === 'web-module' && toRole === 'web'));
    if (ownParent) return null;
    return `-${to.role} packages are assembled by hosts only and must not be imported by other packages`;
  }
  const allowedRoles =
    {
      common: ['common'],
      node: ['common', 'node'],
      backend: ['common', 'node'],
      'backend-module': ['common', 'node'],
      react: ['common', 'react'],
      web: ['common', 'react'],
      'web-module': ['common', 'react'],
    }[fromRole] ?? [];
  return allowedRoles.includes(toRole)
    ? null
    : `-${from.role} packages may only import ${allowedRoles.map((r) => `-${r}`).join(', ')} packages`;
}

/** True when `subpath` (e.g. "./client") is exported by the package manifest. */
function isExported(/** @type {Record<string, any>} */ manifest, /** @type {string} */ subpath) {
  const exportsField = manifest.exports;
  if (exportsField === undefined) return false;
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) return false;
  const keys = Object.keys(exportsField).filter((k) => k.startsWith('.'));
  return keys.some((key) => {
    if (!key.includes('*')) return key === subpath;
    const [head, tail] = key.split('*');
    return subpath.startsWith(/** @type {string} */ (head)) && subpath.endsWith(/** @type {string} */ (tail ?? ''));
  });
}

/** @type {import('eslint').Rule.RuleModule} */
export const dependencyDirection = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce Fasrun package roles and dependency direction' },
    schema: [],
    messages: {
      direction: '"{{from}}" must not import "{{to}}": {{reason}}.',
      deep: '"{{to}}" does not export "{{subpath}}"; import from the package entry points only.',
      relative: 'Relative import "{{source}}" leaves package "{{from}}"; import the other package by name.',
    },
  },
  create(context) {
    const filename = context.filename;
    const root = findWorkspaceRoot(dirname(filename));
    const owner = findPackage(filename);
    if (!root || !owner || typeof owner.manifest.name !== 'string') return {};
    const workspaceRoot = root;
    const ownerDir = owner.dir;
    const from = classify(owner.manifest.name, locationOf(workspaceRoot, ownerDir));
    const isTestFile = TEST_FILE.test(filename);

    /** @param {{ source?: unknown }} node import/export declarations and import() expressions */
    function check(node) {
      const sourceNode = /** @type {(import('eslint').Rule.Node & { value?: unknown }) | null | undefined} */ (
        node.source
      );
      if (!sourceNode || typeof sourceNode.value !== 'string') return;
      const source = sourceNode.value;

      if (source.startsWith('.')) {
        const target = resolve(dirname(filename), source);
        const rel = relative(ownerDir, target);
        if (rel.startsWith('..') || rel.startsWith(sep)) {
          context.report({ node: sourceNode, messageId: 'relative', data: { source, from: from.name } });
        }
        return;
      }
      if (!source.startsWith('@fasrun/')) return;

      const [scope, name, ...rest] = source.split('/');
      const toName = `${scope}/${name}`;
      const known = workspacePackages(workspaceRoot).get(toName);
      const to = classify(toName, known ? locationOf(workspaceRoot, known.dir) : undefined);

      const reason = violation(from, to, isTestFile);
      if (reason) {
        context.report({ node: sourceNode, messageId: 'direction', data: { from: from.name, to: toName, reason } });
        return;
      }
      if (rest.length > 0 && known && from.name !== toName) {
        const subpath = `./${rest.join('/')}`;
        if (!isExported(known.manifest, subpath)) {
          context.report({ node: sourceNode, messageId: 'deep', data: { to: toName, subpath } });
        }
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};
