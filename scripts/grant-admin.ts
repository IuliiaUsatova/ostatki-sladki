import { email } from '../src/domain/auth-validation.ts'
import { DomainError } from '../src/domain/errors.ts'
import { Repository } from '../src/server/repository.ts'
import { grantAdministrator } from '../src/server/auth.ts'
import { databasePath } from '../src/server/database-path.ts'

const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--email') {
  console.error('Usage: node scripts/grant-admin.ts --email EMAIL')
  process.exitCode = 1
} else {
  let repository: Repository | undefined
  try {
    const normalizedEmail = email(args[1])
    repository = new Repository(databasePath(), Date.now())
    grantAdministrator(repository, normalizedEmail, Date.now())
    console.log(
      'Administrator access granted. Sign in again to open the administration workspace.',
    )
  } catch (error) {
    console.error(
      error instanceof DomainError
        ? error.message
        : 'Unable to grant administrator access.',
    )
    process.exitCode = 1
  } finally {
    repository?.close()
  }
}
