/**
 * Covers modular refactor completion boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const retiredProductPrefix = 'Wind' + 'ie';

function retiredProductName(suffix: string): string {
  return `${retiredProductPrefix}${suffix}`;
}

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('modular sdk refactor completion boundary', () => {
  test('electron main uses AgentClient wakeUp instead of a desktop wrapper', async () => {
    const ipcSource = await read('frontend/src/main/ipc.cjs');
    expect(ipcSource).toContain('new AgentClient({');
    expect(ipcSource).toContain('client.wakeUp({');
    expect(ipcSource).toContain('agent.conversation({');
    expect(ipcSource).toContain('localToolLifecycle');
    expect(ipcSource).toContain('agentWebSocketImpl');
    expect(ipcSource).not.toContain('windieAgentWebSocketImpl');
    expect(ipcSource).toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(ipcSource).not.toContain(`${retiredProductName('Agent')}.startDesktop`);
    expect(ipcSource).not.toMatch(/require\(['"].*agent_host\.cjs['"]\)/);
    expect(ipcSource).not.toMatch(/create\w*AgentHost/);
    expect(ipcSource).not.toContain(`create${retiredProductName('SdkMainRuntime')}`);
    expect(ipcSource).not.toContain('sendSdkRuntimeCommand');
    expect(ipcSource).not.toContain(`get${retiredProductName('SdkRuntime')}`);
    expect(ipcSource).not.toContain('createManagedBackendSession');
    expect(ipcSource).not.toContain('routeSdkToolEventToLocalRuntime');
    expect(ipcSource).not.toContain('executeLocalTool:');
    const wakeCall = ipcSource.match(/client\.wakeUp\(\{[\s\S]*?\n  \}\);/)?.[0] ?? '';
    expect(wakeCall).toContain('installAuth: buildDesktopInstallAuth()');
    expect(wakeCall).toContain('name: mainHostSkin.identity.sdkAgentName');
    expect(wakeCall).toContain('workspacePath: resolvedWorkspacePath');
    expect(wakeCall).toContain("builtins: process.env.NODE_ENV === 'test' ? [] : 'default'");
    expect(wakeCall).toContain('localToolLifecycle');
    expect(wakeCall).not.toContain('conversationRef:');
  });

  test('renderer live-turn runtime stays on sdk command dispatch', async () => {
    const source = await read('frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts');

    expect(source).toContain('invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_SEND');
    expect(source).toContain('invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_STOP');
    expect(source).not.toContain('createConversationRuntime');
    expect(source).not.toContain('DesktopSettingsRuntimeClient');
    expect(source).not.toContain('DesktopBackendCommandRuntimeClient');
    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source.includes('DesktopConversationStoreAdapter')).toBe(false);
  });

  test('public examples exercise sdk stream, retry, stop, local tool, and model controls', async () => {
    const cli = await read('examples/cli-agent/run.mjs');
    const customUi = await read('examples/custom-ui/index.html');
    const localTool = await read('examples/local-tool-extension/run.mjs');
    const repoAgent = await read('examples/repo-agent-extension/run.mjs');
    const localSdkLoader = await read('examples/_shared/local_sdk_loader.mjs');

    expect(cli).toContain('conversation.stream');
    expect(cli).toContain('conversation.retryTurn');
    expect(cli).toContain('conversation.stop');
    expect(cli).not.toContain('frontend/node_modules');
    expect(customUi).toContain('conversation.setModel');
    expect(customUi).toContain('conversation.retryTurn');
    expect(customUi).toContain('conversation.stop');
    expect(customUi).not.toContain('frontend/node_modules');
    expect(localTool).toContain('moduleTool');
    expect(localTool).toContain('agent.stop');
    expect(localTool).not.toContain('frontend/node_modules');
    expect(repoAgent).toContain('plugins: [{ path: exampleDir }]');
    expect(repoAgent).toContain('agent.stop');
    expect(repoAgent).not.toContain('frontend/node_modules');
    expect(localSdkLoader).toContain('packages/windie-sdk-js');
    expect(localSdkLoader).toContain('build:esm');
    expect(localSdkLoader).not.toContain('frontend/node_modules');
  });

  test('public examples stay on the high-level AgentClient surface', async () => {
    const exampleFiles = [
      'examples/cli-agent/run.mjs',
      'examples/custom-ui/index.html',
      'examples/local-tool-extension/run.mjs',
      'examples/repo-agent-extension/run.mjs',
    ];
    const internalRuntimeNeedles = [
      'SdkConversationRuntime',
      'createConversationRuntime',
      'ManagedBackendSession',
      'ToolExecutionCoordinator',
      'DesktopConversationStoreAdapter',
      'DesktopLiveTurnRuntimeClient',
      'DesktopBackendCommandRuntimeClient',
      'packages/windie-sdk-js/src/runtime',
      'packages/windie-sdk-js/src/transport',
      'packages/windie-sdk-js/src/tools/ToolExecutionCoordinator',
      'frontend/src/renderer',
      'frontend/src/main',
    ];
    const offenders: Record<string, string[]> = {};

    for (const relativePath of exampleFiles) {
      const source = await read(relativePath);
      expect(source).toContain('AgentClient');
      expect(source).not.toContain(retiredProductName('Client'));
      const matches = internalRuntimeNeedles.filter(needle => source.includes(needle));
      if (matches.length > 0) {
        offenders[relativePath] = matches;
      }
    }

    expect(offenders).toEqual({});
  });

  test('public SDK README describes local runtime examples without sidecar-facing prose', async () => {
    const readme = await read('packages/windie-sdk-js/README.md');

    expect(readme).toContain('local-runtime execution');
    expect(readme).toContain('local-runtime module-tool registration');
    expect(readme).toContain('local-runtime plugin package registration');
    expect(readme).not.toContain('local sidecar execution');
    expect(readme).not.toContain('sidecar module-tool registration');
    expect(readme).not.toContain('sidecar plugin package registration');
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
      'docs/frontend/renderer/dashboard/dashboard_change_workflow.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md',
      'docs/frontend/renderer/dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md',
      'docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md',
      'docs/frontend/renderer/feature_module_matrix.md',
      'docs/frontend/renderer/renderer_runtime.md',
      'docs/frontend/renderer/transcript/README.md',
      'docs/frontend/renderer/transcript/contracts/README.md',
      'docs/frontend/renderer/transcript/contracts/transcript_entry_type_contract_reference.md',
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
        'backend callback fanout',
        'broadcasts `local-user-message`',
        '`local-user-message` for cross-window/replay parity',
        'main synthetic `local-user-message`',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
  });
});
