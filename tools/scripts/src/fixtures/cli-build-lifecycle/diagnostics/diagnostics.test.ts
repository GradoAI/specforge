import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
function run(script: string) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 15000,
    killSignal: 'SIGKILL',
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
const imports = `import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { PassThrough } from 'node:stream';
import { location, traceParser, processLedger, criticalPath, summarize } from './analyze.mjs';
import { target, limits, snapshot, verifyBudgets, evidenceWriter, lineStream, acceptProbe, preflight, traced } from './collect.mjs';`;

describe('SF-7 native diagnostic facility (synthetic only; no lifecycle experiment)', () => {
  it('TC-SF7-DIAG-001: manual fixed source, read-only permissions and unchanged budgets', () => {
    const workflow = parse(fs.readFileSync(`${root}.github/workflows/sf7-native-diagnostics.yml`, 'utf8')) as {
      on: Record<string, unknown>;
      permissions: Record<string, string>;
      jobs: { evidence: { 'timeout-minutes': number; 'runs-on': string; steps: Record<string, unknown>[] } };
    };
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch).toBeNull();
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.evidence['timeout-minutes']).toBe(20);
    expect(workflow.jobs.evidence['runs-on']).toBe('ubuntu-24.04');
    const text = JSON.stringify(workflow);
    expect(text).toContain('b59b9f4b588d4aa819baa071fec8b902692fa884');
    expect(text).toContain('24.22.2');
    expect(text).toContain('pnpm install --frozen-lockfile');
    expect(text).not.toMatch(/secrets\.|workflow_run|pull_request|merge_group|matrix|continue-on-error/);
    run(`${imports}
      verifyBudgets(${JSON.stringify(root)});
      assert.equal(target.tree, 'ed499ca7e027965a564a0517922d49c74ed18bbe');
      assert.equal(limits.commandMs, 60000);
      assert.throws(() => snapshot(${JSON.stringify(root)}), /fixed checkout mismatch/);
      const collector = fs.readFileSync('./collect.mjs', 'utf8');
      assert.ok(collector.includes("traced(root, 'pnpm', ['test'], writer)"));
      assert.ok(collector.indexOf('precheck = await preflight') < collector.indexOf("test = await traced"));
    `);
    const refusal = spawnSync(process.execPath, [`${directory}collect.mjs`, 'collect', '--arbitrary-command'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(refusal.status).toBe(2);
    expect(refusal.stderr).toContain('refused before test start');
  });

  it('TC-SF7-DIAG-002: short exits, signals, split syscalls, PID reuse and missing events', () => {
    run(`${imports}
      const events=[]; const ledger=processLedger();
      const parser=traceParser(e=>{events.push(e); ledger.add(e)},()=>({area:'target',package:null}));
      for(const line of [
        '10 100.000001 execve("/bin/sh", ["sh", "secret=do-not-export"], 0x0 /* env */) = 0',
        '10 100.000002 clone(child_stack=NULL, flags=SIGCHLD <unfinished ...>',
        '11 100.000003 execve("/bin/true", ["true"], 0x0) = 0',
        '11 100.000004 +++ exited with 0 +++',
        '10 100.000005 <... clone resumed>) = 11',
        '10 100.000006 clone(child_stack=NULL, flags=SIGCHLD) = 12',
        '12 100.000007 +++ killed by SIGKILL +++',
        '10 100.000008 +++ exited with 0 +++',
        '11 101.000001 execve("/bin/sh", ["sh"], 0x0) = 0',
        '11 101.000002 +++ exited with 7 +++'
      ]) parser.line(line);
      assert.deepEqual(parser.status(),{rejected:0,pending:0});
      const result=ledger.result(); assert.ok(result.complete);
      assert.equal(result.processes.filter(p=>p.pid===11).length,2);
      assert.ok(result.processes.find(p=>p.pid===11).parent);
      assert.ok(!JSON.stringify(events).includes('do-not-export'));
      assert.throws(()=>acceptProbe({complete:false,ledger:result}),/incomplete/);
      const missing=processLedger(); missing.add({kind:'exec',pid:9,utc:1});
      assert.equal(missing.result().complete,false);
      parser.line('unexpected backend error');
      assert.equal(parser.status().rejected,1);
      assert.deepEqual(location('/private/credential', '/target'),{area:'external',package:null});
    `);
  });

  it('TC-SF7-DIAG-002: live short backend preflight or explicit refusal, never starts root tests', () => {
    const output = run(`${imports}
      const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sf7-probe-'));
      const writer=evidenceWriter(directory);
      try {
        const available = process.platform === 'linux' && (await import('node:child_process')).spawnSync('strace',['--version']).status === 0;
        if(available) {
          const result=await preflight(process.cwd(),writer);
          assert.ok(result.complete); assert.equal(result.code,0);
          console.log('live synthetic backend passed');
        } else {
          await assert.rejects(()=>preflight(process.cwd(),writer));
          console.log('backend unavailable: refusal verified; native preflight not claimed');
        }
      } finally { writer.finish({synthetic:true}); fs.rmSync(directory,{recursive:true,force:true}); }
    `);
    console.log(output.trim());
  }, 20000);

  it('TC-SF7-DIAG-003: dependency critical path, concurrency and resource uncertainty', () => {
    run(`${imports}
      const graph=[{taskId:'a',dependencies:[]},{taskId:'b',dependencies:[]},{taskId:'c',dependencies:['a']}];
      const result=criticalPath(graph,[{taskId:'a',start:1,end:3,graphStart:0},{taskId:'b',start:1,end:4,graphStart:0},{taskId:'c',start:4,end:7,graphStart:0}]);
      assert.deepEqual(result.longestObservedWorkChain.path,['a','c']);
      assert.equal(result.tasks.c.readyToExecSeconds,1);
      assert.throws(()=>criticalPath(graph,[]),/incomplete/);
      assert.equal(summarize({complete:true,processes:[]},graph).complete,false);
      const ledger=processLedger(); ledger.add({kind:'exec',pid:1,utc:1});
      ledger.sample(1,{startTicks:100,rssBytes:1024,cpuTicks:3});
      ledger.sample(1,{startTicks:100,rssBytes:512,cpuTicks:4});
      ledger.add({kind:'exit',pid:1,utc:2,code:7});
      const p=ledger.result().processes[0];
      assert.equal(p.resource.maxObservedRssBytes,1024); assert.equal(p.exit.code,7);
      assert.equal(p.resource.cpuTicks,4);
    `);
  });

  it('TC-SF7-DIAG-003: streaming redaction, aggregate cap, missing data and settled streams', () => {
    run(`${imports}
      const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sf7-cap-'));
      try {
        const writer=evidenceWriter(directory,1024*1024+256);
        for(let i=0;i<20;i++) writer.add({kind:'safe',number:i});
        assert.ok(writer.capped); writer.finish({status:'incomplete'});
        const size=fs.readdirSync(directory).reduce((n,f)=>n+fs.statSync(path.join(directory,f)).size,0);
        assert.ok(size<=1024*1024+256);
        let loss=0; const lines=[]; const stream=new PassThrough();
        lineStream(stream,line=>lines.push(line),()=>loss++);
        stream.write('a');stream.write('b\\n');stream.write('x'.repeat(70000));stream.end('\\nlast');
        await new Promise(resolve=>stream.on('end',resolve));
        assert.deepEqual(lines,['ab','last']); assert.equal(loss,1);
      } finally { fs.rmSync(directory,{recursive:true,force:true}); }
    `);
  });
});

it('TC-SF7-DIAG-003: FIFO drains, original nonzero survives, cancellation settles before cleanup', () => {
  run(String.raw`${imports}
    const originalPath=process.env.PATH;
    const create=fs.createReadStream;
    let delayedOpens=0;
    // Force the formerly racy ordering, without probabilistic repetition. The
    // collector must supply an already-open reader fd, so this delayed open is
    // never invoked after the final writer is gone.
    fs.createReadStream=(file,options)=>create(file,{...options,fs:{
      open(...args){delayedOpens++;setTimeout(()=>fs.open(...args),200)},read:fs.read,close:fs.close
    }});
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sf7-transport-test-'));
    const before=new Set(fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('sf7-trace-')));
    try {
      // A transport double, not evidence that the real kernel backend works.
      const backend=path.join(directory,'strace');
      fs.writeFileSync(backend, '#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\nshift\nfifo="$1"\nprintf "100 1.000001 execve(\\"/bin/true\\", [], 0x0) = 0\\n100 1.000002 +++ exited with 7 +++\\n" > "$fifo"\nexit 7\n', {mode:0o700});
      process.env.PATH=directory+path.delimiter+originalPath;
      const writer=evidenceWriter(path.join(directory,'nonzero'));
      const result=await traced(process.cwd(),'/bin/true',[],writer,{probe:true});
      writer.finish({synthetic:true});
      assert.equal(result.code,7); assert.equal(result.ledger.processes[0].exit.code,7);
      assert.equal(result.ledger.complete,true);
      assert.equal(result.parse.rejected,0); assert.equal(result.loss,0);
      assert.equal(result.complete,result.resourceGaps===0);
      assert.equal(delayedOpens,0);
      fs.writeFileSync(backend, '#!/bin/sh\nexit 23\n', {mode:0o700});
      const failedWriter=evidenceWriter(path.join(directory,'failed-start'));
      const failed=await traced(process.cwd(),'/bin/true',[],failedWriter,{probe:true});
      failedWriter.finish({synthetic:true});
      assert.equal(failed.code,23); assert.equal(failed.complete,false);
      // The fake tracee is the backend itself; signal handling therefore has a
      // real process to settle without invoking any repository test or build.
      fs.writeFileSync(backend, '#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\nshift\nfifo="$1"\ntrap "exit 143" TERM\nprintf "%s 1.000001 execve(\\"/bin/sh\\", [], 0x0) = 0\\n" "$$" > "$fifo"\nwhile :; do :; done\n', {mode:0o700});
      const cancelledWriter=evidenceWriter(path.join(directory,'cancel'));
      const cancel=setTimeout(()=>process.kill(process.pid,'SIGTERM'),300);
      const cancelled=await traced(process.cwd(),'/bin/true',[],cancelledWriter,{probe:true});
      clearTimeout(cancel); cancelledWriter.finish({synthetic:true});
      assert.equal(cancelled.cancelled,'SIGTERM'); assert.equal(cancelled.complete,false);
      assert.deepEqual(new Set(fs.readdirSync(os.tmpdir()).filter(name=>name.startsWith('sf7-trace-'))),before);
    } finally { fs.createReadStream=create; process.env.PATH=originalPath; fs.rmSync(directory,{recursive:true,force:true}); }
  `);
}, 20000);

it('TC-SF7-DIAG-003: a wedged observer cannot swallow the test harness timeout', () => {
  const start = Date.now();
  const result = spawnSync(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
    timeout: 200,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
  });
  expect(result.error).toMatchObject({ code: 'ETIMEDOUT' });
  expect(result.signal).toBe('SIGKILL');
  expect(Date.now() - start).toBeLessThan(5000);
});
