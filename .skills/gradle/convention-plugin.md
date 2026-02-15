## Convention Plugin Specification

Convention Plugins encapsulate reusable build logic, replacing `allprojects`/`subprojects` blocks. Using `build-logic/` as an independent included build avoids triggering full recompilation — the core drawback of `buildSrc`.

### Directory Structure

```
project-root/
├── build-logic/
│   ├── settings.gradle.kts       # Independent settings, references root project Version Catalog
│   ├── build.gradle.kts           # kotlin-dsl plugin + plugin dependencies
│   └── src/main/kotlin/
│       ├── kotlin-library.gradle.kts
│       ├── kotlin-application.gradle.kts
│       └── spring-boot-library.gradle.kts
├── settings.gradle.kts            # includeBuild("build-logic")
├── gradle/libs.versions.toml
├── app/
└── core/
```

### build-logic/settings.gradle.kts

Reference: [scripts/build-logic.settings.gradle.kts](scripts/build-logic.settings.gradle.kts)

### build-logic/build.gradle.kts

Reference: [scripts/build-logic.build.gradle.kts](scripts/build-logic.build.gradle.kts)

> `libs.versions.toml` must declare corresponding library entries pointing to the plugin's Maven coordinates (e.g. `org.jetbrains.kotlin:kotlin-gradle-plugin`).

### Writing Convention Plugins

Basic pattern — single responsibility: [scripts/kotlin-library.gradle.kts](scripts/kotlin-library.gradle.kts)

Composition pattern — plugin stacking: [scripts/kotlin-spring-library.gradle.kts](scripts/kotlin-spring-library.gradle.kts)

With shared dependencies — unified test framework: [scripts/testing-conventions.gradle.kts](scripts/testing-conventions.gradle.kts)

### Root Project Integration

The root `settings.gradle.kts` includes build-logic via `pluginManagement { includeBuild("build-logic") }`.

Reference: [scripts/settings.gradle.kts](scripts/settings.gradle.kts)

### Submodule Usage

Application module reference: [scripts/app.build.gradle.kts](scripts/app.build.gradle.kts)

Library modules only need `plugins { id("kotlin-library") }`; see [scripts/build.gradle.kts](scripts/build.gradle.kts).

### Common Convention Plugins

| Plugin ID | Purpose | Typical Content |
|-----------|------|----------|
| `kotlin-library` | Kotlin library module | JVM toolchain + JUnit |
| `kotlin-application` | Kotlin application module | library + application plugin |
| `kotlin-spring-library` | Spring Boot library | library + spring + serialization |
| `kotlin-multiplatform-library` | KMP library module | multiplatform targets |
| `testing-conventions` | Unified test config | JUnit BOM + useJUnitPlatform |
| `publishing-conventions` | Maven publishing | maven-publish + signing |

### Version Catalog in Convention Plugins

`build-logic`'s `settings.gradle.kts` imports `libs` via `versionCatalogs` (see [scripts/build-logic.settings.gradle.kts](scripts/build-logic.settings.gradle.kts)), so `.gradle.kts` scripts can use `libs.*` directly.

### Prohibited Behaviours

| Behaviour | Correct Approach |
|------|----------|
| `allprojects { }` | Convention Plugin |
| `subprojects { }` | Convention Plugin |
| Repeating `kotlin { jvmToolchain() }` in every module | Unified config via Convention Plugin |
| `buildSrc/` | `build-logic/` included build |
| Hardcoding versions in Convention Plugins | Reference Version Catalog |
