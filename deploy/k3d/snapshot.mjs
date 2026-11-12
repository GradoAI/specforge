// Compare workload identities/configuration without exporting any Secret values.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const get = (resource, namespace = 'fasrun') =>
  JSON.parse(
    execFileSync('kubectl', ['--context', 'k3d-fasrun-dev', '-n', namespace, 'get', resource, '-o', 'json'], {
      encoding: 'utf8',
    }),
  );
const sorted = (items) => items.sort((a, b) => a.name.localeCompare(b.name));
console.log(
  JSON.stringify(
    {
      pods: sorted(
        ['fasrun', 'cnpg-system'].flatMap((namespace) =>
          get('pods', namespace)
            .items.filter((p) => !p.metadata.ownerReferences?.some((r) => r.kind === 'Job'))
            .map((p) => ({
              name: p.metadata.name,
              uid: p.metadata.uid,
              images: p.spec.containers.map((c) => c.image),
            })),
        ),
      ),
      deployments: sorted(get('deployments').items.map((d) => ({ name: d.metadata.name, template: d.spec.template }))),
      secrets: sorted(
        ['fasrun-owner', 'fasrun-app'].map((name) => ({
          name,
          hash: createHash('sha256')
            .update(JSON.stringify(get(`secret/${name}`).data))
            .digest('hex'),
        })),
      ),
    },
    null,
    2,
  ),
);
