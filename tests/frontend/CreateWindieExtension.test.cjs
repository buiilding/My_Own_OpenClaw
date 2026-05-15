const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createWindieExtension,
  parseArgs,
} = require('../../scripts/create-windie-extension.cjs');
const {
  loadAgentExtensions,
} = require('../../frontend/src/main/extension_manifest.cjs');

describe('create-windie-extension scaffold', () => {
  test('creates a loadable extension package with a sidecar tool and skill', () => {
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-extension-scaffold-'));

    const result = createWindieExtension({
      extensionId: 'repo-agent',
      extensionsDir,
      name: 'Repo Agent',
      toolName: 'inspect_repo',
    });

    expect(result.extensionDir).toBe(path.join(extensionsDir, 'repo-agent'));
    expect(fs.existsSync(path.join(result.extensionDir, 'extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.extensionDir, 'tools', 'inspect_repo.schema.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.extensionDir, 'python', 'inspect_repo.py'))).toBe(true);
    expect(fs.existsSync(path.join(result.extensionDir, 'skills', 'agent', 'SKILL.md'))).toBe(true);

    const loaded = loadAgentExtensions({ extensionsDir });

    expect(loaded.errors).toEqual([]);
    expect(loaded.extensions).toEqual([
      expect.objectContaining({
        id: 'repo-agent',
        name: 'Repo Agent',
        tools: [
          expect.objectContaining({
            name: 'inspect_repo',
            schema: expect.objectContaining({
              required: ['text'],
            }),
          }),
        ],
        prompt_layers: [
          expect.objectContaining({
            id: 'extension:repo-agent:skill:repo-agent-agent',
            type: 'extension_skill',
          }),
        ],
      }),
    ]);
  });

  test('refuses to overwrite an existing extension folder', () => {
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-extension-scaffold-'));
    fs.mkdirSync(path.join(extensionsDir, 'repo-agent'), { recursive: true });

    expect(() => createWindieExtension({
      extensionId: 'repo-agent',
      extensionsDir,
    })).toThrow(/already exists/);
  });

  test('parses command arguments', () => {
    expect(parseArgs([
      'repo-agent',
      '--dir',
      '/tmp/extensions',
      '--name',
      'Repo Agent',
      '--tool',
      'inspect_repo',
    ])).toEqual({
      extensionId: 'repo-agent',
      extensionsDir: '/tmp/extensions',
      force: false,
      name: 'Repo Agent',
      toolName: 'inspect_repo',
    });
  });
});
