#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
);

const DEFAULT_FRONTEND_LOG_FILE = path.resolve(
  REPO_ROOT,
  '.windie',
  'logs',
  'frontend.log',
);

function parseOptions(argv) {
  return {
    dev: argv.includes('--dev'),
    noSummarizer: argv.includes('--no-summarizer'),
    debugGhostOverlay: argv.includes('--debug-ghost-overlay'),
  };
}

function resolveCondaPythonPath(env, platform, existsSync = fs.existsSync) {
  if (env.WINDIE_PYTHON_PATH) {
    return null;
  }
  const condaPrefix = env.CONDA_PREFIX;
  if (!condaPrefix) {
    return null;
  }

  const candidate = platform === 'win32'
    ? path.join(condaPrefix, 'python.exe')
    : path.join(condaPrefix, 'bin', 'python3');
  return existsSync(candidate) ? candidate : null;
}

function hasXvfbRun(spawnSyncFn = spawnSync) {
  const probe = spawnSyncFn('xvfb-run', ['--help'], {
    stdio: 'ignore',
  });
  return !probe.error;
}

function buildLaunchCommand({
  electronBinary,
  platform,
  env,
  xvfbAvailable,
}) {
  if (platform === 'linux' && !env.DISPLAY && xvfbAvailable) {
    return {
      command: 'xvfb-run',
      args: ['-a', electronBinary, '.'],
    };
  }
  return {
    command: electronBinary,
    args: ['.'],
  };
}

function resolveElectronBinaryForPlatform(
  electronBinary,
  { platform, existsSync = fs.existsSync } = {},
) {
  if (typeof electronBinary !== 'string' || !electronBinary.trim()) {
    throw new Error('Electron binary path is missing or invalid.');
  }

  const normalizedPlatform = typeof platform === 'string' ? platform : process.platform;
  const normalizedBinary = electronBinary.trim();
  if (normalizedPlatform === 'win32' || !normalizedBinary.toLowerCase().endsWith('.exe')) {
    return normalizedBinary;
  }

  const siblingBinary = normalizedBinary.slice(0, -4);
  if (existsSync(siblingBinary)) {
    return siblingBinary;
  }

  throw new Error(
    `Electron binary mismatch for platform '${normalizedPlatform}': received Windows executable ` +
      `(${normalizedBinary}). Reinstall frontend dependencies in this OS environment.`,
  );
}

function resolveFrontendLogFile(env = process.env) {
  const configured = env.WINDIE_FRONTEND_LOG_FILE;
  if (configured === '0' || configured === 'false') {
    return null;
  }
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim();
    return path.isAbsolute(value) ? value : path.join(REPO_ROOT, value);
  }
  return DEFAULT_FRONTEND_LOG_FILE;
}

function createFrontendLogStream(logFile = resolveFrontendLogFile()) {
  if (!logFile) {
    return null;
  }
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const stream = fs.createWriteStream(logFile, { flags: 'a' });
  stream.write(`\n[WindieOS] frontend log session ${new Date().toISOString()}\n`);
  stream.on('error', (error) => {
    console.warn(`[WindieOS] Failed to write frontend log: ${error.message}`);
  });
  return stream;
}

function writeToDestinations(destinations, text) {
  for (const destination of destinations) {
    if (destination && typeof destination.write === 'function') {
      destination.write(text);
    }
  }
}

function printModeBanner(options, logDestination = null) {
  const line = options.dev
    ? '[WindieOS] Developer mode launch (dev UI/source tags enabled).'
    : '[WindieOS] Customer mode launch. Developers should run: npm run electron:dev';
  console.log(line);
  logDestination?.write(`${line}\n`);
}

function printLogCaptureBanner(logFile, logDestination = null) {
  if (!logFile) {
    return;
  }
  const line = `[WindieOS] Frontend logs -> ${logFile}`;
  console.log(line);
  logDestination?.write(`${line}\n`);
}

function buildLaunchEnv(options, baseEnv = process.env) {
  const env = { ...baseEnv };
  env.ELECTRON_DISABLE_SANDBOX = '1';
  if (options.dev) {
    env.WINDIE_DEV_UI = '1';
  }
  if (options.noSummarizer) {
    env.WINDIE_ENABLE_SEMANTIC_SUMMARIZER = '0';
  }
  if (options.debugGhostOverlay) {
    env.WINDIE_DEBUG_GHOST_OVERLAY = '1';
  }
  return env;
}

function shouldForwardElectronStderrLine(line, platform = process.platform) {
  if (typeof line !== 'string' || !line.trim()) {
    return true;
  }
  if (platform === 'linux') {
    const isChromiumSystemdScopeWarning =
      line.includes('org.freedesktop.systemd1.Manager.StartTransientUnit') &&
      line.includes('org.freedesktop.systemd1.UnitExists: Unit app-org.chromium.Chromium-') &&
      line.includes('.scope was already loaded or has a fragment file.');
    return !isChromiumSystemdScopeWarning;
  }
  if (platform === 'darwin') {
    const isChromiumLaunchServicesDaemonWarning =
      line.includes('sandbox/mac/system_services.cc:35') &&
      line.includes('SetApplicationIsDaemon: Error Domain=NSOSStatusErrorDomain Code=-50') &&
      line.includes('paramErr: error in user parameter list');
    return !isChromiumLaunchServicesDaemonWarning;
  }
  return true;
}

function pipeFilteredStderr(stream, {
  destination = process.stderr,
  logDestination = null,
  platform = process.platform,
} = {}) {
  if (!stream || typeof stream.on !== 'function') {
    return;
  }

  let buffered = '';

  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    buffered += String(chunk ?? '');
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';
    lines.forEach((line) => {
      if (shouldForwardElectronStderrLine(line, platform)) {
        writeToDestinations([destination, logDestination], `${line}\n`);
      }
    });
  });
  stream.on('end', () => {
    if (buffered && shouldForwardElectronStderrLine(buffered, platform)) {
      writeToDestinations([destination, logDestination], buffered);
    }
  });
}

function pipeForwardedStdout(stream, {
  destination = process.stdout,
  logDestination = null,
} = {}) {
  if (!stream || typeof stream.on !== 'function') {
    return;
  }

  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    writeToDestinations([destination, logDestination], String(chunk ?? ''));
  });
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const logFile = resolveFrontendLogFile(process.env);
  const logStream = createFrontendLogStream(logFile);
  printModeBanner(options, logStream);
  printLogCaptureBanner(logFile, logStream);

  const env = buildLaunchEnv(options, process.env);

  const condaPython = resolveCondaPythonPath(env, process.platform);
  if (condaPython) {
    env.WINDIE_PYTHON_PATH = condaPython;
  }

  const electronBinary = resolveElectronBinaryForPlatform(require('electron'), {
    platform: process.platform,
  });
  const launch = buildLaunchCommand({
    electronBinary,
    platform: process.platform,
    env,
    xvfbAvailable: hasXvfbRun(),
  });

  const child = spawn(launch.command, launch.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env,
  });

  pipeForwardedStdout(child.stdout, { logDestination: logStream });
  pipeFilteredStderr(child.stderr, {
    logDestination: logStream,
    platform: process.platform,
  });

  child.on('error', (error) => {
    console.error(`[WindieOS] Failed to launch Electron: ${error.message}`);
    logStream?.end();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      logStream?.end();
      process.kill(process.pid, signal);
      return;
    }
    logStream?.end();
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildLaunchCommand,
  buildLaunchEnv,
  hasXvfbRun,
  parseOptions,
  pipeForwardedStdout,
  pipeFilteredStderr,
  printLogCaptureBanner,
  resolveFrontendLogFile,
  resolveElectronBinaryForPlatform,
  resolveCondaPythonPath,
  shouldForwardElectronStderrLine,
};
