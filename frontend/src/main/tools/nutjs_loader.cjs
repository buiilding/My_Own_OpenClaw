/**
 * nut-js Loader Helper
 * Simple loader that tries build directory first, then normal import
 */

const path = require('path');
const fs = require('fs');

let nutjsModule = null;

/**
 * Load nut-js module - simple and straightforward
 * Returns the actual nut-js module exports (not a wrapper)
 */
async function loadNutJs() {
  // Cache the module import (ES modules are cached by Node.js anyway)
  if (!nutjsModule) {
    // Try build directory first (development)
    const buildPath = path.resolve(__dirname, '../../../../nutjs-build/nut.js/core/nut.js/dist/index.js');
    if (fs.existsSync(buildPath)) {
      try {
        const buildUrl = `file:///${buildPath.replace(/\\/g, '/')}`;
        nutjsModule = await import(buildUrl);
      } catch (error) {
        // Fall through to normal import
        nutjsModule = await import('@nut-tree/nut-js');
      }
    } else {
      // Normal import
      nutjsModule = await import('@nut-tree/nut-js');
    }
    
    // Configure keyboard delay once (nut-js uses singleton instances)
    if (nutjsModule.keyboard && nutjsModule.keyboard.config) {
      nutjsModule.keyboard.config.autoDelayMs = 10;
    }
  }
  
  // Return the actual module exports directly (like normal nut-js usage)
  return nutjsModule;
}

module.exports = {
  loadNutJs,
};
