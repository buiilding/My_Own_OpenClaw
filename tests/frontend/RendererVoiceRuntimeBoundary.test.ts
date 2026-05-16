import fs from 'node:fs/promises';
import path from 'node:path';

describe('renderer voice runtime boundary', () => {
  test('wakeword controller uses the desktop voice runtime facade for backend notifications', async () => {
    const wakewordControllerPath = path.resolve(
      __dirname,
      '../../frontend/src/renderer/app/WakewordController.jsx',
    );
    const source = await fs.readFile(wakewordControllerPath, 'utf8');

    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('ApiClient.');
    expect(source).toContain('DesktopVoiceRuntimeClient.wakewordDetected');
  });
});
