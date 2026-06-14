/**
 * Covers renderer settings runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const settingsRuntimeFiles = [
  '../../frontend/src/renderer/app/providers/appConfigBackendSync.js',
  '../../frontend/src/renderer/app/providers/AppConfigProvider.jsx',
  '../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx',
].map((relativePath) => path.resolve(__dirname, relativePath));

describe('renderer settings runtime boundary', () => {
  test('model list and settings sync callers use the desktop settings runtime facade', async () => {
    const offenders: string[] = [];

    for (const file of settingsRuntimeFiles) {
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/client') || source.includes('ApiClient.')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../frontend/src/renderer'), file));
      }
      if (source.includes('infrastructure/api/windieSdkClient')) {
        offenders.push(path.relative(path.resolve(__dirname, '../../frontend/src/renderer'), file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
