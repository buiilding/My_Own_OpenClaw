export function hasMessageScreenshot(message) {
  return Boolean(message?.screenshotUrl || message?.screenshotRef || message?.screenshot);
}

export function isUserMessageWithScreenshot(message) {
  return message?.sender === 'user' && hasMessageScreenshot(message);
}
