/**
 * useToolRunner Hook.
 * Connects UI to ToolExecutionService.
 * Handles tool execution events and updates chat store.
 */

import { useCallback, useEffect, useRef } from 'react';
import { IpcBridge, ON_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { ToolExecutionService, type ToolExecutionResult, type BundleExecutionResult } from '../../../infrastructure/services/ToolExecutionService';
import { useChatStore, type ChatMessage } from '../stores/chatStore';

/**
 * Custom hook for managing tool execution.
 * Connects UI to ToolExecutionService and handles tool-related events.
 */
export function useToolRunner() {
  const { addMessage } = useChatStore();
  
  // Tool execution service instance
  const toolServiceRef = useRef<ToolExecutionService | null>(null);

  // Initialize tool service with callbacks
  useEffect(() => {
    const toolService = new ToolExecutionService({
      onToolResult: (result: ToolExecutionResult) => {
        // Create tool output message
        const toolOutputMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: result.formattedMessage,
          sender: 'assistant',
          type: 'tool-output',
          screenshot: result.screenshot || null,
          toolMetadata: result.result.data && typeof result.result.data === 'object' 
            ? result.result.data.metadata || null 
            : null,
          toolName: result.toolName,
          executionTime: result.executionTime,
          success: result.result.success,
          correlationId: result.correlationId,
        };

        addMessage(toolOutputMessage);
      },
      onBundleResult: (result: BundleExecutionResult) => {
        // Create bundled tool output message
        const bundledMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: result.formattedMessage,
          sender: 'assistant',
          type: 'tool-output',
          screenshot: result.screenshot || null,
          toolMetadata: {
            bundled: true,
            tool_count: result.results.length,
            tools: result.results.map(r => ({
              tool_name: r.tool_name,
              success: r.success,
              error: r.error
            }))
          },
          toolName: `bundled_tools (${result.results.length} tools)`,
          executionTime: result.totalTime,
          success: result.results.every(r => r.success),
          correlationId: result.correlationId,
        };

        addMessage(bundledMessage);
      },
      sendToBackend: (payload: any) => {
        IpcBridge.send(SEND_CHANNELS.TO_BACKEND, payload);
      },
    });

    toolServiceRef.current = toolService;

    return () => {
      toolServiceRef.current = null;
    };
  }, [addMessage]);

  // Handle tool execution events
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: any) => {
      switch (data.type) {
        case 'tool-bundle':
          // ATOMIC BUNDLE: Execute bundle directly (stateless)
          if (data.payload && data.payload.tools && Array.isArray(data.payload.tools)) {
            const bundleId = data.payload.bundle_id || `bundle-${crypto.randomUUID()}`;
            const tools = data.payload.tools.map((tool: any) => ({
              toolName: tool.name,
              args: tool.args,
            }));
            
            console.log('[useToolRunner] Received atomic bundle:', bundleId, tools.length, 'tools');
            
            if (toolServiceRef.current) {
              toolServiceRef.current.executeToolBundle(tools, bundleId).catch(err => {
                console.error('[useToolRunner] Failed to execute bundle:', err);
              });
            }
          }
          break;

        case 'tool-call':
          // Execute tool immediately (no bundle mode)
          if (data.payload && data.payload.tool_name && data.payload.parameters) {
            const correlationId = data.payload.correlation_id || data.payload.request_id || data.id || crypto.randomUUID();
            
            if (toolServiceRef.current) {
              toolServiceRef.current.executeTool(
                data.payload.tool_name,
                data.payload.parameters,
                {
                  correlationId,
                  skipAutoCapture: false
                }
              ).catch(err => {
                console.error('[useToolRunner] Failed to execute tool:', err);
              });
            }
          }
          break;

        case 'memory-store':
          // Handle memory storage request from backend
          if (data.payload) {
            const { user_query, assistant_response, memory_type, user_id, session_id } = data.payload;
            console.log('[useToolRunner] Received memory store request:', memory_type);
            
            // Store memory via IPC to Python sidecar
            IpcBridge.invoke(INVOKE_CHANNELS.STORE_MEMORY, {
              userQuery: user_query,
              assistantResponse: assistant_response,
              memoryType: memory_type,
              userId: user_id || 'default_user',
              sessionId: session_id || null
            }).catch(err => {
              console.error('[useToolRunner] Failed to store memory:', err);
            });
          }
          break;

        case 'wakeword-greeting':
          // Handle greeting
          const greetingText = data.payload?.text || "Hello! I'm listening.";
          const greetingMessage: ChatMessage = {
            id: crypto.randomUUID(),
            text: greetingText,
            sender: 'assistant',
            timestamp: new Date().toISOString()
          };
          addMessage(greetingMessage);
          break;

        default:
          break;
      }
    });

    return removeListener;
  }, [addMessage]);

  return {
    toolService: toolServiceRef.current,
  };
}
