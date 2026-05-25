const fs = require('fs');
const path = require('path');

describe('frontend package scripts', () => {
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
});
