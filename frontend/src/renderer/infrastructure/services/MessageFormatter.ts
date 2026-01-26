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
  systemState: SystemState | null
): string {
  const parts = [`${toolName} output:`];
  
  if (result.success) {
    // Extract content from result
    let content = 'No output';
    if (result.data) {
      if (typeof result.data === 'string') {
        content = result.data;
      } else if (result.data.llm_content) {
        content = result.data.llm_content;
      } else if (result.data.output) {
        content = result.data.output;
      } else if (result.data.message) {
        content = result.data.message;
      } else if (result.data.result) {
        content = result.data.result;
      } else {
        // Exclude screenshot from text content
        const { screenshot, system_state, ...textData } = result.data;
        if (Object.keys(textData).length > 0) {
          content = JSON.stringify(textData, null, 2);
        }
      }
    }
    parts.push(content);
    parts.push('status: successful');
  } else {
    parts.push(`error: ${result.error || 'Unknown error'}`);
    parts.push('status: failed');
  }
  
  // Add system context XML
  const systemContextXml = formatSequentialStateXml(systemState);
  parts.push(systemContextXml);
  
  // Add screenshot indicator if screenshot is present
  if (result.data && typeof result.data === 'object' && result.data.screenshot) {
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
  screenshot: string | null
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
      // Extract content from result (matching formatToolOutputMessage logic)
      let content = 'No output';
      if (toolResult.data) {
        if (typeof toolResult.data === 'string') {
          content = toolResult.data;
        } else if (toolResult.data.llm_content) {
          content = toolResult.data.llm_content;
        } else if (toolResult.data.message) {
          content = toolResult.data.message;
        } else if (toolResult.data.output) {
          content = toolResult.data.output;
        } else if (toolResult.data.result) {
          content = toolResult.data.result;
        } else {
          // Exclude screenshot from text content
          const { screenshot: _, system_state: __, ...textData } = toolResult.data;
          if (Object.keys(textData).length > 0) {
            content = JSON.stringify(textData, null, 2);
          }
        }
      }
      parts.push(content);
      parts.push('status: successful');
    } else {
      parts.push(`error: ${toolResult.error || 'Unknown error'}`);
      parts.push('status: failed');
    }
  }
  
  // Add single system context XML (shared across all tools in bundle)
  const systemContextXml = formatSequentialStateXml(systemState);
  parts.push('\n' + systemContextXml);
  
  // Add screenshot indicator if screenshot is present
  if (screenshot) {
    parts.push('\nState of the screen after bundled tools were executed:');
  }
  
  return parts.join('\n');
}
