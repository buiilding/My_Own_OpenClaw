export async function waitForCaptureDelay(waitSeconds: number): Promise<void> {
  const waitMilliseconds = Math.max(0, waitSeconds) * 1000;
  if (waitMilliseconds <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
}
