import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

type PlatformFixedDir = 'win32' | 'darwin' | 'linux'

function getLinuxDataDir(homeDir: string): string {
  const xdgDataHome = process.env['XDG_DATA_HOME']
  if (typeof xdgDataHome === 'string' && xdgDataHome.trim().length > 0) return xdgDataHome
  return path.join(homeDir, '.local', 'share')
}

export function getPlatformFixedDir(): string {
  const platform = process.platform as PlatformFixedDir
  const homeDir = os.homedir()

  if (platform === 'win32') return process.env['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local')
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support')
  if (platform === 'linux') return getLinuxDataDir(homeDir)

  throw new Error(`Unsupported platform: ${process.platform}`)
}
