export type ToolSchema = {
  type: string;
  name?: string;
  description?: string;
  strict?: boolean;
  parameters?: Record<string, unknown>;
  function?: {
    name?: string;
    parameters?: Record<string, unknown>;
  } & Record<string, unknown>;
} & Record<string, unknown>;
