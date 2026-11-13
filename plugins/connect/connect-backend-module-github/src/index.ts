export { createGitHubModule } from './starter/module.js';
export { gitHubActionPayloadSchema } from './application/outbound.js';
export { digest as gitHubRequestHash, POLL_INTERVAL_MS } from './application/inbound.js';
export type { GitHubDependencies, GitHubCredentials, GitHubReferences } from './application/ports.js';

export { createGitHubCredentials } from './infrastructure/credentials.js';
