import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const SESSION_STORAGE_KEY = 'transcript-session-info';

type SessionInfo = {
  sessionId: string | null;
  userId: string | null;
};

type PendingMessage = {
  text: string;
  screenshot?: string | null;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
};

let currentSessionId: string | null = null;
let currentUserId: string | null = null;
const pendingUserMessages: PendingMessage[] = [];
const seenToolEntries = new Map<string, Set<string>>();
const lastEntryBySession = new Map<string, { signature: string; timestamp: number }>();

const readStoredSessionInfo = (): SessionInfo => {
  if (typeof window === 'undefined') {
    return { sessionId: null, userId: null };
  }
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return { sessionId: null, userId: null };
    }
    const parsed = JSON.parse(raw);
    return {
      sessionId: typeof parsed?.sessionId === 'string' ? parsed.sessionId : null,
      userId: typeof parsed?.userId === 'string' ? parsed.userId : null,
    };
  } catch (error) {
    return { sessionId: null, userId: null };
  }
};

const persistSessionInfo = (info: SessionInfo) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(info));
  } catch (error) {
    // Ignore storage errors.
  }
};

const notifySessionUpdate = (info: SessionInfo) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent('transcript-session-update', { detail: info }));
};

const ensureSessionInfoLoaded = () => {
  if (currentSessionId || currentUserId) {
    return;
  }
  const stored = readStoredSessionInfo();
  currentSessionId = stored.sessionId;
  currentUserId = stored.userId;
};

const resolveSessionInfo = (override?: Partial<SessionInfo>): SessionInfo => {
  ensureSessionInfoLoaded();
  return {
    sessionId: override?.sessionId ?? currentSessionId,
    userId: override?.userId ?? currentUserId,
  };
};

const flushPendingUserMessages = async () => {
  if (!currentSessionId || !currentUserId || pendingUserMessages.length === 0) {
    return;
  }

  const pending = pendingUserMessages.splice(0, pendingUserMessages.length);
  for (const message of pending) {
    await storeTranscriptEntry({
      content: message.text,
      role: 'user',
      messageType: 'user',
      timestamp: message.timestamp,
      modelId: message.modelId,
      modelProvider: message.modelProvider,
      screenshot: message.screenshot,
    });
  }
};

export const updateTranscriptSession = (sessionId?: string | null, userId?: string | null) => {
  const nextSessionId = sessionId || currentSessionId;
  const nextUserId = userId || currentUserId;

  if (nextSessionId) {
    currentSessionId = nextSessionId;
  }
  if (nextUserId) {
    currentUserId = nextUserId;
  }

  const info = { sessionId: currentSessionId, userId: currentUserId };
  persistSessionInfo(info);
  notifySessionUpdate(info);
  void flushPendingUserMessages();
};

export const getTranscriptSessionInfo = (): SessionInfo => {
  ensureSessionInfoLoaded();
  return { sessionId: currentSessionId, userId: currentUserId };
};

export const recordUserMessage = (
  text: string,
  options: {
    timestamp?: string;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshot?: string | null;
  } = {}
) => {
  if (!text) {
    return;
  }
  const { sessionId, userId, timestamp, modelId, modelProvider, screenshot } = options;
  const info = resolveSessionInfo({ sessionId: sessionId ?? null, userId: userId ?? null });

  if (!info.sessionId || !info.userId) {
    pendingUserMessages.push({ text, timestamp, modelId, modelProvider, screenshot });
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'user',
    messageType: 'user',
    timestamp,
    modelId,
    modelProvider,
    screenshot,
    sessionId: info.sessionId,
    userId: info.userId,
  });
};

export const recordAssistantMessage = (
  text: string,
  options: {
    messageType?: string;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshot?: string | null;
  } = {}
) => {
  if (!text) {
    return;
  }
  const info = resolveSessionInfo({ sessionId: options.sessionId ?? null, userId: options.userId ?? null });
  if (!info.sessionId || !info.userId) {
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'assistant',
    messageType: options.messageType || 'llm-text',
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshot: options.screenshot,
    sessionId: info.sessionId,
    userId: info.userId,
  });
};

export const recordToolMessage = (
  text: string,
  options: {
    messageType: string;
    toolName?: string;
    correlationId?: string;
    sessionId?: string | null;
    userId?: string | null;
    modelId?: string | null;
    modelProvider?: string | null;
    screenshot?: string | null;
  }
) => {
  if (!text) {
    return;
  }
  const info = resolveSessionInfo({ sessionId: options.sessionId ?? null, userId: options.userId ?? null });
  if (!info.sessionId || !info.userId) {
    return;
  }

  void storeTranscriptEntry({
    content: text,
    role: 'tool',
    messageType: options.messageType,
    toolName: options.toolName,
    correlationId: options.correlationId,
    modelId: options.modelId,
    modelProvider: options.modelProvider,
    screenshot: options.screenshot,
    sessionId: info.sessionId,
    userId: info.userId,
  });
};

type TranscriptEntry = {
  content: string;
  role?: string | null;
  messageType?: string | null;
  toolName?: string | null;
  correlationId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  timestamp?: string;
  modelId?: string | null;
  modelProvider?: string | null;
  screenshot?: string | null;
};

const shouldSkipEntry = (entry: TranscriptEntry, sessionId: string | null) => {
  if (!sessionId) {
    return false;
  }

  if (entry.correlationId) {
    const toolKey = `${entry.messageType || ''}:${entry.correlationId}`;
    const sessionSet = seenToolEntries.get(sessionId) || new Set<string>();
    if (sessionSet.has(toolKey)) {
      return true;
    }
    sessionSet.add(toolKey);
    if (sessionSet.size > 500) {
      sessionSet.clear();
      sessionSet.add(toolKey);
    }
    seenToolEntries.set(sessionId, sessionSet);
  }

  if (entry.role === 'assistant' && entry.messageType !== 'tool-call' && entry.messageType !== 'tool-output') {
    const signature = `${entry.role || ''}|${entry.messageType || ''}|${entry.content}`;
    const now = Date.now();
    const lastEntry = lastEntryBySession.get(sessionId);
    if (lastEntry && lastEntry.signature === signature && now - lastEntry.timestamp < 5000) {
      return true;
    }
    lastEntryBySession.set(sessionId, { signature, timestamp: now });
  }
  return false;
};

const storeTranscriptEntry = async (entry: TranscriptEntry) => {
  const info = resolveSessionInfo({ sessionId: entry.sessionId ?? null, userId: entry.userId ?? null });
  if (!info.sessionId || !info.userId) {
    return;
  }
  if (shouldSkipEntry(entry, info.sessionId)) {
    return;
  }

  await IpcBridge.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
    content: entry.content,
    userId: info.userId,
    sessionId: info.sessionId,
    role: entry.role,
    messageType: entry.messageType,
    toolName: entry.toolName,
    correlationId: entry.correlationId,
    modelId: entry.modelId,
    modelProvider: entry.modelProvider,
    screenshot: entry.screenshot,
    timestamp: entry.timestamp,
  });
};
