/**
 * VSCode Settings Manager
 * Handles reading and writing VSCode settings.json with color customizations
 */

import path from 'node:path'
import fs from 'fs-extra'
import { pathExists } from './fs'
import { generateVSCodeColorCustomizations } from './projectColors'

interface VSCodeSettings {
  [key: string]: unknown
  'workbench.colorCustomizations'?: Record<string, string>
}

/**
 * Read VSCode settings.json from a project directory
 */
export async function readVSCodeSettings(projectRoot: string): Promise<VSCodeSettings> {
  const settingsPath = path.join(projectRoot, '.vscode', 'settings.json')

  if (!(await pathExists(settingsPath))) {
    return {}
  }

  try {
    const content = await fs.readFile(settingsPath, 'utf-8')
    return JSON.parse(content) as VSCodeSettings
  } catch {
    return {}
  }
}

/**
 * Write VSCode settings.json to a project directory
 */
export async function writeVSCodeSettings(
  projectRoot: string,
  settings: VSCodeSettings,
): Promise<void> {
  const settingsPath = path.join(projectRoot, '.vscode', 'settings.json')
  await fs.ensureDir(path.dirname(settingsPath))
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

/**
 * Update VSCode color customizations based on project name
 */
export async function updateVSCodeColors(
  projectRoot: string,
  projectName: string,
): Promise<boolean> {
  try {
    const settings = await readVSCodeSettings(projectRoot)
    const colorCustomizations = generateVSCodeColorCustomizations(projectName)

    const existing = settings['workbench.colorCustomizations'] ?? {}
    settings['workbench.colorCustomizations'] = {
      ...existing,
      ...colorCustomizations,
    }

    await writeVSCodeSettings(projectRoot, settings)
    return true
  } catch {
    return false
  }
}
