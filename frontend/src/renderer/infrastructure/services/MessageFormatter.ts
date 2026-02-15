/**
 * Message Formatter Service.
 * Pure functions for formatting tool output messages with system context XML.
 * No side effects, no React dependencies.
 */

/**
 * System state structure
 */
export interface SystemState {
  active_window?: string;
  mouse_position?: string;
  screen_resolution?: string;
  time?: string;
  clipboard?: string;
}

/**
 * Tool execution result structure
 */
export interface ToolResult {
  success: boolean;
  error?: string | null;
  data?: {
    llm_content?: string;
    output?: string;
    result?: string;
    message?: string;
    screenshot?: string;
    system_state?: SystemState;
    metadata?: Record<string, any>;
    [key: string]: any;
  } | string | null;
}

const NON_TEXT_DATA_KEYS = new Set([
  'screenshot',
  'image_data',
  'screenshot_ref',
  'screenshot_content_type',
  'system_state',
  'post_action_snapshot',
]);

function asResultDataObject(data: ToolResult['data']): Record<string, any> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  return null;
}

function extractToolContent(data: ToolResult['data']): string {
  if (!data) {
    return 'No output';
  }

  if (typeof data === 'string') {
    return data;
  }

  const objectData = asResultDataObject(data);
  if (!objectData) {
    return 'No output';
  }

  const postActionSnapshot = asResultDataObject(objectData.post_action_snapshot);
  const postActionSnapshotText = typeof postActionSnapshot?.snapshot === 'string'
    ? postActionSnapshot.snapshot
    : null;
  const snapshotText = typeof objectData.snapshot === 'string'
    ? objectData.snapshot
    : null;

  const snapshotSections: string[] = [];
  if (snapshotText) {
    const snapshotMeta = Object.fromEntries(
      Object.entries(objectData).filter(([key]) => !NON_TEXT_DATA_KEYS.has(key) && key !== 'snapshot'),
    );
    if (Object.keys(snapshotMeta).length > 0) {
      snapshotSections.push(JSON.stringify(snapshotMeta, null, 2));
    }
    snapshotSections.push('Snapshot:');
    snapshotSections.push(snapshotText);
    return snapshotSections.join('\n\n');
  }

  if (postActionSnapshotText) {
    const baseTextData = Object.fromEntries(
      Object.entries(objectData).filter(([key]) => !NON_TEXT_DATA_KEYS.has(key)),
    );
    if (Object.keys(baseTextData).length > 0) {
      snapshotSections.push(JSON.stringify(baseTextData, null, 2));
    }

    const postActionMeta = Object.fromEntries(
      Object.entries(postActionSnapshot).filter(([key]) => key !== 'snapshot'),
    );
    snapshotSections.push('Post-action snapshot:');
    if (Object.keys(postActionMeta).length > 0) {
      snapshotSections.push(JSON.stringify(postActionMeta, null, 2));
    }
    snapshotSections.push(postActionSnapshotText);
    return snapshotSections.join('\n\n');
  }

  for (const key of ['llm_content', 'output', 'message', 'result']) {
    const value = objectData[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  const textData = Object.fromEntries(
    Object.entries(objectData).filter(([key]) => !NON_TEXT_DATA_KEYS.has(key)),
  );
  if (Object.keys(textData).length > 0) {
    return JSON.stringify(textData, null, 2);
  }

  return 'No output';
}

function hasScreenshotData(data: ToolResult['data']): boolean {
  const objectData = asResultDataObject(data);
  return Boolean(objectData && (objectData.screenshot || objectData.image_data || objectData.screenshot_ref));
}

/**
 * Format system state as sequential XML (minimal) for tool output
 */
export function formatSequentialStateXml(state: SystemState | null): string {
  if (!state) {
    return `<system_context>
    <os_state>
        <active_window>Unknown</active_window>
        <mouse_position>Unknown</mouse_position>
    </os_state>
</system_context>`;
  }
  
  return `<system_context>
    <os_state>
        <active_window>${state.active_window || 'Unknown'}</active_window>
        <mouse_position>${state.mouse_position || 'Unknown'}</mouse_position>
    </os_state>
</system_context>`;
}

/**
 * Format complete tool output message with system context XML for backend history
 */
export function formatToolOutputMessage(
  toolName: string,
  result: ToolResult,
  systemState: SystemState | null,
  includeSystemContext: boolean = true,
): string {
  const parts = [`${toolName} output:`];
  
  if (result.success) {
    const content = extractToolContent(result.data);
    parts.push(content);
    parts.push('status: successful');
  } else {
    parts.push(`error: ${result.error || 'Unknown error'}`);
    parts.push('status: failed');
  }
  
  if (includeSystemContext) {
    const systemContextXml = formatSequentialStateXml(systemState);
    parts.push(systemContextXml);
  }
  
  // Add screenshot indicator if screenshot is present
  if (hasScreenshotData(result.data)) {
    parts.push(`State of the screen after ${toolName} was executed:`);
  }
  
  return parts.join('\n');
}

/**
 * Bundled tool result structure
 */
export interface BundledToolResult {
  tool_name: string;
  request_id?: string;
  success: boolean;
  error?: string | null;
  data?: any;
  executionTime?: number;
  _rawResult?: ToolResult;
}

/**
 * Format combined bundled tool output message with system context XML
 * Combines multiple tool outputs into a single message
 */
export function formatBundledToolOutputMessage(
  tools: BundledToolResult[],
  systemState: SystemState | null,
  screenshot: string | null,
  includeSystemContext: boolean = true,
): string {
  const parts = ['Bundled tool execution output:'];
  
  // Add each tool's output
  for (const tool of tools) {
    const toolName = tool.tool_name || 'unknown';
    const toolResult: ToolResult = tool._rawResult || { 
      success: tool.success, 
      error: tool.error, 
      data: tool.data 
    };
    
    parts.push(`\n${toolName} output:`);
    
    if (toolResult.success) {
      const content = extractToolContent(toolResult.data);
      parts.push(content);
      parts.push('status: successful');
    } else {
      parts.push(`error: ${toolResult.error || 'Unknown error'}`);
      parts.push('status: failed');
    }
  }
  
  if (includeSystemContext) {
    const systemContextXml = formatSequentialStateXml(systemState);
    parts.push('\n' + systemContextXml);
  }
  
  // Add screenshot indicator if screenshot is present
  if (screenshot) {
    parts.push('\nState of the screen after bundled tools were executed:');
  }
  
  return parts.join('\n');
}
