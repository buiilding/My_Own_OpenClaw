/** @jest-environment node */

const path = require('path');
const { findDocs, loadDocsIndex } = require('../../scripts/windie/docs.cjs');

const repoRoot = path.resolve(__dirname, '../..');

describe('windie docs index', () => {
  test('resolves the canonical README page to docs/README.md', () => {
    const docs = loadDocsIndex();
    const readme = docs.find((doc) => doc.page === 'README');

    expect(readme).toMatchObject({
      page: 'README',
      path: path.join('docs', 'README.md'),
    });
    expect(path.join(repoRoot, readme.path)).toBe(path.join(repoRoot, 'docs', 'README.md'));
  });

  test('returns the top ten docs matches by default', () => {
    expect(findDocs('runtime')).toHaveLength(10);
  });

  test('prioritizes provider model catalog docs over broad sidecar catalog matches', () => {
    const matches = findDocs('model catalog');
    const paths = matches.map((match) => match.path);

    expect(paths.indexOf(path.join('docs', 'providers', 'model_catalog_change_workflow.md'))).toBe(
      0,
    );
    const sidecarCatalogIndex = paths.indexOf(
      path.join('docs', 'frontend', 'sidecar', 'tool_catalog_and_execution_model.md'),
    );
    if (sidecarCatalogIndex !== -1) {
      expect(sidecarCatalogIndex).toBeGreaterThan(0);
    }
  });

  test('uses headings so MCP result contract queries find the MCP runtime first', () => {
    const matches = findDocs('mcp tool result');

    expect(matches[0]).toMatchObject({
      path: path.join('docs', 'development', 'mcp.md'),
      title: 'MCP Runtime',
    });
  });

  test('routes MCP server config queries to the MCP runtime guide', () => {
    expect(findDocs('MCP server config')[0].path).toBe(
      path.join('docs', 'development', 'mcp.md'),
    );
  });

  test('keeps current workflow docs ahead of historical plans for feature queries', () => {
    const paths = findDocs('workspace context')
      .slice(0, 3)
      .map((match) => match.path);

    expect(paths).toContain(
      path.join('docs', 'frontend', 'runtime', 'workspace_context_change_workflow.md'),
    );
    expect(paths.some((docPath) => docPath.includes(`${path.sep}refactors${path.sep}`))).toBe(
      false,
    );
  });

  test('prioritizes docs search workflow over screen-grounding docs for docs-search queries', () => {
    const matches = findDocs('docs search grounding');

    expect(matches[0]).toMatchObject({
      path: path.join('docs', 'development', 'docs_update_workflow.md'),
      title: 'Docs Update Workflow',
    });
  });

  test('prioritizes runtime ownership routing for cleanup queries', () => {
    const matches = findDocs('runtime ownership cleanup');

    expect(matches[0]).toMatchObject({
      path: path.join(
        'docs',
        'development',
        'agent_runtime_ownership_and_change_routing.md',
      ),
      title: 'Agent Runtime Ownership and Change Routing',
    });
  });

  test('prioritizes current extension hub over ADRs for generic extension queries', () => {
    const matches = findDocs('extension');

    expect(matches[0]).toMatchObject({
      path: path.join('docs', 'plugins', 'README.md'),
      title: 'Plugins and Extensions Hub',
    });
  });

  test('keeps ADRs discoverable for decision-record queries', () => {
    const matches = findDocs('adr browser extension auto attach');

    expect(matches[0]).toMatchObject({
      path: path.join('docs', 'adr', '004-browser-extension-auto-attach.md'),
      title: 'ADR 004: Browser Extension Auto-Attach Boundary',
    });
  });

  test('routes packaged SDK websocket dependency queries to packaging docs', () => {
    const paths = findDocs('packaged sdk websocket')
      .slice(0, 3)
      .map((match) => match.path);

    expect(paths).toContain(path.join('docs', 'operations', 'sidecar_runtime_packaging.md'));
    expect(paths).toContain(
      path.join('docs', 'operations', 'packaging_and_reinstall_runbooks.md'),
    );
  });

  test('routes removed packaged endpoint alias queries to endpoint runtime docs', () => {
    const expectedPath = path.join('docs', 'frontend', 'main', 'runtime_paths_and_endpoints.md');

    expect(findDocs('removed packaged backend endpoint aliases')[0].path).toBe(expectedPath);
    expect(findDocs('WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL')[0].path).toBe(expectedPath);
  });

  test('routes removed search-memory RPC queries to local backend JSON-RPC docs', () => {
    const expectedPath = path.join('docs', 'frontend', 'sidecar', 'local_backend_jsonrpc_reference.md');

    expect(findDocs('removed search-memory text query')[0].path).toBe(expectedPath);
    expect(findDocs('search_memory text-query RPC removed')[0].path).toBe(expectedPath);
  });

  test('routes frontend protocol channel count queries to the IPC matrix', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'inventory',
      'protocols',
      'frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md',
    );

    expect(
      findDocs('frontend protocol channel counts windie invoke get local backend status')[0].path,
    ).toBe(expectedPath);
    expect(findDocs('renderer invoke channels compiled rpc mapper definitions')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed raw backend IPC channel queries to typed event fan-out docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'contracts',
      'events',
      'from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md',
    );

    expect(findDocs('to-backend from-backend preload channels removed')[0].path).toBe(expectedPath);
  });

  test('routes settings ACK event queries to settings event routing docs', () => {
    expect(findDocs('backend settings event models listed settings updated')[0].path).toBe(
      path.join(
        'docs',
        'frontend',
        'contracts',
        'events',
        'settings_and_model_ack_event_routing_reference.md',
      ),
    );
  });

  test('routes preload allowlist queries to the preload bridge reference', () => {
    expect(findDocs('preload channel allowlist renderer bridge windie invoke')[0].path).toBe(
      path.join(
        'docs',
        'frontend',
        'preload',
        'preload_channel_allowlist_and_renderer_bridge_reference.md',
      ),
    );
  });

  test('routes IPC handler mapper queries to the IPC channel reference', () => {
    expect(
      findDocs('ipc channel handler mapped JSON-RPC clear chat history revision')[0].path,
    ).toBe(
      path.join('docs', 'frontend', 'contracts', 'ipc_channel_and_handler_reference.md'),
    );
  });

  test('routes memory bridge mapping queries to the memory IPC reference', () => {
    expect(
      findDocs('memory ipc rpc mapping clear chat history replace conversation revision')[0].path,
    ).toBe(
      path.join('docs', 'frontend', 'contracts', 'memory_ipc_and_rpc_mapping_reference.md'),
    );
  });

  test('routes agent-definition tool manifest handshake queries to SDK docs', () => {
    const expectedPath = path.join('docs', 'sdk', 'agent_definition.md');

    expect(findDocs('agent capability handshake client tool manifest')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('client tool manifest agent definition handshake')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('frontend tool schemas planned post handshake')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('agent_capability_handshake.cjs removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('AgentCapabilityHandshake test removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes package and reinstall queries to the cross-platform runbook', () => {
    expect(findDocs('packaging reinstall')[0].path).toBe(
      path.join('docs', 'operations', 'packaging_and_reinstall_runbooks.md'),
    );
    expect(findDocs('packaging reinstall runbook')[0].path).toBe(
      path.join('docs', 'operations', 'packaging_and_reinstall_runbooks.md'),
    );
  });

  test('routes local hosted query routing to the SDK runtime contract', () => {
    expect(findDocs('local hosted query routing')[0].path).toBe(
      path.join('docs', 'sdk', 'windie_client_runtime.md'),
    );
  });

  test('routes SDK builtins wake option queries to the WindieClient runtime contract', () => {
    const expectedPath = path.join('docs', 'sdk', 'windie_client_runtime.md');

    expect(findDocs('builtinTools wake guard')[0].path).toBe(expectedPath);
    expect(findDocs('SDK builtins wakeUp option')[0].path).toBe(expectedPath);
    expect(findDocs('builtinTools removed')[0].path).toBe(expectedPath);
  });

  test('routes install auth queries to the credential workflow', () => {
    expect(findDocs('install auth')[0].path).toBe(
      path.join('docs', 'security', 'credential_token_change_workflow.md'),
    );
  });

  test('routes desktop logs queries to the logging guide', () => {
    expect(findDocs('desktop logs')[0].path).toBe(
      path.join('docs', 'debug', 'logging.md'),
    );
  });

  test('routes sidecar episodic semantic memory queries to local memory docs', () => {
    expect(findDocs('sidecar episodic semantic memory')[0].path).toBe(
      path.join('docs', 'memory', 'sidecar_local_memory.md'),
    );
  });

  test('routes OCR vision queries to the runtime overview', () => {
    expect(findDocs('OCR vision')[0].path).toBe(
      path.join('docs', 'backend', 'services', 'ocr_and_vision_coordinate_runtime_reference.md'),
    );
  });

  test('routes browser use tool queries to the browser tool guide', () => {
    expect(findDocs('browser use tool')[0].path).toBe(
      path.join('docs', 'tools', 'browser.md'),
    );
  });

  test('routes live turn projection queries to the SDK conversation runtime', () => {
    expect(findDocs('live turn projection')[0].path).toBe(
      path.join('docs', 'sdk', 'conversation_runtime.md'),
    );
  });

  test('routes prompt compilation queries to prompt context docs', () => {
    expect(findDocs('prompt compilation')[0].path).toBe(
      path.join('docs', 'concepts', 'prompt_and_tool_context.md'),
    );
  });

  test('routes desktop shell queries to the desktop surfaces hub', () => {
    expect(findDocs('desktop shell')[0].path).toBe(
      path.join('docs', 'desktop', 'README.md'),
    );
  });

  test('routes hosted backend health queries to the gateway auth runbook', () => {
    expect(findDocs('hosted backend health')[0].path).toBe(
      path.join('docs', 'gateway', 'gateway_auth_and_health_runbook.md'),
    );
  });

  test('routes VM worker run control queries to the automation workflow', () => {
    expect(findDocs('vm worker run control')[0].path).toBe(
      path.join('docs', 'automation', 'vm_run_control_change_workflow.md'),
    );
  });

  test('routes transcription stream queries to voice channel docs', () => {
    expect(findDocs('transcription stream')[0].path).toBe(
      path.join('docs', 'channels', 'voice_and_audio_channels.md'),
    );
  });

  test('routes computer-use screenshot queries to the computer tool guide', () => {
    expect(findDocs('computer use screenshot')[0].path).toBe(
      path.join('docs', 'tools', 'computer.md'),
    );
  });

  test('routes voice audio capture processor queries to the voice utility reference', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'voice',
      'utils',
      'audio_encoding_chunk_normalization_and_capture_cleanup_reference.md',
    );

    expect(findDocs('AudioWorklet required capture processor')[0].path).toBe(expectedPath);
    expect(findDocs('AudioWorklet capture processor unavailable')[0].path).toBe(expectedPath);
    expect(findDocs('ScriptProcessor fallback voice capture removed')[0].path).toBe(expectedPath);
    expect(findDocs('processorNodeRef cleanup')[0].path).toBe(expectedPath);
  });

  test('routes settings model selection queries to the model settings workflow', () => {
    expect(findDocs('settings model selection')[0].path).toBe(
      path.join('docs', 'frontend', 'renderer', 'settings', 'model_settings_change_workflow.md'),
    );
  });

  test('routes stop button queries to the ChatInterface control reference', () => {
    expect(findDocs('stop button')[0].path).toBe(
      path.join(
        'docs',
        'frontend',
        'renderer',
        'chat',
        'chat_interface_header_controls_model_selection_and_compaction_rehydrate_reference.md',
      ),
    );
  });

  test('routes browser session readiness queries to the browser workflow', () => {
    expect(findDocs('browser session readiness')[0].path).toBe(
      path.join('docs', 'browser', 'browser_change_workflow.md'),
    );
  });

  test('routes workspace folder permission queries to the workspace workflow', () => {
    expect(findDocs('workspace folder permission')[0].path).toBe(
      path.join('docs', 'frontend', 'runtime', 'workspace_context_change_workflow.md'),
    );
  });

  test('routes CLI diagnostics and conversation commands to the command matrix', () => {
    const commandDocs = new Set([
      path.join('docs', 'cli', 'README.md'),
      path.join('docs', 'cli', 'command_matrix.md'),
    ]);

    for (const query of [
      'diagnostics inspect',
      'conversation messages',
      'capability trace',
      'logs renderer verbose',
      'windie command help',
    ]) {
      expect(commandDocs.has(findDocs(query)[0].path)).toBe(true);
    }
  });

  test('routes shell sudo pkexec queries to filesystem shell docs', () => {
    const paths = findDocs('run shell sudo pkexec')
      .slice(0, 4)
      .map((match) => match.path);

    expect(paths).toContain(path.join('docs', 'tools', 'filesystem_shell.md'));
  });

  test('routes removed sudo auth-mode compatibility queries to filesystem shell docs', () => {
    const expectedPath = path.join('docs', 'tools', 'filesystem_shell.md');

    expect(findDocs('agent_sudo_access_handler removed')[0].path).toBe(expectedPath);
    expect(findDocs('AgentSudoAccessHandler.test.cjs removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('sudo auth mode compatibility path removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes replace legacy field guard queries to sidecar filesystem docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'sidecar',
      'tools',
      'filesystem_read_replace_runtime_reference.md',
    );

    expect(findDocs('replace legacy field guard')[0].path).toBe(expectedPath);
    expect(findDocs('replace old_string new_string top-level')[0].path).toBe(expectedPath);
    expect(findDocs('canonical replacements edit mode')[0].path).toBe(expectedPath);
  });

  test('routes retired sudo setting queries to current owner docs', () => {
    expect(findDocs('agent sudo access')[0].path).toBe(
      path.join('docs', 'frontend', 'renderer', 'settings', 'settings_surface_change_workflow.md'),
    );
    expect(findDocs('sudo auth mode')[0].path).toBe(
      path.join('docs', 'tools', 'filesystem_shell.md'),
    );
    expect(findDocs('permission sudo ipc')[0].path).toBe(
      path.join('docs', 'frontend', 'contracts', 'ipc_channel_and_handler_reference.md'),
    );
  });

  test('routes global stop shortcut queries to the shortcut runtime reference', () => {
    expect(findDocs('global stop shortcut')[0].path).toBe(
      path.join('docs', 'frontend', 'main', 'global_stop_shortcut_runtime_reference.md'),
    );
  });

  test('routes web search tool queries to the backend-owned tool guide', () => {
    expect(findDocs('web search tool')[0].path).toBe(
      path.join('docs', 'tools', 'web_search.md'),
    );
  });

  test('routes replay ordinal fallback queries to transcript replay docs', () => {
    expect(findDocs('replay ordinal fallback')[0].path).toBe(
      path.join('docs', 'memory', 'transcript_replay_change_workflow.md'),
    );
  });

  test('routes tool result history queries to the history commit boundary', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'agent',
      'history',
      'history_committer_and_result_processor_boundary_reference.md',
    );

    expect(findDocs('tool result history')[0].path).toBe(expectedPath);
    expect(findDocs('tool result history rows')[0].path).toBe(expectedPath);
  });

  test('routes provider choice text completion fallback queries to LLM provider parsing docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'llm',
      'providers',
      'base_request_stream_and_normalization_reference.md',
    );

    expect(findDocs('choice text completion fallback')[0].path).toBe(expectedPath);
    expect(findDocs('OpenAI choice text fallback')[0].path).toBe(expectedPath);
    expect(findDocs('completion fallback choice text')[0].path).toBe(expectedPath);
  });

  test('routes ToolCallSchema wrapper-removal queries to parser extraction docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'llm',
      'tool_call_schema_extraction_reference.md',
    );

    expect(findDocs('ToolCallSchema unified wrapper normalization')[0].path).toBe(expectedPath);
    expect(findDocs('parser path unified wrapper')[0].path).toBe(expectedPath);
    expect(findDocs('metadata promotion boundary ToolCallSchema')[0].path).toBe(expectedPath);
  });

  test('routes plugin tool registration queries to the extension convention', () => {
    expect(findDocs('plugin tool registration')[0].path).toBe(
      path.join('docs', 'development', 'extensions.md'),
    );
  });

  test('routes edit resend resource preservation queries to SDK conversation runtime', () => {
    expect(findDocs('edit resend resource preservation')[0].path).toBe(
      path.join('docs', 'sdk', 'conversation_runtime.md'),
    );
  });

  test('routes SDK tool output content fallback queries to conversation runtime', () => {
    const expectedPath = path.join('docs', 'sdk', 'conversation_runtime.md');

    expect(findDocs('tool output content fallback')[0].path).toBe(expectedPath);
    expect(findDocs('assistant-shaped content')[0].path).toBe(expectedPath);
    expect(findDocs('final_response fallback tool output')[0].path).toBe(expectedPath);
  });

  test('routes renderer screenshot metadata queries to the screenshot state reference', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'transcript',
      'screenshot_message_state_and_sdk_projection_reference.md',
    );

    expect(findDocs('screenshot artifact inference')[0].path).toBe(expectedPath);
    expect(findDocs('screenshotRef screenshotUrl')[0].path).toBe(expectedPath);
    expect(findDocs('sdk display screenshot projection')[0].path).toBe(expectedPath);
  });

  test('routes renderer backend transport command-shape queries to the transport contract', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'desktop_backend_transport_command_contract_reference.md',
    );

    expect(findDocs('camelCase query payload')[0].path).toBe(expectedPath);
    expect(findDocs('snake_case command contract')[0].path).toBe(expectedPath);
    expect(findDocs('DesktopBackendTransport')[0].path).toBe(expectedPath);
  });

  test('routes dashboard stylesheet queries to the current renderer style contract', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'styles',
      'global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md',
    );

    expect(findDocs('DashboardShell css CloneMemoryModels FrontendOnboarding')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('ChatGptDashboardShell css removed')[0].path).toBe(expectedPath);
  });

  test('routes SDK websocket typing queries to the WindieClient runtime contract', () => {
    const expectedPath = path.join('docs', 'sdk', 'windie_client_runtime.md');

    expect(findDocs('SDK websocket ws ambient declaration')[0].path).toBe(expectedPath);
    expect(findDocs('WebSocketLike WebSocketConstructor ws package')[0].path).toBe(expectedPath);
  });

  test('routes removed current-turn projector queries to the SDK conversation runtime', () => {
    const expectedPath = path.join('docs', 'sdk', 'conversation_runtime.md');

    expect(findDocs('standalone current turn projector')[0].path).toBe(expectedPath);
    expect(findDocs('currentTurnProjection.ts conversationProjections')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes frontend tool manifest builder queries to tool contracts', () => {
    const expectedPath = path.join('docs', 'tools', 'tool_contracts.md');

    expect(findDocs('tool manifest name list export')[0].path).toBe(expectedPath);
    expect(findDocs('frontend tool manifest builder buildClientToolManifest')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed Electron tool router queries to tool execution lifecycle docs', () => {
    const expectedPath = path.join('docs', 'tools', 'tool_execution_lifecycle.md');

    expect(findDocs('stale cjs tool event router artifact')[0].path).toBe(expectedPath);
    expect(findDocs('Electron tool event router cjs removed')[0].path).toBe(expectedPath);
  });

  test('routes removed dev tool selection config queries to agent capability policy docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'tools',
      'policy',
      'tool_policy_and_agent_capability_runtime_reference.md',
    );

    expect(findDocs('WINDIEOS_DEV_TOOL_SELECTION_PATH')[0].path).toBe(expectedPath);
    expect(findDocs('backend dev tool_selection toml removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed renderer capture helper queries to capture payload docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'infrastructure',
      'capture_artifact_upload_and_payload_normalization_reference.md',
    );

    expect(findDocs('ArtifactUploader renderer upload deleted')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('ToolScreenshotDebugTrace renderer deleted')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('ScreenshotAttachmentPipeline deleted')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('CapturePayloadUtils deleted')[0].path).toBe(expectedPath);
    expect(findDocs('MessageFormatter deleted')[0].path).toBe(expectedPath);
  });
});
