/**
 * Covers the public Windie commit search history scope.
 */

const {
  gitLogPathspecArgs,
  loadRecentCommits,
} = require('../../scripts/windie/commits.cjs');

describe('public windie commit search', () => {
  test('limits git log scans to the public repo root pathspec by default', () => {
    const calls = [];
    const captureFn = (command, args, options) => {
      calls.push({ command, args, options });
      return { ok: true, stdout: '', stderr: '', error: null };
    };

    expect(loadRecentCommits({ scanLimit: 7, captureFn })).toEqual([]);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.command).toBe('git');
      expect(call.args).toEqual(expect.arrayContaining(['log', '--max-count=7']));
      expect(call.args.slice(-2)).toEqual(['--', '.']);
    }
  });

  test('omits git pathspec separator only when explicitly disabled', () => {
    expect(gitLogPathspecArgs([])).toEqual([]);
    expect(gitLogPathspecArgs(['.'])).toEqual(['--', '.']);
  });
});
