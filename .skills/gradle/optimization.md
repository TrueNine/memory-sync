## Build Optimization Specification

Optimise Gradle build performance to reduce developer wait time.

### Recommended gradle.properties

Reference: [references/gradle.properties](references/gradle.properties)

### Configuration Cache

Gradle 9 promotes Configuration Cache as the recommended execution mode. It caches configuration phase results so subsequent builds reuse them directly, skipping redundant configuration parsing.

**Compatibility Handling**:
- Incompatible plugins use `notCompatibleWithConfigurationCache()` to declare graceful degradation
- Gradle 9 core plugins are fully compatible
- Check compatibility: `./gradlew help --configuration-cache`

**Configuration Cache Encryption** (Gradle 8.1+):
- Enabled by default with auto-generated machine-level keys
- Prevents accidental exposure of sensitive data in the cache

### Build Cache

Local cache is enabled by default (see [references/gradle.properties](references/gradle.properties)).

Remote cache (CI/CD environments) reference: [scripts/remote-build-cache.settings.gradle.kts](scripts/remote-build-cache.settings.gradle.kts)

### kapt → KSP Migration

KSP is 2–3× faster than kapt; kapt is **PROHIBITED** in new projects.

Reference: [scripts/kapt-to-ksp.build.gradle.kts](scripts/kapt-to-ksp.build.gradle.kts)

Common KSP-supported libraries: Dagger/Hilt, Room, Moshi, Koin Annotations, KotlinX Serialization.

### Dependency Configuration Optimization

Default to `implementation` (changes don't propagate, reducing recompilation scope); only use `api` when downstream modules need direct access to that type.

Reference: [scripts/api-vs-implementation.build.gradle.kts](scripts/api-vs-implementation.build.gradle.kts)

### Diagnostic Commands

| Command | Purpose |
|------|------|
| `./gradlew build --scan` | Generate Build Scan analysis report |
| `./gradlew build --profile` | Local HTML performance report |
| `./gradlew help --configuration-cache` | Check Configuration Cache compatibility |
| `./gradlew dependencies` | View dependency tree |
| `./gradlew buildEnvironment` | View build environment |
| `./gradlew :module:dependencies --configuration runtimeClasspath` | Dependency tree for a specific module |

### Optimization Effect Reference

| Optimization | Expected Gain |
|--------|----------|
| Parallel builds | 30–50% speedup for multi-module builds |
| Build Cache | 50–90% speedup for incremental builds |
| Configuration Cache | 80%+ speedup for configuration phase, higher task parallelism |
| kapt → KSP | 2–3× faster annotation processing |
| Modularisation + `implementation` | Incremental builds only compile changed modules and direct downstream |
| Kotlin Classpath Snapshot | More precise incremental compilation, fewer unnecessary recompilations |
