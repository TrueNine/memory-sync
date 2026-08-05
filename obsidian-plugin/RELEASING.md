# TNMSO Release Checklist

1. Update the shared memory-sync CalVer version; do not version TNMSO independently.
2. Run the version hook and `scripts/shared/check-version-surfaces.ts` from the repository root.
3. Run TNMSO tests, type checking, lint, build, packaging, and dist verification with Bun.
4. Confirm the system `v<version>` Release contains `tnmso-<version>.zip`.
5. Confirm the Obsidian `<version>` Release points to the same commit and contains `main.js`, `manifest.json`, and `styles.css`.
6. For the first community listing, sign in at [community.obsidian.md](https://community.obsidian.md), link the maintainer GitHub account, and submit `https://github.com/TrueNine/memory-sync` under **Plugins > New plugin**.
7. Confirm the directory reads the root `manifest.json` from the default branch and passes its automated review before selecting **Publish**.

The initial directory submission requires an Obsidian account and is intentionally a maintainer action. Later plugin versions are discovered from GitHub Releases automatically.
