import type {CliIntegrationArtifacts} from './artifacts'
import type {PreparedCliIntegrationContainer} from './container'
import {describe} from 'vitest'
import {createPreparedCliIntegrationContainer} from './container'

export interface FixtureWithCleanup {
  readonly homeDir: string
  readonly workspaceDir: string
  cleanup: () => void
}

export const supportedHost = process.platform === 'linux' && process.arch === 'x64'
export const describeForHost = supportedHost ? describe : describe.skip

export function expectSuccess(exitCode: number): void {
  expect(exitCode).toBe(0)
}

export async function withPluginEnvironment(
  artifacts: CliIntegrationArtifacts,
  fixture: FixtureWithCleanup,
  run: (container: PreparedCliIntegrationContainer) => Promise<void>,
): Promise<void> {
  let container: PreparedCliIntegrationContainer | undefined

  try {
    container = await createPreparedCliIntegrationContainer(artifacts, fixture)
    await run(container)
  }
  finally {
    await container?.stop()
    fixture.cleanup()
  }
}

export function assertDistContent(
  output: string,
  expectedPresent: readonly string[],
  expectedAbsent: readonly string[],
): void {
  for (const content of expectedPresent) {
    expect(output).toContain(content)
  }
  for (const content of expectedAbsent) {
    expect(output).not.toContain(content)
  }
}

export function assertPathStates(
  container: PreparedCliIntegrationContainer,
  paths: readonly string[],
  expectedExists: boolean,
): void {
  for (const p of paths) {
    expect(container.pathExists(p)).toBe(expectedExists)
  }
}
