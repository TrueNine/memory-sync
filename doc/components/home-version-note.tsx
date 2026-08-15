import process from 'node:process'

export function HomeVersionNote() {
  const version = process.env.NEXT_PUBLIC_CROESSWEAVE_VERSION

  if (version == null || version === '') {
    return null
  }

  return (
    <p className="home-version-note">
      Current version:
      {' '}
      <code>{version}</code>
    </p>
  )
}
