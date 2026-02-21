import {
  SKILL_RESOURCE_BINARY_EXTENSIONS,
  SKILL_RESOURCE_TEXT_EXTENSIONS
} from '@truenine/plugin-shared'
import {describe, expect, it} from 'vitest'
import {
  getMimeType,
  getResourceCategory,
  isBinaryResourceExtension
} from './ResourceUtils'

describe('isBinaryResourceExtension', () => {
  it('should return true for binary extensions', () => {
    const binaryExtensions = ['.docx', '.pdf', '.png', '.jpg', '.zip', '.exe']
    for (const ext of binaryExtensions) expect(isBinaryResourceExtension(ext)).toBe(true)
  })

  it('should return false for text extensions', () => {
    const textExtensions = ['.kt', '.java', '.py', '.ts', '.txt']
    for (const ext of textExtensions) expect(isBinaryResourceExtension(ext)).toBe(false)
  })

  it('should be case-insensitive', () => {
    expect(isBinaryResourceExtension('.PNG')).toBe(true)
    expect(isBinaryResourceExtension('.Docx')).toBe(true)
  })
})

describe('getResourceCategory', () => {
  it('should categorize image files', () => {
    expect(getResourceCategory('.png')).toBe('image')
    expect(getResourceCategory('.jpg')).toBe('image')
    expect(getResourceCategory('.gif')).toBe('image')
    expect(getResourceCategory('.svg')).toBe('image')
    expect(getResourceCategory('.webp')).toBe('image')
  })

  it('should categorize code files', () => {
    expect(getResourceCategory('.kt')).toBe('code')
    expect(getResourceCategory('.java')).toBe('code')
    expect(getResourceCategory('.py')).toBe('code')
    expect(getResourceCategory('.ts')).toBe('code')
    expect(getResourceCategory('.go')).toBe('code')
    expect(getResourceCategory('.rs')).toBe('code')
  })

  it('should categorize data files', () => {
    expect(getResourceCategory('.sql')).toBe('data')
    expect(getResourceCategory('.json')).toBe('data')
    expect(getResourceCategory('.xml')).toBe('data')
    expect(getResourceCategory('.yaml')).toBe('data')
    expect(getResourceCategory('.csv')).toBe('data')
  })

  it('should categorize document files', () => {
    expect(getResourceCategory('.txt')).toBe('document')
    expect(getResourceCategory('.docx')).toBe('document')
    expect(getResourceCategory('.pdf')).toBe('document')
  })

  it('should categorize config files', () => {
    expect(getResourceCategory('.ini')).toBe('config')
    expect(getResourceCategory('.conf')).toBe('config')
    expect(getResourceCategory('.env')).toBe('config')
    expect(getResourceCategory('.gitignore')).toBe('config')
  })

  it('should categorize script files', () => {
    expect(getResourceCategory('.sh')).toBe('script')
    expect(getResourceCategory('.bash')).toBe('script')
    expect(getResourceCategory('.ps1')).toBe('script')
    expect(getResourceCategory('.bat')).toBe('script')
  })

  it('should categorize binary files', () => {
    expect(getResourceCategory('.exe')).toBe('binary')
    expect(getResourceCategory('.dll')).toBe('binary')
    expect(getResourceCategory('.wasm')).toBe('binary')
    expect(getResourceCategory('.zip')).toBe('binary')
  })

  it('should return other for unknown extensions', () => {
    expect(getResourceCategory('.xyz')).toBe('other')
    expect(getResourceCategory('.unknown')).toBe('other')
  })
})

describe('getMimeType', () => {
  it('should return correct MIME types for known extensions', () => {
    expect(getMimeType('.ts')).toBe('text/typescript')
    expect(getMimeType('.js')).toBe('text/javascript')
    expect(getMimeType('.json')).toBe('application/json')
    expect(getMimeType('.py')).toBe('text/x-python')
    expect(getMimeType('.pdf')).toBe('application/pdf')
    expect(getMimeType('.png')).toBe('image/png')
    expect(getMimeType('.svg')).toBe('image/svg+xml')
  })

  it('should return undefined for unknown extensions', () => {
    expect(getMimeType('.xyz')).toBeUndefined()
    expect(getMimeType('.unknown')).toBeUndefined()
  })
})

describe('sKILL_RESOURCE_TEXT_EXTENSIONS', () => {
  it('should include common code file extensions', () => {
    const codeExtensions = ['.kt', '.java', '.py', '.ts', '.js', '.go', '.rs', '.c', '.cpp']
    for (const ext of codeExtensions) expect(SKILL_RESOURCE_TEXT_EXTENSIONS).toContain(ext)
  })

  it('should include data file extensions', () => {
    const dataExtensions = ['.sql', '.json', '.xml', '.yaml', '.csv']
    for (const ext of dataExtensions) expect(SKILL_RESOURCE_TEXT_EXTENSIONS).toContain(ext)
  })
})

describe('sKILL_RESOURCE_BINARY_EXTENSIONS', () => {
  it('should include document file extensions', () => {
    const docExtensions = ['.docx', '.pdf', '.xlsx', '.pptx']
    for (const ext of docExtensions) expect(SKILL_RESOURCE_BINARY_EXTENSIONS).toContain(ext)
  })

  it('should include image file extensions', () => {
    const imageExtensions = ['.png', '.jpg', '.gif', '.webp']
    for (const ext of imageExtensions) expect(SKILL_RESOURCE_BINARY_EXTENSIONS).toContain(ext)
  })
})
