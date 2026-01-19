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
 * 
 * Handles CommonJS modules that are wrapped in a default export when using import()
 */
async function loadNutJs() {
  // Cache the module import (ES modules are cached by Node.js anyway)
  if (!nutjsModule) {
    // Try using require() first for CommonJS modules (more reliable)
    // This avoids the default export wrapper issue with import()
    try {
      // Try build directory first (development) - use package.json main field
      const buildPackagePath = path.resolve(__dirname, '../../../../nutjs-build/nut.js/core/nut.js');
      const buildPackageJson = path.join(buildPackagePath, 'package.json');
      const buildIndexPath = path.resolve(__dirname, '../../../../nutjs-build/nut.js/core/nut.js/dist/index.js');
      
      if (fs.existsSync(buildIndexPath)) {
        try {
          console.log('[NutJsLoader] Attempting to require from build package:', buildPackagePath);
          // Try requiring from package directory (uses package.json main field)
          nutjsModule = require(buildPackagePath);
          console.log('[NutJsLoader] Successfully loaded from build package using require()');
        } catch (error) {
          console.error('[NutJsLoader] Failed to require from build package:', error.message);
          // Try direct path as fallback
          try {
            console.log('[NutJsLoader] Trying direct build path:', buildIndexPath);
            nutjsModule = require(buildIndexPath);
            console.log('[NutJsLoader] Successfully loaded from direct build path using require()');
          } catch (directError) {
            console.error('[NutJsLoader] Failed to require from direct build path:', directError.message);
            // Fall through to npm package
            try {
              nutjsModule = require('@nut-tree/nut-js');
              console.log('[NutJsLoader] Successfully loaded from npm package using require()');
            } catch (npmError) {
              console.error('[NutJsLoader] Failed to require from npm package:', npmError.message);
              throw new Error(`Failed to load nut-js: build error (${error.message}), direct error (${directError.message}), npm error (${npmError.message})`);
            }
          }
        }
      } else {
        // Normal require
        console.log('[NutJsLoader] Build path not found, loading from npm package using require()');
        nutjsModule = require('@nut-tree/nut-js');
        console.log('[NutJsLoader] Successfully loaded from npm package using require()');
      }
    } catch (requireError) {
      // If require() fails, fall back to import() (for ES modules)
      console.log('[NutJsLoader] require() failed, trying import():', requireError.message);
      let rawModule;
      
      // Try build directory first (development)
      const buildPath = path.resolve(__dirname, '../../../../nutjs-build/nut.js/core/nut.js/dist/index.js');
      if (fs.existsSync(buildPath)) {
        try {
          const buildUrl = `file:///${buildPath.replace(/\\/g, '/')}`;
          console.log('[NutJsLoader] Attempting to import from build path:', buildUrl);
          rawModule = await import(buildUrl);
          console.log('[NutJsLoader] Successfully loaded from build path using import()');
        } catch (error) {
          console.error('[NutJsLoader] Failed to import from build path:', error.message);
          // Fall through to normal import
          try {
            rawModule = await import('@nut-tree/nut-js');
            console.log('[NutJsLoader] Successfully loaded from npm package using import()');
          } catch (npmError) {
            console.error('[NutJsLoader] Failed to import from npm package:', npmError.message);
            throw new Error(`Failed to load nut-js: require error (${requireError.message}), build error (${error.message}), npm error (${npmError.message})`);
          }
        }
      } else {
        // Normal import
        console.log('[NutJsLoader] Build path not found, loading from npm package using import()');
        try {
          rawModule = await import('@nut-tree/nut-js');
          console.log('[NutJsLoader] Successfully loaded from npm package using import()');
        } catch (error) {
          console.error('[NutJsLoader] Failed to import from npm package:', error.message);
          throw new Error(`Failed to load nut-js: require error (${requireError.message}), import error (${error.message})`);
        }
      }
      
      // CommonJS modules imported via import() are wrapped in a default export
      // Check if exports are under 'default' and unwrap them
      const hasDefault = 'default' in rawModule && rawModule.default !== undefined;
      
      // Check both default and direct exports
      const defaultHasExports = hasDefault && (
        ('keyboard' in rawModule.default) ||
        ('mouse' in rawModule.default) ||
        ('screen' in rawModule.default)
      );
      
      const directHasExports = ('keyboard' in rawModule) ||
        ('mouse' in rawModule) ||
        ('screen' in rawModule);
      
      if (defaultHasExports) {
        nutjsModule = rawModule.default;
        console.log('[NutJsLoader] Using default export from import()');
      } else if (directHasExports) {
        nutjsModule = rawModule;
        console.log('[NutJsLoader] Using direct exports from import()');
      } else if (hasDefault && typeof rawModule.default === 'object' && rawModule.default !== null) {
        nutjsModule = rawModule.default;
        console.log('[NutJsLoader] Using default export from import() (fallback)');
      } else {
        nutjsModule = rawModule;
        console.log('[NutJsLoader] Using raw module from import() (fallback)');
      }
    }
    
    // Verify we got a valid module
    if (!nutjsModule) {
      throw new Error('nut-js module loaded but is null/undefined');
    }
    
    // Validate that the module has expected exports
    const moduleKeys = Object.keys(nutjsModule);
    const hasKeyboard = 'keyboard' in nutjsModule;
    const hasMouse = 'mouse' in nutjsModule;
    const hasScreen = 'screen' in nutjsModule;
    
    console.log('[NutJsLoader] Final module structure:', {
      hasModule: !!nutjsModule,
      keysCount: moduleKeys.length,
      keys: moduleKeys.slice(0, 15),
      hasKeyboard,
      hasMouse,
      hasScreen,
      hasKey: 'Key' in nutjsModule,
      hasButton: 'Button' in nutjsModule
    });
    
    // If module is empty or missing critical exports, throw error
    if (moduleKeys.length === 0 || (!hasKeyboard && !hasMouse && !hasScreen)) {
      throw new Error(`nut-js module loaded but appears empty or invalid. Keys: ${moduleKeys.length}, hasKeyboard: ${hasKeyboard}, hasMouse: ${hasMouse}, hasScreen: ${hasScreen}`);
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
