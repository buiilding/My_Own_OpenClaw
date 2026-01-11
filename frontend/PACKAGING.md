# Electron App Packaging Guide

This document explains how to package the Electron app for distribution, including handling the nut-js dependency.

## Current Setup

The app uses a custom-built version of `@nut-tree/nut-js` from source. The loader (`src/main/tools/nutjs_loader.cjs`) automatically detects the environment and loads nut-js from the appropriate location.

## Packaging Requirements

### Option 1: Bundle nut-js with the App (Recommended)

1. **Copy nut-js build into app resources** during the packaging process
2. The loader will automatically detect and use it in packaged apps

**Steps:**
```bash
# Before packaging, copy the built nut-js
cp -r nutjs-build/nut.js/core/nut.js/dist <app-resources>/nut-js/dist
```

### Option 2: Install nut-js as Regular Package

1. **Replace the link with a proper installation:**
   ```json
   // In package.json, change:
   "@nut-tree/nut-js": "link:"
   // To:
   "@nut-tree/nut-js": "file:../nutjs-build/nut.js/core/nut.js"
   ```

2. **Run npm install** to properly install it
3. Standard Electron packagers (electron-builder, electron-forge) will bundle it automatically

### Option 3: Use electron-builder with extraResources

If using `electron-builder`, add to `package.json`:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "../nutjs-build/nut.js/core/nut.js/dist",
        "to": "nut-js/dist",
        "filter": ["**/*"]
      }
    ]
  }
}
```

## Loader Behavior

The `nutjs_loader.cjs` automatically handles:

1. **Development mode**:**
   - Loads from `nutjs-build/nut.js/core/nut.js/dist/index.js`
   - Falls back to linked package if build directory doesn't exist

2. **Packaged app:**
   - Tries bundled resources first (`process.resourcesPath/nut-js/dist/index.js`)
   - Falls back to `node_modules/@nut-tree/nut-js` if properly installed
   - Falls back to linked package (may have issues)

## Testing Packaging

To test if packaging will work:

1. Build the app: `npm run build`
2. Test in production mode: `NODE_ENV=production npm run electron`
3. Verify nut-js loads correctly

## Native Dependencies

⚠️ **Important**: nut-js includes native `.node` files that must be included in the package:
- `libnut-win32.node` (Windows)
- These are in `nutjs-build/libnut-core/build/Release/`

Make sure your packager includes these native modules!

## Recommended Packaging Tool

Consider using **electron-builder** which handles:
- Native dependencies automatically
- Code signing
- Auto-updater support
- Cross-platform builds

Install:
```bash
npm install --save-dev electron-builder
```

Add to `package.json`:
```json
{
  "scripts": {
    "dist": "electron-builder"
  },
  "build": {
    "appId": "com.yourcompany.desktop-assistant",
    "productName": "Desktop Assistant",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "dist/**/*",
      "src/main/**/*",
      "node_modules/**/*"
    ],
    "extraResources": [
      {
        "from": "../nutjs-build/nut.js/core/nut.js/dist",
        "to": "nut-js/dist"
      },
      {
        "from": "../nutjs-build/libnut-core/build/Release",
        "to": "libnut-core/build/Release"
      }
    ]
  }
}
```
