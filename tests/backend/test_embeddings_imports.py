"""Covers embeddings imports behavior in the backend test suite."""

import builtins
import importlib
import sys

import pytest


def test_embedding_module_import_does_not_require_sentence_transformers(monkeypatch):
    sys.modules.pop("backend.src.embeddings.embeddings", None)

    original_import = builtins.__import__

    def blocked_import(name, *args, **kwargs):
        if name == "sentence_transformers":
            raise AssertionError("sentence_transformers should not be imported eagerly")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked_import)

    module = importlib.import_module("backend.src.embeddings.embeddings")

    assert module.is_cuda_error(RuntimeError("CUDA out of memory"))


def test_local_embedding_provider_reports_missing_sentence_transformers(monkeypatch):
    from backend.src.embeddings.embeddings import _load_sentence_transformer_class

    original_import = builtins.__import__

    def blocked_import(name, *args, **kwargs):
        if name == "sentence_transformers":
            raise ImportError(name)
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked_import)

    with pytest.raises(RuntimeError, match="Local embeddings require sentence-transformers"):
        _load_sentence_transformer_class()
