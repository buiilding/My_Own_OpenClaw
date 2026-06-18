/**
 * Resolves SDK runtime debug environment flags.
 */

const SDK_DEBUG_ENV = Object.freeze({
  compactionStdout: 'AGENT_DEBUG_COMPACTION_STDOUT',
});

export function isCompactionStdoutEnabled(
  env: Record<string, string | undefined> | undefined = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env,
): boolean {
  return env?.[SDK_DEBUG_ENV.compactionStdout] === '1';
}
