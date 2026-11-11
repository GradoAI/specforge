// Root help that lists every command by its full name (R-platform-015.S1), instead of only the topics.
import { Help } from '@oclif/core';

export default class FasrunHelp extends Help {
  protected override showRootHelp(): Promise<void> {
    this.log(this.formatRoot());
    this.log('');
    this.log(this.formatCommands(this.sortedCommands.filter((command) => !command.hidden)));
    this.log('');
    return Promise.resolve();
  }
}
