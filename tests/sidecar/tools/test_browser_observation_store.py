import asyncio

from tools.browser.observation_store import BrowserObservationStore


def test_console_messages_filter_limit_and_clear():
    store = BrowserObservationStore()
    target_id = "tab-1"
    store.record_console_message(target_id, {"type": "log", "text": "one"})
    store.record_console_message(target_id, {"type": "error", "text": "two"})
    store.record_console_message(target_id, {"type": "log", "text": "three"})

    assert [m["text"] for m in store.get_console_messages(target_id, level="log")] == [
        "one",
        "three",
    ]
    assert [m["text"] for m in store.get_console_messages(target_id, limit=1)] == [
        "three"
    ]
    assert store.get_console_messages(target_id, clear=True)
    assert store.get_console_messages(target_id) == []


def test_network_request_lifecycle_updates_existing_record():
    store = BrowserObservationStore()
    target_id = "tab-1"

    class Request:
        method = "GET"
        url = "https://example.com"
        resource_type = "document"
        failure = {"errorText": "dns failed"}

    class Response:
        def __init__(self, request):
            self.request = request
            self.status = 200
            self.ok = True

    req = Request()
    store.record_network_request(
        target_id,
        req,
        {
            "timestamp": "now",
            "method": req.method,
            "url": req.url,
            "resource_type": req.resource_type,
        },
    )
    store.record_network_response(target_id, Response(req))
    records = store.get_network_requests(target_id)
    assert records[0]["status"] == 200
    assert records[0]["ok"] is True

    store.record_network_request_failed(target_id, req)
    failed_records = store.get_network_requests(target_id)
    assert failed_records[0]["ok"] is False
    assert failed_records[0]["failure_text"] == "dns failed"


def test_dialog_waiters_receive_event_and_are_pruned():
    store = BrowserObservationStore()
    target_id = "tab-1"
    loop = asyncio.new_event_loop()
    try:
        waiter = loop.create_future()
        store.add_dialog_waiter(target_id, waiter)
        event = {"type": "alert", "message": "hello"}
        store.resolve_dialog_waiters(target_id, event)

        assert waiter.done() is True
        assert waiter.result() == event
        assert store.dialog_waiters_by_tab[target_id] == []
    finally:
        loop.close()
