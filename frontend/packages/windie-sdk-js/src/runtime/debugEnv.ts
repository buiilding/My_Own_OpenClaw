/**
 * Resolves SDK runtime debug environment flags.
 */

const SDK_DEBUG_ENV = Object.freeze({
  compactionStdout: 'AGENT_DEBUG_COMPACTION_STDOUT',
  strictRuntimeInput: 'WINDIE_STRICT_RUNTIME_INPUT',
});

export function isCompactionStdoutEnabled(
  env: Record<string, string | undefined> | undefined = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env,
): boolean {
  return env?.[SDK_DEBUG_ENV.compactionStdout] === '1';
}

export function isStrictRuntimeInputEnabled(
  env: Record<string, string | undefined> | undefined = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env,
): boolean {
  const nodeEnv = String(env?.NODE_ENV || '').trim().toLowerCase();
  return (
    env?.[SDK_DEBUG_ENV.strictRuntimeInput] === '1'
    || nodeEnv === 'test'
    || nodeEnv === 'development'
  );
}
