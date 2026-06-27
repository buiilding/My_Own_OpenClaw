/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveWorkspaceRepoInstructionPromptLayers,
} = require('../../src/main/app/repo_instruction_runtime.cjs');

describe('repo_instruction_runtime', () => {
  test('resolves file paths to their parent directory before loading prompt layers', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-alpha-agents-file-'));
    const filePath = path.join(workspaceRoot, 'main.ts');
    fs.writeFileSync(filePath, 'console.log("hi");\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'use tests\n', 'utf8');

    expect(resolveWorkspaceRepoInstructionPromptLayers(filePath)).toEqual([
      {
        id: expect.stringContaining('agents-md:'),
        type: 'agents_md',
        priority: 40,
        content: `# AGENTS.md instructions for ${workspaceRoot}\n\nuse tests`,
      },
    ]);
  });

  test('resolveWorkspaceRepoInstructionPromptLayers walks from git root to workspace', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-alpha-agents-layers-'));
    const workspaceDir = path.join(repoRoot, 'apps', 'desktop');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.git'));
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), 'root instructions\n', 'utf8');
    fs.writeFileSync(path.join(repoRoot, 'apps', 'AGENTS.md'), 'apps instructions\n', 'utf8');

    const layers = resolveWorkspaceRepoInstructionPromptLayers(workspaceDir);

    expect(layers.map((layer) => layer.content)).toEqual([
      `# AGENTS.md instructions for ${repoRoot}\n\nroot instructions`,
      `# AGENTS.md instructions for ${path.join(repoRoot, 'apps')}\n\napps instructions`,
    ]);
  });
});
