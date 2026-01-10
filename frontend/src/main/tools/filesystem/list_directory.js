/**
 * List Directory Tool - Node.js implementation using fs
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * List directory contents
 */
async function listDirectory(args, skipAutoCapture) {
  const { path: dirPath } = args;

  try {
    // Validate absolute path
    if (!path.isAbsolute(dirPath)) {
      return { success: false, error: `Path must be absolute: ${dirPath}` };
    }

    // Check if path exists
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return { success: false, error: `Not a directory: ${dirPath}` };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, error: `Path not found: ${dirPath}` };
      }
      throw error;
    }

    // List directory
    const items = await fs.readdir(dirPath);
    items.sort();

    // Format items
    const formatted = [];
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          formatted.push(`[DIR] ${item}`);
        } else {
          formatted.push(`[FILE] ${item}`);
        }
      } catch (error) {
        // Skip items we can't stat
        formatted.push(`[UNKNOWN] ${item}`);
      }
    }

    const content = formatted.length > 0 ? formatted.join('\n') : 'Directory is empty.';

    return {
      success: true,
      data: {
        path: dirPath,
        items,
        llm_content: content,
      },
    };
  } catch (error) {
    console.error(`[ListDirectoryTool] Error: ${error.message}`, error);
    return { success: false, error: `Failed to list directory: ${error.message}` };
  }
}

module.exports = {
  listDirectory,
};
