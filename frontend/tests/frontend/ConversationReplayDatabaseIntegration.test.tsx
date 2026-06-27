/**
 * Covers conversation replay database integration. behavior in the frontend test suite.
 */

import {
  act,
  renderHook,
} from '@testing-library/react';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { useConversationReplayActions } from '../../src/renderer/features/chat/hooks/useConversationReplayActions';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  clearMessagesInChatStore,
  setMessagesInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  createConversationEvent,
  LocalRuntimeConversationStore,
  SdkConversationRuntime,
  type ConversationEvent,
  type JsonRecord,
} from '../../packages/windie-sdk-js/src';
import { AgentSdkCommandInvokeClient } from '../../src/renderer/app/runtime/agentSdkCommandInvokeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

let mockCommandHandler: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
let mockSessionConversationRef = 'conv-replay-db';
let mockSessionUserId: string | null = 'user-replay-db';
let mockBackendRehydrateFailure: Error | null = null;

jest.mock('../../src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: jest.fn((command: string, payload?: Record<string, unknown>) => (
      mockCommandHandler(command, payload)
    )),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockSessionConversationRef),
    getTranscriptSessionInfo: jest.fn(() => ({
      conversationRef: mockSessionConversationRef,
      userId: mockSessionUserId,
    })),
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopPendingTurnRuntimeClient', () => ({
  DesktopPendingTurnRuntimeClient: {
    setPending: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: {
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    },
  })),
}));

const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;

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
  const bridgeInput = JSON.stringify({ action, db_path: dbPath, payload });
  const candidates = process.env.WINDIE_PYTHON_PATH
    ? [{ command: process.env.WINDIE_PYTHON_PATH, args: ['-c', PYTHON_SQLITE_BRIDGE] }]
    : [
      { command: 'py', args: ['-3', '-c', PYTHON_SQLITE_BRIDGE] },
      { command: 'python3', args: ['-c', PYTHON_SQLITE_BRIDGE] },
      { command: 'python', args: ['-c', PYTHON_SQLITE_BRIDGE] },
    ];
  const results = candidates.map(candidate => spawnSync(candidate.command, candidate.args, {
    input: bridgeInput,
    encoding: 'utf8',
  }));
  const result = results.find(candidateResult => candidateResult.status === 0) ?? results.at(-1);
  if (result.status !== 0) {
    throw new Error(result.stderr || `Python SQLite bridge failed for ${action}`);
  }
  return JSON.parse(result.stdout) as T;
}

class SqliteConversationHistory {
  readonly dir = mkdtempSync(join(tmpdir(), 'agent-replay-db-'));
  readonly dbPath = join(this.dir, 'history.db');
  displayReplaceFailure: string | null = null;
  readonly displayTimelineByConversation = new Map<string, JsonRecord>();
  readonly modelHistoryByConversation = new Map<string, JsonRecord>();

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

  displayRows(conversationRef: string): JsonRecord[] {
    return this.rows(conversationRef)
      .filter(row => row.event_type === 'user_message' || row.event_type === 'assistant_message')
      .map((row, index) => ({
        id: row.id,
        conversationRef,
        revisionId: row.revision_id ?? 'rev-old',
        index,
        role: row.role ?? (row.event_type === 'user_message' ? 'user' : 'assistant'),
        type: row.event_type === 'user_message' ? 'user_message' : 'assistant_message',
        content: row.content,
        turnRef: row.turn_ref,
        metadata: {
          eventId: row.id,
          revisionId: row.revision_id ?? 'rev-old',
          timestamp: row.timestamp,
        },
      }));
  }

  async rpc({ method, params }: { method: string; params?: JsonRecord }): Promise<JsonRecord> {
    if (method === 'conversation.display.replace' && this.displayReplaceFailure) {
      return {
        success: false,
        error: this.displayReplaceFailure,
      };
    }
    if (method === 'conversation.display.load') {
      const conversationId = String(params?.conversation_id ?? '');
      const stored = this.displayTimelineByConversation.get(conversationId);
      return {
        success: true,
        data: stored ?? {
          conversation_id: conversationId,
          revision_id: 'rev-old',
          created_at: '2026-06-06T12:00:00.000Z',
          reason: null,
          base_revision_id: null,
          rows: this.displayRows(conversationId),
        },
      };
    }
    if (method === 'conversation.display.replace') {
      const conversationId = String(params?.conversation_id ?? '');
      const checkpoint = {
        conversation_id: conversationId,
        revision_id: params?.revision_id,
        created_at: params?.created_at,
        reason: params?.reason ?? null,
        base_revision_id: params?.base_revision_id ?? null,
        rows: Array.isArray(params?.rows) ? params.rows : [],
      };
      this.displayTimelineByConversation.set(conversationId, checkpoint);
      return {
        success: true,
        data: {
          revision_id: params?.revision_id,
          row_count: checkpoint.rows.length,
          created_at: params?.created_at,
        },
      };
    }
    if (method === 'conversation.model_history.load') {
      const conversationId = String(params?.conversation_id ?? '');
      const revisionId = String(params?.revision_id ?? '');
      return {
        success: true,
        data: this.modelHistoryByConversation.get(`${conversationId}:${revisionId}`) ?? null,
      };
    }
    if (method === 'conversation.model_history.replace') {
      const conversationId = String(params?.conversation_id ?? '');
      const revisionId = String(params?.revision_id ?? '');
      const checkpoint = {
        conversation_id: conversationId,
        revision_id: revisionId,
        checkpoint_id: params?.checkpoint_id,
        created_at: params?.created_at,
        rows: Array.isArray(params?.rows) ? params.rows : [],
      };
      this.modelHistoryByConversation.set(`${conversationId}:${revisionId}`, checkpoint);
      return {
        success: true,
        data: {
          checkpoint_id: params?.checkpoint_id,
          revision_id: revisionId,
          row_count: checkpoint.rows.length,
          created_at: params?.created_at,
        },
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
  setMessagesInChatStore(messages as never, 'conv-replay-db');
  return renderHook(() => useConversationReplayActions());
}

function expectReplaySendErrorMessage(prefixMessages: Array<Record<string, unknown>> = []): void {
  expect(useChatStore.getState().getWorkspaceState('conv-replay-db').messages).toEqual([
    ...prefixMessages,
    expect.objectContaining({
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'renderer-replay',
      text: expect.stringContaining("Your message wasn't sent"),
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
    clearMessagesInChatStore('conv-replay-db');
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
      if (
        command === 'conversation.loadDisplayTimeline'
        || command === 'conversation.editAndResend'
        || command === 'conversation.retryTurn'
      ) {
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
            connect: async () => undefined,
            handshake: async () => undefined,
            sendQuery: async queryPayload => {
              sentQueries.push(queryPayload);
              return String(payload.turnRef || 'turn-replay-db');
            },
            sendToolResult: async () => undefined,
            sendToolBundleResult: async () => undefined,
            rehydrateConversation: async rehydratePayload => {
              backendRehydrates.push(rehydratePayload);
              if (mockBackendRehydrateFailure) {
                throw mockBackendRehydrateFailure;
              }
            },
            compactHistory: async () => undefined,
            wakewordDetected: async () => undefined,
            updateSettings: async () => undefined,
            listModels: async () => undefined,
            stop: async () => undefined,
            subscribe: () => () => undefined,
            close: async () => undefined,
          } as never,
        });
        await runtime.load();
        if (command === 'conversation.loadDisplayTimeline') {
          return runtime.loadDisplayTimeline({
            revisionId: typeof payload.revisionId === 'string' ? payload.revisionId : null,
          });
        }
        if (command === 'conversation.editAndResend') {
          return runtime.editAndResend({
            messageId: String(payload.messageId),
            text: String(payload.text),
            turnRef: typeof payload.turnRef === 'string' ? payload.turnRef : undefined,
            payload: (payload.payload && typeof payload.payload === 'object'
              ? payload.payload
              : {}) as JsonRecord,
            model: (payload.model && typeof payload.model === 'object'
              ? payload.model
              : undefined) as never,
          });
        }
        return runtime.retryTurn({
          messageId: typeof payload.messageId === 'string' ? payload.messageId : undefined,
          turnRef: typeof payload.turnRef === 'string' ? payload.turnRef : undefined,
          payload: (payload.payload && typeof payload.payload === 'object'
            ? payload.payload
            : {}) as JsonRecord,
          model: (payload.model && typeof payload.model === 'object'
            ? payload.model
            : undefined) as never,
        });
      }

      throw new Error(`Unexpected frontend command: ${command}`);
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    history?.close();
  });

  test('edit and resend uses the SDK revision command without cutting raw events', async () => {
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
    expect(invokeAgentSdkCommand).not.toHaveBeenCalledWith(
      'conversation.loadDisplayTimeline',
      expect.anything(),
    );
    expect(invokeAgentSdkCommand).toHaveBeenCalledWith('conversation.editAndResend', expect.objectContaining({
      conversationRef: 'conv-replay-db',
      userId: 'user-replay-db',
      messageId: 'stored-user-2',
      text: 'edited second question',
      payload: {},
    }));
    expect(backendRehydrates).toEqual([]);

    expect(sentQueries).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        revision_id: expect.any(String),
        text: 'edited second question',
      }),
    ]);
    expect(sentQueries[0]).not.toHaveProperty('screenshot_ref');

    const storedRows = history.rows('conv-replay-db');
    const conversationRows = storedRows.filter(row => row.event_type !== 'trace_event');
    expect(conversationRows.map(row => row.id).slice(0, 4)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expect(conversationRows.map(row => row.event_type).slice(0, 4)).toEqual([
      'user_message',
      'assistant_message',
      'user_message',
      'assistant_message',
    ]);
    expect(conversationRows.map(row => row.event_type)).toEqual(expect.arrayContaining([
      'settings_updated',
      'turn_started',
      'user_message',
    ]));
    expect(conversationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_type: 'user_message',
        content: 'edited second question',
      }),
    ]));
    expect(history.displayTimelineByConversation.get('conv-replay-db')?.rows).toEqual([
      expect.objectContaining({ row_id: 'stored-user-1' }),
      expect.objectContaining({ row_id: 'stored-assistant-1' }),
      expect.objectContaining({
        role: 'user',
        content: 'edited second question',
      }),
    ]);
  });

  test('edit and resend of the first user turn stores an empty display prefix and still sends', async () => {
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-1',
        'edited first question',
      )).resolves.toBe(true);
    });

    expect(invokeAgentSdkCommand).toHaveBeenCalledWith('conversation.editAndResend', expect.objectContaining({
      conversationRef: 'conv-replay-db',
      userId: 'user-replay-db',
      messageId: 'stored-user-1',
      text: 'edited first question',
    }));
    expect(backendRehydrates).toEqual([]);
    expect(sentQueries).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        revision_id: expect.any(String),
        text: 'edited first question',
      }),
    ]);

    const storedRows = history.rows('conv-replay-db');
    const conversationRows = storedRows.filter(row => row.event_type !== 'trace_event');
    expect(conversationRows.map(row => row.id).slice(0, 4)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expect(conversationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_type: 'user_message',
        content: 'edited first question',
      }),
    ]));
    expect(history.displayTimelineByConversation.get('conv-replay-db')?.rows).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'edited first question',
      }),
    ]);
  });

  test('reports SDK edit failure when renderer message identity cannot map to a stored user_message', async () => {
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
        message: expect.stringContaining('Cannot edit missing user message: renderer-user-3'),
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
        text: expect.stringContaining("Your message wasn't sent"),
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
  ])('reports send failure when transcript session user binding is $label', async ({ userId, error }) => {
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
    expectReplaySendErrorMessage(BASE_MESSAGES);
  });

  test('reports send failure when the SDK revision command display replacement fails', async () => {
    history.displayReplaceFailure = 'forced display replacement failure';
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-2',
        'edited second question',
      )).resolves.toBe(false);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ChatInterface] Failed to edit user message:',
      expect.objectContaining({ message: 'forced display replacement failure' }),
    );
    expect(backendRehydrates).toEqual([]);
    expect(sentQueries).toEqual([]);
    expect(history.rows('conv-replay-db').map(row => row.id)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expectReplaySendErrorMessage(BASE_MESSAGES);
  });

  test('backend rehydrate failure is not part of SDK revision resend', async () => {
    mockBackendRehydrateFailure = new Error('forced backend rehydrate failure');
    const { result } = renderReplayHook(BASE_MESSAGES);

    await act(async () => {
      await expect(result.current.handleEditFromUser(
        'stored-user-2',
        'edited second question',
      )).resolves.toBe(true);
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(backendRehydrates).toEqual([]);
    expect(sentQueries).toEqual([
      expect.objectContaining({
        conversation_ref: 'conv-replay-db',
        text: 'edited second question',
      }),
    ]);
    const conversationRows = history
      .rows('conv-replay-db')
      .filter(row => row.event_type !== 'trace_event');
    expect(conversationRows.map(row => row.id).slice(0, 4)).toEqual([
      'stored-user-1',
      'stored-assistant-1',
      'stored-user-2',
      'stored-assistant-2',
    ]);
    expect(conversationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_type: 'user_message',
        content: 'edited second question',
      }),
    ]));
  });
});
