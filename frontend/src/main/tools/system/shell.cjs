/**
 * Shell Tool - Node.js implementation using child_process
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);
const DEFAULT_SHELL_TIMEOUT = 120.0;

/**
 * Execute shell command
 */
async function runShellCommand(args, skipAutoCapture) {
  const { command, directory, run_in_background, terminate_after_seconds } = args;

  try {
    const cmd = command.trim();
    if (!cmd) {
      return { success: false, error: 'Command cannot be empty' };
    }
    
    // Log the command being executed
    console.log(`[ShellTool] Executing command: "${cmd}"`);
    if (directory) {
      console.log(`[ShellTool] Working directory: ${directory}`);
    }
    console.log(`[ShellTool] Background mode: ${run_in_background ? 'Yes' : 'No'}`);
    if (!run_in_background && terminate_after_seconds) {
      console.log(`[ShellTool] Timeout: ${terminate_after_seconds} seconds`);
    }

    // Determine working directory
    let workingDir = directory;
    if (workingDir) {
      if (!path.isAbsolute(workingDir)) {
        return { success: false, error: 'Directory must be an absolute path' };
      }
      try {
        const stats = await require('fs').promises.stat(workingDir);
        if (!stats.isDirectory()) {
          return { success: false, error: `Directory does not exist or is not a directory: ${workingDir}` };
        }
      } catch (error) {
        return { success: false, error: `Directory does not exist: ${workingDir}` };
      }
    } else {
      workingDir = process.cwd();
    }

    // Handle background execution
    if (run_in_background) {
      console.log(`[ShellTool] Starting background command execution...`);
      await executeBackgroundCommand(cmd, workingDir);
      console.log(`[ShellTool] Background command started successfully`);
      return {
        success: true,
        data: {
          command: cmd,
          working_directory: workingDir,
          llm_content: `Command '${cmd}' has been executed in the background.`,
          return_display: `Command executed in background: ${cmd}`,
        },
      };
    }

    // Foreground execution
    const timeout = terminate_after_seconds !== null && terminate_after_seconds !== undefined
      ? terminate_after_seconds * 1000
      : DEFAULT_SHELL_TIMEOUT * 1000;

    console.log(`[ShellTool] Starting foreground command execution...`);
    const result = await executeForegroundCommand(cmd, workingDir, timeout);
    const llmContent = formatLlmOutput(cmd, workingDir, result);
    const returnDisplay = formatDisplayOutput(result);
    const success = result.exit_code === 0 || result.exit_code === null;

    console.log(`[ShellTool] Command execution completed:`);
    console.log(`[ShellTool]   Exit Code: ${result.exit_code}`);
    console.log(`[ShellTool]   Execution Time: ${result.execution_time.toFixed(3)}s`);
    console.log(`[ShellTool]   Timed Out: ${result.timed_out ? 'Yes' : 'No'}`);
    if (result.output) {
      const outputPreview = result.output.length > 100 ? result.output.substring(0, 100) + '...' : result.output;
      console.log(`[ShellTool]   Output: ${outputPreview.replace(/\n/g, '\\n')}`);
    }
    if (result.error) {
      const errorPreview = result.error.length > 100 ? result.error.substring(0, 100) + '...' : result.error;
      console.log(`[ShellTool]   Error: ${errorPreview.replace(/\n/g, '\\n')}`);
    }

    return {
      success,
      data: {
        command: cmd,
        working_directory: workingDir,
        output: result.output,
        error: result.error,
        exit_code: result.exit_code,
        execution_time: result.execution_time,
        llm_content: llmContent,
        return_display: returnDisplay,
      },
    };
  } catch (error) {
    console.error(`[ShellTool] Error: ${error.message}`, error);
    return { success: false, error: `Failed to execute command: ${error.message}` };
  }
}

/**
 * Execute command in background
 */
async function executeBackgroundCommand(command, workingDir) {
  return new Promise((resolve, reject) => {
    const options = {
      cwd: workingDir,
      shell: true,
      stdio: 'ignore',
    };

    if (os.platform() === 'win32') {
      options.detached = true;
      options.creationFlags = 0x00000200; // CREATE_NEW_PROCESS_GROUP
    } else {
      options.detached = true;
    }

    const child = spawn(command, [], options);
    child.unref();
    resolve();
  });
}

/**
 * Execute command in foreground with timeout
 */
async function executeForegroundCommand(command, workingDir, timeoutMs) {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let timedOut = false;
    let process = null;

    // Determine shell command
    let shellCmd;
    let shellArgs;
    if (os.platform() === 'win32') {
      shellCmd = 'powershell.exe';
      shellArgs = ['-NoProfile', '-NonInteractive', '-Command', command];
    } else {
      shellCmd = 'bash';
      shellArgs = ['-c', command];
    }

    process = spawn(shellCmd, shellArgs, {
      cwd: workingDir,
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      process.kill();
    }, timeoutMs);

    process.on('close', (code) => {
      clearTimeout(timeout);
      const executionTime = (Date.now() - startTime) / 1000;

      resolve({
        output: stdout,
        error: stderr,
        exit_code: code,
        execution_time: executionTime,
        timed_out: timedOut,
      });
    });

    process.on('error', (error) => {
      clearTimeout(timeout);
      const executionTime = (Date.now() - startTime) / 1000;

      resolve({
        output: stdout,
        error: error.message,
        exit_code: null,
        execution_time: executionTime,
        timed_out: false,
      });
    });
  });
}

/**
 * Format output for LLM
 */
function formatLlmOutput(command, workingDir, result) {
  const parts = [
    `Command: ${command}`,
    `Directory: ${workingDir}`,
  ];

  if (result.output) {
    parts.push(`Output:\n${result.output}`);
  }

  if (result.error) {
    parts.push(`Error:\n${result.error}`);
  }

  if (result.exit_code !== null) {
    parts.push(`Exit Code: ${result.exit_code}`);
  }

  if (result.timed_out) {
    parts.push('Status: Command timed out and was terminated');
  } else if (result.exit_code === 0) {
    parts.push('Status: Success');
  } else {
    parts.push('Status: Failed (non-zero exit code)');
  }

  parts.push(`Execution Time: ${result.execution_time.toFixed(2)} seconds`);

  return parts.join('\n');
}

/**
 * Format output for display
 */
function formatDisplayOutput(result) {
  let status;
  if (result.timed_out) {
    status = 'Command timed out and was terminated';
  } else if (result.exit_code === 0) {
    status = 'Command completed successfully';
  } else if (result.exit_code !== null) {
    status = `Command failed with exit code ${result.exit_code}`;
  } else {
    status = 'Command execution completed';
  }

  const outputLines = [];
  if (result.output) {
    outputLines.push(`Output:\n${result.output}`);
  }
  if (result.error) {
    outputLines.push(`Error:\n${result.error}`);
  }

  const outputText = outputLines.length > 0 ? outputLines.join('\n') : 'No output';

  return `${status}\n${outputText}`;
}

module.exports = {
  runShellCommand,
};
