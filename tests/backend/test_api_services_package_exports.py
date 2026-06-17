"""Covers the API services package import surface."""

import importlib


def test_api_services_package_is_marker_only():
    services = importlib.import_module("backend.src.api.services")

    assert not hasattr(services, "__all__")
    assert not hasattr(services, "QueryExecutionService")
    assert not hasattr(services, "WakewordExecutionService")
