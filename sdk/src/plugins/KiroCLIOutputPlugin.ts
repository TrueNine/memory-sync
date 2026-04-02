import {AbstractOutputPlugin} from './plugin-core'

export class KiroCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('KiroCLIOutputPlugin', {
      treatWorkspaceRootProjectAsProject: true,
      capabilities: {},
      cleanup: {
        delete: {
          project: {
            globs: [
              '.kiro/streening',
              '.kiro/streening/**/*',
              '.kiro/specs',
              '.kiro/specs/**/*',
              '.kiro/settings/mcp.json',
              '**/.kiro/streening',
              '**/.kiro/streening/**/*',
              '**/.kiro/specs',
              '**/.kiro/specs/**/*',
              '**/.kiro/settings/mcp.json'
            ]
          },
          global: {
            globs: [
              '.kiro/streening',
              '.kiro/streening/**/*'
            ]
          }
        }
      }
    })
  }
}
