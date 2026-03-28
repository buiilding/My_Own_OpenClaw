const { createPermissionStateStore } = require('./permission_state_store.cjs');
const { requestPermission } = require('./permission_service.cjs');

const WORKSPACE_ACCESS_PERMISSION_ID = 'filesystem_workspace_access';

function getLastPathSegment(pathValue = '') {
  if (typeof pathValue !== 'string') {
    return '';
  }
  const trimmed = pathValue.trim().replace(/[\\/]+$/, '');
  if (!trimmed) {
    return '';
  }
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : trimmed;
}

function extractWorkspaceSelection(status = null) {
  const selectedPaths = Array.isArray(status?.details?.selected_paths)
    ? status.details.selected_paths.filter((value) => typeof value === 'string' && value.trim())
    : [];
  if (status?.granted !== true || selectedPaths.length === 0) {
    return null;
  }
  const workspacePath = selectedPaths[0];
  const workspaceName = getLastPathSegment(workspacePath) || workspacePath;
  return {
    workspaceName,
    workspacePath,
    selectedPaths,
  };
}

function createSetActiveWorkspaceMenuItem({ onSetActiveWorkspace, log = console.log } = {}) {
  return {
    label: 'Set active workspace…',
    accelerator: 'CommandOrControl+O',
    click: () => {
      Promise.resolve()
        .then(() => onSetActiveWorkspace?.())
        .catch((error) => {
          log('[Main] Failed to set active workspace:', error?.message || error);
        });
    },
  };
}

function buildApplicationMenuTemplate({
  platform = process.platform,
  onSetActiveWorkspace,
  log = console.log,
} = {}) {
  const fileSubmenu = [
    createSetActiveWorkspaceMenuItem({ onSetActiveWorkspace, log }),
  ];

  if (platform === 'darwin') {
    fileSubmenu.push(
      { type: 'separator' },
      { role: 'close' },
    );
  } else {
    fileSubmenu.push(
      { type: 'separator' },
      { role: 'quit' },
    );
  }

  const template = [
    platform === 'darwin' ? { role: 'appMenu' } : null,
    {
      label: 'File',
      submenu: fileSubmenu,
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ].filter(Boolean);

  return template;
}

async function requestWorkspaceFolderSelection({
  dialog,
  permissionStateStore,
  userDataPath,
  platform = process.platform,
} = {}) {
  const resolvedPermissionStateStore = permissionStateStore || createPermissionStateStore({
    userDataPath,
  });

  return requestPermission(WORKSPACE_ACCESS_PERMISSION_ID, {
    dialog,
    platform,
    permissionStateStore: resolvedPermissionStateStore,
  });
}

function installApplicationMenu({
  Menu,
  dialog,
  userDataPath,
  permissionStateStore,
  platform = process.platform,
  onSetActiveWorkspace,
  onWorkspaceAccessUpdated,
  log = console.log,
} = {}) {
  if (!Menu || typeof Menu.buildFromTemplate !== 'function' || typeof Menu.setApplicationMenu !== 'function') {
    return null;
  }

  const defaultSetActiveWorkspace = async () => {
    const status = await requestWorkspaceFolderSelection({
      dialog,
      permissionStateStore,
      userDataPath,
      platform,
    });
    const workspaceSelection = extractWorkspaceSelection(status);
    if (typeof onWorkspaceAccessUpdated === 'function') {
      onWorkspaceAccessUpdated({
        granted: status?.granted === true,
        status,
        workspaceSelection,
      });
    }
    return status;
  };

  const resolvedOnSetActiveWorkspace = typeof onSetActiveWorkspace === 'function'
    ? onSetActiveWorkspace
    : defaultSetActiveWorkspace;

  const template = buildApplicationMenuTemplate({
    platform,
    onSetActiveWorkspace: resolvedOnSetActiveWorkspace,
    log,
  });
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return {
    menu,
    template,
  };
}

module.exports = {
  WORKSPACE_ACCESS_PERMISSION_ID,
  buildApplicationMenuTemplate,
  extractWorkspaceSelection,
  getLastPathSegment,
  installApplicationMenu,
  requestWorkspaceFolderSelection,
};
