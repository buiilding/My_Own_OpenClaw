const fs = require('fs');
const net = require('net');
const { findDocs } = require('./docs.cjs');
const { printCheckList, printJson, printSection } = require('./output.cjs');
const { FRONTEND_DIR, REPO_ROOT, repoPath } = require('./paths.cjs');
const { collectStatus, getEndpointSnapshot } = require('./status.cjs');
const { capture, runConcurrent, runForeground, runSync } = require('./run.cjs');

const HELP = `WindieOS command line

Usage:
  windie <command> [options]

Status and diagnostics:
  windie status
  windie status --all
  windie status --all --json
  windie doctor
  windie doctor --fix
  windie doctor --deep
  windie doctor --json

Lifecycle and logs:
  windie start backend
  windie start frontend
  windie start desktop
  windie start all
  windie stop
  windie restart desktop
  windie logs backend [--remote --host <host>] [--service backend|tunnel|both]
  windie logs desktop
  windie logs sidecar

Tests and docs:
  windie test backend [args...]
  windie test sidecar [args...]
  windie test frontend [args...]
  windie test all
  windie test pick <area>
  windie docs list
  windie docs check
  windie docs open <topic>

Build and package:
  windie build frontend
  windie build sidecar-runtime
  windie package mac
  windie package win
  windie package linux
  windie reinstall mac
  windie reinstall win
  windie reinstall linux

Backend, endpoint, and self-host:
  windie backend health [--url <url>]
  windie backend deploy --host <host> [options]
  windie backend deploy --local [options]
  windie backend service status|start|stop|restart [--scope system|user] [--host <host>]
  windie endpoint show
  windie endpoint local
  windie endpoint hosted
  windie endpoint probe
  windie self-host bootstrap [options]
  windie self-host tunnel setup [options]
  windie self-host service install-backend [options]
  windie self-host service install-cloudflared [options]
  windie self-host status

Developer helpers:
  windie extension create <id> [options]
  windie tools manifest generate
  windie mock backend
`;

function hasFlag(args, flag) {
  return args.includes(flag);
}

function optionValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    return fallback;
  }
  return value;
}

function stripSeparator(args) {
  return args[0] === '--' ? args.slice(1) : args;
}

function script(relativePath) {
  return repoPath(relativePath);
}

function printNoTrackedProcesses() {
  console.log('No tracked WindieOS background processes found.');
  console.log('Current `windie start ...` commands run in the foreground; use Ctrl-C in that terminal.');
}

function runStatus(args) {
  const all = hasFlag(args, '--all');
  const json = hasFlag(args, '--json');
  const status = collectStatus({ all });
  if (json) {
    printJson(status);
    return;
  }
  printCheckList(all ? 'WindieOS status --all' : 'WindieOS status', status.checks);
  if (all) {
    printSection('Endpoint', [
      `http: ${status.detail.endpoint.httpUrl}`,
      `ws:   ${status.detail.endpoint.wsUrl}`,
    ]);
  }
}

function portOpen(host, port, timeoutMs = 750) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function runDoctor(args) {
  const json = hasFlag(args, '--json');
  const deep = hasFlag(args, '--deep');
  const fix = hasFlag(args, '--fix');
  const status = collectStatus({ all: true });
  const diagnostics = [...status.checks];

  if (fix) {
    diagnostics.push({
      name: 'safe repairs',
      ok: true,
      detail: 'no automatic repairs are currently needed',
    });
  }

  if (deep) {
    const backendPortOpen = await portOpen('127.0.0.1', 8765);
    diagnostics.push({
      name: 'local backend port',
      ok: backendPortOpen,
      detail: backendPortOpen ? '127.0.0.1:8765 is accepting connections' : '127.0.0.1:8765 is closed',
    });
    const sidecarImport = capture(
      script('scripts/python-in-env'),
      [
        'sidecar',
        'python',
        '-c',
        'import sys; sys.path.insert(0, "frontend/src/main/python"); import local_backend; print("ok")',
      ],
      { cwd: REPO_ROOT },
    );
    diagnostics.push({
      name: 'sidecar import',
      ok: sidecarImport.ok,
      detail: sidecarImport.ok ? 'local_backend imports' : sidecarImport.stderr || sidecarImport.error,
    });
  }

  const result = {
    ok: diagnostics.every((item) => item.ok),
    fix,
    deep,
    checks: diagnostics,
    endpoint: getEndpointSnapshot(),
  };
  if (json) {
    printJson(result);
    return;
  }
  printCheckList(deep ? 'WindieOS doctor --deep' : 'WindieOS doctor', diagnostics);
}

function runStart(target) {
  if (target === 'backend') {
    return runForeground(script('scripts/run-backend'), [], { cwd: REPO_ROOT });
  }
  if (target === 'frontend') {
    return runForeground(script('scripts/run-frontend-dev'), [], { cwd: REPO_ROOT });
  }
  if (target === 'desktop') {
    return runForeground(script('scripts/run-frontend-electron'), [], { cwd: REPO_ROOT });
  }
  if (target === 'all') {
    return runConcurrent([
      { label: 'backend', command: script('scripts/run-backend'), cwd: REPO_ROOT },
      { label: 'frontend', command: script('scripts/run-frontend-dev'), cwd: REPO_ROOT },
      { label: 'desktop', command: script('scripts/run-frontend-electron'), cwd: REPO_ROOT },
    ]).then((code) => process.exit(code));
  }
  throw new Error('Usage: windie start backend|frontend|desktop|all');
}

function runRestart(target) {
  if (target !== 'desktop') {
    throw new Error('Usage: windie restart desktop');
  }
  return runStart('desktop');
}

function runLogs(args) {
  const target = args[0];
  if (target === 'backend') {
    const remote = hasFlag(args, '--remote');
    const host = optionValue(args, '--host', process.env.WINDIE_BACKEND_SSH_HOST || null);
    const service = optionValue(args, '--service', null);
    const scope = optionValue(args, '--scope', null);
    const tail = optionValue(args, '--tail', null);
    const noFollow = hasFlag(args, '--no-follow');
    if (remote && !host) {
      throw new Error('Remote backend logs require --host or WINDIE_BACKEND_SSH_HOST.');
    }
    const forwarded = [];
    if (host) {
      forwarded.push('--host', host);
    }
    if (service) {
      forwarded.push('--service', service);
    }
    if (scope) {
      forwarded.push('--scope', scope);
    }
    if (tail) {
      forwarded.push('--tail', tail);
    }
    if (noFollow) {
      forwarded.push('--no-follow');
    }
    return runForeground(script('scripts/dev/backend-logs'), forwarded, { cwd: REPO_ROOT });
  }
  if (target === 'desktop') {
    console.log('Desktop logs are currently emitted by the foreground desktop launcher.');
    console.log('Run: windie start desktop');
    return;
  }
  if (target === 'sidecar') {
    console.log('Sidecar logs are forwarded through Electron main stderr in desktop runs.');
    console.log('Run: WINDIE_SIDECAR_LOG_LEVEL=DEBUG windie start desktop');
    return;
  }
  throw new Error('Usage: windie logs backend|desktop|sidecar');
}

function runTest(args) {
  const target = args[0];
  const rest = stripSeparator(args.slice(1));
  if (target === 'backend') {
    return runForeground(script('scripts/test-backend'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'sidecar') {
    return runForeground(script('scripts/test-sidecar'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'frontend') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', ...rest], {
      cwd: REPO_ROOT,
    });
  }
  if (target === 'all') {
    return runForeground(script('scripts/test'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'pick') {
    const area = rest.join(' ').trim();
    if (!area) {
      throw new Error('Usage: windie test pick <area>');
    }
    const docs = fs.readFileSync(repoPath('docs/debug/test_selection.md'), 'utf8');
    const lines = docs
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().includes(area.toLowerCase()));
    if (!lines.length) {
      console.log(`No focused test preset found for: ${area}`);
      console.log('Open docs/debug/test_selection.md for the full matrix.');
      return;
    }
    console.log(`Focused test matches for "${area}":`);
    for (const line of lines) {
      console.log(line);
    }
    return;
  }
  throw new Error('Usage: windie test backend|sidecar|frontend|all|pick <area>');
}

function runDocs(args) {
  const action = args[0];
  if (action === 'list') {
    return runForeground(script('bin/docs-list'), args.slice(1), { cwd: REPO_ROOT });
  }
  if (action === 'check') {
    runSync(script('bin/docs-list'), [], { cwd: REPO_ROOT });
    return runForeground('git', ['diff', '--check'], { cwd: REPO_ROOT });
  }
  if (action === 'open') {
    const topic = args.slice(1).join(' ');
    const matches = findDocs(topic);
    if (!matches.length) {
      console.log(`No docs match found for: ${topic}`);
      return;
    }
    for (const match of matches) {
      console.log(`${match.path} - ${match.title}`);
      if (match.summary) {
        console.log(`  ${match.summary}`);
      }
    }
    return;
  }
  throw new Error('Usage: windie docs list|check|open <topic>');
}

function runBuild(args) {
  const target = args[0];
  if (target === 'frontend') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'build'], { cwd: REPO_ROOT });
  }
  if (target === 'sidecar-runtime') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'build:sidecar-runtime'], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie build frontend|sidecar-runtime');
}

function runPackage(args) {
  const target = args[0];
  if (target === 'mac') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'package:mac'], { cwd: REPO_ROOT });
  }
  if (target === 'win') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'package:win'], { cwd: REPO_ROOT });
  }
  if (target === 'linux') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'package:linux'], { cwd: REPO_ROOT });
  }
  throw new Error('Usage: windie package mac|win|linux');
}

function runReinstall(args) {
  const target = args[0];
  if (target === 'mac') {
    console.log('Reinstalling macOS app can reset app state and TCC permissions.');
    return runForeground(script('scripts/reinstall-windieos-macos.sh'), args.slice(1), { cwd: REPO_ROOT });
  }
  if (target === 'linux') {
    console.log('Reinstalling Linux app can remove installed packages and app state.');
    return runForeground(script('scripts/reinstall-windieos-linux.sh'), args.slice(1), { cwd: REPO_ROOT });
  }
  if (target === 'win') {
    console.log('Reinstalling Windows app can uninstall and reinstall packaged WindieOS.');
    return runForeground(
      'powershell',
      ['-ExecutionPolicy', 'Bypass', '-File', script('scripts/reinstall-windieos-windows.ps1'), ...args.slice(1)],
      { cwd: REPO_ROOT },
    );
  }
  throw new Error('Usage: windie reinstall mac|win|linux');
}

async function fetchHealth(url) {
  const response = await fetch(url);
  return {
    ok: response.ok || [401, 403].includes(response.status),
    status: response.status,
    url,
    text: await response.text().catch(() => ''),
  };
}

async function runBackend(args) {
  const action = args[0];
  if (action === 'health') {
    const endpoint = getEndpointSnapshot();
    const baseUrl = optionValue(args, '--url', endpoint.httpUrl);
    const healthUrl = baseUrl.endsWith('/api/embeddings/health')
      ? baseUrl
      : `${baseUrl.replace(/\/$/, '')}/api/embeddings/health`;
    const json = hasFlag(args, '--json');
    const result = await fetchHealth(healthUrl).catch((error) => ({
      ok: false,
      status: null,
      url: healthUrl,
      error: error.message,
    }));
    if (json) {
      printJson(result);
      return;
    }
    console.log(`Backend health: ${result.ok ? 'ok' : 'failed'} ${result.status || ''}`);
    console.log(`  ${result.url}`);
    if (result.error) {
      console.log(`  ${result.error}`);
    }
    return;
  }
  if (action === 'deploy') {
    const host = optionValue(args, '--host', null);
    const local = hasFlag(args, '--local');
    const forwarded = [];
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '--host') {
        index += 1;
        continue;
      }
      if (arg === '--local') {
        continue;
      }
      forwarded.push(arg);
    }
    if (host) {
      const remoteCommand = [
        'cd /opt/windieos-live',
        '&&',
        'scripts/deploy/update-remote-backend',
        ...forwarded.map((value) => `'${String(value).replace(/'/g, "'\\''")}'`),
      ].join(' ');
      return runForeground('ssh', [host, remoteCommand], { cwd: REPO_ROOT });
    }
    if (local) {
      return runForeground(script('scripts/deploy/update-remote-backend'), forwarded, {
        cwd: REPO_ROOT,
      });
    }
    console.log('Backend deploy updates a backend-host checkout and restarts its service.');
    console.log('Use one of:');
    console.log('  windie backend deploy --host windie-prod');
    console.log('  windie backend deploy --local --repo-root /opt/windieos-live');
    return;
  }
  if (action === 'service') {
    const verb = args[1];
    if (!['status', 'start', 'stop', 'restart'].includes(verb)) {
      throw new Error('Usage: windie backend service status|start|stop|restart');
    }
    const scope = optionValue(args, '--scope', 'system');
    const service = optionValue(args, '--service', 'windieos-backend.service');
    const host = optionValue(args, '--host', null);
    const systemctl = scope === 'user' ? ['systemctl', '--user'] : ['systemctl'];
    const commandArgs = [...systemctl.slice(1), verb, service];
    if (host) {
      return runForeground('ssh', [host, systemctl[0], ...commandArgs], { cwd: REPO_ROOT });
    }
    return runForeground(systemctl[0], commandArgs, { cwd: REPO_ROOT });
  }
  throw new Error('Usage: windie backend health|deploy|service');
}

async function runEndpoint(args) {
  const action = args[0];
  const endpoint = getEndpointSnapshot();
  if (action === 'show') {
    printSection('WindieOS endpoint', [`http: ${endpoint.httpUrl}`, `ws:   ${endpoint.wsUrl}`]);
    return;
  }
  if (action === 'local') {
    console.log('BACKEND_HTTP_URL=http://127.0.0.1:8765');
    console.log('BACKEND_WS_URL=ws://127.0.0.1:8765/ws');
    console.log('windie start desktop');
    return;
  }
  if (action === 'hosted') {
    console.log('BACKEND_HTTP_URL=https://api.windieos.com');
    console.log('BACKEND_WS_URL=wss://api.windieos.com/ws');
    console.log('windie start desktop');
    return;
  }
  if (action === 'probe') {
    return runBackend(['health', '--url', endpoint.httpUrl, ...(hasFlag(args, '--json') ? ['--json'] : [])]);
  }
  throw new Error('Usage: windie endpoint show|local|hosted|probe');
}

function runSelfHost(args) {
  const action = args[0];
  if (action === 'bootstrap') {
    return runForeground(script('scripts/cloudflared/bootstrap-windieos-host'), args.slice(1), {
      cwd: REPO_ROOT,
    });
  }
  if (action === 'tunnel' && args[1] === 'setup') {
    return runForeground(script('scripts/cloudflared/setup-windieos-tunnel'), args.slice(2), {
      cwd: REPO_ROOT,
    });
  }
  if (action === 'service') {
    const serviceAction = args[1];
    if (serviceAction === 'install-backend') {
      return runForeground(script('scripts/cloudflared/install-backend-user-service'), args.slice(2), {
        cwd: REPO_ROOT,
      });
    }
    if (serviceAction === 'install-cloudflared') {
      return runForeground(script('scripts/cloudflared/install-cloudflared-user'), args.slice(2), {
        cwd: REPO_ROOT,
      });
    }
  }
  if (action === 'status') {
    const hasSystemctl = capture('systemctl', ['--version'], { cwd: REPO_ROOT }).ok;
    if (!hasSystemctl) {
      console.log('systemctl is not available on this machine.');
      console.log('Self-host status is only available on Linux hosts with systemd user services.');
      return;
    }
    runSync('systemctl', ['--user', 'status', 'windieos-backend.service', '--no-pager'], {
      cwd: REPO_ROOT,
      allowFailure: true,
    });
    return runForeground('systemctl', ['--user', 'status', 'windieos-cloudflared.service', '--no-pager'], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie self-host bootstrap|tunnel setup|service install-backend|service install-cloudflared|status');
}

function runExtension(args) {
  if (args[0] === 'create') {
    return runForeground('node', [script('scripts/create-windie-extension.cjs'), ...args.slice(1)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie extension create <id>');
}

function runTools(args) {
  if (args[0] === 'manifest' && args[1] === 'generate') {
    return runForeground(script('scripts/generate-builtin-tool-manifest'), args.slice(2), {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie tools manifest generate');
}

function runMock(args) {
  if (args[0] === 'backend') {
    return runForeground('node', [script('scripts/mock-backend.cjs'), ...args.slice(1)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie mock backend');
}

async function dispatch(argv) {
  const args = [...argv];
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP);
    return;
  }

  const command = args.shift();
  switch (command) {
    case 'status':
      return runStatus(args);
    case 'doctor':
      return runDoctor(args);
    case 'start':
      return runStart(args[0]);
    case 'stop':
      return printNoTrackedProcesses();
    case 'restart':
      return runRestart(args[0]);
    case 'logs':
      return runLogs(args);
    case 'test':
      return runTest(args);
    case 'docs':
      return runDocs(args);
    case 'build':
      return runBuild(args);
    case 'package':
      return runPackage(args);
    case 'reinstall':
      return runReinstall(args);
    case 'backend':
      return runBackend(args);
    case 'endpoint':
      return runEndpoint(args);
    case 'self-host':
      return runSelfHost(args);
    case 'extension':
      return runExtension(args);
    case 'tools':
      return runTools(args);
    case 'mock':
      return runMock(args);
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

function getSpawnPlan(argv) {
  const args = [...argv];
  const command = args.shift();
  if (command === 'start' && args[0] === 'backend') {
    return { command: script('scripts/run-backend'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'frontend') {
    return { command: script('scripts/run-frontend-dev'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'desktop') {
    return { command: script('scripts/run-frontend-electron'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'test' && args[0] === 'backend') {
    return { command: script('scripts/test-backend'), args: stripSeparator(args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'test' && args[0] === 'sidecar') {
    return { command: script('scripts/test-sidecar'), args: stripSeparator(args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'test' && args[0] === 'frontend') {
    return {
      command: 'npm',
      args: ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', ...stripSeparator(args.slice(1))],
      cwd: REPO_ROOT,
    };
  }
  if (command === 'docs' && args[0] === 'list') {
    return { command: script('bin/docs-list'), args: args.slice(1), cwd: REPO_ROOT };
  }
  return null;
}

module.exports = {
  HELP,
  dispatch,
  getSpawnPlan,
  optionValue,
  stripSeparator,
};
