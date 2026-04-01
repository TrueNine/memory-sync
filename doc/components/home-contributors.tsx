import {siteConfig} from '../lib/site'
import {execFileSync} from 'node:child_process'
import path from 'node:path'

interface GitHubContributor {
  readonly avatar_url: string
  readonly contributions: number
  readonly html_url: string
  readonly id: number
  readonly login: string
  readonly type?: string
}

interface ContributorCard {
  readonly avatarUrl: string
  readonly htmlUrl: string
  readonly id: string
  readonly kind: 'agent' | 'bot' | 'human'
  readonly label: string
  readonly subtitle: string
  readonly sortWeight: number
}

interface ResolvedGitHubUser {
  readonly avatar_url: string
  readonly html_url: string
  readonly id: number
  readonly login: string
}

interface CoAuthorIdentity {
  readonly count: number
  readonly email: string
  readonly name: string
}

interface KnownCoAuthorProfile {
  readonly kind: ContributorCard['kind']
  readonly label: string
  readonly login: string
}

const CONTRIBUTORS_PER_PAGE = 100
const MAX_CONTRIBUTOR_PAGES = 10
const CONTRIBUTORS_REVALIDATE_SECONDS = 60 * 60 * 12
const REPO_ROOT = path.resolve(process.cwd(), '..')

function getRepoCoordinates(repoUrl: string) {
  const url = new URL(repoUrl)
  const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/')

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`)
  }

  return {owner, repo}
}

function getGitHubHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN

  return {
    Accept: 'application/vnd.github+json',
    ...(token ? {Authorization: `Bearer ${token}`} : {})
  }
}

async function fetchContributorsPage(page: number): Promise<GitHubContributor[]> {
  const {owner, repo} = getRepoCoordinates(siteConfig.repoUrl)
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=${CONTRIBUTORS_PER_PAGE}&page=${page}`,
    {
      headers: getGitHubHeaders(),
      next: {revalidate: CONTRIBUTORS_REVALIDATE_SECONDS}
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub contributors: ${response.status}`)
  }

  return await response.json() as GitHubContributor[]
}

async function searchGitHubUser(query: string): Promise<ResolvedGitHubUser | null> {
  const response = await fetch(
    `https://api.github.com/search/users?q=${encodeURIComponent(query)}`,
    {
      headers: getGitHubHeaders(),
      next: {revalidate: CONTRIBUTORS_REVALIDATE_SECONDS}
    }
  )

  if (!response.ok) {
    return null
  }

  const payload = await response.json() as {items?: ResolvedGitHubUser[]}

  return payload.items?.[0] ?? null
}

async function fetchGitHubUser(login: string): Promise<ResolvedGitHubUser | null> {
  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(login)}`,
    {
      headers: getGitHubHeaders(),
      next: {revalidate: CONTRIBUTORS_REVALIDATE_SECONDS}
    }
  )

  if (!response.ok) {
    return null
  }

  return await response.json() as ResolvedGitHubUser
}

function parseCoAuthors(message: string) {
  const matches = message.matchAll(/^Co-authored-by:\s+(.+?)\s+<(.+?)>$/gim)
  const coAuthors: CoAuthorIdentity[] = []

  for (const match of matches) {
    const [, name, email] = match

    if (!name || !email) {
      continue
    }

    coAuthors.push({
      count: 1,
      email: email.trim(),
      name: name.trim()
    })
  }

  return coAuthors
}

function buildCoAuthorKey(identity: Pick<CoAuthorIdentity, 'email' | 'name'>) {
  return `${identity.name.toLowerCase()}|${identity.email.toLowerCase()}`
}

function getCoAuthorSearchQueries(identity: CoAuthorIdentity) {
  const emailLocalPart = identity.email.split('@')[0] ?? ''
  const emailDomain = identity.email.split('@')[1] ?? ''
  const normalizedName = identity.name.toLowerCase()
  const queries: string[] = []

  if (emailLocalPart !== '' && emailLocalPart !== 'noreply') {
    queries.push(`${emailLocalPart} in:login`)
  }

  if (normalizedName.includes('cursor')) {
    queries.push('cursoragent in:login')
    queries.push('cursor in:login')
  }

  if (normalizedName.includes('claude') || emailDomain === 'anthropic.com') {
    queries.push('anthropics-claude-code in:login')
    queries.push('Anthropic in:login')
  }

  if (normalizedName.includes('windsurf') || emailDomain === 'codeium.com') {
    queries.push('windsurf in:login')
  }

  queries.push(`${identity.name} in:login`)

  return Array.from(new Set(queries))
}

function getKnownCoAuthorProfile(identity: CoAuthorIdentity): KnownCoAuthorProfile | null {
  const emailDomain = identity.email.split('@')[1] ?? ''
  const normalizedName = identity.name.toLowerCase()

  if (emailDomain === 'cursor.com' || normalizedName.includes('cursor')) {
    return {
      kind: 'agent',
      label: 'cursoragent',
      login: 'cursoragent'
    }
  }

  if (emailDomain === 'anthropic.com' || normalizedName.includes('claude')) {
    return {
      kind: 'agent',
      label: 'Claude Code',
      login: 'anthropics-claude-code'
    }
  }

  if (emailDomain === 'codeium.com' || normalizedName.includes('windsurf')) {
    return {
      kind: 'agent',
      label: 'Windsurf',
      login: 'windsurf'
    }
  }

  return null
}

async function getAllContributors() {
  const contributors: GitHubContributor[] = []

  for (let page = 1; page <= MAX_CONTRIBUTOR_PAGES; page += 1) {
    const pageItems = await fetchContributorsPage(page)

    if (pageItems.length === 0) {
      break
    }

    contributors.push(...pageItems)

    if (pageItems.length < CONTRIBUTORS_PER_PAGE) {
      break
    }
  }

  return contributors
}

async function getCoAuthors() {
  const coAuthors = new Map<string, CoAuthorIdentity>()
  let gitLog = ''

  try {
    gitLog = execFileSync('git', ['log', '--all', '--pretty=format:%B---END---'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    })
  } catch {
    return []
  }

  const commits = gitLog.split('---END---')

  for (const message of commits) {
    for (const identity of parseCoAuthors(message)) {
      const key = buildCoAuthorKey(identity)
      const current = coAuthors.get(key)

      if (current) {
        coAuthors.set(key, {
          ...current,
          count: current.count + 1
        })
      } else {
        coAuthors.set(key, identity)
      }
    }
  }

  return Array.from(coAuthors.values()).sort((left, right) => right.count - left.count)
}

async function resolveCoAuthor(identity: CoAuthorIdentity) {
  const knownProfile = getKnownCoAuthorProfile(identity)

  if (knownProfile) {
    const user = await fetchGitHubUser(knownProfile.login)

    if (user) {
      return {
        kind: knownProfile.kind,
        label: knownProfile.label,
        user
      }
    }
  }

  const emailLocalPart = identity.email.split('@')[0] ?? ''

  if (emailLocalPart !== '' && emailLocalPart !== 'noreply') {
    const user = await fetchGitHubUser(emailLocalPart)

    if (user) {
      return {
        kind: 'human' as const,
        label: identity.name,
        user
      }
    }
  }

  for (const query of getCoAuthorSearchQueries(identity).slice(0, 1)) {
    const user = await searchGitHubUser(query)

    if (user) {
      return {
        kind: knownProfile?.kind ?? 'human',
        label: knownProfile?.label ?? identity.name,
        user
      }
    }
  }

  return null
}

async function getContributorCards() {
  const contributors = await getAllContributors()
  const cards = new Map<string, ContributorCard>()
  const seenContributorUrls = new Set<string>()

  for (const contributor of contributors) {
    seenContributorUrls.add(contributor.html_url)
    cards.set(`contributor:${contributor.id}`, {
      avatarUrl: contributor.avatar_url,
      htmlUrl: contributor.html_url,
      id: `contributor:${contributor.id}`,
      kind: contributor.type === 'Bot' ? 'bot' : 'human',
      label: contributor.login,
      subtitle: `${contributor.contributions} contribution${contributor.contributions === 1 ? '' : 's'}`,
      sortWeight: 100000 + contributor.contributions
    })
  }

  const coAuthors = await getCoAuthors()
  const aggregatedCoAuthors = new Map<string, ContributorCard>()

  for (const identity of coAuthors) {
    const resolved = await resolveCoAuthor(identity)

    if (!resolved || seenContributorUrls.has(resolved.user.html_url)) {
      continue
    }

    const key = `coauthor:${resolved.user.id}`
    const current = aggregatedCoAuthors.get(key)

    if (current) {
      const nextCount = current.sortWeight + identity.count
      aggregatedCoAuthors.set(key, {
        ...current,
        sortWeight: nextCount,
        subtitle: `Co-authored ${nextCount} commits`
      })
      continue
    }

    aggregatedCoAuthors.set(key, {
      avatarUrl: resolved.user.avatar_url,
      htmlUrl: resolved.user.html_url,
      id: key,
      kind: resolved.kind,
      label: resolved.label,
      subtitle: `Co-authored ${identity.count} commit${identity.count === 1 ? '' : 's'}`,
      sortWeight: identity.count
    })
  }

  for (const [key, value] of aggregatedCoAuthors) {
    cards.set(key, value)
  }

  return Array.from(cards.values())
    .map(contributor => {
      if (contributor.htmlUrl === 'https://github.com/cursoragent') {
        return {
          ...contributor,
          kind: 'agent' as const,
          label: 'cursoragent'
        }
      }

      if (contributor.htmlUrl === 'https://github.com/anthropics-claude-code') {
        return {
          ...contributor,
          kind: 'agent' as const,
          label: 'Claude Code'
        }
      }

      if (contributor.htmlUrl === 'https://github.com/windsurf') {
        return {
          ...contributor,
          kind: 'agent' as const,
          label: 'Windsurf'
        }
      }

      return contributor
    })
    .sort((left, right) => right.sortWeight - left.sortWeight)
}

function groupContributorCards(contributors: ContributorCard[]) {
  return [
    {
      key: 'human',
      title: 'People',
      items: contributors.filter(contributor => contributor.kind === 'human')
    },
    {
      key: 'agent',
      title: 'Agents',
      items: contributors.filter(contributor => contributor.kind === 'agent')
    },
    {
      key: 'bot',
      title: 'Bots',
      items: contributors.filter(contributor => contributor.kind === 'bot')
    }
  ].filter(group => group.items.length > 0)
}

export async function HomeContributors() {
  let contributors: ContributorCard[] = []

  try {
    contributors = await getContributorCards()
  } catch {
    return null
  }

  if (contributors.length === 0) {
    return null
  }

  const groupedContributors = groupContributorCards(contributors)

  return (
    <section className="home-section">
      <div className="section-heading">
        <p className="section-kicker">Contributors</p>
        <h2>Built by Real Contributors</h2>
        <p className="section-summary">
          Live from GitHub repository metadata and commit co-author records.
          {' '}
          {contributors.length}
          {' '}
          contributor identities are currently shown here.
        </p>
      </div>

      <div className="home-contributors-shell">
        {groupedContributors.map(group => (
          <div key={group.key} className="home-contributors-group">
            <div className="home-contributors-group__header">
              <strong>{group.title}</strong>
              <span>{group.items.length}</span>
            </div>

            <div className="home-contributors-grid">
              {group.items.map(contributor => (
                <a
                  key={contributor.id}
                  href={contributor.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="home-contributor"
                  title={`${contributor.label} · ${contributor.subtitle}`}
                >
                  <img
                    src={contributor.avatarUrl}
                    alt={`${contributor.label} GitHub avatar`}
                    width="72"
                    height="72"
                    loading="lazy"
                    decoding="async"
                    className="home-contributor-avatar"
                  />
                </a>
              ))}
            </div>
          </div>
        ))}

        <a
          href={`${siteConfig.repoUrl}/graphs/contributors`}
          target="_blank"
          rel="noreferrer"
          className="home-contributors-link"
        >
          View Contributors on GitHub
        </a>
      </div>
    </section>
  )
}
