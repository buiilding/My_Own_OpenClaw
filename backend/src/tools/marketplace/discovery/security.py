"""
Tool Security Scanner for the Desktop Assistant Marketplace.

This module scans marketplace tools for security vulnerabilities and
enforces security policies.
"""
import ast
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set

logger = logging.getLogger(__name__)

RISKY_PATTERNS = [
    (r"os\.system\s*\(", "Direct system command execution", "high"),
    (r"subprocess\.(call|run|Popen)\s*\(", "Process execution", "high"),
    (r"eval\s*\(", "Code evaluation", "high"),
    (r"exec\s*\(", "Code execution", "high"),
    (r"__import__\s*\(", "Dynamic import", "high"),
    (r"compile\s*\(", "Code compilation", "high"),
    (r"pickle\.loads\s*\(", "Unsafe deserialization", "high"),
    (r"open\s*\(\s*[^,]*\s*,\s*['\"]w", "File writing", "medium"),
    (r"shutil\.rmtree\s*\(", "Directory deletion", "high"),
    (r"os\.remove\s*\(", "File deletion", "medium"),
    (r"os\.unlink\s*\(", "File deletion", "medium"),
    (r"os\.rmdir\s*\(", "Directory removal", "medium"),
]

# Network access patterns
NETWORK_PATTERNS = [
    r"requests\.(get|post|put|delete|patch)\s*\(",
    r"urllib\.request\.(urlopen|Request)\s*\(",
    r"http\.client\.(HTTPConnection|HTTPSConnection)\s*\(",
    r"httpx\.(get|post|put|delete|patch)\s*\(",
    r"aiohttp\.(ClientSession|get|post)\s*\(",
]

# Allowed imports (whitelist)
ALLOWED_IMPORTS: Set[str] = {
    "asyncio",
    "json",
    "typing",
    "pathlib",
    "os",
    "sys",
    "datetime",
    "logging",
    "re",
    "urllib",
    "requests",
    "httpx",
    "aiohttp",
    "http",
    "collections",
    "dataclasses",
    "enum",
    "abc",
    "io",
    "base64",
    "hashlib",
    "uuid",
    "time",
    "math",
    "random",
    "string",
    "backend.src.tools.base",
    "backend.src.core.config",
    "backend.src.core.utils.file_utils",
    "backend.src.core.utils.schema_generator",
}

# Backend utils are allowed with wildcard
BACKEND_UTILS_PREFIX = "backend.src.core.utils."


@dataclass
class SecurityScanResult:
    """Result of security scan."""

    is_safe: bool
    issues: List[Dict[str, str]]
    warnings: List[str]

    def __str__(self) -> str:
        if self.is_safe:
            return "Security scan passed"
        return f"Security scan failed: {len(self.issues)} issue(s) found"


class ToolSecurityScanner:
    """Scans marketplace tools for security vulnerabilities."""

    def __init__(self):
        """Initialize the security scanner."""
        self.risky_patterns = RISKY_PATTERNS
        self.network_patterns = NETWORK_PATTERNS
        self.allowed_imports = ALLOWED_IMPORTS

    async def scan_tool_directory(
        self, tool_dir: Path, declared_permissions: List[str] = None
    ) -> SecurityScanResult:
        """
        Scan a tool directory for security issues.

        Args:
            tool_dir: Path to the tool directory
            declared_permissions: List of permissions declared in manifest

        Returns:
            SecurityScanResult with scan results
        """
        if declared_permissions is None:
            declared_permissions = []

        issues = []
        warnings = []
        all_files = list(tool_dir.rglob("*.py"))

        if not all_files:
            warnings.append("No Python files found in tool directory")
            return SecurityScanResult(is_safe=True, issues=[], warnings=warnings)

        for file_path in all_files:
            # Skip hidden files and cache directories
            if file_path.name.startswith(".") or "__pycache__" in str(file_path):
                continue

            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()

                # Check for risky patterns
                file_issues = self._check_risky_patterns(content, file_path, tool_dir)
                issues.extend(file_issues)

                # Check imports
                import_issues, import_warnings = self._check_imports(
                    content, file_path, tool_dir
                )
                issues.extend(import_issues)
                warnings.extend(import_warnings)

                # Check for network access without permission
                if self._has_network_access(content):
                    if "network_access" not in declared_permissions:
                        issues.append(
                            {
                                "type": "missing_permission",
                                "file": str(file_path.relative_to(tool_dir)),
                                "severity": "medium",
                                "message": "Tool makes network requests but 'network_access' permission not declared in manifest",
                            }
                        )

            except Exception as e:
                logger.error(f"Error scanning file {file_path}: {e}")
                warnings.append(f"Could not scan {file_path.name}: {str(e)}")

        # Determine if safe (no high severity issues)
        high_severity_issues = [
            issue for issue in issues if issue.get("severity") == "high"
        ]
        is_safe = len(high_severity_issues) == 0

        return SecurityScanResult(is_safe=is_safe, issues=issues, warnings=warnings)

    def _check_risky_patterns(
        self, content: str, file_path: Path, tool_dir: Path
    ) -> List[Dict[str, str]]:
        """Check for risky code patterns."""
        issues = []

        for pattern, description, severity in self.risky_patterns:
            matches = re.finditer(pattern, content, re.MULTILINE)
            for match in matches:
                line_num = content[: match.start()].count("\n") + 1
                issues.append(
                    {
                        "type": "risky_pattern",
                        "file": str(file_path.relative_to(tool_dir)),
                        "line": str(line_num),
                        "pattern": pattern,
                        "severity": severity,
                        "message": f"{description} detected: {pattern}",
                    }
                )

        return issues

    def _check_imports(
        self, content: str, file_path: Path, tool_dir: Path
    ) -> tuple[List[Dict[str, str]], List[str]]:
        """Check imports for disallowed modules."""
        issues = []
        warnings = []

        try:
            # Parse AST to extract imports
            tree = ast.parse(content, filename=str(file_path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        import_name = alias.name.split(".")[0]  # Get root module
                        if not self._is_allowed_import(import_name, alias.name):
                            issues.append(
                                {
                                    "type": "disallowed_import",
                                    "file": str(file_path.relative_to(tool_dir)),
                                    "severity": "medium",
                                    "message": f"Disallowed import: {alias.name}",
                                }
                            )
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        import_name = node.module.split(".")[0]
                        if not self._is_allowed_import(import_name, node.module):
                            issues.append(
                                {
                                    "type": "disallowed_import",
                                    "file": str(file_path.relative_to(tool_dir)),
                                    "severity": "medium",
                                    "message": f"Disallowed import: {node.module}",
                                }
                            )
        except SyntaxError as e:
            warnings.append(f"Could not parse {file_path.name}: {str(e)}")

        return issues, warnings

    def _is_allowed_import(self, root_module: str, full_import: str) -> bool:
        """Check if an import is allowed."""
        # Check exact match in allowed imports
        if root_module in self.allowed_imports or full_import in self.allowed_imports:
            return True

        # Check backend.utils.* prefix
        if full_import.startswith(BACKEND_UTILS_PREFIX):
            return True

        # Standard library modules are generally safe
        # But we're being conservative - only explicitly allowed ones
        return False

    def _has_network_access(self, content: str) -> bool:
        """Check if code contains network access patterns."""
        for pattern in self.network_patterns:
            if re.search(pattern, content, re.MULTILINE):
                return True
        return False
