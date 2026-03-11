"""macOS Apple Events automation permission helpers."""

from __future__ import annotations

import ctypes
import platform
import subprocess
from ctypes import byref, c_bool, c_int16, c_int32, c_size_t, c_uint32, c_void_p
from typing import Any, Callable

AE_FRAMEWORK_PATH = (
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/AE.framework/AE"
)
SYSTEM_EVENTS_APP_NAME = "System Events"
SYSTEM_EVENTS_BUNDLE_ID = "com.apple.systemevents"
ERR_AE_EVENT_NOT_PERMITTED = -1743
ERR_AE_EVENT_WOULD_REQUIRE_USER_CONSENT = -1744
ERR_PROC_NOT_FOUND = -600


class AEDesc(ctypes.Structure):
    _fields_ = [
        ("descriptorType", c_uint32),
        ("dataHandle", c_void_p),
    ]

def _four_char_code(value: str) -> int:
    return int.from_bytes(value.encode("mac_roman"), "big")


def _launch_system_events(
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    try:
        result = runner(
            ["open", "-ga", SYSTEM_EVENTS_APP_NAME],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
        return {
            "success": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout or "",
            "stderr": result.stderr or "",
        }
    except Exception as error:  # pragma: no cover - defensive runtime fallback
        return {
            "success": False,
            "returncode": None,
            "stdout": "",
            "stderr": "",
            "error": str(error),
        }


def _load_ae_framework() -> ctypes.CDLL:
    return ctypes.CDLL(AE_FRAMEWORK_PATH)


def _build_target_desc(ae_framework: ctypes.CDLL, bundle_id: str) -> AEDesc:
    ae_framework.AECreateDesc.argtypes = [c_uint32, c_void_p, c_size_t, ctypes.POINTER(AEDesc)]
    ae_framework.AECreateDesc.restype = c_int16

    target_desc = AEDesc()
    payload = bundle_id.encode("utf-8")
    status = ae_framework.AECreateDesc(
        _four_char_code("bund"),
        ctypes.c_char_p(payload),
        len(payload),
        byref(target_desc),
    )
    if status != 0:
        raise RuntimeError(f"AECreateDesc failed with status {status}")
    return target_desc


def determine_system_events_automation_permission(
    ask_user_if_needed: bool = False,
    *,
    ae_framework_loader: Callable[[], ctypes.CDLL] = _load_ae_framework,
    launch_runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    if platform.system() != "Darwin":
        return {
            "granted": False,
            "reason": "System Events automation permission is only available on macOS.",
            "details": {
                "platform": platform.system(),
                "supported": False,
            },
        }

    launch_result = _launch_system_events(launch_runner)

    try:
        ae_framework = ae_framework_loader()
    except Exception as error:
        return {
            "granted": False,
            "reason": "Apple Events framework is unavailable.",
            "details": {
                "framework_load_error": str(error),
                "launch_result": launch_result,
            },
        }

    ae_framework.AEDisposeDesc.argtypes = [ctypes.POINTER(AEDesc)]
    ae_framework.AEDisposeDesc.restype = c_int16
    ae_framework.AEDeterminePermissionToAutomateTarget.argtypes = [
        ctypes.POINTER(AEDesc),
        c_uint32,
        c_uint32,
        c_bool,
    ]
    ae_framework.AEDeterminePermissionToAutomateTarget.restype = c_int32

    target_desc = None
    try:
        target_desc = _build_target_desc(ae_framework, SYSTEM_EVENTS_BUNDLE_ID)
        status = ae_framework.AEDeterminePermissionToAutomateTarget(
            byref(target_desc),
            _four_char_code("aevt"),
            _four_char_code("oapp"),
            ask_user_if_needed,
        )
    except Exception as error:
        return {
            "granted": False,
            "reason": "Failed to determine macOS automation permission.",
            "details": {
                "error": str(error),
                "launch_result": launch_result,
            },
        }
    finally:
        if target_desc is not None:
            try:
                ae_framework.AEDisposeDesc(byref(target_desc))
            except Exception:
                pass

    details = {
        "ask_user_if_needed": ask_user_if_needed,
        "target_bundle_id": SYSTEM_EVENTS_BUNDLE_ID,
        "os_status": int(status),
        "launch_result": launch_result,
    }

    if status == 0:
        return {
            "granted": True,
            "reason": "System Events automation permission is granted.",
            "details": details,
        }

    if status == ERR_AE_EVENT_WOULD_REQUIRE_USER_CONSENT:
        return {
            "granted": False,
            "reason": (
                "WindieOS still needs permission to control System Events. "
                "Click Grant to show the macOS Automation prompt."
            ),
            "details": {
                **details,
                "needs_user_consent": True,
            },
        }

    if status == ERR_AE_EVENT_NOT_PERMITTED:
        return {
            "granted": False,
            "reason": (
                "System Events automation was denied. Re-enable WindieOS in "
                "System Settings > Privacy & Security > Automation."
            ),
            "details": {
                **details,
                "denied": True,
            },
        }

    if status == ERR_PROC_NOT_FOUND:
        return {
            "granted": False,
            "reason": "System Events is unavailable on this macOS session.",
            "details": details,
        }

    return {
        "granted": False,
        "reason": f"System Events automation permission check failed with status {status}.",
        "details": details,
    }
