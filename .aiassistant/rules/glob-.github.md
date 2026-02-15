---
apply: 按文件模式
模式: .github/**
---
# memory-sync GitHub Workflows

GitHub Actions configuration directory managing CI/CD release workflows for Tauri desktop app and pnpm package.

**Type**
CI/CD Configuration

**Directory Structure**

- `workflows/`: GitHub Actions workflow definitions (YAML)

**Release Workflows**

| Workflow          | Trigger                          | Purpose                                                      |
| ----------------- | -------------------------------- | ------------------------------------------------------------ |
| `release-cli.yml` | `main` push / Manual             | Check version and publish `@truenine/memory-sync-cli` to npm |
| `release-gui.yml` | `Release CLI` completed / Manual | Build and publish Tauri app to GitHub Releases               |

**Version Strategy**

- Single source of truth: `cli/package.json` as the sole version source
- GUI version sync: Auto-written to `gui/src-tauri/Cargo.toml` during build
- Release tag format: `v${version}` (e.g., `v2026.10213.10110`)
- Pre-publish check: Compare npm registry with GitHub Releases to avoid duplicates

**CLI Release (`release-cli.yml`)**

- Runner: ubuntu-24.04
- Node version: 25
- Version check logic:
  - Read `cli/package.json` version
  - Query npm registry for current version
  - Check if GitHub Release exists
  - Publish only when versions differ
- Build command: `pnpm exec turbo run build --filter=@truenine/memory-sync-cli...`
- Publish command: `pnpm publish --access public --no-git-checks`

**GUI Release (`release-gui.yml`)**

- Dependency chain: `check-version` → `build-gui` (matrix) → `publish-release`
- Build matrix:
  - macOS-14 (universal: aarch64 + x86_64)
  - ubuntu-24.04 (x86_64)
  - windows-latest (x86_64)
- Version sync: `sed` replaces version field in `gui/src-tauri/Cargo.toml`
- Tauri signing: `TAURI_SIGNING_PRIVATE_KEY` + `PASSWORD`
- Output formats: `.dmg`, `.exe`, `.AppImage`, `.deb`, `.rpm`
- Release tool: `softprops/action-gh-release@v2.5.0`

**Secrets & Variables**

| Name                                 | Scope    | Purpose                               |
| ------------------------------------ | -------- | ------------------------------------- |
| `GH_PAT`                             | Checkout | GitHub PAT for repository access      |
| `GITHUB_TOKEN`                       | Release  | Create GitHub Releases                |
| `NPM_TOKEN`                          | CLI      | npm registry auth (`NODE_AUTH_TOKEN`) |
| `TAURI_SIGNING_PRIVATE_KEY`          | GUI      | Tauri app signing key                 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | GUI      | Signing key password                  |

**Build Conventions**

- pnpm version: Auto-installed via `pnpm/action-setup@v4`
- Node version: 25 (matches project `package.json`)
- Cache strategy: `pnpm-lock.yaml` hash as cache key
- Rust cache: `Cargo.lock` hash, includes `~/.cargo` and `gui/src-tauri/target`
- Ubuntu deps: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

**Artifacts**

- GUI build artifacts temporarily stored via `actions/upload-artifact@v4`
- Pre-release cleanup of macOS irrelevant files (`.icns`, `Info.plist`)
- Artifact naming: `gui-${platform}`