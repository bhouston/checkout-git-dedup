import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {readFile, readdir, realpath, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

const repositories = process.argv.slice(2).map(p => resolve(p))
assert.equal(repositories.length, 2)
assert.equal(process.env.GIT_DEDUP_STORE, undefined, 'test the unconfigured default store')
const objects = await realpath(join(homedir(), '.git-dedup', 'pool.git', 'objects'))
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8'}).trim()
let tip
let history
for (const repo of repositories) {
  assert.equal(git(repo, ['rev-parse', '--is-shallow-repository']), 'false')
  const currentTip = git(repo, ['rev-parse', 'HEAD'])
  const currentHistory = git(repo, ['rev-list', 'HEAD'])
  assert.ok(currentHistory.split('\n').length > 1, 'fetch-depth must be upgraded to full history')
  tip ??= currentTip
  history ??= currentHistory
  assert.equal(currentTip, tip)
  assert.equal(currentHistory, history)
  const alternate = (await readFile(join(repo, '.git', 'objects', 'info', 'alternates'), 'utf8')).trim()
  assert.equal(await realpath(alternate), objects)
  const packs = await readdir(join(repo, '.git', 'objects', 'pack'))
  assert.equal(packs.filter(name => name.endsWith('.pack')).length, 0, 'checkout borrows pool objects')
  assert.notEqual(spawnSync('git', ['-C', repo, 'config', '--get', 'remote.origin.promisor']).status, 0)
  git(repo, ['fsck', '--full'])
}
await assert.rejects(stat(join(repositories[1], '__test__')), {code: 'ENOENT'})
await stat(join(repositories[1], 'src', 'git-command-manager.ts'))
console.log('Both checkouts reuse full history from the default shared store; sparse files remain sparse.')
