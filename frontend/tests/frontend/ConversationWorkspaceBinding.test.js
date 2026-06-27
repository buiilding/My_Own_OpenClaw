/**
 * Covers conversation workspace binding. behavior in the frontend test suite.
 */

const MODULE_PATH = '../../src/renderer/infrastructure/workspace/conversationWorkspaceBinding';
const STORAGE_KEY = 'conversation-workspace-bindings';

function loadBindingsModule() {
  jest.resetModules();
  return require(MODULE_PATH);
}

describe('conversation workspace binding helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    jest.resetModules();
  });

  test('round trips normalized conversation workspace bindings through sessionStorage', () => {
    const {
      getConversationWorkspaceBinding,
      setConversationWorkspaceBinding,
    } = loadBindingsModule();

    expect(
      setConversationWorkspaceBinding(' conv-1 ', {
        workspacePath: ' C:/Projects/project-alpha/ ',
        workspaceName: '',
      }),
    ).toEqual({
      workspacePath: 'C:/Projects/project-alpha/',
      workspaceName: 'project-alpha',
    });
    expect(getConversationWorkspaceBinding('conv-1')).toEqual({
      workspacePath: 'C:/Projects/project-alpha/',
      workspaceName: 'project-alpha',
    });
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
      'conv-1': {
        workspacePath: 'C:/Projects/project-alpha/',
        workspaceName: 'project-alpha',
      },
    });
  });

  test('ignores malformed stored payloads and empty conversation refs', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{"": {"workspacePath": "bad"},');
    const {
      getConversationWorkspaceBinding,
      setConversationWorkspaceBinding,
    } = loadBindingsModule();

    expect(getConversationWorkspaceBinding('conv-missing')).toEqual({
      workspacePath: '',
      workspaceName: '',
    });
    expect(setConversationWorkspaceBinding('   ', { workspacePath: '/tmp/app' })).toEqual({
      workspacePath: '',
      workspaceName: '',
    });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('{"": {"workspacePath": "bad"},');
  });

  test('loads valid stored bindings and normalizes malformed entries', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ' conv-1 ': { workspacePath: '/repo/app/', workspaceName: '  ' },
        'conv-2': { workspacePath: 123, workspaceName: 'ignored' },
      }),
    );
    const { getConversationWorkspaceBinding } = loadBindingsModule();

    expect(getConversationWorkspaceBinding('conv-1')).toEqual({
      workspacePath: '/repo/app/',
      workspaceName: 'app',
    });
    expect(getConversationWorkspaceBinding('conv-2')).toEqual({
      workspacePath: '',
      workspaceName: '',
    });
  });

  test('clears one binding or all stored bindings', () => {
    const {
      clearAllConversationWorkspaceBindings,
      clearConversationWorkspaceBinding,
      getConversationWorkspaceBinding,
      setConversationWorkspaceBinding,
    } = loadBindingsModule();

    setConversationWorkspaceBinding('conv-1', { workspacePath: '/repo/one' });
    setConversationWorkspaceBinding('conv-2', { workspacePath: '/repo/two' });

    clearConversationWorkspaceBinding('conv-1');
    expect(getConversationWorkspaceBinding('conv-1')).toEqual({
      workspacePath: '',
      workspaceName: '',
    });
    expect(getConversationWorkspaceBinding('conv-2')).toEqual({
      workspacePath: '/repo/two',
      workspaceName: 'two',
    });

    clearAllConversationWorkspaceBindings();
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({});
    expect(getConversationWorkspaceBinding('conv-2')).toEqual({
      workspacePath: '',
      workspaceName: '',
    });
  });

  test('resolves conversation metadata before memory metadata fallback', () => {
    const { resolveConversationWorkspaceBinding } = loadBindingsModule();

    expect(
      resolveConversationWorkspaceBinding({
        conversation: {
          workspace_path: '/repo/conversation',
          workspace_name: 'Conversation Repo',
        },
        memories: [
          {
            metadata: {
              workspace_path: '/repo/memory',
              workspace_name: 'Memory Repo',
            },
          },
        ],
      }),
    ).toEqual({
      workspacePath: '/repo/conversation',
      workspaceName: 'Conversation Repo',
    });

    expect(
      resolveConversationWorkspaceBinding({
        conversation: { workspace_path: '   ' },
        memories: [
          { metadata: { workspace_path: '', workspace_name: 'ignored' } },
          { metadata: { workspace_path: '/repo/memory', workspace_name: '' } },
        ],
      }),
    ).toEqual({
      workspacePath: '/repo/memory',
      workspaceName: 'memory',
    });

    expect(resolveConversationWorkspaceBinding({ memories: 'bad' })).toEqual({
      workspacePath: '',
      workspaceName: '',
    });
  });

  test('converts active workspace selection to a normalized binding', () => {
    const { workspaceSelectionToBinding } = loadBindingsModule();

    expect(
      workspaceSelectionToBinding({
        activeWorkspacePath: ' /repo/project ',
        activeWorkspaceName: ' Project ',
      }),
    ).toEqual({
      workspacePath: '/repo/project',
      workspaceName: 'Project',
    });
  });
});
