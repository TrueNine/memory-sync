import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {buildFileOperationDiagnostic} from './diagnostics'

describe('buildFileOperationDiagnostic', () => {
  it('emits Windows-specific cleanup guidance for EPERM directory deletions', () => {
    const diagnostic = buildFileOperationDiagnostic({
      code: 'CLEANUP_DIRECTORY_DELETE_FAILED',
      title: 'Cleanup could not delete a directory',
      operation: 'delete',
      targetKind: 'directory',
      path: 'C:\\workspace\\.opencode\\skills',
      error: 'EPERM, Permission denied: \\\\?\\C:\\workspace\\.opencode\\skills',
      platform: 'win32'
    })

    expect(diagnostic.exactFix).toEqual([
      'Close any process that is using "C:\\workspace\\.opencode\\skills", delete the stale directory, and rerun tnmsc.',
      'Common lockers on Windows include editors, terminals, antivirus scanners, sync clients, and AI tools watching generated files.'
    ])
    expect(diagnostic.possibleFixes).toEqual([
      ['Use Resource Monitor or Process Explorer to find which process holds a handle under "C:\\workspace\\.opencode\\skills".'],
      ['Make sure no shell, editor tab, or file watcher is currently opened inside "C:\\workspace\\.opencode\\skills" or one of its children.'],
      ['If antivirus or cloud sync is scanning generated outputs, wait for it to release the directory or exclude this output path.']
    ])
    expect(diagnostic.details).toMatchObject({
      platform: 'win32',
      errorMessage: 'EPERM, Permission denied: \\\\?\\C:\\workspace\\.opencode\\skills'
    })
  })

  it('keeps generic guidance for non-Windows or non-permission errors', () => {
    const diagnostic = buildFileOperationDiagnostic({
      code: 'OUTPUT_FILE_WRITE_FAILED',
      title: 'Failed to write output',
      operation: 'write',
      targetKind: 'file',
      path: '/tmp/output.md',
      error: 'ENOENT: no such file or directory',
      platform: 'linux'
    })

    expect(diagnostic.exactFix).toEqual([
      'Verify that "/tmp/output.md" exists, has the expected type, and is accessible to tnmsc.'
    ])
    expect(diagnostic.possibleFixes).toEqual([
      ['Check file permissions and ownership for the target path.'],
      ['Confirm that another process did not delete, move, or lock the target path.']
    ])
    expect(diagnostic.details).toMatchObject({
      platform: 'linux',
      errorMessage: 'ENOENT: no such file or directory'
    })
  })

  it('explains that a blocking file can be safely deleted when a directory path is occupied', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-diagnostic-blocking-file-'))
    const blockingFilePath = path.join(tempDir, '.codex')
    fs.writeFileSync(blockingFilePath, '', 'utf8')

    try {
      const diagnostic = buildFileOperationDiagnostic({
        code: 'CLEANUP_DIRECTORY_DELETE_FAILED',
        title: 'Cleanup could not delete a directory',
        operation: 'delete',
        targetKind: 'directory',
        path: path.join(tempDir, '.codex', 'skills'),
        error: 'Not a directory (os error 20)',
        platform: 'linux'
      })

      expect(diagnostic.exactFix).toEqual([
        `Delete the blocking file at "${blockingFilePath}" and rerun tnmsc.`,
        'tnmsc expects a directory there, so you do not need to keep that file.'
      ])
      expect(diagnostic.details).toMatchObject({
        blockingPath: blockingFilePath
      })
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
