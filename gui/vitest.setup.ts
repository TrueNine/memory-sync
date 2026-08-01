// Setup file for vitest - runs before all tests
// Mock Monaco-related modules to avoid DOM requirements in Node environment

import { vi } from 'vitest'

vi.mock('monaco-editor', () => ({
  languages: {
    register: () => {},
    setLanguageConfiguration: () => {},
  },
}))

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null,
  loader: {
    config: () => {},
  },
}))

vi.mock('monaco-editor/editor/editor.worker?worker', () => ({
  default: class MockWorker {},
}))

vi.mock('monaco-editor/language/json/json.worker?worker', () => ({
  default: class MockWorker {},
}))
