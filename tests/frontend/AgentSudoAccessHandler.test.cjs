/** @jest-environment node */

const { EventEmitter } = require('events');

const {
  handleSetAgentSudoAccess,
} = require('../../frontend/src/main/agent_sudo_access_handler.cjs');

function createSpawnStub({ closeCode = 0, stderr = '', stdout = '', error = null } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      if (stdout) {
        child.stdout.emit('data', stdout);
      }
      if (stderr) {
        child.stderr.emit('data', stderr);
      }
      if (error) {
        child.emit('error', error);
        return;
      }
      child.emit('close', closeCode);
    });

    return child;
  };
}

describe('agent_sudo_access_handler', () => {
  test('returns unsupported on non-linux platform', async () => {
    const result = await handleSetAgentSudoAccess(
      { enabled: true },
      { platform: 'darwin', username: 'peter-bui' },
    );
    expect(result).toEqual({
      success: false,
      canceled: false,
      reason: 'Passwordless sudo toggle is currently supported only on Linux.',
    });
  });

  test('rejects persistent passwordless sudo enable without running privileged command', async () => {
    const spawnImpl = jest.fn(createSpawnStub({ closeCode: 0 }));
    const result = await handleSetAgentSudoAccess(
      { enabled: true },
      { platform: 'linux', username: 'peter-bui', spawnImpl },
    );

    expect(result).toEqual({
      success: false,
      enabled: false,
      canceled: false,
      reason: 'Persistent passwordless sudo access is no longer supported. Sudo commands use per-command OS authentication prompts instead.',
    });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  test('surfaces user-cancel message on dismissed auth prompt', async () => {
    const spawnImpl = createSpawnStub({
      closeCode: 126,
      stderr: 'Error executing command as another user: Request dismissed',
    });
    const result = await handleSetAgentSudoAccess(
      { enabled: false },
      { platform: 'linux', username: 'peter-bui', spawnImpl },
    );

    expect(result.success).toBe(false);
    expect(result.canceled).toBe(true);
    expect(String(result.reason || '')).toContain('User canceled or denied OS authentication');
  });

  test('surfaces missing pkexec error cleanly when removing legacy sudoers rule', async () => {
    const err = new Error('spawn pkexec ENOENT');
    err.code = 'ENOENT';
    const spawnImpl = createSpawnStub({ error: err });
    const result = await handleSetAgentSudoAccess(
      { enabled: false },
      { platform: 'linux', username: 'peter-bui', spawnImpl },
    );

    expect(result.success).toBe(false);
    expect(result.canceled).toBe(false);
    expect(String(result.reason || '')).toContain('pkexec not found');
  });

  test('disables legacy passwordless sudo via pkexec auth prompt', async () => {
    const spawnImpl = jest.fn(createSpawnStub({ closeCode: 0 }));
    const result = await handleSetAgentSudoAccess(
      { enabled: false },
      { platform: 'linux', username: 'peter-bui', spawnImpl },
    );

    expect(result).toEqual({
      success: true,
      enabled: false,
      canceled: false,
      reason: 'Legacy passwordless sudo access has been disabled for the current user.',
    });
    expect(spawnImpl).toHaveBeenCalledWith(
      'pkexec',
      [
        'bash',
        '-lc',
        expect.not.stringContaining('NOPASSWD: ALL'),
      ],
      expect.any(Object),
    );
    expect(spawnImpl.mock.calls[0][1][2]).toContain('/etc/sudoers.d/99-windieos-agent-nopasswd');
  });

  test('disable path surfaces pkexec spawn startup errors', async () => {
    const spawnImpl = createSpawnStub({
      error: new Error('spawn pkexec EACCES'),
    });
    const result = await handleSetAgentSudoAccess(
      { enabled: false },
      { platform: 'linux', username: 'peter-bui', spawnImpl },
    );

    expect(result.success).toBe(false);
    expect(result.canceled).toBe(false);
    expect(String(result.reason || '')).toContain('spawn pkexec EACCES');
  });
});
