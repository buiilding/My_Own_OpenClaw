const APPROX_CHARS_PER_TOKEN = 4;
const APPROX_IMAGE_TOKENS_PER_SCREENSHOT = 85;

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function estimateTextTokens(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }
  return Math.ceil(normalized.length / APPROX_CHARS_PER_TOKEN);
}

function hasScreenshotAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return false;
  }
  return (
    typeof attachment.screenshot === 'string'
    || typeof attachment.screenshotRef === 'string'
    || typeof attachment.screenshotUrl === 'string'
  );
}

function resolveUserScreenshotCount(message) {
  if (Array.isArray(message?.screenshots) && message.screenshots.length > 0) {
    return message.screenshots.filter(hasScreenshotAttachment).length;
  }

  return hasScreenshotAttachment({
    screenshot: message?.screenshot,
    screenshotRef: message?.screenshotRef,
    screenshotUrl: message?.screenshotUrl,
  })
    ? 1
    : 0;
}

function stringifyModelFacingToolCall(modelFacingToolCall) {
  if (!modelFacingToolCall || typeof modelFacingToolCall !== 'object' || Array.isArray(modelFacingToolCall)) {
    return '';
  }
  try {
    return JSON.stringify(modelFacingToolCall, null, 2);
  } catch {
    return '';
  }
}

function resolveUserText(message) {
  const fullUserMessageContent = normalizeText(message?.fullUserMessage?.content);
  if (fullUserMessageContent) {
    return fullUserMessageContent;
  }
  return normalizeText(message?.text);
}

function resolveToolMessageText(message) {
  if (message?.type === 'tool-call') {
    const modelFacingCall = stringifyModelFacingToolCall(message?.modelFacingToolCall);
    if (modelFacingCall) {
      return modelFacingCall;
    }
  }
  if (message?.type === 'tool-output') {
    const modelFacingOutput = normalizeText(message?.modelFacingToolOutput);
    if (modelFacingOutput) {
      return modelFacingOutput;
    }
  }
  return normalizeText(message?.text);
}

export function resolveMessageTokenUsageTag(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  if (message.sender === 'user') {
    const textTokens = estimateTextTokens(resolveUserText(message));
    const imageTokens = resolveUserScreenshotCount(message) * APPROX_IMAGE_TOKENS_PER_SCREENSHOT;
    const totalTokens = textTokens + imageTokens;
    if (totalTokens <= 0) {
      return null;
    }
    return `tokens~ txt:${textTokens} img(est):${imageTokens} total:${totalTokens}`;
  }

  if (message.type === 'tool-call' || message.type === 'tool-output') {
    const tokens = estimateTextTokens(resolveToolMessageText(message));
    if (tokens <= 0) {
      return null;
    }
    return `tokens~ ${tokens}`;
  }

  return null;
}

