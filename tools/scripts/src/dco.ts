// DCO check (SF-1 D-19, R-platform-016): commits of external contributors carry a Signed-off-by line that
// matches the commit author. Organisation members, collaborators and this repository's GitHub App are exempt.
import { execFileSync } from 'node:child_process';

export interface DcoCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  message: string;
}

export interface DcoInput {
  /** `author_association` of the pull request (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE, …). */
  authorAssociation: string;
  /** Login of the pull request author. */
  prAuthor: string;
  /** Login of this repository's GitHub App, e.g. "fasrun-dev[bot]". */
  appLogin: string;
  commits: readonly DcoCommit[];
}

export interface DcoResult {
  ok: boolean;
  message: string;
}

const EXEMPT_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export function checkDco({ authorAssociation, prAuthor, appLogin, commits }: DcoInput): DcoResult {
  if (prAuthor === appLogin) return { ok: true, message: `PR opened by ${appLogin}; no sign-off required.` };
  if (EXEMPT_ASSOCIATIONS.has(authorAssociation)) {
    return { ok: true, message: `PR author is ${authorAssociation.toLowerCase()}; no sign-off required.` };
  }
  const missing = commits.filter(({ authorName, authorEmail, message }) =>
    message
      .split('\n')
      .every((line) => line.trim().toLowerCase() !== `signed-off-by: ${authorName} <${authorEmail}>`.toLowerCase()),
  );
  if (missing.length === 0) return { ok: true, message: `All ${commits.length} commit(s) are signed off.` };
  const list = missing.map((c) => `${c.sha.slice(0, 12)} (${c.authorName} <${c.authorEmail}>)`).join(', ');
  return {
    ok: false,
    message: `Missing "Signed-off-by: <author name> <author email>" in: ${list}. Sign off with \`git commit -s\` (see CONTRIBUTING.md).`,
  };
}

const SEPARATOR = '\u001f';
const RECORD = '\u001e';

/** Reads the commits in `base..head` from git. */
export function readCommits(base: string, head: string, cwd: string): DcoCommit[] {
  const format = ['%H', '%an', '%ae', '%B'].join(SEPARATOR) + RECORD;
  return execFileSync('git', ['log', '--no-merges', `--format=${format}`, `${base}..${head}`], {
    cwd,
    encoding: 'utf8',
  })
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha = '', authorName = '', authorEmail = '', message = ''] = record.split(SEPARATOR);
      return { sha, authorName, authorEmail, message };
    });
}
