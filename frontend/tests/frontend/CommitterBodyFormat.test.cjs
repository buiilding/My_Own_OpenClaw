/**
 * Covers the committer helper's enforced body structure.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const committerPath = path.join(repoRoot, 'scripts', 'committer.sh');

function createTempGitRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-committer-'));

  spawnSync('git', ['init'], { cwd: tempDir, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Agent Test'], { cwd: tempDir, encoding: 'utf8' });

  fs.writeFileSync(path.join(tempDir, 'note.txt'), 'initial\n', 'utf8');
  spawnSync('git', ['add', 'note.txt'], { cwd: tempDir, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'chore: seed'], { cwd: tempDir, encoding: 'utf8' });
  fs.writeFileSync(path.join(tempDir, 'note.txt'), 'updated\n', 'utf8');

  return tempDir;
}

function runCommitter(cwd, body) {
  return spawnSync('bash', [
    committerPath,
    'docs(test): commit body format',
    '--body',
    body,
    '--no-verify',
    '--',
    'note.txt',
  ], {
    cwd,
    encoding: 'utf8',
  });
}

const validBody = `What changed:
The committer helper validates commit bodies against the AGENTS.md section contract before staging files.

Owning layer:
The shared helper owns the guard because it is the agent-facing entrypoint that creates scoped repository commits.

Previous behavior:
The helper accepted any non-empty body, so agents could commit without ownership, validation, or migration context.

New path:
The helper rejects commits unless the body includes each required section with concrete content.

Validation:
Ran the focused committer body format tests.

Migration/security:
No migration required. No security-sensitive boundary changed.`;

describe('committer body format', () => {
  const tempDirs = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects bodies that omit a required section', () => {
    const tempDir = createTempGitRepo();
    tempDirs.push(tempDir);
    const invalidBody = validBody.replace(/\nOwning layer:\n[\s\S]*?\n\nPrevious behavior:/, '\nPrevious behavior:');

    const result = runCommitter(tempDir, invalidBody);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('commit body sections must appear in this exact order');
  });

  test('rejects placeholder-only section content', () => {
    const tempDir = createTempGitRepo();
    tempDirs.push(tempDir);
    const invalidBody = validBody.replace(
      'No migration required. No security-sensitive boundary changed.',
      'N/A',
    );

    const result = runCommitter(tempDir, invalidBody);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Migration/security:");
    expect(result.stderr).toContain('placeholder-only');
  });

  test('creates a commit for a complete structured body', () => {
    const tempDir = createTempGitRepo();
    tempDirs.push(tempDir);

    const result = runCommitter(tempDir, validBody);
    const log = spawnSync('git', ['log', '-1', '--format=%B'], {
      cwd: tempDir,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('error: commit body');
    expect(log.stdout).toContain('What changed:');
    expect(log.stdout).toContain('Migration/security:');
  });
});
