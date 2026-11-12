import { describe, expect, expectTypeOf, it } from 'vitest';
import * as ports from './index.js';
import type { GovernanceService } from './index.js';
import { readFileSync } from 'node:fs';
describe('TC-SF5-CONTRACT-001 governance public service ports', () => {
  it('imports the public registration API with owner-bound root scope', () => {
    expect(ports.governanceServiceRef).toMatchObject({ id: 'governance.service', scope: 'root' });
    expectTypeOf<'db' extends keyof GovernanceService ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'repository' extends keyof GovernanceService ? true : false>().toEqualTypeOf<false>();
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(
      Object.keys(manifest.dependencies).filter((dependency) => /-backend(?:-|$)|drizzle|^pg$/.test(dependency)),
    ).toEqual([]);
  });
});
