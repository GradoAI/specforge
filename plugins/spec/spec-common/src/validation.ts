/** SF-1 D-11: portable parsing and validation; paths are relative to the specification root. */
export type SpecFiles = Readonly<Record<string, string>>;
export interface SourceLocation {
  file: string;
  line: number;
}
export interface SpecError extends SourceLocation {
  code: string;
  message: string;
}
export type Partition = 'CURRENT' | 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED';
export interface SpecEntry extends SourceLocation {
  id: string;
  title: string;
  text: string;
  partition: Partition;
  scenarios: (SourceLocation & { id: string; text: string })[];
}
export interface MappedEntry extends SourceLocation {
  id: string;
  text: string;
  requirements: string[];
}
export interface SpecTask extends MappedEntry {
  parallel: boolean;
  designs: string[];
  scope: string[];
  cases: string[];
  dependencies: string[];
}
export interface SpecChange {
  directory: string;
  archived: boolean;
  requirements: SpecEntry[];
  renames: (SourceLocation & { from: string; to: string; fromTitle: string; toTitle: string })[];
  userStories: MappedEntry[];
  designs: MappedEntry[];
  tasks: SpecTask[];
  hasTasks: boolean;
  questions: (SourceLocation & { text: string })[];
}
export interface ParsedSpecs {
  current: SpecEntry[];
  changes: SpecChange[];
  errors: SpecError[];
}
const REQUIREMENT = /^R-[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d{3}$/;
const refs = (text: string) => [...new Set(text.match(/\bR-[^\s、,，；:：()（）]+/g) ?? [])];
const taskRefs = (text: string) => [...new Set(text.split(/[\s、,，]+/).filter((token) => token && token !== '无'))];
function sections(text: string, pattern: RegExp) {
  const lines = text.split(/\r?\n/);
  const result: { heading: string; text: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i]!;
    if (!pattern.test(heading)) continue;
    const level = heading.match(/^#+/)![0].length;
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^#{1,${level}}\\s`).test(lines[end]!)) end++;
    result.push({ heading, text: lines.slice(i + 1, end).join('\n'), line: i + 1 });
  }
  return result;
}

export function parseSpecs(files: SpecFiles): ParsedSpecs {
  const result: ParsedSpecs = { current: [], changes: [], errors: [] };
  const changes = new Map<string, SpecChange>();
  const error = (file: string, line: number, message: string) =>
    result.errors.push({ code: 'SPEC_ID_FORMAT', file, line, message });
  for (const [file, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const match = /^(changes\/(?:archive\/)?[^/]+)\//.exec(file);
    let change: SpecChange | undefined;
    if (match) {
      const directory = match[1]!;
      change = changes.get(directory);
      if (!change) {
        change = {
          directory,
          archived: directory.startsWith('changes/archive/'),
          requirements: [],
          renames: [],
          userStories: [],
          designs: [],
          tasks: [],
          hasTasks: false,
          questions: [],
        };
        changes.set(directory, change);
      }
    }
    if (/^(?:specs\/[^/]+\/spec\.md|changes\/(?:archive\/)?[^/]+\/specs\/[^/]+\/spec\.md)$/.test(file)) {
      const lines = text.split(/\r?\n/);
      let partition: Partition = 'CURRENT';
      let entry: SpecEntry | undefined;
      let scenario: SpecEntry['scenarios'][number] | undefined;
      let renameFrom: { id: string; title: string; line: number } | undefined;
      for (const [index, line] of lines.entries()) {
        const group = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/.exec(line);
        if (group) {
          partition = group[1] as Partition;
          entry = undefined;
          scenario = undefined;
          continue;
        }
        const req = /^### Requirement:\s*(\S+)\s*(.*)$/.exec(line);
        if (req) {
          entry = { file, line: index + 1, id: req[1]!, title: req[2]!, text: '', partition, scenarios: [] };
          if (!REQUIREMENT.test(entry.id)) error(file, index + 1, `Invalid requirement ID: ${entry.id}`);
          (change?.requirements ?? result.current).push(entry);
          scenario = undefined;
          continue;
        }
        const sc = /^#### Scenario:\s*(\S+)\s*(.*)$/.exec(line);
        if (sc) {
          if (!/^R-[a-z][a-z0-9-]*-\d{3}\.S[1-9]\d*$/.test(sc[1]!) || !entry || !sc[1]!.startsWith(`${entry.id}.S`))
            error(file, index + 1, `Invalid scenario ID or parent: ${sc[1]}`);
          scenario = { file, line: index + 1, id: sc[1]!, text: sc[2]! };
          entry?.scenarios.push(scenario);
          continue;
        }
        const rename = /^- (FROM|TO):\s*(\S+)\s*(.*)$/.exec(line);
        if (partition === 'RENAMED' && rename) {
          if (!REQUIREMENT.test(rename[2]!)) error(file, index + 1, `Invalid rename ID: ${rename[2]}`);
          if (rename[1] === 'FROM') renameFrom = { id: rename[2]!, title: rename[3]!, line: index + 1 };
          else if (renameFrom && change) {
            if (renameFrom.id !== rename[2]) error(file, index + 1, 'RENAMED must preserve the requirement ID');
            change.renames.push({
              file,
              line: renameFrom.line,
              from: renameFrom.id,
              to: rename[2]!,
              fromTitle: renameFrom.title,
              toTitle: rename[3]!,
            });
            renameFrom = undefined;
          } else error(file, index + 1, 'RENAMED TO requires FROM');
          continue;
        }
        if (scenario) scenario.text += `\n${line}`;
        else if (entry) entry.text += `\n${line}`;
      }
      if (renameFrom) error(file, renameFrom.line, 'RENAMED FROM requires TO');
    }
    if (!change) continue;
    if (file.endsWith('/requirements.md')) {
      for (const section of sections(text, /^### US-/)) {
        const id = section.heading.split(/\s+/)[1]!;
        if (!/^US-[1-9]\d*$/.test(id)) error(file, section.line, `Invalid user story ID: ${id}`);
        const mapping = section.text
          .split(/\r?\n/)
          .filter((line) => /^实现它的需求条目[：:]/.test(line))
          .join('\n');
        change.userStories.push({ file, line: section.line, id, text: section.text, requirements: refs(mapping) });
      }
      for (const section of sections(text, /^## 待澄清\s*$/)) {
        if (section.text.trim()) change.questions.push({ file, line: section.line, text: section.text });
      }
    }
    if (file.endsWith('/design.md')) {
      for (const section of sections(text, /^### D-/)) {
        const id = section.heading.split(/\s+/)[1]!;
        if (!/^D-[1-9]\d*$/.test(id)) error(file, section.line, `Invalid design ID: ${id}`);
        const mapping = section.text
          .split(/\r?\n/)
          .filter((line) => /^对应需求[：:]/.test(line))
          .join('\n');
        change.designs.push({ file, line: section.line, id, text: section.text, requirements: refs(mapping) });
      }
    }
    if (file.endsWith('/tasks.md')) {
      change.hasTasks = true;
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        const task = /^- \[[ xX]\]\s+(\S+)(.*)$/.exec(line);
        if (!task) continue;
        const id = task[1]!;
        if (!/^T\d{3}$/.test(id)) error(file, index + 1, `Invalid task ID: ${id}`);
        const segments = (line.split('—')[1] ?? '').split('；').map((part) => part.trim());
        const segment = (name: string) =>
          segments
            .find((part) => part.startsWith(name))
            ?.slice(name.length)
            .trim() ?? '';
        change.tasks.push({
          file,
          line: index + 1,
          id,
          text: line,
          parallel: task[2]!.includes('[P]'),
          designs: segment('对应').match(/D-\d+/g) ?? [],
          requirements: refs(segment('对应')),
          dependencies: taskRefs(segment('依赖')),
          scope: segment('修改范围')
            .replace(/（.*?）/g, '')
            .split(/[、,，]/)
            .map((path) => path.trim())
            .filter(Boolean),
          cases: segment('用例').match(/TC-[A-Z]+-\d+/g) ?? [],
        });
      }
    }
  }
  result.changes = [...changes.values()];
  return result;
}

/** Validate against explicit project paths, never the process filesystem or working directory. */
export function validateSpecs(files: SpecFiles, allowedPaths: readonly string[]): SpecError[] {
  const parsed = parseSpecs(files);
  const errors = [...parsed.errors];
  const add = (code: string, at: SourceLocation, message: string) =>
    errors.push({ code, file: at.file, line: at.line, message });
  const current = new Set(parsed.current.map((entry) => entry.id));
  function entries(items: SpecEntry[], archived: boolean) {
    const seen = new Set<string>();
    for (const entry of items) {
      if (seen.has(entry.id)) add('SPEC_ID_FORMAT', entry, `Duplicate requirement ID: ${entry.id}`);
      seen.add(entry.id);
      const scenarios = new Set<string>();
      for (const scenario of entry.scenarios) {
        if (scenarios.has(scenario.id)) add('SPEC_ID_FORMAT', scenario, `Duplicate scenario ID: ${scenario.id}`);
        scenarios.add(scenario.id);
      }
      if (entry.partition === 'MODIFIED') {
        if (!entry.text.trim() || !entry.scenarios.length || (!archived && !current.has(entry.id)))
          add(
            'SPEC_MODIFIED_INCOMPLETE',
            entry,
            `${entry.id}: MODIFIED requires complete content and an existing current requirement`,
          );
      } else if (entry.partition === 'REMOVED') {
        if (!/^原因[：:][^\S\r\n]*\S/m.test(entry.text) || !/^迁移[：:][^\S\r\n]*\S/m.test(entry.text))
          add('SPEC_REMOVED_NO_REASON', entry, `${entry.id}: REMOVED requires 原因 and 迁移`);
      } else if (entry.partition !== 'RENAMED' && !entry.scenarios.length)
        add('SPEC_NO_SCENARIO', entry, `${entry.id}: requirement has no scenario`);
    }
  }
  entries(parsed.current, false);
  for (const change of parsed.changes) {
    entries(change.requirements, change.archived);
    for (const question of change.questions) add('SPEC_OPEN_QUESTIONS', question, '待澄清 must be empty');
    for (const group of [change.userStories, change.designs, change.tasks]) {
      const ids = new Set<string>();
      for (const entry of group) {
        if (ids.has(entry.id)) add('SPEC_ID_FORMAT', entry, `Duplicate ID: ${entry.id}`);
        ids.add(entry.id);
      }
    }
    if (change.archived) continue;
    const available = new Set([...current, ...change.requirements.map((entry) => entry.id)]);
    const mapping = (items: MappedEntry[], code: string) => {
      for (const item of items)
        if (!item.requirements.length || item.requirements.some((id) => !available.has(id)))
          add(code, item, `${item.id}: must map to existing requirements`);
    };
    mapping(change.userStories, 'SPEC_US_COVERAGE');
    mapping(change.designs, 'SPEC_DESIGN_MAPPING');
    if (!change.hasTasks) continue;
    mapping(change.tasks, 'SPEC_TASK_COVERAGE');
    const covered = new Set(change.tasks.flatMap((task) => task.requirements));
    for (const entry of change.requirements)
      if (!covered.has(entry.id)) add('SPEC_TASK_COVERAGE', entry, `${entry.id}: no task covers this requirement`);
    const tasks = new Map(change.tasks.map((task) => [task.id, task]));
    for (const task of change.tasks) {
      for (const dependency of task.dependencies)
        if (!tasks.has(dependency)) add('SPEC_TASK_UNKNOWN_DEP', task, `${task.id}: unknown dependency ${dependency}`);
      if (!task.scope.length || task.scope.some((path) => !isAllowedPath(path, allowedPaths)))
        add('SPEC_SCOPE', task, `${task.id}: scope outside allowedPaths: ${task.scope.join(', ')}`);
    }
    const visiting: string[] = [];
    const visited = new Set<string>();
    function visit(task: SpecTask) {
      if (visiting.includes(task.id)) {
        add(
          'SPEC_TASK_CYCLE',
          task,
          `Task cycle: ${[...visiting.slice(visiting.indexOf(task.id)), task.id].join(' → ')}`,
        );
        return;
      }
      if (visited.has(task.id)) return;
      visiting.push(task.id);
      for (const dependency of task.dependencies) {
        const next = tasks.get(dependency);
        if (next) visit(next);
      }
      visiting.pop();
      visited.add(task.id);
    }
    change.tasks.forEach(visit);
  }
  return errors.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
}

export function isAllowedPath(path: string, allowedPaths: readonly string[]): boolean {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    /^[a-zA-Z]:/.test(path) ||
    path.split('/').some((part) => part === '..' || part === '.') ||
    path.includes('*')
  )
    return false;
  return allowedPaths.some((allowed) => (allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed));
}
