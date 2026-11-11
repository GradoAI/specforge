import { setTimeout as sleep } from 'node:timers/promises';
import { BaseCommand } from '../base.js';
import { runLogin, type LoginResult } from '../lib/login.js';

export default class Login extends BaseCommand {
  static override summary = 'Log in with device authorization';
  static override description =
    'Reads FASRUN_ENDPOINT, prints a verification address and a code to approve in the browser, and stores the token in $FASRUN_CONFIG/credentials.json (mode 0600). Never opens a browser and never prompts, so it also runs without a terminal.';

  async run(): Promise<LoginResult> {
    await this.parse(Login);
    const result = await runLogin(process.env, {
      fetch,
      sleep: (ms) => sleep(ms),
      now: () => Date.now(),
      prompt: ({ uri, userCode }) => this.note(`Open ${uri} and enter the code ${userCode}`),
    });
    if (!this.jsonEnabled())
      this.note(`Logged in to ${result.endpoint}; credentials saved to ${result.credentialsFile}`);
    return result;
  }
}
