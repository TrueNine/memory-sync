---
apply: 按文件模式
模式: gui/**
---
# Memory Sync GUI

Tauri 2 desktop application providing graphical interface for `tnmsc` CLI. Embeds CLI via sidecar, parses Winston JSON5 log output, implements pipeline execution, config viewing, plugin management, log browsing, and other features.

**Type**
Desktop Application (Tauri 2 + React 19)

**Tech Stack**

- Tauri 2 (Rust backend, shell/updater plugins)
- React 19.0.0
- TypeScript (ESNext, strict mode)
- Vite 5 (@tailwindcss/vite plugin)
- TailwindCSS 4.0 (tw-animate-css animations)
- React Router 7 (HashRouter)
- Lucide React (icons)
- class-variance-authority + clsx + tailwind-merge (styling toolchain)
- Vitest + fast-check (testing)

**Directory Structure**

- `src/`: Frontend source code (React + TypeScript)
- `src-tauri/`: Tauri Rust backend (commands, tray, sidecar calls)

**Architecture**

Frontend calls Rust-side Tauri commands via `@tauri-apps/api/core` `invoke`, Rust side executes `tnmsc` CLI via sidecar and parses stdout logs.

Tauri Commands:

- `execute_pipeline`: Execute sync pipeline or dry-run
- `load_config`: Load and merge configuration
- `list_plugins`: List registered plugins
- `clean_outputs`: Clean output files
- `get_logs`: Get raw logs

**Frontend Conventions**

- Page components in `src/pages/`, each page corresponds to a route
- Custom hooks in `src/hooks/`, manage state and side effects (`usePipeline`, `useConfig`, `useTheme`)
- IPC bridge layer in `src/api/bridge.ts`, encapsulates all `invoke` calls, types use `readonly`
- i18n supports `zh-CN` / `en-US`, based on React Context, JSON translation files
- Theme follows system or manual switch (light/dark/system), controlled via `document.documentElement` class
- Path alias `@/` maps to `src/`
- UI components follow shadcn/ui style, use CSS variables for theme tokens

**Rust Backend Conventions**

- All IPC data structures use `#[serde(rename_all = "camelCase")]`, aligned with frontend types
- CLI log format: `{$:["timestamp","LEVEL","logger"],_:{...payload...}}`, parsed using `json5` crate
- ANSI escape sequences stripped before parsing
- System tray: Close window minimizes to tray instead of exit, right-click menu provides sync/open window/exit

**Testing**

- Unit tests: `*.test.ts`
- Property tests: `*.property.test.ts` (fast-check)
- Run: `pnpm test` (vitest --run)

**Build & Development**

- Frontend dev: `pnpm dev` (Vite, port 5173)
- Desktop dev: `pnpm tauri:dev` (Tauri + Vite)
- Build: `pnpm tauri:build` (auto executes `tsc && vite build`)
- External binary: `tnmsc` (packaged via `bundle.externalBin`)
- Auto-update: updater plugin, endpoint `https://releases.truenine.org/memory-sync/`

**Constraints**

- Don't operate filesystem directly, all sync operations delegated to `tnmsc` sidecar
- Frontend types consistent with Rust-side serde structs
- Window default 1024×768, resizable
- identifier: `org.truenine.memory-sync`