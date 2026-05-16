"""Compatibility tests for SDK-emitted payloads consumed by backend schemas."""

from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path

from backend.src.api.schemas.incoming import (
    RehydrateConversationPayload,
    ToolBundleResultPayload,
    ToolResultPayload,
)


ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def _build_sdk_dist() -> None:
    subprocess.run(
        ["npm", "run", "build"],
        cwd=ROOT / "packages" / "windie-sdk-js",
        check=True,
        capture_output=True,
        text=True,
    )


@lru_cache(maxsize=1)
def _collect_sdk_payloads() -> dict:
    _build_sdk_dist()
    script = """
import {
  ToolExecutionCoordinator,
  buildRehydrateSnapshot,
  createConversationEvent,
} from './packages/windie-sdk-js/dist/index.js';

function event(type, payload = {}) {
  return createConversationEvent({
    type,
    conversationRef: 'conv-sdk-backend-compat',
    revisionId: 'rev-compat',
    turnRef: 'turn-compat',
    source: 'sdk',
    payload,
  });
}

const sentToolResults = [];
const sentBundleResults = [];
const coordinator = new ToolExecutionCoordinator({
  localRuntime: {
    async executeTool(call) {
      if (call.bundleId) {
        return {
          success: true,
          data: { llm_content: `bundle result for ${call.toolCallId}` },
        };
      }
      return {
        success: true,
        data: {
          llm_content: 'single tool result',
          tool_specific_metric: 42,
        },
      };
    },
  },
  async sendToolResult(payload) {
    sentToolResults.push(payload);
  },
  async sendToolBundleResult(payload) {
    sentBundleResults.push(payload);
  },
});

await coordinator.execute(event('tool_call', {
  toolName: 'read_file',
  requestId: 'req-sdk-compat',
  toolCallId: 'call-sdk-compat',
  args: { path: 'README.md' },
}));
await coordinator.execute(event('tool_bundle_call', {
  bundleId: 'bundle-sdk-compat',
  tools: [
    {
      name: 'read_file',
      args: { path: 'README.md' },
      metadata: {
        model_facing_tool_call: {
          id: 'call-bundle-readme',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"README.md"}',
          },
        },
      },
    },
    {
      name: 'read_file',
      args: { path: 'package.json' },
      metadata: {
        model_facing_tool_call: {
          id: 'call-bundle-package',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"package.json"}',
          },
        },
      },
    },
  ],
}));

const rehydrate = buildRehydrateSnapshot([
  event('user_message', { text: 'inspect files' }),
  event('tool_bundle_call', {
    bundleId: 'bundle-sdk-compat',
    tools: [
      {
        name: 'read_file',
        args: { path: 'README.md' },
        metadata: {
          model_facing_tool_call: {
            id: 'call-bundle-readme',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"README.md"}',
            },
          },
        },
      },
      {
        name: 'read_file',
        args: { path: 'package.json' },
        metadata: {
          model_facing_tool_call: {
            id: 'call-bundle-package',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"package.json"}',
            },
          },
        },
      },
    ],
  }),
  event('tool_bundle_output', {
    bundleId: 'bundle-sdk-compat',
    stepResults: [
      {
        tool: 'read_file',
        toolCallId: 'call-bundle-readme',
        status: 'ok',
        output: { llm_content: 'README contents' },
      },
      {
        tool: 'read_file',
        toolCallId: 'call-bundle-package',
        status: 'ok',
        output: { llm_content: 'package contents' },
      },
    ],
  }),
]);

process.stdout.write(JSON.stringify({
  toolResult: sentToolResults[0],
  toolBundleResult: sentBundleResults[0],
  rehydratePayload: {
    conversation_ref: rehydrate.conversationRef,
    messages: rehydrate.messages,
    rehydrate_mode: 'replace',
  },
}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_sdk_tool_result_payload_matches_backend_ingress_schema():
    payloads = _collect_sdk_payloads()

    payload = ToolResultPayload.model_validate(payloads["toolResult"])

    assert payload.request_id == "req-sdk-compat"
    assert payload.success is True
    assert payload.data is not None
    assert payload.data.llm_content == "single tool result"
    assert payload.data.model_dump()["tool_specific_metric"] == 42


def test_sdk_tool_bundle_result_payload_matches_backend_ingress_schema():
    payloads = _collect_sdk_payloads()

    payload = ToolBundleResultPayload.model_validate(payloads["toolBundleResult"])

    assert payload.bundle_id == "bundle-sdk-compat"
    assert payload.status == "success"
    assert [step.status for step in payload.step_results] == ["ok", "ok"]
    assert payload.step_results[0].model_dump()["toolCallId"] == "call-bundle-readme"
    assert payload.step_results[1].model_dump()["toolCallId"] == "call-bundle-package"


def test_sdk_rehydrate_projection_matches_backend_ingress_schema():
    payloads = _collect_sdk_payloads()

    payload = RehydrateConversationPayload.model_validate(payloads["rehydratePayload"])

    assert payload.conversation_ref == "conv-sdk-backend-compat"
    assert [message.role for message in payload.messages] == [
        "user",
        "assistant",
        "tool",
        "tool",
    ]
    assistant = payload.messages[1]
    assert assistant.tool_calls is not None
    assert [tool_call["id"] for tool_call in assistant.tool_calls] == [
        "call-bundle-readme",
        "call-bundle-package",
    ]
    assert payload.messages[2].tool_name == "read_file"
    assert payload.messages[2].tool_call_id == "call-bundle-readme"
    assert payload.messages[3].tool_name == "read_file"
    assert payload.messages[3].tool_call_id == "call-bundle-package"
