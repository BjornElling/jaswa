import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

const violations = []

for (const file of files) {
  const contents = readFileSync(file)

  if (contents.includes(0)) continue

  const carriageReturn = contents.indexOf(13)
  if (carriageReturn !== -1) violations.push(file)
}

if (violations.length > 0) {
  console.error('Expected LF line endings; carriage returns found in:')
  for (const file of violations) console.error(`  ${file}`)
  process.exitCode = 1
} else {
  console.log(`LF line endings verified in ${files.length} repository files.`)
}
