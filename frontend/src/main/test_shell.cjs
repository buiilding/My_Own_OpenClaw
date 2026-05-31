/**
 * Test script for shell tool - specifically testing google-chrome command
 * 
 * Run with: node src/main/test_shell.cjs
 */

// NOTE: The shell tool implementation lives in Python (src/main/python/tools/system/shell_tool.py).
// This JS smoke-test used to import a CJS wrapper that no longer exists.
// For local smoke tests, we invoke the python module directly.
const { spawn } = require('child_process');

async function runShellCommand(params) {
  const payload = JSON.stringify(params);

  return await new Promise((resolve) => {
    const python = process.env.WINDIE_PYTHON_PATH || 'python3';
    const env = {
      ...process.env,
      // Ensure shell_tool.py can import `tools.*` from src/main/python
      PYTHONPATH: [
        process.env.PYTHONPATH,
        'src/main/python',
      ].filter(Boolean).join(':'),
    };

    const child = spawn(python, [
      'src/main/python/tools/system/shell_tool.py',
      payload,
    ], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));

    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve({ success: true, data: JSON.parse(out) });
        } catch (e) {
          resolve({ success: false, error: `Failed to parse JSON: ${e.message}`, data: { raw: out, stderr: err } });
        }
      } else {
        resolve({ success: false, error: err || `python exited with code ${code}`, data: { raw: out } });
      }
    });
  });
}


// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logTest(testName) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}Testing: ${testName}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`  ${message}`);
}

/**
 * Test opening Google Chrome in background
 */
async function testOpenChromeBackground() {
  logTest('Open Google Chrome (Background)');
  
  try {
    const result = await runShellCommand({
      command: 'google-chrome',
      run_in_background: true,
    }, false);
    
    if (result.success) {
      logSuccess('Chrome command executed successfully');
      logInfo(`Command: ${result.data.command}`);
      logInfo(`Working Directory: ${result.data.working_directory}`);
      logInfo(`Output: ${result.data.output}`);
      return true;
    } else {
      logError(`Failed to execute command: ${result.error}`);
      return false;
    }
  } catch (error) {
    logError(`Test failed with exception: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test opening Google Chrome with specific URL
 */
async function testOpenChromeWithUrl() {
  logTest('Open Google Chrome with URL (Background)');
  
  try {
    // Try different Chrome command variations based on OS
    const os = require('os');
    let chromeCommand;
    
    if (os.platform() === 'win32') {
      // Windows: try chrome.exe or start chrome
      chromeCommand = 'start chrome https://www.google.com';
    } else if (os.platform() === 'darwin') {
      // macOS: use open command
      chromeCommand = 'open -a "Google Chrome" https://www.google.com';
    } else {
      // Linux: use google-chrome or chromium
      chromeCommand = 'google-chrome https://www.google.com';
    }
    
    logInfo(`Platform: ${os.platform()}`);
    logInfo(`Command: ${chromeCommand}`);
    
    const result = await runShellCommand({
      command: chromeCommand,
      run_in_background: true,
    }, false);
    
    if (result.success) {
      logSuccess('Chrome with URL command executed successfully');
      logInfo(`Command: ${result.data.command}`);
      logInfo(`Working Directory: ${result.data.working_directory}`);
      return true;
    } else {
      logWarning(`Command execution returned error: ${result.error}`);
      logInfo('This might be expected if Chrome is not installed or path is different');
      return false;
    }
  } catch (error) {
    logError(`Test failed with exception: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test foreground command execution (simple echo command)
 */
async function testForegroundCommand() {
  logTest('Foreground Command Execution (Echo Test)');
  
  try {
    const os = require('os');
    let testCommand;
    
    if (os.platform() === 'win32') {
      testCommand = 'echo "Hello from Windows"';
    } else {
      testCommand = 'echo "Hello from Unix"';
    }
    
    logInfo(`Platform: ${os.platform()}`);
    logInfo(`Command: ${testCommand}`);
    
    const result = await runShellCommand({
      command: testCommand,
      run_in_background: false,
      terminate_after_seconds: 5,
    }, false);
    
    if (result.success) {
      logSuccess('Foreground command executed successfully');
      logInfo(`Output: ${result.data.output?.trim() || '(empty)'}`);
      logInfo(`Exit Code: ${result.data.exit_code}`);
      logInfo(`Execution Time: ${result.data.execution_time?.toFixed(3)}s`);
      return true;
    } else {
      logError(`Command failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    logError(`Test failed with exception: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test Chrome command variations
 */
async function testChromeCommandVariations() {
  logTest('Chrome Command Variations');
  
  const os = require('os');
  const platform = os.platform();
  
  const chromeCommands = [];
  
  if (platform === 'win32') {
    chromeCommands.push(
      'google-chrome',
      'chrome',
      'start chrome',
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'
    );
  } else if (platform === 'darwin') {
    chromeCommands.push(
      'google-chrome',
      'open -a "Google Chrome"',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    );
  } else {
    chromeCommands.push(
      'google-chrome',
      'chromium',
      'chromium-browser',
      'google-chrome-stable'
    );
  }
  
  logInfo(`Platform: ${platform}`);
  logInfo(`Testing ${chromeCommands.length} command variations...`);
  
  let successCount = 0;
  
  for (const cmd of chromeCommands) {
    try {
      logInfo(`\n  Trying: ${cmd}`);
      const result = await runShellCommand({
        command: cmd,
        run_in_background: true,
      }, false);
      
      if (result.success) {
        logSuccess(`  ✓ Command succeeded: ${cmd}`);
        successCount++;
        // Only test first successful command to avoid opening multiple Chrome instances
        break;
      } else {
        logWarning(`  ✗ Command failed: ${cmd} - ${result.error}`);
      }
    } catch (error) {
      logWarning(`  ✗ Command exception: ${cmd} - ${error.message}`);
    }
  }
  
  if (successCount > 0) {
    logSuccess(`Found ${successCount} working Chrome command(s)`);
    return true;
  } else {
    logWarning('No working Chrome commands found (Chrome may not be installed)');
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.cyan}╔════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   Shell Tool Test - Google Chrome Opening     ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════╝${colors.reset}`);
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };
  
  // Run tests
  const tests = [
    { name: 'Open Chrome (Background)', fn: testOpenChromeBackground },
    { name: 'Open Chrome with URL', fn: testOpenChromeWithUrl },
    { name: 'Foreground Command', fn: testForegroundCommand },
    { name: 'Chrome Command Variations', fn: testChromeCommandVariations },
  ];
  
  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      results.failed++;
      logError(`Test "${test.name}" threw exception: ${error.message}`);
    }
  }
  
  // Print summary
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}Test Summary${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`Total Tests: ${results.total}`);
  console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
  
  if (results.failed === 0) {
    console.log(`\n${colors.green}✓ All tests passed!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.yellow}⚠ Some tests failed (this may be expected if Chrome is not installed)${colors.reset}`);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  testOpenChromeBackground,
  testOpenChromeWithUrl,
  testForegroundCommand,
  testChromeCommandVariations,
};
