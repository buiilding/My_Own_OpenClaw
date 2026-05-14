const fs = require('fs');
const path = require('path');

const AGENTS_FILENAME = 'AGENTS.md';
const AGENTS_MD_START_MARKER = '# AGENTS.md instructions for ';
const AGENTS_MD_END_MARKER = '</INSTRUCTIONS>';

function buildAgentsMdMessage(directoryPath, contents) {
  if (typeof contents !== 'string') {
    return null;
  }
  const normalizedContents = contents.trim();
  if (!normalizedContents) {
    return null;
  }
  return {
    role: 'user',
    content: `${AGENTS_MD_START_MARKER}${directoryPath}\n\n<INSTRUCTIONS>\n${normalizedContents}\n${AGENTS_MD_END_MARKER}`,
  };
}

function buildAgentsMdPromptLayer(directoryPath, contents, index = 0) {
  if (typeof contents !== 'string') {
    return null;
  }
  const normalizedContents = contents.trim();
  if (!normalizedContents) {
    return null;
  }
  const safeDirectoryId = String(directoryPath)
    .replace(/[^a-zA-Z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || `scope-${index}`;
  return {
    id: `agents-md:${safeDirectoryId}`,
    type: 'agents_md',
    priority: 40 + index,
    content: `# AGENTS.md instructions for ${directoryPath}\n\n${normalizedContents}`,
  };
}

function normalizeWorkspaceDirectory(workspacePath, deps = {}) {
  if (typeof workspacePath !== 'string') {
    return null;
  }
  const normalizedPath = workspacePath.trim();
  if (!normalizedPath) {
    return null;
  }

  const resolvedFs = deps.fs || fs;
  const resolvedPath = deps.path || path;

  try {
    const absolutePath = resolvedPath.resolve(normalizedPath);
    if (!resolvedFs.existsSync(absolutePath)) {
      return null;
    }
    const stats = resolvedFs.statSync(absolutePath);
    if (stats.isDirectory()) {
      return absolutePath;
    }
    if (stats.isFile()) {
      return resolvedPath.dirname(absolutePath);
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function resolveScopeRoot(workspaceDir, deps = {}) {
  const resolvedFs = deps.fs || fs;
  const resolvedPath = deps.path || path;
  let currentDir = workspaceDir;

  while (currentDir) {
    if (resolvedFs.existsSync(resolvedPath.join(currentDir, '.git'))) {
      return currentDir;
    }
    const parentDir = resolvedPath.dirname(currentDir);
    if (!parentDir || parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return workspaceDir;
}

function listInstructionDirectories(workspaceDir, deps = {}) {
  const resolvedPath = deps.path || path;
  const scopeRoot = resolveScopeRoot(workspaceDir, deps);
  const directories = [];
  let currentDir = workspaceDir;

  while (currentDir) {
    directories.push(currentDir);
    if (currentDir === scopeRoot) {
      break;
    }
    const parentDir = resolvedPath.dirname(currentDir);
    if (!parentDir || parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return directories.reverse();
}

function resolveWorkspaceRepoInstructionMessages(workspacePath, deps = {}) {
  const resolvedFs = deps.fs || fs;
  const resolvedPath = deps.path || path;
  const workspaceDir = normalizeWorkspaceDirectory(workspacePath, deps);
  if (!workspaceDir) {
    return [];
  }

  const messages = [];
  for (const directoryPath of listInstructionDirectories(workspaceDir, deps)) {
    const agentsPath = resolvedPath.join(directoryPath, AGENTS_FILENAME);
    if (!resolvedFs.existsSync(agentsPath)) {
      continue;
    }

    try {
      const contents = resolvedFs.readFileSync(agentsPath, 'utf8');
      const message = buildAgentsMdMessage(directoryPath, contents);
      if (message) {
        messages.push(message);
      }
    } catch (_error) {
      continue;
    }
  }

  return messages;
}

function resolveWorkspaceRepoInstructionPromptLayers(workspacePath, deps = {}) {
  const resolvedFs = deps.fs || fs;
  const resolvedPath = deps.path || path;
  const workspaceDir = normalizeWorkspaceDirectory(workspacePath, deps);
  if (!workspaceDir) {
    return [];
  }

  const layers = [];
  const directories = listInstructionDirectories(workspaceDir, deps);
  directories.forEach((directoryPath, index) => {
    const agentsPath = resolvedPath.join(directoryPath, AGENTS_FILENAME);
    if (!resolvedFs.existsSync(agentsPath)) {
      return;
    }

    try {
      const contents = resolvedFs.readFileSync(agentsPath, 'utf8');
      const layer = buildAgentsMdPromptLayer(directoryPath, contents, index);
      if (layer) {
        layers.push(layer);
      }
    } catch (_error) {
      // Ignore unreadable local instruction files; query send must not fail.
    }
  });

  return layers;
}

module.exports = {
  buildAgentsMdMessage,
  buildAgentsMdPromptLayer,
  normalizeWorkspaceDirectory,
  resolveWorkspaceRepoInstructionMessages,
  resolveWorkspaceRepoInstructionPromptLayers,
};
