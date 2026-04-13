/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildAgentsMdMessage,
  normalizeWorkspaceDirectory,
  resolveWorkspaceRepoInstructionMessages,
} = require('../../frontend/src/main/repo_instruction_runtime.cjs');

describe('repo_instruction_runtime', () => {
  test('buildAgentsMdMessage returns null for blank contents', () => {
    expect(buildAgentsMdMessage('/tmp/workspace', ' \n ')).toBeNull();
  });

  test('normalizeWorkspaceDirectory resolves file paths to their parent directory', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windieos-agents-file-'));
    const filePath = path.join(workspaceRoot, 'main.ts');
    fs.writeFileSync(filePath, 'console.log("hi");\n', 'utf8');

    expect(normalizeWorkspaceDirectory(filePath)).toBe(workspaceRoot);
  });

  test('resolveWorkspaceRepoInstructionMessages walks from git root to workspace', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windieos-agents-repo-'));
    const workspaceDir = path.join(repoRoot, 'apps', 'desktop');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.git'));
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), 'root instructions\n', 'utf8');
    fs.writeFileSync(path.join(repoRoot, 'apps', 'AGENTS.md'), 'apps instructions\n', 'utf8');

    const messages = resolveWorkspaceRepoInstructionMessages(workspaceDir);

    expect(messages).toEqual([
      {
        role: 'user',
        content: `# AGENTS.md instructions for ${repoRoot}\n\n<INSTRUCTIONS>\nroot instructions\n</INSTRUCTIONS>`,
      },
      {
        role: 'user',
        content: `# AGENTS.md instructions for ${path.join(repoRoot, 'apps')}\n\n<INSTRUCTIONS>\napps instructions\n</INSTRUCTIONS>`,
      },
    ]);
  });
});
