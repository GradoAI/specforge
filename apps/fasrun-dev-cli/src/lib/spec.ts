import { readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { repositoryPathSchema, validateSpecs, type SpecFiles } from '@fasrun/plugin-spec-common';
import { parse } from 'yaml';
import { CliError, CliErrorCodes } from '../errors.js';
import { validateRepoConfig } from './repo-config.js';

async function readRequired(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `${path}: ${(error as Error).message}`);
  }
}

export async function collect(root: string): Promise<SpecFiles> {
  const files: Record<string, string> = {};
  async function walk(relative: string) {
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) files[path] = await readFile(join(root, path), 'utf8');
    }
  }
  try {
    await walk('');
  } catch (error) {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `${root}: ${(error as Error).message}`);
  }
  return files;
}

/** Configuration is required for scoped tasks; init's empty spec trees need no allow-list yet. */
export async function readSpecSnapshot(root: string) {
  const files = await collect(root);
  let allowedPaths: string[] = [];
  let text: string | undefined;
  try {
    text = await readFile(join(root, 'config.yaml'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (Object.keys(files).some((file) => /^changes\/(?!archive\/)[^/]+\/tasks\.md$/.test(file)))
      throw new CliError(
        CliErrorCodes.CONFIG_INVALID,
        `${join(root, 'config.yaml')}: missing allowedPaths configuration`,
      );
  }
  if (text !== undefined) {
    let config: unknown;
    try {
      config = parse(text);
    } catch (error) {
      throw new CliError(CliErrorCodes.CONFIG_INVALID, `${join(root, 'config.yaml')}: ${(error as Error).message}`);
    }
    if (
      !config ||
      typeof config !== 'object' ||
      !('allowedPaths' in config) ||
      !Array.isArray(config.allowedPaths) ||
      !config.allowedPaths.every((path: unknown) => typeof path === 'string' && path.length > 0)
    )
      throw new CliError(
        CliErrorCodes.CONFIG_INVALID,
        `${join(root, 'config.yaml')}: allowedPaths must be a list of paths`,
      );
    allowedPaths = config.allowedPaths as string[];
  }
  return { files, allowedPaths };
}

export async function runSpecValidate(root: string): Promise<{ files: number; errors: [] }> {
  const { files, allowedPaths } = await readSpecSnapshot(root);
  const errors = validateSpecs(files, allowedPaths);
  if (errors.length)
    throw new CliError(
      CliErrorCodes.CHECK_FAILED,
      errors.map((error) => `${error.code} ${join(root, error.file)}:${error.line}: ${error.message}`).join('\n'),
    );
  return { files: Object.keys(files).length, errors: [] };
}

export async function runCheck(directory: string): Promise<{ checks: string[] }> {
  // Read only the root setting before validation. The complete schema checks run after spec validation.
  const yaml = await readRequired(join(directory, 'fasrun.yaml'));
  let config: unknown;
  try {
    config = parse(yaml);
  } catch (error) {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `fasrun.yaml: ${(error as Error).message}`);
  }
  const specRoot =
    config && typeof config === 'object' && 'spec_root' in config && typeof config.spec_root === 'string'
      ? config.spec_root
      : 'fasrun/';
  // Never traverse outside the repository before the full config check.
  if (!repositoryPathSchema.safeParse(specRoot).success)
    throw new CliError(
      CliErrorCodes.CHECK_FAILED,
      'fasrun.yaml: spec_root: must be a canonical repository-relative path',
    );
  let repository: string;
  let target: string;
  try {
    repository = await realpath(directory);
    target = await realpath(resolve(directory, specRoot));
  } catch (error) {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `fasrun.yaml: spec_root: ${(error as Error).message}`);
  }
  const location = relative(repository, target);
  if (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location))
    throw new CliError(CliErrorCodes.CHECK_FAILED, 'fasrun.yaml: spec_root: resolved path escapes the repository');
  await runSpecValidate(target);
  const fasfile = await readRequired(join(directory, 'Fasfile'));
  const errors = [...validateRepoConfig('Fasfile', fasfile), ...validateRepoConfig('fasrun.yaml', yaml)];
  if (errors.length) throw new CliError(CliErrorCodes.CHECK_FAILED, errors.join('\n'));
  return { checks: ['spec validate', 'Fasfile', 'fasrun.yaml'] };
}
