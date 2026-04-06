import type { ToolSchema } from '../../types/backendEvents';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasNamedParameters(value: unknown): boolean {
  return isObjectRecord(value)
    && typeof value.name === 'string'
    && isObjectRecord(value.parameters);
}

export function isSupportedToolSchema(value: unknown): value is ToolSchema {
  if (!isObjectRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'computer') {
    return true;
  }

  if (value.type !== 'function') {
    return false;
  }

  return hasNamedParameters(value) || hasNamedParameters(value.function);
}

export function isSupportedToolSchemaList(value: unknown): value is ToolSchema[] {
  return Array.isArray(value) && value.every((item) => isSupportedToolSchema(item));
}
