// "Spec before code" check (SF-1 D-16, R-platform-012 as modified by SF-4): a code PR names a task of a larger
// change (SF-<n> T<nnn>, the change directory has tasks.md) or a small change (SF-<n>, no tasks.md); either way
// the change directory must already be on main. PRs that only touch specs, docs or CI are exempt.
import { execFileSync } from 'node:child_process';

export interface SpecFirstInput {
  /** PR title, e.g. "SF-1 T004 CI 基线" or "SF-4 spec-first 接受小改动编号". */
  title: string;
  /** Paths changed by the PR; renames contribute both the old and the new path. */
  changedFiles: readonly string[];
  /** Change directories on the base branch, e.g. "fasrun/changes/SF-1-engineering-skeleton" (archive excluded). */
  changeDirs: readonly string[];
  /** tasks.md files on the base branch, keyed by path. */
  tasksFiles: ReadonlyMap<string, string>;
}

export interface SpecFirstResult {
  ok: boolean;
  message: string;
}

/** "SF-<work>" optionally followed by " T<task>", then a space or the end of the title. */
export const TITLE_PATTERN = /^SF-(\d+)(?: T(\d{3}))?(?=\s|$)/;

/** Files that never need a task: specs, docs, Markdown anywhere and CI configuration. */
export function isExempt(path: string): boolean {
  return path.startsWith('fasrun/') || path.startsWith('docs/') || path.startsWith('.github/') || path.endsWith('.md');
}

export function checkSpecFirst({ title, changedFiles, changeDirs, tasksFiles }: SpecFirstInput): SpecFirstResult {
  const needsTask = changedFiles.filter((path) => !isExempt(path));
  if (needsTask.length === 0) {
    return { ok: true, message: 'Only specs, docs or CI configuration changed; no change reference needed.' };
  }
  const listed = needsTask.slice(0, 5).join(', ') + (needsTask.length > 5 ? ', …' : '');
  const match = TITLE_PATTERN.exec(title);
  if (!match) {
    return {
      ok: false,
      message: `The PR changes ${listed}, so its title must start with "SF-<work> T<task>" for a larger change or "SF-<work>" for a small change; got "${title}".`,
    };
  }
  const [, work, task] = match;
  const dir = changeDirs.find((path) => new RegExp(`^fasrun/changes/SF-${work}-[^/]+$`).test(path));
  if (!dir) {
    return {
      ok: false,
      message: `No change directory fasrun/changes/SF-${work}-*/ exists on main; merge the spec of SF-${work} first.`,
    };
  }
  const tasks = tasksFiles.get(`${dir}/tasks.md`);
  if (task === undefined) {
    return tasks === undefined
      ? { ok: true, message: `SF-${work} is a small change on main (${dir}/, no tasks.md).` }
      : { ok: false, message: `${dir}/ has a tasks.md; name the task in the title: "SF-${work} T<task> …".` };
  }
  if (tasks === undefined) {
    return {
      ok: false,
      message: `${dir}/ is a small change without tasks.md; name it as "SF-${work} …" without a task number.`,
    };
  }
  if (!new RegExp(`^- \\[[ xX]\\] T${task}\\b`, 'm').test(tasks)) {
    return { ok: false, message: `Task T${task} is not listed in ${dir}/tasks.md on main.` };
  }
  return { ok: true, message: `SF-${work} T${task} is listed in ${dir}/tasks.md.` };
}

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

/** Reads the changed files of HEAD against `base`, and the change directories and tasks.md files on `base`. */
export function collectFromGit(base: string, cwd: string): Omit<SpecFirstInput, 'title'> {
  const changedFiles = git(cwd, 'diff', '--name-only', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean);
  const changeDirs = git(cwd, 'ls-tree', '-d', '--name-only', `${base}:fasrun/changes`)
    .split('\n')
    .filter((name) => name && name !== 'archive')
    .map((name) => `fasrun/changes/${name}`);
  const tasksFiles = new Map<string, string>();
  for (const path of git(cwd, 'ls-tree', '-r', '--name-only', base, '--', 'fasrun/changes').split('\n')) {
    if (/^fasrun\/changes\/[^/]+\/tasks\.md$/.test(path)) tasksFiles.set(path, git(cwd, 'show', `${base}:${path}`));
  }
  return { changedFiles, changeDirs, tasksFiles };
}
