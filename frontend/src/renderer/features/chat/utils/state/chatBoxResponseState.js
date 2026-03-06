import { resolveSourceTag } from '../message/sourceTags';

export function isResponseCloseable(response) {
  if (!response) {
    return false;
  }
  if (response.type === 'error') {
    return true;
  }
  return Boolean(response.isComplete);
}

export function normalizeThinkingText(thinkingStatus) {
  return typeof thinkingStatus === 'string' ? thinkingStatus.trim() : '';
}

export function shouldRenderResponseMarkdown(response) {
  return Boolean(response && response.type !== 'tool-call' && response.type !== 'error');
}

export function resolveSourceTagForResponse({
  visibleResponse,
  showResponse,
  devUiEnabled,
}) {
  if (!devUiEnabled || !visibleResponse || !showResponse) {
    return null;
  }
  const sourceEventType = (
    typeof visibleResponse.sourceEventType === 'string' && visibleResponse.sourceEventType
      ? visibleResponse.sourceEventType
      : 'unknown'
  );
  const sourceChannel = (
    typeof visibleResponse.sourceChannel === 'string' && visibleResponse.sourceChannel
      ? visibleResponse.sourceChannel
      : 'unknown'
  );
  return resolveSourceTag(sourceEventType, sourceChannel);
}
