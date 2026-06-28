/**
 * Covers renderer api client boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const rendererRoot = path.resolve(__dirname, '../../src/renderer');
const allowedRelativePaths = new Set([
  'app/runtime/desktopLiveTurnRuntimeClient.ts',
  'app/runtime/desktopSettingsRuntimeClient.ts',
  'app/runtime/desktopVoiceRuntimeClient.ts',
]);
const allowedBackendIpcRelativePaths = new Set([
  'app/runtime/desktopRuntimeTransport.ts',
  'infrastructure/ipc/channels.ts',
]);

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(absolutePath));
      continue;
    }
    if (/\.(cjs|js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

describe('renderer api client boundary', () => {
  test('legacy renderer ApiClient has been deleted', async () => {
    await expect(fs.access(path.join(rendererRoot, 'infrastructure/api/client.ts'))).rejects.toThrow();
  });

  test('retired renderer SDK re-export facade has been deleted', async () => {
    await expect(fs.access(path.join(rendererRoot, 'infrastructure/api/agentSdkClient.ts'))).rejects.toThrow();
  });

  test('renderer features use app-runtime clients instead of direct ApiClient calls', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/client') || source.includes('ApiClient.')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer backend IPC sends stay inside the SDK desktop transport adapter', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      if (allowedBackendIpcRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('SEND_CHANNELS.TO_BACKEND') || source.includes("'to-backend'") || source.includes('"to-backend"')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer app-runtime contracts import narrow SDK owner contracts directly', async () => {
    const source = await fs.readFile(
      path.join(rendererRoot, 'app/runtime/desktopConversationRuntimeContracts.ts'),
      'utf8',
    );
    const retiredProductType = `${'Wind' + 'ie'}ModelSelection`;

    expect(source).toContain("packages/windie-sdk-js/src/conversation/types.js");
    expect(source).toContain("packages/windie-sdk-js/src/runtime/ConversationContinuityService.js");
    expect(source).toContain("packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.js");
    expect(source).toContain("packages/windie-sdk-js/src/settings/modelSelection.js");
    expect(source).toContain("packages/windie-sdk-js/src/tools/toolCorrelationIds.js");
    expect(source).toContain('export const DesktopConversationRuntimeContracts = Object.freeze');
    expect(source).not.toContain("export * from '../../../../../packages/windie-sdk-js/src';");
    expect(source).not.toContain('export {\n  SDK_RUNTIME_COMMANDS');
    expect(source).not.toContain('export {\n  buildModelSettingsPatch');
    expect(source).not.toContain(`${retiredProductType} as AgentModelSelection`);
    expect(source).not.toContain('infrastructure/api/agentSdkClient');
  });

  test('production renderer code does not import the retired SDK re-export facade', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file).replace(/\\/g, '/');
      const source = await fs.readFile(file, 'utf8');
      if (
        source.includes('infrastructure/api/agentSdkClient')
        || source.includes('../api/agentSdkClient')
        || source.includes('api/agentSdkClient')
      ) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer architecture docs do not restore deleted api client or app-import sdk facade labels', async () => {
    const docs = await Promise.all([
      fs.readFile(path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'), 'utf8'),
      fs.readFile(path.resolve(__dirname, '../../docs/operations/release_packaging_change_workflow.md'), 'utf8'),
      fs.readFile(path.resolve(__dirname, '../../docs/planning/windieos_mobile_app_plan.md'), 'utf8'),
      fs.readFile(path.resolve(__dirname, '../../docs/providers/kimi_coding.md'), 'utf8'),
      fs.readFile(path.resolve(__dirname, '../../docs/reference/api_reference.md'), 'utf8'),
      fs.readFile(path.resolve(__dirname, '../../docs/web/web_client_integration.md'), 'utf8'),
      fs.readFile(path.join(rendererRoot, 'folder_structure.md'), 'utf8'),
    ]);
    const docText = docs.join('\n').replace(/\r\n/g, '\n');

    expect(docText).toContain('`infrastructure/api/client.ts` bridge and the later');
    expect(docText).toContain('app-runtime conversation contracts facade');
    expect(docText).toContain('retired Electron renderer SDK re-export facade has been removed');
    expect(docText).toContain('Electron renderer app-runtime facades');
    expect(docText).toContain('first-party Electron renderer app-runtime facades');
    expect(docText).toContain('non-Electron clients should import the\nSDK package');
    expect(docText).toContain('SDK/Main -> Backend');
    expect(docText).toContain('Backend -> SDK/Renderer Consumers');
    expect(docText).toContain('SDK/main local-runtime dispatch');
    expect(docText).toContain('SDK/main result shaping');
    expect(docText).toContain('RendererApiClientBoundary.test.ts');
    expect(docText).not.toContain('Developer-facing backend SDK transport wrapper');
    expect(docText).not.toContain('SDK runtime and hosted transport facade');
    expect(docText).not.toContain('Renderer SDK facade for hosted transport wrappers and runtime contracts');
    expect(docText).not.toContain('Electron renderer `ApiClient`');
    expect(docText).not.toContain('renderer `ApiClient`');
    expect(docText).not.toContain('renderer API client');
    expect(docText).not.toContain('customer-facing frontend');
    expect(docText).not.toContain('Client Messages (Frontend');
    expect(docText).not.toContain('Server Messages (Backend \u2192 Frontend)');
    expect(docText).not.toContain('Send tool execution result from frontend');
    expect(docText).not.toContain('Result of an atomic tool bundle executed on the frontend');
    expect(docText).not.toContain('frontend bundle runner');
    expect(docText).not.toContain('frontend uses fallback text');
    expect(docText).not.toContain('Request tool execution from frontend');
    expect(docText).not.toContain('Frontend executes all tools sequentially');
    expect(docText).not.toContain('ApiClient.test.ts');
    expect(docText).not.toContain('Renderer SDK facade for hosted transport wrappers, runtime contracts, and app imports');
    expect(docText).not.toContain('`renderer/infrastructure/api/client.ts` remains');
    expect(docText).not.toContain('typed backend command emitter');
  });
});
