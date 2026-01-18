/**
 * Write File Tool - Node.js implementation using fs
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Write file contents
 */
async function writeFile(args, skipAutoCapture) {
  const { file_path, content } = args;

  try {
    // Validate absolute path
    if (!path.isAbsolute(file_path)) {
      return { success: false, error: `File path must be absolute: ${file_path}` };
    }

    // Ensure directory exists
    const dir = path.dirname(file_path);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(file_path, content, 'utf-8');

    return {
      success: true,
      data: {
        file_path,
        bytes_written: Buffer.byteLength(content, 'utf-8'),
        llm_content: `Successfully wrote to ${file_path}`,
      },
    };
  } catch (error) {
    console.error(`[WriteFileTool] Error: ${error.message}`, error);
    return { success: false, error: `Failed to write file: ${error.message}` };
  }
}

module.exports = {
  writeFile,
};
