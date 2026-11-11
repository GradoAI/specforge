// FASRUN-PORTAL-WEB static host (SF-1 T007, D-5). The page and `fasrun --version` are covered in T008 (TC-PLATFORM-013).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { createPortalHost } from './host.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const webRoot = (withIndex: boolean) => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-'));
  dirs.push(dir);
  if (withIndex) writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Fasrun 帆驭</title>');
  writeFileSync(join(dir, 'app.js'), 'console.log(1)');
  return dir;
};
const silent = pino({ level: 'silent' });

describe('fasrun-portal-web', () => {
  it('serves the page, its assets and the health endpoints', async () => {
    const host = createPortalHost({ webRoot: webRoot(true), logger: silent });
    const page = await host.server.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('Fasrun 帆驭');
    expect((await host.server.inject({ method: 'GET', url: '/app.js' })).headers['content-type']).toContain(
      'javascript',
    );
    expect((await host.server.inject({ method: 'GET', url: '/work/SF-1051' })).body).toContain('Fasrun 帆驭');
    expect((await host.server.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect((await host.server.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    await host.stop();
  });

  it('is not ready without a page and never serves files outside its directory', async () => {
    const host = createPortalHost({ webRoot: webRoot(false), logger: silent });
    expect((await host.server.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503);
    expect((await host.server.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect((await host.server.inject({ method: 'GET', url: '/%2e%2e/%2e%2e/etc/passwd' })).statusCode).toBe(404);
    await host.stop();
  });
});
