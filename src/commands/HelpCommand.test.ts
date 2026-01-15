import {describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {HelpCommand} from './HelpCommand'

const mockLogger = createLogger('test', 'error')

describe('helpCommand', () => {
  describe('help text content', () => {
    /**
     * Feature: cli-refactor, Requirements 8.1-8.4
     * Validates that help text contains all required information
     */
    it('should list all subcommands', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })

      const command = new HelpCommand()
      await command.execute({logger: mockLogger} as any)

      const helpText = consoleSpy.mock.calls[0][0] as string

      expect(helpText).toContain('help') // Verify all subcommands are listed (Requirements 8.1)
      expect(helpText).toContain('init')
      expect(helpText).toContain('dry-run')
      expect(helpText).toContain('clean')

      consoleSpy.mockRestore()
    })

    it('should list all log level options', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })

      const command = new HelpCommand()
      await command.execute({logger: mockLogger} as any)

      const helpText = consoleSpy.mock.calls[0][0] as string

      expect(helpText).toContain('--trace') // Verify all log level options are listed (Requirements 8.2)
      expect(helpText).toContain('--debug')
      expect(helpText).toContain('--info')
      expect(helpText).toContain('--warn')
      expect(helpText).toContain('--error')

      consoleSpy.mockRestore()
    })

    it('should show clean dry-run options', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })

      const command = new HelpCommand()
      await command.execute({logger: mockLogger} as any)

      const helpText = consoleSpy.mock.calls[0][0] as string

      expect(helpText).toContain('-n') // Verify clean options are shown (Requirements 8.3)
      expect(helpText).toContain('--dry-run')
      expect(helpText).toContain('clean --dry-run')

      consoleSpy.mockRestore()
    })

    it('should include usage examples', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })

      const command = new HelpCommand()
      await command.execute({logger: mockLogger} as any)

      const helpText = consoleSpy.mock.calls[0][0] as string

      expect(helpText).toContain('USAGE:') // Verify examples are included (Requirements 8.4)
      expect(helpText).toContain('tnmsc help')
      expect(helpText).toContain('tnmsc init')
      expect(helpText).toContain('tnmsc dry-run')
      expect(helpText).toContain('tnmsc clean')

      consoleSpy.mockRestore()
    })

    it('should return success result', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })

      const command = new HelpCommand()
      const result = await command.execute({logger: mockLogger} as any)

      expect(result.success).toBe(true)
      expect(result.filesAffected).toBe(0)
      expect(result.dirsAffected).toBe(0)

      consoleSpy.mockRestore()
    })
  })
})
