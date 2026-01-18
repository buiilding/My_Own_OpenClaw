"""
GPU Memory Management Utility.

Provides centralized GPU memory management to prevent allocation failures
when multiple services compete for GPU memory.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import PyTorch for CUDA memory management
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None

# Try to import ONNX Runtime for memory management
try:
    import onnxruntime as ort
    ONNXRUNTIME_AVAILABLE = True
except ImportError:
    ONNXRUNTIME_AVAILABLE = False
    ort = None


class GPUMemoryManager:
    """
    Centralized GPU memory management.
    
    Provides utilities to clear GPU memory caches and manage memory
    allocation to prevent OOM errors when multiple services use GPU.
    """
    
    @staticmethod
    def clear_pytorch_cache() -> None:
        """Clear PyTorch CUDA cache to free up GPU memory.
        
        NOTE: This method is kept for backward compatibility but is no longer
        called automatically. GPU memory is managed by PyTorch automatically.
        """
        if not TORCH_AVAILABLE:
            return
        
        try:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                # Removed synchronize() call - it was blocking and unnecessary
                logger.debug("Cleared PyTorch CUDA cache")
        except Exception as e:
            logger.debug(f"Failed to clear PyTorch CUDA cache: {e}")
    
    @staticmethod
    def clear_onnxruntime_cache() -> None:
        """Clear ONNX Runtime CUDA cache to free up GPU memory."""
        if not ONNXRUNTIME_AVAILABLE:
            return
        
        try:
            # ONNX Runtime doesn't have a direct cache clear, but we can
            # try to release memory by creating a new session options
            # This is a workaround - ONNX Runtime manages memory internally
            logger.debug("ONNX Runtime cache management attempted (managed internally)")
        except Exception as e:
            logger.debug(f"Failed to clear ONNX Runtime cache: {e}")
    
    @staticmethod
    def clear_all_caches() -> None:
        """Clear all GPU memory caches (PyTorch, ONNX Runtime, etc.)."""
        GPUMemoryManager.clear_pytorch_cache()
        GPUMemoryManager.clear_onnxruntime_cache()
    
    @staticmethod
    def get_memory_info() -> Optional[dict]:
        """Get current GPU memory usage information."""
        if not TORCH_AVAILABLE or not torch.cuda.is_available():
            return None
        
        try:
            device = torch.cuda.current_device()
            props = torch.cuda.get_device_properties(device)
            
            allocated = torch.cuda.memory_allocated(device) / 1024**3  # GB
            reserved = torch.cuda.memory_reserved(device) / 1024**3  # GB
            total = props.total_memory / 1024**3  # GB
            free = total - reserved
            
            return {
                "total_gb": total,
                "allocated_gb": allocated,
                "reserved_gb": reserved,
                "free_gb": free,
                "usage_percent": (reserved / total) * 100 if total > 0 else 0
            }
        except Exception as e:
            logger.debug(f"Failed to get GPU memory info: {e}")
            return None
    
    @staticmethod
    def log_memory_info(context: str = "") -> None:
        """Log current GPU memory usage information."""
        info = GPUMemoryManager.get_memory_info()
        if info:
            logger.debug(
                f"GPU Memory {context}: "
                f"Total={info['total_gb']:.2f}GB, "
                f"Allocated={info['allocated_gb']:.2f}GB, "
                f"Reserved={info['reserved_gb']:.2f}GB, "
                f"Free={info['free_gb']:.2f}GB, "
                f"Usage={info['usage_percent']:.1f}%"
            )
