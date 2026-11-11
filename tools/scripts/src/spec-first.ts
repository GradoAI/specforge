// "Spec before code" check (SF-1 D-16, R-platform-012): a code PR must name a work and a task whose
// change directory and tasks.md already exist on main. PRs that only touch specs, docs or CI are exempt.
import { execFileSync } from 'node:child_process';

export interface SpecFirstInput {
  /** PR title, e.g. "SF-1 T004 CI 基线". */
  title: string;
  /** Paths changed by the PR; renames contribute both the old and the new path. */
  changedFiles: readonly string[];
  /** tasks.md files on the base branch, keyed by path. */
  tasksFiles: ReadonlyMap<string, string>;
}

export interface SpecFirstResult {
  ok: boolean;
  message: string;
}

export const TITLE_PATTERN = /^SF-(\d+) T(\d{3})/;

/** Files that never need a task: specs, docs, Markdown anywhere and CI configuration. */
export function isExempt(path: string): boolean {
  return path.startsWith('fasrun/') || path.startsWith('docs/') || path.startsWith('.github/') || path.endsWith('.md');
}

export function checkSpecFirst({ title, changedFiles, tasksFiles }: SpecFirstInput): SpecFirstResult {
  const needsTask = changedFiles.filter((path) => !isExempt(path));
  if (needsTask.length === 0) {
    return { ok: true, message: 'Only specs, docs or CI configuration changed; no task reference needed.' };
  }
  const listed = needsTask.slice(0, 5).join(', ') + (needsTask.length > 5 ? ', …' : '');
  const match = TITLE_PATTERN.exec(title);
  if (!match) {
    return {
      ok: false,
      message: `The PR changes ${listed}, so its title must start with "SF-<work> T<task>" (e.g. "SF-1 T004 …"); got "${title}".`,
    };
  }
  const [, work, task] = match;
  const dirPattern = new RegExp(`^fasrun/changes/SF-${work}-[^/]+/tasks\\.md$`);
  const tasksPath = [...tasksFiles.keys()].find((path) => dirPattern.test(path));
  if (!tasksPath) {
    return {
      ok: false,
      message: `No change directory fasrun/changes/SF-${work}-*/ with a tasks.md exists on main; merge the task layer of SF-${work} first.`,
    };
  }
  const taskLine = new RegExp(`^- \\[[ xX]\\] T${task}\\b`, 'm');
  if (!taskLine.test(tasksFiles.get(tasksPath) ?? '')) {
    return { ok: false, message: `Task T${task} is not listed in ${tasksPath} on main.` };
  }
  return { ok: true, message: `SF-${work} T${task} is listed in ${tasksPath}.` };
}

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

/** Reads the changed files of HEAD against `base` and the tasks.md files on `base` from git. */
export function collectFromGit(base: string, cwd: string): Omit<SpecFirstInput, 'title'> {
  const changedFiles = git(cwd, 'diff', '--name-only', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean);
  const tasksFiles = new Map<string, string>();
  for (const path of git(cwd, 'ls-tree', '-r', '--name-only', base, '--', 'fasrun/changes').split('\n')) {
    if (path.endsWith('/tasks.md')) tasksFiles.set(path, git(cwd, 'show', `${base}:${path}`));
  }
  return { changedFiles, tasksFiles };
}
