"""Imperative browser action execution for BrowserController."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from tools.browser.role_snapshot import parse_role_ref

if TYPE_CHECKING:
    from tools.browser.controller import BrowserController

logger = logging.getLogger(__name__)


class BrowserActionExecutor:
    """Own imperative page actions while BrowserController stays the public facade."""

    def __init__(self, controller: "BrowserController") -> None:
        self._controller = controller

    @property
    def _page(self):
        return self._controller._page

    @property
    def _context(self):
        return self._controller._context

    @property
    def _trace_active(self) -> bool:
        return self._controller._trace_active

    @_trace_active.setter
    def _trace_active(self, value: bool) -> None:
        self._controller._trace_active = value

    def _resolve_ref_locator(self, ref: str):
        if not self._page:
            raise RuntimeError("Browser not connected")

        role_ref_key = parse_role_ref(ref)
        if role_ref_key:
            role_ref = self._controller._get_role_ref(role_ref_key, self._page)
            if role_ref:
                try:
                    frame_selector = self._controller._get_role_frame_selector(self._page)
                    root = (
                        self._page.frame_locator(frame_selector)
                        if frame_selector
                        else self._page
                    )
                    role_locator_kwargs: Dict[str, Any] = {}
                    if role_ref.name:
                        role_locator_kwargs["name"] = role_ref.name
                    locator = root.get_by_role(role_ref.role, **role_locator_kwargs)
                    if role_ref.nth is not None:
                        locator = locator.nth(role_ref.nth)
                    return locator
                except Exception as exc:
                    logger.debug("Role ref resolution failed for %s: %s", ref, exc)

        return self._page.locator(f"[data-windie-ref='{ref}'], [aria-ref='{ref}']")

    async def _resolve_click_locator(self, ref: str) -> tuple[Any, Dict[str, Any]]:
        locator = self._resolve_ref_locator(ref)
        resolution_meta: Dict[str, Any] = {}
        role_ref_key = parse_role_ref(ref)
        if not role_ref_key or not self._page:
            return locator, resolution_meta

        role_ref = self._controller._get_role_ref(role_ref_key, self._page)
        if role_ref and role_ref.nth is not None:
            return locator, resolution_meta

        try:
            count = await locator.count()
        except Exception:
            return locator, resolution_meta

        if count <= 1:
            return locator, resolution_meta
        resolution_meta["candidate_count"] = count

        viewport_width = 0.0
        viewport_height = 0.0
        try:
            viewport = getattr(self._page, "viewport_size", None)
            if isinstance(viewport, dict):
                viewport_width = float(viewport.get("width") or 0.0)
                viewport_height = float(viewport.get("height") or 0.0)
        except Exception:
            viewport_width = 0.0
            viewport_height = 0.0

        has_viewport = viewport_width > 0 and viewport_height > 0
        visible_candidates: list[tuple[int, Any]] = []
        in_viewport_candidates: list[tuple[int, Any]] = []
        max_probe = min(count, 25)
        for idx in range(max_probe):
            candidate = locator.nth(idx)
            try:
                if not await candidate.is_visible():
                    continue
            except Exception:
                continue

            visible_candidates.append((idx, candidate))
            if not has_viewport:
                continue

            try:
                box = await candidate.bounding_box()
                if not isinstance(box, dict):
                    continue
                x = float(box.get("x") or 0.0)
                y = float(box.get("y") or 0.0)
                w = float(box.get("width") or 0.0)
                h = float(box.get("height") or 0.0)
                intersects_viewport = (
                    w > 0
                    and h > 0
                    and x < viewport_width
                    and y < viewport_height
                    and (x + w) > 0
                    and (y + h) > 0
                )
                if intersects_viewport:
                    in_viewport_candidates.append((idx, candidate))
            except Exception:
                continue

        if has_viewport and len(in_viewport_candidates) == 1:
            idx, candidate = in_viewport_candidates[0]
            resolution_meta["candidate_index"] = idx
            return candidate, resolution_meta

        if len(visible_candidates) == 1:
            idx, candidate = visible_candidates[0]
            resolution_meta["candidate_index"] = idx
            return candidate, resolution_meta

        if not visible_candidates:
            return locator, resolution_meta

        visible_count = (
            len(in_viewport_candidates) if has_viewport else len(visible_candidates)
        )
        scope = "in viewport" if has_viewport else "visible"
        raise RuntimeError(
            f"Ambiguous role ref '{ref}': matched {count} elements; "
            f"{visible_count} are {scope}. Take a fresh snapshot and use a more specific ref."
        )

    @staticmethod
    def _is_recoverable_click_error(error_text: str) -> bool:
        lowered = str(error_text or "").lower()
        if not lowered:
            return False
        recoverable_markers = (
            "intercepts pointer events",
            "another element would receive",
            "outside of the viewport",
            "not visible",
            "not stable",
            "element is detached",
            "timeout",
        )
        return any(marker in lowered for marker in recoverable_markers)

    async def _try_select_option_click_fallback(
        self,
        locator: Any,
        *,
        ref: str,
        resolution_meta: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        try:
            select_target = await locator.evaluate(
                """
                (el) => {
                  const tag = (el.tagName || "").toLowerCase();
                  if (tag === "option") {
                    const select = el.closest("select");
                    if (!select) return null;
                    const selected = select.selectedOptions && select.selectedOptions[0];
                    const selectedLabel = selected
                      ? (selected.textContent || "").trim()
                      : "";
                    return {
                      source_tag: "option",
                      use_ancestor_select: true,
                      value: String(el.value || ""),
                      label: (el.textContent || "").trim(),
                      current_value: String(select.value || ""),
                      current_label: selectedLabel,
                    };
                  }
                  if (tag === "select") {
                    const selected = el.selectedOptions && el.selectedOptions[0];
                    const selectedLabel = selected
                      ? (selected.textContent || "").trim()
                      : "";
                    return {
                      source_tag: "select",
                      use_ancestor_select: false,
                      value: String(el.value || ""),
                      label: selectedLabel,
                      current_value: String(el.value || ""),
                      current_label: selectedLabel,
                    };
                  }
                  return null;
                }
                """
            )
        except Exception:
            return None

        if not isinstance(select_target, dict):
            return None

        source_tag = str(select_target.get("source_tag") or "")
        target_locator = locator
        if bool(select_target.get("use_ancestor_select")):
            target_locator = locator.locator("xpath=ancestor::select[1]")

        current_value = select_target.get("current_value")
        value = select_target.get("value")
        label = select_target.get("label")
        current_label = select_target.get("current_label")

        try:
            selected: List[str]
            if isinstance(value, str) and value:
                selected = await target_locator.select_option(value=value)
            elif isinstance(current_value, str) and current_value:
                selected = await target_locator.select_option(value=current_value)
            elif isinstance(label, str) and label:
                selected = await target_locator.select_option(label=label)
            elif isinstance(current_label, str) and current_label:
                selected = await target_locator.select_option(label=current_label)
            else:
                return None
        except Exception:
            return None

        return {
            "success": True,
            "action": "click",
            "ref": ref,
            "forced": True,
            "strategy": "select_option",
            "source_tag": source_tag,
            "selected": selected,
            **resolution_meta,
        }

    async def trace_start(
        self, *, snapshots: bool = True, screenshots: bool = True, sources: bool = True
    ) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        if self._trace_active:
            return {"success": False, "error": "Trace already active"}
        try:
            await self._context.tracing.start(
                snapshots=snapshots,
                screenshots=screenshots,
                sources=sources,
            )
            self._trace_active = True
            return {"success": True}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def trace_stop(self) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        if not self._trace_active:
            return {"success": False, "error": "Trace is not active"}
        trace_path = Path(tempfile.mkdtemp(prefix="windieos_trace_")) / "trace.zip"
        try:
            await self._context.tracing.stop(path=str(trace_path))
            trace_bytes = trace_path.read_bytes()
            self._trace_active = False
            return {"success": True, "trace_bytes": trace_bytes}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def get_cookies(self) -> List[Dict[str, Any]]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        return await self._context.cookies()

    async def set_cookies(self, cookies: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.add_cookies(cookies)
            return {"success": True, "count": len(cookies)}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def clear_cookies(self) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.clear_cookies()
            return {"success": True}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def get_storage(self, kind: str) -> Dict[str, str]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        storage_name = "localStorage" if kind == "local" else "sessionStorage"
        script = f"""
            () => {{
                const out = {{}};
                for (let i = 0; i < window.{storage_name}.length; i++) {{
                    const key = window.{storage_name}.key(i);
                    if (key !== null) {{
                        out[key] = window.{storage_name}.getItem(key) ?? "";
                    }}
                }}
                return out;
            }}
        """
        result = await self._page.evaluate(script)
        return result if isinstance(result, dict) else {}

    async def set_storage(self, kind: str, values: Dict[str, str]) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        storage_name = "localStorage" if kind == "local" else "sessionStorage"
        script = f"""
            (vals) => {{
                for (const [k, v] of Object.entries(vals)) {{
                    window.{storage_name}.setItem(String(k), String(v));
                }}
                return true;
            }}
        """
        await self._page.evaluate(script, values)
        return {"success": True, "count": len(values)}

    async def clear_storage(self, kind: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        storage_name = "localStorage" if kind == "local" else "sessionStorage"
        await self._page.evaluate(f"() => window.{storage_name}.clear()")
        return {"success": True}

    async def set_offline(self, offline: bool) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.set_offline(offline)
            return {"success": True, "offline": offline}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def set_headers(self, headers: Dict[str, str]) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.set_extra_http_headers(headers)
            return {"success": True, "header_count": len(headers)}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def set_http_credentials(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        clear: bool = False,
    ) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            if clear:
                await self._context.set_http_credentials(None)
            else:
                if username is None or password is None:
                    return {
                        "success": False,
                        "error": "username/password required unless clear=true",
                    }
                await self._context.set_http_credentials(
                    {"username": username, "password": password}
                )
            return {"success": True, "cleared": clear}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def set_geolocation(
        self,
        *,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        accuracy: Optional[float] = None,
        clear: bool = False,
    ) -> Dict[str, Any]:
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            if clear:
                await self._context.set_geolocation(None)
                return {"success": True, "cleared": True}
            if latitude is None or longitude is None:
                return {
                    "success": False,
                    "error": "latitude/longitude required unless clear=true",
                }
            geo: Dict[str, Any] = {
                "latitude": float(latitude),
                "longitude": float(longitude),
            }
            if accuracy is not None:
                geo["accuracy"] = float(accuracy)
            await self._context.grant_permissions(["geolocation"])
            await self._context.set_geolocation(geo)
            return {"success": True, "geolocation": geo}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def set_media(
        self, media: Optional[str] = None, color_scheme: Optional[str] = None
    ) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            kwargs: Dict[str, Any] = {}
            if media:
                kwargs["media"] = media
            if color_scheme:
                kwargs["color_scheme"] = color_scheme
            await self._page.emulate_media(**kwargs)
            return {"success": True, "media": media, "color_scheme": color_scheme}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def set_timezone(self, timezone: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                "Dynamic timezone updates are not supported for an already-running context. "
                "Reconnect with a context configured for the desired timezone."
            ),
            "requested_timezone": timezone,
        }

    async def set_locale(self, locale: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error": (
                "Dynamic locale updates are not supported for an already-running context. "
                "Reconnect with a context configured for the desired locale."
            ),
            "requested_locale": locale,
        }

    async def set_device(self, device: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        preset = device.strip().lower()
        presets: Dict[str, Dict[str, int]] = {
            "iphone 14": {"width": 390, "height": 844},
            "iphone 14 pro": {"width": 393, "height": 852},
            "iphone se": {"width": 375, "height": 667},
            "pixel 7": {"width": 412, "height": 915},
            "ipad": {"width": 810, "height": 1080},
        }
        target = presets.get(preset)
        if not target:
            return {"success": False, "error": f"Unknown device preset: {device}"}
        return await self.resize_viewport(target["width"], target["height"])

    async def click(
        self,
        ref: str,
        double_click: bool = False,
        button: str = "left",
    ) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            locator, resolution_meta = await self._resolve_click_locator(ref)
        except Exception as resolve_error:
            return {"success": False, "error": str(resolve_error)}

        default_click_timeout_ms = 2500
        force_click_timeout_ms = 1500

        try:
            if double_click:
                await locator.dblclick(button=button, timeout=default_click_timeout_ms)
                strategy = "dblclick"
            else:
                await locator.click(button=button, timeout=default_click_timeout_ms)
                strategy = "playwright"
            return {
                "success": True,
                "action": "click",
                "ref": ref,
                "strategy": strategy,
                **resolution_meta,
            }
        except Exception as exc:
            error_text = str(exc)
            logger.warning("Click failed, retrying with fallback: %s", error_text)
            recoverable = self._is_recoverable_click_error(error_text)

            if not double_click and recoverable:
                if button == "left":
                    select_fallback_result = await self._try_select_option_click_fallback(
                        locator,
                        ref=ref,
                        resolution_meta=resolution_meta,
                    )
                    if select_fallback_result is not None:
                        return select_fallback_result

                try:
                    await locator.click(
                        button=button,
                        force=True,
                        timeout=force_click_timeout_ms,
                    )
                    return {
                        "success": True,
                        "action": "click",
                        "ref": ref,
                        "forced": True,
                        "strategy": "force",
                        **resolution_meta,
                    }
                except Exception as force_error:
                    error_text = str(force_error)

                if button == "left":
                    try:
                        await locator.evaluate("el => el.click()")
                        return {
                            "success": True,
                            "action": "click",
                            "ref": ref,
                            "forced": True,
                            "method": "dom",
                            "strategy": "dom",
                            **resolution_meta,
                        }
                    except Exception as dom_error:
                        error_text = str(dom_error)

            logger.error("Click failed after fallbacks: %s", error_text)
            return {"success": False, "error": error_text}

    async def type_text(
        self,
        ref: str,
        text: str,
        submit: bool = False,
        clear_first: bool = True,
    ) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            locator = self._resolve_ref_locator(ref)

            if clear_first:
                await locator.fill(text)
            else:
                await locator.type(text)

            if submit:
                await locator.press("Enter")

            return {"success": True, "action": "type", "ref": ref, "text": text}
        except Exception as exc:
            logger.error("Type failed: %s", exc)
            return {"success": False, "error": str(exc)}

    async def press_key(self, key: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            await self._page.keyboard.press(key)
            return {"success": True, "action": "press", "key": key}
        except Exception as exc:
            logger.error("Key press failed: %s", exc)
            return {"success": False, "error": str(exc)}

    async def scroll(
        self,
        direction: str = "down",
        amount: int = 500,
    ) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            if direction == "down":
                await self._page.mouse.wheel(0, amount)
            elif direction == "up":
                await self._page.mouse.wheel(0, -amount)
            elif direction == "left":
                await self._page.mouse.wheel(-amount, 0)
            elif direction == "right":
                await self._page.mouse.wheel(amount, 0)

            return {"success": True, "action": "scroll", "direction": direction}
        except Exception as exc:
            logger.error("Scroll failed: %s", exc)
            return {"success": False, "error": str(exc)}

    async def screenshot(
        self,
        full_page: bool = False,
        ref: Optional[str] = None,
        element: Optional[str] = None,
        image_type: str = "png",
        quality: Optional[int] = None,
    ) -> bytes:
        if not self._page:
            raise RuntimeError("Browser not connected")

        if full_page and (ref or element):
            raise ValueError("full_page cannot be combined with ref/element screenshot")
        if ref and element:
            raise ValueError("Specify only one of ref or element")

        screenshot_args: Dict[str, Any] = {
            "type": "jpeg" if image_type == "jpeg" else "png"
        }
        if screenshot_args["type"] == "jpeg" and quality is not None:
            screenshot_args["quality"] = max(1, min(100, int(quality)))

        if ref:
            locator = self._resolve_ref_locator(ref)
            return await locator.screenshot(**screenshot_args)
        if element:
            locator = self._page.locator(element)
            return await locator.screenshot(**screenshot_args)
        return await self._page.screenshot(
            full_page=full_page,
            **screenshot_args,
        )

    async def pdf(self) -> bytes:
        if not self._page:
            raise RuntimeError("Browser not connected")
        return await self._page.pdf(print_background=True)

    async def hover(self, ref: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            await locator.hover()
            return {"success": True, "action": "hover", "ref": ref}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def drag(self, start_ref: str, end_ref: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            start = self._resolve_ref_locator(start_ref)
            end = self._resolve_ref_locator(end_ref)
            await start.drag_to(end)
            return {
                "success": True,
                "action": "drag",
                "start_ref": start_ref,
                "end_ref": end_ref,
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def select_options(self, ref: str, values: List[str]) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            selected = await locator.select_option(values)
            return {
                "success": True,
                "action": "select",
                "ref": ref,
                "selected": selected,
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def get_dropdown_options(self, ref: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            details = await locator.evaluate(
                """element => {
                    const select = element.tagName?.toLowerCase() === "select"
                        ? element
                        : element.closest?.("select");
                    if (!select) {
                        return {
                            ok: false,
                            error: "Resolved element is not inside a <select> dropdown",
                        };
                    }
                    return {
                        ok: true,
                        options: Array.from(select.options).map((option, index) => ({
                            index,
                            text: option.textContent?.trim() || "",
                            value: option.value ?? "",
                            selected: Boolean(option.selected),
                            disabled: Boolean(option.disabled),
                        })),
                        selected_value: select.value ?? "",
                        selected_index: Number.isInteger(select.selectedIndex)
                            ? select.selectedIndex
                            : null,
                    };
                }"""
            )
            if not isinstance(details, dict):
                return {
                    "success": False,
                    "error": "Dropdown inspection returned invalid response",
                }
            if not details.get("ok"):
                return {
                    "success": False,
                    "error": str(
                        details.get(
                            "error",
                            "Resolved element is not inside a <select> dropdown",
                        )
                    ),
                }
            return {
                "success": True,
                "action": "dropdown_options",
                "ref": ref,
                "options": list(details.get("options") or []),
                "selected_value": details.get("selected_value"),
                "selected_index": details.get("selected_index"),
            }
        except Exception as exc:
            logger.error("Dropdown option lookup failed: %s", exc)
            return {"success": False, "error": str(exc)}

    async def select_dropdown(self, ref: str, text: str) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            details = await locator.evaluate(
                """(element, targetText) => {
                    const select = element.tagName?.toLowerCase() === "select"
                        ? element
                        : element.closest?.("select");
                    if (!select) {
                        return {
                            ok: false,
                            error: "Resolved element is not inside a <select> dropdown",
                        };
                    }
                    const normalizedTarget = String(targetText ?? "").trim();
                    const options = Array.from(select.options);
                    const exactValueMatch = options.find(
                        option => String(option.value ?? "") === normalizedTarget
                    );
                    const exactTextMatch = options.find(
                        option => (option.textContent?.trim() || "") === normalizedTarget
                    );
                    const option = exactValueMatch || exactTextMatch;
                    if (!option) {
                        return {
                            ok: false,
                            error: `No dropdown option matched '${normalizedTarget}'`,
                        };
                    }
                    select.value = option.value;
                    option.selected = true;
                    select.dispatchEvent(new Event("input", { bubbles: true }));
                    select.dispatchEvent(new Event("change", { bubbles: true }));
                    return {
                        ok: true,
                        selected_value: option.value ?? "",
                        selected_text: option.textContent?.trim() || "",
                    };
                }""",
                text,
            )
            if not isinstance(details, dict):
                return {
                    "success": False,
                    "error": "Dropdown selection returned invalid response",
                }
            if not details.get("ok"):
                return {
                    "success": False,
                    "error": str(
                        details.get(
                            "error",
                            "Resolved element is not inside a <select> dropdown",
                        )
                    ),
                }
            return {
                "success": True,
                "action": "select_dropdown",
                "ref": ref,
                "selected": [
                    {
                        "value": details.get("selected_value", ""),
                        "text": details.get("selected_text", ""),
                    }
                ],
                "selected_value": details.get("selected_value"),
                "selected_text": details.get("selected_text"),
            }
        except Exception as exc:
            logger.error("Dropdown selection failed: %s", exc)
            return {"success": False, "error": str(exc)}

    async def set_input_files(self, ref: str, paths: List[str]) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            await locator.set_input_files(paths)
            return {"success": True, "action": "upload", "ref": ref, "paths": paths}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def fill_fields(self, fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")

        filled = 0
        errors: List[Dict[str, str]] = []
        for item in fields:
            ref = item.get("ref")
            text = item.get("text")
            if not isinstance(ref, str) or not isinstance(text, str):
                errors.append(
                    {
                        "ref": str(ref),
                        "error": "Each field must include string ref/text",
                    }
                )
                continue

            result = await self.type_text(
                ref=ref, text=text, submit=False, clear_first=True
            )
            if result.get("success"):
                filled += 1
            else:
                errors.append(
                    {"ref": ref, "error": str(result.get("error", "fill failed"))}
                )

        return {
            "success": len(errors) == 0,
            "action": "fill",
            "filled": filled,
            "errors": errors,
        }

    async def resize_viewport(self, width: int, height: int) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            w = max(1, int(width))
            h = max(1, int(height))
            await self._page.set_viewport_size({"width": w, "height": h})
            return {"success": True, "action": "resize", "width": w, "height": h}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def wait_for_load(
        self,
        state: str = "networkidle",
        timeout: int = 30000,
    ) -> Dict[str, Any]:
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            await self._page.wait_for_load_state(state, timeout=timeout)
            return {"success": True, "state": state}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def evaluate(self, script: str) -> Any:
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            result = await self._page.evaluate(script)
            return {"success": True, "result": result}
        except Exception as exc:
            return {"success": False, "error": str(exc)}
