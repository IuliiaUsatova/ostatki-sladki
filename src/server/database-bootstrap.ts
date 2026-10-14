export type RepositoryOptions = {
  seedFixtures?: boolean
}

export function fixtureSeedingEnabled(mode: string | undefined): boolean {
  return mode === 'development' || mode === 'test'
}
