// License declarations and DCO sign-off (SF-1 T005, D-19).
// TC-PLATFORM-046 — R-platform-016.S1: license declarations match the package roles.
// TC-PLATFORM-047 — R-platform-016.S2: a wrong declaration or a missing LICENSE file is stopped.
// TC-PLATFORM-048 — R-platform-016.S3: an Apache-2.0 package that depends on an AGPL package is stopped.
// TC-PLATFORM-049 — R-platform-016.S4: an external contributor's commit without sign-off is stopped.
// TC-PLATFORM-050 — R-platform-016.S5: members and the GitHub App do not need to sign off.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDco, type DcoCommit } from './dco.js';
import { AGPL, APACHE, checkLicenses, expectedLicense, loadWorkspace, type WorkspacePackage } from './license-check.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const APACHE_TEXT =
  '                                 Apache License\n                           Version 2.0, January 2004\n';
const AGPL_TEXT =
  '                    GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007\n';

const pkg = (name: string, license: string | undefined, extra: Partial<WorkspacePackage> = {}): WorkspacePackage => ({
  dir: `plugins/x/${name.replace('@fasrun/', '')}`,
  name,
  license,
  dependencies: [],
  licenseFile: license === APACHE ? APACHE_TEXT : undefined,
  ...extra,
});

describe('license declarations (R-platform-016)', () => {
  it('TC-PLATFORM-046 the repository passes: root AGPL-3.0, Apache-2.0 for plugin-development packages, AGPL elsewhere', () => {
    const packages = loadWorkspace(REPO_ROOT);
    expect(packages.map((p) => p.dir)).toEqual(expect.arrayContaining(['.', 'tools/scripts']));
    expect(checkLicenses(packages, readFileSync(join(REPO_ROOT, 'LICENSE'), 'utf8'))).toEqual([]);
  });

  it('maps package roles to licenses', () => {
    for (const name of [
      '@fasrun/backend-plugin-api',
      '@fasrun/frontend-plugin-api',
      '@fasrun/contracts-core',
      '@fasrun/ui',
      '@fasrun/test-utils',
      '@fasrun/cli-templates',
      '@fasrun/plugin-work-common',
      '@fasrun/plugin-work-node',
      '@fasrun/plugin-work-react',
    ]) {
      expect(expectedLicense(name), name).toBe(APACHE);
    }
    for (const name of [
      'fasrun',
      '@fasrun/backend-defaults',
      '@fasrun/frontend-app',
      '@fasrun/plugin-work-backend',
      '@fasrun/plugin-work-web',
      '@fasrun/plugin-work-backend-module-github',
      '@fasrun/scripts',
    ]) {
      expect(expectedLicense(name), name).toBe(AGPL);
    }
  });

  it('TC-PLATFORM-047 a -common package declared AGPL, or without a LICENSE file, fails with the package and the problem', () => {
    expect(checkLicenses([pkg('@fasrun/plugin-work-common', AGPL)], AGPL_TEXT)).toEqual([
      '@fasrun/plugin-work-common (plugins/x/plugin-work-common): license must be Apache-2.0, got AGPL-3.0-only',
      '@fasrun/plugin-work-common (plugins/x/plugin-work-common): needs a LICENSE file with the Apache-2.0 text',
    ]);
    expect(checkLicenses([pkg('@fasrun/plugin-work-common', APACHE, { licenseFile: undefined })], AGPL_TEXT)).toEqual([
      '@fasrun/plugin-work-common (plugins/x/plugin-work-common): needs a LICENSE file with the Apache-2.0 text',
    ]);
    expect(checkLicenses([pkg('@fasrun/plugin-work-backend', undefined)], AGPL_TEXT)).toEqual([
      '@fasrun/plugin-work-backend (plugins/x/plugin-work-backend): license must be AGPL-3.0-only, got none',
    ]);
    expect(checkLicenses([], 'MIT License')).toEqual(['LICENSE: the root LICENSE must be the full AGPL-3.0 text']);
  });

  it('TC-PLATFORM-048 an Apache-2.0 package that depends on backend-defaults fails and names both packages', () => {
    const problems = checkLicenses(
      [
        pkg('@fasrun/backend-defaults', AGPL),
        pkg('@fasrun/plugin-work-node', APACHE, { dependencies: ['@fasrun/backend-defaults', 'zod'] }),
      ],
      AGPL_TEXT,
    );
    expect(problems).toEqual([
      '@fasrun/plugin-work-node is Apache-2.0 but depends on @fasrun/backend-defaults, which is AGPL-3.0-only',
    ]);
  });
});

const commit = (sha: string, signedOff: boolean, author = 'Ada Lovelace', email = 'ada@example.com'): DcoCommit => ({
  sha,
  authorName: author,
  authorEmail: email,
  message: `fix: something\n\nBody.${signedOff ? `\n\nSigned-off-by: ${author} <${email}>` : ''}\n`,
});
const APP = 'fasrun-dev[bot]';

describe('DCO sign-off (R-platform-016)', () => {
  it('TC-PLATFORM-049 an external contributor with an unsigned commit fails and the commit is listed', () => {
    const result = checkDco({
      authorAssociation: 'CONTRIBUTOR',
      prAuthor: 'ada',
      appLogin: APP,
      commits: [commit('a'.repeat(40), true), commit('b'.repeat(40), false)],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('bbbbbbbbbbbb');
    expect(result.message).not.toContain('aaaaaaaaaaaa');
    expect(result.message).toContain('git commit -s');
  });

  it('requires the sign-off to match the commit author', () => {
    const wrongPerson: DcoCommit = {
      ...commit('c'.repeat(40), false),
      message: 'fix: x\n\nSigned-off-by: Bob <bob@example.com>\n',
    };
    expect(checkDco({ authorAssociation: 'NONE', prAuthor: 'ada', appLogin: APP, commits: [wrongPerson] }).ok).toBe(
      false,
    );
    expect(
      checkDco({ authorAssociation: 'NONE', prAuthor: 'ada', appLogin: APP, commits: [commit('d'.repeat(40), true)] })
        .ok,
    ).toBe(true);
  });

  it('TC-PLATFORM-050 PRs from the GitHub App or from organisation members pass without sign-off', () => {
    const unsigned = [commit('e'.repeat(40), false)];
    expect(checkDco({ authorAssociation: 'NONE', prAuthor: APP, appLogin: APP, commits: unsigned }).ok).toBe(true);
    for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
      expect(
        checkDco({ authorAssociation: association, prAuthor: 'pontus', appLogin: APP, commits: unsigned }).ok,
      ).toBe(true);
    }
  });
});
