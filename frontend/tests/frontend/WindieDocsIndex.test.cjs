/** @jest-environment node */

const fs = require('fs');
const path = require('path');
const { findDocs, loadDocsIndex } = require('../../scripts/windie/docs.cjs');

const repoRoot = path.resolve(__dirname, '../..');

function listMarkdownDocs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    const repoPath = path.relative(repoRoot, fullPath);
    if (entry.isDirectory()) {
      if (repoPath === path.join('docs', 'plans') || repoPath === path.join('docs', 'refactors')) {
        return [];
      }
      return listMarkdownDocs(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [repoPath] : [];
  });
}

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

  test('keeps cached docs metadata private from public index callers', () => {
    const docs = loadDocsIndex();
    const originalTitle = docs[0].title;

    docs[0].title = 'mutated by caller';

    expect(loadDocsIndex()[0].title).toBe(originalTitle);
  });

  test('returns the top ten docs matches by default', () => {
    expect(findDocs('runtime')).toHaveLength(10);
  });

  test('current docs pages do not contain broken relative markdown links', () => {
    const brokenLinks = [];
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

    for (const docPath of listMarkdownDocs(path.join(repoRoot, 'docs'))) {
      const content = fs.readFileSync(path.join(repoRoot, docPath), 'utf8');
      let match;
      while ((match = linkPattern.exec(content))) {
        let href = match[1].trim();
        if (
          !href ||
          href.startsWith('#') ||
          href.startsWith('http:') ||
          href.startsWith('https:') ||
          href.startsWith('mailto:')
        ) {
          continue;
        }

        href = href.split('#')[0];
        if (!href || /[{}*$]/.test(href)) {
          continue;
        }
        if (href.startsWith('<') && href.endsWith('>')) {
          href = href.slice(1, -1);
        }

        const targetPath = path.normalize(path.join(repoRoot, path.dirname(docPath), href));
        if (!fs.existsSync(targetPath)) {
          brokenLinks.push(`${docPath}: ${match[1]} -> ${path.relative(repoRoot, targetPath)}`);
        }
      }
    }

    expect(brokenLinks).toEqual([]);
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

  test('routes removed core tool protocol queries to core and SDK docs', () => {
    const corePath = path.join('docs', 'backend', 'core', 'interfaces', 'README.md');
    const sdkPath = path.join(
      'docs',
      'backend',
      'sdk',
      'tool_context_and_schema_contract_reference.md',
    );

    expect(findDocs('Tool interface TypeVar removed')[0].path).toBe(corePath);
    expect(findDocs('ToolInterface removed core tool protocol')[0].path).toBe(
      corePath,
    );
    expect(findDocs('Tool abstract base protocol removed')[0].path).toBe(
      sdkPath,
    );
    expect(findDocs('Kind ToolContext ToolInterface exports removed')[0].path).toBe(
      corePath,
    );
  });

  test('routes backend core interface tool-result queries to core docs', () => {
    expect(findDocs('backend core interfaces tool class removed')[0].path).toBe(
      path.join('docs', 'backend', 'core', 'interfaces', 'README.md'),
    );
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

  test('routes removed search-memory RPC queries to current memory boundary docs', () => {
    const jsonRpcPath = path.join('docs', 'frontend', 'sidecar', 'local_backend_jsonrpc_reference.md');
    const mapperPath = path.join(
      'docs',
      'frontend',
      'contracts',
      'memory_ipc_and_rpc_mapping_reference.md',
    );

    expect(findDocs('removed search-memory text query')[0].path).toBe(jsonRpcPath);
    expect(findDocs('search_memory text-query RPC removed')[0].path).toBe(mapperPath);
  });

  test('routes frontend protocol channel count and mapper queries to current IPC docs', () => {
    const matrixPath = path.join(
      'docs',
      'frontend',
      'inventory',
      'protocols',
      'frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md',
    );
    const mapperPath = path.join(
      'docs',
      'frontend',
      'contracts',
      'ipc',
      'main_process_ipc_handler_ownership_and_rpc_mapper_reference.md',
    );

    expect(
      findDocs('frontend protocol channel counts windie invoke get local backend status')[0].path,
    ).toBe(matrixPath);
    expect(findDocs('renderer invoke channels compiled rpc mapper definitions')[0].path).toBe(
      mapperPath,
    );
  });

  test('routes removed backend-wire IPC channel queries to typed event fan-out docs', () => {
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

  test('routes typed response formatter dispatch queries to backend formatter docs', () => {
    const registryPath = path.join(
      'docs',
      'backend',
      'api',
      'processing',
      'formatters',
      'registry',
      'response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md',
    );
    const dispatchPath = path.join(
      'docs',
      'backend',
      'api',
      'processing',
      'formatter_dispatch_and_schema_alignment_reference.md',
    );
    const runtimePath = path.join(
      'docs',
      'backend',
      'runtime',
      'query_execution_and_stream_pipeline_reference.md',
    );

    expect(findDocs('response formatter event type dispatch map removed')[0].path).toBe(
      dispatchPath,
    );
    expect(
      findDocs('response formatter registry typed only event type uniqueness set')[0].path,
    ).toBe(registryPath);
    expect(findDocs('formatter dict dispatch compatibility removed')[0].path).toBe(
      dispatchPath,
    );
    expect(
      findDocs('query execution stream pipeline typed response formatter dispatch')[0].path,
    ).toBe(runtimePath);
    expect(
      findDocs('EventFormatter _get_event_dict dict input StreamingEvent.to_dict formatter conversion removed')[0].path,
    ).toBe(
      path.join(
        'docs',
        'backend',
        'api',
        'processing',
        'formatters',
        'base_formatter_guard_utilities_and_skip_semantics_reference.md',
      ),
    );
    expect(
      findDocs('tool bundle formatter typed dict parity removed StreamingEvent.to_dict')[0].path,
    ).toBe(
      path.join(
        'docs',
        'backend',
        'api',
        'processing',
        'formatters',
        'actions',
        'tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md',
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

  test('routes private IPC registry validator queries to the preload parity reference', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'contracts',
      'ipc',
      'preload_allowlist_and_channel_constant_parity_reference.md',
    );

    expect(findDocs('validateIpcHandlerRegistration removed export')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('EXPECTED_SHARED_CHANNEL_REGISTRY private renderer IPC validator')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes memory bridge mapping queries to the memory IPC reference', () => {
    expect(
      findDocs('memory ipc rpc mapping clear chat history replace conversation revision')[0].path,
    ).toBe(
      path.join('docs', 'frontend', 'contracts', 'memory_ipc_and_rpc_mapping_reference.md'),
    );
  });

  test('routes history read-model queries to the history DB UI reference', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'sidecar',
      'memory',
      'storage',
      'history_db_ui_read_model_reference.md',
    );

    expect(findDocs('conversation_display_messages compatibility view removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('history db conversation_display_messages read model')[0].path).toBe(
      expectedPath,
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
    expect(findDocs('client_tool_manifest handshake fallback removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('top-level client_tool_manifest removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('client tool schemas planned post handshake')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('agent_capability_handshake.cjs removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('AgentCapabilityHandshake test removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('buildAgentDefinition SDK builder capability metadata')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('packages/windie-sdk-js/src/runtime/AgentDefinition.ts')[0].path).toBe(
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

  test('routes removed container initializer wrapper queries to bootstrap docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'bootstrap',
      'container_di_and_init_lifecycle_reference.md',
    );

    expect(findDocs('container initializer service wrapper removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('_initialize_vision_service removed startup step')[0].path).toBe(
      expectedPath,
    );
    expect(
      findDocs(
        '_initialize_ocr_service removed ContainerInitializer service wrapper _run_startup_step',
      )[0].path,
    ).toBe(expectedPath);
  });

  test('routes stale session OCR constructor queries to session runtime docs', () => {
    expect(
      findDocs('AgentSession ocr_service constructor removed ocr_router session_factory')[0].path,
    ).toBe(path.join('docs', 'backend', 'agent', 'session_runtime_and_config_rewire_reference.md'));
  });

  test('routes removed ContextFactory OCR service alias queries to tool context docs', () => {
    expect(
      findDocs('ContextFactory set_ocr_service removed ocr_router tool context service keys')[0].path,
    ).toBe(path.join('docs', 'backend', 'sdk', 'tool_context_and_schema_contract_reference.md'));
  });

  test('routes removed Kimi provider alias queries to Kimi provider docs', () => {
    expect(findDocs('kimi_code provider alias rejected')[0].path).toBe(
      path.join('docs', 'providers', 'kimi_coding.md'),
    );
  });

  test('routes local hosted query routing to the SDK runtime contract', () => {
    expect(findDocs('local hosted query routing')[0].path).toBe(
      path.join('docs', 'sdk', 'windie_client_runtime.md'),
    );
  });

  test('routes camelCase sidecar discovery metadata to the daemon runtime contract', () => {
    expect(findDocs('baseUrl discovery metadata rejected')[0].path).toBe(
      path.join('docs', 'frontend', 'sidecar', 'sidecar_daemon_runtime_reference.md'),
    );
  });

  test('routes Python SDK camelCase tool payload queries to the SDK runtime contract', () => {
    expect(findDocs('Python SDK camelCase toolName requestId bundleId payload ignored')[0].path).toBe(
      path.join('docs', 'sdk', 'windie_client_runtime.md'),
    );
  });

  test('routes SDK-shaped local tool coordinator payload queries to conversation runtime', () => {
    expect(findDocs('ToolExecutionCoordinator SDK-shaped toolName requestId bundleId')[0].path).toBe(
      path.join('docs', 'sdk', 'conversation_runtime.md'),
    );
  });

  test('routes SDK builtins wake option queries to the AgentClient runtime contract', () => {
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

  test('routes app diagnostics inspection helper queries to runtime traces', () => {
    const expectedPath = path.join('docs', 'debug', 'runtime_traces.md');

    expect(findDocs('queryDiagnosticEvents app diagnostics CLI inspection')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('inspectDiagnosticTrace diagnosticsDatabasePath appUserDataRoot')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('listDiagnosticPathDefinitions diagnostic paths')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes one-message runtime trace playbook queries to runtime traces', () => {
    const expectedPath = path.join('docs', 'debug', 'runtime_traces.md');

    expect(
      findDocs('one message trace playbook renderer action SDK projection local-runtime tool execution')[0].path,
    ).toBe(expectedPath);
    expect(
      findDocs('debug one user message ipc bridge backend stream renderer display')[0].path,
    ).toBe(expectedPath);
  });

  test('routes layer log sink helper queries to the logging guide', () => {
    const expectedPath = path.join('docs', 'debug', 'logging.md');

    expect(findDocs('ensureLogFile layer log sink CLI')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('resolveRendererVerboseLogFile renderer verbose log')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('layer log sink helpers renderer verbose')[0].path).toBe(
      expectedPath,
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

  test('routes renderer projection annotation merge queries to chat stream docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'chat_stream_and_tool_execution_reference.md',
    );

    expect(findDocs('mergeRendererAnnotations removed export')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('projection annotation merge private optimistic user rows')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes renderer tool-schema list helper queries to transparency docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'chat',
      'payloads',
      'tool_call_output_and_transparency_section_rendering_reference.md',
    );

    expect(findDocs('isSupportedToolSchemaList removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('normalizeToolSchemaList flat function schema transparency')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes renderer deprecated browser API queries to current owner docs', () => {
    expect(findDocs('navigator.platform deprecated renderer trace')[0].path).toBe(
      path.join('docs', 'debug', 'runtime_traces.md'),
    );
    expect(findDocs('document.createElement deprecated markdown DOMParser')[0].path).toBe(
      path.join(
        'docs',
        'frontend',
        'renderer',
        'chat',
        'payloads',
        'tool_call_output_and_transparency_section_rendering_reference.md',
      ),
    );
  });

  test('routes removed frontend dead-symbol queries to current owner docs', () => {
    expect(findDocs('getLatestFrontendConfig createMainWindow removed')[0].path).toBe(
      path.join(
        'docs',
        'frontend',
        'main',
        'main_window_runtime_factory_and_overlay_bootstrap_reference.md',
      ),
    );
    expect(findDocs('getLatestDesktopUiConfig createMainWindow removed')[0].path).toBe(
      path.join(
        'docs',
        'frontend',
        'main',
        'main_window_runtime_factory_and_overlay_bootstrap_reference.md',
      ),
    );
    expect(findDocs('createConversationEvent desktopConversationStore removed')[0].path).toBe(
      path.join('docs', 'frontend', 'renderer', 'transcript_session_and_rehydrate_reference.md'),
    );
  });

  test('routes removed response overlay preflight IPC queries to current IPC docs', () => {
    expect(findDocs('ipc_response_overlay_handlers.cjs removed')[0].path).toBe(
      path.join('docs', 'frontend', 'main', 'ipc_helper_module_split_and_runtime_boundary_reference.md'),
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

  test('routes removed system-state bridge export queries to system-state docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'sidecar',
      'system_state',
      'system_state_collection_and_platform_adapter_reference.md',
    );
    const bridgePath = path.join(
      'docs',
      'frontend',
      'main',
      'local_runtime_bridge_handler_and_window_guard_reference.md',
    );

    expect(findDocs('system state bridge export removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('getSystemState export removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('local_runtime_bridge.getSystemState removed')[0].path).toBe(
      bridgePath,
    );
  });

  test('routes removed renderer tool-surface lifecycle queries to the surface removal reference', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'runtime',
      'surface_orchestration_refactor_design_package_2026-02-28.md',
    );

    expect(findDocs('renderer tool surface lifecycle removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('deleted renderer surface services')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('SurfaceOrchestrator ToolExecutionLogger removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes strict computer grounding mixin queries to schema docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'tools',
      'contracts',
      'computer_tool_schema_guidance_reference.md',
    );

    expect(
      findDocs('SourceDescriptionFields unknown coordinate legacy fields')[0].path,
    ).toBe(expectedPath);
    expect(
      findDocs('DestinationDescriptionFields extra forbid removed ignore')[0].path,
    ).toBe(expectedPath);
    expect(
      findDocs('SourceGroundingArgsMixin extra forbid legacy coordinate fields')[0].path,
    ).toBe(expectedPath);
    expect(
      findDocs('DragDestinationGroundingArgsMixin extra forbid legacy coordinate fields')[0].path,
    ).toBe(expectedPath);
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

  test('routes removed config-version storage queries to frontend config docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'settings',
      'config',
      'frontend_config_filter_storage_and_provider_merge_runtime_reference.md',
    );

    expect(findDocs('config storage version key removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('desktop-assistant-config-version removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('saveConfigToStorage version Date.now removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('legacy model id migration removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('renderer localStorage selected model id migration')[0].path).toBe(
      expectedPath,
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

  test('routes private workspace helper queries to the workspace workflow', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'runtime',
      'workspace_context_change_workflow.md',
    );

    expect(findDocs('normalizeWorkspaceAccessPayload removed export')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('WORKSPACE_ACCESS_PERMISSION_ID private workspace runtime helper')[0].path).toBe(
      expectedPath,
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
      'windie command help',
    ]) {
      expect(commandDocs.has(findDocs(query)[0].path)).toBe(true);
    }

    expect(findDocs('logs renderer verbose')[0].path).toBe(
      path.join('docs', 'debug', 'logging.md'),
    );
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

  test('routes browser replace_file schema queries to browser action docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'sidecar',
      'browser_action_runtime_reference.md',
    );

    expect(findDocs('browser replace_file old_str new_str old_string new_string invalid')[0].path).toBe(
      expectedPath,
    );
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

  test('routes Electron agent-definition input collector queries to main IPC docs', () => {
    expect(findDocs('src/main/agent/electron_agent_definition_inputs.cjs')[0].path).toBe(
      path.join('docs', 'frontend', 'main', 'electron_main_and_ipc.md'),
    );
  });

  test('routes web search tool queries to the backend-owned tool guide', () => {
    expect(findDocs('web search tool')[0].path).toBe(
      path.join('docs', 'tools', 'web_search.md'),
    );
  });

  test('routes removed sandbox executor queries to tool security docs', () => {
    const securityPath = path.join(
      'docs',
      'backend',
      'tools',
      'tool_security_policy_and_executor_reference.md',
    );
    const registryPath = path.join(
      'docs',
      'backend',
      'tools',
      'security',
      'policy_permissions_audit_and_executor_registry_reference.md',
    );

    expect(findDocs('ProcessSandboxedExecutor removed')[0].path).toBe(securityPath);
    expect(findDocs('sandboxed executor placeholder removed')[0].path).toBe(
      securityPath,
    );
    expect(findDocs('ProcessSandboxedExecutor NotImplementedError')[0].path).toBe(
      registryPath,
    );
  });

  test('routes missing request-id placeholder queries to tool wait docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'tools',
      'execution',
      'tool_result_orchestrator_bundle_detection_and_wait_path_reference.md',
    );

    expect(findDocs('missing request_id pending placeholder removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('single tool wait missing request_id pending removed')[0].path).toBe(
      expectedPath,
    );
    expect(
      findDocs('missing request_id invalid tool call failure result')[0].path,
    ).toBe(expectedPath);
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

  test('routes provider tool-call id fail-closed queries to provider parsing docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'llm',
      'providers',
      'base_request_stream_and_normalization_reference.md',
    );

    expect(findDocs('provider tool call id synthesis removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('OpenAI Responses tool call id required')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes provider response parsing relay queries to provider docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'llm',
      'providers',
      'base_request_stream_and_normalization_reference.md',
    );

    expect(
      findDocs('response_parsing thinking_extraction import relay removed')[0].path,
    ).toBe(expectedPath);
    expect(
      findDocs('base_payload_helpers thinking extraction provider payload helper')[0].path,
    ).toBe(expectedPath);
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
    expect(findDocs('extension package plugin mcp skills local runtime tools')[0].path).toBe(
      path.join('docs', 'development', 'extensions.md'),
    );
    expect(findDocs('extensions container extension.json plugin index cjs')[0].path).toBe(
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
    expect(findDocs('fallbackText removed top-level tool output fallback')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('normalizeToolOutputContent fallback removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes SDK tool-pair helper queries to conversation runtime', () => {
    const expectedPath = path.join('docs', 'sdk', 'conversation_runtime.md');

    expect(findDocs('toolPairKey removed')[0].path).toBe(expectedPath);
    expect(findDocs('toolPairKeys requestId bundleId correlationId toolCallId')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes SDK stream attachment extraction queries to AgentClient runtime', () => {
    const expectedPath = path.join('docs', 'sdk', 'windie_client_runtime.md');

    expect(
      findDocs('extractToolResultAttachments parent removed agent stream attachments')[0].path,
    ).toBe(expectedPath);
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

  test('routes renderer agent runtime transport command-shape queries to the transport contract', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'desktop_runtime_transport_command_contract_reference.md',
    );

    expect(findDocs('camelCase query payload')[0].path).toBe(expectedPath);
    expect(findDocs('snake_case command contract')[0].path).toBe(expectedPath);
    expect(findDocs('DesktopRuntimeTransport')[0].path).toBe(expectedPath);
    expect(
      findDocs('SDK_RUNTIME_COMMANDS conversation.send conversations.list memories.list diagnostics.append')[0].path,
    ).toBe(expectedPath);
    expect(
      findDocs('main ipc buildWindieSdkCommandHandlers SDK_RUNTIME_COMMANDS conversation.send')[0].path,
    ).toBe(expectedPath);
  });

  test('routes dashboard stylesheet queries to the current renderer style contract', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'styles',
      'global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md',
    );

    expect(findDocs('DashboardShell css DashboardPanelSurfaces DesktopOnboarding')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('ChatGptDashboardShell css removed')[0].path).toBe(expectedPath);
  });

  test('routes SDK websocket typing queries to the AgentClient runtime contract', () => {
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

  test('routes removed renderer transcript helper queries to SDK conversation runtime', () => {
    const expectedPath = path.join('docs', 'sdk', 'conversation_runtime.md');

    expect(findDocs('transcriptMessagePayload.js removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('structuredToolPayload.js removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('rehydrateMessageState.js removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('rehydratePayload.js removed')[0].path).toBe(expectedPath);
    expect(findDocs('transparencyNormalization removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('storedTranscriptSdkProjection removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('storedTranscriptMemoryState removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('storedTranscriptChatMessageState removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('desktopTranscriptProjectionRuntimeClient removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('pendingTranscriptMessages removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('pendingAssistantQueue removed')[0].path).toBe(expectedPath);
    expect(findDocs('pendingUserQueue removed')[0].path).toBe(expectedPath);
    expect(findDocs('TranscriptPendingFlush.test.ts removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('transcriptRecordWrite removed')[0].path).toBe(expectedPath);
  });

  test('routes desktop conversation-store write enrichment queries to transcript docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'transcript_session_and_rehydrate_reference.md',
    );

    expect(findDocs('desktopConversationStore write enrichment removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('desktop store write enrichment direct SDK command bridge')[0].path).toBe(
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

  test('routes removed renderer overlay and chat helper queries to current owner docs', () => {
    const overlayPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'overlays',
      'response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md',
    );
    const payloadPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'chat',
      'payloads',
      'tool_call_output_and_transparency_section_rendering_reference.md',
    );
    const streamPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'chat_stream_and_tool_execution_reference.md',
    );
    const sdkPath = path.join(
      'docs',
      'sdk',
      'conversation_runtime.md',
    );

    expect(findDocs('responseOverlayPhasePayload.js removed')[0].path).toBe(
      overlayPath,
    );
    expect(findDocs('ResponseOverlayPhasePayload.test.js removed')[0].path).toBe(
      overlayPath,
    );
    expect(findDocs('toolExplanationMessages.js removed')[0].path).toBe(payloadPath);
    expect(findDocs('MessageScreenshotSrc.test.js removed')[0].path).toBe(
      payloadPath,
    );
    expect(findDocs('MessageToolMetadata.test.js removed')[0].path).toBe(
      payloadPath,
    );
    expect(findDocs('sanitizeMarkdownHtml markdown sanitizer wrapper removed')[0].path).toBe(
      payloadPath,
    );
    expect(findDocs('chatStreamTransparency removed')[0].path).toBe(streamPath);
    expect(findDocs('ChatStreamTransparency.test.ts removed')[0].path).toBe(
      streamPath,
    );
    expect(findDocs('ChatStreamThinkingStatusUtils.test.ts removed')[0].path).toBe(
      streamPath,
    );
    expect(findDocs('ToolRunnerHook.callbacks.test.ts removed')[0].path).toBe(
      sdkPath,
    );
    expect(findDocs('ToolRunnerHook.turnGuards.test.ts removed')[0].path).toBe(
      sdkPath,
    );
  });

  test('routes removed dashboard display helper queries to infrastructure docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'infrastructure',
      'conversation_transcript_loader_and_display_bounds_storage_reference.md',
    );

    expect(findDocs('SettingsDisplayUtils.test.js removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed replay state test queries to transcript rehydrate docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'transcript_session_and_rehydrate_reference.md',
    );

    expect(findDocs('ConversationReplayState.test.ts removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed dashboard memory helper queries to dashboard memory docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'dashboard_memory_management_and_resume_reference.md',
    );

    expect(findDocs('episodicMemoryUtils.js removed')[0].path).toBe(expectedPath);
    expect(findDocs('EpisodicMemoryUtils.test.js removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed simulation computer alias queries to simulation entrypoint docs', () => {
    const expectedPath = path.join(
      'docs',
      'backend',
      'simulation',
      'entrypoints',
      'package_runner_and_main_module_uvicorn_bootstrap_contract_reference.md',
    );

    expect(findDocs('backend.src.simulation.computer removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('simulation computer alias removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('backend simulation computer module deleted')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('python -m backend.src.simulation.computer')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed renderer backend event contract queries to SDK event docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'contracts',
      'schema_generation_and_event_guard_reference.md',
    );

    expect(findDocs('frontend renderer backendEvents.ts removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('renderer backend event contract moved to sdk')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes deleted chat conversation gate queries to current ingress docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'chat',
      'stream',
      'conversation_gate_and_active_turn_filtering_reference.md',
    );

    expect(findDocs('desktopChatStreamConversationGateRuntime removed')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('DesktopChatStreamConversationGateRuntime.test.ts removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes desktop conversation library client queries to transcript docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'transcript_session_and_rehydrate_reference.md',
    );

    expect(findDocs('desktopConversationLibraryClient.js list load delete search')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed renderer transcript and display helper queries to infrastructure docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'infrastructure',
      'conversation_transcript_loader_and_display_bounds_storage_reference.md',
    );

    expect(findDocs('localConversationStore.ts removed')[0].path).toBe(expectedPath);
    expect(findDocs('displaySelection.ts removed display bounds')[0].path).toBe(
      expectedPath,
    );
    expect(findDocs('ToolExecutionInvoker.ts removed screenshot display_bounds')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes removed renderer tool payload builders to capture docs', () => {
    const expectedPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'infrastructure',
      'capture_artifact_upload_and_payload_normalization_reference.md',
    );

    expect(findDocs('ToolExecutionPayloads.ts removed')[0].path).toBe(expectedPath);
    expect(findDocs('ToolExecutionBackendPayload.ts removed')[0].path).toBe(
      expectedPath,
    );
  });

  test('routes relocated renderer surface file queries to current docs', () => {
    const overlayPath = path.join('docs', 'desktop', 'response_overlay.md');
    const modelsSectionPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'dashboard',
      'sections',
      'models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md',
    );
    const errorPath = path.join(
      'docs',
      'frontend',
      'renderer',
      'styles',
      'README.md',
    );

    expect(findDocs('useResponseOverlayViewModel.js minimalChatPill')[0].path).toBe(
      overlayPath,
    );
    expect(findDocs('ModelsSection.jsx dashboard sections')[0].path).toBe(modelsSectionPath);
    expect(findDocs('ErrorBoundary.css renderer styles')[0].path).toBe(errorPath);
  });
});
