import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * Represents a fixed set of platform directory identifiers.
 *
 * `PlatformFixedDir` is a type that specifies platform-specific values.
 * These values correspond to common operating system platforms and are
 * used to identify directory structures or configurations unique to those systems.
 *
 * Valid values include:
 * - 'win32': Represents the Windows operating system.
 * - 'darwin': Represents the macOS operating system.
 * - 'linux': Represents the Linux operating system.
 *
 * This type is typically used in contexts where platform-dependent logic
 * or directory configurations are required.
 */
type PlatformFixedDir = 'win32' | 'darwin' | 'linux'

/**
 * Determines the Linux data directory based on the XDG_DATA_HOME environment
 * variable or defaults to a directory under the user's home directory.
 *
 * @param {string} homeDir - The home directory path of the current user.
 * @return {string} The resolved path to the Linux data directory.
 */
function getLinuxDataDir(homeDir: string): string {
  const xdgDataHome = process.env['XDG_DATA_HOME']
  if (typeof xdgDataHome === 'string' && xdgDataHome.trim().length > 0) return xdgDataHome
  return path.join(homeDir, '.local', 'share')
}

/**
 * Determines and returns the platform-specific directory for storing application data.
 * The directory path is resolved based on the underlying operating system.
 *
 * @return {string} The resolved directory path specific to the current platform.
 * @throws {Error} If the platform is unsupported.
 */
export function getPlatformFixedDir(): string {
  const platform = process.platform as PlatformFixedDir
  const homeDir = os.homedir()

  if (platform === 'win32') return process.env['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local')
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support')
  if (platform === 'linux') return getLinuxDataDir(homeDir)

  throw new Error(`Unsupported platform: ${process.platform}`)
}
