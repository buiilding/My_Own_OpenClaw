/**
 * Covers dashboard conversation dialog ownership boundaries in the frontend suite.
 */

const fs = require('node:fs');
const path = require('node:path');

const rendererRoot = path.resolve(__dirname, '../../src/renderer');

describe('dashboard conversation dialog boundary', () => {
  test('dashboard hook routes browser dialogs through the app-runtime facade', () => {
    const dialogRuntimeSource = fs.readFileSync(
      path.join(rendererRoot, 'app/runtime/desktopDashboardConversationDialogRuntime.js'),
      'utf8',
    );
    const dashboardHookSource = fs.readFileSync(
      path.join(rendererRoot, 'features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );

    expect(dialogRuntimeSource).toContain('export const DesktopDashboardConversationDialogRuntime = Object.freeze');
    expect(dialogRuntimeSource).toContain('requestDashboardConversationRenameTitle');
    expect(dialogRuntimeSource).toContain('confirmDashboardConversationDelete');
    expect(dialogRuntimeSource).toContain('host.prompt');
    expect(dialogRuntimeSource).toContain('host.confirm');
    expect(dialogRuntimeSource).not.toContain('features/dashboard');

    expect(dashboardHookSource).toContain('desktopDashboardConversationDialogRuntime');
    expect(dashboardHookSource).toContain('DesktopDashboardConversationDialogRuntime');
    expect(dashboardHookSource).not.toContain('window.prompt');
    expect(dashboardHookSource).not.toContain('window.confirm');
    expect(dashboardHookSource).not.toContain("'Rename chat'");
    expect(dashboardHookSource).not.toContain("'Delete this chat? This cannot be undone.'");
  });
});
