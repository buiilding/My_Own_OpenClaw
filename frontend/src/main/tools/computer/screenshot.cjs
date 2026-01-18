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
    
    // nut-js returns pixel data in BGR format by default
    // Convert to RGB format using the built-in toRGB() method (async)
    let rgbScreenshot;
    if (typeof screenshot.toRGB === 'function') {
      rgbScreenshot = await screenshot.toRGB();
    } else {
      // Fallback: manual conversion if toRGB() is not available
      rgbScreenshot = screenshot;
    }
    
    if (!rgbScreenshot.data || !rgbScreenshot.width || !rgbScreenshot.height) {
      throw new Error('Screenshot missing required properties (data, width, height)');
    }

    const { width, height, data } = rgbScreenshot;
    const pixelBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Create PNG from RGBA data
    const png = new PNG({ width, height });
    
    // If toRGB() was used, the data is already in RGB format
    // Otherwise, manually convert BGR to RGB by swapping red and blue channels
    if (typeof screenshot.toRGB === 'function') {
      // Data is already RGB, just copy it
      const bytesToCopy = Math.min(pixelBuffer.length, png.data.length);
      pixelBuffer.copy(png.data, 0, 0, bytesToCopy);
    } else {
      // Manual conversion: BGR to RGB
      // Each pixel is 4 bytes: [B, G, R, A] in BGR format -> [R, G, B, A] in RGB format
      for (let i = 0; i < pixelBuffer.length && i < png.data.length; i += 4) {
        // BGR format: [B, G, R, A]
        const b = pixelBuffer[i];     // Blue
        const g = pixelBuffer[i + 1]; // Green
        const r = pixelBuffer[i + 2]; // Red
        const a = pixelBuffer[i + 3]; // Alpha
        
        // RGB format: [R, G, B, A]
        png.data[i] = r;     // Red
        png.data[i + 1] = g; // Green
        png.data[i + 2] = b; // Blue
        png.data[i + 3] = a; // Alpha
      }
    }
    
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
