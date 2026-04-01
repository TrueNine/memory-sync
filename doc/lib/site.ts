import process from 'node:process'

export const siteConfig = {
  productName: 'memory-sync',
  shortName: 'memory-sync Docs',
  title: 'memory-sync Docs',
  description:
    'Documentation for memory-sync: prompts, rules, skills, commands, and project memory sync across multiple AI tools.',
  repoUrl: 'https://github.com/TrueNine/memory-sync',
  docsRepositoryBase: 'https://github.com/TrueNine/memory-sync/blob/main/doc',
  issueUrl: 'https://github.com/TrueNine/memory-sync/issues/new/choose'
} as const

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? 'http://localhost:3000')
}

export const heroProofPoints = [
  {
    label: 'Architecture',
    value: 'Rust-first / NAPI-first'
  },
  {
    label: 'Source Model',
    value: 'MDX as source of truth'
  },
  {
    label: 'Output',
    value: 'Native config materialization'
  }
] as const

export const homeEntryCards = [
  {
    href: '/docs/quick-guide',
    title: 'Quick Guide',
    detail: 'Decide whether to start with CLI, GUI, or MCP from a single page, then jump to the shortest workable path.'
  },
  {
    href: '/docs/cli',
    title: 'CLI',
    detail: 'Organized around installation, project setup, the first sync run, configuration fields, and the exposed command surface.'
  },
  {
    href: '/docs/sdk',
    title: 'SDK',
    detail: 'Explains the private mixed core, its ownership boundaries, its consumers, and how it relates to the tnmsc crate and CLI shell.'
  },
  {
    href: '/docs/mcp',
    title: 'MCP',
    detail: 'Covers the stdio server, the exposed tools, workspaceDir semantics, and the integration boundary.'
  },
  {
    href: '/docs/gui',
    title: 'GUI',
    detail: 'Focuses on the desktop layer, its page structure, and how it works with sdk, the tnmsc crate, and the CLI.'
  },
  {
    href: '/docs/technical-details',
    title: 'Technical Details',
    detail: 'Concentrates the architecture boundaries, the sync pipeline, the source-of-truth model, and authoring conventions.'
  },
  {
    href: '/docs/design-rationale',
    title: 'Design Rationale',
    detail: 'Keeps project motivation, design reasoning, and manifesto-style content separate from usage docs.'
  }
] as const

export const capabilityCards = [
  {
    label: 'Prompt Source',
    title: 'Maintain Input Assets in One Place',
    detail:
      'Use `.src.mdx` files and structured front matter to maintain prompts, skills, commands, sub-agents, and rules.'
  },
  {
    label: 'Pipeline',
    title: 'Materialize Native Outputs Per Tool',
    detail: 'Let plugins declare output targets, cleanup scopes, and generation strategy instead of copying config by hand.'
  },
  {
    label: 'Protection',
    title: 'Control Deletion Boundaries Explicitly',
    detail: '`cleanupProtection` and `outputScopes` define cleanup scope and risk boundaries.'
  },
  {
    label: 'Docs',
    title: 'Document Only What the Repo Actually Does',
    detail: 'Pages stay aligned with the current implementation, CLI help, schema, and workflow behavior instead of carrying old narratives forward.'
  }
] as const

export const readingPath = [
  {
    step: '01',
    href: '/docs/quick-guide',
    title: 'Choose Your Entry Point',
    description: 'Decide whether you are starting from terminal sync, the desktop workflow, or MCP integration.'
  },
  {
    step: '02',
    href: '/docs/cli/install',
    title: 'Confirm Runtime Requirements',
    description: 'Verify Node, Rust, the CLI entrypoint, and the currently supported boundaries first.'
  },
  {
    step: '03',
    href: '/docs/cli/workspace-setup',
    title: 'Prepare the Project Structure',
    description: 'Organize source files around the actual aindex and project-config directory conventions.'
  },
  {
    step: '04',
    href: '/docs/technical-details/source-of-truth',
    title: 'Start Maintaining Source Content',
    description: 'Establish the source-of-truth model first, then separate global prompts, workspace prompts, and other input assets.'
  },
  {
    step: '05',
    href: '/docs/cli/cli-commands',
    title: 'Run dry-run and Sync',
    description: 'Validate the output list, scope, and cleanup behavior before writing into target tools.'
  }
] as const
