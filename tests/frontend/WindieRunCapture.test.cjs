/** @jest-environment node */

const path = require('path');
const { capture } = require('../../scripts/windie/run.cjs');

const repoRoot = path.resolve(__dirname, '../..');

describe('windie run capture', () => {
  test('captures stdout larger than the old spawnSync default buffer', () => {
    const chunkSize = 8192;
    const iterations = 160;
    const expectedLength = chunkSize * iterations;
    const script = [
      `const chunk = 'x'.repeat(${chunkSize});`,
      `for (let index = 0; index < ${iterations}; index += 1) process.stdout.write(chunk);`,
    ].join(' ');

    const result = capture(process.execPath, ['-e', script], { cwd: repoRoot });

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.stderr).toBe('');
    expect(result.stdout).toHaveLength(expectedLength);
  });
});
