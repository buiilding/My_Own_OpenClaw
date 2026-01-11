/**
 * Read File Tool - Node.js implementation using fs
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Read file contents
 */
async function readFile(args, skipAutoCapture) {
  const { file_path, offset, limit } = args;

  try {
    // Validate absolute path
    if (!path.isAbsolute(file_path)) {
      return { success: false, error: `File path must be absolute: ${file_path}` };
    }

    // Check if file exists
    try {
      const stats = await fs.stat(file_path);
      if (!stats.isFile()) {
        return { success: false, error: `Not a file: ${file_path}` };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, error: `File not found: ${file_path}` };
      }
      throw error;
    }

    // Read file
    const content = await fs.readFile(file_path, 'utf-8');
    const lines = content.split('\n');

    // Apply offset and limit
    const start = offset !== null && offset !== undefined ? offset : 0;
    const end = limit !== null && limit !== undefined ? start + limit : lines.length;
    const contentLines = lines.slice(start, end);
    const contentText = contentLines.join('\n');

    return {
      success: true,
      data: {
        content: contentText,
        file_path,
        total_lines: lines.length,
        read_lines: contentLines.length,
        llm_content: contentText || 'File is empty.',
      },
    };
  } catch (error) {
    console.error(`[ReadFileTool] Error: ${error.message}`, error);
    return { success: false, error: `Failed to read file: ${error.message}` };
  }
}

module.exports = {
  readFile,
};
