const fs = require('fs');
const path = require('path');

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

function readToolParameters(rawTool, extensionDir) {
  const modelSchema = readSchemaValue(rawTool.parameters, extensionDir);
  if (!modelSchema) {
    return null;
  }
  const executionSchema = readSchemaValue(
    rawTool.execution_parameters || rawTool.parameters,
    extensionDir,
  );
  if (!executionSchema) {
    return null;
  }
  return { modelSchema, executionSchema };
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

function loadExtension(entryDir) {
  const extensionJsonPath = path.join(entryDir, 'extension.json');
  const manifest = readJsonFile(extensionJsonPath);
  const extensionId = typeof manifest.id === 'string' && manifest.id.trim()
    ? manifest.id.trim()
    : path.basename(entryDir);

  const tools = [];
  for (const rawTool of Array.isArray(manifest.tools) ? manifest.tools : []) {
    if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
      continue;
    }
    const name = typeof rawTool.name === 'string' ? rawTool.name.trim() : '';
    const executionTarget = rawTool.execution_target === 'backend' ? 'backend' : 'sidecar';
    const entrypoint = typeof rawTool.entrypoint === 'string' ? rawTool.entrypoint.trim() : '';
    const toolParameters = readToolParameters(rawTool, entryDir);
    if (!name || !toolParameters) {
      continue;
    }
    if (executionTarget === 'sidecar' && !hasSidecarEntrypoint(entrypoint, entryDir)) {
      continue;
    }
    tools.push({
      name,
      description: typeof rawTool.description === 'string' && rawTool.description.trim()
        ? rawTool.description.trim()
        : `Extension tool from ${extensionId}.`,
      execution_target: executionTarget,
      model_schema: toolParameters.modelSchema,
      execution_schema: toolParameters.executionSchema,
      argument_resolution: rawTool.argument_resolution === 'backend_grounding'
        ? 'backend_grounding'
        : 'passthrough',
      extension_id: extensionId,
      optional: rawTool.optional === true,
    });
  }

  const promptLayers = [];
  const rawPromptLayers = Array.isArray(manifest.prompt_layers) ? manifest.prompt_layers : [];
  rawPromptLayers.forEach((layer, index) => {
    const promptLayer = readPromptLayer(layer, entryDir, extensionId, index);
    if (promptLayer) {
      promptLayers.push(promptLayer);
    }
  });

  return {
    id: extensionId,
    name: typeof manifest.name === 'string' && manifest.name.trim()
      ? manifest.name.trim()
      : extensionId,
    tools,
    prompt_layers: promptLayers,
  };
}

function loadAgentExtensions(options = {}) {
  const extensionsDir = path.resolve(options.extensionsDir || resolveDefaultExtensionsDir());
  if (!fs.existsSync(extensionsDir)) {
    return { extensionsDir, extensions: [], errors: [] };
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
  return { extensionsDir, extensions, errors };
}

function loadExtensionTools(options = {}) {
  return loadAgentExtensions(options).extensions.flatMap((extension) => extension.tools);
}

function loadExtensionPromptLayers(options = {}) {
  return loadAgentExtensions(options).extensions.flatMap((extension) => extension.prompt_layers);
}

module.exports = {
  loadAgentExtensions,
  loadExtensionPromptLayers,
  loadExtensionTools,
  resolveDefaultExtensionsDir,
};
