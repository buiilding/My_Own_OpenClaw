const COORDINATE_GROUNDING_FIELDS = Object.freeze({
  find_coordinates_by: {
    type: 'string',
    enum: ['manual', 'ocr', 'prediction'],
    description: 'How the backend should resolve the action target before sidecar execution.',
  },
  ocr_text: {
    type: 'string',
    description: 'Visible text to locate when find_coordinates_by is ocr.',
  },
  source_description: {
    type: 'string',
    description: 'Natural-language target description for prediction-based grounding.',
  },
  candidate_id: {
    type: 'string',
    description: 'Previously observed target candidate id.',
  },
});

function objectSchema(properties, required = [], additionalProperties = false) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties,
  };
}

const TOOL_SCHEMAS = Object.freeze({
  mouse_control: objectSchema({
    action: { type: 'string', enum: ['click', 'double_click', 'right_click', 'move', 'drag'] },
    button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
    x: { type: 'integer' },
    y: { type: 'integer' },
    drag_to_x: { type: 'integer' },
    drag_to_y: { type: 'integer' },
    duration: { type: 'number', default: 0.5 },
    explanation: { type: 'string' },
    wait: { type: 'number', default: 0 },
  }, ['action', 'explanation']),
  keyboard_control: objectSchema({
    action: { type: 'string', enum: ['type', 'paste', 'press', 'hotkey'] },
    text: { type: 'string' },
    key: { type: 'string' },
    keys: { type: 'array', items: { type: 'string' } },
    repeat: { type: 'integer', minimum: 1, maximum: 50, default: 1 },
    interval_ms: { type: 'integer', minimum: 0, maximum: 2000, default: 0 },
    explanation: { type: 'string' },
    wait: { type: 'number', default: 0 },
  }, ['action', 'explanation']),
  screenshot: objectSchema({
    explanation: { type: 'string' },
    wait: { type: 'number' },
    display_bounds: {
      type: 'object',
      properties: {
        x: { type: 'integer' },
        y: { type: 'integer' },
        width: { type: 'integer' },
        height: { type: 'integer' },
        monitor_id: { type: 'string' },
      },
      additionalProperties: true,
    },
  }, ['explanation']),
  scroll_control: objectSchema({
    action: { type: 'string', enum: ['scroll', 'scroll_up', 'scroll_down'] },
    x: { type: 'integer' },
    y: { type: 'integer' },
    clicks: { type: 'integer' },
    direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
    explanation: { type: 'string' },
    wait: { type: 'number', default: 0 },
  }, ['action', 'explanation']),
  switch_window: objectSchema({
    tab_name: { type: 'string' },
    match_mode: { type: 'string', enum: ['exact', 'contains', 'regex'], default: 'exact' },
    explanation: { type: 'string' },
    wait: { type: 'number', default: 0 },
  }, ['tab_name', 'explanation']),
  wait: objectSchema({
    seconds: { type: 'number' },
    explanation: { type: 'string' },
  }, ['seconds', 'explanation']),
  get_open_windows: objectSchema({
    filter_text: { type: 'string', default: '' },
    explanation: { type: 'string' },
  }, ['explanation']),
  get_system_stats: objectSchema({
    explanation: { type: 'string' },
  }, ['explanation']),
  open_app: objectSchema({
    command: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
    directory: { type: 'string' },
    verify: { type: 'string', enum: ['none', 'window', 'screenshot'], default: 'window' },
    verify_window_title: { type: 'string' },
    verify_timeout_seconds: { type: 'number', minimum: 0, default: 6 },
    explanation: { type: 'string' },
  }, ['command', 'explanation']),
  run_shell_command: objectSchema({
    command: { type: 'string' },
    directory: { type: 'string' },
    run_in_background: { type: 'boolean' },
    terminate_after_seconds: { type: 'number', default: 120 },
    yield_after_seconds: { type: 'number' },
    max_output_tokens: { type: 'integer', minimum: 1 },
    env: { type: 'object', additionalProperties: { type: 'string' } },
    pty: { type: 'boolean' },
    explanation: { type: 'string' },
    wait: { type: 'number' },
  }, ['command', 'run_in_background', 'explanation']),
  process: objectSchema({
    action: { type: 'string' },
    session_id: { type: 'string' },
    data: { type: 'string' },
    keys: { type: 'array', items: { type: 'string' } },
    hex: { type: 'array', items: { type: 'string' } },
    literal: { type: 'string' },
    text: { type: 'string' },
    bracketed: { type: 'boolean' },
    eof: { type: 'boolean' },
    offset: { type: 'integer' },
    limit: { type: 'integer' },
  }, ['action']),
  read_file: objectSchema({
    file_path: { type: 'string' },
    offset: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    explanation: { type: 'string' },
  }, ['file_path', 'explanation']),
  replace: objectSchema({
    file_path: { type: 'string' },
    old_string: { type: 'string' },
    new_string: { type: 'string' },
    replace_all: { type: 'boolean', default: false },
    before_context: { type: 'string' },
    after_context: { type: 'string' },
    occurrence_index: { type: 'integer', minimum: 1 },
    require_eof: { type: 'boolean', default: false },
    match_mode: { type: 'string', enum: ['strict', 'lenient'], default: 'lenient' },
    replacements: { type: 'array', items: { type: 'object', additionalProperties: true } },
    patch_chunks: { type: 'array', items: { type: 'object', additionalProperties: true } },
    explanation: { type: 'string' },
  }, ['file_path', 'explanation']),
  browser: objectSchema({
    action: { type: 'string' },
  }, ['action'], true),
});

const TOOL_DESCRIPTIONS = Object.freeze({
  mouse_control: 'Control mouse actions with schema-guided coordinate targeting.',
  keyboard_control: 'Control keyboard input including typing, paste, key presses, and shortcuts.',
  screenshot: 'Capture a screenshot of the current computer screen.',
  scroll_control: 'Control desktop scrolling actions.',
  switch_window: 'Switch focus to a specific window by title.',
  wait: 'Wait for UI changes, then capture fresh screen state.',
  get_open_windows: 'List currently open desktop windows that can be focused.',
  get_system_stats: 'Read lightweight local system statistics.',
  open_app: 'Launch a local app or executable.',
  run_shell_command: 'Run a local shell command on the user machine.',
  process: 'Manage background shell command sessions.',
  read_file: 'Read a local file from the selected workspace or filesystem.',
  replace: 'Edit a local file using replacement operations or patch chunks.',
  browser: 'Control the local Windie browser runtime.',
});

const GROUNDED_TOOL_NAMES = Object.freeze(new Set(['mouse_control', 'scroll_control']));

function buildModelSchema(toolName) {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    return null;
  }
  if (!GROUNDED_TOOL_NAMES.has(toolName)) {
    return schema;
  }
  return {
    ...schema,
    properties: {
      ...schema.properties,
      ...COORDINATE_GROUNDING_FIELDS,
    },
  };
}

function normalizeToolNameList(values) {
  return new Set(Array.isArray(values)
    ? values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
    : []);
}

function buildBuiltinClientToolManifest(options = {}) {
  const disabledTools = new Set(Array.isArray(options.disabledTools) ? options.disabledTools : []);
  const tools = Object.keys(TOOL_SCHEMAS)
    .filter((toolName) => !disabledTools.has(toolName))
    .map((toolName) => ({
      name: toolName,
      description: TOOL_DESCRIPTIONS[toolName],
      execution_target: 'sidecar',
      schema: buildModelSchema(toolName),
      argument_resolution: GROUNDED_TOOL_NAMES.has(toolName)
        ? 'backend_grounding'
        : 'passthrough',
    }));
  return { version: 1, tools };
}

function buildClientToolManifest(options = {}) {
  const disabledTools = normalizeToolNameList(options.disabledTools);
  const builtinManifest = buildBuiltinClientToolManifest({ disabledTools: [...disabledTools] });
  const seenNames = new Set(builtinManifest.tools.map((tool) => tool.name));
  const extensionTools = loadExtensionTools({
    extensionsDir: options.extensionsDir,
  })
    .filter((tool) => {
      if (!tool?.name || disabledTools.has(tool.name) || seenNames.has(tool.name)) {
        return false;
      }
      seenNames.add(tool.name);
      return true;
    });

  return {
    version: 1,
    tools: [
      ...builtinManifest.tools,
      ...extensionTools,
    ],
  };
}

function getBuiltinClientToolNames(options = {}) {
  return buildBuiltinClientToolManifest(options).tools.map((tool) => tool.name);
}

function getClientToolNames(options = {}) {
  return buildClientToolManifest(options).tools.map((tool) => tool.name);
}

module.exports = {
  buildBuiltinClientToolManifest,
  buildClientToolManifest,
  getClientToolNames,
  getBuiltinClientToolNames,
};
const { loadExtensionTools } = require('./extension_manifest.cjs');
