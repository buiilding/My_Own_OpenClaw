#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

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

function printModeBanner(options) {
  if (options.dev) {
    console.log('[WindieOS] Developer mode launch (dev UI/source tags enabled).');
    return;
  }
  console.log('[WindieOS] Customer mode launch. Developers should run: npm run electron:dev');
}

function shouldForwardElectronStderrLine(line, platform = process.platform) {
  if (platform !== 'linux') {
    return true;
  }
  if (typeof line !== 'string' || !line.trim()) {
    return true;
  }
  const isChromiumSystemdScopeWarning =
    line.includes('org.freedesktop.systemd1.Manager.StartTransientUnit') &&
    line.includes('org.freedesktop.systemd1.UnitExists: Unit app-org.chromium.Chromium-') &&
    line.includes('.scope was already loaded or has a fragment file.');
  return !isChromiumSystemdScopeWarning;
}

function pipeFilteredStderr(stream, {
  destination = process.stderr,
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
        destination.write(`${line}\n`);
      }
    });
  });
  stream.on('end', () => {
    if (buffered && shouldForwardElectronStderrLine(buffered, platform)) {
      destination.write(buffered);
    }
  });
}

function pipeForwardedStdout(stream, {
  destination = process.stdout,
} = {}) {
  if (!stream || typeof stream.on !== 'function') {
    return;
  }

  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    destination.write(String(chunk ?? ''));
  });
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  printModeBanner(options);

  const env = { ...process.env };
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

  pipeForwardedStdout(child.stdout);
  pipeFilteredStderr(child.stderr, { platform: process.platform });

  child.on('error', (error) => {
    console.error(`[WindieOS] Failed to launch Electron: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildLaunchCommand,
  hasXvfbRun,
  parseOptions,
  pipeForwardedStdout,
  pipeFilteredStderr,
  resolveElectronBinaryForPlatform,
  resolveCondaPythonPath,
  shouldForwardElectronStderrLine,
};
