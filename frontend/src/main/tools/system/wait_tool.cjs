/**
 * Wait Tool - Node.js implementation
 */

/**
 * Wait for 1 second
 */
async function wait(args, skipAutoCapture) {
  try {
    // Wait for 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      data: {
        seconds_waited: 1.0,
        status: 'Waited for 1 second',
        llm_content: 'status: Waited for 1 second',
        return_display: 'Waited for 1 second',
      },
    };
  } catch (error) {
    console.error(`[WaitTool] Error: ${error.message}`, error);
    return { success: false, error: `Wait operation failed: ${error.message}` };
  }
}

module.exports = {
  wait,
};
