## Multi-Module Project Specification

Multi-module structure improves build speed (parallel compilation, incremental builds), supports team parallel development, and achieves separation of concerns.

### Recommended Structure

```
project-root/
├── settings.gradle.kts
├── build.gradle.kts              # Root project (typically empty or only group/version)
├── gradle/
│   └── libs.versions.toml
├── build-logic/                  # Convention Plugin
├── app/                          # Application entry point
│   └── build.gradle.kts
├── core/                         # Core modules
│   ├── common/
│   ├── data/
│   ├── domain/
│   └── network/
├── feature/                      # Feature modules
│   ├── auth/
│   ├── home/
│   └── settings/
└── shared/                       # Shared modules
    ├── ui/
    └── testing/
```

### modules-buddy Auto-Scan

Use the `modules-buddy` plugin to automatically scan directory structure and register modules; manual `include()` is **PROHIBITED**.

`modules-buddy` auto-scans subdirectories containing `build.gradle.kts` and registers them as modules. No manual module list maintenance needed — just create a directory with a `build.gradle.kts` to add a new module.

### Full settings.gradle.kts Configuration

Reference: [scripts/settings.gradle.kts](scripts/settings.gradle.kts)

### Module Dependency References

With `TYPESAFE_PROJECT_ACCESSORS` enabled, use type-safe project references.

Reference: [scripts/feature-module.build.gradle.kts](scripts/feature-module.build.gradle.kts)

### Module Layering Principles

| Layer | Module | Dependency Direction |
|------|------|----------|
| app | Application entry point | → feature |
| feature | Feature modules | → core |
| core | Core modules | → shared |
| shared | Shared modules | No external dependencies |

**Dependency Rules**:
- Upper layers may depend on lower layers; reverse dependencies are **PROHIBITED**
- Inter-module dependencies within the same layer are **PROHIBITED**
- Circular dependencies are **PROHIBITED** (Gradle will report an error)

### Module Responsibilities

| Module | Responsibility |
|------|------|
| `core/common` | Common utilities, extension functions, base types |
| `core/domain` | Business entities, use case interfaces (pure Kotlin, no framework deps) |
| `core/data` | Repository implementations, data source adapters |
| `core/network` | Network client, API definitions, serialisation config |
| `feature/*` | Independent feature units, composing core layer capabilities |
| `shared/ui` | Shared UI components |
| `shared/testing` | Test utilities, fixtures, mock configurations |

### api vs implementation

| Configuration | Compile-Time Visible | Runtime Visible | Use Case |
|------|:----------:|:----------:|----------|
| `api` | ✅ | ✅ | Types exposed in public API |
| `implementation` | ❌ | ✅ | Internal implementation (default choice) |

Reference: [scripts/api-vs-implementation.build.gradle.kts](scripts/api-vs-implementation.build.gradle.kts)

**Principle**: Default to `implementation`; only use `api` when downstream modules need direct access to that dependency's types.

### Module Granularity Decisions

| Signal | Action |
|------|------|
| Module has < 3 files | Consider merging into parent module |
| Module depended on by 3+ modules | Good candidate for a shared module |
| Module contains two clearly unrelated code groups | Consider splitting |
| Build time too long | Split to leverage parallel builds |

### Prohibited Behaviours

| Behaviour | Correct Approach |
|------|----------|
| `project(":module")` string reference | `projects.module` type-safe reference |
| Feature modules depending on each other | Extract shared logic to core/shared |
| Circular dependencies | Redesign module boundaries |
| Using `api` for all dependencies | Default to `implementation` |
| Manual `include()` | `modules-buddy` auto-scan |
