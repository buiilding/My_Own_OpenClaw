/**
 * Screenshot Tool - Node.js implementation using nut-js
 */

const { screen, Image } = require('@nut-tree/nut-js');

/**
 * Capture screenshot
 */
async function captureScreenshot(args, skipAutoCapture) {
  try {
    // Capture screen using nut-js
    const screenshot = await screen.grabScreen();
    
    // Convert to base64 (nut-js Image has toBase64 method)
    const base64Data = await screenshot.toBase64();
    
    // Get image size (approximate from base64 length)
    const imgSize = Math.floor(base64Data.length * 0.75); // Base64 is ~33% larger than binary

    return {
      success: true,
      data: {
        screenshot: base64Data,
        compression: 'png', // nut-js uses PNG by default
        size: imgSize,
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
