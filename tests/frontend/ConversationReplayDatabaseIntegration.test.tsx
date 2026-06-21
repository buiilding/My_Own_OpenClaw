/**
 * Covers conversation replay database integration. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { useConversationReplayActions } from '../../frontend/src/renderer/features/chat/hooks/useConversationReplayActions';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  createConversationEvent,
  LocalRuntimeConversationStore,
  SdkConversationRuntime,
  type ConversationEvent,
  type JsonRecord,
} from '../../packages/windie-sdk-js/src';
import { invokeAgentSdkCommand } from '../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

let mockCommandHandler: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
let mockSessionConversationRef = 'conv-replay-db';
let mockSessionUserId: string | null = 'user-replay-db';
let mockBackendRehydrateFailure: Error | null = null;

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  invokeAgentSdkCommand: jest.fn((command: string, payload?: Record<string, unknown>) => (
    mockCommandHandler(command, payload)
  )),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockSessionConversationRef),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: mockSessionConversationRef,
      userId: mockSessionUserId,
    })),
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: {
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    },
  })),
}));

type SqliteChatRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  event_type: string;
  role: string | null;
  content: string | null;
  timestamp: string;
  message_index: number;
  revision_id: string | null;
  turn_ref: string | null;
  tool_name: string | null;
  correlation_id: string | null;
  workspace_path: string | null;
  workspace_name: string | null;
  producer: string;
  producer_event_id: string | null;
  producer_sequence: number | null;
  metadata: string | null;
  attachments: string | null;
  event_payload: string;
  compaction_checkpoint: string | null;
};

const PYTHON_SQLITE_BRIDGE = String.raw`
import json
import sqlite3
import sys


def role_for_event(event):
    event_type = event.get("type")
    if event_type == "user_message":
        return "user"
    if event_type in {"tool_output", "tool_bundle_output"}:
        return "tool"
    return "assistant"


def text_for_event(event):
    payload = event.get("payload") or {}
    for key in ("text", "content", "finalResponse", "final_response", "error"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return f"[sdk event: {event.get('type')}]"


def insert_event(conn, user_id, event, message_index):
    payload = event.get("payload") or {}
    event_type = event.get("type")
    source = event.get("source")
    conn.execute(
        """
        INSERT INTO conversation_events
        (id, user_id, conversation_id, event_type, role, content, timestamp,
         message_index, revision_id, turn_ref, tool_name, correlation_id,
         workspace_path, workspace_name, producer, producer_event_id,
         producer_sequence, metadata, attachments, event_payload,
         compaction_checkpoint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event.get("eventId"),
            user_id,
            event.get("conversationRef"),
            event_type,
            role_for_event(event),
            text_for_event(event),
            event.get("timestamp"),
            message_index,
            event.get("revisionId"),
            event.get("turnRef"),
            payload.get("toolName"),
            payload.get("correlationId"),
            payload.get("workspacePath"),
            payload.get("workspaceName"),
            "backend" if source == "backend" else "sdk",
            event.get("eventId") if source == "backend" else None,
            payload.get("backendSequence") if source == "backend" else None,
            json.dumps(payload.get("metadata") or {}),
            json.dumps(payload.get("attachments") or []),
            json.dumps(event),
            json.dumps(payload) if event_type == "compaction_applied" else None,
        ),
    )


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


request = json.load(sys.stdin)
action = request["action"]
db_path = request["db_path"]
payload = request.get("payload") or {}

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    if action == "init":
        conn.execute(
            """
            CREATE TABLE conversation_events (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              conversation_id TEXT,
              event_type TEXT NOT NULL,
              role TEXT,
              content TEXT,
              timestamp TEXT NOT NULL,
              message_index INTEGER NOT NULL,
              revision_id TEXT,
              turn_ref TEXT,
              tool_name TEXT,
              correlation_id TEXT,
              workspace_path TEXT,
              workspace_name TEXT,
              producer TEXT NOT NULL DEFAULT 'sdk',
              producer_event_id TEXT,
              producer_sequence INTEGER,
              metadata TEXT,
              attachments TEXT,
              event_payload TEXT NOT NULL,
              compaction_checkpoint TEXT
            )
            """
        )
        conn.commit()
        print(json.dumps({"ok": True}))
    elif action == "seed":
        for index, event in enumerate(payload["events"], start=1):
            insert_event(conn, payload["userId"], event, index)
        conn.commit()
        print(json.dumps({"ok": True}))
    elif action == "rows":
        rows = conn.execute(
            """
            SELECT *
            FROM conversation_events
            WHERE conversation_id = ?
            ORDER BY message_index ASC
            """,
            (payload["conversationRef"],),
        ).fetchall()
        print(json.dumps([row_to_dict(row) for row in rows]))
    elif action == "rpc":
        method = payload["method"]
        params = payload.get("params") or {}
        if method == "conversation.load_events":
            rows = conn.execute(
                """
                SELECT *
                FROM conversation_events
                WHERE user_id = ? AND conversation_id = ?
                  AND message_index > ?
                ORDER BY message_index ASC
                LIMIT ?
                """,
                (
                    params.get("user_id"),
                    params.get("conversation_id"),
                    params.get("after_message_index") or 0,
                    params.get("limit") or 1000,
                ),
            ).fetchall()
            print(json.dumps({
                "success": True,
                "data": {
                    "conversation_id": params.get("conversation_id"),
                    "events": [row_to_dict(row) for row in rows],
                    "count": len(rows),
                },
            }))
        elif method == "conversation.append_event":
            next_index_row = conn.execute(
                """
                SELECT COALESCE(MAX(message_index), 0) + 1 AS next_index
                FROM conversation_events
                WHERE user_id = ? AND conversation_id = ?
                """,
                (
                    params.get("user_id"),
                    params.get("conversation_id"),
                ),
            ).fetchone()
            insert_event(
                conn,
                str(params.get("user_id")),
                params["event_payload"],
                int(next_index_row["next_index"] or 1),
            )
            conn.commit()
            print(json.dumps({
                "success": True,
                "data": {
                    "inserted_count": 1,
                    "conversation_id": params.get("conversation_id"),
                    "record_kind": "chat_event",
                },
            }))
        elif method == "conversation.rewrite_after_event":
            cutoff_index = 0
            cut_after_event_id = params.get("cut_after_event_id")
            if isinstance(cut_after_event_id, str) and cut_after_event_id.strip():
                cutoff = conn.execute(
                    """
                    SELECT message_index
                    FROM conversation_events
                    WHERE user_id = ? AND conversation_id = ? AND id = ?
                    """,
                    (
                        params.get("user_id"),
                        params.get("conversation_id"),
                        cut_after_event_id,
                    ),
                ).fetchone()
                if cutoff is None:
                    print(json.dumps({
                        "success": False,
                        "error": "cut_after_event_id was not found",
                    }))
                    sys.exit(0)
                cutoff_index = int(cutoff["message_index"] or 0)
            deleted = conn.execute(
                """
                DELETE FROM conversation_events
                WHERE user_id = ? AND conversation_id = ? AND message_index > ?
                """,
                (
                    params.get("user_id"),
                    params.get("conversation_id"),
                    cutoff_index,
                ),
            ).rowcount
            insert_event(
                conn,
                str(params.get("user_id")),
                params["event"]["event_payload"],
                cutoff_index + 1,
            )
            conn.commit()
            print(json.dumps({
                "success": True,
                "data": {
                    "deleted_count": deleted,
                    "inserted_count": 1,
                    "conversation_id": params.get("conversation_id"),
                    "record_kind": "chat_event",
                },
            }))
        else:
            print(json.dumps({
                "success": False,
                "error": f"Unexpected local-runtime RPC: {method}",
            }))
    else:
        raise RuntimeError(f"Unexpected action: {action}")
finally:
    conn.close()
`;

function runPythonSqliteBridge<T>(
  action: string,
  dbPath: string,
  payload: JsonRecord = {},
): T {
  const python = process.env.WINDIE_PYTHON_PATH || 'python3';
  const result = spawnSync(python, ['-c', PYTHON_SQLITE_BRIDGE], {
    input: JSON.stringify({ action, db_path: dbPath, payload }),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Python SQLite bridge failed for ${action}`);
  }
  return JSON.parse(result.stdout) as T;
}

class SqliteConversationHistory {
  readonly dir = mkdtempSync(join(tmpdir(), 'agent-replay-db-'));
  readonly dbPath = join(this.dir, 'history.db');
  rewriteFailure: string | null = null;

  constructor() {
    runPythonSqliteBridge('init', this.dbPath);
  }

  close(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }

  seedEvents({
    userId,
    events,
  }: {
    userId: string;
    events: ConversationEvent[];
  }): void {
    runPythonSqliteBridge('seed', this.dbPath, {
      userId,
      events,
    });
  }

  rows(conversationRef: string): SqliteChatRow[] {
    return runPythonSqliteBridge('rows', this.dbPath, { conversationRef });
  }

  async rpc({ method, params }: { method: string; params?: JsonRecord }): Promise<JsonRecord> {
    if (method === 'conversation.rewrite_after_event' && this.rewriteFailure) {
      return {
        success: false,
        error: this.rewriteFailure,
      };
    }
    return runPythonSqliteBridge('rpc', this.dbPath, {
      method,
      params: params ?? {},
    });
  }
}

const BASE_MESSAGES = [
  { id: 'stored-user-1', sender: 'user', text: 'first question' },
  { id: 'stored-assistant-1', sender: 'assistant', text: 'first answer' },
  {
    id: 'stored-user-2',
    sender: 'user',
    text: 'second question',
    screenshotRef: 'artifact-old',
  },
  { id: 'stored-assistant-2', sender: 'assistant', text: 'second answer' },
];

function renderReplayHook(messages: Array<Record<string, unknown>>) {
  useChatStore.getState().setMessages(messages as never, 'conv-replay-db');
  return renderHook(() => useConversationReplayActions({
    messages,
    setMessages: useChatStore.getState().setMessages,
    setThinkingStatus: useChatStore.getState().setThinkingStatus,
    setThinkingSourceEventType: useChatStore.getState().setThinkingSourceEventType,
    setIsSending: useChatStore.getState().setIsSending,
  }));
}

function expectReplayPreparationErrorMessage(): void {
  expect(useChatStore.getState().getWorkspaceState('conv-replay-db').messages).toEqual([
    ...BASE_MESSAGES,
    expect.objectContaining({
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'renderer-replay',
      text: expect.stringContaining('could not prepare the conversation replay'),
    }),
  ]);
}

describe('conversation replay database integration', () => {
  let history: SqliteConversationHistory;
  const sentQueries: JsonRecord[] = [];
  const backendRehydrates: JsonRecord[] = [];
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionConversationRef = 'conv-replay-db';
    mockSessionUserId = 'user-replay-db';
    mockBackendRehydrateFailure = null;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useChatStore.setState({ activeConversationRef: 'conv-replay-db' });
    useChatStore.getState().clearMessages('conv-replay-db');
    sentQueries.length = 0;
    backendRehydrates.length = 0;
    history = new SqliteConversationHistory();
    history.seedEvents({
      userId: 'user-replay-db',
      events: [
        createConversationEvent({
          eventId: 'stored-user-1',
          type: 'user_message',
          conversationRef: 'conv-replay-db',
          revisionId: 'rev-old',
          timestamp: '2026-06-06T12:00:00.000Z',
          payload: { text: 'first question' },
        }),
        createConversationEvent({
          eventId: 'stored-assistant-1',
          type: 'assistant_message',
          conversationRef: 'conv-replay-db',
          revisionId: 'rev-old',
          timestamp: '2026-06-06T12:00:01.000Z',
          payload: { text: 'first answer' },
        }),
        createConversationEvent({
          eventId: 'stored-user-2',
          type: 'user_message',
          conversationRef: 'conv-replay-db',
          revisionId: 'rev-old',
          timestamp: '2026-06-06T12:00:02.000Z',
          payload: { text: 'second question', screenshot_ref: 'artifact-old' },
        }),
        createConversationEvent({
          eventId: 'stored-assistant-2',
          type: 'assistant_message',
          conversationRef: 'conv-replay-db',
          revisionId: 'rev-old',
          timestamp: '2026-06-06T12:00:03.000Z',
          payload: { text: 'second answer' },
        }),
      ],
    });

    mockCommandHandler = async (command, payload = {}) => {
      if (command === 'conversation.prepareEditAndResend') {
        if (payload.userId !== 'user-replay-db') {
          throw new Error(
            payload.userId
              ? 'Agent SDK command user id does not match the active user.'
              : 'Agent SDK command requires an active user id.',
          );
        }
        const store = new LocalRuntimeConversationStore({
          userId: String(payload.userId),
          runtime: {
            rpc: request => history.rpc(request),
          },
        });
        const runtime = new SdkConversationRuntime({
          conversationRef: String(payload.conversationRef),
          store,
          transport: {
            rehydrateConversation: async rehydratePayload => {
              backendRehydrates.push(rehydratePayload);
              if (mockBackendRehydrateFailure) {
                throw mockBackendRehydrateFailure;
              }
            },
          } as never,
        });
        await runtime.load();
        return runtime.prepareEditAndResend({
          messageId: String(payload.messageId),
          text: String(payload.text),
          payload: (payload.payload ?? {}) as JsonRecord,
          model: (payload.model ?? null) as never,
        });
      }

      if (command === 'conversation.send') {
        sentQueries.push(payload);
        return { ok: true };
      }

      throw new Error(`Unexpected frontend command: ${command}`);
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    history.close();
  });

  test('edit and resend cuts stored conversation events, rehydrates backend history, and dispatches the edited turn', async () => {
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-2',
        'edited second question',
      )).resolves.toBe(true);
    });

    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).toHaveBeenCalledWith(
      'conv-replay-db',
      'user-replay-db',
    );
    expect(invokeAgentSdkCommand).toHaveBeenCalledWith('conversation.prepareEditAndResend', expect.objectContaining({
      conversationRef: 'conv-replay-db',
      userId: 'user-replay-db',
      messageId: 'stored-user-2',
      text: 'edited second question',
    }));
    expect(backendRehydrates).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        rehydrate_mode: 'replace',
        messages: [
          expect.objectContaining({ role: 'user', content: 'first question' }),
          expect.objectContaining({ role: 'assistant', content: 'first answer' }),
        ],
      }),
    ]);
    expect(JSON.stringify(backendRehydrates[0])).not.toContain('second answer');

    expect(sentQueries).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        text: 'edited second question',
        screenshot_ref: 'artifact-old',
        memory_retrieval_enabled: expect.any(Boolean),
      }),
    ]);

    const storedRows = history.rows('conv-replay-db');
    const conversationRows = storedRows.filter(row => row.event_type !== 'trace_event');
    expect(conversationRows.map(row => row.id)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      expect.stringMatching(/conversation_rewritten$/),
    ]);
    expect(conversationRows.map(row => row.event_type)).toEqual([
      'user_message',
      'assistant_message',
      'conversation_rewritten',
    ]);
    expect(conversationRows.map(row => row.message_index)).toEqual([1, 2, 3]);
    expect(storedRows.some(row => row.id === 'stored-user-2')).toBe(false);
    expect(storedRows.some(row => row.id === 'stored-assistant-2')).toBe(false);
  });

  test('edit and resend of the first user turn rewrites the whole tail and still sends', async () => {
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-1',
        'edited first question',
      )).resolves.toBe(true);
    });

    expect(invokeAgentSdkCommand).toHaveBeenCalledWith('conversation.prepareEditAndResend', expect.objectContaining({
      conversationRef: 'conv-replay-db',
      userId: 'user-replay-db',
      messageId: 'stored-user-1',
      text: 'edited first question',
    }));
    expect(backendRehydrates).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        rehydrate_mode: 'replace',
        messages: [],
      }),
    ]);
    expect(sentQueries).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        text: 'edited first question',
        memory_retrieval_enabled: expect.any(Boolean),
      }),
    ]);

    const storedRows = history.rows('conv-replay-db');
    const conversationRows = storedRows.filter(row => row.event_type !== 'trace_event');
    expect(conversationRows.map(row => row.id)).toEqual([
      expect.stringMatching(/conversation_rewritten$/),
    ]);
    expect(conversationRows.map(row => row.event_type)).toEqual([
      'conversation_rewritten',
    ]);
    expect(conversationRows.map(row => row.message_index)).toEqual([1]);
  });

  test('reports preparation failure when renderer message identity cannot map to a stored user_message', async () => {
    const messages = [
      ...BASE_MESSAGES,
      { id: 'renderer-user-3', sender: 'user', text: 'third question' },
      { id: 'renderer-assistant-3', sender: 'assistant', text: 'third answer' },
    ];
    const { result } = renderReplayHook(messages);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'renderer-user-3',
        'edited third question',
      )).resolves.toBe(false);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ChatInterface] Failed to edit user message:',
      expect.objectContaining({
        message: expect.stringContaining('Cannot edit missing user message'),
      }),
    );
    expect(backendRehydrates).toEqual([]);
    expect(sentQueries).toEqual([]);
    expect(history.rows('conv-replay-db').map(row => row.id)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expect(useChatStore.getState().getWorkspaceState('conv-replay-db').messages).toEqual([
      ...messages,
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        sourceEventType: 'renderer-replay',
        text: expect.stringContaining('could not prepare the conversation replay'),
      }),
    ]);
  });

  test.each([
    {
      label: 'missing',
      userId: null,
      error: 'Agent SDK command requires an active user id.',
    },
    {
      label: 'stale',
      userId: 'user-stale',
      error: 'Agent SDK command user id does not match the active user.',
    },
  ])('reports preparation failure when transcript session user binding is $label', async ({ userId, error }) => {
    mockSessionUserId = userId;
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-2',
        'edited second question',
      )).resolves.toBe(false);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ChatInterface] Failed to edit user message:',
      expect.objectContaining({ message: error }),
    );
    expect(backendRehydrates).toEqual([]);
    expect(sentQueries).toEqual([]);
    expect(history.rows('conv-replay-db').map(row => row.id)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expectReplayPreparationErrorMessage();
  });

  test('reports preparation failure when local-runtime SQLite cutoff rewrite fails', async () => {
    history.rewriteFailure = 'forced sqlite rewrite failure';
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-2',
        'edited second question',
      )).resolves.toBe(false);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ChatInterface] Failed to edit user message:',
      expect.objectContaining({ message: 'forced sqlite rewrite failure' }),
    );
    expect(backendRehydrates).toEqual([]);
    expect(sentQueries).toEqual([]);
    expect(history.rows('conv-replay-db').map(row => row.id)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expectReplayPreparationErrorMessage();
  });

  test('reports preparation failure when backend rehydrate fails before final send', async () => {
    mockBackendRehydrateFailure = new Error('forced backend rehydrate failure');
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-2',
        'edited second question',
      )).resolves.toBe(false);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ChatInterface] Failed to edit user message:',
      expect.objectContaining({ message: 'forced backend rehydrate failure' }),
    );
    expect(backendRehydrates).toHaveLength(1);
    expect(sentQueries).toEqual([]);
    const conversationRows = history
      .rows('conv-replay-db')
      .filter(row => row.event_type !== 'trace_event');
    expect(conversationRows.map(row => row.id)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      expect.stringMatching(/conversation_rewritten$/),
    ]);
    expectReplayPreparationErrorMessage();
  });
});
