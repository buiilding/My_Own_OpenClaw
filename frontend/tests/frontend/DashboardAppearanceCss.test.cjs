/**
 * Covers dashboard appearance . behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('dashboard appearance CSS', () => {
  test('routes the dashboard main surface through theme tokens', () => {
    const dashboardCss = readRepoFile('src/renderer/styles/DashboardShell.css');

    expect(dashboardCss).toContain('background: var(--ui-main-content-bg);');
    expect(dashboardCss).toContain('background: var(--ui-shell-overlay);');
  });

  test('defines light-mode dashboard backgrounds without the dark hardcoded main gradient', () => {
    const themeCss = readRepoFile('src/renderer/styles/theme.css');
    const lightThemeBlock = themeCss.slice(
      themeCss.indexOf(":root[data-agent-theme='light']"),
      themeCss.indexOf(":root[data-agent-translucent-sidebar='false']"),
    );

    expect(lightThemeBlock).toContain('--ui-main-content-bg:');
    expect(lightThemeBlock).toContain('--ui-shell-overlay:');
    expect(lightThemeBlock).not.toContain('rgba(10, 10, 10, 0.92)');
    expect(lightThemeBlock).not.toContain('rgba(8, 8, 8, 0.82)');
  });
});
