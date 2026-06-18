/**
 * Covers package scripts. behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

describe('frontend package scripts', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const packageJsonPath = path.resolve(__dirname, '../../frontend/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  test('release check runs typecheck, lint, and ci tests', () => {
    expect(packageJson.scripts['release:check']).toBe(
      'npm run typecheck && npm run lint && npm run test:ci',
    );
  });

  test.each(['package', 'package:win', 'package:mac', 'package:linux'])(
    '%s runs release validation before electron-builder',
    (scriptName) => {
      const script = packageJson.scripts[scriptName];
      expect(script).toContain('npm run release:check');
      expect(script.indexOf('npm run release:check')).toBeLessThan(
        script.indexOf('electron-builder'),
      );
    },
  );

  test('does not keep bundled-python package compatibility aliases', () => {
    expect(packageJson.scripts).not.toHaveProperty('package:win:bundled-python');
    expect(packageJson.scripts).not.toHaveProperty('package:mac:bundled-python');
    expect(packageJson.scripts).not.toHaveProperty('package:linux:bundled-python');
  });

  test('reinstall helpers only purge current WindieOS install names', () => {
    const linuxReinstallScript = fs.readFileSync(
      path.join(repoRoot, 'scripts/reinstall-windieos-linux.sh'),
      'utf8',
    );
    const macosReinstallScript = fs.readFileSync(
      path.join(repoRoot, 'scripts/reinstall-windieos-macos.sh'),
      'utf8',
    );

    expect(linuxReinstallScript).toContain('for pkg in windieos; do');
    expect(linuxReinstallScript).not.toContain('desktop-assistant-frontend');

    for (const staleStatePath of [
      'Application Support/desktop-assistant',
      'Application Support/DesktopAssistant',
      'Caches/desktop-assistant',
      'Caches/DesktopAssistant',
      'WebKit/desktop-assistant',
      'WebKit/DesktopAssistant',
    ]) {
      expect(macosReinstallScript).not.toContain(staleStatePath);
    }
  });
});
