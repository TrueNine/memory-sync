/**
 * Project Color Generator
 * Generates consistent hash-based colors for different projects
 */

interface ProjectColorConfig {
  titleBar: {
    activeBackground: string
    activeForeground: string
    inactiveBackground: string
    inactiveForeground: string
    border: string
  }
  borders: {
    editorGroupBorder: string
    focusBorder: string
    tabActiveBorder: string
    tabActiveBorderTop: string
    editorGroupHeaderTabsBorder: string
    panelBorder: string
    sideBarBorder: string
    editorLineHighlightBorder: string
    activityBarActiveBorder: string
  }
  backgrounds: {
    editorBackground: string
    sideBarBackground: string
    activityBarBackground: string
    panelBackground: string
    editorGutterBackground: string
    statusBarBackground: string
    statusBarForeground: string
    editorGroupHeaderTabsBackground: string
    tabInactiveBackground: string
  }
}

/**
 * Generate a hash from a string
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * Convert a hash number to an HSL color
 */
function hashToHSL(hash: number): { h: number, s: number, l: number } {
  const hue = hash % 360
  const saturation = 60 + (hash % 20)
  const lightness = 45 + (hash % 15)

  return { h: hue, s: saturation, l: lightness }
}

/**
 * Convert HSL to HEX color
 */
function hslToHex(h: number, s: number, l: number): string {
  const sDecimal = s / 100
  const lDecimal = l / 100

  const c = (1 - Math.abs(2 * lDecimal - 1)) * sDecimal
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lDecimal - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (h >= 0 && h < 60) {
    r = c
    g = x
    b = 0
  } else if (h >= 60 && h < 120) {
    r = x
    g = c
    b = 0
  } else if (h >= 120 && h < 180) {
    r = 0
    g = c
    b = x
  } else if (h >= 180 && h < 240) {
    r = 0
    g = x
    b = c
  } else if (h >= 240 && h < 300) {
    r = x
    g = 0
    b = c
  } else if (h >= 300 && h < 360) {
    r = c
    g = 0
    b = x
  }

  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0')
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0')
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0')

  return `#${rHex}${gHex}${bHex}`
}

/**
 * Adjust lightness of an HSL color
 */
function adjustLightness(h: number, s: number, l: number, delta: number): string {
  const newL = Math.max(0, Math.min(100, l + delta))
  return hslToHex(h, s, newL)
}

/**
 * Generate project color configuration based on project name
 * Special case: aindex gets purple color
 */
export function generateProjectColor(projectName: string): ProjectColorConfig {
  const isAindex = projectName === 'aindex'

  if (isAindex) {
    return {
      titleBar: {
        activeBackground: '#9333ea',
        activeForeground: '#ffffff',
        inactiveBackground: '#7c3aed',
        inactiveForeground: '#e9d5ff',
        border: '#9333ea',
      },
      borders: {
        editorGroupBorder: '#9333ea',
        focusBorder: '#9333ea',
        tabActiveBorder: '#9333ea',
        tabActiveBorderTop: '#9333ea',
        editorGroupHeaderTabsBorder: '#9333ea',
        panelBorder: '#9333ea',
        sideBarBorder: '#9333ea',
        editorLineHighlightBorder: '#9333ea',
        activityBarActiveBorder: '#9333ea',
      },
      backgrounds: {
        editorBackground: '#1a0b2e',
        sideBarBackground: '#1a0b2e',
        activityBarBackground: '#1a0b2e',
        panelBackground: '#1a0b2e',
        editorGutterBackground: '#1a0b2e',
        statusBarBackground: '#9333ea',
        statusBarForeground: '#ffffff',
        editorGroupHeaderTabsBackground: '#1a0b2e',
        tabInactiveBackground: '#1a0b2e',
      },
    }
  }

  const hash = hashString(projectName)
  const { h, s, l } = hashToHSL(hash)

  const mainColor = hslToHex(h, s, l)
  const lighterColor = adjustLightness(h, s, l, -8)
  const lightestColor = adjustLightness(h, s, l, 35)
  const darkBackground = adjustLightness(h, s, l, -35)

  return {
    titleBar: {
      activeBackground: mainColor,
      activeForeground: '#ffffff',
      inactiveBackground: lighterColor,
      inactiveForeground: lightestColor,
      border: mainColor,
    },
    borders: {
      editorGroupBorder: mainColor,
      focusBorder: mainColor,
      tabActiveBorder: mainColor,
      tabActiveBorderTop: mainColor,
      editorGroupHeaderTabsBorder: mainColor,
      panelBorder: mainColor,
      sideBarBorder: mainColor,
      editorLineHighlightBorder: mainColor,
      activityBarActiveBorder: mainColor,
    },
    backgrounds: {
      editorBackground: darkBackground,
      sideBarBackground: darkBackground,
      activityBarBackground: darkBackground,
      panelBackground: darkBackground,
      editorGutterBackground: darkBackground,
      statusBarBackground: mainColor,
      statusBarForeground: '#ffffff',
      editorGroupHeaderTabsBackground: darkBackground,
      tabInactiveBackground: darkBackground,
    },
  }
}

/**
 * Generate VSCode settings.json color customization section
 */
export function generateVSCodeColorCustomizations(projectName: string): Record<string, string> {
  const config = generateProjectColor(projectName)

  return {
    'titleBar.activeBackground': `${config.titleBar.activeBackground}1a`,
    'titleBar.activeForeground': `${config.titleBar.activeForeground}`,
    'titleBar.inactiveBackground': `${config.titleBar.inactiveBackground}1a`,
    'titleBar.inactiveForeground': `${config.titleBar.inactiveForeground}`,
    'titleBar.border': `${config.titleBar.border}1a`,
  }
}
