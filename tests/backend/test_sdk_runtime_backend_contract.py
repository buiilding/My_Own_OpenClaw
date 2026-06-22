"""Contract tests for SDK-emitted payloads consumed by backend schemas."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import pytest

from backend.src.api.schemas.incoming import (
    QueryPayload,
    RehydrateConversationPayload,
    ToolBundleResultPayload,
    ToolResultPayload,
)


ROOT = Path(__file__).resolve().parents[2]
SDK_PACKAGE_DIR = ROOT / "packages" / "windie-sdk-js"


def _npm_executable() -> str | None:
    candidates = ("npm.cmd", "npm") if os.name == "nt" else ("npm",)
    for candidate in candidates:
        executable = shutil.which(candidate)
        if executable is not None:
            return executable
    return None


def _sdk_build_prerequisite_skip_reason(
    package_dir: Path = SDK_PACKAGE_DIR,
) -> str | None:
    if shutil.which("node") is None:
        return "node is required for SDK/backend contract tests"
    if _npm_executable() is None:
        return "npm is required for SDK/backend contract tests"
    if not (package_dir / "node_modules").is_dir():
        try:
            package_label = str(package_dir.relative_to(ROOT))
        except ValueError:
            package_label = "packages/windie-sdk-js"
        return (
            f"{package_label} dependencies are not installed; "
            "run npm install in that package to enable SDK/backend contract tests"
        )
    return None


@lru_cache(maxsize=1)
def _build_sdk_dist() -> None:
    skip_reason = _sdk_build_prerequisite_skip_reason()
    if skip_reason:
        pytest.skip(skip_reason)
    npm = _npm_executable()
    if npm is None:
        pytest.skip("npm is required for SDK/backend contract tests")
    subprocess.run(
        [npm, "run", "build"],
        cwd=SDK_PACKAGE_DIR,
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
    conversationRef: 'conv-sdk-backend-contract',
    revisionId: 'rev-contract',
    turnRef: 'turn-contract',
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
          data: { output: `bundle result for ${call.toolCallId}` },
        };
      }
      return {
        success: true,
        data: {
          output: 'single tool result',
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
  requestId: 'req-sdk-contract',
  toolCallId: 'call-sdk-contract',
  args: { path: 'README.md' },
}));
await coordinator.execute(event('tool_bundle_call', {
  bundleId: 'bundle-sdk-contract',
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
    bundleId: 'bundle-sdk-contract',
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
    bundleId: 'bundle-sdk-contract',
    stepResults: [
      {
        tool: 'read_file',
        toolCallId: 'call-bundle-readme',
        status: 'ok',
        output: { output: 'README contents' },
      },
      {
        tool: 'read_file',
        toolCallId: 'call-bundle-package',
        status: 'ok',
        output: { output: 'package contents' },
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

    assert payload.request_id == "req-sdk-contract"
    assert payload.success is True
    assert payload.data is not None
    assert payload.data.output == "single tool result"
    assert payload.data.model_dump()["tool_specific_metric"] == 42


def test_sdk_tool_bundle_result_payload_matches_backend_ingress_schema():
    payloads = _collect_sdk_payloads()

    payload = ToolBundleResultPayload.model_validate(payloads["toolBundleResult"])

    assert payload.bundle_id == "bundle-sdk-contract"
    assert payload.status == "success"
    assert [step.status for step in payload.step_results] == ["ok", "ok"]
    assert payload.step_results[0].model_dump()["toolCallId"] == "call-bundle-readme"
    assert payload.step_results[1].model_dump()["toolCallId"] == "call-bundle-package"


def test_sdk_rehydrate_projection_matches_backend_ingress_schema():
    payloads = _collect_sdk_payloads()

    payload = RehydrateConversationPayload.model_validate(payloads["rehydratePayload"])

    assert payload.conversation_ref == "conv-sdk-backend-contract"
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


def test_backend_query_payload_rejects_turn_ref_context_field():
    payload = {
        "text": "hello",
        "conversation_ref": "conv-sdk-backend-contract",
        "turn_ref": "turn-contract",
    }

    with pytest.raises(Exception) as exc_info:
        QueryPayload.model_validate(payload)

    assert "turn_ref" in str(exc_info.value)


def test_sdk_build_prerequisite_reason_when_npm_is_missing(monkeypatch):
    def fake_which(name):
        if name in {"npm", "npm.cmd"}:
            return None
        return f"/usr/bin/{name}"

    monkeypatch.setattr(shutil, "which", fake_which)

    assert _sdk_build_prerequisite_skip_reason() == (
        "npm is required for SDK/backend contract tests"
    )


def test_sdk_build_prerequisite_reason_when_dependencies_are_missing(
    tmp_path,
    monkeypatch,
):
    package_dir = tmp_path / "windie-sdk-js"
    package_dir.mkdir()
    monkeypatch.setattr(shutil, "which", lambda name: f"/usr/bin/{name}")

    assert _sdk_build_prerequisite_skip_reason(package_dir) == (
        "packages/windie-sdk-js dependencies are not installed; "
        "run npm install in that package to enable SDK/backend contract tests"
    )
