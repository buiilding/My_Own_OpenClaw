/**
 * Covers create windie extension. behavior in the frontend test suite.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const {
  createWindieExtension,
  parseArgs,
} = require('../../scripts/create-windie-extension.cjs');
const {
  loadAgentExtensionRegistry,
} = require('../../src/main/extensions/extension_manifest.cjs');

describe('create-windie-extension scaffold', () => {
  test('creates loadable divided plugin and skill contributions', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contribution-scaffold-'));

    const result = createWindieExtension({
      extensionId: 'repo-agent',
      contributionsDir: contributionRoot,
      name: 'Repo Agent',
      toolName: 'inspect_repo',
    });

    expect(result.pluginDir).toBe(path.join(contributionRoot, 'plugins', 'repo-agent'));
    expect(result.skillDir).toBe(path.join(contributionRoot, 'skills', 'repo-agent'));
    expect(fs.existsSync(path.join(result.pluginDir, 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.pluginDir, 'schemas', 'inspect_repo.schema.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.pluginDir, 'python', 'inspect_repo.py'))).toBe(true);
    expect(fs.existsSync(path.join(result.skillDir, 'SKILL.md'))).toBe(true);
    const pluginManifestText = fs.readFileSync(path.join(result.pluginDir, 'plugin.json'), 'utf8');
    const pluginReadmeText = fs.readFileSync(path.join(result.pluginDir, 'README.md'), 'utf8');
    const skillReadmeText = fs.readFileSync(path.join(result.skillDir, 'README.md'), 'utf8');

    expect(pluginManifestText).toContain('Starter local-runtime plugin');
    expect(pluginReadmeText).toContain('local-runtime plugin generated');
    expect(pluginReadmeText).toContain('Python entrypoint executed by the local runtime');
    expect(skillReadmeText).toContain('local-runtime plugin');
    const retiredStarterProductPlugin = [
      'Starter',
      ['Windie', 'OS'].join(''),
      'local-runtime plugin',
    ].join(' ');
    const retiredProductSidecarPlugin = [
      ['Win', 'die'].join(''),
      'sidecar plugin',
    ].join(' ');
    const scaffoldText = `${pluginManifestText}\n${pluginReadmeText}\n${skillReadmeText}`;

    for (const retiredCopy of [
      retiredStarterProductPlugin,
      retiredProductSidecarPlugin,
      'sidecar plugin',
      'local sidecar entrypoint',
    ]) {
      expect(scaffoldText).not.toContain(retiredCopy);
    }

    const loaded = loadAgentExtensionRegistry({ contributionsDir: contributionRoot });

    expect(loaded.errors).toEqual([]);
    expect(loaded.plugins).toEqual([
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
      }),
    ]);
    expect(loaded.skills).toEqual([
      expect.objectContaining({
        id: 'extension:skill:repo-agent',
        type: 'extension_skill',
      }),
    ]);
  });

  test('refuses to overwrite an existing extension folder', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contribution-scaffold-'));
    fs.mkdirSync(path.join(contributionRoot, 'plugins', 'repo-agent'), { recursive: true });

    expect(() => createWindieExtension({
      extensionId: 'repo-agent',
      contributionsDir: contributionRoot,
    })).toThrow(/already exists/);
  });

  test('prints generic contribution labels after scaffold creation', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contribution-scaffold-'));
    const scriptPath = path.resolve(__dirname, '../../scripts/create-windie-extension.cjs');

    const output = childProcess.execFileSync(
      process.execPath,
      [scriptPath, 'repo-agent', '--dir', contributionRoot],
      { encoding: 'utf8' },
    );

    expect(output).toContain('Created local-runtime plugin at');
    expect(output).toContain('Created prompt skill at');
    expect(output).not.toContain('Created Windie plugin');
    expect(output).not.toContain('Created Windie skill');
  });

  test('prints generic contribution root help', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/create-windie-extension.cjs');

    const output = childProcess.execFileSync(
      process.execPath,
      [scriptPath, '--help'],
      { encoding: 'utf8' },
    );

    expect(output).toContain('--dir <path>       Contribution root. Defaults to .');
    expect(output).not.toContain('WindieOS repo/contribution root');
  });

  test('parses command arguments', () => {
    expect(parseArgs([
      'repo-agent',
      '--dir',
      '/tmp/agent-contributions',
      '--name',
      'Repo Agent',
      '--tool',
      'inspect_repo',
    ])).toEqual({
      extensionId: 'repo-agent',
      contributionsDir: '/tmp/agent-contributions',
      force: false,
      name: 'Repo Agent',
      toolName: 'inspect_repo',
    });
  });
});
