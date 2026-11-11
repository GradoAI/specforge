// License declaration check (SF-1 D-19, R-platform-016): packages for plugin development are Apache-2.0 with
// their own LICENSE file, every other package is AGPL-3.0-only (covered by the root LICENSE), and no
// Apache-2.0 package depends on an AGPL-3.0-only workspace package.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const APACHE = 'Apache-2.0';
export const AGPL = 'AGPL-3.0-only';

/** Base packages that plugin authors build against (tech plan 2.1, R-platform-016). */
const APACHE_BASE = [
  'backend-plugin-api',
  'frontend-plugin-api',
  'contracts-core',
  'ui',
  'test-utils',
  'cli-templates',
];
const APACHE_PLUGIN_ROLE = /^@fasrun\/plugin-.+-(common|node|react)$/;

export interface WorkspacePackage {
  /** Directory relative to the repository root; '.' for the root package. */
  dir: string;
  name: string;
  license: string | undefined;
  dependencies: readonly string[];
  /** Content of the package's own LICENSE file, if any. */
  licenseFile: string | undefined;
}

export function expectedLicense(name: string): typeof APACHE | typeof AGPL {
  if (APACHE_PLUGIN_ROLE.test(name)) return APACHE;
  if (APACHE_BASE.some((base) => name === `@fasrun/${base}`)) return APACHE;
  return AGPL;
}

const isApacheText = (text: string | undefined) => /Apache License\s+Version 2\.0/.test(text ?? '');
const isAgplText = (text: string | undefined) => /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/.test(text ?? '');

/** Returns one message per problem, each naming the package; an empty list means the check passes. */
export function checkLicenses(packages: readonly WorkspacePackage[], rootLicense: string | undefined): string[] {
  const problems: string[] = [];
  if (!isAgplText(rootLicense)) problems.push('LICENSE: the root LICENSE must be the full AGPL-3.0 text');
  const declared = new Map(packages.map((pkg) => [pkg.name, pkg.license]));
  for (const pkg of packages) {
    const expected = expectedLicense(pkg.name);
    if (pkg.license !== expected) {
      problems.push(`${pkg.name} (${pkg.dir}): license must be ${expected}, got ${pkg.license ?? 'none'}`);
    }
    if (expected === APACHE && !isApacheText(pkg.licenseFile)) {
      problems.push(`${pkg.name} (${pkg.dir}): needs a LICENSE file with the Apache-2.0 text`);
    }
    if (expected === APACHE || pkg.license === APACHE) {
      for (const dependency of pkg.dependencies) {
        if (declared.get(dependency) === AGPL) {
          problems.push(`${pkg.name} is Apache-2.0 but depends on ${dependency}, which is AGPL-3.0-only`);
        }
      }
    }
  }
  return problems;
}

const readText = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);

/** Loads the root package and every package matched by pnpm-workspace.yaml (`dir/*` and `dir/*\/*` globs). */
export function loadWorkspace(root: string): WorkspacePackage[] {
  const { packages: globs = [] } = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
    packages?: string[];
  };
  const dirs = ['.'];
  for (const glob of globs) {
    let level = [''];
    for (const part of glob.split('/')) {
      level = level.flatMap((base) => {
        if (part !== '*') return [join(base, part)];
        const abs = join(root, base);
        if (!existsSync(abs)) return [];
        return readdirSync(abs, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(base, entry.name));
      });
    }
    dirs.push(...level.filter((dir) => existsSync(join(root, dir, 'package.json'))));
  }
  return dirs.map((dir) => {
    const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as {
      name: string;
      license?: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return {
      dir,
      name: manifest.name,
      license: manifest.license,
      dependencies: [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})],
      licenseFile: dir === '.' ? undefined : readText(join(root, dir, 'LICENSE')),
    };
  });
}
