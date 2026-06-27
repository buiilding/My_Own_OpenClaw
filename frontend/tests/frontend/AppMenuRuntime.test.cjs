/** @jest-environment node */

const {
  extractWorkspaceSelection,
  installApplicationMenu,
} = require('../../src/main/app/app_menu_runtime.cjs');

describe('app_menu_runtime', () => {
  test('builds a File menu with Set active workspace first', () => {
    const Menu = {
      buildFromTemplate: jest.fn((template) => ({ template })),
      setApplicationMenu: jest.fn(),
    };

    const installed = installApplicationMenu({
      Menu,
      platform: 'darwin',
      onSetActiveWorkspace: jest.fn(),
    });

    const fileMenu = installed.template.find((entry) => entry && entry.label === 'File');
    expect(fileMenu).toBeTruthy();
    expect(fileMenu.submenu[0]).toMatchObject({
      label: 'Set active workspace…',
      accelerator: 'CommandOrControl+O',
    });
  });

  test('installApplicationMenu wires Set active workspace to the provided handler', async () => {
    const onSetActiveWorkspace = jest.fn(async () => ({ status: 'granted' }));
    const capturedMenus = [];
    const Menu = {
      buildFromTemplate: jest.fn((template) => {
        capturedMenus.push(template);
        return { template };
      }),
      setApplicationMenu: jest.fn(),
    };

    const installed = installApplicationMenu({
      Menu,
      platform: 'darwin',
      onSetActiveWorkspace,
    });

    expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith({ template: installed.template });

    const fileMenu = capturedMenus[0].find((entry) => entry && entry.label === 'File');
    await fileMenu.submenu[0].click();

    expect(onSetActiveWorkspace).toHaveBeenCalledTimes(1);
  });

  test('extractWorkspaceSelection returns the active workspace name and path', () => {
    expect(extractWorkspaceSelection({
      granted: true,
      details: {
        selected_paths: ['/Users/peter/work/demo-workspace'],
      },
    })).toEqual({
      workspaceName: 'demo-workspace',
      workspacePath: '/Users/peter/work/demo-workspace',
      selectedPaths: ['/Users/peter/work/demo-workspace'],
    });
  });
});
