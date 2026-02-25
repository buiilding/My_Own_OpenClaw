---
summary: "Deep reference for simulation coordinate-resolver shim: re-export-only module contract and guaranteed parity with production OCR/vision coordinate resolver classes."
read_when:
  - When changing `backend/src/simulation/coordinate_resolver.py` exports.
  - When changing production coordinate resolver class names/locations and keeping simulation import compatibility intact.
title: "Coordinate Resolver Re-Export and Production Parity Contract Reference"
---

# Coordinate Resolver Re-Export and Production Parity Contract Reference

## Canonical Modules

- `backend/src/simulation/coordinate_resolver.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`

## Module Contract

`backend/src/simulation/coordinate_resolver.py` is a compatibility shim.

It performs only re-export behavior:

- imports `OcrResolver`, `VisionResolver`, `CoordinateResolver` from production resolver module
- re-publishes the same names in `__all__`

No simulation-specific logic is implemented here.

## Behavioral Parity Guarantee

Simulation mode should use the exact same coordinate resolution classes as production.

Implication:

- OCR/prediction coordinate behavior differences between production and simulation are not expected to originate from this shim module.

## Backward Compatibility Boundary

The shim exists so older simulation imports keep working even if call sites import from `backend.src.simulation.coordinate_resolver`.

Breaking this module path/export list can break existing simulation tooling/tests that rely on legacy import location.

## Drift Hotspots

1. Renaming resolver classes upstream without updating this shim breaks simulation imports.
2. Introducing simulation-only resolver forks here would violate parity guarantee and split behavior from production.
3. Removing `__all__` export list can change `from ... import *` compatibility expectations.

## Related Pages

- [Backend Simulation Contracts Docs Hub](README.md)
- [Simulation Backend and Mock LLM Runtime Reference](../simulation_backend_and_mock_llm_runtime_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../../tools/tool_preparation_and_coordinate_resolution_reference.md)
