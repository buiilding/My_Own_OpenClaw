/**
 * Runs the run workflow for the developer CLI and automation tooling.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { mainHostSkin } = require('../../frontend/src/main/app/main_host_skin.cjs');
const {
  appendLayerLogLine,
  appendLayerLogSessionBanner,
  configureLayerLogSink,
} = require('../../frontend/src/main/logging/layer_log_sink.cjs');

configureLayerLogSink(mainHostSkin.logging);

const DEFAULT_CAPTURE_MAX_BUFFER = 16 * 1024 * 1024;

function commandForPlatform(command, args = []) {
  if (process.platform === 'win32') {
    if (command === 'npm') {
      return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] };
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
    if (path.extname(command) === '' && fs.existsSync(command)) {
      return { command: 'bash.exe', args: [command, ...args] };
    }
  }
  return { command, args };
}

function runSync(command, args = [], options = {}) {
  const platformCommand = commandForPlatform(command, args);
  const result = spawnSync(platformCommand.command, platformCommand.args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 50 * 1024 * 1024,
  });
  if (result.error) {
    if (options.allowError) {
      return result;
    }
    throw result.error;
  }
  if (!options.allowFailure && typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
  return result;
}

function capture(command, args = [], options = {}) {
  const result = runSync(command, args, {
    ...options,
    allowError: true,
    allowFailure: true,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || DEFAULT_CAPTURE_MAX_BUFFER,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? result.error.message : null,
  };
}

function runForeground(command, args = [], options = {}) {
  const result = runSync(command, args, options);
  process.exit(result.status ?? 0);
}

function prefixStream(stream, prefix, destination, { logLayer = null } = {}) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (logLayer) {
        appendLayerLogLine(logLayer, line);
      }
      destination.write(`${prefix}${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      if (logLayer) {
        appendLayerLogLine(logLayer, buffer);
      }
      destination.write(`${prefix}${buffer}\n`);
      buffer = '';
    }
  });
}

function runConcurrent(processes) {
  const children = [];
  let finalCode = 0;
  let remaining = 0;
  let resolved = false;
  let shuttingDown = false;
  let startupComplete = false;
  let resolveDone;

  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const finishIfDone = () => {
    if (!resolved && startupComplete && remaining === 0) {
      resolved = true;
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      resolveDone(finalCode);
    }
  };

  const stopChildren = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
  };

  const onSigint = () => {
    stopChildren();
  };
  const onSigterm = () => {
    stopChildren();
  };

  const spawnProcess = (item) => {
    if (item.logLayer) {
      appendLayerLogSessionBanner(item.logLayer, {
        sessionLabel: `${item.label} child process log session`,
        logPrefix: '[WindieOS]',
      });
    }
    const platformCommand = commandForPlatform(item.command, item.args || []);
    const child = spawn(platformCommand.command, platformCommand.args, {
      cwd: item.cwd,
      env: item.env || process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    children.push(child);
    remaining += 1;
    prefixStream(child.stdout, `[${item.label}] `, process.stdout, { logLayer: item.logLayer });
    prefixStream(child.stderr, `[${item.label}] `, process.stderr, { logLayer: item.logLayer });
    child.on('error', (error) => {
      if (finalCode === 0) {
        finalCode = 1;
      }
      console.error(`[${item.label}] failed to start: ${error.message}`);
      stopChildren();
    });
    child.on('exit', (code, signal) => {
      if (!shuttingDown && code !== 0) {
        console.error(`[${item.label}] exited with ${signal || code}`);
        if (typeof code === 'number' && code !== 0 && finalCode === 0) {
          finalCode = code;
        } else if (finalCode === 0) {
          finalCode = 1;
        }
        stopChildren();
      }
      if (typeof code === 'number' && code !== 0 && finalCode === 0) {
        finalCode = code;
      }
      remaining -= 1;
      finishIfDone();
    });
  };

  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  (async () => {
    try {
      for (const item of processes) {
        if (item.waitFor) {
          if (item.waitMessage) {
            console.log(`[${item.label}] ${item.waitMessage}`);
          }
          await item.waitFor({ isShuttingDown: () => shuttingDown });
        }
        if (shuttingDown) {
          break;
        }
        spawnProcess(item);
      }
    } catch (error) {
      if (!shuttingDown) {
        if (finalCode === 0) {
          finalCode = 1;
        }
        console.error(`[windie] ${error.message}`);
        stopChildren();
      }
    } finally {
      startupComplete = true;
      finishIfDone();
    }
  })();

  return done;
}

module.exports = {
  commandForPlatform,
  capture,
  runConcurrent,
  runForeground,
  runSync,
};
