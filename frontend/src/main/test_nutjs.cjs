/**
 * Test script for nut-js functionality
 * Run with: node src/main/test_nutjs.cjs
 * 
 * This script tests the core nut-js features to verify the installation is working correctly.
 */

// Use dynamic import to avoid Electron dependencies
// Import directly from the build directory to avoid link issues
const path = require('path');
let mouse, keyboard, screen, Button, Key, Point;

async function loadNutJs() {
  if (!mouse) {
    // Try to import from the actual build location first
    const buildPath = path.resolve(__dirname, '../../../nutjs-build/nut.js/core/nut.js/dist/index.js');
    const buildUrl = `file:///${buildPath.replace(/\\/g, '/')}`;
    try {
      const nutjs = await import(buildUrl);
      mouse = nutjs.mouse;
      keyboard = nutjs.keyboard;
      screen = nutjs.screen;
      Button = nutjs.Button;
      Key = nutjs.Key;
      Point = nutjs.Point;
      console.log('[Test] Loaded nut-js from build directory');
    } catch (buildError) {
      // Fallback to linked package
      try {
        const nutjs = await import('@nut-tree/nut-js');
        mouse = nutjs.mouse;
        keyboard = nutjs.keyboard;
        screen = nutjs.screen;
        Button = nutjs.Button;
        Key = nutjs.Key;
        Point = nutjs.Point;
        console.log('[Test] Loaded nut-js from linked package');
      } catch (linkError) {
        throw new Error(`Failed to load nut-js from build (${buildError.message}) or link (${linkError.message})`);
      }
    }
  }
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n[TEST] ${name}`, 'cyan');
}

function logSuccess(message) {
  log(`  ✓ ${message}`, 'green');
}

function logError(message) {
  log(`  ✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`  ⚠ ${message}`, 'yellow');
}

async function testMousePosition() {
  logTest('Mouse Position');
  try {
    await loadNutJs();
    const position = await mouse.getPosition();
    logSuccess(`Current mouse position: (${position.x}, ${position.y})`);
    return true;
  } catch (error) {
    logError(`Failed to get mouse position: ${error.message}`);
    return false;
  }
}

async function testMouseMove() {
  logTest('Mouse Move');
  try {
    await loadNutJs();
    const currentPos = await mouse.getPosition();
    const targetX = currentPos.x + 50;
    const targetY = currentPos.y + 50;
    
    await mouse.setPosition(new Point(targetX, targetY));
    const newPos = await mouse.getPosition();
    
    logSuccess(`Moved mouse from (${currentPos.x}, ${currentPos.y}) to (${newPos.x}, ${newPos.y})`);
    
    // Move back
    await mouse.setPosition(new Point(currentPos.x, currentPos.y));
    logSuccess('Moved mouse back to original position');
    return true;
  } catch (error) {
    logError(`Failed to move mouse: ${error.message}`);
    return false;
  }
}

async function testMouseClick() {
  logTest('Mouse Click');
  try {
    await loadNutJs();
    const currentPos = await mouse.getPosition();
    logWarning('Performing left click at current position (move mouse to safe area first!)');
    
    // Small delay before click
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await mouse.click(Button.LEFT);
    logSuccess('Left click performed');
    return true;
  } catch (error) {
    logError(`Failed to click: ${error.message}`);
    return false;
  }
}

async function testKeyboardType() {
  logTest('Keyboard Type');
  try {
    await loadNutJs();
    logWarning('Will type "Hello from nut-js!" - make sure a text editor is focused!');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await keyboard.type('Hello from nut-js!');
    logSuccess('Text typed successfully');
    return true;
  } catch (error) {
    logError(`Failed to type: ${error.message}`);
    return false;
  }
}

async function testKeyboardPress() {
  logTest('Keyboard Key Press');
  try {
    await loadNutJs();
    logWarning('Will press Enter key - make sure a safe application is focused!');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await keyboard.pressKey(Key.Enter);
    logSuccess('Enter key pressed');
    return true;
  } catch (error) {
    logError(`Failed to press key: ${error.message}`);
    return false;
  }
}

async function testScreenshot() {
  logTest('Screenshot');
  try {
    await loadNutJs();
    const image = await screen.grab();
    logSuccess(`Screenshot captured: ${image.width}x${image.height} pixels`);
    
    // Test getting pixel color (if API supports it)
    try {
      if (typeof image.colorAt === 'function') {
        const color = await image.colorAt(new Point(100, 100));
        logSuccess(`Pixel color at (100, 100): RGB(${color.R}, ${color.G}, ${color.B})`);
      } else if (image.getColor) {
        const color = await image.getColor(new Point(100, 100));
        logSuccess(`Pixel color at (100, 100): RGB(${color.R}, ${color.G}, ${color.B})`);
      } else {
        logWarning('colorAt/getColor API not available, but screenshot capture works');
      }
    } catch (colorError) {
      logWarning(`Could not get pixel color: ${colorError.message}`);
    }
    return true;
  } catch (error) {
    logError(`Failed to capture screenshot: ${error.message}`);
    return false;
  }
}

async function testScreenSize() {
  logTest('Screen Size');
  try {
    await loadNutJs();
    const width = await screen.width();
    const height = await screen.height();
    logSuccess(`Screen size: ${width}x${height}`);
    return true;
  } catch (error) {
    logError(`Failed to get screen size: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  log('\n========================================', 'blue');
  log('  nut-js Functionality Test Suite', 'blue');
  log('========================================\n', 'blue');
  
  log('⚠️  WARNING: Some tests will interact with your system!', 'yellow');
  log('⚠️  Make sure you have a safe application focused (like Notepad)', 'yellow');
  log('⚠️  You have 5 seconds to prepare...\n', 'yellow');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };
  
  // Non-interactive tests first
  const nonInteractiveTests = [
    { name: 'Mouse Position', fn: testMousePosition },
    { name: 'Screen Size', fn: testScreenSize },
    { name: 'Screenshot', fn: testScreenshot },
  ];
  
  for (const test of nonInteractiveTests) {
    const passed = await test.fn();
    results.tests.push({ name: test.name, passed });
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  log('\n--- Interactive Tests (will modify your system) ---', 'yellow');
  log('Press Ctrl+C to skip interactive tests, or wait 3 seconds...\n', 'yellow');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Interactive tests (commented out by default for safety)
  // Uncomment these if you want to test them:
  /*
  const interactiveTests = [
    { name: 'Mouse Move', fn: testMouseMove },
    { name: 'Mouse Click', fn: testMouseClick },
    { name: 'Keyboard Type', fn: testKeyboardType },
    { name: 'Keyboard Press', fn: testKeyboardPress },
  ];
  
  for (const test of interactiveTests) {
    const passed = await test.fn();
    results.tests.push({ name: test.name, passed });
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  */
  
  // Summary
  log('\n========================================', 'blue');
  log('  Test Results Summary', 'blue');
  log('========================================\n', 'blue');
  
  results.tests.forEach(test => {
    if (test.passed) {
      logSuccess(`${test.name}: PASSED`);
    } else {
      logError(`${test.name}: FAILED`);
    }
  });
  
  log(`\nTotal: ${results.passed + results.failed} tests`);
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.failed === 0) {
    log('\n🎉 All tests passed! nut-js is working correctly.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the errors above.', 'yellow');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  logError(`\nFatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
