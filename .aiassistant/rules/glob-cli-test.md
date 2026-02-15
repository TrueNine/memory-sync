---
apply: 按文件模式
模式: cli/test/**
---
Test suite for the core CLI package, covering unit tests, property tests, and integration tests.

**Type**
Test Suite

**Test Types**

| Type             | Naming                  | Description                                           |
| ---------------- | ----------------------- | ----------------------------------------------------- |
| Unit Test        | `*.test.ts`             | Single function/class behavior, isolated dependencies |
| Property Test    | `*.property.test.ts`    | fast-check generative tests, verify invariants        |
| Integration Test | `*.integration.test.ts` | Plugin collaboration, complete pipeline flow          |

**Conventions**

- File names correspond to tested files (e.g., `ConfigLoader.test.ts`)
- Assertions use Vitest built-ins (`expect`, `toBe`, `toEqual`, `toThrow`)
- Mocks: `vi.mock()` for external dependencies, `vi.spyOn()` to monitor calls, `vi.clearAllMocks()` after tests
- Fixtures stored in `test/fixtures/`, clean up temporary files after tests
- Coverage targets: Core logic > 80%, plugins > 70%, utility functions > 90%

**Commands**

- Run: `pnpm -F memory-sync test`
- Coverage: `pnpm -F memory-sync test --coverage`
- Turbo: `turbo run test`

**Constraints**

- Tests run independently, no execution order dependencies
- Don't modify global state, use `beforeEach`/`afterEach` for cleanup
- Integration tests use temporary directories
- Property tests limit generated data size to avoid timeouts