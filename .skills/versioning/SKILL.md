---
name: versioning
description: Version number convention using CalVer YYYY.1MMDD.1HH three-segment format. Activate when user requests version updates, releases, or discusses versioning strategy.
displayName: Versioning Convention
keywords:
  - version
  - versioning
  - release
  - tag
  - calver
  - date-version
  - timestamp
  - package.json
  - pom.xml
  - cargo.toml
  - pyproject.toml
author: TrueNine
version: 2025.11227.114
---
## Core Constraints (Primacy)

This convention defines a date-time based three-segment version format, a **CalVer** (Calendar Versioning) variant.

**Format**: `YYYY.1MMDD.1HH[mm[ss]]`

| Segment | Meaning         | Format                                                    |
| :------ | :-------------- | :-------------------------------------------------------- |
| YYYY    | Year            | 4 digits, mandatory                                       |
| 0       | Annual version  | Second segment `0` indicates year/project initial release |
| 1MM     | Monthly version | Prefix `1` + MM (01-12), 3 digits total                   |
| 1MMDD   | Date version    | Prefix `1` + MM + DD (01-31), 5 digits total              |
| 1HH     | Hour            | Prefix `1` + HH (00-23), 3 digits total                   |
| 1HHmm   | Minute          | Prefix `1` + HH + mm (00-59), 5 digits total              |
| 1HHmmss | Second          | Prefix `1` + HH + mm + ss (00-59), 7 digits total         |

**Prefix Design Rationale**:

- Package managers normalise `0327` to `327`, breaking sort order
- Prefix `1` ensures non-zero leading digit, correct sorting always

**Examples**:

| Version              | Meaning                                     |
| :------------------- | :------------------------------------------ |
| `2025.0.0`           | 2025 annual first / project initial release |
| `2025.10327.114`     | 2025-03-27 14:00                            |
| `2025.10327.11430`   | 2025-03-27 14:30                            |
| `2025.10327.1143045` | 2025-03-27 14:30:45                         |

## Platform Adaptation Guide

When user requests version update, modify corresponding file by project type:

### npm / pnpm / yarn (Frontend/Node.js)

**Config file**: `package.json`

```json
{
  "version": "2025.10327.114"
}
```

**Monorepo**: Update root and all `packages/*/package.json`

### Maven (Java/Kotlin)

**Config file**: `pom.xml`

```xml
<version>2025.10327.114</version>
```

**Multi-module**: Update parent pom and all submodule poms

### Gradle (Java/Kotlin/Android)

**Config file**: `build.gradle.kts` or `gradle.properties`

```kotlin
// build.gradle.kts
version = "2025.10327.114"
```

```properties
# gradle.properties
version=2025.10327.114
```

### Cargo (Rust)

**Config file**: `Cargo.toml`

```toml
[package]
version = "2025.10327.114"
```

**Workspace**: Update `[workspace.package].version` in `Cargo.toml`

### PyPI (Python)

**Config file**: `pyproject.toml` or `setup.py`

```toml
# pyproject.toml
[project]
version = "2025.10327.114"
```

### NuGet (.NET/C#)

**Config file**: `.csproj` or `Directory.Build.props`

```xml
<PropertyGroup>
  <Version>2025.10327.114</Version>
</PropertyGroup>
```

### Go Modules

**Config file**: Managed via Git tag, requires `v` prefix

```bash
git tag v2025.10327.114
```

### Pub (Dart/Flutter)

**Config file**: `pubspec.yaml`

```yaml
version: 2025.10327.114
```

### Hex (Elixir)

**Config file**: `mix.exs`

```elixir
def project do
  [version: "2025.10327.114"]
end
```

### Docker

**Config file**: Specify tag at build time

```bash
docker build -t myapp:2025.10327.114 .
```

### Helm (Kubernetes)

**Config file**: `Chart.yaml`

```yaml
version: 2025.10327.114
appVersion: "2025.10327.114"
```

## Precision Selection

| Release Frequency     | Format               | Example              |
| :-------------------- | :------------------- | :------------------- |
| Annual / Project init | `YYYY.0.0`           | `2025.0.0`           |
| Monthly               | `YYYY.1MM.1HH`       | `2025.103.114`       |
| Daily                 | `YYYY.1MMDD.1HH`     | `2025.10327.114`     |
| High frequency        | `YYYY.1MMDD.1HHmm`   | `2025.10327.11430`   |
| Very high / CI        | `YYYY.1MMDD.1HHmmss` | `2025.10327.1143045` |

## Prohibited Actions

| Action              | Reason                                                    |
| :------------------ | :-------------------------------------------------------- |
| Omit prefix `1`     | Gets normalised, breaks sorting                           |
| Omit third segment  | Must be three-segment                                     |
| Use `-alpha`, `-rc` | Hyphen is prerelease identifier, version comparison fails |
| Future timestamps   | Version should reflect actual release time                |

## Version Generation Script

When user needs to generate version, refer to [get_version.py](scripts/get_version.py):

```bash
python scripts/get_version.py           # Default: hour precision
python scripts/get_version.py minute    # Minute precision
python scripts/get_version.py second    # Second precision
python scripts/get_version.py month     # Monthly precision
python scripts/get_version.py year      # Annual first release
```

## Verification Checklist (Recency)

After version update, check:

- [ ] Format is strict three-segment
- [ ] Second segment date has prefix `1`
- [ ] Third segment time has prefix `1`
- [ ] All related config files synchronised
- [ ] Timestamp reflects actual release time