"""Tab-scoped browser observation state for BrowserController."""

from __future__ import annotations

import asyncio
from weakref import WeakKeyDictionary
from typing import Any, Dict, List, Optional, Set

from tools.browser.ref_registry import RefRegistry
from tools.browser.role_snapshot import RoleRef


class BrowserObservationStore:
    """Own ref registries and tab-scoped observation/event buffers."""

    def __init__(self) -> None:
        self.ref_registry_by_tab: Dict[str, RefRegistry] = {}
        self.role_refs_by_tab: Dict[str, Dict[str, RoleRef]] = {}
        self.role_refs_frame_by_tab: Dict[str, Optional[str]] = {}
        self.observed_tabs: Set[str] = set()
        self.console_messages_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self.dialog_events_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self.dialog_arms_by_tab: Dict[str, Dict[str, Any]] = {}
        self.dialog_waiters_by_tab: Dict[str, List[asyncio.Future]] = {}
        self.page_errors_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self.network_requests_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self.network_request_id_by_req: WeakKeyDictionary = WeakKeyDictionary()
        self.next_request_id_by_tab: Dict[str, int] = {}

    def get_ref_registry(self, target_id: str) -> RefRegistry:
        reg = self.ref_registry_by_tab.get(target_id)
        if reg is None:
            reg = RefRegistry()
            self.ref_registry_by_tab[target_id] = reg
        return reg

    def reset_ref_registry(self, target_id: str) -> None:
        reg = self.get_ref_registry(target_id)
        reg.reset()
        self.role_refs_by_tab.pop(target_id, None)
        self.role_refs_frame_by_tab.pop(target_id, None)

    def store_role_refs(
        self,
        target_id: str,
        refs: Dict[str, RoleRef],
        *,
        frame_selector: Optional[str] = None,
    ) -> None:
        self.role_refs_by_tab[target_id] = refs
        self.role_refs_frame_by_tab[target_id] = frame_selector

    def get_role_ref(self, target_id: str, ref: str) -> Optional[RoleRef]:
        refs = self.role_refs_by_tab.get(target_id)
        if not refs:
            return None
        return refs.get(ref)

    def get_role_frame_selector(self, target_id: str) -> Optional[str]:
        return self.role_refs_frame_by_tab.get(target_id)

    def mark_observed(self, target_id: str) -> bool:
        if not target_id or target_id in self.observed_tabs:
            return False
        self.observed_tabs.add(target_id)
        return True

    def record_console_message(self, target_id: str, entry: Dict[str, Any]) -> None:
        messages = self.console_messages_by_tab.setdefault(target_id, [])
        messages.append(entry)
        if len(messages) > 500:
            del messages[0 : len(messages) - 500]

    def get_console_messages(
        self,
        target_id: str,
        *,
        level: Optional[str] = None,
        limit: int = 100,
        clear: bool = False,
    ) -> List[Dict[str, Any]]:
        messages = list(self.console_messages_by_tab.get(target_id, []))
        if level:
            lvl = level.lower()
            messages = [m for m in messages if str(m.get("type", "")).lower() == lvl]
        if limit > 0:
            messages = messages[-limit:]
        if clear:
            self.console_messages_by_tab[target_id] = []
        return messages

    def record_dialog_event(self, target_id: str, entry: Dict[str, Any]) -> None:
        events = self.dialog_events_by_tab.setdefault(target_id, [])
        events.append(entry)
        if len(events) > 100:
            del events[0 : len(events) - 100]

    def arm_dialog(
        self,
        target_id: str,
        *,
        accept: bool = True,
        prompt_text: Optional[str] = None,
    ) -> None:
        self.dialog_arms_by_tab[target_id] = {
            "accept": accept,
            "prompt_text": prompt_text,
        }

    def pop_dialog_arm(self, target_id: str) -> Dict[str, Any]:
        return self.dialog_arms_by_tab.pop(
            target_id,
            {"accept": True, "prompt_text": None},
        )

    def add_dialog_waiter(self, target_id: str, waiter: asyncio.Future) -> None:
        self.dialog_waiters_by_tab.setdefault(target_id, []).append(waiter)

    def prune_dialog_waiter(self, target_id: str, waiter: asyncio.Future) -> None:
        waiters = self.dialog_waiters_by_tab.get(target_id, [])
        self.dialog_waiters_by_tab[target_id] = [w for w in waiters if w is not waiter]

    def resolve_dialog_waiters(
        self,
        target_id: str,
        event: Dict[str, Any],
    ) -> None:
        waiters = self.dialog_waiters_by_tab.get(target_id, [])
        for waiter in waiters:
            if waiter.done():
                continue
            waiter.set_result(event)
        self.dialog_waiters_by_tab[target_id] = [w for w in waiters if not w.done()]

    def get_dialog_events(
        self,
        target_id: str,
        *,
        limit: int = 20,
        clear: bool = False,
    ) -> List[Dict[str, Any]]:
        events = list(self.dialog_events_by_tab.get(target_id, []))
        if limit > 0:
            events = events[-limit:]
        if clear:
            self.dialog_events_by_tab[target_id] = []
        return events

    def record_page_error(self, target_id: str, entry: Dict[str, Any]) -> None:
        errors = self.page_errors_by_tab.setdefault(target_id, [])
        errors.append(entry)
        if len(errors) > 200:
            del errors[0 : len(errors) - 200]

    def get_page_errors(
        self,
        target_id: str,
        *,
        limit: int = 100,
        clear: bool = False,
    ) -> List[Dict[str, Any]]:
        errors = list(self.page_errors_by_tab.get(target_id, []))
        if limit > 0:
            errors = errors[-limit:]
        if clear:
            self.page_errors_by_tab[target_id] = []
        return errors

    def record_network_request(self, target_id: str, req: Any, entry: Dict[str, Any]) -> None:
        next_id = self.next_request_id_by_tab.get(target_id, 0) + 1
        self.next_request_id_by_tab[target_id] = next_id
        req_id = f"r{next_id}"
        self.network_request_id_by_req[req] = req_id

        records = self.network_requests_by_tab.setdefault(target_id, [])
        stored_entry = dict(entry)
        stored_entry["id"] = req_id
        records.append(stored_entry)
        if len(records) > 500:
            del records[0 : len(records) - 500]

    def record_network_response(self, target_id: str, response: Any) -> None:
        req = response.request
        req_id = self.network_request_id_by_req.get(req)
        if not req_id:
            return
        records = self.network_requests_by_tab.get(target_id, [])
        for record in reversed(records):
            if record.get("id") == req_id:
                record["status"] = response.status
                record["ok"] = response.ok
                break

    def record_network_request_failed(self, target_id: str, req: Any) -> None:
        req_id = self.network_request_id_by_req.get(req)
        if not req_id:
            return
        records = self.network_requests_by_tab.get(target_id, [])
        failure_text = None
        try:
            failure = req.failure
            failure_text = failure.get("errorText") if isinstance(failure, dict) else None
        except Exception:
            failure_text = None
        for record in reversed(records):
            if record.get("id") == req_id:
                record["failure_text"] = failure_text or "request failed"
                record["ok"] = False
                break

    def get_network_requests(
        self,
        target_id: str,
        *,
        limit: int = 100,
        contains: Optional[str] = None,
        clear: bool = False,
    ) -> List[Dict[str, Any]]:
        requests = list(self.network_requests_by_tab.get(target_id, []))
        if contains:
            needle = contains.lower()
            requests = [
                r
                for r in requests
                if needle in str(r.get("url", "")).lower()
                or needle in str(r.get("method", "")).lower()
            ]
        if limit > 0:
            requests = requests[-limit:]
        if clear:
            self.network_requests_by_tab[target_id] = []
        return requests

    def reset(self) -> None:
        self.ref_registry_by_tab.clear()
        self.role_refs_by_tab.clear()
        self.role_refs_frame_by_tab.clear()
        self.observed_tabs.clear()
        self.console_messages_by_tab.clear()
        self.dialog_events_by_tab.clear()
        self.dialog_arms_by_tab.clear()
        self.dialog_waiters_by_tab.clear()
        self.page_errors_by_tab.clear()
        self.network_requests_by_tab.clear()
        self.network_request_id_by_req = WeakKeyDictionary()
        self.next_request_id_by_tab.clear()
