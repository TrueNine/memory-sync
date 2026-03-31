import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import {ExecuteCommand} from '../ExecuteCommand'

export class ExecuteCommandFactory implements CommandFactory {
  canHandle(): boolean {
    return true
  }

  createCommand(): Command {
    return new ExecuteCommand()
  }
}
