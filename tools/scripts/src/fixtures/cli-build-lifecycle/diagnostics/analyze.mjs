// Only structured, allowlisted fields leave the collector. Never serialize strace
// lines, argv, environment, arbitrary cwd, or test stdout/stderr.
export const packages = {
  'packages/backend-defaults': '@fasrun/backend-defaults',
  'packages/backend-plugin-api': '@fasrun/backend-plugin-api',
  'packages/cli-templates': '@fasrun/cli-templates',
  'packages/contracts-core': '@fasrun/contracts-core',
  'plugins/spec/spec-common': '@fasrun/plugin-spec-common',
  'packages/test-utils': '@fasrun/test-utils',
};

export function location(cwd, root) {
  if (typeof cwd !== 'string') return { area: 'unknown', package: null };
  const fixture = cwd.match(/\/fasrun-lifecycle-([a-zA-Z0-9]+)(?:\/(.*))?$/);
  const relative = fixture ? (fixture[2] ?? '') : cwd.startsWith(`${root}/`) ? cwd.slice(root.length + 1) : '';
  return {
    area: fixture ? `fixture-${fixture[1]}` : cwd === root || cwd.startsWith(`${root}/`) ? 'target' : 'external',
    package: packages[relative] ?? null,
  };
}

// -f -ttt provides kernel trace events, including exits of unsampled children.
// Join unfinished/resumed syscalls without exporting any raw arguments.
export function traceParser(emit, cwdForPid) {
  const pending = new Map();
  let rejected = 0;
  return {
    line(line) {
      const match = line.match(/^\s*(\d+)\s+(\d+\.\d+)\s+(.*)$/);
      if (!match) {
        if (line.trim()) rejected++;
        return;
      }
      const pid = Number(match[1]);
      const utc = Number(match[2]);
      let body = match[3];
      if (body.includes('<unfinished ...>')) {
        pending.set(pid, body.replace('<unfinished ...>', ''));
        return;
      }
      if (body.startsWith('<... ')) {
        const prefix = pending.get(pid);
        pending.delete(pid);
        if (!prefix) {
          rejected++;
          return;
        }
        body = prefix + body.replace(/^<\.\.\. \w+ resumed>/, '');
      }
      if (body.startsWith('+++')) pending.delete(pid);
      const duration = body.match(/<([0-9.]+)>$/);
      const event = { pid, utc, syscallWallSeconds: duration ? Number(duration[1]) : undefined };
      let found;
      if ((found = body.match(/^\+\+\+ exited with (\d+) \+\+\+/)))
        emit({ ...event, kind: 'exit', code: Number(found[1]), signal: null });
      else if ((found = body.match(/^\+\+\+ killed by (SIG[A-Z0-9]+)/)))
        emit({ ...event, kind: 'exit', code: null, signal: found[1] });
      else if ((found = body.match(/^(clone3?|fork|vfork)\(.*\)\s+= (\d+)/)))
        emit({ ...event, kind: 'birth', child: Number(found[2]), thread: body.includes('CLONE_THREAD') });
      else if ((found = body.match(/^(clone3?|fork|vfork)\(.*\)\s+= -1 (E[A-Z0-9]+)/)))
        emit({ ...event, kind: 'spawn-error', operation: found[1], errno: found[2] });
      else if (/^execve(at)?\(/.test(body)) {
        // Failed PATH lookups do not constitute an exec.
        if (!/\)\s+= 0(?:\s|$)/.test(body)) return;
        const quoted = [...body.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((part) => part[1]);
        const executable = quoted[0]?.split('/').pop();
        const tool = /^(node|pnpm|turbo|tsdown|sh|bash|true)$/.test(executable ?? '') ? executable : 'other';
        const compiler = quoted.some((arg) => /(?:^|\/)tsdown(?:$|\/)|tsdown\/dist\//.test(arg));
        const sixBuild =
          Object.values(packages).every((name) => quoted.includes(`--filter=${name}`)) &&
          !quoted.includes('--dry=json');
        emit({ ...event, kind: 'exec', tool, compiler, sixBuild, ...cwdForPid(pid) });
      } else if ((found = body.match(/^--- (SIG[A-Z0-9]+)/))) emit({ ...event, kind: 'signal', signal: found[1] });
      else if ((found = body.match(/^(setsid|setpgid)\(.*\)\s+= (-?\d+)/)))
        emit({ ...event, kind: 'group', operation: found[1], result: Number(found[2]) });
      else if ((found = body.match(/^(wait4|waitid)\(.*\)\s+= (-?\d+)/)))
        emit({ ...event, kind: 'wait', result: Number(found[2]) });
      else if (
        /^(exit|exit_group|kill|tkill|tgkill|pidfd_send_signal|rt_sigqueueinfo|rt_tgsigqueueinfo|restart_syscall)\(/.test(
          body,
        )
      ) {
        emit({ ...event, kind: 'control', operation: body.slice(0, body.indexOf('(')) });
      } else rejected++;
    },
    status: () => ({ rejected, pending: pending.size }),
  };
}

export function processLedger() {
  const current = new Map();
  const all = [];
  const gaps = [];
  function ensure(pid, utc) {
    let record = current.get(pid);
    if (!record || record.exit) {
      record = { id: `${pid}@${utc}`, pid, firstObservedUtc: utc, birthUtc: null, parent: null, execs: [] };
      current.set(pid, record);
      all.push(record);
    }
    return record;
  }
  return {
    add(event) {
      const record = ensure(event.pid, event.utc);
      if (event.kind === 'birth') {
        const prior = current.get(event.child);
        const child = prior && prior.birthUtc === null ? prior : ensure(event.child, event.utc);
        child.birthUtc = event.utc;
        child.parent = record.id;
        child.thread = event.thread;
      }
      if (event.kind === 'exec') record.execs.push(event);
      if (event.kind === 'exit') record.exit = event;
      return record.id;
    },
    sample(pid, value) {
      const record = current.get(pid);
      if (!record || record.exit) return;
      if (record.startTicks && record.startTicks !== value.startTicks) gaps.push('sample-pid-reuse-without-birth');
      record.startTicks = value.startTicks;
      // Keep extrema/last counters, not an unbounded copy of resource events.
      record.resource = {
        ...value,
        maxObservedRssBytes: Math.max(record.resource?.maxObservedRssBytes ?? 0, value.rssBytes),
        count: (record.resource?.count ?? 0) + 1,
      };
    },
    identity: (pid) => current.get(pid)?.startTicks,
    live: () => [...current.values()].filter((record) => !record.exit).map((record) => record.pid),
    result() {
      const missingExit = all.filter((record) => !record.exit).map((record) => record.id);
      return { processes: all, gaps, missingExit, complete: gaps.length === 0 && missingExit.length === 0 };
    },
  };
}

export function criticalPath(tasks, intervals) {
  const byId = new Map(intervals.map((entry) => [entry.taskId, entry]));
  const scores = new Map();
  const visiting = new Set();
  function visit(id) {
    if (scores.has(id)) return scores.get(id);
    if (visiting.has(id)) throw new Error('cyclic task graph');
    visiting.add(id);
    const task = tasks.find((entry) => entry.taskId === id);
    const interval = byId.get(id);
    if (!task || !interval || interval.end === null) throw new Error('incomplete task intervals');
    const predecessors = task.dependencies.filter((dep) => tasks.some((entry) => entry.taskId === dep)).map(visit);
    const best = predecessors.sort((a, b) => b.weight - a.weight)[0];
    const dependencyReady = Math.max(...predecessors.map((entry) => entry.end), interval.graphStart);
    if (interval.start + 0.001 < dependencyReady) throw new Error('dependency timing contradiction');
    const result = {
      weight: (best?.weight ?? 0) + interval.end - interval.start,
      path: [...(best?.path ?? []), id],
      end: interval.end,
      // Queue/dependency wait is not CPU time and is not proven CPU contention.
      readyToExecSeconds: interval.start - dependencyReady,
    };
    scores.set(id, result);
    visiting.delete(id);
    return result;
  }
  tasks.forEach((task) => visit(task.taskId));
  return {
    longestObservedWorkChain: [...scores.values()].sort((a, b) => b.weight - a.weight)[0],
    tasks: Object.fromEntries(scores),
  };
}

export function summarize(ledger, graph) {
  const processes = ledger.processes;
  const groups = new Map();
  for (const process of processes) {
    // A tsdown script may be executed through its pnpm shim followed by node.
    const exec = process.execs.find((event) => event.compiler && event.package && event.area.startsWith('fixture-'));
    if (!exec) continue;
    const group = groups.get(exec.area) ?? [];
    group.push({
      taskId: `${exec.package}#build`,
      start: exec.utc,
      end: process.exit?.utc ?? null,
      process: process.id,
      resource: process.resource ?? null,
      exit: process.exit ? { code: process.exit.code, signal: process.exit.signal } : null,
      state: !process.exit
        ? 'end-unobserved'
        : process.exit.signal
          ? 'signaled'
          : process.exit.code === 0
            ? 'exited-zero'
            : 'exited-nonzero',
    });
    groups.set(exec.area, group);
  }
  const results = [];
  for (const [fixture, intervals] of groups) {
    const first = Math.min(...intervals.map((entry) => entry.start));
    const starts = processes
      .flatMap((process) => process.execs)
      .filter((event) => event.sixBuild && event.area === fixture && event.utc <= first);
    const graphStart = starts.length ? Math.min(...starts.map((event) => event.utc)) : null;
    const unique = new Set(intervals.map((entry) => entry.taskId));
    let path = null;
    let gap = null;
    if (intervals.length !== 6 || unique.size !== 6 || graphStart === null)
      gap = 'six-package-exec-or-graph-start-not-observed';
    else {
      try {
        path = criticalPath(
          graph,
          intervals.map((entry) => ({ ...entry, graphStart })),
        );
      } catch {
        gap = 'incomplete-or-contradictory-task-timing';
      }
      if (!gap && intervals.some((entry) => entry.end - entry.start >= 0.4 && !entry.resource))
        gap = 'long-lived-compiler-resource-missing';
    }
    results.push({
      fixture,
      intervals,
      graphStart,
      path,
      gap,
      missing: graph
        .filter((task) => !unique.has(task.taskId))
        .map((task) => ({
          taskId: task.taskId,
          state: 'no-compiler-exec-observed',
          reason: 'not enough evidence to distinguish not started, cancelled or cache restored',
        })),
    });
  }
  return {
    complete: ledger.complete && results.length === 1 && results.every((result) => result.gap === null),
    fixtures: results,
    limitations: [
      'Task intervals measure compiler exec to exit, not Turbo internal scheduling decisions.',
      'Observed RSS is a 200ms sampled lower bound on peak; missing short-process samples remain null.',
      'Longest observed work chain is not proof of the cause of elapsed time; concurrent CPU and scheduler counters are separate.',
      'ptrace changes scheduling; no uninstrumented native comparison is performed.',
    ],
  };
}
