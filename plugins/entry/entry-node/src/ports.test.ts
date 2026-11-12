import { describe, expect, expectTypeOf, it } from 'vitest';
import * as ports from './index.js';
import type { EntryService } from './index.js';
import { readFileSync } from 'node:fs';
describe('TC-SF5-CONTRACT-001 entry public service ports', () => {
  it('imports the public registration API with owner-bound root scope', () => {
    expect(ports.entryServiceRef).toMatchObject({ id: 'entry.service', scope: 'root' });
    expectTypeOf<'db' extends keyof EntryService ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'repository' extends keyof EntryService ? true : false>().toEqualTypeOf<false>();
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(
      Object.keys(manifest.dependencies).filter((dependency) => /-backend(?:-|$)|drizzle|^pg$/.test(dependency)),
    ).toEqual([]);
  });
});
