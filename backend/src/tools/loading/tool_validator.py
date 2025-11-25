"""
Tool Validator Service.

This module provides validation services for tools, including manifest validation
and security scanning.
"""
import logging
from pathlib import Path
from typing import Optional

from backend.src.tools.marketplace.discovery.security import ToolSecurityScanner, SecurityScanResult
from backend.src.tools.marketplace.discovery.validator import ToolManifestValidator, ValidationResult

logger = logging.getLogger(__name__)


class ToolValidator:
    """
    Service for validating tools and their manifests.
    
    Provides a clean interface for tool validation operations,
    separating validation logic from loading/discovery.
    """
    
    def __init__(self):
        """Initialize the tool validator."""
        self._security_scanner = ToolSecurityScanner()
        self._manifest_validator = ToolManifestValidator()
    
    def validate_manifest(self, manifest_data: dict) -> ValidationResult:
        """
        Validate a tool manifest.
        
        Args:
            manifest_data: Manifest data dictionary
            
        Returns:
            ValidationResult with validation status and errors
        """
        return self._manifest_validator.validate_manifest(manifest_data)
    
    async def validate_tool_security(
        self, 
        tool_dir: Path, 
        permissions: list[str]
    ) -> SecurityScanResult:
        """
        Run security scan on a tool directory.
        
        Args:
            tool_dir: Path to tool directory
            permissions: List of permissions requested by tool
            
        Returns:
            SecurityScanResult with scan findings
        """
        return await self._security_scanner.scan_tool_directory(tool_dir, permissions)
    
    def is_manifest_valid(self, manifest_data: dict) -> bool:
        """
        Check if a manifest is valid (convenience method).
        
        Args:
            manifest_data: Manifest data dictionary
            
        Returns:
            True if manifest is valid, False otherwise
        """
        result = self.validate_manifest(manifest_data)
        if not result.is_valid:
            logger.debug(f"Manifest validation failed: {result.errors}")
        return result.is_valid

