/// <reference types="vite/client" />
/// <reference types="vitest" />
/// <reference types="node" />

/**
 * CLI version injected at build time from package.json
 */
declare const __CLI_VERSION__: string

/**
 * CLI package name injected at build time from package.json
 */
declare const __CLI_PACKAGE_NAME__: string
