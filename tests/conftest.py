"""Covers conftest behavior in the conftest.py test suite."""

import os
import warnings


os.environ.setdefault("JOBLIB_TEMP_FOLDER", "/tmp")
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")

warnings.filterwarnings(
    "ignore",
    message=".*joblib will operate in serial mode.*",
    category=UserWarning,
)
warnings.filterwarnings(
    "ignore",
    message=".*CUDA initialization: Unexpected error from cudaGetDeviceCount.*",
    category=UserWarning,
)
warnings.filterwarnings(
    "ignore",
    message="There is no current event loop",
    category=DeprecationWarning,
)
