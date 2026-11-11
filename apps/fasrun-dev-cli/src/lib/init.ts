// fasrun init (R-platform-015.S2, S4, S8; SF-1 D-10): repository config, spec directories, AGENTS.md and the
// @AGENTS.md reference in CLAUDE.md. Existing files are never rewritten; CLAUDE.md only ever gains one line.
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface InitResult {
  /** Paths relative to the target directory; directories end with "/". */
  created: string[];
  modified: string[];
  unchanged: string[];
}

export const AGENTS_REFERENCE = '@AGENTS.md';

const FASRUN_YAML = `# fasrun.yaml — this repository's Fasrun configuration (tech plan 2.11).
version: 1
spec_root: fasrun/
spec_template: default@1
`;

const FASFILE = `# Fasfile — long-term constraints of this repository (tech plan 2.11).
# Changes go through a pull request approved by the code owners.
version: 1

principles: []

quality_gates:
  required_checks: []

protected_paths:
  - fasrun/changes/archive/

high_risk_paths:
  - .github/
  - fasrun/specs/

agent:
  commands: []
`;

const AGENTS_MD = `# Instructions for coding agents

This file is for the coding agents that work in this repository (Claude Code reads it through CLAUDE.md,
Codex reads it directly). Fasrun does not rewrite it; the machine-checked constraints are in the Fasfile.

- Read the change directory under fasrun/changes/ for the task you are working on before changing code.
- Change only the paths the task allows, and add the tests the task lists.
- Run the repository's checks before you finish.
`;

/** True when some line of the file is exactly the reference (surrounding whitespace ignored). */
export function hasAgentsReference(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === AGENTS_REFERENCE);
}

export async function runInit(target: string): Promise<InitResult> {
  const result: InitResult = { created: [], modified: [], unchanged: [] };
  await mkdir(target, { recursive: true });

  const file = async (name: string, content: string) => {
    const path = join(target, name);
    if (existsSync(path)) {
      result.unchanged.push(name);
      return;
    }
    await writeFile(path, content, { flag: 'wx' });
    result.created.push(name);
  };
  const directory = async (name: string) => {
    const path = join(target, name);
    if (existsSync(path)) {
      result.unchanged.push(`${name}/`);
      return;
    }
    await mkdir(path, { recursive: true });
    result.created.push(`${name}/`);
  };

  await file('fasrun.yaml', FASRUN_YAML);
  await file('Fasfile', FASFILE);
  await directory('fasrun/specs');
  await directory('fasrun/changes');
  await file('AGENTS.md', AGENTS_MD);

  // CLAUDE.md: create with only the reference, append only the reference, or leave it alone.
  const claude = join(target, 'CLAUDE.md');
  if (!existsSync(claude)) {
    await writeFile(claude, `${AGENTS_REFERENCE}\n`, { flag: 'wx' });
    result.created.push('CLAUDE.md');
  } else {
    const text = await readFile(claude, 'utf8');
    if (hasAgentsReference(text)) {
      result.unchanged.push('CLAUDE.md');
    } else {
      const separator = text.length > 0 && !text.endsWith('\n') ? '\n' : '';
      await appendFile(claude, `${separator}${AGENTS_REFERENCE}\n`);
      result.modified.push('CLAUDE.md');
    }
  }
  return result;
}
