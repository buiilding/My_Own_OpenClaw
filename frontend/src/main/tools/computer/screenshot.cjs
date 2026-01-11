/**
 * Screenshot Tool - Node.js implementation using nut-js
 */

const { loadNutJs } = require('../nutjs_loader.cjs');
const { PNG } = require('pngjs');

/**
 * Capture screenshot
 */
async function captureScreenshot(args, skipAutoCapture) {
  try {
    const nutjs = await loadNutJs();
    const { screen } = nutjs;
    const screenshot = await screen.grab();
    
    // Convert raw RGBA pixel data to PNG, then to base64
    // nut-js returns raw pixel data in screenshot.data property
    if (!screenshot.data || !screenshot.width || !screenshot.height) {
      throw new Error('Screenshot missing required properties (data, width, height)');
    }

    const { width, height, data } = screenshot;
    const pixelBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Create PNG from raw RGBA data
    const png = new PNG({ width, height });
    const bytesToCopy = Math.min(pixelBuffer.length, png.data.length);
    pixelBuffer.copy(png.data, 0, 0, bytesToCopy);
    
    // Encode to PNG buffer and convert to base64
    const pngBuffer = PNG.sync.write(png);
    const base64Data = pngBuffer.toString('base64');

    return {
      success: true,
      data: {
        screenshot: base64Data,
        compression: 'png',
        size: Math.floor(base64Data.length * 0.75),
        llm_content: 'Screenshot captured successfully.',
        return_display: 'Screenshot captured',
      },
    };
  } catch (error) {
    console.error(`[ScreenshotTool] Error: ${error.message}`, error);
    return { success: false, error: `Screenshot failed: ${error.message}` };
  }
}

module.exports = {
  captureScreenshot,
};
