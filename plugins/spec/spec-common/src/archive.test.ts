import { describe, expect, it } from 'vitest';
import { planSpecArchive } from './archive.js';
import { validateSpecs } from './validation.js';

export const entry = (n: number, title = 'Original') =>
  `### Requirement: R-demo-00${n} ${title}\nDescription\n#### Scenario: R-demo-00${n}.S1 Works\n- GIVEN input\n- WHEN applied\n- THEN done\n`;
export const archiveFixture = () => ({
  'specs/demo/spec.md': `# Demo\nDescription retained\n## Requirements\n${entry(1)}${entry(2)}${entry(3)}`,
  'changes/demo/specs/demo/spec.md': `## ADDED Requirements\n${entry(4, 'Added')}\n## MODIFIED Requirements\n${entry(1, 'Modified')}\n## REMOVED Requirements\n### Requirement: R-demo-002 Original\n原因：obsolete\n迁移：none\n## RENAMED Requirements\n- FROM: R-demo-003 Original\n- TO: R-demo-003 Renamed\n`,
});

describe('archive plan D-13', () => {
  it('TC-SPEC-013 applies all partitions, keeps scenarios and validates the archived snapshot', () => {
    const files = archiveFixture();
    const before = structuredClone(files);
    const result = planSpecArchive(files, [], 'changes/demo', '2026-11-12');
    expect(files).toEqual(before);
    expect(result.files['specs/demo/spec.md']).toBe(
      `# Demo\nDescription retained\n## Requirements\n\n${entry(1, 'Modified').trimEnd()}\n\n${entry(3, 'Renamed').trimEnd()}\n\n${entry(4, 'Added')}`,
    );
    expect(result.files['changes/demo/specs/demo/spec.md']).toBeUndefined();
    expect(result.files['changes/archive/2026-11-12-demo/specs/demo/spec.md']).toBe(
      files['changes/demo/specs/demo/spec.md'],
    );
    expect(validateSpecs(result.files, [])).toEqual([]);
  });
  it('TC-SPEC-014 rejects conflicts and malformed input without changing its input', () => {
    for (const delta of [
      `## ADDED Requirements\n${entry(1)}`,
      `## MODIFIED Requirements\n${entry(9)}`,
      '## REMOVED Requirements\n### Requirement: R-demo-009 Gone\n原因：old\n迁移：none\n',
      '## RENAMED Requirements\n- FROM: R-demo-009 Missing\n- TO: R-demo-009 New\n',
      '## RENAMED Requirements\n- FROM: R-demo-001 Wrong\n- TO: R-demo-001 New\n',
      '## ADDED Requirements\n### Requirement: R-demo-004 Missing scenario\n',
      `## Requirements\n${entry(4)}`,
    ]) {
      const files = { ...archiveFixture(), 'changes/demo/specs/demo/spec.md': delta };
      const before = structuredClone(files);
      expect(() => planSpecArchive(files, [], 'changes/demo', '2026-11-12')).toThrow();
      expect(files).toEqual(before);
    }
  });
  it('TC-SPEC-014 checks date, active source, existing targets and merged validation', () => {
    for (const date of ['today', '2026-02-30', '2026-99-01'])
      expect(() => planSpecArchive(archiveFixture(), [], 'changes/demo', date)).toThrow();
    for (const change of ['changes/archive', '../demo', 'changes/missing'])
      expect(() => planSpecArchive(archiveFixture(), [], change, '2026-11-12')).toThrow();
    expect(() =>
      planSpecArchive(
        { ...archiveFixture(), 'changes/archive/2026-11-12-demo/note.md': 'existing' },
        [],
        'changes/demo',
        '2026-11-12',
      ),
    ).toThrow('exists');
    const missing = archiveFixture();
    delete (missing as Record<string, string>)['specs/demo/spec.md'];
    expect(() => planSpecArchive(missing, [], 'changes/demo', '2026-11-12')).toThrow();
    const files = {
      ...archiveFixture(),
      'changes/other/requirements.md': '### US-1 Other\n实现它的需求条目：R-demo-002\n',
    };
    expect(() => planSpecArchive(files, [], 'changes/demo', '2026-11-12')).toThrow('SPEC_US_COVERAGE');
  });
});
