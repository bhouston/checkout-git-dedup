import assert from 'node:assert/strict'
import {spawn, execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getSource, cleanup} from '../lib/git-source-provider.js'

const root = await realpath(await mkdtemp(join(tmpdir(), 'checkout-dedup-')))
const home = join(root, 'home')
const runnerTemp = join(root, 'runner-temp')
const remotes = join(root, 'remotes')
const source = join(root, 'source')
const remote = join(remotes, 'team', 'project')
const env = {...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, '.gitconfig')}
delete env.GIT_DEDUP_STORE
delete env.GITX_STORE
const git = (args, cwd = root) => execFileSync('git', args, {cwd, env: {...env, GIT_DEDUP_ACTIVE: '1'}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
let server
try {
  await Promise.all([mkdir(home), mkdir(runnerTemp), mkdir(join(remotes, 'team'), {recursive: true})])
  await writeFile(join(home, '.gitconfig'), '[include]\n path = runner-settings.gitconfig\n')
  await writeFile(join(home, 'runner-settings.gitconfig'), '[git-dedup]\n gitPath = ' + execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], {encoding: 'utf8'}).trim().split(/\r?\n/)[0].replaceAll('\\', '/') + '\n')
  git(['init', '--bare', remote])
  git(['init', source])
  git(['config', 'user.name', 'Test'], source)
  git(['config', 'user.email', 'test@example.test'], source)
  await mkdir(join(source, 'src'))
  await mkdir(join(source, 'extra'))
  await writeFile(join(source, 'src', 'file.txt'), 'source\n')
  await writeFile(join(source, 'extra', 'file.txt'), 'extra\n')
  git(['add', '.'], source)
  git(['commit', '-m', 'initial'], source)
  git(['commit', '--allow-empty', '-m', 'second'], source)
  git(['commit', '--allow-empty', '-m', 'third'], source)
  git(['branch', '-M', 'main'], source)
  git(['remote', 'add', 'origin', remote], source)
  git(['push', 'origin', 'main'], source)
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], remote)

  // Real smart HTTP transport, including GitHub-compatible object-format lookup.
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname.endsWith('/hash-algorithm')) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({hash_algorithm: 'sha1'}))
      return
    }
    const child = spawn('git', ['http-backend'], {env: {...env, GIT_DEDUP_ACTIVE: '1', GIT_PROJECT_ROOT: remotes, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method, CONTENT_TYPE: request.headers['content-type'] || '', REMOTE_ADDR: '127.0.0.1', HTTP_GIT_PROTOCOL: request.headers['git-protocol'] || ''}, stdio: ['pipe', 'pipe', 'pipe']})
    request.pipe(child.stdin)
    const chunks = []
    child.stdout.on('data', b => chunks.push(b))
    child.on('close', code => {
      const output = Buffer.concat(chunks)
      const split = output.indexOf('\r\n\r\n')
      if (code !== 0 || split < 0) { response.statusCode = 500; response.end('Git backend failed'); return }
      for (const line of output.subarray(0, split).toString().split('\r\n')) {
        const colon = line.indexOf(':')
        const key = line.slice(0, colon)
        const value = line.slice(colon + 1).trim()
        if (key.toLowerCase() === 'status') response.statusCode = Number(value.split(' ')[0])
        else response.setHeader(key, value)
      }
      response.end(output.subarray(split + 4))
    })
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  Object.assign(process.env, env, {RUNNER_TEMP: runnerTemp, GITHUB_WORKSPACE: root})
  delete process.env.GIT_DEDUP_STORE
  delete process.env.GITX_STORE
  const settings = {repositoryOwner: 'team', repositoryName: 'project', ref: 'refs/heads/main', commit: '', clean: true, fetchDepth: 1, fetchTags: false, showProgress: false, lfs: false, submodules: false, nestedSubmodules: false, authToken: 'test-token', sshKey: '', sshKnownHosts: '', sshStrict: true, sshUser: 'git', persistCredentials: true, setSafeDirectory: true, githubServerUrl: `http://127.0.0.1:${server.address().port}`, sparseCheckoutConeMode: true}
  for (const [name, overrides] of [['first', {}], ['second', {fetchDepth: 10, filter: 'tree:0', sparseCheckout: ['src']}], ['first', {fetchDepth: 50, filter: 'blob:none', persistCredentials: false}]]) {
    const repo = join(root, name)
    await getSource({...settings, repositoryPath: repo, ...overrides})
    assert.equal(git(['rev-parse', '--is-shallow-repository'], repo), 'false')
    assert.equal(git(['rev-list', '--count', 'HEAD'], repo), '3')
    const alternate = (await readFile(join(repo, '.git', 'objects', 'info', 'alternates'), 'utf8')).trim()
    assert.equal(await realpath(alternate), await realpath(join(home, '.git-dedup', 'pool.git', 'objects')))
    assert.equal((await readdir(join(repo, '.git', 'objects', 'pack'))).filter(p => p.endsWith('.pack')).length, 0)
    git(['fsck', '--full'], repo)
  }
  await assert.rejects(stat(join(root, 'second', 'extra', 'file.txt')), {code: 'ENOENT'})
  await stat(join(root, 'second', 'src', 'file.txt'))
  for (const name of ['first', 'second']) await cleanup(join(root, name))
  assert.equal(await readFile(join(home, '.gitconfig'), 'utf8'), '[include]\n path = runner-settings.gitconfig\n')
  assert.equal(process.env.HOME, home)
  console.log('PASS: repeated action checkouts share full history in the default store, preserve runner settings and sparse files, and clean credentials.')
} finally {
  if (server) await new Promise(done => server.close(done))
  await rm(root, {recursive: true, force: true})
}
