---
trigger: glob
glob: packages/**
type: user_command
---
Packages in the workspace other than the core CLI package and GUI (e.g., aindex, etc.). Inherit Monorepo Root conventions, don't conflict with them.

**Type**
Workspace Package

**Hierarchy**

- Follow Root conventions: pnpm workspace, Turbo, code style, configuration priority
- This layer only supplements intra-package structure and package-level conventions

**Conventions**

- Package name matches directory name, conforms to `pnpm-workspace.yaml` definition
- Inter-package dependencies use workspace protocol (`workspace:*`)
- Scripts align with Turbo task names (`build`, `test`, `lint`, `typecheck`)
- Expose external API clearly via `package.json` `exports`, avoid leaking internal paths
- Build/test: `pnpm -F <package-name> run <script>` or `turbo run <task> --filter=<package-name>`