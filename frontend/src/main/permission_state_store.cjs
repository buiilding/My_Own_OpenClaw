const fs = require('fs');
const path = require('path');

const PERMISSION_STATE_FILENAME = 'permission-state.json';
const PERMISSION_STATE_VERSION = 1;

function resolveStatePath(deps = {}) {
  if (typeof deps.statePath === 'string' && deps.statePath.trim()) {
    return deps.statePath;
  }
  if (typeof deps.userDataPath === 'string' && deps.userDataPath.trim()) {
    return path.join(deps.userDataPath, PERMISSION_STATE_FILENAME);
  }
  return path.join(process.cwd(), `.windieos-${PERMISSION_STATE_FILENAME}`);
}

function normalizePermissionEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    return null;
  }

  const selectedPaths = Array.isArray(rawEntry.selected_paths)
    ? rawEntry.selected_paths.filter((value) => typeof value === 'string' && value.trim())
    : [];

  return {
    granted: rawEntry.granted === true,
    source: typeof rawEntry.source === 'string' ? rawEntry.source : 'app',
    updated_at: typeof rawEntry.updated_at === 'string' ? rawEntry.updated_at : null,
    selected_paths: selectedPaths,
    details: rawEntry.details && typeof rawEntry.details === 'object' && !Array.isArray(rawEntry.details)
      ? rawEntry.details
      : {},
  };
}

function normalizeState(rawState) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return {
      version: PERMISSION_STATE_VERSION,
      permissions: {},
    };
  }

  const permissions = rawState.permissions && typeof rawState.permissions === 'object' && !Array.isArray(rawState.permissions)
    ? rawState.permissions
    : {};

  return {
    version: PERMISSION_STATE_VERSION,
    permissions: Object.entries(permissions).reduce((accumulator, [permissionId, entry]) => {
      if (typeof permissionId !== 'string' || !permissionId.trim()) {
        return accumulator;
      }
      const normalizedEntry = normalizePermissionEntry(entry);
      if (normalizedEntry) {
        accumulator[permissionId] = normalizedEntry;
      }
      return accumulator;
    }, {}),
  };
}

async function readStateFromDisk(deps = {}) {
  const fsModule = deps.fs || fs;
  const statePath = resolveStatePath(deps);

  try {
    if (!fsModule.existsSync(statePath)) {
      return normalizeState(null);
    }
    const raw = await fsModule.promises.readFile(statePath, 'utf-8');
    return normalizeState(JSON.parse(raw));
  } catch (_error) {
    return normalizeState(null);
  }
}

async function writeStateToDisk(state, deps = {}) {
  const fsModule = deps.fs || fs;
  const statePath = resolveStatePath(deps);
  const normalizedState = normalizeState(state);
  const tempPath = `${statePath}.tmp`;

  await fsModule.promises.mkdir(path.dirname(statePath), { recursive: true });
  await fsModule.promises.writeFile(tempPath, JSON.stringify(normalizedState, null, 2), 'utf-8');
  await fsModule.promises.rename(tempPath, statePath);
}

function createPermissionStateStore(deps = {}) {
  return {
    async get(permissionId) {
      if (typeof permissionId !== 'string' || !permissionId.trim()) {
        return null;
      }
      const state = await readStateFromDisk(deps);
      return state.permissions[permissionId] || null;
    },

    async set(permissionId, entry) {
      if (typeof permissionId !== 'string' || !permissionId.trim()) {
        return null;
      }
      const normalizedEntry = normalizePermissionEntry(entry);
      if (!normalizedEntry) {
        return null;
      }

      const state = await readStateFromDisk(deps);
      state.permissions[permissionId] = normalizedEntry;
      await writeStateToDisk(state, deps);
      return normalizedEntry;
    },

    async delete(permissionId) {
      if (typeof permissionId !== 'string' || !permissionId.trim()) {
        return false;
      }

      const state = await readStateFromDisk(deps);
      if (!state.permissions[permissionId]) {
        return false;
      }

      delete state.permissions[permissionId];
      await writeStateToDisk(state, deps);
      return true;
    },
  };
}

module.exports = {
  createPermissionStateStore,
};
