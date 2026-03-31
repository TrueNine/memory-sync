# Security Policy

## Supported Versions

Only the latest release receives security fixes. No backport patches for older versions.

| Version | Supported |
| --- | --- |
| Latest | ✅ |
| Older | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability, **do not** report it in a public Issue.

Contact the maintainer privately via:

- GitHub Security Advisory: submit a private report under the repository's **Security** tab
- Email: contact [@TrueNine](https://github.com/TrueNine) directly
Please include:

- Vulnerability description and impact scope
- Reproduction steps (minimal example)
- Your OS, Node.js version, and `memory-sync` version
- Suggested fix if any
## Response Timeline

The maintainer is a person, not a security team. No SLA, no 24-hour response guarantee.

- Will acknowledge receipt as soon as possible
- Will release a patch within a reasonable timeframe after confirmation
- Will publicly disclose vulnerability details after the fix is released
Don't rush.

## Scope

`memory-sync` is now a toolkit made of CLI / SDK / MCP / GUI surfaces, not just a single CLI binary. Its security boundary:

- **Reads**: user `.src.mdx` source files, project config files, the global config file (`~/.aindex/.tnmsc.json`), and repository metadata needed for sync
- **Writes**: target-tool config directories, managed prompt artifacts such as `dist/`, generated skills / README-like outputs, and related helper configs
- **Cleans**: removes stale managed outputs and target-directory residue during sync or cleanup
The following are **out of scope**:

- Security vulnerabilities in target AI tools themselves
- Compliance of user prompt content
- Hardening of third-party dependencies, hosted platforms, or the local workstation outside this repository
- External scripts, private plugins, or unmanaged files injected by the user into the workflow
## Design Principles

- **Separation between source and derived state**: source files, generated artifacts, and target-tool configs must stay clearly separated, auditable, and traceable
- **Cleanup touches managed outputs only**: cleanup should only remove generated outputs or explicitly configured targets, never silently widen its delete boundary
- **No hidden telemetry**: no user data is collected or reported
- **External network behavior must be explicit**: core sync logic must not depend on hidden outbound requests; if release or docs-deploy automation talks to npm, GitHub, or Vercel, that behavior must remain visible in workflow files
## License

This project is licensed under [AGPL-3.0](LICENSE). Unauthorised commercial use in violation of the licence will be pursued legally.