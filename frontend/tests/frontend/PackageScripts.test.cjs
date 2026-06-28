/**
 * Covers package scripts. behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

describe('frontend package scripts', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const packageJsonPath = path.resolve(__dirname, '../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  test('release check runs typecheck, lint, and ci tests', () => {
    expect(packageJson.scripts['release:check']).toBe(
      'npm run typecheck && npm run lint && npm run test:ci',
    );
  });

  test('deprecation audit uses current eslint rule option shape', () => {
    const script = packageJson.scripts['lint:audit:deprecation'];

    expect(script).toContain('--rule={"deprecation/deprecation":"warn"}');
    expect(script).not.toContain("--rule 'deprecation/deprecation:warn'");
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

  test('desktop release workflow uses public root package commands', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/desktop-release.yml'),
      'utf8',
    );

    expect(workflow).toContain('cache-dependency-path: package-lock.json');
    expect(workflow).toContain('package_script: package:linux');
    expect(workflow).toContain('package_script: package:win');
    expect(workflow).toContain('package_script: package:mac');
    expect(workflow).toContain('release/windieos_*_x86_64.AppImage');
    expect(workflow).toContain('release/*.exe');
    expect(workflow).toContain('release/*.dmg');
    expect(workflow).not.toContain('working-directory: frontend');
    expect(workflow).not.toContain(':bundled-python');
    expect(workflow).not.toContain('frontend/release');
    expect(workflow).not.toContain('frontend/package-lock.json');
  });

  test('windows package smoke uses public root release directory', () => {
    const windowsSmokeScript = fs.readFileSync(
      path.join(repoRoot, 'scripts/ci/smoke-windows-packages.ps1'),
      'utf8',
    );

    expect(windowsSmokeScript).toContain('Join-Path $root "release"');
    expect(windowsSmokeScript).not.toContain('frontend\\release');
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
      'Application Support/WindieOS',
      'Caches/desktop-assistant',
      'Caches/DesktopAssistant',
      'Caches/WindieOS',
      'WebKit/desktop-assistant',
      'WebKit/DesktopAssistant',
      'WebKit/WindieOS',
    ]) {
      expect(macosReinstallScript).not.toContain(staleStatePath);
    }
  });
});
