/** @jest-environment node */

const path = require('path');

const {
  readChatPillVisibilityIntent,
  writeChatPillVisibilityIntent,
} = require('../../src/main/surfaces/chat_pill_visibility_intent_store.cjs');

function createFsMock({ exists = false, contents = '' } = {}) {
  return {
    existsSync: jest.fn(() => exists),
    readFileSync: jest.fn(() => contents),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
  };
}

describe('chat_pill_visibility_intent_store', () => {
  test('writes the default state file under userData', () => {
    const fs = createFsMock();
    const userDataPath = '/tmp/agent-user-data';
    const statePath = path.join(userDataPath, 'chat-pill-visibility-intent.json');

    expect(writeChatPillVisibilityIntent({
      userHidden: false,
    }, {
      userDataPath,
      fs,
    })).toBe(true);

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.normalize(userDataPath), { recursive: true });
    const [tempPath] = fs.writeFileSync.mock.calls[0];
    expect(tempPath).toMatch(/[\\/]tmp[\\/]agent-user-data[\\/]chat-pill-visibility-intent\.json\.\d+\.\d+\.\d+\.tmp$/);
    expect(fs.renameSync).toHaveBeenCalledWith(tempPath, statePath);
  });

  test('defaults to visible intent when no state file exists', () => {
    const fs = createFsMock({ exists: false });

    expect(readChatPillVisibilityIntent({
      statePath: '/tmp/state.json',
      fs,
    })).toEqual({ userHidden: false });
  });

  test('reads persisted user-hidden intent', () => {
    const fs = createFsMock({
      exists: true,
      contents: '{"userHidden":true}',
    });

    expect(readChatPillVisibilityIntent({
      statePath: '/tmp/state.json',
      fs,
    })).toEqual({ userHidden: true });
  });

  test('writes normalized user-hidden intent', () => {
    const fs = createFsMock();

    expect(writeChatPillVisibilityIntent({
      userHidden: true,
    }, {
      statePath: '/tmp/state.json',
      fs,
    })).toBe(true);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [tempPath, contents, encoding] = fs.writeFileSync.mock.calls[0];
    expect(tempPath).toMatch(/\/tmp\/state\.json\.\d+\.\d+\.\d+\.tmp$/);
    expect(contents).toBe('{\n  "userHidden": true\n}\n');
    expect(encoding).toBe('utf8');
    expect(fs.renameSync).toHaveBeenCalledWith(tempPath, '/tmp/state.json');
  });

  test('treats corrupt persisted state as hidden instead of silently showing the pill', () => {
    const fs = createFsMock({
      exists: true,
      contents: '{"userHidden": tru',
    });

    expect(readChatPillVisibilityIntent({
      statePath: '/tmp/state.json',
      fs,
    })).toEqual({ userHidden: true });
  });
});
