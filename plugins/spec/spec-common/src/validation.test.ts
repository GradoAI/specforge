import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAllowedPath, parseSpecs, validateSpecs, type SpecError, type SpecFiles } from './validation.js';

const fixtures = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const valid = JSON.parse(readFileSync(join(fixtures, 'valid.json'), 'utf8')) as Record<string, string>;
const specPath = 'changes/demo/specs/demo/spec.md';
const ids: Record<string, string> = {
  SPEC_ID_FORMAT: 'TC-SPEC-002',
  SPEC_NO_SCENARIO: 'TC-SPEC-003',
  SPEC_MODIFIED_INCOMPLETE: 'TC-SPEC-004',
  SPEC_REMOVED_NO_REASON: 'TC-SPEC-005',
  SPEC_OPEN_QUESTIONS: 'TC-SPEC-006',
  SPEC_US_COVERAGE: 'TC-SPEC-007',
  SPEC_DESIGN_MAPPING: 'TC-SPEC-008',
  SPEC_TASK_COVERAGE: 'TC-SPEC-009',
  SPEC_TASK_CYCLE: 'TC-SPEC-010',
  SPEC_TASK_UNKNOWN_DEP: 'TC-SPEC-010',
  SPEC_SCOPE: 'TC-SPEC-011',
};
describe('SF-1 D-11 specification validation', () => {
  it('TC-SPEC-001 valid layers parse with line numbers and validate without filesystem dependencies', () => {
    expect(validateSpecs(valid, ['apps/'])).toEqual([]);
    expect(parseSpecs(valid).changes[0]?.tasks[0]).toMatchObject({
      id: 'T001',
      line: 1,
      parallel: true,
      requirements: ['R-demo-001'],
      scope: ['apps/demo/'],
      cases: ['TC-DEMO-001'],
      dependencies: [],
    });
    expect(parseSpecs(valid).changes[0]?.requirements[0]?.scenarios[0]).toMatchObject({ id: 'R-demo-001.S1', line: 5 });
  });
  for (const file of readdirSync(fixtures).filter((file) => file.startsWith('spec-'))) {
    const fixture = JSON.parse(readFileSync(join(fixtures, file), 'utf8')) as { files: SpecFiles; expected: SpecError };
    it(`${ids[fixture.expected.code]} ${fixture.expected.code} reports category, file and exact line`, () => {
      expect(validateSpecs(fixture.files, ['apps/'])).toContainEqual(expect.objectContaining(fixture.expected));
    });
  }
  it('TC-SPEC-001 empty current specs and missing optional layers are accepted', () => {
    expect(
      validateSpecs(
        { 'specs/demo/spec.md': '# demo\nDescription\n## Requirements\n', [specPath]: valid[specPath]! },
        [],
      ),
    ).toEqual([]);
  });
  it('TC-SPEC-002 validates every ID kind, parent and duplicates', () => {
    for (const [file, before, after] of [
      [specPath, 'R-demo-001.S1', 'R-demo-001.S0'],
      [specPath, 'R-demo-001.S1', 'R-other-001.S1'],
      ['changes/demo/requirements.md', 'US-1', 'US-x'],
      ['changes/demo/design.md', 'D-1', 'D-x'],
      ['changes/demo/tasks.md', 'T001', 'T1'],
    ])
      expect(validateSpecs({ ...valid, [file!]: valid[file!]!.replace(before!, after!) }, ['apps/'])).toContainEqual(
        expect.objectContaining({ code: 'SPEC_ID_FORMAT', file }),
      );
    for (const file of Object.keys(valid))
      expect(validateSpecs({ ...valid, [file]: valid[file]! + '\n' + valid[file]! }, ['apps/'])).toContainEqual(
        expect.objectContaining({ code: 'SPEC_ID_FORMAT', file }),
      );
  });
  it('TC-SPEC-004 MODIFIED needs a description, scenario and current target independently', () => {
    const current = valid[specPath]!.replace('## ADDED Requirements', '## Requirements');
    const modified = valid[specPath]!.replace('ADDED', 'MODIFIED');
    const files = { 'specs/demo/spec.md': current, [specPath]: modified };
    expect(validateSpecs(files, [])).toEqual([]);
    for (const text of [modified.split('####')[0]!, modified.replace('A complete description.', '')])
      expect(validateSpecs({ ...files, [specPath]: text }, [])).toContainEqual(
        expect.objectContaining({ code: 'SPEC_MODIFIED_INCOMPLETE' }),
      );
  });
  it('TC-SPEC-005 REMOVED requires both a nonempty reason and migration', () => {
    const text = '## REMOVED Requirements\n### Requirement: R-demo-001 Removed\n原因：Retired\n迁移：Use replacement\n';
    expect(validateSpecs({ [specPath]: text }, [])).toEqual([]);
    for (const line of ['原因：Retired', '迁移：Use replacement'])
      expect(validateSpecs({ [specPath]: text.replace(line, '') }, [])).toContainEqual(
        expect.objectContaining({ code: 'SPEC_REMOVED_NO_REASON' }),
      );
  });
  it('TC-SPEC-001 RENAMED preserves its ID and source locations', () => {
    const text = '## RENAMED Requirements\n- FROM: R-demo-001 Old\n- TO: R-demo-001 New\n';
    expect(parseSpecs({ [specPath]: text }).changes[0]?.renames).toEqual([
      { file: specPath, line: 2, from: 'R-demo-001', to: 'R-demo-001', fromTitle: 'Old', toTitle: 'New' },
    ]);
    for (const broken of [text.replace('TO: R-demo-001', 'TO: R-demo-002'), text.split('- TO:')[0]!])
      expect(validateSpecs({ [specPath]: broken }, [])).toContainEqual(
        expect.objectContaining({ code: 'SPEC_ID_FORMAT' }),
      );
  });
  it('TC-SPEC-007/008 mappings reject missing and nonexistent references', () => {
    for (const [file, code] of [
      ['changes/demo/requirements.md', 'SPEC_US_COVERAGE'],
      ['changes/demo/design.md', 'SPEC_DESIGN_MAPPING'],
    ]) {
      for (const reference of ['', 'R-unknown-001'])
        expect(
          validateSpecs({ ...valid, [file!]: valid[file!]!.replace('R-demo-001', reference) }, ['apps/']),
        ).toContainEqual(expect.objectContaining({ code, file }));
    }
  });
  it('TC-SPEC-009 tasks with unknown mappings fail even when all delta requirements are covered', () => {
    const file = 'changes/demo/tasks.md';
    expect(
      validateSpecs(
        {
          ...valid,
          [file]: valid[file]! + valid[file]!.replace('T001', 'T002').replace('R-demo-001', 'R-unknown-001'),
        },
        ['apps/'],
      ),
    ).toContainEqual(expect.objectContaining({ code: 'SPEC_TASK_COVERAGE', file, line: 2 }));
  });
  it('TC-SPEC-010 acyclic shared dependencies are allowed, self dependencies fail', () => {
    const file = 'changes/demo/tasks.md';
    const task = valid[file]!;
    expect(
      validateSpecs(
        {
          ...valid,
          [file]:
            task +
            task.replace('T001', 'T002').replace('依赖 无', '依赖 T001') +
            task.replace('T001', 'T003').replace('依赖 无', '依赖 T001、T002'),
        },
        ['apps/'],
      ),
    ).toEqual([]);
    expect(validateSpecs({ ...valid, [file]: task.replace('依赖 无', '依赖 T001') }, ['apps/'])).toContainEqual(
      expect.objectContaining({ code: 'SPEC_TASK_CYCLE', message: 'Task cycle: T001 → T001' }),
    );
  });
  it('TC-SPEC-011 scope matching respects directory boundaries and rejects traversal', () => {
    for (const path of [
      '/etc/hosts',
      'apps/../secret',
      'apps/./demo',
      'C:/apps/demo',
      'apps\\demo',
      'apps-evil/',
      'apps/*',
      'package.json/evil',
    ])
      expect(isAllowedPath(path, ['apps/', 'package.json'])).toBe(false);
    expect(isAllowedPath('apps/demo/', ['apps/'])).toBe(true);
    expect(isAllowedPath('package.json', ['package.json'])).toBe(true);
  });
  it('TC-SPEC-005 blank REMOVED fields never borrow a value from the next line', () => {
    for (const text of [
      '原因：\n迁移：Use replacement',
      '原因：   \n迁移：Use replacement',
      '原因：Retired\n迁移：\nUnrelated text',
    ])
      expect(
        validateSpecs({ [specPath]: `## REMOVED Requirements\n### Requirement: R-demo-001 Removed\n${text}\n` }, []),
      ).toContainEqual(expect.objectContaining({ code: 'SPEC_REMOVED_NO_REASON' }));
  });
  it('TC-SPEC-007/008/009/010 malformed references are never truncated or discarded', () => {
    for (const [file, code] of [
      ['changes/demo/requirements.md', 'SPEC_US_COVERAGE'],
      ['changes/demo/design.md', 'SPEC_DESIGN_MAPPING'],
      ['changes/demo/tasks.md', 'SPEC_TASK_COVERAGE'],
    ])
      expect(
        validateSpecs({ ...valid, [file!]: valid[file!]!.replace('R-demo-001', 'R-demo-001oops') }, ['apps/']),
      ).toContainEqual(expect.objectContaining({ code, file }));
    for (const dependency of ['T999oops', 'Tx', 'T001oops', 'bogus']) {
      const file = 'changes/demo/tasks.md';
      expect(
        validateSpecs({ ...valid, [file]: valid[file]!.replace('依赖 无', `依赖 ${dependency}`) }, ['apps/']),
      ).toContainEqual(
        expect.objectContaining({ code: 'SPEC_TASK_UNKNOWN_DEP', message: `T001: unknown dependency ${dependency}` }),
      );
    }
  });
  it('TC-SPEC-001 archive checks format without coverage or historical target existence', () => {
    const archive = 'changes/archive/2026-01-01-demo/';
    expect(
      validateSpecs(
        {
          [archive + 'specs/demo/spec.md']: valid[specPath]!.replace('ADDED', 'MODIFIED'),
          [archive + 'tasks.md']: '- [ ] T001 Done — 对应 R-missing-001；修改范围 /old/；依赖 T999\n',
        },
        [],
      ),
    ).toEqual([]);
    expect(validateSpecs({ [archive + 'specs/demo/spec.md']: valid[specPath]!.split('####')[0]! }, [])).toContainEqual(
      expect.objectContaining({ code: 'SPEC_NO_SCENARIO' }),
    );
  });
});
