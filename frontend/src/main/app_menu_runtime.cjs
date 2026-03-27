const { createPermissionStateStore } = require('./permission_state_store.cjs');
const { requestPermission } = require('./permission_service.cjs');

const WORKSPACE_ACCESS_PERMISSION_ID = 'filesystem_workspace_access';

function createOpenFolderMenuItem({ onOpenFolder, log = console.log } = {}) {
  return {
    label: 'Open Folder…',
    accelerator: 'CommandOrControl+O',
    click: () => {
      Promise.resolve()
        .then(() => onOpenFolder?.())
        .catch((error) => {
          log('[Main] Failed to open workspace folder picker:', error?.message || error);
        });
    },
  };
}

function buildApplicationMenuTemplate({
  platform = process.platform,
  onOpenFolder,
  log = console.log,
} = {}) {
  const fileSubmenu = [
    createOpenFolderMenuItem({ onOpenFolder, log }),
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
  onOpenFolder,
  log = console.log,
} = {}) {
  if (!Menu || typeof Menu.buildFromTemplate !== 'function' || typeof Menu.setApplicationMenu !== 'function') {
    return null;
  }

  const resolvedOnOpenFolder = typeof onOpenFolder === 'function'
    ? onOpenFolder
    : () => requestWorkspaceFolderSelection({
      dialog,
      permissionStateStore,
      userDataPath,
      platform,
    });

  const template = buildApplicationMenuTemplate({
    platform,
    onOpenFolder: resolvedOnOpenFolder,
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
  installApplicationMenu,
  requestWorkspaceFolderSelection,
};
