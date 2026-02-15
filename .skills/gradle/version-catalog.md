## Version Catalog Specification

Version Catalog centrally manages all dependency versions via `gradle/libs.versions.toml`, serving as the single source of truth for project dependencies.

### File Location

```
project-root/
└── gradle/
    └── libs.versions.toml
```

### File Structure

Reference: [references/libs.versions.toml](references/libs.versions.toml)

### Four Sections

| Section | Purpose | Reference |
|------|------|----------|
| `[versions]` | Version variables | `version.ref = "name"` |
| `[libraries]` | Dependency coordinates | `libs.library.name` |
| `[bundles]` | Dependency groups | `libs.bundles.name` |
| `[plugins]` | Plugin declarations | `alias(libs.plugins.name)` |

### Naming Conventions

**versions**:
- kebab-case, dots converted to hyphens
- Use full group prefix: `org-jetbrains-kotlin`, `io-ktor`, `com-google-devtools-ksp`

**libraries**:
- kebab-case, dots converted to hyphens
- Use full group + artifact: `org-jetbrains-kotlinx-coroutines-core`

**bundles**:
- Group by group + functionality: `io-ktor-server`, `org-junit-testing`

**plugins**:
- Match plugin id, dots converted to hyphens: `org-jetbrains-kotlin-jvm`

### Usage Example

Reference: [scripts/build.gradle.kts](scripts/build.gradle.kts)

### BOM Support

BOM (Bill of Materials) aligns versions of related dependencies. The BOM itself declares `version.ref`; libraries it manages omit the version.

TOML declaration reference: see `io-ktor-bom` related entries in [references/libs.versions.toml](references/libs.versions.toml).

Usage reference: [scripts/bom-usage.build.gradle.kts](scripts/bom-usage.build.gradle.kts)

### Version Catalog in build-logic

`build-logic` must explicitly import the root project's catalog in its `settings.gradle.kts`; Convention Plugins can then use `libs.*` directly.

Reference: [scripts/build-logic.settings.gradle.kts](scripts/build-logic.settings.gradle.kts)

### Reverse-Derive java-platform (BOM) from Version Catalog

When a project needs to publish a unified BOM, use `VersionCatalogsExtension` to automatically iterate all libraries in `libs.versions.toml` and add them as `api` constraints for the `java-platform`. No manual per-entry declaration needed — the BOM auto-syncs when new dependencies are added to the Version Catalog.

Reference: [scripts/bom-from-catalog.build.gradle.kts](scripts/bom-from-catalog.build.gradle.kts)

**Key Points**:
- `VersionCatalogsExtension` is available once the catalog is registered in `settings.gradle.kts`
- `findLibrary()` returns `Optional`; use `kotlin.jvm.optionals.getOrNull` for safe unwrapping
- Libraries managed by a BOM (those without `version.ref`) are skipped, preventing versionless constraints
- Suited for monorepo scenarios publishing unified dependency versions

### Prohibited Behaviours

| Behaviour | Correct Approach |
|------|----------|
| `implementation("group:artifact:1.0.0")` hardcoded | `implementation(libs.group.artifact)` |
| Defining versions in `build.gradle.kts` | Move to `libs.versions.toml` |
| Duplicate version declarations | Use `version.ref` references |
| Abbreviated keys like `kotlin` | Use full form like `org-jetbrains-kotlin` |
| Adding `version.ref` to BOM-managed deps | Omit version; let BOM manage it |
