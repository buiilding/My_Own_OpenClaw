import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('modular sdk refactor completion boundary', () => {
  test('main runtime does not expose raw backend envelope sends', async () => {
    const source = await read('frontend/src/main/windie_sdk_runtime.cjs');

    expect(source).toContain("packages/windie-sdk-js/src/transport/ManagedBackendSession.cjs");
    expect(source).not.toContain('sendBackendMessage,');
    expect(source).not.toContain('sendEnvelope,');
    expect(source).not.toContain('connectWaiters');
    expect(source).not.toContain('idleDisconnectTimer');
    expect(source).not.toContain('reconnectTimer');
    expect(source).not.toContain('shouldMaintainConnection');
    expect(source).toContain('sendCompactHistory');
    expect(source).toContain('rehydrateConversation');
    expect(source).not.toContain('sendRehydrate:');
    expect(source).toContain('sendToolBundleResult');
    expect(source).toContain('sendToolResult');
  });

  test('main tool router delegates local tool routing to the sdk package', async () => {
    const source = await read('frontend/src/main/ipc/ipc_sdk_tool_router.cjs');

    expect(source).toContain('packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.cjs');
    expect(source).not.toContain('async function routeToolCallToLocalRuntime');
    expect(source).not.toContain('async function routeToolBundleToLocalRuntime');
  });

  test('renderer conversation runtime delegates backend and projection work to app runtimes', async () => {
    const source = await read('frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts');

    expect(source).toContain('DesktopBackendCommandRuntimeClient');
    expect(source).toContain('DesktopSettingsRuntimeClient');
    expect(source).toContain('DesktopTranscriptProjectionRuntimeClient');
    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source.includes('ElectronSidecarConversationStore')).toBe(false);
  });

  test('public examples exercise sdk stream, retry, stop, local tool, and model controls', async () => {
    const cli = await read('examples/cli-agent/run.mjs');
    const customUi = await read('examples/custom-ui/index.html');
    const localTool = await read('examples/local-tool-extension/run.mjs');
    const repoAgent = await read('examples/repo-agent-extension/run.mjs');

    expect(cli).toContain('conversation.stream');
    expect(cli).toContain('conversation.retryTurn');
    expect(cli).toContain('conversation.stop');
    expect(customUi).toContain('conversation.setModel');
    expect(customUi).toContain('conversation.retryTurn');
    expect(customUi).toContain('conversation.stop');
    expect(localTool).toContain('moduleTool');
    expect(localTool).toContain('agent.stop');
    expect(repoAgent).toContain('plugins: [{ path: exampleDir }]');
    expect(repoAgent).toContain('agent.stop');
  });

  test('current frontend inventory docs do not route work to deleted renderer runtimes', async () => {
    const currentInventoryDocs = [
      'docs/frontend/inventory/frontend_runtime_surface_matrix_reference.md',
      'docs/frontend/inventory/frontend_capability_to_file_matrix_reference.md',
      'docs/frontend/inventory/frontend_functionality_capability_catalog_reference.md',
      'docs/frontend/renderer/chat/README.md',
      'docs/frontend/contracts/events/README.md',
      'docs/frontend/contracts/events/tool_runtime/README.md',
      'docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/frontend/main/ipc_event_replay_and_transcript_session_sync_reference.md',
      'docs/frontend/main/query_send_and_stream_relay_change_workflow.md',
      'docs/frontend/contracts/memory_ipc_and_rpc_mapping_reference.md',
      'docs/frontend/contracts/events/schema/README.md',
      'docs/frontend/contracts/events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md',
      'docs/frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md',
      'docs/frontend/contracts/backend_event_consumer_matrix_reference.md',
      'docs/frontend/renderer/chat/chat_store_state_and_new_session_rotation_reference.md',
      'docs/frontend/renderer/chat/payloads/transcript_message_payload_role_type_and_rehydrate_shape_reference.md',
      'docs/frontend/renderer/dashboard/dashboard_change_workflow.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md',
      'docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md',
      'docs/frontend/renderer/feature_module_matrix.md',
      'docs/frontend/renderer/renderer_runtime.md',
      'docs/frontend/renderer/transcript/README.md',
      'docs/frontend/renderer/transcript/queue/README.md',
      'docs/frontend/renderer/transcript/queue/pending_transcript_queue_fifo_and_requeue_contract_reference.md',
      'docs/frontend/renderer/transcript/queue/pending_transcript_messages_orchestrator_flush_order_and_retry_contract_reference.md',
      'docs/frontend/renderer/transcript/contracts/README.md',
      'docs/frontend/renderer/transcript/contracts/transcript_entry_and_pending_message_type_contract_reference.md',
      'docs/frontend/renderer/transcript/contracts/transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md',
      'docs/frontend/sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md',
      'docs/frontend/inventory/protocols/state/frontend_protocol_session_and_conversation_state_propagation_reference.md',
      'docs/frontend/inventory/protocols/state/README.md',
      'docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md',
      'docs/architecture/storage_persistence_change_workflow.md',
      'docs/reference/code_change_surface_index.md',
      'docs/frontend/renderer/infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md',
      'docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md',
      'docs/frontend/runtime/tool_execution_and_streaming.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/frontend/sidecar_tool_change_workflow.md',
      'docs/frontend/renderer/README.md',
      'docs/frontend/renderer/renderer_state_change_workflow.md',
      'docs/frontend/renderer/infrastructure/tool_computer_use_catalog_surface_mode_and_capture_policy_reference.md',
      'docs/frontend/README.md',
      'docs/frontend/renderer/chat/payloads/README.md',
      'docs/frontend/renderer/infrastructure/README.md',
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md',
      'docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md',
      'docs/concepts/agent_loop.md',
      'docs/concepts/runtime_model.md',
      'docs/concepts/prompt_and_tool_context.md',
      'docs/getting-started/docs_hub.md',
      'docs/desktop/artifact_change_workflow.md',
      'docs/browser/browser_troubleshooting.md',
      'docs/browser/browser_change_workflow.md',
      'docs/backend/agent/tool_turn_change_workflow.md',
      'docs/backend/tools/execution/tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md',
      'docs/debug/error_failure_change_workflow.md',
      'docs/debug/observability_change_workflow.md',
      'docs/debug/runtime_traces.md',
      'docs/debug/logging.md',
      'docs/memory/session_conversation_identity_change_workflow.md',
      'docs/memory/memory_change_workflow.md',
      'docs/memory/memory_troubleshooting.md',
      'docs/channels/sidecar_and_tool_channels.md',
      'docs/nodes/README.md',
      'docs/operations/performance.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/development/testing.md',
      'docs/development/validation_matrix.md',
      'docs/sdk/windie_client_runtime.md',
      'docs/backend/simulation/simulation_backend_and_mock_llm_runtime_reference.md',
      'docs/backend/inventory/backend_cross_layer_contract_touchpoints_reference.md',
      'docs/README.md',
      'docs/tools/tool_execution_lifecycle.md',
      'docs/tools/README.md',
      'docs/tools/tool_troubleshooting.md',
      'docs/tools/filesystem_shell.md',
      'docs/tools/tool_schema_policy_change_workflow.md',
      'docs/tools/tool_catalog_matrix.md',
      'docs/tools/tool_contracts.md',
      'frontend/src/renderer/folder_structure.md',
    ];

    const offenders: Record<string, string[]> = {};
    for (const relativePath of currentInventoryDocs) {
      const source = await read(relativePath);
      const staleMentions = [
        'frontend/src/renderer/features/chat/hooks/useToolRunner.ts',
        'frontend/src/renderer/infrastructure/services/ToolExecutionService.ts',
        'frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts',
        'frontend/src/renderer/infrastructure/transcript/conversationReplayState.ts',
        'renderer/useToolRunner.ts',
        'Tool runner service',
        'Transcript writer queues',
        'TranscriptWriter',
        'conversationReplayState.ts',
        'backward compatibility',
        'compatibility path',
        'Frontend Tool Execution Service',
        'Renderer invokes tool',
        'renderer dispatch',
        'renderer tool-runner',
        'renderer-tool-runner',
        'tool-runner-result',
        'Did renderer send `tool-result`',
        'Retired Renderer Tool Execution Runtime',
        'renderer orchestration',
        'frontend tool execution',
        'renderer result relay',
        'tool_execution_service_and_hook_runtime',
        'Tool Execution Service and Hook Runtime',
        'Frontend Tool Execution Service',
        'tool_execution_backend_envelope',
        'Tool Execution Backend Envelope Builder',
        'Retired Renderer Tool Result Envelope',
        'Renderer tool execution:',
        'useToolRunner',
        'ToolExecutionService',
        'renderer tool execution',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
  });
});
