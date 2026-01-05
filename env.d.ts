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

/**
 * Kiro global powers registry JSON string injected at build time
 * from public/kiro_global_powers_registry.json
 */
declare const __KIRO_GLOBAL_POWERS_REGISTRY__: string

/**
 * Default tnmsc config template content injected at build time
 * from public/tnmsc.example.json
 */
declare const __TEMPLATE_TNMSC_EXAMPLE__: string

/**
 * Default gitignore template content injected at build time
 * from public/gitignore
 */
declare const __TEMPLATE_GITIGNORE__: string
