/**
 * Provides the ipc event replay state module for the Electron main process.
 */

function cloneReplayEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  const cloned = { ...event };
  if (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) {
    cloned.payload = { ...event.payload };
  }
  return cloned;
}

function createIpcEventReplayState(maxEvents = 240) {
  let activeTurnRef = null;
  let replayEvents = [];

  function clear() {
    activeTurnRef = null;
    replayEvents = [];
  }

  function startTurn(turnRef, seedEvent = null) {
    if (typeof turnRef !== 'string' || !turnRef.trim()) {
      clear();
      return;
    }
    activeTurnRef = turnRef.trim();
    replayEvents = [];
    if (seedEvent) {
      append(seedEvent);
    }
  }

  function append(event) {
    const cloned = cloneReplayEvent(event);
    if (!cloned) {
      return;
    }
    replayEvents.push(cloned);
    if (replayEvents.length > maxEvents) {
      replayEvents = replayEvents.slice(replayEvents.length - maxEvents);
    }
  }

  function appendForActiveTurn(event) {
    if (!activeTurnRef || !event || typeof event !== 'object' || Array.isArray(event)) {
      return;
    }
    const eventTurnRef = typeof event.turn_ref === 'string' ? event.turn_ref.trim() : '';
    if (!eventTurnRef || eventTurnRef !== activeTurnRef) {
      return;
    }
    append(event);
  }

  function snapshot() {
    return replayEvents
      .map((event) => cloneReplayEvent(event))
      .filter(Boolean);
  }

  return {
    clear,
    startTurn,
    append,
    appendForActiveTurn,
    snapshot,
  };
}

module.exports = {
  createIpcEventReplayState,
};

