export function selectChatInterfaceState(state) {
  return {
    messages: state.messages,
    isSending: state.isSending,
    thinkingStatus: state.thinkingStatus,
    tokenCounts: state.tokenCounts,
  };
}
