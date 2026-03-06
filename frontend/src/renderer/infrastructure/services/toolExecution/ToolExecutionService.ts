import { executeToolBundleRuntime } from './bundleExecution';
import { executeSingleTool } from './singleToolExecution';
import type {
  BundleExecutionResult,
  ToolExecutionCallbacks,
  ToolExecutionOptions,
  ToolExecutionResult,
} from './ToolExecutionTypes';

export { ToolExecutionResult, BundleExecutionResult };

export class ToolExecutionService {
  private callbacks: ToolExecutionCallbacks;

  constructor(callbacks: ToolExecutionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: ToolExecutionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async executeTool(
    toolName: string,
    args: any,
    options: ToolExecutionOptions,
  ): Promise<ToolExecutionResult> {
    return executeSingleTool(this.callbacks, toolName, args, options);
  }

  async executeToolBundle(
    bundle: Array<{ toolName: string; args: any }>,
    bundleId: string,
  ): Promise<BundleExecutionResult> {
    return executeToolBundleRuntime(this.callbacks, bundle, bundleId);
  }
}
