import {execFileSync} from 'node:child_process'
import {dirname, join} from 'node:path'

// Windows npm launchers are .cmd files: spawn the globally installed CLI through Node.
const launcher = process.platform === 'win32'
  ? join(dirname(execFileSync('where.exe', ['git-dedup'], {encoding: 'utf8'}).trim().split(/\r?\n/)[0]), 'node_modules', 'git-dedup', 'bin', 'git-dedup.js')
  : null
export const gitDedupCommand = launcher ? process.execPath : 'git-dedup'
export const gitDedupArgs = args => launcher ? [launcher, ...args] : args
