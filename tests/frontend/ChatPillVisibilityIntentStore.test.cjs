/** @jest-environment node */

const path = require('path');

const {
  readChatPillVisibilityIntent,
  resolveChatPillVisibilityIntentPath,
  writeChatPillVisibilityIntent,
} = require('../../frontend/src/main/chat_pill_visibility_intent_store.cjs');

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
  test('resolves the state file under userData', () => {
    expect(resolveChatPillVisibilityIntentPath({
      userDataPath: '/tmp/windie-user-data',
    })).toBe(path.join('/tmp/windie-user-data', 'chat-pill-visibility-intent.json'));
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
