/**
 * Defines extension manifest contracts for the Electron main process.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const extensionRuntimeCache = new Map();

function hasContributionFolders(candidateDir) {
  return ['plugins', 'skills', 'mcps'].some((folderName) => (
    fs.existsSync(path.join(candidateDir, folderName))
  ));
}

function resolveDefaultContributionRoot() {
  if (process.env.WINDIE_AGENT_CONTRIBUTIONS_DIR) {
    return path.resolve(process.env.WINDIE_AGENT_CONTRIBUTIONS_DIR);
  }
  const cwdCandidate = path.resolve(process.cwd());
  if (hasContributionFolders(cwdCandidate)) {
    return cwdCandidate;
  }
  const repoRootCandidate = path.resolve(__dirname, '../../../..');
  if (hasContributionFolders(repoRootCandidate)) {
    return repoRootCandidate;
  }
  return repoRootCandidate;
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeNumber(value, fallback) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  const normalized = Number(value.trim());
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveInside(rootDir, rawPath, label = 'Extension path') {
  const resolvedPath = path.resolve(rootDir, rawPath);
  const relativePath = path.relative(rootDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must stay inside ${rootDir}.`);
  }
  return resolvedPath;
}

function readSchemaValue(value, rootDir) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  const schemaPath = normalizeString(value);
  if (!schemaPath) {
    return null;
  }
  return readJsonFile(resolveInside(rootDir, schemaPath, 'Schema path'));
}

function hasSidecarEntrypoint(entrypoint, pluginDir) {
  if (typeof entrypoint !== 'string' || !entrypoint.trim() || !entrypoint.includes(':')) {
    return false;
  }
  const [rawFilePath, rawFunctionName] = entrypoint.split(':', 2);
  if (!rawFilePath.trim() || !rawFunctionName.trim()) {
    return false;
  }
  try {
    return fs.statSync(resolveInside(pluginDir, rawFilePath.trim(), 'Plugin entrypoint')).isFile();
  } catch (_error) {
    return false;
  }
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

function readSkillLayer(skillFilePath, skillsRoot) {
  const relativePath = path.relative(skillsRoot, skillFilePath);
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
  const metadataId = normalizeString(parsed.metadata.id);
  const slug = metadataId || slugFromRelativePath(relativePath);
  if (!slug) {
    return null;
  }
  const priority = normalizeNumber(parsed.metadata.priority, 75);
  return {
    id: `extension:skill:${slug}`,
    skill_id: slug,
    type: normalizeString(parsed.metadata.type) || 'extension_skill',
    priority,
    content,
    path: skillFilePath,
  };
}

function readToolContribution(rawTool, pluginDir, pluginId) {
  if (!rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
    return null;
  }
  const name = normalizeString(rawTool.name);
  const entrypoint = normalizeString(rawTool.entrypoint);
  const toolSchema = readSchemaValue(rawTool.schema || rawTool.tool_schema, pluginDir);
  if (!name || !toolSchema || !hasSidecarEntrypoint(entrypoint, pluginDir)) {
    return null;
  }
  return {
    name,
    description: normalizeString(rawTool.description) || `Plugin tool from ${pluginId}.`,
    execution_target: 'sidecar',
    schema: toolSchema,
    argument_resolution: rawTool.argument_resolution === 'backend_grounding'
      ? 'backend_grounding'
      : 'passthrough',
    plugin_id: pluginId,
    extension_id: `plugin:${pluginId}`,
  };
}

function normalizePermission(permission) {
  if (typeof permission === 'string') {
    const id = normalizeString(permission);
    return id ? { id, reason: '' } : null;
  }
  if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
    return null;
  }
  const id = normalizeString(permission.id || permission.name);
  if (!id) {
    return null;
  }
  return {
    id,
    reason: normalizeString(permission.reason || permission.description),
    required: permission.required !== false,
  };
}

function normalizeSettingsPanel(panel, pluginId, index) {
  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) {
    return null;
  }
  const id = normalizeString(panel.id) || `panel-${index}`;
  const title = normalizeString(panel.title || panel.name) || id;
  return {
    id: `extension:plugin:${pluginId}:settings:${id}`,
    plugin_id: pluginId,
    extension_id: `plugin:${pluginId}`,
    title,
    description: normalizeString(panel.description),
    config_schema: normalizeObject(panel.config_schema || panel.schema),
    ui: normalizeObject(panel.ui),
  };
}

function readMcpTimeoutMs(server) {
  if (Object.prototype.hasOwnProperty.call(server, 'timeout_ms')) {
    return server.timeout_ms;
  }
  return server.timeoutMs;
}

function loadPlugin(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.json');
  const manifest = readJsonFile(manifestPath);
  const pluginId = normalizeString(manifest.id) || path.basename(pluginDir);
  const permissions = [
    ...(Array.isArray(manifest.required_permissions) ? manifest.required_permissions : []),
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
  ].map(normalizePermission).filter(Boolean);
  const settingsPanels = (Array.isArray(manifest.settings_panels) ? manifest.settings_panels : [])
    .map((panel, index) => normalizeSettingsPanel(panel, pluginId, index))
    .filter(Boolean);
  return {
    id: pluginId,
    name: normalizeString(manifest.name) || pluginId,
    description: normalizeString(manifest.description),
    version: normalizeString(manifest.version),
    directory: pluginDir,
    config: normalizeObject(manifest.config),
    config_schema: normalizeObject(manifest.config_schema || manifest.configSchema),
    permissions,
    settings_panels: settingsPanels,
    tools: (Array.isArray(manifest.tools) ? manifest.tools : [])
      .map((rawTool) => readToolContribution(rawTool, pluginDir, pluginId))
      .filter(Boolean),
  };
}

function normalizeMcpToolSpec(tool, mcpDir) {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    return null;
  }
  const name = normalizeString(tool.name);
  const schema = readSchemaValue(tool.schema || tool.input_schema || tool.inputSchema, mcpDir);
  if (!name || !schema || Object.keys(schema).length === 0) {
    return null;
  }
  return {
    name,
    description: normalizeString(tool.description),
    schema,
  };
}

function normalizeMcpServer(server, mcpDir, mcpId) {
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    return null;
  }
  const id = normalizeString(server.id || server.name) || mcpId;
  const command = normalizeString(server.command);
  if (!id || !command || server.enabled === false) {
    return null;
  }
  let cwd = normalizeString(server.cwd);
  if (cwd && !path.isAbsolute(cwd)) {
    cwd = resolveInside(mcpDir, cwd, 'MCP cwd');
  }
  const tools = Array.isArray(server.tools)
    ? server.tools.map((tool) => normalizeMcpToolSpec(tool, mcpDir)).filter(Boolean)
    : [];
  const timeoutMs = Number(readMcpTimeoutMs(server));
  return {
    id,
    name: normalizeString(server.name) || id,
    description: normalizeString(server.description),
    command,
    args: Array.isArray(server.args)
      ? server.args.filter((arg) => typeof arg === 'string')
      : [],
    env: normalizeObject(server.env),
    cwd: cwd || mcpDir,
    enabled: true,
    timeout_ms: Number.isFinite(timeoutMs)
      ? timeoutMs
      : null,
    tool_prefix: normalizeString(server.tool_prefix || server.toolPrefix),
    requires_user_enable: server.requires_user_enable === true || server.requiresUserEnable === true,
    tools,
    mcp_id: mcpId,
    extension_id: `mcp:${mcpId}`,
  };
}

function loadMcpEntry(mcpDir) {
  const manifestPath = path.join(mcpDir, 'mcp.json');
  const parsed = readJsonFile(manifestPath);
  const mcpId = normalizeString(parsed.id || parsed.name) || path.basename(mcpDir);
  const servers = Array.isArray(parsed.servers) ? parsed.servers : [parsed];
  return servers
    .map((server) => normalizeMcpServer(server, mcpDir, mcpId))
    .filter(Boolean);
}

function loadAgentExtensionRegistry(options = {}) {
  const contributionRoot = path.resolve(options.contributionsDir || resolveDefaultContributionRoot());
  if (options.reload !== true && extensionRuntimeCache.has(contributionRoot)) {
    return extensionRuntimeCache.get(contributionRoot);
  }

  const result = {
    contributionRoot,
    plugins: [],
    skills: [],
    mcps: [],
    errors: [],
  };
  if (!fs.existsSync(contributionRoot) || typeof fs.readdirSync !== 'function') {
    extensionRuntimeCache.set(contributionRoot, result);
    return result;
  }

  const pluginsRoot = path.join(contributionRoot, 'plugins');
  if (fs.existsSync(pluginsRoot)) {
    for (const dirent of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) {
        continue;
      }
      const pluginDir = path.join(pluginsRoot, dirent.name);
      if (!fs.existsSync(path.join(pluginDir, 'plugin.json'))) {
        continue;
      }
      try {
        result.plugins.push(loadPlugin(pluginDir));
      } catch (error) {
        result.errors.push({
          kind: 'plugin',
          id: dirent.name,
          reason: error?.message || String(error),
        });
      }
    }
  }

  const skillsRoot = path.join(contributionRoot, 'skills');
  for (const skillFilePath of findSkillFiles(skillsRoot)) {
    try {
      const layer = readSkillLayer(skillFilePath, skillsRoot);
      if (layer) {
        result.skills.push(layer);
      }
    } catch (error) {
      result.errors.push({
        kind: 'skill',
        id: path.relative(skillsRoot, skillFilePath),
        reason: error?.message || String(error),
      });
    }
  }

  const mcpsRoot = path.join(contributionRoot, 'mcps');
  if (fs.existsSync(mcpsRoot)) {
    for (const dirent of fs.readdirSync(mcpsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) {
        continue;
      }
      const mcpDir = path.join(mcpsRoot, dirent.name);
      if (!fs.existsSync(path.join(mcpDir, 'mcp.json'))) {
        continue;
      }
      try {
        result.mcps.push(...loadMcpEntry(mcpDir));
      } catch (error) {
        result.errors.push({
          kind: 'mcp',
          id: dirent.name,
          reason: error?.message || String(error),
        });
      }
    }
  }

  extensionRuntimeCache.set(contributionRoot, result);
  return result;
}

function loadExtensionPluginTools(options = {}) {
  return loadAgentExtensionRegistry(options).plugins.flatMap((plugin) => plugin.tools);
}

function loadExtensionSkillPromptLayers(options = {}) {
  return loadAgentExtensionRegistry(options).skills.map((skill) => ({
    id: skill.id,
    type: skill.type,
    priority: skill.priority,
    content: skill.content,
  }));
}

function loadExtensionSettingsPanels(options = {}) {
  return loadAgentExtensionRegistry(options).plugins.flatMap((plugin) => plugin.settings_panels);
}

function loadExtensionMcpServers(options = {}) {
  return loadAgentExtensionRegistry(options).mcps;
}

function toPublicMcpServer(server) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    enabled: server.enabled,
    requires_user_enable: server.requires_user_enable,
    timeout_ms: server.timeout_ms,
    tool_prefix: server.tool_prefix,
    tools: server.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
    env_keys: Object.keys(server.env || {}).sort(),
    mcp_id: server.mcp_id,
    extension_id: server.extension_id,
  };
}

function toPublicPlugin(plugin) {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    permissions: plugin.permissions,
    config_schema: plugin.config_schema,
    settings_panels: plugin.settings_panels,
    tools: plugin.tools,
  };
}

function toPublicSkill(skill) {
  return {
    id: skill.id,
    skill_id: skill.skill_id,
    type: skill.type,
    priority: skill.priority,
  };
}

function loadPublicExtensionRegistry(options = {}) {
  const result = loadAgentExtensionRegistry(options);
  return {
    contributionRoot: result.contributionRoot,
    plugins: result.plugins.map(toPublicPlugin),
    skills: result.skills.map(toPublicSkill),
    mcps: result.mcps.map(toPublicMcpServer),
    errors: result.errors,
  };
}

module.exports = {
  clearExtensionRuntimeCache: () => extensionRuntimeCache.clear(),
  loadAgentExtensionRegistry,
  loadExtensionMcpServers,
  loadExtensionPluginTools,
  loadExtensionSettingsPanels,
  loadExtensionSkillPromptLayers,
  loadPublicExtensionRegistry,
  resolveDefaultContributionRoot,
};
