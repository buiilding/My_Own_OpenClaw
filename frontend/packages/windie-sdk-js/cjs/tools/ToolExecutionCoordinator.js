"use strict";
/**
 * Provides the tool execution coordinator module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutionCoordinator = void 0;
const events_js_1 = require("../conversation/events.js");
const VisualResourceMaterializer_js_1 = require("../runtime/VisualResourceMaterializer.js");
const toolCorrelationIds_js_1 = require("./toolCorrelationIds.js");
const toolOutputContent_js_1 = require("./toolOutputContent.js");
const COMPUTER_USE_CAPTURE_TOOL_NAMES = new Set([
    'mouse_control',
    'keyboard_control',
    'scroll_control',
    'switch_window',
    'wait',
    'click',
    'type',
    'scroll',
]);
const DEFAULT_POST_ACTION_CAPTURE_WAIT_SECONDS = 2;
function failureResult(error) {
    const message = errorMessage(error);
    return {
        success: false,
        error: message,
        data: {
            output: message,
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function durationSince(startedAtMs) {
    return Math.max(0, Date.now() - startedAtMs);
}
function browserActionFromArgs(args) {
    return typeof args.action === 'string' && args.action.trim()
        ? args.action.trim()
        : null;
}
function browserRuntimeData(data) {
    const tabs = Array.isArray(data?.tabs) ? data.tabs : null;
    return {
        mode: typeof data?.mode === 'string' ? data.mode : null,
        scope: typeof data?.scope === 'string' ? data.scope : null,
        connected: typeof data?.connected === 'boolean' ? data.connected : null,
        tabCount: tabs ? tabs.length : null,
        hasCurrentUrl: typeof data?.url === 'string' && data.url.trim().length > 0,
    };
}
function artifactUploadError(error) {
    return new Error(`artifact_upload_failed: ${errorMessage(error)}`);
}
function stringPayloadField(payload, ...keys) {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
function isJsonRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function normalizeToolName(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function isPositiveFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function isExplicitScreenshotTool(toolName) {
    return normalizeToolName(toolName) === 'screenshot';
}
function isCaptureWorthyTool(toolName, args) {
    const normalizedToolName = normalizeToolName(toolName);
    if (COMPUTER_USE_CAPTURE_TOOL_NAMES.has(normalizedToolName)) {
        return true;
    }
    return (normalizedToolName === 'run_shell_command'
        && isJsonRecord(args)
        && isPositiveFiniteNumber(args.wait));
}
function resolvePostActionWaitSeconds(toolName, args) {
    const normalizedToolName = normalizeToolName(toolName);
    if (normalizedToolName === 'wait' && isJsonRecord(args) && isPositiveFiniteNumber(args.seconds)) {
        return args.seconds;
    }
    if (isJsonRecord(args) && typeof args.wait === 'number' && Number.isFinite(args.wait)) {
        return Math.max(0, args.wait);
    }
    if (normalizedToolName === 'run_shell_command' && isJsonRecord(args) && isPositiveFiniteNumber(args.wait)) {
        return args.wait;
    }
    return DEFAULT_POST_ACTION_CAPTURE_WAIT_SECONDS;
}
function delaySeconds(seconds) {
    const milliseconds = Math.max(0, seconds) * 1000;
    if (milliseconds <= 0) {
        return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
function extractScreenshotDataFromData(data) {
    try {
        return (0, VisualResourceMaterializer_js_1.extractVisualResourceScreenshotFields)(data, {
            rejectCamelCaseScreenshotAliases: true,
        });
    }
    catch (_error) {
        throw new Error('Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.');
    }
}
function mergePostActionScreenshot(data, screenshotData, sourceToolName) {
    if (!screenshotData) {
        return data;
    }
    return {
        ...data,
        ...screenshotData,
        post_action_screenshot: true,
        post_action_screenshot_tool: sourceToolName,
    };
}
function localToolCallFromEvent(event) {
    const payload = event.payload;
    const toolName = typeof payload.toolName === 'string' ? payload.toolName : '';
    if (!toolName) {
        return null;
    }
    return {
        toolName,
        args: payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
            ? payload.args
            : {},
        requestId: typeof payload.requestId === 'string' ? payload.requestId : null,
        bundleId: typeof payload.bundleId === 'string' ? payload.bundleId : null,
        toolCallId: stringPayloadField(payload, 'toolCallId')
            ?? (0, toolCorrelationIds_js_1.resolveModelFacingToolCallId)(payload),
        correlationId: stringPayloadField(payload, 'correlationId'),
        turnRef: event.turnRef,
        conversationRef: event.conversationRef,
    };
}
function shouldSkipLocalToolExecution(event) {
    const metadata = isJsonRecord(event.payload.metadata) ? event.payload.metadata : null;
    return metadata?.skip_local_execution === true;
}
function activeClientToolNames(agentDefinition) {
    if (!agentDefinition || !isJsonRecord(agentDefinition.tools)) {
        return null;
    }
    const clientManifest = isJsonRecord(agentDefinition.tools.client_manifest)
        ? agentDefinition.tools.client_manifest
        : null;
    const tools = Array.isArray(clientManifest?.tools) ? clientManifest.tools : [];
    if (tools.length === 0) {
        return null;
    }
    const names = tools
        .map(tool => (isJsonRecord(tool) && typeof tool.name === 'string' ? tool.name.trim() : ''))
        .filter(Boolean);
    return names.length > 0 ? new Set(names) : null;
}
function resolveLocalToolRelease(release) {
    if (typeof release === 'function') {
        return release;
    }
    if (isJsonRecord(release) && typeof release.release === 'function') {
        return release.release;
    }
    return null;
}
class ToolExecutionCoordinator {
    constructor(options) {
        this.options = options;
    }
    async executeLocalTool(call) {
        if (!this.options.localRuntime?.executeTool) {
            throw new Error('local runtime executeTool is unavailable');
        }
        const activeToolNames = activeClientToolNames(this.options.agentDefinition ?? null);
        if (activeToolNames && !activeToolNames.has(call.toolName)) {
            throw new Error(`Local tool route unavailable for ${call.toolName}. The active capability manifest no longer exposes this tool.`);
        }
        const release = resolveLocalToolRelease(await this.options.localToolLifecycle?.beforeExecute?.(call));
        try {
            return await this.options.localRuntime.executeTool(call);
        }
        finally {
            if (release) {
                await release();
            }
        }
    }
    async materializeScreenshotArtifact(data) {
        if ('screenshotRef' in data || 'screenshotUrl' in data || 'screenshotPath' in data) {
            throw new Error('Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.');
        }
        const visualFields = (0, VisualResourceMaterializer_js_1.extractVisualResourceScreenshotFields)(data, {
            rejectCamelCaseScreenshotAliases: true,
        });
        if (!visualFields) {
            return data;
        }
        try {
            const materialized = await (0, VisualResourceMaterializer_js_1.materializeVisualResource)({
                source: 'tool_screenshot',
                data,
            }, {
                artifactUploader: this.options.artifactUploader,
                rejectCamelCaseScreenshotAliases: true,
            });
            return (0, VisualResourceMaterializer_js_1.applyMaterializedVisualResourceToData)(data, materialized);
        }
        catch (error) {
            throw artifactUploadError(error);
        }
    }
    async materializeBundleStepScreenshots(stepResult) {
        if (!isJsonRecord(stepResult.output)) {
            return stepResult;
        }
        const output = await this.materializeScreenshotArtifact(stepResult.output);
        if (output === stepResult.output) {
            return stepResult;
        }
        return {
            ...stepResult,
            output,
        };
    }
    async materializeBundleScreenshots(payload) {
        const materialized = {
            ...payload,
            step_results: await Promise.all(payload.step_results.map(step => this.materializeBundleStepScreenshots(step))),
        };
        const topLevel = await this.materializeScreenshotArtifact(materialized);
        const nextPayload = {
            ...materialized,
            step_results: materialized.step_results,
        };
        if (typeof topLevel.screenshot === 'string') {
            nextPayload.screenshot = topLevel.screenshot;
        }
        else {
            delete nextPayload.screenshot;
        }
        if (typeof topLevel.screenshot_ref === 'string') {
            nextPayload.screenshot_ref = topLevel.screenshot_ref;
        }
        if (typeof topLevel.screenshot_url === 'string') {
            nextPayload.screenshot_url = topLevel.screenshot_url;
        }
        if (typeof topLevel.screenshot_content_type === 'string') {
            nextPayload.screenshot_content_type = topLevel.screenshot_content_type;
        }
        if (isJsonRecord(topLevel.capture_meta)) {
            nextPayload.capture_meta = topLevel.capture_meta;
        }
        if (isJsonRecord(topLevel.system_state)) {
            nextPayload.system_state = topLevel.system_state;
        }
        if (typeof topLevel.error === 'string') {
            nextPayload.error = topLevel.error;
        }
        return nextPayload;
    }
    async capturePostActionScreenshot({ waitSeconds, explanation, turnRef, conversationRef, }) {
        if (!this.options.localRuntime?.executeTool) {
            return null;
        }
        await delaySeconds(waitSeconds);
        try {
            const result = await this.executeLocalTool({
                toolName: 'screenshot',
                args: {
                    explanation,
                    wait: 0,
                },
                turnRef,
                conversationRef,
            });
            if (result.success === false) {
                return null;
            }
            return extractScreenshotDataFromData(result.data);
        }
        catch (_error) {
            return null;
        }
    }
    async attachSinglePostActionScreenshot(call, result) {
        const data = (0, toolOutputContent_js_1.normalizeLocalToolResultData)(result.data);
        if (isExplicitScreenshotTool(call.toolName)
            || !isCaptureWorthyTool(call.toolName, call.args)
            || extractScreenshotDataFromData(data)) {
            return data;
        }
        const screenshotData = await this.capturePostActionScreenshot({
            waitSeconds: resolvePostActionWaitSeconds(call.toolName, call.args),
            explanation: `Capturing the screen after ${call.toolName} execution.`,
            turnRef: call.turnRef,
            conversationRef: call.conversationRef,
        });
        return mergePostActionScreenshot(data, screenshotData, call.toolName);
    }
    resolveBundleCaptureWaitSeconds(executedSteps) {
        let waitSeconds = 0;
        for (const { sourceTool: tool, result } of executedSteps) {
            if (result.status !== 'ok') {
                continue;
            }
            const args = isJsonRecord(tool.args) ? tool.args : {};
            if (isCaptureWorthyTool(tool.name, args)) {
                waitSeconds = Math.max(waitSeconds, resolvePostActionWaitSeconds(tool.name, args));
            }
        }
        return waitSeconds;
    }
    bundleContainsCaptureWorthyTool(executedSteps) {
        return executedSteps.some(({ sourceTool: tool, result }) => {
            const args = isJsonRecord(tool.args) ? tool.args : {};
            return result.status === 'ok' && isCaptureWorthyTool(tool.name, args);
        });
    }
    findBundleScreenshotFromExplicitStep(executedSteps) {
        for (let index = executedSteps.length - 1; index >= 0; index -= 1) {
            const { sourceTool: tool, result } = executedSteps[index];
            if (!isExplicitScreenshotTool(tool.name) || result.status !== 'ok') {
                continue;
            }
            const screenshotData = extractScreenshotDataFromData(result.output);
            if (screenshotData) {
                return screenshotData;
            }
        }
        return null;
    }
    async attachBundlePostActionScreenshot({ executedSteps, resultPayload, turnRef, conversationRef, }) {
        if (extractScreenshotDataFromData(resultPayload)) {
            return resultPayload;
        }
        const explicitScreenshot = this.findBundleScreenshotFromExplicitStep(executedSteps);
        if (explicitScreenshot) {
            return {
                ...resultPayload,
                ...explicitScreenshot,
            };
        }
        if (!this.bundleContainsCaptureWorthyTool(executedSteps)) {
            return resultPayload;
        }
        const screenshotData = await this.capturePostActionScreenshot({
            waitSeconds: this.resolveBundleCaptureWaitSeconds(executedSteps),
            explanation: 'Capturing the screen after bundled computer-use execution.',
            turnRef,
            conversationRef,
        });
        if (!screenshotData) {
            return resultPayload;
        }
        return {
            ...resultPayload,
            ...screenshotData,
        };
    }
    canClaim(event) {
        if (!this.options.localRuntime?.executeTool) {
            return { claimed: false, reason: 'missing-local-runtime' };
        }
        if (event.type !== 'tool_call' && event.type !== 'tool_bundle_call') {
            return { claimed: false, reason: 'not-tool-event' };
        }
        if (event.type === 'tool_call') {
            const call = localToolCallFromEvent(event);
            if (!call?.toolName || !call.requestId) {
                return { claimed: false, reason: 'missing-tool-name-or-request-id' };
            }
        }
        if (event.type === 'tool_bundle_call') {
            const bundleId = typeof event.payload.bundleId === 'string' ? event.payload.bundleId : '';
            if (!bundleId || !Array.isArray(event.payload.tools)) {
                return { claimed: false, reason: 'missing-bundle-id-or-tools' };
            }
        }
        return { claimed: true };
    }
    async execute(event) {
        if (shouldSkipLocalToolExecution(event)) {
            return { claimed: true, reason: 'backend-skipped-local-execution' };
        }
        const claim = this.canClaim(event);
        if (!claim.claimed) {
            return claim;
        }
        if (event.type === 'tool_bundle_call') {
            await this.executeBundle(event);
            return claim;
        }
        await this.executeSingle(event);
        return claim;
    }
    async executeSingle(event) {
        const call = localToolCallFromEvent(event);
        if (!call?.requestId || !this.options.localRuntime?.executeTool) {
            return;
        }
        const startedAt = Date.now();
        await this.options.emitTrace?.({
            path: 'tool.execution',
            stage: 'single_tool',
            status: 'started',
            runtime: 'sdk',
            requestId: call.requestId,
            data: {
                toolName: call.toolName,
                hasToolCallId: Boolean(call.toolCallId),
                hasCorrelationId: Boolean(call.correlationId),
                argsKeyCount: Object.keys(call.args).length,
            },
        });
        if (call.toolName === 'browser') {
            await this.options.emitTrace?.({
                path: 'browser.runtime',
                stage: 'action',
                status: 'started',
                runtime: 'local-runtime',
                requestId: call.requestId,
                data: {
                    action: browserActionFromArgs(call.args),
                    argsKeyCount: Object.keys(call.args).length,
                },
            });
        }
        let result;
        try {
            result = await this.executeLocalTool(call);
        }
        catch (error) {
            result = failureResult(error);
        }
        const success = result.success !== false;
        let payload = null;
        let screenshotData = null;
        let deliveryError = null;
        try {
            const data = success
                ? await this.attachSinglePostActionScreenshot(call, result)
                : (0, toolOutputContent_js_1.normalizeLocalToolResultData)(result.data, result.error || 'Tool execution failed');
            const materializedData = await this.materializeScreenshotArtifact(data);
            payload = {
                request_id: call.requestId,
                success,
                data: materializedData,
            };
            screenshotData = extractScreenshotDataFromData(payload.data);
            await this.options.sendToolResult(payload);
        }
        catch (error) {
            deliveryError = error;
        }
        finally {
            const deliveryErrorMessage = deliveryError
                ? `Tool result delivery failed: ${errorMessage(deliveryError)}`
                : null;
            const eventResult = payload?.data ?? { output: deliveryErrorMessage ?? 'Tool result delivery failed' };
            await this.options.store?.appendEvent((0, events_js_1.createConversationEvent)({
                eventId: `${event.turnRef ?? event.conversationRef}-local-tool-output-${call.requestId}`,
                type: 'tool_output',
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                turnRef: event.turnRef,
                source: 'sdk',
                payload: {
                    requestId: call.requestId,
                    toolCallId: call.toolCallId ?? null,
                    correlationId: call.correlationId ?? null,
                    toolName: call.toolName,
                    success: deliveryError ? false : success,
                    result: eventResult,
                    ...(screenshotData ?? {}),
                    error: deliveryErrorMessage ?? (success ? null : result.error || 'Tool execution failed'),
                    deliveryFailed: Boolean(deliveryError),
                    elapsedMs: Date.now() - startedAt,
                },
            }));
            await this.options.emitTrace?.({
                path: 'tool.execution',
                stage: 'single_tool',
                status: deliveryError || !success ? 'failed' : 'succeeded',
                runtime: 'sdk',
                requestId: call.requestId,
                durationMs: durationSince(startedAt),
                data: {
                    toolName: call.toolName,
                    success: deliveryError ? false : success,
                    deliveryFailed: Boolean(deliveryError),
                    hasScreenshotRef: Boolean(screenshotData?.screenshot_ref),
                },
                error: deliveryError ?? (success ? null : result.error ?? 'Tool execution failed'),
            });
            if (call.toolName === 'browser') {
                await this.options.emitTrace?.({
                    path: 'browser.runtime',
                    stage: 'action',
                    status: deliveryError || !success ? 'failed' : 'succeeded',
                    runtime: 'local-runtime',
                    requestId: call.requestId,
                    durationMs: durationSince(startedAt),
                    data: {
                        action: browserActionFromArgs(call.args),
                        success: deliveryError ? false : success,
                        deliveryFailed: Boolean(deliveryError),
                        ...browserRuntimeData(isJsonRecord(result.data) ? result.data : null),
                    },
                    error: deliveryError ?? (success ? null : result.error ?? 'Browser action failed'),
                });
            }
        }
        if (deliveryError) {
            throw deliveryError;
        }
    }
    async executeBundle(event) {
        if (!this.options.localRuntime?.executeTool) {
            return;
        }
        const payload = event.payload;
        const startedAt = Date.now();
        const bundleId = typeof payload.bundleId === 'string' ? payload.bundleId : '';
        const tools = Array.isArray(payload.tools) ? payload.tools : [];
        const stepResults = [];
        const executedSteps = [];
        let status = 'failure';
        let resultPayload = {
            bundle_id: bundleId,
            status,
            step_results: stepResults,
        };
        let deliveryError = null;
        await this.options.emitTrace?.({
            path: 'tool.execution',
            stage: 'bundle',
            status: 'started',
            runtime: 'sdk',
            requestId: bundleId,
            data: {
                bundleId,
                toolCount: tools.length,
            },
        });
        try {
            for (const [sourceToolIndex, step] of tools.entries()) {
                if (!step || typeof step !== 'object' || Array.isArray(step)) {
                    continue;
                }
                const record = step;
                const toolName = typeof record.name === 'string' ? record.name : '';
                if (!toolName) {
                    continue;
                }
                const toolCallId = stringPayloadField(record, 'toolCallId')
                    ?? (0, toolCorrelationIds_js_1.resolveModelFacingToolCallId)(record);
                let result;
                try {
                    result = await this.executeLocalTool({
                        toolName,
                        args: record.args && typeof record.args === 'object' && !Array.isArray(record.args)
                            ? record.args
                            : {},
                        bundleId,
                        toolCallId,
                        turnRef: event.turnRef,
                        conversationRef: event.conversationRef,
                    });
                }
                catch (error) {
                    result = failureResult(error);
                }
                const success = result.success !== false;
                const stepResult = await this.materializeBundleStepScreenshots({
                    tool: toolName,
                    ...(toolCallId ? { toolCallId } : {}),
                    status: success ? 'ok' : 'error',
                    output: success
                        ? (0, toolOutputContent_js_1.normalizeLocalToolResultData)(result.data)
                        : (0, toolOutputContent_js_1.normalizeLocalToolResultData)(result.data || { output: result.error || 'Tool execution failed' }),
                });
                stepResults.push(stepResult);
                executedSteps.push({
                    sourceTool: record,
                    sourceToolIndex,
                    result: stepResult,
                });
            }
            const failures = stepResults.filter(step => step.status !== 'ok');
            status = failures.length === 0
                ? 'success'
                : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
            resultPayload = await this.materializeBundleScreenshots(await this.attachBundlePostActionScreenshot({
                executedSteps,
                resultPayload: {
                    bundle_id: bundleId,
                    status,
                    step_results: stepResults,
                    error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
                },
                turnRef: event.turnRef,
                conversationRef: event.conversationRef,
            }));
            await this.options.sendToolBundleResult(resultPayload);
        }
        catch (error) {
            deliveryError = error;
        }
        finally {
            const deliveryErrorMessage = deliveryError
                ? `Tool bundle result delivery failed: ${errorMessage(deliveryError)}`
                : null;
            await this.options.store?.appendEvent((0, events_js_1.createConversationEvent)({
                eventId: `${event.turnRef ?? event.conversationRef}-local-tool-bundle-output-${bundleId}`,
                type: 'tool_bundle_output',
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                turnRef: event.turnRef,
                source: 'sdk',
                payload: {
                    bundleId,
                    status: deliveryError ? 'failure' : status,
                    stepResults,
                    screenshot: resultPayload.screenshot ?? null,
                    screenshotRef: resultPayload.screenshot_ref ?? null,
                    screenshotUrl: resultPayload.screenshot_url ?? null,
                    captureMeta: resultPayload.capture_meta ?? null,
                    error: deliveryErrorMessage ?? resultPayload.error ?? null,
                    deliveryFailed: Boolean(deliveryError),
                },
            }));
            await this.options.emitTrace?.({
                path: 'tool.execution',
                stage: 'bundle',
                status: deliveryError || status !== 'success' ? 'failed' : 'succeeded',
                runtime: 'sdk',
                requestId: bundleId,
                durationMs: durationSince(startedAt),
                data: {
                    bundleId,
                    toolCount: tools.length,
                    executedStepCount: stepResults.length,
                    bundleStatus: deliveryError ? 'failure' : status,
                    deliveryFailed: Boolean(deliveryError),
                    hasScreenshotRef: Boolean(resultPayload.screenshot_ref),
                },
                error: deliveryError ?? (status === 'success' ? null : resultPayload.error ?? 'Bundled tool execution failed'),
            });
        }
        if (deliveryError) {
            throw deliveryError;
        }
    }
}
exports.ToolExecutionCoordinator = ToolExecutionCoordinator;
