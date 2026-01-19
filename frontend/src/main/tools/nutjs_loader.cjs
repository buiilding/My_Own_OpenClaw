/**
 * nut-js Loader Helper
 * Simple loader that tries build directory first, then normal import
 * Uses createRequire for CommonJS modules to avoid ES module import issues
 */

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

let nutjsModule = null;

/**
 * Load nut-js module - simple and straightforward
 * Returns the actual nut-js module exports (not a wrapper)
 */
async function loadNutJs() {
  // Cache the module (CommonJS require is synchronous and cached)
  if (!nutjsModule) {
    // Try build directory first (development)
    const buildPath = path.resolve(__dirname, '../../../../nutjs-build/nut.js/core/nut.js/dist/index.js');
    
    try {
      if (fs.existsSync(buildPath)) {
        // Use createRequire to load CommonJS module from build directory
        // createRequire needs a referrer - use this file's path
        const buildRequire = createRequire(__filename);
        nutjsModule = buildRequire(buildPath);
      } else {
        // Fall back to normal require from node_modules
        nutjsModule = require('@nut-tree/nut-js');
      }
    } catch (error) {
      console.error('[NutJsLoader] Failed to load from build, trying node_modules:', error.message);
      try {
        nutjsModule = require('@nut-tree/nut-js');
      } catch (fallbackError) {
        console.error('[NutJsLoader] Failed to load from node_modules:', fallbackError.message);
        throw new Error(`Failed to load nut-js: ${fallbackError.message}`);
      }
    }
    
    // Verify we have the expected exports
    if (!nutjsModule) {
      throw new Error('nut-js module loaded but is null/undefined');
    }
    
    const hasScreen = !!(nutjsModule.screen);
    const hasMouse = !!(nutjsModule.mouse);
    const hasKeyboard = !!(nutjsModule.keyboard);
    
    if (!hasScreen || !hasMouse || !hasKeyboard) {
      const availableKeys = Object.keys(nutjsModule);
      console.error('[NutJsLoader] Missing expected exports:', {
        hasScreen,
        hasMouse,
        hasKeyboard,
        availableKeys: availableKeys.slice(0, 20) // First 20 keys
      });
      throw new Error(`nut-js module missing required exports. Available: ${availableKeys.join(', ')}`);
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
