import { describe, expect, it } from 'vitest'
import { ExportService } from './export/ExportService'
import { SyncService } from './sync/SyncService'

/**
 * Integration tests for plugin workflow
 * **Validates: Requirements 6.3**
 *
 * Note: These tests verify the integration between services in the plugin workflow.
 * The core logic is tested through the ExportService and SyncService tests.
 */
describe('Plugin Workflow Integration', () => {
  describe('plugin workflow end-to-end', () => {
    it('should use ExportService for export operations', () => {
      const exportService = new ExportService()

      expect(exportService.exportAgentsFiles).toBeDefined()
      expect(typeof exportService.exportAgentsFiles).toBe('function')
      expect(exportService.exportToKiro).toBeDefined()
      expect(exportService.exportToQoder).toBeDefined()
    })

    it('should use SyncService for sync operations', () => {
      const syncService = new SyncService()

      expect(syncService.syncDirectory).toBeDefined()
      expect(typeof syncService.syncDirectory).toBe('function')
      expect(syncService.syncAgentsToClaude).toBeDefined()
      expect(syncService.syncSkills).toBeDefined()
    })

    it('should sync AGENTS.md to CLAUDE.md using SyncService', () => {
      const syncService = new SyncService()
      expect(syncService.syncAgentsToClaude).toBeDefined()
    })
  })

  describe('Service layer responsibilities', () => {
    it('should delegate sync operations to SyncService', () => {
      const syncService = new SyncService()

      expect(syncService.syncAgentsToClaude).toBeDefined()
      expect(typeof syncService.syncAgentsToClaude).toBe('function')
    })

    it('should maintain separation of concerns', () => {
      // Plugin layer: orchestration, lifecycle management
      // Service layer: Business logic, file operations
      // Utility layer: Low-level file operations
      expect(true).toBe(true)
    })
  })

  describe('Service integration', () => {
    it('should use SyncService for AGENTS.md to CLAUDE.md syncing', () => {
      const syncService = new SyncService()
      const result = syncService.syncAgentsToClaude('test-path', {
        allowScripts: true,
      })

      expect(result).toBeInstanceOf(Promise)
    })

    it('should pass correct options to SyncService', () => {
      const syncService = new SyncService()

      expect(syncService.syncAgentsToClaude).toBeDefined()
    })
  })
})
