const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const LIFECYCLE_HOOKS = Object.freeze([
  'onSessionStart',
  'beforeToolCall',
  'afterToolCall',
]);
const extensionRuntimeCache = new Map();

function resolveDefaultExtensionsDir() {
  if (process.env.WINDIE_AGENT_EXTENSIONS_DIR) {
    return path.resolve(process.env.WINDIE_AGENT_EXTENSIONS_DIR);
  }
  const cwdCandidate = path.resolve(process.cwd(), 'extensions');
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }
  const repoRootCandidate = path.resolve(__dirname, '../../../..', 'extensions');
  if (fs.existsSync(repoRootCandidate)) {
    return repoRootCandidate;
  }
  return path.resolve(__dirname, '../../..', 'extensions');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveInsideExtension(extensionDir, rawPath) {
  const resolvedPath = path.resolve(extensionDir, rawPath);
  const relativePath = path.relative(extensionDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Extension paths must stay inside the extension directory.');
  }
  return resolvedPath;
}

function readSchemaValue(value, extensionDir) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const schemaPath = resolveInsideExtension(extensionDir, value.trim());
  return readJsonFile(schemaPath);
}

function readToolSchema(rawTool, extensionDir) {
  const schema = readSchemaValue(rawTool.schema || rawTool.tool_schema, extensionDir);
  if (!schema) {
    return null;
  }
  return schema;
}

function hasSidecarEntrypoint(entrypoint, extensionDir) {
  if (typeof entrypoint !== 'string' || !entrypoint.trim() || !entrypoint.includes(':')) {
    return false;
  }
  const [rawFilePath, rawFunctionName] = entrypoint.split(':', 2);
  if (!rawFilePath.trim() || !rawFunctionName.trim()) {
    return false;
  }
  try {
    return fs.statSync(resolveInsideExtension(extensionDir, rawFilePath.trim())).isFile();
  } catch (_error) {
    return false;
  }
}

function readPromptLayer(layer, extensionDir, extensionId, index) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
    return null;
  }
  let content = typeof layer.content === 'string' ? layer.content : '';
  if (!content && typeof layer.content_path === 'string' && layer.content_path.trim()) {
    content = fs.readFileSync(resolveInsideExtension(extensionDir, layer.content_path.trim()), 'utf8');
  }
  content = content.trim();
  if (!content) {
    return null;
  }
  return {
    id: typeof layer.id === 'string' && layer.id.trim()
      ? layer.id.trim()
      : `extension:${extensionId}:prompt-layer:${index}`,
    type: typeof layer.type === 'string' && layer.type.trim()
      ? layer.type.trim()
      : 'extension',
    priority: Number.isFinite(Number(layer.priority)) ? Number(layer.priority) : 70,
    content,
  };
}

function parseMarkdownFrontmatter(content) {
  if (typeof content !== 'string' || !content.startsWith('---')) {
    return { metadata: {}, body: content };
  }
  const marker = '\n---';
  const endIndex = content.indexOf(marker, 3);
  if (endIndex === -1) {
    return { metadata: {}, body: content };
  }
  const rawFrontmatter = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + marker.length).replace(/^\s*\n/, '');
  const parsed = yaml.load(rawFrontmatter);
  return {
    metadata: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
    body,
  };
}

function slugFromRelativePath(relativePath) {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^skills\//i, '')
    .replace(/\/SKILL\.md$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function findSkillFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const dirent of entries) {
    const childPath = path.join(rootDir, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...findSkillFiles(childPath));
      continue;
    }
    if (dirent.isFile() && dirent.name.toLowerCase() === 'skill.md') {
      files.push(childPath);
    }
  }
  return files;
}

function normalizeSkillSpec(rawSkill) {
  if (typeof rawSkill === 'string' && rawSkill.trim()) {
    return { path: rawSkill.trim() };
  }
  if (!rawSkill || typeof rawSkill !== 'object' || Array.isArray(rawSkill)) {
    return null;
  }
  const skillPath = typeof rawSkill.path === 'string' && rawSkill.path.trim()
    ? rawSkill.path.trim()
    : typeof rawSkill.content_path === 'string' && rawSkill.content_path.trim()
      ? rawSkill.content_path.trim()
      : '';
  if (!skillPath) {
    return null;
  }
  return {
    path: skillPath,
    id: typeof rawSkill.id === 'string' && rawSkill.id.trim() ? rawSkill.id.trim() : '',
    type: typeof rawSkill.type === 'string' && rawSkill.type.trim() ? rawSkill.type.trim() : '',
    priority: Number.isFinite(Number(rawSkill.priority)) ? Number(rawSkill.priority) : null,
  };
}

function resolveSkillFile(extensionDir, rawPath) {
  const resolvedPath = resolveInsideExtension(extensionDir, rawPath);
  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    return path.join(resolvedPath, 'SKILL.md');
  }
  return resolvedPath;
}

function readSkillLayer(skillFilePath, extensionDir, extensionId, spec = {}) {
  const relativePath = path.relative(extensionDir, skillFilePath);
  const parsed = parseMarkdownFrontmatter(fs.readFileSync(skillFilePath, 'utf8'));
  let content = parsed.body.trim();
  if (!content) {
    return null;
  }
  const titleValue = parsed.metadata.title || parsed.metadata.name || '';
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';
  if (title && !content.startsWith('#')) {
    content = `# ${title}\n\n${content}`;
  }
  const metadataId = typeof parsed.metadata.id === 'string' ? parsed.metadata.id.trim() : '';
  const slug = spec.id || metadataId || slugFromRelativePath(relativePath);
  if (!slug) {
    return null;
  }
  const metadataType = typeof parsed.metadata.type === 'string' ? parsed.metadata.type.trim() : '';
  const priority = spec.priority !== null && spec.priority !== undefined
    ? spec.priority
    : Number.isFinite(Number(parsed.metadata.priority))
      ? Number(parsed.metadata.priority)
      : 75;
  return {
    id: `extension:${extensionId}:skill:${slug}`,
    type: spec.type || metadataType || 'extension_skill',
    priority,
    content,
  };
}

function readSkillPromptLayers(manifest, extensionDir, extensionId) {
  const layers = [];
  const seenFiles = new Set();
  const addSkillFile = (skillFilePath, spec = {}) => {
    const resolvedSkillPath = path.resolve(skillFilePath);
    if (seenFiles.has(resolvedSkillPath)) {
      return;
    }
    seenFiles.add(resolvedSkillPath);
    try {
      const layer = readSkillLayer(resolvedSkillPath, extensionDir, extensionId, spec);
      if (layer) {
        layers.push(layer);
      }
    } catch (_error) {
      // Invalid skill files should not block tools or other prompt layers.
    }
  };

  for (const rawSkill of Array.isArray(manifest.skills) ? manifest.skills : []) {
    const spec = normalizeSkillSpec(rawSkill);
    if (!spec) {
      continue;
    }
    try {
      const skillFilePath = resolveSkillFile(extensionDir, spec.path);
      if (path.basename(skillFilePath).toLowerCase() === 'skill.md' && fs.statSync(skillFilePath).isFile()) {
        addSkillFile(skillFilePath, spec);
      }
    } catch (_error) {
      // Invalid skill entries should not block the rest of the extension.
    }
  }

  const skillsRoot = path.join(extensionDir, 'skills');
  for (const skillFilePath of findSkillFiles(skillsRoot)) {
    addSkillFile(skillFilePath);
  }
  return layers;
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readToolContribution(rawTool, extensionDir, extensionId) {
  if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
    return null;
  }
  const name = normalizeString(rawTool.name);
  const executionTarget = rawTool.execution_target === 'backend' ? 'backend' : 'sidecar';
  const entrypoint = normalizeString(rawTool.entrypoint);
  const toolSchema = readToolSchema(rawTool, extensionDir);
  if (!name || !toolSchema) {
    return null;
  }

  const execute = typeof rawTool.execute === 'function' ? rawTool.execute : null;
  if (!execute && executionTarget === 'sidecar' && !hasSidecarEntrypoint(entrypoint, extensionDir)) {
    return null;
  }

  return {
    manifestTool: {
      name,
      description: normalizeString(rawTool.description) || `Extension tool from ${extensionId}.`,
      execution_target: executionTarget,
      schema: toolSchema,
      argument_resolution: rawTool.argument_resolution === 'backend_grounding'
        ? 'backend_grounding'
        : 'passthrough',
      extension_id: extensionId,
    },
    mainProcessHandler: execute
      ? {
        name,
        extension_id: extensionId,
        handler: execute,
      }
      : null,
  };
}

function addToolContribution(extension, contribution) {
  if (!contribution) {
    return;
  }
  extension.tools.push(contribution.manifestTool);
  if (contribution.mainProcessHandler) {
    extension.main_process_tools.push(contribution.mainProcessHandler);
  }
}

function normalizeSettingsPanel(panel, extensionId, index) {
  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) {
    return null;
  }
  const id = normalizeString(panel.id) || `panel-${index}`;
  const title = normalizeString(panel.title) || normalizeString(panel.name) || id;
  return {
    id: `extension:${extensionId}:settings:${id}`,
    extension_id: extensionId,
    title,
    description: normalizeString(panel.description),
    config_schema: normalizeObject(panel.config_schema || panel.schema),
    ui: normalizeObject(panel.ui),
  };
}

function addSettingsPanel(extension, panel) {
  const normalized = normalizeSettingsPanel(panel, extension.id, extension.settings_panels.length);
  if (normalized) {
    extension.settings_panels.push(normalized);
  }
}

function addPermission(extension, permission) {
  if (typeof permission === 'string') {
    const id = normalizeString(permission);
    if (id) {
      extension.permissions.push({ id, reason: '' });
    }
    return;
  }
  if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
    return;
  }
  const id = normalizeString(permission.id || permission.name);
  if (!id) {
    return;
  }
  extension.permissions.push({
    id,
    reason: normalizeString(permission.reason || permission.description),
    required: permission.required !== false,
  });
}

function addPromptLayer(extension, layer, extensionDir) {
  const normalized = readPromptLayer(layer, extensionDir, extension.id, extension.prompt_layers.length);
  if (normalized) {
    extension.prompt_layers.push(normalized);
  }
}

function addSkill(extension, skill, extensionDir) {
  if (typeof skill === 'string') {
    const spec = normalizeSkillSpec(skill);
    if (!spec) {
      return;
    }
    try {
      const skillFilePath = resolveSkillFile(extensionDir, spec.path);
      const layer = readSkillLayer(skillFilePath, extensionDir, extension.id, spec);
      if (layer) {
        extension.prompt_layers.push(layer);
      }
    } catch (_error) {
      // Invalid plugin-registered skill paths should not block the extension.
    }
    return;
  }

  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
    return;
  }
  if (typeof skill.content === 'string' && skill.content.trim()) {
    const id = normalizeString(skill.id) || normalizeString(skill.name) || `skill-${extension.prompt_layers.length}`;
    const title = normalizeString(skill.title || skill.name);
    const content = title && !skill.content.trim().startsWith('#')
      ? `# ${title}\n\n${skill.content.trim()}`
      : skill.content.trim();
    extension.prompt_layers.push({
      id: `extension:${extension.id}:skill:${id}`,
      type: normalizeString(skill.type) || 'extension_skill',
      priority: Number.isFinite(Number(skill.priority)) ? Number(skill.priority) : 75,
      content,
    });
    return;
  }

  const spec = normalizeSkillSpec(skill);
  if (!spec) {
    return;
  }
  try {
    const skillFilePath = resolveSkillFile(extensionDir, spec.path);
    const layer = readSkillLayer(skillFilePath, extensionDir, extension.id, spec);
    if (layer) {
      extension.prompt_layers.push(layer);
    }
  } catch (_error) {
    // Invalid plugin-registered skill paths should not block the extension.
  }
}

function addLifecycleHook(extension, hookName, handler) {
  if (!LIFECYCLE_HOOKS.includes(hookName) || typeof handler !== 'function') {
    return;
  }
  extension.lifecycle_hooks[hookName].push({
    extension_id: extension.id,
    handler,
  });
}

function createPluginApi(extension, extensionDir) {
  const api = {
    extension: Object.freeze({
      id: extension.id,
      name: extension.name,
      version: extension.version,
      directory: extensionDir,
    }),
    config: Object.freeze({ ...extension.config }),
    paths: Object.freeze({
      resolve: (relativePath) => resolveInsideExtension(extensionDir, relativePath),
      readJson: (relativePath) => readJsonFile(resolveInsideExtension(extensionDir, relativePath)),
      readText: (relativePath) => fs.readFileSync(resolveInsideExtension(extensionDir, relativePath), 'utf8'),
    }),
    registerTool: (tool) => {
      addToolContribution(extension, readToolContribution(tool, extensionDir, extension.id));
    },
    registerPromptLayer: (layer) => addPromptLayer(extension, layer, extensionDir),
    registerSkill: (skill) => addSkill(extension, skill, extensionDir),
    registerSettingsPanel: (panel) => addSettingsPanel(extension, panel),
    registerPermission: (permission) => addPermission(extension, permission),
    registerLifecycleHook: (hookName, handler) => addLifecycleHook(extension, hookName, handler),
  };

  api.onSessionStart = (handler) => addLifecycleHook(extension, 'onSessionStart', handler);
  api.beforeToolCall = (handler) => addLifecycleHook(extension, 'beforeToolCall', handler);
  api.afterToolCall = (handler) => addLifecycleHook(extension, 'afterToolCall', handler);
  api.hooks = Object.freeze({
    onSessionStart: api.onSessionStart,
    beforeToolCall: api.beforeToolCall,
    afterToolCall: api.afterToolCall,
  });
  return Object.freeze(api);
}

function resolvePluginEntrypoint(manifest, extensionDir) {
  const configured = normalizeString(manifest.main || manifest.plugin || manifest.entrypoint);
  if (configured) {
    return resolveInsideExtension(extensionDir, configured);
  }
  const defaultEntrypoint = path.join(extensionDir, 'plugin.cjs');
  return fs.existsSync(defaultEntrypoint) ? defaultEntrypoint : null;
}

function loadPluginEntrypoint(extension, manifest, extensionDir) {
  const pluginPath = resolvePluginEntrypoint(manifest, extensionDir);
  if (!pluginPath || !fs.existsSync(pluginPath)) {
    return;
  }
  const pluginModule = require(pluginPath);
  const register = typeof pluginModule === 'function'
    ? pluginModule
    : typeof pluginModule?.register === 'function'
      ? pluginModule.register
      : typeof pluginModule?.default === 'function'
        ? pluginModule.default
        : null;
  if (!register) {
    throw new Error(`Extension plugin ${extension.id} does not export a register function`);
  }
  register(createPluginApi(extension, extensionDir));
}

function createExtensionBase(extensionId, manifest, entryDir) {
  return {
    id: extensionId,
    name: normalizeString(manifest.name) || extensionId,
    description: normalizeString(manifest.description),
    version: normalizeString(manifest.version),
    directory: entryDir,
    config: normalizeObject(manifest.config),
    config_schema: normalizeObject(manifest.config_schema || manifest.configSchema),
    permissions: [],
    tools: [],
    main_process_tools: [],
    prompt_layers: [],
    settings_panels: [],
    lifecycle_hooks: {
      onSessionStart: [],
      beforeToolCall: [],
      afterToolCall: [],
    },
  };
}

function loadExtension(entryDir) {
  const extensionJsonPath = path.join(entryDir, 'extension.json');
  const manifest = readJsonFile(extensionJsonPath);
  const extensionId = typeof manifest.id === 'string' && manifest.id.trim()
    ? manifest.id.trim()
    : path.basename(entryDir);
  const extension = createExtensionBase(extensionId, manifest, entryDir);

  for (const rawTool of Array.isArray(manifest.tools) ? manifest.tools : []) {
    addToolContribution(extension, readToolContribution(rawTool, entryDir, extensionId));
  }

  const rawPromptLayers = Array.isArray(manifest.prompt_layers) ? manifest.prompt_layers : [];
  rawPromptLayers.forEach((layer, index) => {
    const promptLayer = readPromptLayer(layer, entryDir, extensionId, index);
    if (promptLayer) {
      extension.prompt_layers.push(promptLayer);
    }
  });
  extension.prompt_layers.push(...readSkillPromptLayers(manifest, entryDir, extensionId));

  const permissions = [
    ...(Array.isArray(manifest.required_permissions) ? manifest.required_permissions : []),
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
  ];
  for (const permission of permissions) {
    addPermission(extension, permission);
  }
  for (const panel of Array.isArray(manifest.settings_panels) ? manifest.settings_panels : []) {
    addSettingsPanel(extension, panel);
  }

  loadPluginEntrypoint(extension, manifest, entryDir);
  return extension;
}

function loadAgentExtensions(options = {}) {
  const extensionsDir = path.resolve(options.extensionsDir || resolveDefaultExtensionsDir());
  if (options.reload !== true && extensionRuntimeCache.has(extensionsDir)) {
    return extensionRuntimeCache.get(extensionsDir);
  }
  if (!fs.existsSync(extensionsDir) || typeof fs.readdirSync !== 'function') {
    const emptyResult = { extensionsDir, extensions: [], errors: [] };
    extensionRuntimeCache.set(extensionsDir, emptyResult);
    return emptyResult;
  }

  const extensions = [];
  const errors = [];
  for (const dirent of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const entryDir = path.join(extensionsDir, dirent.name);
    if (!fs.existsSync(path.join(entryDir, 'extension.json'))) {
      continue;
    }
    try {
      extensions.push(loadExtension(entryDir));
    } catch (error) {
      errors.push({
        extension: dirent.name,
        reason: error?.message || String(error),
      });
    }
  }
  const result = { extensionsDir, extensions, errors };
  extensionRuntimeCache.set(extensionsDir, result);
  return result;
}

function loadExtensionTools(options = {}) {
  return loadAgentExtensions(options).extensions.flatMap((extension) => extension.tools);
}

function loadExtensionPromptLayers(options = {}) {
  return loadAgentExtensions(options).extensions.flatMap((extension) => extension.prompt_layers);
}

function loadExtensionSettingsPanels(options = {}) {
  return loadAgentExtensions(options).extensions.flatMap((extension) => extension.settings_panels);
}

function toPublicExtension(extension) {
  return {
    id: extension.id,
    name: extension.name,
    description: extension.description,
    version: extension.version,
    permissions: extension.permissions,
    config_schema: extension.config_schema,
    tools: extension.tools,
    prompt_layers: extension.prompt_layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      priority: layer.priority,
    })),
    settings_panels: extension.settings_panels,
    lifecycle_hooks: Object.fromEntries(
      LIFECYCLE_HOOKS.map((hookName) => [
        hookName,
        extension.lifecycle_hooks[hookName].length,
      ]),
    ),
  };
}

function loadPublicAgentExtensions(options = {}) {
  const result = loadAgentExtensions(options);
  return {
    extensionsDir: result.extensionsDir,
    extensions: result.extensions.map(toPublicExtension),
    errors: result.errors,
  };
}

function getMainProcessExtensionToolHandler(toolName, options = {}) {
  const normalizedToolName = normalizeString(toolName);
  if (!normalizedToolName) {
    return null;
  }
  try {
    for (const extension of loadAgentExtensions(options).extensions) {
      const tool = extension.main_process_tools.find((candidate) => candidate.name === normalizedToolName);
      if (tool) {
        return {
          extension_id: tool.extension_id,
          handler: tool.handler,
          config: extension.config,
        };
      }
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function hasExtensionLifecycleHooks(hookName, options = {}) {
  if (!LIFECYCLE_HOOKS.includes(hookName)) {
    return false;
  }
  try {
    return loadAgentExtensions(options).extensions.some(
      (extension) => extension.lifecycle_hooks[hookName].length > 0,
    );
  } catch (_error) {
    return false;
  }
}

async function executeMainProcessExtensionTool(toolName, args, context = {}, options = {}) {
  const tool = getMainProcessExtensionToolHandler(toolName, options);
  if (!tool) {
    return null;
  }
  try {
    const result = await tool.handler(args, {
      ...context,
      toolName,
      extensionId: tool.extension_id,
      config: tool.config,
    });
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      if (result.success === false) {
        return {
          success: false,
          error: normalizeString(result.error) || 'Extension tool failed',
          data: result.data,
        };
      }
      if (result.success === true) {
        return {
          success: true,
          data: result.data !== undefined ? result.data : result,
        };
      }
      return { success: true, data: result };
    }
    if (typeof result === 'string') {
      return {
        success: true,
        data: {
          llm_content: result,
          return_display: result,
        },
      };
    }
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

async function runExtensionLifecycleHook(hookName, context = {}, options = {}) {
  if (!LIFECYCLE_HOOKS.includes(hookName)) {
    return [];
  }
  const results = [];
  let loaded;
  try {
    loaded = loadAgentExtensions(options);
  } catch (_error) {
    return results;
  }
  for (const extension of loaded.extensions) {
    for (const hook of extension.lifecycle_hooks[hookName]) {
      try {
        const result = await hook.handler({
          ...context,
          extensionId: hook.extension_id,
          config: extension.config,
        });
        if (result !== undefined) {
          results.push({
            extension_id: hook.extension_id,
            result,
          });
        }
      } catch (error) {
        results.push({
          extension_id: hook.extension_id,
          error: error?.message || String(error),
        });
      }
    }
  }
  return results;
}

module.exports = {
  clearExtensionRuntimeCache: () => extensionRuntimeCache.clear(),
  executeMainProcessExtensionTool,
  getMainProcessExtensionToolHandler,
  hasExtensionLifecycleHooks,
  loadAgentExtensions,
  loadExtensionPromptLayers,
  loadExtensionSettingsPanels,
  loadExtensionTools,
  loadPublicAgentExtensions,
  runExtensionLifecycleHook,
  resolveDefaultExtensionsDir,
};
