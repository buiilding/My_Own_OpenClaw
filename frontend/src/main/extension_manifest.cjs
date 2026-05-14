const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
  const schema = readSchemaValue(rawTool.schema, extensionDir);
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
    const toolSchema = readToolSchema(rawTool, entryDir);
    if (!name || !toolSchema) {
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
      schema: toolSchema,
      argument_resolution: rawTool.argument_resolution === 'backend_grounding'
        ? 'backend_grounding'
        : 'passthrough',
      extension_id: extensionId,
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
  promptLayers.push(...readSkillPromptLayers(manifest, entryDir, extensionId));

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
