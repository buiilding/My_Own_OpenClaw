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

async function listMarkdownFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(relativePath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [relativePath] : [];
  }));
  return files.flat();
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
    expect(wakeCall).toContain('name: ipcHostCopy.identity.sdkAgentName');
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
    expect(readme).toContain('waking agents from external clients');
    expect(readme).not.toContain('waking Windie agents');
    expect(readme).not.toContain('local sidecar execution');
    expect(readme).not.toContain('sidecar module-tool registration');
    expect(readme).not.toContain('sidecar plugin package registration');
  });

  test('public local-runtime examples avoid sidecar-facing descriptions', async () => {
    const localToolReadme = await read('examples/local-tool-extension/README.md');
    const localToolRun = await read('examples/local-tool-extension/run.mjs');
    const repoAgentReadme = await read('examples/repo-agent-extension/README.md');
    const repoAgentManifest = await read('examples/repo-agent-extension/plugin.json');
    const simpleChatReadme = await read('examples/simple-chat-cli/README.md');
    const publicExampleText = [
      localToolReadme,
      localToolRun,
      repoAgentReadme,
      repoAgentManifest,
      simpleChatReadme,
    ].join('\n');

    expect(publicExampleText).toContain('local-runtime daemon discovery');
    expect(publicExampleText).toContain('local-runtime plugin example');
    expect(publicExampleText).toContain('local-runtime tool implementation');
    expect(simpleChatReadme).toContain('requires an explicit backend endpoint');
    expect(simpleChatReadme).toContain('WINDIE_INSTALL_TOKEN');
    expect(simpleChatReadme).not.toContain('defaults to `WINDIE_BACKEND_URL`');
    expect(simpleChatReadme).not.toContain('WINDIE_API_KEY');
    expect(simpleChatReadme).not.toContain('registers a temporary install identity');
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
    expect(sdkDocText).not.toContain('Sidecar owns durable rows');
    expect(sdkDocText).not.toContain('sidecar-backed conversation');
    expect(sdkDocText).not.toContain('sidecar-backed default conversation store');
    expect(sdkDocText).not.toContain('Electron sidecar-backed stores');
    expect(sdkDocText).not.toContain('sidecar-backed SDK store');
    expect(sdkDocText).not.toContain('minimal sidecar module-tool');
    expect(sdkDocText).not.toContain('runnable sidecar plugin');
    expect(sdkDocText).not.toContain('sidecar local tool implementation');
    expect(sdkDocText).not.toContain('Use sidecar tools for local machine control');
    expect(sdkDocText).not.toContain('raw backend');
    expect(sdkDocText).not.toContain('raw-backend');
    expect(architectureText).not.toContain('sidecar-backed storage');
    expect(architectureText).not.toContain('sidecar-backed SDK store');
    expect(architectureText).not.toContain('SDK desktop agent');
    expect(architectureText).not.toContain(`SDK desktop-${'agent'}`);
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
      read('docs/concepts/runtime_model.md'),
      read('docs/operations/deployment.md'),
      read('docs/security/credentials_and_tokens_matrix.md'),
      read('docs/security/README.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('local-runtime hosted helper services');
    expect(docText).toContain('local runtime-backed tool');
    expect(docText).toContain('local-runtime executed');
    expect(docText).toContain('local-runtime browser execution, Python sidecar adapters');
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
    expect(docText).not.toContain('sidecar-owned hosted helper services');
    expect(docText).not.toContain('Electron app + local Python sidecar + local backend');
    expect(docText).not.toContain('bundling the sidecar does not imply bundling a local backend');
    expect(docText).not.toContain('falls back to local backend candidates');
    expect(docText).not.toContain('client-local sidecar imports');
    expect(docText).not.toContain('Backend schema, shared browser contract, sidecar runtime, Electron bridge');
    expect(docText).not.toContain('Sidecar owns local execution');
    expect(docText).not.toContain('routes local work through the sidecar');
    expect(docText).not.toContain('sidecar remote-client auth');
    expect(docText).not.toContain('sidecar auth headers');
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
      read('docs/memory/README.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/memory/session_conversation_identity_change_workflow.md'),
      read('docs/memory/transcript_and_replay.md'),
      read('docs/memory/transcript_replay_change_workflow.md'),
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
    expect(docText).toContain('canonical local-runtime events');
    expect(docText).toContain('local-runtime conversation_events rows');
    expect(docText).toContain('local-runtime event store path');
    expect(docText).toContain('returns sanitized search metadata');
    expect(docText).not.toContain('sidecar-backed');
    expect(docText).not.toContain('canonical sidecar events');
    expect(docText).not.toContain('canonical sidecar chat-event log');
    expect(docText).not.toContain('canonical sidecar `conversation_events`');
    expect(docText).not.toContain('sidecar event store path');
    expect(docText).not.toContain('sidecar transcript storage');
  });

  test('renderer runtime docs describe local tool execution through SDK local runtime', async () => {
    const docs = await Promise.all([
      read('docs/channels/README.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/channels/channel_routing_matrix.md'),
      read('docs/frontend/README.md'),
      read('docs/frontend/runtime/tool_execution_and_streaming.md'),
      read('docs/frontend/renderer/chat_stream_and_tool_execution_reference.md'),
      read('docs/frontend/renderer/transcript_session_and_rehydrate_reference.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('SDK/main local runtime');
    expect(docText).toContain('local runtime daemon startup/reuse');
    expect(docText).not.toContain('SDK desktop runtime');
    expect(docText).not.toContain('SDK agent runtime');
    expect(docText).not.toContain('routes tool events to the sidecar daemon');
    expect(docText).not.toContain('through Electron main and the sidecar daemon');
    expect(docText).not.toContain('before sidecar execution');
    expect(docText).not.toContain('sidecar daemon startup/reuse');
  });

  test('runtime routing docs use Agent SDK boundary wording', async () => {
    const runtimeBoundaryDocs = [
      'docs/architecture/frontend_architecture.md',
      'docs/concepts/streaming_and_events.md',
      'docs/debug/README.md',
      'docs/debug/symptom_playbooks.md',
      'docs/development/agent_architecture_reference.md',
      'docs/frontend/contracts/ipc_channel_and_handler_reference.md',
      'docs/frontend/inventory/frontend_functionality_capability_catalog_reference.md',
      'docs/frontend/main/electron_main_and_ipc.md',
      'docs/frontend/main/query_payload_and_relay_reference.md',
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/renderer_runtime.md',
      'docs/frontend/renderer/renderer_state_change_workflow.md',
      'docs/frontend/sidecar/browser_automation_stack.md',
      'docs/sdk/hosted_backend_clients.md',
      'docs/nodes/desktop_and_sidecar_node.md',
      'docs/nodes/runtime_node_matrix.md',
      'docs/reference/code_change_surface_index.md',
      'docs/reference/session_and_transcript_reference.md',
      'docs/reference/websocket_event_reference.md',
      'docs/tools/filesystem_shell_change_workflow.md',
      'docs/tools/tool_execution_lifecycle.md',
      'docs/tools/tool_schema_policy_change_workflow.md',
      'docs/tools/tool_troubleshooting.md',
      'frontend/src/renderer/folder_structure.md',
    ];
    const docText = (await Promise.all(runtimeBoundaryDocs.map((path) => read(path)))).join('\n');

    expect(docText).toContain('Agent SDK runtime');
    expect(docText).toContain('Agent SDK tool');
    expect(docText).not.toContain('SDK agent runtime');
    expect(docText).not.toContain('SDK agent-runtime');
    expect(docText).not.toContain('SDK agent runtime concern');
    expect(docText).not.toContain('SDK agent host');
    expect(docText).not.toContain('SDK agent startup');
    expect(docText).not.toContain('SDK agent connection');
    expect(docText).not.toContain('direct SDK agent');
    expect(docText).not.toContain('SDK agent ->');
    expect(docText).not.toContain('SDK agent/conversation runtime');
    expect(docText).not.toContain('SDK agent stream-event module');
    expect(docText).not.toContain('public SDK agent APIs');
    expect(docText).not.toContain('SDK main runtime');
    expect(docText).not.toContain('Frontend/sidecar owner');
    expect(docText).not.toContain('Frontend-owned payloads:');
    expect(docText).not.toContain('Sidecar-owned payloads:');
  });

  test('renderer settings docs use renderer-local presentation wording', async () => {
    const source = await read(
      'docs/frontend/renderer/settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md',
    );

    expect(source).toContain('renderer-local theme editor values');
    expect(source).not.toContain('frontend-local theme');
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
    expect(docText).toContain('local tool calls to local-runtime execution');
    expect(docText).toContain('before local execution');
    expect(docText).not.toContain('sidecar daemon/local executor');
    expect(docText).not.toContain('sidecar execution');
    expect(docText).not.toContain('before sidecar execution');
    expect(docText).not.toContain('local tool calls to the sidecar runtime');
  });

  test('local runtime conversation store keeps diagnostic collection naming generic', async () => {
    const source = await read('packages/windie-sdk-js/src/stores/LocalRuntimeConversationStore.ts');

    expect(source).toContain('const localRuntimeEvents');
    expect(source).not.toContain('sidecarEvents');
    expect(source).not.toContain("producerSource === 'sidecar'");
  });

  test('tool and security docs describe local tools through local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/architecture/backend_architecture.md'),
      read('docs/architecture/agent_visible_data_pipeline.md'),
      read('docs/architecture/storage_persistence_change_workflow.md'),
      read('docs/channels/README.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/concepts/agent_loop.md'),
      read('docs/concepts/prompt_and_tool_context.md'),
      read('docs/concepts/safety_boundaries.md'),
      read('docs/debug/runtime_traces.md'),
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/development/agent_architecture_reference.md'),
      read('docs/development/agent_routing_quick_cards.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
      read('docs/development/README.md'),
      read('docs/development/test_failure_triage.md'),
      read('docs/development/mcp.md'),
      read('docs/development/extensions.md'),
      read('docs/development/tool_development.md'),
      read('docs/frontend/ipc_change_workflow.md'),
      read('docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md'),
      read('docs/frontend/inventory/protocols/state/frontend_protocol_session_and_conversation_state_propagation_reference.md'),
      read('docs/frontend/main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/sidecar_tool_change_workflow.md'),
      read('docs/frontend/sidecar/sidecar_runtime_change_workflow.md'),
      read('docs/frontend/sidecar/tool_catalog_and_execution_model.md'),
      read('docs/frontend/sidecar/sidecar_daemon_runtime_reference.md'),
      read('docs/gateway/gateway_troubleshooting.md'),
      read('docs/gateway/websocket_connection_lifecycle.md'),
      read('docs/getting-started/docs_directory.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/help/diagnostics.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/plugins/README.md'),
      read('docs/plugins/current_vs_future_plugin_boundary.md'),
      read('docs/plugins/extension_surface_matrix.md'),
      read('docs/README.md'),
      read('docs/reference/code_change_surface_index.md'),
      read('docs/reference/openclaw_docs_structure_reference.md'),
      read('docs/reference/session_and_transcript_reference.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_troubleshooting.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_policy_profiles_and_capabilities.md'),
      read('docs/tools/tool_contracts.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/filesystem_shell_change_workflow.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/computer.md'),
      read('docs/sdk/conversation_runtime.md'),
      read('docs/security/README.md'),
      read('docs/security/security_boundary_matrix.md'),
      read('docs/security/security_change_playbook.md'),
      read('docs/security/permissions_and_local_authority_workflow.md'),
    ]);
    const docText = docs.join('\n');
    const toolRoutingDocText = (await Promise.all([
      read('docs/adr/005-frontend-tool-schema-source-of-truth.md'),
      read('docs/architecture/python_sidecar.md'),
      read('docs/architecture/agent_visible_data_pipeline.md'),
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/backend/llm/prompts/prompt_context_change_workflow.md'),
      read('docs/backend/tools/browser/browser_remote_schema_surface_reference.md'),
      read('docs/backend/tools/local_runtime_tool_bridge_and_policy.md'),
      read('docs/backend/tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md'),
      read('docs/channels/channel_routing_matrix.md'),
      read('docs/channels/sidecar_and_tool_channels.md'),
      read('docs/concepts/agent_loop.md'),
      read('docs/concepts/prompt_and_tool_context.md'),
      read('docs/concepts/safety_boundaries.md'),
      read('docs/cli/validation_commands.md'),
      read('docs/debug/runtime_traces.md'),
      read('docs/development/agent_architecture_reference.md'),
      read('docs/development/agent_routing_quick_cards.md'),
      read('docs/development/agent_runtime_ownership_and_change_routing.md'),
      read('docs/development/extensions.md'),
      read('docs/development/tool_development.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/sidecar_tool_change_workflow.md'),
      read('docs/frontend/sidecar/README.md'),
      read('docs/frontend/sidecar/sidecar_daemon_runtime_reference.md'),
      read('docs/frontend/sidecar/sidecar_runtime_change_workflow.md'),
      read('docs/frontend/sidecar/tool_catalog_and_execution_model.md'),
      read('docs/gateway/websocket_connection_lifecycle.md'),
      read('docs/getting-started/docs_directory.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/help/diagnostics.md'),
      read('docs/memory/memory_change_workflow.md'),
      read('docs/plugins/extension_surface_matrix.md'),
      read('docs/reference/openclaw_docs_structure_reference.md'),
      read('docs/reference/session_and_transcript_reference.md'),
      read('docs/security/README.md'),
      read('docs/security/security_boundary_matrix.md'),
      read('docs/security/security_change_playbook.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_troubleshooting.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_policy_profiles_and_capabilities.md'),
      read('docs/tools/tool_contracts.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/filesystem_shell_change_workflow.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/computer.md'),
      read('docs/sdk/conversation_runtime.md'),
    ])).join('\n');
    const localRuntimePayloadDocText = (await Promise.all([
      read('docs/architecture/agent_visible_data_pipeline.md'),
      read('docs/architecture/storage_persistence_change_workflow.md'),
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/frontend/ipc_change_workflow.md'),
      read('docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md'),
      read('docs/frontend/inventory/protocols/state/frontend_protocol_session_and_conversation_state_propagation_reference.md'),
      read('docs/frontend/main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md'),
      read('docs/security/permissions_and_local_authority_workflow.md'),
      read('docs/tools/tool_troubleshooting.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
    ])).join('\n');
    const browserToolOverviewText = (await Promise.all([
      read('docs/tools/README.md'),
      read('docs/tools/browser.md'),
    ])).join('\n');
    const browserRouteDocText = (await Promise.all([
      read('docs/README.md'),
      read('docs/browser/README.md'),
      read('docs/getting-started/docs_hub.md'),
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
    expect(docText).toContain('SDK/main local execution');
    expect(docText).toContain('local-runtime result');
    expect(docText).toContain('local-runtime executable args/result');
    expect(docText).toContain('executable local-runtime payload');
    expect(docText).toContain('local-runtime validation');
    expect(docText).toContain('SDK local runtime');
    expect(docText).toContain('local-runtime MCP discovery');
    expect(docText).toContain('local-runtime MCP registration');
    expect(docText).toContain('local-runtime MCP `tools/call` execution');
    expect(docText).toContain('Python sidecar tests for implementation parity');
    expect(docText).toContain('The local runtime owns local tool execution');
    expect(docText).toContain('Local runtime implementation');
    expect(docText).toContain('Local-runtime boundaries should');
    expect(docText).toContain('Tool Policy or Local-Runtime Execution');
    expect(browserToolOverviewText).toContain('local-runtime execution, Python sidecar adapters');
    expect(browserRouteDocText).toContain('local-runtime execution, Python sidecar adapters');
    expect(docText).not.toContain('SDK desktop agent');
    expect(docText).not.toContain(`SDK desktop-${'agent'}`);
    expect(docText).not.toContain('frontend/sidecar-owned local schemas');
    expect(docText).not.toContain('frontend manifest builder tests');
    expect(docText).not.toContain(
      'frontend/sidecar owns built-in local tool schemas',
    );
    expect(docText).not.toContain('client-local sidecar tool');
    expect(docText).not.toContain('built-in sidecar tools');
    expect(docText).not.toContain('sidecar plugins under `plugins/*/plugin.json`');
    expect(docText).not.toContain('local sidecar tools');
    expect(docText).not.toContain('local sidecar execution');
    expect(docText).not.toContain('SDK/sidecar local runtime');
    expect(docText).not.toContain('The sidecar starts each enabled MCP server');
    expect(docText).not.toContain('The sidecar sends MCP');
    expect(docText).not.toContain('The sidecar calls `tools/list`');
    expect(docText).not.toContain('executable sidecar local tools');
    expect(docText).not.toContain('routes it to the sidecar');
    expect(docText).not.toContain('The sidecar sends MCP `tools/call`');
    expect(docText).not.toContain('sidecar, or SDK trust boundaries');
    expect(docText).not.toContain('tool, or sidecar change');
    expect(docText).not.toContain('Sidecar boundaries should');
    expect(docText).not.toContain('Tool Policy or Sidecar Execution');
    expect(docText).not.toContain('platform-specific main/sidecar adapters');
    expect(docText).not.toMatch(/(?<!Python )sidecar computer\/browser tool implementations/);
    expect(browserToolOverviewText).not.toContain('sidecar runtime execution');
    expect(browserToolOverviewText).not.toContain('sidecar runtime, CDP launch');
    expect(browserToolOverviewText).not.toContain('Update sidecar runtime argument handling');
    expect(browserToolOverviewText).not.toContain('sidecar-owned Browser Use engine adapter');
    expect(docText).not.toContain('sidecar runtime argument handling');
    expect(docText).not.toContain('sidecar runtime args/result');
    expect(docText).not.toContain('sidecar-owned adapter over the maintained Browser Use CLI');
    expect(docText).not.toContain('sidecar-owned schema/result adapters');
    expect(browserRouteDocText).not.toContain('sidecar runtime, CDP launch');
    expect(browserRouteDocText).not.toContain('sidecar runtime action tests');
    expect(toolRoutingDocText).not.toContain('sidecar execution');
    expect(toolRoutingDocText).not.toContain('sidecar-executed');
    expect(toolRoutingDocText).not.toContain('sidecar results');
    expect(toolRoutingDocText).not.toContain('sidecar result');
    expect(toolRoutingDocText).not.toContain('what the sidecar executed');
    expect(toolRoutingDocText).toContain('SDK/main local-runtime dispatch');
    expect(toolRoutingDocText).toContain('local runtime owns executable desktop actions');
    expect(toolRoutingDocText).toContain('local runtime owns actual mouse');
    expect(toolRoutingDocText).toContain('concrete executable tool implementations and dynamic tool registry behind the local-runtime boundary');
    expect(toolRoutingDocText).toContain('local-runtime host own client-local tool schemas and local executable authority');
    expect(toolRoutingDocText).toContain('The local runtime owns what can actually run locally');
    expect(toolRoutingDocText).toContain('Local-runtime implementation payloads');
    expect(toolRoutingDocText).toContain('Local-runtime tool');
    expect(toolRoutingDocText).toContain('Local-Runtime Tool Catalog and Execution Model');
    expect(toolRoutingDocText).toContain('executable local-runtime tool manifest');
    expect(toolRoutingDocText).toContain('local-runtime computer-control implementation');
    expect(toolRoutingDocText).toContain('local-runtime executable parity tests');
    expect(toolRoutingDocText).toContain('executable local-runtime arguments');
    expect(toolRoutingDocText).toContain('Python sidecar adapters must remain synchronized');
    expect(toolRoutingDocText).not.toContain('sidecar runtime implementations');
    expect(toolRoutingDocText).not.toContain('backend schemas and sidecar runtime');
    expect(toolRoutingDocText).not.toContain('dispatches to the sidecar');
    expect(toolRoutingDocText).not.toContain('mismatched between backend and sidecar schemas');
    expect(toolRoutingDocText).not.toContain('No sidecar parity is needed');
    expect(toolRoutingDocText).not.toContain('Python sidecar runtime arguments');
    expect(toolRoutingDocText).not.toContain('parity with sidecar exposure');
    expect(toolRoutingDocText).not.toContain('sidecar runtime argument models');
    expect(toolRoutingDocText).not.toContain('sidecar-only executable helper');
    expect(toolRoutingDocText).not.toContain('sidecar executable payload need different fields');
    expect(toolRoutingDocText).not.toContain('Update sidecar parity docs/tests');
    expect(toolRoutingDocText).not.toContain('sidecar-executable manifest entries');
    expect(toolRoutingDocText).not.toContain('executable sidecar tools');
    expect(toolRoutingDocText).not.toContain('the sidecar owns executable desktop actions');
    expect(toolRoutingDocText).not.toContain('the sidecar owns actual mouse');
    expect(toolRoutingDocText).not.toContain('Python sidecar owns executable local machine actions');
    expect(toolRoutingDocText).not.toContain('The Python sidecar owns what can actually run locally');
    expect(toolRoutingDocText).not.toContain('Python sidecar owns the concrete local tool implementations');
    expect(toolRoutingDocText).not.toContain('Python sidecar owns local executable tool registry entries');
    expect(toolRoutingDocText).not.toContain('Python sidecar-owned payloads');
    expect(toolRoutingDocText).not.toContain('| Sidecar runtime |');
    expect(toolRoutingDocText).not.toContain('Local sidecar tool');
    expect(toolRoutingDocText).not.toContain('Sidecar owner');
    expect(toolRoutingDocText).not.toContain('filesystem/system sidecar tool');
    expect(toolRoutingDocText).not.toContain('sidecar shell execution');
    expect(toolRoutingDocText).not.toContain('Sidecar shell runtime');
    expect(toolRoutingDocText).not.toContain('Sidecar filesystem reader');
    expect(toolRoutingDocText).not.toContain('Sidecar runtime argument models');
    expect(toolRoutingDocText).not.toContain('Sidecar executable implementations');
    expect(toolRoutingDocText).not.toContain('Tool is visible but never reaches the sidecar');
    expect(toolRoutingDocText).not.toContain('start in the sidecar implementation');
    expect(toolRoutingDocText).not.toContain('Verify sidecar executable registration and schema');
    expect(toolRoutingDocText).not.toContain('Sidecar tools:');
    expect(toolRoutingDocText).not.toContain('Sidecar tool registry');
    expect(toolRoutingDocText).not.toContain('Sidecar diagnostic schema export');
    expect(toolRoutingDocText).not.toContain('Sidecar extension tool loader');
    expect(toolRoutingDocText).not.toContain('Register built-in sidecar handler');
    expect(toolRoutingDocText).not.toContain('Sidecar Result Contract');
    expect(toolRoutingDocText).not.toContain('Tool executes but fails in sidecar');
    expect(toolRoutingDocText).not.toContain('executable sidecar tool manifest');
    expect(toolRoutingDocText).not.toContain('owned by the sidecar runtime');
    expect(toolRoutingDocText).not.toContain('Sidecar Tool Catalog and Execution Model');
    expect(toolRoutingDocText).not.toContain('registered sidecar tools');
    expect(toolRoutingDocText).not.toContain('proof that the sidecar directly accepts');
    expect(toolRoutingDocText).not.toContain('sidecar registry implementation');
    expect(toolRoutingDocText).not.toContain('sidecar-executable');
    expect(toolRoutingDocText).not.toContain('sidecar executable manifest');
    expect(toolRoutingDocText).not.toContain('executable sidecar arguments');
    expect(toolRoutingDocText).not.toContain('no sidecar parity');
    expect(toolRoutingDocText).not.toContain('sidecar parity tests');
    expect(localRuntimePayloadDocText).not.toContain('sidecar payload');
    expect(localRuntimePayloadDocText).not.toContain('sidecar validation');
    expect(localRuntimePayloadDocText).not.toContain('executable sidecar payload');
    expect(localRuntimePayloadDocText).toContain('Python sidecar `ToolResult`');
    expect(localRuntimePayloadDocText).not.toContain('Frontend/sidecar must not import');
    expect(localRuntimePayloadDocText).not.toContain('Sidecar `ToolResult`');
    expect(localRuntimePayloadDocText).not.toContain('the sidecar execute another');
    expect(localRuntimePayloadDocText).not.toContain('sidecar tools');
    expect(localRuntimePayloadDocText).not.toContain('sidecar tool behavior');
    expect(localRuntimePayloadDocText).not.toContain('Sidecar/platform runtime');
    expect(localRuntimePayloadDocText).not.toContain('Sidecar shell sudo rewrite');
    expect(docText).not.toContain('Windie Agent owns client-local');
    expect(docText).not.toContain('Sidecar Plugin Tool Registration');
    expect(docText).not.toContain('sidecar plugin');
    expect(docText).not.toContain(
      'Remote tools are dispatched through the SDK/main local runtime',
    );
  });

  test('tool routing docs qualify sidecar executor ownership', async () => {
    const docs = await Promise.all([
      read('docs/README.md'),
      read('docs/architecture/tool_system.md'),
      read('docs/channels/channel_routing_matrix.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md'),
      read('docs/gateway/gateway_troubleshooting.md'),
      read('docs/reference/code_change_surface_index.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_catalog_matrix.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
      read('docs/tools/tool_schema_policy_change_workflow.md'),
      read('docs/tools/tool_troubleshooting.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Python sidecar executor');
    expect(docText).toContain('local-runtime sidecar executor');
    expect(docText).toContain('Python sidecar registry');
    expect(docText).toContain('Local-runtime registry/schema implementation');
    expect(docText).not.toContain(' or sidecar executor');
    expect(docText).not.toContain('and sidecar executor');
    expect(docText).not.toContain('vs sidecar executor');
    expect(docText).not.toContain('schema owners, sidecar executors');
    expect(docText).not.toContain('backend owners, sidecar executors');
    expect(docText).not.toContain('Built-in sidecar executors');
    expect(docText).not.toContain('Plugin sidecar executors');
    expect(docText).not.toMatch(/(?<!Python )sidecar registry parity or SDK dispatch map/);
    expect(docText).not.toMatch(/(?<!Python )sidecar registry\/schema\/runtime/);
    expect(docText).not.toMatch(/(?<!Python )sidecar says missing tool/);
    expect(docText).not.toMatch(/(?<!Python )sidecar registry\/exposed-name parity/);
    expect(docText).not.toMatch(/(?<!Python )sidecar executable args/);
    expect(docText).not.toContain('Sidecar tests cover executable behavior');
  });

  test('debug error docs route local failures through local runtime owners', async () => {
    const docs = await Promise.all([
      read('docs/debug/error_failure_change_workflow.md'),
      read('docs/debug/symptom_playbooks.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Local Runtime Process Lifecycle Change Workflow');
    expect(docText).toContain('Local-Runtime Registry and Result Contract');
    expect(docText).toContain('local-runtime tool registration backed by the Python sidecar registry');
    expect(docText).not.toContain('or sidecar registry');
    expect(docText).not.toContain('[Sidecar Runtime Change Workflow]');
    expect(docText).not.toContain('[Tool Registry Result Contract Reference]');
    expect(docText).not.toContain('| Sidecar ToolResult/registry |');
  });

  test('workflow route docs use local-runtime labels for sidecar-backed implementation docs', async () => {
    const docs = await Promise.all([
      read('docs/backend/agent/tool_turn_change_workflow.md'),
      read('docs/backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md'),
      read('docs/backend/tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md'),
      read('docs/browser/browser_change_workflow.md'),
      read('docs/debug/README.md'),
      read('docs/README.md'),
      read('docs/frontend/README.md'),
      read('docs/frontend/main/local_backend/process_lifecycle_change_workflow.md'),
      read('docs/frontend/renderer/renderer_state_change_workflow.md'),
      read('docs/frontend/sidecar/README.md'),
      read('docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md'),
      read('docs/frontend/sidecar/python_sidecar_and_memory.md'),
      read('docs/frontend/sidecar/sidecar_runtime_change_workflow.md'),
      read('docs/frontend/sidecar/browser/README.md'),
      read('docs/frontend/sidecar/browser/contracts/README.md'),
      read('docs/frontend/sidecar/browser/chrome/README.md'),
      read('docs/frontend/sidecar/tools/README.md'),
      read('docs/frontend/sidecar/tools/computer/README.md'),
      read('docs/frontend/sidecar/tools/system/README.md'),
      read('docs/frontend/sidecar/tools/filesystem/README.md'),
      read('docs/frontend/sidecar/tools/registry/README.md'),
      read('docs/frontend/sidecar_tool_change_workflow.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/operations/evidence_collection_runbook.md'),
      read('docs/security/credential_token_change_workflow.md'),
      read('docs/tools/README.md'),
      read('docs/tools/browser.md'),
      read('docs/tools/computer.md'),
      read('docs/tools/filesystem_shell.md'),
      read('docs/tools/tool_execution_lifecycle.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Local-Runtime Tool Change Workflow');
    expect(docText).toContain('Local-Runtime Python Implementation Change Workflow');
    expect(docText).toContain('Local-Runtime Registry and Result Contract');
    expect(docText).toContain('Local-Runtime Tool Registry Docs Hub');
    expect(docText).toContain('Local-Runtime Tools Docs Hub');
    expect(docText).toContain('Local-Runtime Computer Tools Docs Hub');
    expect(docText).toContain('Local-Runtime System Tools Docs Hub');
    expect(docText).toContain('Local-Runtime Browser Docs Hub');
    expect(docText).toContain('Local-Runtime Browser Contracts Docs Hub');
    expect(docText).toContain('Local-Runtime Browser Chrome Docs Hub');
    expect(docText).not.toContain('[Sidecar Tool Change Workflow]');
    expect(docText).not.toContain('[Sidecar Runtime Change Workflow]');
    expect(docText).not.toContain('Sidecar Tool Change Workflow');
    expect(docText).not.toContain('Sidecar Runtime Change Workflow');
    expect(docText).not.toContain('[Sidecar Registry]');
    expect(docText).not.toContain('Sidecar Tool Registry Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Tool Registry Docs Hub');
    expect(docText).not.toContain('sidecar ToolResult failures');
    expect(docText).not.toContain('## Sidecar Tool Registry');
    expect(docText).not.toContain('missing in sidecar runtime');
    expect(docText).not.toContain('Sidecar Tool Registry Exposed Schema');
    expect(docText).not.toContain('Local Runtime Sidecar Tool Registry Exposed Schema');
    expect(docText).not.toContain('Sidecar Tools Docs Hub');
    expect(docText).not.toContain('Sidecar Computer Tools Docs Hub');
    expect(docText).not.toContain('Sidecar System Tools Docs Hub');
    expect(docText).not.toContain('Sidecar Browser Docs Hub');
    expect(docText).not.toContain('Sidecar Browser Contracts Docs Hub');
    expect(docText).not.toContain('Sidecar Browser Chrome Docs Hub');
    expect(docText).not.toContain('Sidecar Tool Catalog and Execution Model');
    expect(docText).not.toContain('Sidecar Shell and Process Session Runtime Reference');
    expect(docText).not.toContain('Sidecar Filesystem Read and Replace Runtime Reference');
    expect(docText).not.toContain('Sidecar Mouse, Keyboard, Scroll, and Screenshot Runtime Reference');
    expect(docText).not.toContain('Sidecar Wait, Window, and Stats Runtime Reference');
    expect(docText).not.toContain('Local Runtime Sidecar Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Computer Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar System Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Filesystem Tools Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Contracts Docs Hub');
    expect(docText).not.toContain('Local Runtime Sidecar Browser Chrome Docs Hub');
    expect(docText).not.toContain('title: "Sidecar Tool Change Workflow"');
    expect(docText).not.toContain('title: "Sidecar Runtime Change Workflow"');
  });

  test('browser contract docs route shared validation through the local runtime boundary', async () => {
    const docs = await Promise.all([
      read('docs/README.md'),
      read('docs/backend/README.md'),
      read('docs/backend/tools/README.md'),
      read('docs/backend/tools/browser/browser_remote_schema_surface_reference.md'),
      read('docs/backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md'),
      read('docs/browser/browser_change_workflow.md'),
      read('docs/frontend/sidecar/browser/contracts/README.md'),
      read('docs/frontend/sidecar/browser_action_runtime_reference.md'),
      read('docs/frontend/sidecar/browser_automation_stack.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/tools/README.md'),
      read('docs/tools/tool_catalog_matrix.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('local-runtime validation');
    expect(docText).toContain('local-runtime validation backed by Python sidecar');
    expect(docText).toContain('Backend-Local Runtime Browser Schema Parity');
    expect(docText).toContain('backend/local-runtime parity');
    expect(docText).toContain('local-runtime browser execution');
    expect(docText).toContain('Python sidecar Browser Use adapters');
    expect(docText).toContain('Desktop client/local-runtime manifest');
    expect(docText).toContain('Python sidecar registry');
    expect(docText).not.toContain('Backend-Sidecar Browser Schema');
    expect(docText).not.toContain('Frontend/sidecar manifest');
    expect(docText).not.toContain('Sidecar registry:');
    expect(docText).not.toContain('Sidecar executable owner:');
    expect(docText).not.toContain('shared contract, Python sidecar runtime, CDP launch');
    expect(docText).not.toContain('sidecar action runtime');
    expect(docText).not.toContain('Sidecar Browser Use engine adapter');
    expect(docText).not.toContain('Sidecar Chrome launcher/detection');
    expect(docText).not.toContain('SDK local-runtime bridge and sidecar browser execution');
    expect(docText).not.toMatch(/(?<!Python )sidecar validation entrypoint/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime validation/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime supported-action registry/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime handler/);
    expect(docText).not.toMatch(/(?<!Python )sidecar runtime action/);
    expect(docText).not.toMatch(/(?<!Python )sidecar JSON-RPC availability/);
    expect(docText).not.toContain('fails in the sidecar');
  });

  test('local runtime diagnostics avoid sidecar payload wording', async () => {
    const docs = await Promise.all([
      read('docs/frontend/sidecar/README.md'),
      read('frontend/src/main/python/windie/_unicode_sanitizer.py'),
    ]);
    const text = docs.join('\n');

    expect(text).toContain('local-runtime JSON-RPC payloads');
    expect(text).toContain('local-runtime payloads');
    expect(text).not.toContain('sidecar payload');
    expect(text).not.toContain('sidecar payloads');
  });

  test('docs use local runtime sidecar labels instead of frontend sidecar labels', async () => {
    const docs = await listMarkdownFiles('docs');
    const offenders: Record<string, string[]> = {};

    for (const relativePath of docs) {
      const source = await read(relativePath);
      const staleMentions = ['Frontend Sidecar', 'Frontend sidecar'].filter((needle) =>
        source.includes(needle),
      );
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
  });

  test('renderer docs and contract tests use sdk source-event boundary wording', async () => {
    const boundaryFiles = [
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/chat/stream/conversation_event_ingress_failsafe_and_dispatch_order_reference.md',
      'docs/frontend/renderer/chat/stream/conversation_gate_and_active_turn_filtering_reference.md',
      'docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md',
      'docs/concepts/streaming_and_events.md',
      'docs/frontend/runtime/stream_event_state_machine.md',
      'docs/architecture/frontend_architecture.md',
      'docs/frontend/inventory/frontend_capability_to_file_matrix_reference.md',
      'docs/frontend/contracts/ipc_channels_and_event_contracts.md',
      'docs/frontend/main/query_payload_and_relay_reference.md',
      'tests/frontend/BackendSdkWebsocketContract.test.cjs',
      'tests/frontend/RendererChatRuntimeBoundary.test.ts',
      'tests/frontend/ChatInterfaceWiring.test.jsx',
      'tests/frontend/ChatStreamThinkingStatus.state.test.tsx',
      'tests/frontend/ConversationSessionRuntime.test.ts',
      'tests/frontend/WindieDocsIndex.test.cjs',
    ];
    const offenders: Record<string, string[]> = {};

    for (const relativePath of boundaryFiles) {
      const source = await read(relativePath);
      const staleMentions = [
        'raw backend',
        'frontend/backend websocket incoming contract',
        'frontend outbound payload filter',
        'frontend command family',
        'FrontendBackendWebsocketContract',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
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
      'docs/frontend/inventory/frontend_module_file_index_reference.md',
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
      'docs/frontend/inventory/frontend_full_functionality_inventory_reference.md',
      'docs/architecture/storage_persistence_change_workflow.md',
      'docs/reference/code_change_surface_index.md',
      'docs/frontend/renderer/infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md',
      'docs/frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md',
      'docs/frontend/runtime/tool_execution_and_streaming.md',
      'docs/frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md',
      'docs/architecture/README.md',
      'docs/architecture/data_flow_and_state_ownership.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/architecture/tool_system.md',
      'docs/architecture/storage_persistence_change_workflow.md',
      'docs/automation/vm_run_control_change_workflow.md',
      'docs/frontend/sidecar_tool_change_workflow.md',
      'docs/frontend/main/local_backend/process_lifecycle_change_workflow.md',
      'docs/frontend/runtime/settings_sync_change_workflow.md',
      'docs/frontend/sidecar/memory_pipeline_and_summarization.md',
      'docs/frontend/renderer/README.md',
      'docs/frontend/renderer/renderer_state_change_workflow.md',
      'docs/frontend/README.md',
      'docs/frontend/renderer/chat/payloads/README.md',
      'docs/frontend/renderer/infrastructure/README.md',
      'docs/frontend/renderer/chat_stream_and_tool_execution_reference.md',
      'docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md',
      'docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md',
      'docs/frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md',
      'docs/concepts/agent_loop.md',
      'docs/concepts/runtime_model.md',
      'docs/concepts/prompt_and_tool_context.md',
      'docs/getting-started/docs_hub.md',
      'docs/desktop/artifact_change_workflow.md',
      'docs/browser/browser_troubleshooting.md',
      'docs/browser/browser_change_workflow.md',
      'docs/backend/agent/tool_turn_change_workflow.md',
      'docs/backend/runtime/agent_and_tool_runtime.md',
      'docs/backend/runtime/query_lifecycle_change_workflow.md',
      'docs/backend/agent/interaction_loop_and_tool_turn_orchestration_reference.md',
      'docs/backend/agent/llm/conversation_context_and_event_presenter_prompt_metadata_reference.md',
      'docs/backend/agent/history_compaction_engine_decision_strategy_and_event_contract_reference.md',
      'docs/backend/agent/history/history_committer_and_result_processor_boundary_reference.md',
      'docs/backend/tools/tool_result_ingress_and_storage_reference.md',
      'docs/backend/tools/execution/tool_sender_local_runtime_dispatch_and_synthetic_error_result_reference.md',
      'docs/backend/tools/execution/sender/request_id_extraction_and_failed_bundle_result_storage_reference.md',
      'docs/backend/api/api_route_change_workflow.md',
      'docs/backend/services/backend_service_change_workflow.md',
      'docs/backend/api/handlers/non_query_handler_dispatch_and_payload_normalization_reference.md',
      'docs/backend/contracts/message_types/message_type_constants_schema_subset_and_handler_ack_reference.md',
      'docs/backend/api/processing/formatters/messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md',
      'docs/backend/api/processing/formatters/messages/error_formatter_guard_and_schema_mapping_reference.md',
      'docs/backend/api/processing/formatters/signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md',
      'docs/backend/llm/providers/base_request_stream_and_normalization_reference.md',
      'docs/backend/inventory/protocols/observability/backend_protocol_correlation_logging_and_telemetry_signal_reference.md',
      'docs/debug/error_failure_change_workflow.md',
      'docs/debug/observability_change_workflow.md',
      'docs/debug/runtime_traces.md',
      'docs/debug/logging.md',
      'docs/debug/symptom_playbooks.md',
      'docs/development/review_and_risk_checklist.md',
      'docs/debug/endpoint_and_network_debugging.md',
      'docs/debug/test_selection.md',
      'docs/getting-started/troubleshooting.md',
      'docs/help/diagnostics.md',
      'docs/help/faq.md',
      'docs/help/troubleshooting.md',
      'docs/help/triage_routes.md',
      'docs/security/credential_token_change_workflow.md',
      'docs/security/credentials_and_tokens_matrix.md',
      'docs/security/security_boundary_matrix.md',
      'docs/security/security_change_playbook.md',
      'docs/development/mcp.md',
      'docs/memory/sidecar_local_memory.md',
      'docs/memory/session_conversation_identity_change_workflow.md',
      'docs/memory/memory_change_workflow.md',
      'docs/memory/memory_troubleshooting.md',
      'docs/channels/sidecar_and_tool_channels.md',
      'docs/channels/README.md',
      'docs/channels/channel_routing_matrix.md',
      'docs/concepts/model_provider_selection.md',
      'docs/concepts/safety_boundaries.md',
      'docs/nodes/README.md',
      'docs/nodes/runtime_node_matrix.md',
      'docs/operations/performance.md',
      'docs/operations/configuration_change_workflow.md',
      'docs/providers/provider_change_workflow.md',
      'docs/providers/credentials.md',
      'docs/providers/model_catalog_change_workflow.md',
      'docs/providers/openai.md',
      'docs/providers/anthropic.md',
      'docs/providers/openrouter.md',
      'docs/providers/mistral.md',
      'docs/providers/kimi_coding.md',
      'docs/backend/config/backend_config_and_container_change_workflow.md',
      'docs/backend/config/config_fields_and_runtime_policy.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/frontend/renderer/settings/README.md',
      'docs/frontend/renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md',
      'docs/frontend/renderer/settings/model_settings_change_workflow.md',
      'docs/frontend/renderer/settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md',
      'docs/frontend/renderer/app_startup_vm_mode_and_permission_onboarding_runtime_reference.md',
      'docs/planning/windieos_self_edit_config_plan.md',
      'docs/planning/windieos_cli_os_control_plan.md',
      'docs/development/testing.md',
      'docs/development/validation_matrix.md',
      'docs/development/agent_development_workflow.md',
      'docs/development/README.md',
      'docs/development/developer_guide.md',
      'docs/frontend/sidecar/browser/contracts/schema_registry_and_action_validation_boundary_reference.md',
      'docs/sdk/windie_client_runtime.md',
      'docs/backend/simulation/simulation_backend_and_mock_llm_runtime_reference.md',
      'docs/backend/inventory/backend_cross_layer_contract_touchpoints_reference.md',
      'docs/backend/inventory/protocols/README.md',
      'docs/backend/tools/contracts/tool_domain_and_category_enum_contract_reference.md',
      'docs/backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md',
      'docs/sdk/agent_definition.md',
      'docs/architecture/README.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/architecture/architecture.md',
      'docs/architecture/failure_domain_map.md',
      'docs/architecture/memory_system.md',
      'docs/architecture/tool_system.md',
      'docs/automation/automation_boundaries.md',
      'docs/automation/vm_run_control_change_workflow.md',
      'docs/concepts/README.md',
      'docs/concepts/context_and_memory.md',
      'docs/concepts/prompt_and_tool_context.md',
      'docs/concepts/runtime_model.md',
      'docs/concepts/sessions_and_conversations.md',
      'docs/README.md',
      'docs/tools/computer.md',
      'docs/tools/tool_execution_lifecycle.md',
      'docs/tools/README.md',
      'docs/tools/tool_troubleshooting.md',
      'docs/tools/filesystem_shell.md',
      'docs/tools/tool_schema_policy_change_workflow.md',
      'docs/tools/tool_catalog_matrix.md',
      'docs/tools/tool_contracts.md',
      'docs/backend/tools/registry/README.md',
      'docs/development/tool_development.md',
      'docs/development/extensions.md',
      'docs/adr/README.md',
      'docs/adr/005-frontend-tool-schema-source-of-truth.md',
      'docs/getting-started/docs_hub.md',
      'docs/getting-started/docs_directory.md',
      'docs/help/evidence_packet.md',
      'docs/install/README.md',
      'docs/install/install_decision_matrix.md',
      'docs/install/local_backend_and_endpoint_setup.md',
      'docs/install/local_development.md',
      'docs/getting-started/installation.md',
      'docs/operations/evidence_collection_runbook.md',
      'docs/operations/incident_triage_runbook.md',
      'docs/platforms/platform_change_workflow.md',
      'docs/platforms/window_input_matrix.md',
      'docs/reference/openclaw_docs_structure_reference.md',
      'docs/reference/session_and_transcript_reference.md',
      'docs/security/security_boundary_matrix.md',
      'docs/frontend/landing/landing_page_runtime_and_content_reference.md',
      'docs/frontend/landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md',
      'docs/frontend/landing/sections/why_privacy_cta_footer_and_shared_intro_component_contract_reference.md',
      'docs/README.md',
      'docs/architecture/architecture.md',
      'docs/architecture/communication_flow.md',
      'docs/architecture/frontend_architecture.md',
      'docs/backend/inventory/backend_cross_layer_contract_touchpoints_reference.md',
      'docs/backend/inventory/domains/backend_change_path_playbook_reference.md',
      'docs/development/agent_runtime_ownership_and_change_routing.md',
      'docs/frontend/inventory/protocols/frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md',
      'docs/frontend/main/main_process_change_workflow.md',
      'docs/frontend/contracts/backend_websocket_command_contract.md',
      'docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md',
      'docs/frontend/runtime/workspace_context_change_workflow.md',
      'docs/frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md',
      'docs/nodes/runtime_node_matrix.md',
      'docs/security/credential_token_change_workflow.md',
      'docs/operations/configuration_change_workflow.md',
      'docs/operations/operational_troubleshooting.md',
      'docs/operations/runtime_configuration_matrix.md',
      'docs/backend/api/processing/formatters/signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md',
      'docs/gateway/websocket_connection_change_workflow.md',
      'docs/frontend/sidecar/browser/browser_runtime_deterministic_extraction_contract_reference.md',
      'docs/memory/backend_history_and_semantic_routes.md',
      'docs/memory/session_conversation_identity_change_workflow.md',
      'docs/frontend/renderer/dashboard/dashboard_change_workflow.md',
      'docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md',
      'docs/frontend/renderer/dashboard/sections/memory_section_data_normalization_and_semantic_delete_contract_reference.md',
      'docs/frontend/renderer/settings/settings_surface_change_workflow.md',
      'docs/frontend/main/query_send_and_stream_relay_change_workflow.md',
      'docs/frontend/main/query_payload_and_relay_reference.md',
      'docs/frontend/sidecar/README.md',
      'docs/frontend/sidecar/python_sidecar_and_memory.md',
      'docs/frontend/sidecar/sidecar_runtime_change_workflow.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_reference.md',
      'docs/frontend/sidecar/local_backend_jsonrpc_change_workflow.md',
      'docs/frontend/sidecar/memory/README.md',
      'docs/frontend/sidecar/memory/storage/README.md',
      'docs/frontend/sidecar/memory_pipeline_and_summarization.md',
      'docs/frontend/sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md',
      'docs/frontend/sidecar/memory/storage/conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md',
      'docs/frontend/sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md',
      'docs/frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md',
      'docs/architecture/agent_visible_data_pipeline.md',
      'docs/cli/validation_commands.md',
      'docs/debug/observability_change_workflow.md',
      'docs/frontend/contracts/memory_ipc_and_rpc_mapping_reference.md',
      'docs/frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
      'docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md',
      'docs/frontend/inventory/frontend_full_functionality_inventory_reference.md',
      'docs/frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md',
      'docs/frontend/inventory/frontend_runtime_surface_matrix_reference.md',
      'docs/frontend/ipc_change_workflow.md',
      'docs/browser/README.md',
      'docs/development/README.md',
      'docs/development/agent_architecture_reference.md',
      'docs/development/extensions.md',
      'docs/install/install_decision_matrix.md',
      'docs/nodes/desktop_and_sidecar_node.md',
      'docs/planning/windieos_mobile_app_plan.md',
      'docs/plugins/README.md',
      'docs/providers/inference_capability_change_workflow.md',
      'docs/sdk/sdk_route_change_workflow.md',
      'docs/tools/tool_execution_lifecycle.md',
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
        'frontend-facing transparency',
        'frontend request/response state',
        'frontend stream consumer',
        'frontend stream consumers',
        'frontend stream docs',
        'frontend stream tests',
        'frontend token display/tracking',
        'frontend tracking consumers',
        'frontend persistence uses',
        'frontend thinking-status',
        'frontend-preformatted',
        'frontend stop payload',
        'Frontend-managed provider',
        'frontend-managed provider',
        'frontend-managed key',
        'frontend-config patch',
        'frontend config filtering',
        'frontend config ownership',
        'frontend settings a broad',
        'frontend settings fields',
        'frontend settings docs',
        'frontend settings/picker',
        'frontend settings ACK',
        'frontend settings reconciliation',
        'local frontend config',
        'persisted frontend config',
        'frontend model picker',
        'frontend overrides',
        'frontend patch',
        'frontend config state',
        'frontend config to',
        'frontend config with',
        'syncs frontend config',
        'resyncs frontend config',
        'frontend-config persistence',
        'frontend config handlers',
        'frontend-patch validation',
        'Frontend Setting Is Ignored',
        'Electron frontend-config persistence',
        'Existing frontend config persistence',
        'Inspect frontend config persistence',
        'remain in frontend config',
        'frontend consumers',
        'frontend consumer',
        'frontend-visible',
        'frontend display paths',
        'frontend settings surface',
        'frontend model-settings',
        'frontend settings sync',
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
        'Add a new renderer -> backend command',
        'backend transport mapping under `renderer/app/runtime`',
        'Request models list from backend',
        'backend communication (dependency injection)',
        'Handles model listing events from backend',
        'Backend sends audio-chunk event',
        'frontend-completed result futures',
        'Transforms frontend tool outputs',
        'Tool Result Ingress from Frontend',
        'delegates to `session.process_local_tool_result(...)`',
        'delegates to `session.process_local_tool_bundle_result(...)`',
        'Tool events execute in frontend/sidecar',
        'Frontend/sidecar executable tools run local actions',
        'backend/frontend tool-name',
        'frontend/sidecar-authored executable',
        'frontend sidecar executor',
        'Frontend sidecar (execution)',
        'Core backend/frontend/sidecar tool files',
        'Frontend Tool Schema Source of Truth',
        'frontend-config atomic',
        'backend/frontend/sidecar',
        'backend/frontend exposed-tool',
        'backend/frontend drift',
        'frontend/backend contract drift',
        'frontend/backend code boundary',
        'backend/frontend contract surface',
        'backend/frontend runtime changes',
        'frontend/backend consumers',
        'frontend websocket client header construction',
        'frontend websocket/endpoint tests',
        'frontend endpoint/auth code',
        'frontend websocket/main IPC tests',
        'frontend contract updates',
        'frontend or sidecar impact',
        'Frontend consumer',
        'Frontend/sidecar owners',
        'Renderer tool runner, Electron bridge, or sidecar',
        'Renderer correlation IDs from tool runner',
        'frontend sidecar adapts',
        'Electron frontend owns desktop windows',
        'Frontend and sidecar code must not import backend code',
        'frontend/sidecar must not import backend schema code',
        'frontend/sidecar Python must never import backend Python modules',
        'frontend/sidecar runtime imports independent',
        'frontend/sidecar code import backend modules',
        'frontend/sidecar code must never import backend code',
        'Client-local runtime and sidecar code must not import',
        'plus sidecar method registry',
        'tests, sidecar handler tests',
        'provider tests, sidecar daemon tests',
        'tests, sidecar memory/conversation tests',
        'dispatch tests, sidecar tool tests',
        'router tests, sidecar tool tests',
        'focused sidecar tool tests',
        'Add sidecar protocol tests',
        'main bridge tests, sidecar protocol tests',
        'focused sidecar tests',
        'Add or change a sidecar JSON-RPC method',
        'Sidecar process lifecycle/readiness',
        'what the sidecar executes',
        'what sidecar executes',
        'the same names the sidecar executes',
        'after sidecar executes',
        'Electron bridge or sidecar',
        'Sidecar local memory/search',
        'transcript/replay/local memory | renderer plus sidecar memory',
        'transcript row id/index | sidecar memory store',
        'sidecar memory search via Electron main',
        'Sidecar transcript/memory SQLite',
        'Change sidecar memory SQLite schema',
        'Sidecar SQLite/memory schema',
        'Transcript persistence, replay, sidecar local memory',
        'Route transcript, replay, sidecar memory',
        'Backend history plus SDK transcript projection plus sidecar memory',
        'Sidecar local memory storage and retrieval',
        'sidecar memory calls store under fallback users',
        'sidecar memory/API calls hit',
        'sidecar memory route hits wrong backend',
        'backend URL used by sidecar memory/API clients',
        'sidecar env, SDK helpers',
        'sidecar receives `WINDIE_BACKEND_HTTP_URL`',
        'executable local tool implementation | sidecar',
        'sidecar transcript/memory',
        'sidecar local store during migration',
        'sidecar path/tool decisions',
        'sidecar points to different backend than websocket',
        'sidecar URL drift checks',
        'sidecar auth headers',
        'sidecar remote-client auth',
        'sidecar auth-state path, sidecar bearer header',
        'sidecar remote client base or Electron sidecar env',
        'sidecar parity, SDK/main dispatch',
        'Local-runtime sidecar tool arg schemas',
        'sidecar clients',
        'sidecar env propagation',
        'sidecar sees backend URL changes',
        'sidecar runtime, not hosted backend',
        'SDK-owned sidecar daemon lifecycle',
        'Packaged app, sidecar runtime, reinstall',
        'Electron packaging, sidecar bundling',
        'Sidecar or Electron tool bridge issue',
        'main sidecar env injection',
        '`WINDIE_BACKEND_HTTP_URL` in sidecar env',
        'sidecar endpoint drift',
        'Sidecar owns local execution variables and backend URLs needed by sidecar memory/API clients',
        'Check sidecar memory store',
        'sidecar memory store, backend history',
        'sidecar local memory, backend history',
        'Memory/search/title issue | sidecar memory store',
        'for transcript, replay, sidecar memory',
        'routing transcript, replay, sidecar memory',
        'Validate renderer transcript tests, sidecar memory tests',
        'Sidecar Local Memory',
        'Verify the sidecar memory directory',
        'support sidecar memory retrieval',
        'sidecar memory search results',
        'renderer transcript, sidecar memory, backend history',
        'local-runtime sidecar memory admin',
        'asks the sidecar memory index',
        'sidecar local memory files',
        'sidecar memory store/search pipeline',
        'Python sidecar local memory/search',
        '| Sidecar memory |',
        'Sidecar memory retrieval plus backend prompt constructor',
        'sidecar memory search, Electron query payload',
        'Electron query payload, sidecar memory',
        'sidecar memory or clients use it',
        'sidecar memory may treat embedding unavailability',
        'sidecar memory docs if the route response',
        'sidecar semantic memory indexing quality',
        'sidecar memory service',
        'state, sidecar memory JSON-RPC',
        'mutate sidecar memory files directly',
        'transcript storage, sidecar memory',
        'relevant sidecar memory tests',
        'performs sidecar memory search',
        'Changing sidecar memory payload shape',
        'SDK conversation/memory store tests plus related sidecar memory tests',
        'may call sidecar memory helpers',
        'Sidecar memory/system-state enrichment change',
        'sidecar memory RPC handlers',
        'If sidecar memory operations return wrong filters',
        'Renderer/main/sidecar memory',
        'Sidecar memory RPC names',
        'Sidecar memory handlers return',
        'verify sidecar memory store is initialized',
        'sidecar memory actions',
        'sidecar memory admin/store',
        'sidecar admin path',
        'sidecar memory admin',
        'main/sidecar memory actions',
        'Sidecar memory operation tests',
        'Sidecar memory runtime',
        'Sidecar memory handlers',
        'Sidecar Memory Docs Hub',
        'Sidecar Memory Storage Docs Hub',
        'Local Runtime Sidecar Memory Docs Hub',
        'Local Runtime Sidecar Memory Storage Docs Hub',
        'Detailed sidecar memory pipeline',
        'sidecar memory persistence helpers',
        'When changing sidecar memory table',
        'all sidecar memory and summarizer behavior',
        'Sidecar memory handler mixin',
        'sidecar JSON-RPC methods directly behind',
        'calls the sidecar directly through',
        'sidecar JSON-RPC method and params',
        'sidecar JSON-RPC method params stay snake_case',
        'sidecar memory handler defaults',
        'sidecar search path applies',
        '`search_memory_by_embedding` sidecar RPC',
        'sidecar episodic grouping',
        'backed by sidecar episodic',
        'When changing sidecar memory:',
        'sidecar memory starts calling',
        'Local Runtime Sidecar Memory Hub',
        'Local Runtime Sidecar Memory Storage Hub',
        'SDK owns sidecar RPC unwrapping',
        'sidecar memory implementation details',
        'sidecar RPC mappers',
        'Local sidecar RPC request timeout',
        'Sidecar memory summarizer deep reference',
        'The sidecar summarizer periodically',
        'Renderer code must not call sidecar RPC names',
        '| sidecar local tool runtime variable changed',
        'and sidecar runtime reader',
        '| Python sidecar | local tool env flags',
        '| sidecar runtime |',
        'Sidecar receives the active backend URL',
        'Sidecar env injected by Electron main',
        'Sidecar env |',
        'sidecar env, provider credentials',
        '## Sidecar Env Changes',
        'Sidecar env changes must be validated',
        'sidecar daemon env',
        'Sidecar daemon env',
        'Sidecar daemon test env',
        'or sidecar env.',
        'Python sidecar env should change from a setting',
        'Sidecar owns local tool runtime env',
        'sidecar env, or release/packaging config',
        'Python sidecar env changes are validated',
        'sidecar env propagation',
        'main sidecar env injection',
        'in sidecar env',
        'Sidecar or Electron tool bridge issue',
        'sidecar sees backend URL changes',
        'sidecar tools, or VM run control flows',
        'sidecar executable tool under',
        'sidecar daemon routing',
        'Sidecar-facing IPC channels',
        'sidecar returns error before action',
        'sidecar tool validation/runtime',
        'sidecar executable payloads',
        'sidecar tool, SDK/IPC router tests',
        'sidecar tool runtime',
        'sidecar tool registry -> platform action',
        'sidecar tool modules',
        'sidecar tool argument shape issues',
        'sidecar tool logic',
        'sidecar tool schema/registry',
        'sidecar tool path',
        'sidecar tool internals',
        'generic sidecar tools',
        'sidecar tool ran',
        '| sidecar tool implementation |',
        'sidecar tool files',
        'sidecar tools expected by backend schemas',
        'Python sidecar tool schemas through explicit parity tests',
        'existing sidecar control tools',
        'CLI -> sidecar UI action tests',
        'sidecar assumptions',
        'sidecar parity for V1',
        'supports_local_sidecar',
        'Local sidecar memory/tool runtime',
        'hosted SDK vs sidecar split',
        '[Sidecar and Tool Channels]',
        'Python sidecar tools | schema parity',
        'voice, sidecar tools, SDK',
        '[**Sidecar and Tool Channels**]',
        'execution in sidecar tools',
        'use sidecar tools.',
        '| local computer/filesystem/shell/browser execution | sidecar tools |',
        'belongs in the sidecar tool implementation',
        'preload, sidecar, platform',
        'preload, sidecar, wakeword',
        'belongs in backend, Electron main, renderer, preload, sidecar',
        '| sidecar process |',
        'sidecar tool registry/tool',
        'sidecar platform adapter',
        'websocket, sidecar tool, SDK',
        'packaged app sidecar fails',
        '| Python sidecar | local tools',
        '| sidecar tool | sidecar pytest',
        'hosted backend websocket primitives, sidecar tool implementation',
        '| Python sidecar | local tool execution',
        'sidecar or Electron main',
        'sidecar tool schemas are paired contracts',
        'client manifest and sidecar schema',
        'renderer/main/sidecar ownership boundaries',
        'Sidecar (Python): local tool execution',
        'Local sidecar calls',
        'Python sidecar tool runtime',
        'sidecar/backend config propagation',
        'Workspace permission and sidecar tool runtime',
        'Route to the backend, SDK/main, renderer, or sidecar owner',
        'Validate tool result path and sidecar JSON-RPC before changing backend schema',
        'sidecar local runtime',
        'sidecar tool arg schemas',
        'sidecar tool runtime issues',
        'participant L as Local sidecar',
        'preserve request correlation and sidecar ownership',
        'Renderer/main/sidecar ownership bug',
        'sidecar tool execution',
        'Sidecar browser runtime is feature-pack aware',
        'Sidecar tool contract is direct-name based',
        'Wrapper artifacts are not live sidecar tool names',
        'Frontend documentation hub covering Electron main process, renderer runtime, tool execution services, and Python sidecar behavior',
        'main/renderer/sidecar boundaries',
        'frontend/sidecar: `frontend_jarvis`',
        'edit renderer/main/sidecar behavior quickly',
        'Electron main, sidecar process',
        'Electron main, sidecar, packaged app',
        'desktop/sidecar traffic',
        'owning main/renderer/sidecar tests',
        'Current exhaustive frontend functionality inventory across Electron main, preload bridge, renderer runtime, and Python sidecar services.',
        'When auditing frontend behavior ownership across main/renderer/sidecar.',
        'backend, Electron main, renderer, preload, and sidecar boundaries',
        'hosted auth, IPC isolation, validation, credentials, tools, and sidecar boundaries',
        'sidecar parity when executable fields change',
        'prepared sidecar arguments',
        'web_search` is backend-owned and does not participate in sidecar parity tests',
        'sidecar parity tests |',
        'frontend implementation details across Electron main process, React renderer, and Python sidecar runtime',
        '| Python sidecar | Local JSON-RPC',
        'Python sidecar executable implementations',
        'Python sidecar executors',
        'Sidecar executable tools',
        'sidecar executable manifest evidence',
        'Python sidecar executable owner',
        '| Sidecar executor |',
        'expected by the sidecar exists',
        'Add Python sidecar executable registration',
        'Python sidecar runtime bug',
        'Python sidecar says tool not found',
        'Python sidecar registry/schema/runtime',
        'Python sidecar startup owns local execution variables',
        'sidecar stderr logging or system metrics',
        '| Python sidecar runtime |',
        'The sidecar owns host OS automation',
        'The sidecar owns host-window discovery',
        'The sidecar owns local-machine actions',
        'The Python sidecar owns host OS automation',
        'The Python sidecar owns host-window discovery',
        'Python sidecar owns method registration',
        'Python sidecar owns local authority',
        'Python sidecar owns local execution',
        'The sidecar owns local episodic',
        'The sidecar owns local SQLite/FAISS',
        'The sidecar owns what can actually run locally',
        '| sidecar env should change from a setting',
        'Electron frontend, renderer, preload',
        'split across backend, frontend, and sidecar',
        'without the Electron frontend',
        'run the Electron frontend',
        'SDK/Electron frontend sends',
        'SDK/main dispatches executable tool calls through Electron main to the sidecar',
        'Local execution belongs in renderer/Electron/sidecar code',
        'ipc.cjs keeps backend transport and frontend session state',
        'sidecar owns local execution + memory/runtime dependency bootstrap',
        'sidecar owns execution',
        'sidecar-owned hosted helper services',
        'sidecar-owned source topology map',
        'sidecar-owned diagnostic/execution shape',
        'sidecar runtime tool',
        'Sidecar owner',
        'Wakeword sidecar service',
        'If sidecar-owned, inspect sidecar launch env or JSON-RPC action path',
        'sidecar-owned config fields',
        'Local sidecar JSON-RPC host',
        'Sidecar core remote clients',
        'Sidecar local runtime',
        'Sidecar wakeword service',
        'Sidecar request dispatch',
        'Sidecar tool execution',
        '| Sidecar runtime core |',
        '| Sidecar tool runtime |',
        'sidecar `tools/schemas.py`',
        'sidecar browser adapter/runtime',
        'sidecar-owned schema/result adapters',
        'sidecar-owned MCP discovery',
        'sidecar-owned SDK/local-runtime MCP registration',
        'sidecar-owned MCP `tools/call` execution',
        'SDK/sidecar local runtime',
        'The sidecar starts each enabled MCP server',
        'The sidecar sends MCP',
        'The sidecar calls `tools/list`',
        'executable sidecar local tools',
        'routes it to the sidecar',
        'The sidecar sends MCP `tools/call`',
        'backend bridge logic',
        'Tool runtime services',
        'Tool execution stack',
        'tool execution and capture',
        'Tool execution bundling, payload normalization, capture orchestration',
        'sidecar direct-tool exposure contract used for backend parity',
        'live sidecar registry exposes concrete tool names only',
        'Sidecar tools are not permission-gated by default',
        'Sidecar tool result failures',
        'Sidecar tools should return',
        'sidecar tools should return',
        'Sidecar Runtime and Tool Domains',
        'Sidecar tool catalog',
        'Change sidecar tool failure behavior',
        'Tool call hangs after sidecar failure',
        'sidecar tool or backend tool-result ingress',
        'generic sidecar tool channel',
        'sidecar tool screenshots',
        'Sidecar computer tools:',
        'model-visible sidecar tool',
        'If a Python sidecar tool cannot execute a visible tool',
        'the Python sidecar execute another',
        '| Python sidecar executed but model never continued |',
        'backend tool-turn tests, SDK coordinator/runtime tests, main IPC tool-router tests, Python sidecar tool tests',
        '| sidecar tool |',
        'backend browser schema tests plus sidecar browser tests',
        'Frontend/sidecar conda env name',
        'backend, renderer, and sidecar implementation',
        'backend, renderer, and sidecar runtimes run from the checkout',
        'SDK sidecar outputs',
        'invoking the sidecar without a result id',
        'Python sidecar says missing tool',
        '| Python sidecar succeeds but model never sees result |',
        'SDK-owned local tool dispatch, sidecar routing',
        'Sidecar browser runtime and Electron session UI',
        'sidecar screenshot/input',
        '| Sidecar local tools,',
        'Sidecar Registry and Result Contract',
        'Sidecar Computer Runtime',
        'SDK-owned sidecar daemon lifecycle',
        'sidecar call forwarding',
        'built-in Python sidecar tool behavior',
        'sidecar tools docs for built-in',
        'Check sidecar `ToolRegistry.execute_tool`',
        '| Packaged app, sidecar runtime,',
        'Electron packaging, sidecar bundling',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});

    const codeSurfaceIndexText = await read('docs/reference/code_change_surface_index.md');
    expect(codeSurfaceIndexText).toContain('SDK-owned local-runtime daemon lifecycle');
    expect(codeSurfaceIndexText).toContain('Electron packaging, local-runtime sidecar bundling');
  });

  test('voice routing docs use renderer and electron owner labels', async () => {
    const docs = await Promise.all([
      read('docs/channels/voice_audio_change_workflow.md'),
      read('docs/channels/voice_and_audio_channels.md'),
      read('docs/desktop/voice_and_wakeword.md'),
      read('docs/getting-started/docs_hub.md'),
      read('docs/nodes/runtime_node_matrix.md'),
      read('docs/README.md'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('Renderer Voice Capture');
    expect(docText).toContain('Electron Wakeword Bridge');
    expect(docText).toContain('local-runtime wakeword helper');
    expect(docText).not.toContain('Frontend Voice Capture');
    expect(docText).not.toContain('Frontend Wakeword Bridge');
    expect(docText).not.toContain('Sidecar wakeword service');
    expect(docText).not.toContain('Python sidecar owns wakeword model bootstrap');
    expect(docText).not.toContain('Electron bridge to the sidecar wakeword service');
    expect(docText).not.toContain('renderer microphone chunks -> Electron main -> Python sidecar wakeword service');
    expect(docText).not.toContain('Sidecar wakeword service:');
  });
});
