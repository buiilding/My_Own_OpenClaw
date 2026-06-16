/**
 * Stores and retrieves chat pill visibility intent state for the Electron main process.
 */

const fs = require('fs');
const path = require('path');

const CHAT_PILL_VISIBILITY_INTENT_FILENAME = 'chat-pill-visibility-intent.json';
let tempFileCounter = 0;

function resolveChatPillVisibilityIntentPath({ userDataPath, statePath } = {}) {
  if (typeof statePath === 'string' && statePath.trim()) {
    return statePath;
  }
  if (typeof userDataPath === 'string' && userDataPath.trim()) {
    return path.join(userDataPath, CHAT_PILL_VISIBILITY_INTENT_FILENAME);
  }
  return null;
}

function readChatPillVisibilityIntent(deps = {}) {
  const fsModule = deps.fs || fs;
  const statePath = resolveChatPillVisibilityIntentPath(deps);
  if (!statePath) {
    return { userHidden: false };
  }
  try {
    if (!fsModule.existsSync(statePath)) {
      return { userHidden: false };
    }
    const raw = fsModule.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { userHidden: parsed?.userHidden === true };
  } catch (_error) {
    return { userHidden: true };
  }
}

function writeChatPillVisibilityIntent(intent = {}, deps = {}) {
  const fsModule = deps.fs || fs;
  const statePath = resolveChatPillVisibilityIntentPath(deps);
  if (!statePath) {
    return false;
  }
  try {
    fsModule.mkdirSync(path.dirname(statePath), { recursive: true });
    tempFileCounter += 1;
    const tempPath = `${statePath}.${process.pid}.${Date.now()}.${tempFileCounter}.tmp`;
    fsModule.writeFileSync(
      tempPath,
      `${JSON.stringify({ userHidden: intent?.userHidden === true }, null, 2)}\n`,
      'utf8',
    );
    fsModule.renameSync(tempPath, statePath);
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = {
  readChatPillVisibilityIntent,
  writeChatPillVisibilityIntent,
};
