import type { ToolSchema } from '../../types/toolSchemas';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasNamedParameters(value: unknown): value is {
  name: string;
  parameters: Record<string, unknown>;
} {
  return isObjectRecord(value)
    && typeof value.name === 'string'
    && isObjectRecord(value.parameters);
}

function normalizeFunctionToolSchema(toolSchema: Record<string, unknown>): ToolSchema | null {
  const functionBlock = hasNamedParameters(toolSchema.function)
    ? toolSchema.function
    : hasNamedParameters(toolSchema)
      ? {
        name: toolSchema.name,
        parameters: toolSchema.parameters,
      }
      : null;

  if (!functionBlock) {
    return null;
  }

  const normalized: ToolSchema = {
    ...toolSchema,
    type: 'function',
    function: {
      ...(isObjectRecord(toolSchema.function) ? toolSchema.function : {}),
      name: functionBlock.name,
      parameters: functionBlock.parameters,
    },
  };

  delete normalized.name;
  delete normalized.parameters;

  return normalized;
}

export function isSupportedToolSchema(value: unknown): value is ToolSchema {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (typeof value.type !== 'string') {
    return hasNamedParameters(value);
  }

  if (value.type === 'computer') {
    return true;
  }

  if (value.type !== 'function') {
    return false;
  }

  return hasNamedParameters(value) || hasNamedParameters(value.function);
}

export function normalizeToolSchema(value: unknown): ToolSchema | null {
  if (!isSupportedToolSchema(value) || !isObjectRecord(value)) {
    return null;
  }

  if (value.type === 'computer') {
    return { ...value };
  }

  return normalizeFunctionToolSchema(value);
}

export function isSupportedToolSchemaList(value: unknown): value is ToolSchema[] {
  return Array.isArray(value) && value.every((item) => isSupportedToolSchema(item));
}

export function normalizeToolSchemaList(value: unknown): ToolSchema[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => normalizeToolSchema(item))
    .filter((item): item is ToolSchema => item !== null);

  return normalized.length === value.length ? normalized : undefined;
}
