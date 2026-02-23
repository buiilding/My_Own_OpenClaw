export function selectChatInterfaceState(state) {
  return {
    messages: state.messages,
    isSending: state.isSending,
    thinkingStatus: state.thinkingStatus,
    tokenCounts: state.tokenCounts,
    streamPhase: state.streamTracking?.phase ?? 'idle',
  };
}

export function selectChatBoxState(state) {
  return {
    messages: state.messages,
    isSending: state.isSending,
    thinkingStatus: state.thinkingStatus,
  };
}
