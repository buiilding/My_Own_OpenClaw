function formatExecutionTimeSeconds(executionTime) {
  if (!Number.isFinite(executionTime) || executionTime < 0) {
    return 'N/A';
  }
  return `${executionTime.toFixed(3)}s`;
}

export function buildToolExecutionMetadata(message) {
  return {
    'Tool Name': message.toolName || 'Unknown',
    'Execution Time': formatExecutionTimeSeconds(message.executionTime),
    Success: message.success ? 'Yes' : 'No',
    'Active Window': message.toolMetadata?.active_window || 'Unknown',
  };
}
