# Provides the setup windows module for the backend.

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "[backend/setup-windows] Installing backend requirements..."
python -m pip install -r .\requirements.txt

Write-Host "[backend/setup-windows] Installing CUDA-enabled PyTorch wheels..."
python -m pip install --upgrade --index-url https://download.pytorch.org/whl/cu128 torch torchvision torchaudio

Write-Host "[backend/setup-windows] Removing CPU ONNX Runtime package..."
python -m pip uninstall -y onnxruntime

Write-Host "[backend/setup-windows] Installing GPU ONNX Runtime package..."
python -m pip install onnxruntime-gpu

Write-Host "[backend/setup-windows] Done."
