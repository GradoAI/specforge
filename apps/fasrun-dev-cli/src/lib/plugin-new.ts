// fasrun plugin new (R-platform-006; SF-1 D-6): renders a plugin package from @fasrun/cli-templates and registers
// backend roles in a host. Everything is validated before anything is written; the package is rendered into a
// temporary directory and moved into place in one step.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  packageDirectory,
  parseRole,
  placeholders,
  PLUGIN_NAME_PATTERN,
  renderPackage,
  ROLE_HINT,
  type ParsedRole,
} from '@fasrun/cli-templates';
import { CliError, CliErrorCodes } from '../errors.js';

/** Formats with the repository's Prettier configuration, so generated files pass the format check as written. */
async function formatted(file: string, text: string): Promise<string> {
  const prettier = await import('prettier');
  const info = await prettier.getFileInfo(file);
  if (info.ignored || !info.inferredParser) return text;
  const config = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(text, { ...config, filepath: file });
}

export const HOSTS = ['core', 'connect', 'node'] as const;
export type HostName = (typeof HOSTS)[number];

export interface PluginNewOptions {
  plugin: string;
  role: string;
  host?: string;
}

export interface PluginNewResult {
  package: string;
  directory: string;
  files: string[];
  /** Files changed to register the package (host plugin list, host package.json and tsconfig, root tsconfig). */
  registered: string[];
  nextSteps: string[];
}

const MARKERS = {
  imports: ['// fasrun:plugins:begin', '// fasrun:plugins:end'],
  list: ['// fasrun:plugin-list:begin', '// fasrun:plugin-list:end'],
} as const;

/** The nearest directory upwards that contains pnpm-workspace.yaml. */
export function findRepositoryRoot(from: string): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) {
      throw new CliError(
        CliErrorCodes.CONFIG_INVALID,
        `No pnpm-workspace.yaml found above ${from}; run this in the Fasrun repository`,
      );
    }
  }
}

const usage = (message: string) => new CliError(CliErrorCodes.USAGE, message);

/** connect belongs to fasrun-connect-svc, every other plugin to fasrun-core-svc (SF-1 D-6). */
export function defaultHost(plugin: string): HostName {
  return plugin === 'connect' ? 'connect' : 'core';
}

function insertBetween(text: string, [begin, end]: readonly [string, string], line: string, file: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === begin);
  const stop = lines.findIndex((l, index) => index > start && l.trim() === end);
  if (start < 0 || stop < 0)
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `${file} has no "${begin}" … "${end}" block`);
  const indent = /^\s*/.exec(lines[start] ?? '')?.[0] ?? '';
  const block = new Set(
    lines
      .slice(start + 1, stop)
      .map((l) => l.trim())
      .filter(Boolean),
  );
  block.add(line);
  const sorted = [...block].sort().map((l) => indent + l);
  return [...lines.slice(0, start + 1), ...sorted, ...lines.slice(stop)].join('\n');
}

async function editJson(file: string, edit: (value: Record<string, unknown>) => void): Promise<void> {
  const value = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  edit(value);
  await writeFile(file, await formatted(file, `${JSON.stringify(value, null, 2)}\n`));
}

function addReference(tsconfig: Record<string, unknown>, path: string): void {
  const references = (tsconfig.references ??= []) as { path: string }[];
  if (!references.some((r) => r.path === path)) references.push({ path });
}

export async function runPluginNew(cwd: string, options: PluginNewOptions): Promise<PluginNewResult> {
  const { plugin } = options;
  if (!PLUGIN_NAME_PATTERN.test(plugin)) {
    throw usage(`Invalid plugin name "${plugin}": use lowercase letters, digits and hyphens, starting with a letter`);
  }
  const role: ParsedRole | undefined = parseRole(options.role);
  if (!role) throw usage(`Invalid role "${options.role}". Valid roles: ${ROLE_HINT}`);
  if (options.host !== undefined && !(HOSTS as readonly string[]).includes(options.host)) {
    throw usage(`Invalid host "${options.host}". Valid hosts: ${HOSTS.join(', ')}`);
  }
  if (options.host !== undefined && !role.backend) throw usage('--host applies only to backend roles');

  const root = findRepositoryRoot(cwd);
  const directory = packageDirectory(plugin, role);
  const target = join(root, directory);
  if (existsSync(target)) throw usage(`${directory} already exists; nothing was written`);
  const name = `@fasrun/plugin-${plugin}-${role.role}`;

  // Check the registration targets before writing anything.
  const host = role.backend ? ((options.host as HostName | undefined) ?? defaultHost(plugin)) : undefined;
  const hostDir = host ? join(root, 'apps', `fasrun-${host}-svc`) : undefined;
  const pluginList = hostDir ? join(hostDir, 'src', 'plugins.ts') : undefined;
  let pluginListText: string | undefined;
  if (pluginList) {
    if (!existsSync(pluginList))
      throw new CliError(CliErrorCodes.CONFIG_INVALID, `${relative(root, pluginList)} does not exist`);
    pluginListText = await readFile(pluginList, 'utf8');
    const values = placeholders(plugin, role);
    const identifier = role.module
      ? `${values.pluginCamel}${placeholders(role.module, role).Plugin}Module`
      : `${values.pluginCamel}Plugin`;
    pluginListText = insertBetween(
      pluginListText,
      MARKERS.imports,
      `import ${identifier} from '${name}';`,
      relative(root, pluginList),
    );
    pluginListText = insertBetween(pluginListText, MARKERS.list, `${identifier},`, relative(root, pluginList));
  }

  const files = renderPackage(plugin, role);
  const staging = join(root, 'plugins', `.fasrun-new-${randomBytes(4).toString('hex')}`);
  try {
    for (const file of files) {
      await mkdir(dirname(join(staging, file.path)), { recursive: true });
      // Formatted as if it were already at its final path, so the repository's Prettier settings apply.
      await writeFile(join(staging, file.path), await formatted(join(target, file.path), file.content), { flag: 'wx' });
    }
    await mkdir(dirname(target), { recursive: true });
    await rename(staging, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  const registered: string[] = [];
  if (hostDir && pluginList && pluginListText !== undefined) {
    await writeFile(pluginList, await formatted(pluginList, pluginListText));
    await editJson(join(hostDir, 'package.json'), (manifest) => {
      const deps = (manifest.dependencies ??= {}) as Record<string, string>;
      deps[name] = 'workspace:*';
      manifest.dependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
    });
    await editJson(join(hostDir, 'tsconfig.json'), (tsconfig) => addReference(tsconfig, `../../${directory}`));
    registered.push(
      relative(root, pluginList),
      relative(root, join(hostDir, 'package.json')),
      relative(root, join(hostDir, 'tsconfig.json')),
    );
  }
  await editJson(join(root, 'tsconfig.json'), (tsconfig) => addReference(tsconfig, directory));
  registered.push('tsconfig.json');

  return {
    package: name,
    directory,
    files: files.map((file) => `${directory}/${file.path}`),
    registered,
    nextSteps: ['pnpm install'],
  };
}
