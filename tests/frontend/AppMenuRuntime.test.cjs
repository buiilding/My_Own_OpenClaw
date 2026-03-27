/** @jest-environment node */

const {
  buildApplicationMenuTemplate,
  installApplicationMenu,
} = require('../../frontend/src/main/app_menu_runtime.cjs');

describe('app_menu_runtime', () => {
  test('builds a File menu with Open Folder first', () => {
    const template = buildApplicationMenuTemplate({
      platform: 'darwin',
      onOpenFolder: jest.fn(),
    });

    const fileMenu = template.find((entry) => entry && entry.label === 'File');
    expect(fileMenu).toBeTruthy();
    expect(fileMenu.submenu[0]).toMatchObject({
      label: 'Open Folder…',
      accelerator: 'CommandOrControl+O',
    });
  });

  test('installApplicationMenu wires Open Folder to the provided handler', async () => {
    const onOpenFolder = jest.fn(async () => ({ status: 'granted' }));
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
      onOpenFolder,
    });

    expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith({ template: installed.template });

    const fileMenu = capturedMenus[0].find((entry) => entry && entry.label === 'File');
    await fileMenu.submenu[0].click();

    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });
});
