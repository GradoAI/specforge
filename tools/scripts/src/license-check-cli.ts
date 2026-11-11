// CI entry point of the license-check job; runs from the repository root.
import { existsSync, readFileSync } from 'node:fs';
import { checkLicenses, loadWorkspace } from './license-check.js';

const root = process.cwd();
const packages = loadWorkspace(root);
const rootLicense = existsSync(`${root}/LICENSE`) ? readFileSync(`${root}/LICENSE`, 'utf8') : undefined;
const problems = checkLicenses(packages, rootLicense);
for (const problem of problems) console.log(problem);
if (problems.length === 0) console.log(`License declarations of ${packages.length} packages are consistent.`);
process.exitCode = problems.length === 0 ? 0 : 1;
