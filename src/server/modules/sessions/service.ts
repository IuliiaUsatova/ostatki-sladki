import { createHash, randomBytes } from 'node:crypto'
import { invariant } from '../../../domain/errors.ts'
import type { User, Persona } from '../../../domain/types.ts'
import { object, keys, PERSONAS } from '../../../domain/validation.ts'
import { SEED_USERS } from '../../seed.ts'
import type { Repository } from '../../repository.ts'
import type { SqliteSessionCommands } from '../../infrastructure/sqlite/session-commands.ts'
export const SESSION_TTL_MS = 24 * 60 * 60_000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
type Dependencies = {
  repository: Pick<Repository, 'user' | 'session'>
  commands: Pick<SqliteSessionCommands, 'deleteExpired' | 'insert' | 'delete'>
  clock: () => number
  allowPersonaSessions: () => boolean
}
export class SessionService {
  private readonly dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
  }

  createSession(value: unknown): { token: string; user: User } {
    const { repository, commands, clock, allowPersonaSessions } =
      this.dependencies

    invariant(
      allowPersonaSessions(),
      'FORBIDDEN',
      'Вход по роли недоступен.',
      403,
    )
    const input = object(value)
    keys(input, ['persona'])
    invariant(
      typeof input.persona === 'string' &&
        PERSONAS.includes(input.persona as Persona),
      'INVALID_INPUT',
      'Выберите тестовую роль.',
    )
    const user = repository.user(SEED_USERS[input.persona as Persona].id)!
    const token = randomBytes(32).toString('base64url')
    commands.deleteExpired(clock())
    commands.insert(hash(token), user.id, clock() + SESSION_TTL_MS)
    return { token, user }
  }

  session(token: string | null): User | null {
    const { repository, clock, allowPersonaSessions } = this.dependencies

    const user =
      token && /^[a-zA-Z0-9_-]{43}$/.test(token)
        ? repository.session(hash(token), clock())
        : null
    // Old role-selector cookies cannot remain privileged after real auth is enabled.
    return user && (user.email || allowPersonaSessions()) ? user : null
  }

  deleteSession(token: string | null) {
    const { commands } = this.dependencies

    if (token) commands.delete(hash(token))
  }
}
