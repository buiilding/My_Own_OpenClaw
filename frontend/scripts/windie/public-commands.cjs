/**
 * Public WindieOS CLI command surface for frontend, SDK, docs, and extension work.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findCommits } = require('./commits.cjs');
const { findDocs } = require('./docs.cjs');
const { printJson } = require('./output.cjs');
const { REPO_ROOT, repoPath } = require('./paths.cjs');

const HELP = `WindieOS public command line

Usage:
  <windie> <command> [options]

Docs and history:
  <windie> docs list
  <windie> docs check
  <windie> docs search <query>
  <windie> docs <query>
  <windie> commits search <query> [--limit <n>] [--json]

Frontend and local runtime:
  <windie> status
  <windie> start frontend
  <windie> start desktop
  <windie> start dev
  <windie> start customer
  <windie> test frontend [args...]
  <windie> test local-runtime [args...]
  <windie> test sidecar [args...]
  <windie> build frontend
  <windie> build local-runtime

Packaging:
  <windie> package mac
  <windie> package win
  <windie> package linux
  <windie> reinstall mac
  <windie> reinstall win
  <windie> reinstall linux

Developer helpers:
  <windie> extension create <id> [options]
  <windie> tools manifest generate
  <windie> mock backend
`;

function commandForPlatform(command, args = []) {
  if (process.platform === 'win32') {
    if (command === 'npm') {
      return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] };
    }
    if (command === 'python') {
      return { command: 'python.exe', args };
    }
    if (command === 'powershell') {
      return { command: 'powershell.exe', args };
    }
    if (['.cmd', '.bat'].includes(path.extname(command).toLowerCase())) {
      return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] };
    }
    if (path.extname(command) === '.sh' && fs.existsSync(command)) {
      return { command: 'bash.exe', args: [command, ...args] };
    }
  }
  return { command, args };
}

function runForeground(command, args = [], options = {}) {
  const platformCommand = commandForPlatform(command, args);
  const result = spawnSync(platformCommand.command, platformCommand.args, {
    cwd: options.cwd || REPO_ROOT,
    env: options.env || process.env,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function capture(command, args = []) {
  const platformCommand = commandForPlatform(command, args);
  const result = spawnSync(platformCommand.command, platformCommand.args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? result.error.message : null,
  };
}

function script(relativePath) {
  return repoPath(relativePath);
}

function stripSeparator(args) {
  return args[0] === '--' ? args.slice(1) : args;
}

function optionValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }
  return args[index + 1];
}

function docsCommand(args) {
  const action = args[0];
  if (action === 'list') {
    return runForeground(process.execPath, [script('scripts/docs-list.js'), ...args.slice(1)]);
  }
  if (action === 'check') {
    runForeground(process.execPath, [script('scripts/docs-list.js')]);
    return runForeground('git', ['diff', '--check']);
  }
  const query = action === 'search' ? args.slice(1).join(' ') : args.join(' ');
  if (!query.trim()) {
    throw new Error('Usage: <windie> docs search <query>');
  }
  const matches = findDocs(query);
  for (const match of matches) {
    console.log(`${match.path} - ${match.title}`);
    if (match.summary) {
      console.log(`  ${match.summary}`);
    }
  }
}

function commitsCommand(args) {
  if (args[0] !== 'search') {
    throw new Error('Usage: <windie> commits search <query> [--limit <n>] [--json]');
  }
  const json = args.includes('--json');
  const limit = Number(optionValue(args, '--limit', 10));
  const queryParts = [];
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      continue;
    }
    if (arg === '--limit') {
      index += 1;
      continue;
    }
    queryParts.push(arg);
  }
  const result = findCommits(queryParts.join(' '), { limit: Number.isFinite(limit) ? limit : 10 });
  if (json) {
    return printJson(result);
  }
  for (const match of result.matches) {
    console.log(`${match.hash} ${match.date} ${match.subject}`);
    if (match.author) {
      console.log(`  ${match.author}`);
    }
    if (match.files?.length) {
      console.log(`  ${match.files.slice(0, 6).join(', ')}${match.files.length > 6 ? ', +' + (match.files.length - 6) + ' more' : ''}`);
    }
  }
}

function collectStatus() {
  const node = capture('node', ['--version']);
  const npm = capture('npm', ['--version']);
  const checks = [
    { name: 'repo root', ok: fs.existsSync(repoPath('AGENTS.md')) && fs.existsSync(repoPath('src')), detail: REPO_ROOT },
    { name: 'node', ok: node.ok, detail: node.stdout || node.error || node.stderr },
    { name: 'npm', ok: npm.ok, detail: npm.stdout || npm.error || npm.stderr },
    {
      name: 'frontend dependencies',
      ok: fs.existsSync(repoPath('node_modules')),
      detail: fs.existsSync(repoPath('node_modules')) ? 'node_modules present' : 'run npm install',
    },
    {
      name: 'docs navigation',
      ok: fs.existsSync(repoPath('docs/docs.json')),
      detail: fs.existsSync(repoPath('docs/docs.json')) ? 'docs/docs.json present' : 'docs/docs.json missing',
    },
  ];
  for (const check of checks) {
    console.log(`${check.ok ? 'ok' : 'fail'} ${check.name}: ${check.detail}`);
  }
  if (!checks.every((check) => check.ok)) {
    process.exitCode = 1;
  }
}

function startCommand(args) {
  const target = args[0];
  if (target === 'frontend') {
    return runForeground(script('scripts/run-frontend-dev.sh'));
  }
  if (target === 'desktop') {
    return runForeground(script('scripts/run-frontend-electron.sh'));
  }
  if (target === 'dev') {
    return runForeground('npm', ['run', 'electron:dev']);
  }
  if (target === 'customer') {
    return runForeground(script('scripts/run-frontend-customer.sh'));
  }
  throw new Error('Usage: <windie> start frontend|desktop|dev|customer');
}

function testCommand(args) {
  const target = args[0];
  const rest = stripSeparator(args.slice(1));
  if (target === 'frontend') {
    return runForeground('npm', ['run', 'test:ci', '--', ...rest]);
  }
  if (target === 'local-runtime' || target === 'sidecar') {
    return runForeground(script('scripts/test-sidecar.sh'), rest);
  }
  throw new Error('Usage: <windie> test frontend|local-runtime');
}

function buildCommand(args) {
  const target = args[0];
  if (target === 'frontend') {
    return runForeground('npm', ['run', 'build']);
  }
  if (target === 'local-runtime') {
    return runForeground('npm', ['run', 'build:sidecar-runtime']);
  }
  throw new Error('Usage: <windie> build frontend|local-runtime');
}

function packageCommand(args) {
  const target = args[0];
  if (target === 'mac' || target === 'win' || target === 'linux') {
    return runForeground('npm', ['run', `package:${target}`]);
  }
  throw new Error('Usage: <windie> package mac|win|linux');
}

function reinstallCommand(args) {
  const target = args[0];
  if (target === 'mac') {
    return runForeground(script('scripts/reinstall-windieos-macos.sh'), args.slice(1));
  }
  if (target === 'linux') {
    return runForeground(script('scripts/reinstall-windieos-linux.sh'), args.slice(1));
  }
  if (target === 'win') {
    return runForeground('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script('scripts/reinstall-windieos-windows.ps1'), ...args.slice(1)]);
  }
  throw new Error('Usage: <windie> reinstall mac|win|linux');
}

function extensionCommand(args) {
  if (args[0] === 'create') {
    return runForeground('node', [script('scripts/create-windie-extension.cjs'), ...args.slice(1)]);
  }
  throw new Error('Usage: <windie> extension create <id> [options]');
}

function toolsCommand(args) {
  if (args[0] === 'manifest' && args[1] === 'generate') {
    return runForeground('python', [script('scripts/generate-builtin-tool-manifest.py'), ...args.slice(2)]);
  }
  throw new Error('Usage: <windie> tools manifest generate');
}

function mockCommand(args) {
  if (args[0] === 'backend') {
    return runForeground('node', [script('scripts/mock-backend.cjs'), ...args.slice(1)]);
  }
  throw new Error('Usage: <windie> mock backend');
}

async function dispatch(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === 'help') {
    console.log(HELP);
    return;
  }
  if (command === 'status') {
    return collectStatus();
  }
  if (command === 'docs') {
    return docsCommand(args);
  }
  if (command === 'commits') {
    return commitsCommand(args);
  }
  if (command === 'start') {
    return startCommand(args);
  }
  if (command === 'test') {
    return testCommand(args);
  }
  if (command === 'build') {
    return buildCommand(args);
  }
  if (command === 'package') {
    return packageCommand(args);
  }
  if (command === 'reinstall') {
    return reinstallCommand(args);
  }
  if (command === 'extension') {
    return extensionCommand(args);
  }
  if (command === 'tools') {
    return toolsCommand(args);
  }
  if (command === 'mock') {
    return mockCommand(args);
  }
  throw new Error(`Unknown command: ${command}`);
}

module.exports = {
  dispatch,
};
