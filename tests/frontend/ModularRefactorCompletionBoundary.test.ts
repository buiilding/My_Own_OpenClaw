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

  test('public local-runtime examples avoid sidecar-facing descriptions', async () => {
    const localToolReadme = await read('examples/local-tool-extension/README.md');
    const localToolRun = await read('examples/local-tool-extension/run.mjs');
    const repoAgentReadme = await read('examples/repo-agent-extension/README.md');
    const repoAgentManifest = await read('examples/repo-agent-extension/plugin.json');
    const publicExampleText = [localToolReadme, localToolRun, repoAgentReadme, repoAgentManifest].join('\n');

    expect(publicExampleText).toContain('local-runtime daemon discovery');
    expect(publicExampleText).toContain('local-runtime plugin example');
    expect(publicExampleText).toContain('local-runtime tool implementation');
    expect(publicExampleText).not.toContain('sidecar daemon discovery');
    expect(publicExampleText).not.toContain('through the sidecar');
    expect(publicExampleText).not.toContain('Windie sidecar plugin');
    expect(publicExampleText).not.toContain('sidecar plugin manifest');
    expect(publicExampleText).not.toContain('local sidecar tool implementation');
  });

  test('sdk docs describe local runtime contracts without sidecar-facing public wording', async () => {
    const sdkDocs = await Promise.all([
      read('docs/sdk/README.md'),
      read('docs/sdk/windie_client_runtime.md'),
      read('docs/sdk/conversation_runtime.md'),
      read('docs/sdk/hosted_backend_clients.md'),
      read('docs/sdk/tool_authoring.md'),
    ]);
    const sdkDocText = sdkDocs.join('\n');
    const architectureText = await read('docs/development/agent_architecture_reference.md');

    expect(sdkDocText).toContain('local-runtime module-tool SDK example');
    expect(sdkDocText).toContain('local-runtime plugin SDK example');
    expect(sdkDocText).toContain('local runtime tool manifest');
    expect(sdkDocText).toContain('local runtime tool-result data');
    expect(sdkDocText).toContain('local-runtime-backed default conversation store');
    expect(sdkDocText).not.toContain('sidecar runtime client');
    expect(sdkDocText).not.toContain('sidecar daemon');
    expect(sdkDocText).not.toContain('sidecar tool manifest');
    expect(sdkDocText).not.toContain('sidecar execution');
    expect(sdkDocText).not.toContain('sidecar-backed conversation');
    expect(sdkDocText).not.toContain('sidecar-backed default conversation store');
    expect(sdkDocText).not.toContain('Electron sidecar-backed stores');
    expect(sdkDocText).not.toContain('sidecar-backed SDK store');
    expect(sdkDocText).not.toContain('minimal sidecar module-tool');
    expect(sdkDocText).not.toContain('runnable sidecar plugin');
    expect(sdkDocText).not.toContain('sidecar local tool implementation');
    expect(sdkDocText).not.toContain('Use sidecar tools for local machine control');
    expect(architectureText).not.toContain('sidecar-backed storage');
    expect(architectureText).not.toContain('sidecar-backed SDK store');
    expect(architectureText).not.toContain('SDK desktop agent');
    expect(architectureText).not.toContain('SDK desktop-agent');
  });

  test('landing docs track desktop runtime and local runtime public copy', async () => {
    const landingDocs = await Promise.all([
      read('docs/frontend/landing/landing_page_runtime_and_content_reference.md'),
      read('docs/frontend/landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md'),
      read('docs/frontend/landing/sections/why_privacy_cta_footer_and_shared_intro_component_contract_reference.md'),
    ]);
    const landingDocText = landingDocs.join('\n');

    expect(landingDocText).toContain('Desktop runtime for personal AI agents');
    expect(landingDocText).toContain('Desktop-Native');
    expect(landingDocText).toContain('desktop session as runtime');
    expect(landingDocText).toContain('local runtime tool execution');
    expect(landingDocText).toContain('documentation link (`https://github.com/buiilding/WindieOS/blob/main/docs/README.md`)');
    expect(landingDocText).not.toContain('Desktop assistant');
    expect(landingDocText).not.toContain('OS-level control');
    expect(landingDocText).not.toContain('local sidecar tool execution');
    expect(landingDocText).not.toContain('sidecar execution, memory');
    expect(landingDocText).not.toContain('documentation button placeholder');
    expect(landingDocText).not.toContain('mixed real/placeholder links');
  });

  test('first-read docs describe SDK local runtime as the public local contract', async () => {
    const docs = await Promise.all([
      read('README.md'),
      read('docs/architecture/architecture.md'),
      read('docs/backend/services/embedding_and_semantic_memory_runtime_reference.md'),
      read('docs/concepts/sessions_and_conversations.md'),
      read('docs/reference/api_reference.md'),
      read('docs/web/web_client_integration.md'),
      read('docs/web/web_surface_matrix.md'),
      read('docs/web/landing_page.md'),
      read('docs/getting-started/installation.md'),
      read('docs/help/doctor_checklist.md'),
      read('docs/install/uninstall_reinstall_reset.md'),
      read('docs/frontend/contracts/events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/architecture/python_sidecar.md'),
      read('docs/operations/deployment.md'),
      read('docs/security/credentials_and_tokens_matrix.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('local runtime-backed tool');
    expect(docText).toContain('local-runtime executed');
    expect(docText).not.toContain('hosted-backend plus local sidecar');
    expect(docText).not.toContain('local sidecar daemon');
    expect(docText).not.toContain('The local sidecar owns');
    expect(docText).not.toContain('call the local sidecar');
    expect(docText).not.toContain('local sidecar action');
    expect(docText).not.toContain('local sidecar tools');
    expect(docText).not.toContain('local sidecar state');
    expect(docText).not.toContain('hosted backend with a local sidecar');
    expect(docText).not.toContain('local sidecar-backed tool');
    expect(docText).not.toContain('local sidecar execution');
    expect(docText).not.toContain('sidecar-facing');
    expect(docText).not.toContain('Electron app + local Python sidecar + local backend');
    expect(docText).not.toContain('bundling the sidecar does not imply bundling a local backend');
    expect(docText).not.toContain('client-local sidecar imports');
  });

  test('runtime trace and transcript docs describe stores through local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/debug/runtime_traces.md'),
      read('docs/architecture/frontend_architecture.md'),
      read('docs/architecture/storage_persistence_change_workflow.md'),
      read('docs/frontend/contracts/memory_ipc_and_rpc_mapping_reference.md'),
      read('docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md'),
      read('docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md'),
      read('docs/frontend/renderer/transcript_session_and_rehydrate_reference.md'),
      read('docs/frontend/sidecar/local_backend_jsonrpc_reference.md'),
      read('docs/operations/release_packaging_change_workflow.md'),
      read('docs/platforms/platform_change_workflow.md'),
      read('docs/platforms/packaging_runtime_matrix.md'),
      read('docs/reference/code_change_surface_index.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('local-runtime-backed `LocalRuntimeConversationStore`');
    expect(docText).toContain('local-runtime-backed chat-event store');
    expect(docText).toContain('local-runtime-backed store adapters');
    expect(docText).toContain('local-runtime-backed local tool');
    expect(docText).toContain('returns sanitized search metadata');
    expect(docText).not.toContain('sidecar-backed');
  });

  test('renderer runtime docs describe local tool execution through SDK local runtime', async () => {
    const docs = await Promise.all([
      read('docs/frontend/README.md'),
      read('docs/frontend/runtime/tool_execution_and_streaming.md'),
      read('docs/frontend/renderer/chat_stream_and_tool_execution_reference.md'),
      read('docs/frontend/renderer/transcript_session_and_rehydrate_reference.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('local runtime daemon startup/reuse');
    expect(docText).not.toContain('routes tool events to the sidecar daemon');
    expect(docText).not.toContain('through Electron main and the sidecar daemon');
    expect(docText).not.toContain('before sidecar execution');
    expect(docText).not.toContain('sidecar daemon startup/reuse');
  });

  test('frontend architecture docs route tool prep through local execution wording', async () => {
    const docs = await Promise.all([
      read('docs/architecture/frontend_architecture.md'),
      read('docs/architecture/communication_flow.md'),
      read('docs/architecture/tool_system.md'),
      read('docs/architecture/failure_domain_map.md'),
      read('docs/architecture/data_flow_and_state_ownership.md'),
      read('docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md'),
      read('docs/frontend/inventory/frontend_full_functionality_inventory_reference.md'),
      read('docs/frontend/main/window_and_overlay_lifecycle.md'),
      read('docs/frontend/main/main_process_change_workflow.md'),
      read('docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md'),
      read('docs/frontend/main/local_backend/windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md'),
      read('docs/frontend/sidecar/local_backend_process_lifecycle_reference.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/renderer/infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md'),
      read('docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK/main local execution');
    expect(docText).toContain('before local execution');
    expect(docText).not.toContain('sidecar daemon/local executor');
    expect(docText).not.toContain('sidecar execution');
    expect(docText).not.toContain('before sidecar execution');
  });

  test('local runtime conversation store keeps diagnostic collection naming generic', async () => {
    const source = await read('packages/windie-sdk-js/src/stores/LocalRuntimeConversationStore.ts');

    expect(source).toContain('const localRuntimeEvents');
    expect(source).not.toContain('sidecarEvents');
  });

  test('tool and security docs describe local tools through local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/architecture/backend_architecture.md'),
      read('docs/channels/README.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/development/mcp.md'),
      read('docs/development/extensions.md'),
      read('docs/development/tool_development.md'),
      read('docs/frontend/sidecar/sidecar_daemon_runtime_reference.md'),
      read('docs/gateway/gateway_troubleshooting.md'),
      read('docs/getting-started/docs_directory.md'),
      read('docs/plugins/README.md'),
      read('docs/plugins/current_vs_future_plugin_boundary.md'),
      read('docs/README.md'),
      read('docs/reference/code_change_surface_index.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_contracts.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/filesystem_shell_change_workflow.md'),
      read('docs/security/security_boundary_matrix.md'),
    ]);
    const docText = docs.join('\n');
    const toolRoutingDocText = (await Promise.all([
      read('docs/tools/README.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_contracts.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/filesystem_shell_change_workflow.md'),
    ])).join('\n');

    expect(docText).toContain('client-local runtime tool');
    expect(docText).toContain('local-runtime executable tool');
    expect(docText).toContain('local-runtime plugins under `plugins/*/plugin.json`');
    expect(docText).toContain('local-runtime plugin tools');
    expect(docText).toContain('execute through the SDK local runtime');
    expect(docText).toContain('SDK local-runtime tools');
    expect(docText).toContain('Agent SDK/local-runtime manifest');
    expect(docText).toContain('Local Runtime Plugin Tool Registration');
    expect(docText).toContain('SDK local runtime/local executor');
    expect(docText).toContain('local execution contracts');
    expect(docText).not.toContain('SDK desktop agent');
    expect(docText).not.toContain('SDK desktop-agent');
    expect(docText).not.toContain('client-local sidecar tool');
    expect(docText).not.toContain('sidecar plugins under `plugins/*/plugin.json`');
    expect(docText).not.toContain('local sidecar tools');
    expect(docText).not.toContain('local sidecar execution');
    expect(toolRoutingDocText).not.toContain('sidecar execution');
    expect(docText).not.toContain('Windie Agent owns client-local');
    expect(docText).not.toContain('Sidecar Plugin Tool Registration');
    expect(docText).not.toContain('sidecar plugin');
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
        'generic desktop-' + 'agent Browser Use',
        'Desktop ' + 'Agent Browser Use Session',
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
