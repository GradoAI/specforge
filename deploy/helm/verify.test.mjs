import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Reuse the CLI's existing YAML dependency; no new test-only dependency.
const require = createRequire(new URL('../../apps/fasrun-dev-cli/package.json', import.meta.url));
const { parseAllDocuments } = require('yaml');
const root = fileURLToPath(new URL('../../', import.meta.url));
function render(chart) {
  const output = execFileSync('helm', ['template', chart, `deploy/helm/${chart}`], { cwd: root, encoding: 'utf8' });
  return parseAllDocuments(output).map((doc) => {
    assert.deepEqual(doc.errors, []);
    return doc.toJSON();
  });
}

test('TC-PLATFORM-042 database chart enforces the two managed role privilege boundaries', () => {
  const resources = render('fasrun-database');
  assert.equal(resources.length, 1);
  const { spec } = resources[0];
  assert.equal(resources[0].kind, 'Cluster');
  assert.equal(spec.instances, 1);
  assert.equal(spec.bootstrap.initdb.database, 'fasrun');
  assert.equal(spec.bootstrap.initdb.owner, 'fasrun_owner');
  assert.equal(spec.enableSuperuserAccess, false);
  assert.match(spec.imageName, /@sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    spec.managed.roles.map((role) => role.name),
    ['fasrun_owner', 'fasrun_app'],
  );
  for (const role of spec.managed.roles) {
    for (const privilege of ['superuser', 'createdb', 'createrole', 'replication', 'inherit']) {
      assert.equal(role[privilege], false);
    }
    assert.equal(role.bypassrls, role.name === 'fasrun_owner');
    assert.equal(role.login, true);
    assert.equal(role.passwordSecret.name, role.name === 'fasrun_owner' ? 'fasrun-owner' : 'fasrun-app');
  }
});

test('TC-PLATFORM-042 service chart keeps ports internal, probes ready and uses only app credentials', () => {
  const resources = render('fasrun');
  assert.equal(resources.length, 7);
  const deployments = resources.filter((resource) => resource.kind === 'Deployment');
  assert.equal(deployments.length, 3);
  for (const resource of deployments) {
    const pod = resource.spec.template.spec;
    assert.equal(pod.securityContext.runAsUser, 65532);
    assert.equal(pod.automountServiceAccountToken, false);
    const container = pod.containers[0];
    assert.equal(container.livenessProbe.httpGet.path, '/healthz');
    assert.equal(container.readinessProbe.httpGet.path, '/readyz');
    if (container.name === 'core') {
      assert.deepEqual(container.env[0].valueFrom.secretKeyRef, { name: 'fasrun-app', key: 'uri' });
    }
    assert.ok(!JSON.stringify(pod).includes('fasrun-owner'));
  }
  for (const service of resources.filter((resource) => resource.kind === 'Service')) {
    assert.equal(service.spec.type, 'ClusterIP');
    assert.equal(service.spec.externalIPs, undefined);
  }
});

test('TC-PLATFORM-043 rendering is deterministic across upgrades', () => {
  for (const chart of ['fasrun', 'fasrun-database']) assert.deepEqual(render(chart), render(chart));
});

test('TC-PLATFORM-044 migration is a blocking pre-install and pre-upgrade hook', () => {
  const job = render('fasrun').find((resource) => resource.kind === 'Job');
  assert.equal(job.metadata.annotations['helm.sh/hook'], 'pre-install,pre-upgrade');
  assert.equal(job.metadata.annotations['helm.sh/hook-delete-policy'], 'before-hook-creation');
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.template.spec.restartPolicy, 'Never');
  const container = job.spec.template.spec.containers[0];
  assert.deepEqual(container.args, ['bin/run.js', 'migrate', '--json']);
  assert.deepEqual(container.env[0], {
    name: 'FASRUN_MIGRATE_DATABASE_URL',
    valueFrom: { secretKeyRef: { name: 'fasrun-owner', key: 'uri' } },
  });
});
