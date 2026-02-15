---
name: gradle
description: Gradle build system specification with Kotlin DSL as the de facto standard, covering Version Catalog, Convention Plugin, multi-module architecture and build optimisation. Activate when working with build.gradle.kts, settings.gradle.kts, libs.versions.toml, build-logic or multi-module project configuration.
displayName: Gradle Build
keywords:
  - gradle
  - kotlin-dsl
  - build
  - version-catalog
  - convention-plugin
  - multi-module
  - kts
author: TrueNine
version: 2026.02.08
---
Gradle is the mainstream build system in the JVM ecosystem. This Skill uses Kotlin DSL as the sole standard, built around three pillars: Version Catalog for centralised dependency management, Convention Plugin for reusable build logic, and multi-module layered architecture — ensuring type-safe, maintainable, high-performance build configurations.

## Core Constraints (Primacy)

**Kotlin DSL Only**:

- All build scripts **MUST** use the `.gradle.kts` suffix
- **PROHIBITED**: Groovy DSL (`.gradle`), unless maintaining a legacy project with no migration path

**Dependency Management**:

- Versions **MUST** be centrally managed in `gradle/libs.versions.toml`
- **PROHIBITED**: Hardcoding version numbers in `build.gradle.kts`
- Use BOM to align versions of related dependencies

**Build Logic Reuse**:

- **MUST** use Convention Plugins under the `build-logic/` directory
- **PROHIBITED**: `allprojects {}` and `subprojects {}` blocks
- **PROHIBITED**: `buildSrc/` (use `build-logic/` as an independent included build instead)

**Project Configuration**:

- **MUST** enable `TYPESAFE_PROJECT_ACCESSORS`
- **MUST** use the `foojay-resolver-convention` plugin to manage JDK Toolchain downloads
- **MUST** use the `modules-buddy` plugin for automatic module scanning; manual `include()` is prohibited
- **MUST** set `repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)`

**Performance**:

- **MUST** enable Configuration Cache (Gradle 9 promotes it as the recommended mode)
- **MUST** enable Build Cache and parallel builds
- Prefer KSP for annotation processing; **PROHIBITED**: kapt in new projects

**Version Strategy**:

- Gradle version **MUST** stay on the latest stable release (current mainline is 9.x)
- Kotlin version follows the Gradle compatibility matrix

**On-Demand References**:

| Document                                      | Purpose                                                   |
| :-------------------------------------------- | :-------------------------------------------------------- |
| [version-catalog.md](version-catalog.md)     | Version Catalog configuration spec and naming conventions |
| [convention-plugin.md](convention-plugin.md) | Convention Plugin authoring patterns and advanced usage   |
| [multi-module.md](multi-module.md)           | Multi-module project structure and dependency layering    |
| [optimization.md](optimization.md)           | Build performance optimisation strategies                 |

## Quick Reference

### File Responsibilities

| File                          | Purpose                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `settings.gradle.kts`         | Project settings, plugin repositories, module declarations, repository policy                                        |
| `build.gradle.kts`            | Module build config (plugins, dependencies, tasks)                                                                   |
| `gradle/libs.versions.toml`   | Dependency version catalog (single source of truth for versions)                                                     |
| `build-logic/`                | Convention Plugin as independent included build                                                                      |
| `gradle.properties`           | Project-level build properties (JVM args, cache toggles, etc.)                                                       |
| `~/.gradle/gradle.properties` | User-global config (proxy, Daemon, etc.; refer to [gradle.properties](references/global-gradle.properties) template) |

### root settings.gradle.kts

Reference: [settings.gradle.kts](scripts/settings.gradle.kts)

### build.gradle.kts

Reference: [build.gradle.kts](scripts/build.gradle.kts)

### Global Configuration (~/.gradle/gradle.properties)

[gradle.properties](references/global-gradle.properties) is a template for the user home `~/.gradle/gradle.properties`, covering proxy, cache, Daemon, JVM and other common items. Usage:

- **Override**: Copy the template to `~/.gradle/gradle.properties` and modify for your local environment
- **Reference**: Only refer to key names and purposes; enable as needed

## Prohibited Behaviours

| Behaviour                           | Reason                             | Correct Approach                                                                   |
| ----------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| Hardcoded version numbers           | Breaks centralised management      | `libs.versions.toml`                                                               |
| Groovy DSL                          | Lacks type safety                  | Kotlin DSL                                                                         |
| `allprojects`/`subprojects`         | Implicit config, hard to trace     | Convention Plugin                                                                  |
| `buildSrc/`                         | Changes trigger full recompilation | `build-logic/` included build                                                      |
| Manual `include()`                  | Error-prone, hard to maintain      | `modules-buddy` auto-scan                                                          |
| Disabling Configuration Cache       | Sacrifices build performance       | Keep enabled; use `notCompatibleWithConfigurationCache()` for incompatible plugins |
| `project(":path")` string reference | No compile-time checking           | `projects.path` type-safe reference                                                |
| kapt in new projects                | Poor performance, deprecated       | KSP                                                                                |

## Validation Checklist (Recency)

**MUST** verify after writing Gradle configuration:

- [ ] All scripts use `.gradle.kts` suffix
- [ ] Dependency versions defined in `libs.versions.toml`
- [ ] `TYPESAFE_PROJECT_ACCESSORS` enabled
- [ ] Shared config extracted into Convention Plugins
- [ ] Build Cache and Configuration Cache enabled
- [ ] Project references use `projects.*` type-safe accessors
- [ ] No `allprojects`/`subprojects`/`buildSrc` remnants