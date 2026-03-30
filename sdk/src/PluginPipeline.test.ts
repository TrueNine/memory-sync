import type {PipelineConfig} from './config'
import type {OutputPlugin} from './plugins/plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from './config'
import {PluginPipeline} from './PluginPipeline'
import {createLogger, FilePathKind, PluginKind} from './plugins/plugin-core'

describe('plugin pipeline output contexts', () => {
  it('passes user config options into write contexts', async () => {
    const tempDir = path.resolve('tmp/plugin-pipeline-frontmatter')
    fs.rmSync(tempDir, {recursive: true, force: true})
    fs.mkdirSync(tempDir, {recursive: true})

    const outputPath = path.join(tempDir, 'frontmatter.txt')
    let seenBlankLineAfter: boolean | undefined

    const plugin: OutputPlugin = {
      type: PluginKind.Output,
      name: 'CaptureOutputPlugin',
      log: createLogger('CaptureOutputPlugin', 'error'),
      declarativeOutput: true,
      outputCapabilities: {},
      async declareOutputFiles(ctx) {
        seenBlankLineAfter = ctx.pluginOptions?.frontMatter?.blankLineAfter
        return [{path: outputPath, source: 'capture'}]
      },
      async convertContent(_declaration, ctx) {
        return String(ctx.pluginOptions?.frontMatter?.blankLineAfter)
      }
    }

    const config: PipelineConfig = {
      context: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: tempDir,
            getDirectoryName: () => path.basename(tempDir)
          },
          projects: []
        }
      },
      outputPlugins: [plugin],
      userConfigOptions: mergeConfig({
        workspaceDir: tempDir,
        frontMatter: {
          blankLineAfter: false
        }
      })
    }

    const result = await new PluginPipeline('node', 'tnmsc').run(config)

    expect(result.success).toBe(true)
    expect(seenBlankLineAfter).toBe(false)
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('false')
  })
})
