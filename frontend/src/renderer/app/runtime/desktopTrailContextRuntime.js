/**
 * Formats projected tool calls for the trail context panel.
 */

const TOOL_ICON_KEYS = Object.freeze({
  browser: 'browser',
  get_open_windows: 'computer',
  get_system_stats: 'activity',
  keyboard_control: 'keyboard',
  mouse_control: 'computer',
  open_app: 'app',
  process: 'terminal',
  read_file: 'file',
  replace: 'file',
  run_shell_command: 'terminal',
  screenshot: 'screenshot',
  scroll_control: 'computer',
  switch_window: 'computer',
  wait: 'clock',
  web_search: 'search',
});

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function trimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readFirstString(record, keys) {
  if (!isRecord(record)) {
    return '';
  }
  for (const key of keys) {
    const value = trimmedString(record[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function parseJsonRecord(value) {
  const source = trimmedString(value);
  if (!source || source[0] !== '{') {
    return null;
  }
  try {
    const parsed = JSON.parse(source);
    return isRecord(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function normalizeToolName(value) {
  return trimmedString(value);
}

function resolveToolPayload(message) {
  const details = isRecord(message?.toolCallDetails) ? message.toolCallDetails : null;
  const parsedText = parseJsonRecord(message?.toolCallDisplayText || message?.text);
  const source = parsedText || details || {};
  const toolName = normalizeToolName(
    message?.toolName
      || details?.toolName
      || details?.tool_name
      || source.name
      || source.toolName
      || source.tool_name,
  );
  const args = isRecord(source.arguments)
    ? source.arguments
    : (isRecord(source.parameters)
      ? source.parameters
      : (isRecord(source.args) ? source.args : {}));
  return { args, toolName };
}

function basename(path) {
  const source = trimmedString(path);
  if (!source) {
    return '';
  }
  const normalized = source.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || source;
}

function formatCoordinate(args) {
  const x = Number.isFinite(args?.x) ? args.x : null;
  const y = Number.isFinite(args?.y) ? args.y : null;
  return x === null || y === null ? '' : ` (${x}, ${y})`;
}

function pastTenseMouseAction(action) {
  if (action === 'double_click') {
    return 'Double-clicked';
  }
  if (action === 'right_click') {
    return 'Right-clicked';
  }
  if (action === 'move') {
    return 'Moved pointer to';
  }
  if (action === 'drag') {
    return 'Dragged from';
  }
  return 'Clicked';
}

function formatToolAction(toolName, args) {
  if (toolName === 'read_file') {
    const filePath = readFirstString(args, ['file_path', 'path']);
    return `Read ${basename(filePath) || 'file'}`;
  }
  if (toolName === 'run_shell_command') {
    return `Ran ${readFirstString(args, ['command']) || 'shell command'}`;
  }
  if (toolName === 'mouse_control') {
    const action = readFirstString(args, ['action']) || 'click';
    return `${pastTenseMouseAction(action)}${formatCoordinate(args)}`;
  }
  if (toolName === 'keyboard_control') {
    const action = readFirstString(args, ['action']) || '';
    const text = readFirstString(args, ['text', 'keys', 'key']);
    if (action === 'type' && text) {
      return `Typed ${text}`;
    }
    if (text) {
      return `Pressed ${text}`;
    }
    return 'Used keyboard';
  }
  if (toolName === 'screenshot') {
    return 'Captured screenshot';
  }
  if (toolName === 'scroll_control') {
    const direction = readFirstString(args, ['direction']);
    return direction ? `Scrolled ${direction}` : 'Scrolled';
  }
  if (toolName === 'switch_window') {
    const title = readFirstString(args, ['window_title', 'title', 'name']);
    return title ? `Switched to ${title}` : 'Switched window';
  }
  if (toolName === 'wait') {
    const seconds = args?.seconds ?? args?.duration ?? args?.delay;
    return Number.isFinite(seconds) ? `Waited ${seconds}s` : 'Waited';
  }
  if (toolName === 'get_open_windows') {
    return 'Listed open windows';
  }
  if (toolName === 'get_system_stats') {
    return 'Checked system stats';
  }
  if (toolName === 'open_app') {
    const appName = readFirstString(args, ['app_name', 'name', 'application']);
    return appName ? `Opened ${appName}` : 'Opened app';
  }
  if (toolName === 'process') {
    const action = readFirstString(args, ['action']);
    return action ? `Managed process: ${action}` : 'Managed process';
  }
  if (toolName === 'replace') {
    const filePath = readFirstString(args, ['file_path', 'path']);
    return `Edited ${basename(filePath) || 'file'}`;
  }
  if (toolName === 'browser') {
    const action = readFirstString(args, ['action']);
    return action ? `Browser ${action}` : 'Used browser';
  }
  if (toolName === 'web_search') {
    const query = readFirstString(args, ['query', 'q', 'search_query']);
    return query ? `Searched web for ${query}` : 'Searched web';
  }
  return toolName ? `Ran ${toolName}` : 'Ran tool';
}

function formatTrailTimestamp(timestamp, fallbackDate = null) {
  const date = timestamp ? new Date(timestamp) : fallbackDate;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function buildTrailContextEntries(messages = [], { fallbackDate = null } = {}) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.flatMap((message, index) => {
    if (message?.type !== 'tool-call') {
      return [];
    }
    const { args, toolName } = resolveToolPayload(message);
    const actionText = formatToolAction(toolName, args);
    return [{
      id: trimmedString(message.id) || `trail-tool-${index}`,
      actionText,
      iconKey: TOOL_ICON_KEYS[toolName] || 'tool',
      timeLabel: formatTrailTimestamp(message.timestamp, fallbackDate),
      toolName: toolName || 'tool',
    }];
  });
}

export const DesktopTrailContextRuntime = Object.freeze({
  buildTrailContextEntries,
  formatToolAction,
  formatTrailTimestamp,
});
