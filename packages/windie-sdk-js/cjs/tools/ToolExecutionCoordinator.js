"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutionCoordinator = void 0;
const events_js_1 = require("../conversation/events.js");
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
            llm_content: message,
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
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
    if (!isJsonRecord(data)) {
        return null;
    }
    const screenshot = typeof data.screenshot === 'string' && data.screenshot.trim()
        ? data.screenshot
        : null;
    const screenshotRef = typeof data.screenshot_ref === 'string' && data.screenshot_ref.trim()
        ? data.screenshot_ref
        : (typeof data.screenshotRef === 'string' && data.screenshotRef.trim() ? data.screenshotRef : null);
    if (!screenshot && !screenshotRef) {
        return null;
    }
    return {
        ...(screenshot ? { screenshot } : {}),
        ...(screenshotRef ? { screenshot_ref: screenshotRef } : {}),
        ...(typeof data.screenshot_content_type === 'string' ? { screenshot_content_type: data.screenshot_content_type } : {}),
        ...(isJsonRecord(data.capture_meta) ? { capture_meta: data.capture_meta } : {}),
    };
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
    const toolName = typeof payload.toolName === 'string'
        ? payload.toolName
        : (typeof payload.tool_name === 'string' ? payload.tool_name : '');
    if (!toolName) {
        return null;
    }
    return {
        toolName,
        args: payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
            ? payload.args
            : {},
        requestId: typeof payload.requestId === 'string'
            ? payload.requestId
            : (typeof payload.request_id === 'string' ? payload.request_id : null),
        bundleId: typeof payload.bundleId === 'string'
            ? payload.bundleId
            : (typeof payload.bundle_id === 'string' ? payload.bundle_id : null),
        toolCallId: stringPayloadField(payload, 'toolCallId', 'tool_call_id')
            ?? (0, toolCorrelationIds_js_1.resolveModelFacingToolCallId)(payload),
        correlationId: stringPayloadField(payload, 'correlationId', 'correlation_id'),
        turnRef: event.turnRef,
        conversationRef: event.conversationRef,
    };
}
class ToolExecutionCoordinator {
    constructor(options) {
        this.options = options;
    }
    async capturePostActionScreenshot({ waitSeconds, explanation, turnRef, conversationRef, }) {
        if (!this.options.localRuntime?.executeTool) {
            return null;
        }
        await delaySeconds(waitSeconds);
        try {
            const result = await this.options.localRuntime.executeTool({
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
            const bundleId = typeof event.payload.bundleId === 'string'
                ? event.payload.bundleId
                : (typeof event.payload.bundle_id === 'string' ? event.payload.bundle_id : '');
            if (!bundleId || !Array.isArray(event.payload.tools)) {
                return { claimed: false, reason: 'missing-bundle-id-or-tools' };
            }
        }
        return { claimed: true };
    }
    async execute(event) {
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
        let result;
        try {
            result = await this.options.localRuntime.executeTool(call);
        }
        catch (error) {
            result = failureResult(error);
        }
        const success = result.success !== false;
        const data = success
            ? await this.attachSinglePostActionScreenshot(call, result)
            : (0, toolOutputContent_js_1.normalizeLocalToolResultData)(result.data);
        const payload = {
            request_id: call.requestId,
            success,
            data,
            error: success ? undefined : result.error || 'Tool execution failed',
        };
        let deliveryError = null;
        try {
            await this.options.sendToolResult(payload);
        }
        catch (error) {
            deliveryError = error;
        }
        finally {
            const deliveryErrorMessage = deliveryError
                ? `Tool result delivery failed: ${errorMessage(deliveryError)}`
                : null;
            await this.options.store?.appendEvent((0, events_js_1.createConversationEvent)({
                type: 'tool_output',
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                turnRef: event.turnRef,
                source: 'sidecar',
                payload: {
                    requestId: call.requestId,
                    toolCallId: call.toolCallId ?? null,
                    correlationId: call.correlationId ?? null,
                    toolName: call.toolName,
                    success: deliveryError ? false : success,
                    result: payload.data,
                    error: deliveryErrorMessage ?? payload.error ?? null,
                    deliveryFailed: Boolean(deliveryError),
                    elapsedMs: Date.now() - startedAt,
                },
            }));
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
        const bundleId = typeof payload.bundleId === 'string'
            ? payload.bundleId
            : (typeof payload.bundle_id === 'string' ? payload.bundle_id : '');
        const tools = Array.isArray(payload.tools) ? payload.tools : [];
        const stepResults = [];
        const executedSteps = [];
        for (const [sourceToolIndex, step] of tools.entries()) {
            if (!step || typeof step !== 'object' || Array.isArray(step)) {
                continue;
            }
            const record = step;
            const toolName = typeof record.name === 'string' ? record.name : '';
            if (!toolName) {
                continue;
            }
            const toolCallId = stringPayloadField(record, 'toolCallId', 'tool_call_id')
                ?? (0, toolCorrelationIds_js_1.resolveModelFacingToolCallId)(record);
            let result;
            try {
                result = await this.options.localRuntime.executeTool({
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
            const stepResult = {
                tool: toolName,
                ...(toolCallId ? { toolCallId } : {}),
                status: success ? 'ok' : 'error',
                output: success
                    ? (0, toolOutputContent_js_1.normalizeLocalToolResultData)(result.data)
                    : { error: result.error || 'Tool execution failed' },
            };
            stepResults.push(stepResult);
            executedSteps.push({
                sourceTool: record,
                sourceToolIndex,
                result: stepResult,
            });
        }
        const failures = stepResults.filter(step => step.status !== 'ok');
        const status = failures.length === 0
            ? 'success'
            : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
        const resultPayload = await this.attachBundlePostActionScreenshot({
            executedSteps,
            resultPayload: {
                bundle_id: bundleId,
                status,
                step_results: stepResults,
                error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
            },
            turnRef: event.turnRef,
            conversationRef: event.conversationRef,
        });
        let deliveryError = null;
        try {
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
                eventId: (0, events_js_1.createRuntimeId)('bundle_output'),
                type: 'tool_bundle_output',
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                turnRef: event.turnRef,
                source: 'sidecar',
                payload: {
                    bundleId,
                    status: deliveryError ? 'failure' : status,
                    stepResults,
                    screenshot: resultPayload.screenshot ?? null,
                    screenshotRef: resultPayload.screenshot_ref ?? null,
                    captureMeta: resultPayload.capture_meta ?? null,
                    error: deliveryErrorMessage ?? resultPayload.error ?? null,
                    deliveryFailed: Boolean(deliveryError),
                },
            }));
        }
        if (deliveryError) {
            throw deliveryError;
        }
    }
}
exports.ToolExecutionCoordinator = ToolExecutionCoordinator;
