// CI entry point of the spec-first job: PR_TITLE and BASE_REF come from the workflow environment.
import { checkSpecFirst, collectFromGit } from './spec-first.js';

const base = process.env.BASE_REF ?? 'origin/main';
const result = checkSpecFirst({ title: process.env.PR_TITLE ?? '', ...collectFromGit(base, process.cwd()) });
console.log(result.message);
process.exitCode = result.ok ? 0 : 1;
