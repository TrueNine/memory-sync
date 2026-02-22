import {createRequire} from 'node:module'
import process from 'node:process'

export interface RuntimeBundleItem {
  readonly path: string
  readonly content: string
}

export type RuntimeBundles = Readonly<Record<string, RuntimeBundleItem>>

interface NapiInitBundleModule {
  getBundles: () => RuntimeBundleItem[]
  getDefaultConfigContentStr: () => string
  getBundleByPath: (path: string) => RuntimeBundleItem | null
}

let napiBinding: NapiInitBundleModule | null = null

try {
  const _require = createRequire(import.meta.url)
  const {platform, arch} = process
  const platforms: Record<string, [local: string, suffix: string]> = {
    'win32-x64': ['napi-init-bundle.win32-x64-msvc', 'win32-x64-msvc'],
    'linux-x64': ['napi-init-bundle.linux-x64-gnu', 'linux-x64-gnu'],
    'linux-arm64': ['napi-init-bundle.linux-arm64-gnu', 'linux-arm64-gnu'],
    'darwin-arm64': ['napi-init-bundle.darwin-arm64', 'darwin-arm64'],
    'darwin-x64': ['napi-init-bundle.darwin-x64', 'darwin-x64']
  }
  const entry = platforms[`${platform}-${arch}`]
  if (entry != null) {
    const [local, suffix] = entry
    try {
      napiBinding = _require(`./${local}.node`) as NapiInitBundleModule
    }
    catch {
      try {
        const pkg = _require(`@truenine/memory-sync-cli-${suffix}`) as Record<string, unknown>
        napiBinding = pkg['initBundle'] as NapiInitBundleModule
      }
      catch {}
    }
  }
}
catch {} // Native module not available — no pure-TS fallback for init-bundle

if (napiBinding == null && process.env['__TNMSC_INIT_BUNDLE_WARNED__'] == null) {
  process.env['__TNMSC_INIT_BUNDLE_WARNED__'] = '1'
  console.warn('[tnmsc:init-bundle] Native module not available — init templates will be empty. Install the platform-specific package for your OS to enable embedded file templates.')
}

function buildBundlesMap(): RuntimeBundles {
  if (napiBinding == null) return {}
  const items = napiBinding.getBundles()
  return Object.fromEntries(items.map(item => [item.path, item]))
}

export const bundles: RuntimeBundles = buildBundlesMap()

export function getDefaultConfigContent(): string {
  if (napiBinding == null) return '{}'
  return napiBinding.getDefaultConfigContentStr()
}

export function getBundleByPath(path: string): RuntimeBundleItem | null {
  if (napiBinding == null) return null
  return napiBinding.getBundleByPath(path)
}
