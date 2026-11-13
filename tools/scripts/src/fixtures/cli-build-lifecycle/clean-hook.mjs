// tsdown 0.23.5 calls build:before after clean() and before emitting output.
// This fixture observes real cleaning; it never replaces the cleaner or output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
const control = path.resolve('../../.lifecycle');
export default {
  hooks: {
    'build:before': async () => {
      if (process.env['LIFECYCLE_BASELINE'] === '1' || !fs.existsSync(`${control}/pause`)) return;
      assert.ok(!fs.existsSync(path.resolve('dist/index.mjs')), 'tsdown must clean the previous CLI entry');
      fs.writeFileSync(`${control}/cleaned`, '');
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(`${control}/release`)) {
        assert.ok(Date.now() < deadline, 'bounded clean barrier timed out');
        await setTimeout(20);
      }
      assert.ok(!fs.existsSync(`${control}/fail`), 'injected producer failure after real clean');
    },
  },
};
