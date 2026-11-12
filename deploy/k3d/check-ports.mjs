import { execFileSync } from 'node:child_process';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const ids = docker('ps', '--filter', 'label=k3d.cluster=fasrun-dev', '--format', '{{.ID}}').split('\n').filter(Boolean);
if (!ids.length) throw Error('fasrun-dev has no running nodes');
let api = 0;
for (const container of JSON.parse(docker('inspect', ...ids))) {
  for (const [port, bindings] of Object.entries(container.NetworkSettings.Ports ?? {})) {
    for (const binding of bindings ?? []) {
      if (port !== '6443/tcp' || binding.HostIp !== '127.0.0.1')
        throw Error('fasrun-dev must publish only its API on 127.0.0.1');
      api++;
    }
  }
}
if (api !== 1) throw Error('fasrun-dev must have exactly one loopback API binding');
