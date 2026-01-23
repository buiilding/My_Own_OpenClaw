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
  
  // Bundle state (minimal - only during bundle execution)
  const isBundling = useRef(false);
  const toolBundle = useRef<Array<{ toolName: string; args: any; correlationId: string }>>([]);
  const bundleCorrelationId = useRef<string | null>(null);
  const hiddenToolCalls = useRef(new Set<string>());
  
  // Tool execution service instance
  const toolServiceRef = useRef<ToolExecutionService | null>(null);

  // Initialize tool service with callbacks
  useEffect(() => {
    const toolService = new ToolExecutionService({
      onToolResult: (result: ToolExecutionResult) => {
        // Skip display for hidden tool calls
        if (hiddenToolCalls.current.has(result.correlationId)) {
          return;
        }

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
        case 'bundle_start':
          console.log('[useToolRunner] Bundle start received - entering bundle mode');
          isBundling.current = true;
          toolBundle.current = [];
          bundleCorrelationId.current = data.payload?.correlation_id || `bundle-${crypto.randomUUID()}`;
          break;

        case 'bundle_end':
          console.log('[useToolRunner] Bundle end received - executing bundle with', toolBundle.current.length, 'tools');
          isBundling.current = false;
          const bundleToExecute = [...toolBundle.current]; // Copy array before clearing
          const correlationId = bundleCorrelationId.current;
          toolBundle.current = [];
          bundleCorrelationId.current = null;
          
          if (toolServiceRef.current && correlationId) {
            toolServiceRef.current.executeToolBundle(bundleToExecute, correlationId).catch(err => {
              console.error('[useToolRunner] Failed to execute bundle:', err);
            });
          }
          break;

        case 'tool-call':
          // Execute tool on frontend when tool-call is received
          if (data.payload && data.payload.tool_name && data.payload.parameters) {
            const correlationId = data.payload.correlation_id || data.payload.request_id || data.id || crypto.randomUUID();
            
            if (isBundling.current) {
              // Add to bundle
              console.log('[useToolRunner] Adding tool to bundle:', data.payload.tool_name);
              toolBundle.current.push({
                toolName: data.payload.tool_name,
                args: data.payload.parameters,
                correlationId: correlationId
              });
            } else {
              // Execute immediately
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

        case 'request-screenshot':
          // Handle hidden screenshot request from backend
          const requestId = data.payload?.request_id || data.payload?.correlation_id;
          if (requestId) {
            console.log('[useToolRunner] Received hidden screenshot request:', requestId);
            
            // Mark as hidden
            hiddenToolCalls.current.add(requestId);
            
            // Execute screenshot tool
            IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
              toolName: 'screenshot',
              args: { 
                explanation: 'Background screenshot for coordinate calculation', 
                expectation: 'Current screen state' 
              },
              skipAutoCapture: false
            }).then(result => {
              // Send result to backend
              IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
                type: 'tool-result',
                payload: {
                  request_id: requestId,
                  success: result.success,
                  data: result.data,
                  error: result.error,
                }
              });
              hiddenToolCalls.current.delete(requestId);
            }).catch(err => {
              console.error('[useToolRunner] Failed to execute hidden screenshot:', err);
              IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
                type: 'tool-result',
                payload: {
                  request_id: requestId,
                  success: false,
                  error: err.message,
                }
              });
              hiddenToolCalls.current.delete(requestId);
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
