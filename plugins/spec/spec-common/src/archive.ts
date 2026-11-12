import { parseSpecs, validateSpecs, type SpecEntry, type SpecFiles } from './validation.js';

/** Pure archive plan: validate both complete snapshots before any filesystem operation. */
export function planSpecArchive(files: SpecFiles, allowedPaths: readonly string[], change: string, date: string) {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (!/^changes\/[^/]+$/.test(change) || change === 'changes/archive') fail('Expected an active change directory');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    fail('Invalid archive date; expected YYYY-MM-DD');
  const check = (snapshot: SpecFiles) => {
    const errors = validateSpecs(snapshot, allowedPaths);
    if (errors.length) fail(errors.map((e) => `${e.code} ${e.file}:${e.line}: ${e.message}`).join('\n'));
  };
  check(files);
  const parsed = parseSpecs(files);
  const delta = parsed.changes.find((item) => item.directory === change) ?? fail(`Change not found: ${change}`);
  const destination = `changes/archive/${date}-${change.slice('changes/'.length)}`;
  if (Object.keys(files).some((path) => path.startsWith(`${destination}/`))) fail(`Archive exists: ${destination}`);
  const result: Record<string, string> = { ...files };
  const targets = new Map<string, { header: string; entries: Map<string, string> }>();
  const raw = (entry: SpecEntry) => {
    const lines = files[entry.file]!.split(/\r?\n/);
    let end = entry.line;
    while (end < lines.length && !/^#{1,3} /.test(lines[end]!)) end++;
    return lines
      .slice(entry.line - 1, end)
      .join('\n')
      .trimEnd();
  };
  const target = (file: string) => {
    const path = file.slice(`${change}/`.length);
    let value = targets.get(path);
    if (!value) {
      if (files[path] === undefined) fail(`Current spec missing: ${path}`);
      // This writer supports a single Requirements section. Refuse extra headings
      // that it cannot preserve instead of silently discarding their contents.
      if (
        (files[path]!.match(/^## Requirements$/gm) ?? []).length !== 1 ||
        /^### Requirement:[\s\S]*^## Requirements$/m.test(files[path]!)
      )
        fail(`Expected one Requirements section: ${path}`);
      const unsupported = files[path]!.split(/\r?\n/).find(
        (line, index) =>
          /^#{1,3} /.test(line) &&
          !(index === 0 && /^# [^#]/.test(line)) &&
          line !== '## Requirements' &&
          !/^### Requirement:/.test(line),
      );
      if (unsupported) fail(`Unsupported current spec heading in ${path}: ${unsupported}`);
      const text = files[path]!;
      const index = text.search(/^### Requirement:/m);
      value = {
        header: (index < 0 ? text : text.slice(0, index)).trimEnd(),
        entries: new Map(parsed.current.filter((e) => e.file === path).map((e) => [e.id, raw(e)])),
      };
      targets.set(path, value);
    }
    return value.entries;
  };
  for (const partition of ['ADDED', 'MODIFIED', 'REMOVED'] as const) {
    for (const entry of delta.requirements.filter((e) => e.partition === partition)) {
      const entries = target(entry.file);
      if (
        partition === 'ADDED'
          ? parsed.current.some((e) => e.id === entry.id) || entries.has(entry.id)
          : !entries.has(entry.id)
      )
        fail(`${partition} conflict: ${entry.id}`);
      if (partition === 'REMOVED') entries.delete(entry.id);
      else entries.set(entry.id, raw(entry));
    }
  }
  if (delta.requirements.some((e) => e.partition === 'CURRENT' || e.partition === 'RENAMED'))
    fail('Expected explicit delta partitions');
  for (const rename of delta.renames) {
    const entries = target(rename.file);
    const text = entries.get(rename.from) ?? fail(`RENAMED conflict: ${rename.from}`);
    if (text.split('\n')[0] !== `### Requirement: ${rename.from} ${rename.fromTitle}`)
      fail(`RENAMED title conflict: ${rename.from}`);
    entries.set(rename.from, text.replace(/^.*\n?/, `### Requirement: ${rename.to} ${rename.toTitle}\n`));
  }
  for (const [path, value] of targets)
    result[path] = `${value.header}\n\n${[...value.entries.values()].join('\n\n')}\n`;
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(`${change}/`)) continue;
    delete result[path];
    result[`${destination}${path.slice(change.length)}`] = text;
  }
  check(result);
  return {
    files: result,
    destination,
    writes: Object.fromEntries([...targets.keys()].map((path) => [path, result[path]!])),
  };
}
