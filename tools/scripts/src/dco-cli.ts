// CI entry point of the dco job: the pull request fields come from the workflow environment.
import { checkDco, readCommits } from './dco.js';

const env = (name: string) => process.env[name] ?? '';
const result = checkDco({
  authorAssociation: env('AUTHOR_ASSOCIATION'),
  prAuthor: env('PR_AUTHOR'),
  appLogin: env('APP_LOGIN'),
  commits: readCommits(env('BASE_SHA'), env('HEAD_SHA'), process.cwd()),
});
console.log(result.message);
process.exitCode = result.ok ? 0 : 1;
