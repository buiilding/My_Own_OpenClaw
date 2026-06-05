const { spawn, spawnSync } = require('child_process');

function commandForPlatform(command) {
  if (process.platform === 'win32') {
    if (command === 'npm') {
      return 'npm.cmd';
    }
    if (command === 'powershell') {
      return 'powershell.exe';
    }
  }
  return command;
}

function runSync(command, args = [], options = {}) {
  const result = spawnSync(commandForPlatform(command), args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
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

function prefixStream(stream, prefix, destination) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      destination.write(`${prefix}${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      destination.write(`${prefix}${buffer}\n`);
      buffer = '';
    }
  });
}

function runConcurrent(processes) {
  const children = [];
  let shuttingDown = false;

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

  process.on('SIGINT', () => {
    stopChildren();
  });
  process.on('SIGTERM', () => {
    stopChildren();
  });

  for (const item of processes) {
    const child = spawn(commandForPlatform(item.command), item.args || [], {
      cwd: item.cwd,
      env: item.env || process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    children.push(child);
    prefixStream(child.stdout, `[${item.label}] `, process.stdout);
    prefixStream(child.stderr, `[${item.label}] `, process.stderr);
    child.on('error', (error) => {
      console.error(`[${item.label}] failed to start: ${error.message}`);
      stopChildren();
    });
    child.on('exit', (code, signal) => {
      if (!shuttingDown && code !== 0) {
        console.error(`[${item.label}] exited with ${signal || code}`);
        stopChildren();
      }
    });
  }

  return new Promise((resolve) => {
    let remaining = children.length;
    let finalCode = 0;
    for (const child of children) {
      child.on('exit', (code) => {
        if (typeof code === 'number' && code !== 0 && finalCode === 0) {
          finalCode = code;
        }
        remaining -= 1;
        if (remaining === 0) {
          resolve(finalCode);
        }
      });
    }
  });
}

module.exports = {
  capture,
  runConcurrent,
  runForeground,
  runSync,
};
