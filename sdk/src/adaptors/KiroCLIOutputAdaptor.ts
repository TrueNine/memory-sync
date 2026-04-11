import {AbstractOutputAdaptor} from './adaptor-core'

export class KiroCLIOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('KiroCLIOutputAdaptor', {
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
