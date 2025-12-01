# Code Examples and Tutorials

This document provides comprehensive code examples and tutorials for using the Personal Assistant SDK. These examples demonstrate real-world usage patterns and best practices.

## Table of Contents

- [Tool Development Examples](#tool-development-examples)
- [Agent Development Examples](#agent-development-examples)
- [Plugin Development Examples](#plugin-development-examples)
- [Integration Examples](#integration-examples)
- [Testing Examples](#testing-examples)

## Tool Development Examples

### Basic Tool Example

```python
"""
Example: Weather Information Tool

A simple tool that fetches weather information for a given location.
"""
import httpx
from typing import Dict, Any
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext


class WeatherArgs(BaseModel):
    """Arguments for weather tool."""
    location: str = Field(..., description="City name or location to get weather for")
    unit: str = Field(default="celsius", description="Temperature unit (celsius/fahrenheit)")


class WeatherTool(Tool[WeatherArgs]):
    """
    Get current weather information for a location.

    This tool demonstrates:
    - HTTP API integration
    - Error handling
    - Structured response formatting
    - Input validation with Pydantic
    """

    name = "get_weather"
    description = "Fetch current weather information for a specified location"
    args_model = WeatherArgs

    async def run(self, args: WeatherArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute weather lookup."""
        try:
            # In a real implementation, you'd use a weather API
            # This is a mock response for demonstration
            weather_data = {
                "location": args.location,
                "temperature": 22.5 if args.unit == "celsius" else 72.5,
                "unit": args.unit,
                "condition": "Sunny",
                "humidity": 65
            }

            return {
                "success": True,
                "data": weather_data,
                "llm_content": f"Weather in {args.location}: {weather_data['temperature']}°{args.unit[0].upper()}, {weather_data['condition']}",
                "return_display": f"🌤️ Weather in {args.location}: {weather_data['temperature']}°{args.unit[0].upper()}, {weather_data['condition']} (Humidity: {weather_data['humidity']}%)"
            }

        except Exception as e:
            return {
                "success": False,
                "data": {"error": str(e)},
                "llm_content": f"Failed to get weather: {str(e)}",
                "return_display": f"❌ Error getting weather: {str(e)}"
            }
```

### Advanced Tool with File Processing

```python
"""
Example: CSV Data Analyzer Tool

A tool that reads CSV files, performs basic analysis, and generates insights.
"""
import csv
import os
from pathlib import Path
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext


class CSVAnalyzerArgs(BaseModel):
    """Arguments for CSV analyzer tool."""
    file_path: str = Field(..., description="Path to CSV file to analyze")
    analysis_type: str = Field(
        default="summary",
        description="Type of analysis: summary, columns, or statistics"
    )


class CSVAnalyzerTool(Tool[CSVAnalyzerArgs]):
    """
    Analyze CSV files and provide data insights.

    This tool demonstrates:
    - File system operations
    - Data processing and analysis
    - Multiple analysis modes
    - Error handling for file operations
    - Structured data presentation
    """

    name = "analyze_csv"
    description = "Analyze CSV files and provide data insights, summaries, or statistics"
    args_model = CSVAnalyzerArgs

    async def run(self, args: CSVAnalyzerArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute CSV analysis."""
        try:
            # Resolve file path
            file_path = Path(ctx.workspace_root) / args.file_path

            if not file_path.exists():
                return {
                    "success": False,
                    "data": {"error": "File not found"},
                    "llm_content": f"CSV file not found: {args.file_path}",
                    "return_display": f"❌ File not found: {args.file_path}"
                }

            # Read and analyze CSV
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            if not rows:
                return {
                    "success": False,
                    "data": {"error": "Empty CSV file"},
                    "llm_content": "CSV file is empty",
                    "return_display": "📄 CSV file contains no data"
                }

            # Perform requested analysis
            if args.analysis_type == "summary":
                result = self._create_summary(rows)
            elif args.analysis_type == "columns":
                result = self._analyze_columns(rows)
            elif args.analysis_type == "statistics":
                result = self._calculate_statistics(rows)
            else:
                result = {"error": f"Unknown analysis type: {args.analysis_type}"}

            return {
                "success": True,
                "data": result,
                "llm_content": self._format_llm_content(result, args.analysis_type),
                "return_display": self._format_display(result, args.analysis_type, file_path.name)
            }

        except Exception as e:
            return {
                "success": False,
                "data": {"error": str(e)},
                "llm_content": f"Failed to analyze CSV: {str(e)}",
                "return_display": f"❌ Error analyzing CSV: {str(e)}"
            }

    def _create_summary(self, rows: List[Dict]) -> Dict[str, Any]:
        """Create a summary of the CSV data."""
        return {
            "total_rows": len(rows),
            "total_columns": len(rows[0]) if rows else 0,
            "columns": list(rows[0].keys()) if rows else [],
            "sample_row": rows[0] if rows else None
        }

    def _analyze_columns(self, rows: List[Dict]) -> Dict[str, Any]:
        """Analyze column types and characteristics."""
        if not rows:
            return {"columns": []}

        columns = {}
        sample_row = rows[0]

        for col_name in sample_row.keys():
            values = [row.get(col_name, '') for row in rows[:100]]  # Sample first 100 rows
            columns[col_name] = self._analyze_column(values)

        return {"columns": columns}

    def _analyze_column(self, values: List[Any]) -> Dict[str, Any]:
        """Analyze a single column."""
        non_empty = [v for v in values if v != '']
        return {
            "total_values": len(values),
            "non_empty_values": len(non_empty),
            "unique_values": len(set(str(v) for v in non_empty)),
            "sample_values": list(set(str(v) for v in non_empty))[:5]
        }

    def _calculate_statistics(self, rows: List[Dict]) -> Dict[str, Any]:
        """Calculate basic statistics for numeric columns."""
        if not rows:
            return {"statistics": {}}

        stats = {}
        for col_name in rows[0].keys():
            values = []
            for row in rows:
                val = row.get(col_name, '')
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    continue

            if values:
                stats[col_name] = {
                    "count": len(values),
                    "mean": sum(values) / len(values),
                    "min": min(values),
                    "max": max(values)
                }

        return {"statistics": stats}

    def _format_llm_content(self, result: Dict, analysis_type: str) -> str:
        """Format result for LLM consumption."""
        if analysis_type == "summary":
            return f"CSV contains {result['total_rows']} rows and {result['total_columns']} columns: {', '.join(result['columns'])}"
        elif analysis_type == "columns":
            return f"Found {len(result['columns'])} columns with details about data types and uniqueness"
        elif analysis_type == "statistics":
            stats = result.get("statistics", {})
            return f"Calculated statistics for {len(stats)} numeric columns"
        return "Analysis completed"

    def _format_display(self, result: Dict, analysis_type: str, filename: str) -> str:
        """Format result for user display."""
        if analysis_type == "summary":
            return f"📊 **{filename} Summary**\n• {result['total_rows']} rows\n• {result['total_columns']} columns\n• Columns: {', '.join(result['columns'])}"

        elif analysis_type == "columns":
            lines = [f"📋 **{filename} Column Analysis**"]
            for col_name, info in result['columns'].items():
                lines.append(f"• {col_name}: {info['non_empty_values']}/{info['total_values']} values, {info['unique_values']} unique")
            return "\n".join(lines)

        elif analysis_type == "statistics":
            lines = [f"📈 **{filename} Statistics**"]
            for col_name, stat in result['statistics'].items():
                lines.append(f"• {col_name}: {stat['mean']:.2f} avg ({stat['min']:.2f} - {stat['max']:.2f})")
            return "\n".join(lines)

        return f"✅ Analysis completed for {filename}"
```

### Tool with External API Integration

```python
"""
Example: GitHub Repository Analyzer Tool

A tool that analyzes GitHub repositories using the GitHub API.
"""
import httpx
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext


class GitHubRepoArgs(BaseModel):
    """Arguments for GitHub repository analysis."""
    repo_url: str = Field(..., description="GitHub repository URL (e.g., https://github.com/owner/repo)")
    analysis_type: str = Field(
        default="overview",
        description="Type of analysis: overview, contributors, or issues"
    )
    github_token: Optional[str] = Field(
        None,
        description="GitHub personal access token (optional, increases rate limits)"
    )


class GitHubRepoTool(Tool[GitHubRepoArgs]):
    """
    Analyze GitHub repositories and provide insights.

    This tool demonstrates:
    - External API integration with authentication
    - Rate limiting and error handling
    - Multiple analysis modes
    - Token-based authentication
    - Structured API responses
    """

    name = "analyze_github_repo"
    description = "Analyze GitHub repositories for overview, contributors, or issue statistics"
    args_model = GitHubRepoArgs

    async def run(self, args: GitHubRepoArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute GitHub repository analysis."""
        try:
            # Parse repository information from URL
            repo_info = self._parse_github_url(args.repo_url)
            if not repo_info:
                return {
                    "success": False,
                    "data": {"error": "Invalid GitHub URL format"},
                    "llm_content": "Invalid GitHub repository URL provided",
                    "return_display": "❌ Invalid GitHub repository URL"
                }

            owner, repo = repo_info

            # Prepare headers
            headers = {"Accept": "application/vnd.github.v3+json"}
            if args.github_token:
                headers["Authorization"] = f"token {args.github_token}"

            async with httpx.AsyncClient(timeout=30.0) as client:
                if args.analysis_type == "overview":
                    result = await self._get_repo_overview(client, headers, owner, repo)
                elif args.analysis_type == "contributors":
                    result = await self._get_contributors(client, headers, owner, repo)
                elif args.analysis_type == "issues":
                    result = await self._get_issue_stats(client, headers, owner, repo)
                else:
                    result = {"error": f"Unknown analysis type: {args.analysis_type}"}

            if "error" in result:
                return {
                    "success": False,
                    "data": result,
                    "llm_content": f"GitHub API error: {result['error']}",
                    "return_display": f"❌ GitHub API Error: {result['error']}"
                }

            return {
                "success": True,
                "data": result,
                "llm_content": self._format_llm_content(result, args.analysis_type, f"{owner}/{repo}"),
                "return_display": self._format_display(result, args.analysis_type, f"{owner}/{repo}")
            }

        except Exception as e:
            return {
                "success": False,
                "data": {"error": str(e)},
                "llm_content": f"Failed to analyze repository: {str(e)}",
                "return_display": f"❌ Error analyzing repository: {str(e)}"
            }

    def _parse_github_url(self, url: str) -> Optional[tuple[str, str]]:
        """Parse owner and repo from GitHub URL."""
        import re
        pattern = r"github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$"
        match = re.search(pattern, url)
        if match:
            return match.group(1), match.group(2)
        return None

    async def _get_repo_overview(self, client: httpx.AsyncClient, headers: Dict, owner: str, repo: str) -> Dict[str, Any]:
        """Get repository overview information."""
        response = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)

        if response.status_code == 404:
            return {"error": "Repository not found"}
        elif response.status_code == 403:
            return {"error": "API rate limit exceeded or access denied"}
        elif response.status_code != 200:
            return {"error": f"GitHub API error: {response.status_code}"}

        data = response.json()
        return {
            "name": data.get("name"),
            "description": data.get("description"),
            "language": data.get("language"),
            "stars": data.get("stargazers_count"),
            "forks": data.get("forks_count"),
            "issues": data.get("open_issues_count"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at")
        }

    async def _get_contributors(self, client: httpx.AsyncClient, headers: Dict, owner: str, repo: str) -> Dict[str, Any]:
        """Get repository contributors."""
        response = await client.get(f"https://api.github.com/repos/{owner}/{repo}/contributors", headers=headers)

        if response.status_code != 200:
            return {"error": f"Failed to fetch contributors: {response.status_code}"}

        contributors = response.json()
        top_contributors = [
            {
                "login": c.get("login"),
                "contributions": c.get("contributions"),
                "url": c.get("html_url")
            }
            for c in contributors[:10]  # Top 10 contributors
        ]

        return {
            "total_contributors": len(contributors),
            "top_contributors": top_contributors
        }

    async def _get_issue_stats(self, client: httpx.AsyncClient, headers: Dict, owner: str, repo: str) -> Dict[str, Any]:
        """Get issue statistics."""
        # Get open issues
        open_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            headers=headers,
            params={"state": "open", "per_page": 100}
        )

        # Get closed issues (recent)
        closed_response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            headers=headers,
            params={"state": "closed", "per_page": 100, "sort": "updated", "direction": "desc"}
        )

        if open_response.status_code != 200 or closed_response.status_code != 200:
            return {"error": "Failed to fetch issue statistics"}

        open_issues = len([i for i in open_response.json() if not i.get("pull_request")])
        closed_issues = len([i for i in closed_response.json() if not i.get("pull_request")])

        return {
            "open_issues": open_issues,
            "closed_issues_recent": closed_issues,
            "total_known_issues": open_issues + closed_issues
        }

    def _format_llm_content(self, result: Dict, analysis_type: str, repo_name: str) -> str:
        """Format result for LLM consumption."""
        if analysis_type == "overview":
            return f"Repository {repo_name}: {result.get('description', 'No description')}. {result.get('stars', 0)} stars, {result.get('language', 'Unknown')} language."
        elif analysis_type == "contributors":
            return f"Repository {repo_name} has {result['total_contributors']} contributors. Top contributor: {result['top_contributors'][0]['login'] if result['top_contributors'] else 'None'}"
        elif analysis_type == "issues":
            return f"Repository {repo_name}: {result['open_issues']} open issues, {result['closed_issues_recent']} recently closed."
        return f"Analysis completed for {repo_name}"

    def _format_display(self, result: Dict, analysis_type: str, repo_name: str) -> str:
        """Format result for user display."""
        if analysis_type == "overview":
            return f"""📊 **{repo_name} Overview**
• Description: {result.get('description', 'No description')}
• Language: {result.get('language', 'Unknown')}
• ⭐ Stars: {result.get('stars', 0)}
• 🍴 Forks: {result.get('forks', 0)}
• 🐛 Open Issues: {result.get('issues', 0)}
• 📅 Created: {result.get('created_at', 'Unknown')[:10]}"""

        elif analysis_type == "contributors":
            lines = [f"👥 **{repo_name} Contributors**", f"• Total: {result['total_contributors']}"]
            for contributor in result['top_contributors'][:5]:
                lines.append(f"• {contributor['login']}: {contributor['contributions']} contributions")
            return "\n".join(lines)

        elif analysis_type == "issues":
            return f"""📋 **{repo_name} Issue Statistics**
• Open Issues: {result['open_issues']}
• Recently Closed: {result['closed_issues_recent']}
• Total Known: {result['total_known_issues']}"""

        return f"✅ Analysis completed for {repo_name}"
```

## Agent Development Examples

### Basic Agent Example

```python
"""
Example: Code Review Agent

An agent specialized in reviewing code for best practices and potential issues.
"""
from typing import Dict, Any, List
from backend.src.sdk.agents.base import BaseAgent
from backend.src.sdk.context import AgentContext
from backend.src.sdk.tool import ToolResult


class CodeReviewAgent(BaseAgent):
    """
    Agent specialized in code review and analysis.

    This agent demonstrates:
    - Specialized agent behavior
    - Tool orchestration for complex tasks
    - Structured analysis output
    - Multi-step reasoning process
    """

    name = "code_reviewer"
    description = "Specialized agent for code review, analysis, and improvement suggestions"
    capabilities = ["code_analysis", "best_practices", "security_review", "performance_review"]

    def __init__(self):
        super().__init__()
        self.analysis_phases = [
            "syntax_check",
            "style_review",
            "logic_analysis",
            "security_check",
            "performance_review",
            "recommendations"
        ]

    async def process_request(self, request: str, context: AgentContext) -> str:
        """
        Process a code review request.

        This method orchestrates the complete code review process:
        1. Extract code from request
        2. Run analysis phases
        3. Generate comprehensive feedback
        """
        # Extract code and metadata from request
        code_info = await self._extract_code_info(request, context)

        if not code_info:
            return "I need to see some code to review. Please provide the code you'd like me to analyze."

        # Perform comprehensive code review
        review_results = await self._perform_code_review(code_info, context)

        # Format and return review
        return self._format_review_report(review_results, code_info)

    async def _extract_code_info(self, request: str, context: AgentContext) -> Dict[str, Any]:
        """Extract code and metadata from the review request."""
        # Use available tools to extract code information
        read_file_tool = context.tools.get("read_file")
        if not read_file_tool:
            return None

        # Parse request to find file references
        import re
        file_matches = re.findall(r'(?:file|path)[:\s]+([^\s]+\.[a-zA-Z0-9]+)', request)

        if not file_matches:
            # Try to find code blocks in the request
            code_blocks = re.findall(r'```[^\n]*\n(.*?)\n```', request, re.DOTALL)
            if code_blocks:
                return {
                    "code": code_blocks[0],
                    "language": "unknown",
                    "filename": "inline_code",
                    "type": "inline"
                }
            return None

        # Read the first mentioned file
        filename = file_matches[0]
        result = await read_file_tool.run({"file_path": filename}, context.tool_context)

        if not result.get("success"):
            return None

        return {
            "code": result["data"]["content"],
            "language": self._detect_language(filename),
            "filename": filename,
            "type": "file"
        }

    def _detect_language(self, filename: str) -> str:
        """Detect programming language from filename."""
        ext_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby'
        }

        for ext, lang in ext_map.items():
            if filename.endswith(ext):
                return lang
        return 'unknown'

    async def _perform_code_review(self, code_info: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Perform comprehensive code review."""
        results = {
            "syntax_check": await self._check_syntax(code_info, context),
            "style_review": await self._review_style(code_info, context),
            "logic_analysis": await self._analyze_logic(code_info, context),
            "security_check": await self._check_security(code_info, context),
            "performance_review": await self._review_performance(code_info, context),
            "recommendations": await self._generate_recommendations(code_info, context)
        }

        return results

    async def _check_syntax(self, code_info: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Check for syntax errors and basic issues."""
        # This would use language-specific linters or parsers
        # For demonstration, we'll do basic checks
        code = code_info["code"]
        language = code_info["language"]

        issues = []

        if language == "python":
            # Check for common Python issues
            if "import *" in code:
                issues.append("Avoid using 'import *' - import specific modules")
            if len([line for line in code.split('\n') if len(line) > 100]) > 0:
                issues.append("Some lines are very long (>100 chars)")

        return {
            "status": "passed" if not issues else "issues_found",
            "issues": issues,
            "severity": "high" if any("error" in issue.lower() for issue in issues) else "medium"
        }

    async def _review_style(self, code_info: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Review code style and formatting."""
        code = code_info["code"]
        language = code_info["language"]

        suggestions = []

        lines = code.split('\n')

        if language == "python":
            # Check PEP 8 style
            if not all(line.strip() or line.startswith(' ') for line in lines):
                suggestions.append("Inconsistent indentation detected")
            if any(len(line) > 79 for line in lines):
                suggestions.append("Lines should be <= 79 characters (PEP 8)")

        return {
            "status": "good" if len(suggestions) <= 2 else "needs_improvement",
            "suggestions": suggestions,
            "score": max(0, 10 - len(suggestions))
        }

    async def _analyze_logic(self, code_info: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Analyze code logic and algorithms."""
        # This would use more sophisticated analysis
        # For demonstration, basic checks
        code = code_info["code"]

        analysis = {
            "complexity": "low",
            "patterns_used": [],
            "potential_issues": []
        }

        # Simple complexity check
        if len(code.split('\n')) > 50:
            analysis["complexity"] = "medium"
        if len(code.split('\n')) > 200:
            analysis["complexity"] = "high"

        # Look for common patterns
        if "if" in code and "else" in code:
            analysis["patterns_used"].append("conditional_logic")
        if "for" in code or "while" in code:
            analysis["patterns_used"].append("loops")
        if "try:" in code:
            analysis["patterns_used"].append("error_handling")

        return analysis

    async def _check_security(self, code_info: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Check for security vulnerabilities."""
        code = code_info["code"]
        language = code_info["language"]

        vulnerabilities = []

        if language == "python":
            if "eval(" in code:
                vulnerabilities.append("Use of eval() - potential code injection")
            if "exec(" in code:
                vulnerabilities.append("Use of exec() - potential code injection")
            if "pickle.load" in code:
                vulnerabilities.append("Pickle loading - potential deserialization attack")

        return {
            "status": "secure" if not vulnerabilities else "vulnerabilities_found",
            "vulnerabilities": vulnerabilities,
            "severity": "critical" if vulnerabilities else "none"
        }

    async def _review_performance(self, code_info: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Review performance characteristics."""
        code = code_info["code"]

        optimizations = []

        # Look for potential performance issues
        if "O(n^2)" in code or "for" in code and "for" in code.split('\n')[0]:  # Rough heuristic
            optimizations.append("Consider nested loop optimizations")
        if "select *" in code.lower():
            optimizations.append("Avoid SELECT * - specify needed columns")

        return {
            "status": "good" if not optimizations else "optimizable",
            "optimizations": optimizations,
            "estimated_impact": "low" if len(optimizations) <= 1 else "medium"
        }

    async def _generate_recommendations(self, code_info: Dict[str, Any], context: AgentContext) -> List[str]:
        """Generate overall recommendations."""
        recommendations = [
            "Consider adding comprehensive error handling",
            "Add input validation for all public functions",
            "Include docstrings for better documentation",
            "Add unit tests for critical functions"
        ]

        return recommendations

    def _format_review_report(self, results: Dict[str, Any], code_info: Dict[str, Any]) -> str:
        """Format the complete code review report."""
        report_lines = [
            f"# Code Review Report: {code_info['filename']}",
            f"**Language:** {code_info['language']}",
            f"**Lines of Code:** {len(code_info['code'].split('\\n'))}",
            ""
        ]

        # Syntax Check
        syntax = results["syntax_check"]
        report_lines.extend([
            "## Syntax Check",
            f"**Status:** {syntax['status'].replace('_', ' ').title()}",
            f"**Severity:** {syntax['severity'].title()}",
        ])
        if syntax["issues"]:
            report_lines.append("**Issues:**")
            for issue in syntax["issues"]:
                report_lines.append(f"- {issue}")
        report_lines.append("")

        # Style Review
        style = results["style_review"]
        report_lines.extend([
            "## Code Style",
            f"**Status:** {style['status'].replace('_', ' ').title()}",
            f"**Score:** {style['score']}/10",
        ])
        if style["suggestions"]:
            report_lines.append("**Suggestions:**")
            for suggestion in style["suggestions"]:
                report_lines.append(f"- {suggestion}")
        report_lines.append("")

        # Logic Analysis
        logic = results["logic_analysis"]
        report_lines.extend([
            "## Logic Analysis",
            f"**Complexity:** {logic['complexity'].title()}",
        ])
        if logic["patterns_used"]:
            report_lines.append(f"**Patterns Used:** {', '.join(logic['patterns_used'])}")
        report_lines.append("")

        # Security Check
        security = results["security_check"]
        report_lines.extend([
            "## Security Review",
            f"**Status:** {security['status'].replace('_', ' ').title()}",
            f"**Severity:** {security['severity']}",
        ])
        if security["vulnerabilities"]:
            report_lines.append("**Vulnerabilities Found:**")
            for vuln in security["vulnerabilities"]:
                report_lines.append(f"- ⚠️ {vuln}")
        report_lines.append("")

        # Performance Review
        perf = results["performance_review"]
        report_lines.extend([
            "## Performance Review",
            f"**Status:** {perf['status'].title()}",
            f"**Impact:** {perf['estimated_impact'].title()}",
        ])
        if perf["optimizations"]:
            report_lines.append("**Optimization Suggestions:**")
            for opt in perf["optimizations"]:
                report_lines.append(f"- {opt}")
        report_lines.append("")

        # Recommendations
        recommendations = results["recommendations"]
        report_lines.extend([
            "## Recommendations",
        ])
        for rec in recommendations:
            report_lines.append(f"- {rec}")

        return "\\n".join(report_lines)
```

## Plugin Development Examples

### Basic Plugin Example

```python
"""
Example: Logging Plugin

A plugin that adds comprehensive logging capabilities to the system.
"""
from typing import Dict, Any, Optional
import logging
import json
from datetime import datetime
import asyncio

from backend.src.core.plugins.base import BasePlugin
from backend.src.core.events import Event


class LoggingPlugin(BasePlugin):
    """
    Comprehensive logging plugin for the Personal Assistant.

    This plugin demonstrates:
    - Event-driven logging
    - Configurable log levels and formats
    - Multiple output destinations
    - Structured logging with context
    - Performance monitoring
    """

    name = "logging"
    version = "1.0.0"
    description = "Advanced logging plugin with structured logging, multiple outputs, and performance monitoring"

    def __init__(self):
        self.logger = None
        self.log_config = {}
        self.performance_data = {}
        self._setup_complete = False

    async def setup(self, config: Dict[str, Any]) -> bool:
        """Initialize the logging plugin."""
        try:
            self.log_config = config.get("logging", {})

            # Configure logging
            log_level = getattr(logging, self.log_config.get("level", "INFO").upper())
            log_format = self.log_config.get("format", "json")

            # Create logger
            self.logger = logging.getLogger("personal_assistant")
            self.logger.setLevel(log_level)

            # Remove existing handlers
            for handler in self.logger.handlers[:]:
                self.logger.removeHandler(handler)

            # Add console handler
            console_handler = logging.StreamHandler()
            console_handler.setLevel(log_level)

            if log_format == "json":
                formatter = JsonFormatter()
            else:
                formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                )

            console_handler.setFormatter(formatter)
            self.logger.addHandler(console_handler)

            # Add file handler if configured
            log_file = self.log_config.get("file")
            if log_file:
                file_handler = logging.FileHandler(log_file)
                file_handler.setLevel(log_level)
                file_handler.setFormatter(formatter)
                self.logger.addHandler(file_handler)

            self._setup_complete = True
            self.logger.info("Logging plugin initialized", extra={
                "plugin": self.name,
                "version": self.version,
                "log_level": logging.getLevelName(log_level),
                "format": log_format
            })

            return True

        except Exception as e:
            print(f"Failed to setup logging plugin: {e}")
            return False

    async def teardown(self) -> bool:
        """Clean up logging resources."""
        try:
            if self.logger:
                self.logger.info("Logging plugin shutting down")
                # Flush all handlers
                for handler in self.logger.handlers:
                    handler.flush()
            return True
        except Exception as e:
            print(f"Error during logging plugin teardown: {e}")
            return False

    async def handle_event(self, event: Event) -> None:
        """Handle system events for logging."""
        if not self._setup_complete or not self.logger:
            return

        # Log different event types with appropriate levels
        if event.type == "interaction_started":
            self.logger.info("Interaction started", extra={
                "event_type": event.type,
                "user_id": event.data.get("user_id"),
                "session_id": event.data.get("session_id")
            })

        elif event.type == "tool_executed":
            # Track performance for tool execution
            tool_name = event.data.get("tool_name")
            execution_time = event.data.get("execution_time", 0)
            success = event.data.get("success", False)

            self._record_performance(tool_name, execution_time)

            log_level = logging.INFO if success else logging.WARNING
            self.logger.log(log_level, "Tool executed", extra={
                "event_type": event.type,
                "tool_name": tool_name,
                "execution_time": execution_time,
                "success": success,
                "error": event.data.get("error")
            })

        elif event.type == "error_occurred":
            self.logger.error("System error occurred", extra={
                "event_type": event.type,
                "error_type": event.data.get("error_type"),
                "error_message": event.data.get("error_message"),
                "component": event.data.get("component")
            })

        elif event.type == "memory_operation":
            operation = event.data.get("operation")
            items_count = event.data.get("items_count", 0)

            self.logger.debug("Memory operation performed", extra={
                "event_type": event.type,
                "operation": operation,
                "items_count": items_count
            })

    def _record_performance(self, tool_name: str, execution_time: float) -> None:
        """Record performance metrics for tools."""
        if tool_name not in self.performance_data:
            self.performance_data[tool_name] = {
                "calls": 0,
                "total_time": 0.0,
                "avg_time": 0.0,
                "min_time": float('inf'),
                "max_time": 0.0
            }

        data = self.performance_data[tool_name]
        data["calls"] += 1
        data["total_time"] += execution_time
        data["avg_time"] = data["total_time"] / data["calls"]
        data["min_time"] = min(data["min_time"], execution_time)
        data["max_time"] = max(data["max_time"], execution_time)

    async def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics for all tracked tools."""
        return {
            "performance_stats": self.performance_data,
            "timestamp": datetime.utcnow().isoformat()
        }


class JsonFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging."""

    def format(self, record):
        # Create base log entry
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage()
        }

        # Add extra fields
        if hasattr(record, 'extra') and record.extra:
            log_entry.update(record.extra)

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)
```

## Integration Examples

### Custom Tool Integration

```python
"""
Example: Integrating a Custom Tool into the System

This example shows how to create, package, and integrate a custom tool
into the Personal Assistant system.
"""

# 1. Create the tool (save as my_custom_tool.py)
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext


class CustomToolArgs(BaseModel):
    """Arguments for the custom tool."""
    input_data: str = Field(..., description="Input data to process")
    operation: str = Field(default="process", description="Operation to perform")


class MyCustomTool(Tool[CustomToolArgs]):
    """A custom tool that processes data in various ways."""

    name = "my_custom_tool"
    description = "Process data using custom algorithms"
    args_model = CustomToolArgs

    async def run(self, args: CustomToolArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute the custom tool logic."""
        try:
            if args.operation == "process":
                result = self._process_data(args.input_data)
            elif args.operation == "analyze":
                result = self._analyze_data(args.input_data)
            else:
                result = {"error": f"Unknown operation: {args.operation}"}

            return {
                "success": True,
                "data": result,
                "llm_content": f"Processed data: {str(result)[:200]}...",
                "return_display": f"✅ Custom processing completed: {args.operation}"
            }
        except Exception as e:
            return {
                "success": False,
                "data": {"error": str(e)},
                "llm_content": f"Custom tool failed: {str(e)}",
                "return_display": f"❌ Custom tool error: {str(e)}"
            }

    def _process_data(self, data: str) -> Dict[str, Any]:
        """Process the input data."""
        return {
            "original_length": len(data),
            "processed_data": data.upper(),
            "word_count": len(data.split())
        }

    def _analyze_data(self, data: str) -> Dict[str, Any]:
        """Analyze the input data."""
        return {
            "character_count": len(data),
            "line_count": len(data.split('\\n')),
            "contains_numbers": any(c.isdigit() for c in data)
        }


# 2. Create tool manifest (save as tool.json)
TOOL_MANIFEST = {
    "name": "my_custom_tool",
    "version": "1.0.0",
    "description": "A custom tool for data processing",
    "author": "Your Name",
    "entry_point": "my_custom_tool:MyCustomTool",
    "dependencies": [],
    "permissions": ["file_read"],
    "categories": ["utility", "data_processing"]
}


# 3. Integration script (integrate_tool.py)
"""
Script to integrate the custom tool into the running system.
"""
import asyncio
import sys
from pathlib import Path

# Add the backend to Python path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from backend.src.tools.loader import ToolLoader
from backend.src.tools.registry import ToolRegistry


async def integrate_custom_tool():
    """Integrate the custom tool into the system."""

    # Initialize tool registry
    registry = ToolRegistry()

    # Create tool loader
    loader = ToolLoader(registry)

    # Load the custom tool
    tool_path = Path("my_custom_tool.py")
    manifest_path = Path("tool.json")

    try:
        # Load and register the tool
        success = await loader.load_tool_from_path(tool_path, manifest_path)

        if success:
            print("✅ Custom tool integrated successfully!")
            print(f"Tool registered: {registry.get_tool('my_custom_tool').name}")
        else:
            print("❌ Failed to integrate custom tool")

    except Exception as e:
        print(f"❌ Error integrating tool: {e}")


if __name__ == "__main__":
    asyncio.run(integrate_custom_tool())
```

### Webhook Integration

```python
"""
Example: Webhook Integration Tool

A tool that sends webhooks and handles webhook responses for external integrations.
"""
import httpx
import json
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext


class WebhookArgs(BaseModel):
    """Arguments for webhook tool."""
    url: str = Field(..., description="Webhook URL to send request to")
    method: str = Field(default="POST", description="HTTP method (GET, POST, PUT, DELETE)")
    payload: Optional[Dict[str, Any]] = Field(None, description="Request payload data")
    headers: Optional[Dict[str, str]] = Field(None, description="Additional headers")
    timeout: int = Field(default=30, description="Request timeout in seconds")


class WebhookTool(Tool[WebhookArgs]):
    """
    Send HTTP requests to webhook endpoints.

    This tool demonstrates:
    - HTTP client usage with proper error handling
    - Flexible request configuration
    - Response parsing and formatting
    - Security considerations for external requests
    """

    name = "webhook"
    description = "Send HTTP requests to webhook endpoints with configurable payload and headers"
    args_model = WebhookArgs

    async def run(self, args: WebhookArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute webhook request."""
        try:
            # Validate URL (basic security check)
            if not self._is_valid_url(args.url):
                return {
                    "success": False,
                    "data": {"error": "Invalid URL format"},
                    "llm_content": "Invalid webhook URL provided",
                    "return_display": "❌ Invalid webhook URL"
                }

            # Prepare request
            headers = {"Content-Type": "application/json", "User-Agent": "Personal-Assistant/1.0"}
            if args.headers:
                headers.update(args.headers)

            payload = json.dumps(args.payload) if args.payload else None

            # Send request
            async with httpx.AsyncClient(timeout=args.timeout) as client:
                response = await client.request(
                    method=args.method.upper(),
                    url=args.url,
                    content=payload,
                    headers=headers
                )

                # Process response
                result = {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "url": str(response.url)
                }

                try:
                    result["json_response"] = response.json()
                except:
                    result["text_response"] = response.text

                # Check if request was successful
                success = 200 <= response.status_code < 300

                return {
                    "success": success,
                    "data": result,
                    "llm_content": self._format_llm_response(result, success),
                    "return_display": self._format_display_response(result, success)
                }

        except httpx.TimeoutException:
            return {
                "success": False,
                "data": {"error": "Request timeout"},
                "llm_content": f"Webhook request to {args.url} timed out after {args.timeout} seconds",
                "return_display": f"⏰ Webhook timeout: {args.url}"
            }

        except httpx.ConnectError:
            return {
                "success": False,
                "data": {"error": "Connection failed"},
                "llm_content": f"Failed to connect to webhook URL: {args.url}",
                "return_display": f"🔌 Connection failed: {args.url}"
            }

        except Exception as e:
            return {
                "success": False,
                "data": {"error": str(e)},
                "llm_content": f"Webhook request failed: {str(e)}",
                "return_display": f"❌ Webhook error: {str(e)}"
            }

    def _is_valid_url(self, url: str) -> bool:
        """Basic URL validation."""
        import re
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)

        return url_pattern.match(url) is not None

    def _format_llm_response(self, result: Dict[str, Any], success: bool) -> str:
        """Format response for LLM consumption."""
        status = result["status_code"]
        if success:
            if "json_response" in result:
                return f"Webhook successful ({status}): {json.dumps(result['json_response'])[:500]}..."
            else:
                return f"Webhook successful ({status}): {result.get('text_response', '')[:500]}..."
        else:
            return f"Webhook failed ({status}): {result.get('text_response', 'Unknown error')[:200]}"

    def _format_display_response(self, result: Dict[str, Any], success: bool) -> str:
        """Format response for user display."""
        status = result["status_code"]
        url = result["url"]

        if success:
            response_type = "JSON" if "json_response" in result else "Text"
            return f"""✅ **Webhook Success**
• URL: {url}
• Status: {status}
• Response Type: {response_type}"""
        else:
            return f"""❌ **Webhook Failed**
• URL: {url}
• Status: {status}
• Error: {result.get('text_response', 'Unknown error')[:100]}..."""
```

## Testing Examples

### Tool Testing Example

```python
"""
Example: Comprehensive Tool Testing

This example shows how to write comprehensive tests for tools using pytest and the testing utilities.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.tools.filesystem.read_file_tool_sdk import ReadFileToolSDK, ReadFileArgs


class TestReadFileToolSDK:
    """Test suite for ReadFileToolSDK."""

    @pytest.fixture
    def tool(self):
        """Create tool instance for testing."""
        return ReadFileToolSDK()

    @pytest.fixture
    def mock_context(self):
        """Create mock tool context."""
        context = MagicMock(spec=ToolContext)
        context.workspace_root = "/test/workspace"
        return context

    @pytest.mark.asyncio
    async def test_read_text_file_success(self, tool, mock_context, tmp_path):
        """Test successful reading of a text file."""
        # Create a temporary text file
        test_file = tmp_path / "test.txt"
        test_content = "Hello, World!\\nThis is a test file."
        test_file.write_text(test_content)

        # Mock file service to allow access
        mock_file_service = MagicMock()
        mock_file_service.should_ignore_file.return_value = False
        mock_context.services = {"file_service": mock_file_service}

        # Mock the file reading utility
        import backend.src.tools.filesystem.read_file_tool_sdk as module
        original_read = module.read_text_file_auto_encoding
        module.read_text_file_auto_encoding = AsyncMock(return_value=test_content)

        try:
            args = ReadFileArgs(file_path="test.txt")
            result = await tool.run(args, mock_context)

            assert result["success"] is True
            assert result["data"]["content"] == test_content
            assert "Hello, World!" in result["llm_content"]
            assert "✅" in result["return_display"]

        finally:
            # Restore original function
            module.read_text_file_auto_encoding = original_read

    @pytest.mark.asyncio
    async def test_read_file_not_found(self, tool, mock_context):
        """Test handling of non-existent files."""
        args = ReadFileArgs(file_path="nonexistent.txt")

        result = await tool.run(args, mock_context)

        assert result["success"] is False
        assert "not found" in result["llm_content"].lower()
        assert "❌" in result["return_display"]

    @pytest.mark.asyncio
    async def test_read_file_ignored_by_filter(self, tool, mock_context):
        """Test handling of files ignored by filtering rules."""
        # Mock file service to reject the file
        mock_file_service = MagicMock()
        mock_file_service.should_ignore_file.return_value = True
        mock_context.services = {"file_service": mock_file_service}

        args = ReadFileArgs(file_path="node_modules/package.json")

        result = await tool.run(args, mock_context)

        assert result["success"] is False
        assert "ignored" in result["llm_content"].lower()
        assert "filtering rules" in result["llm_content"]

    @pytest.mark.asyncio
    async def test_read_file_with_line_limits(self, tool, mock_context, tmp_path):
        """Test reading files with offset and limit parameters."""
        # Create a multi-line test file
        test_file = tmp_path / "multiline.txt"
        lines = [f"Line {i}: This is test content" for i in range(10)]
        test_content = "\\n".join(lines)
        test_file.write_text(test_content)

        # Mock file service and reading function
        mock_file_service = MagicMock()
        mock_file_service.should_ignore_file.return_value = False
        mock_context.services = {"file_service": mock_file_service}

        import backend.src.tools.filesystem.read_file_tool_sdk as module
        module.read_text_file_auto_encoding = AsyncMock(return_value=test_content)

        try:
            args = ReadFileArgs(file_path="multiline.txt", offset=2, limit=3)
            result = await tool.run(args, mock_context)

            assert result["success"] is True
            # Should contain lines 2-4 (0-indexed offset)
            content = result["data"]["content"]
            assert "Line 2:" in content
            assert "Line 3:" in content
            assert "Line 4:" in content
            assert "Line 5:" not in content  # Should not include line beyond limit

        finally:
            module.read_text_file_auto_encoding = original_read

    @pytest.mark.asyncio
    async def test_read_file_invalid_offset_limit(self, tool, mock_context):
        """Test validation of offset and limit parameters."""
        # Test negative offset
        args = ReadFileArgs(file_path="test.txt", offset=-1)
        result = await tool.run(args, mock_context)
        assert result["success"] is False
        assert "offset" in result["llm_content"].lower()

        # Test zero limit
        args = ReadFileArgs(file_path="test.txt", limit=0)
        result = await tool.run(args, mock_context)
        assert result["success"] is False
        assert "limit" in result["llm_content"].lower()

    @pytest.mark.asyncio
    async def test_read_binary_file_handling(self, tool, mock_context, tmp_path):
        """Test handling of binary files."""
        # Create a mock binary file (we'll just create a text file for testing)
        test_file = tmp_path / "binary.dat"
        test_file.write_bytes(b"\\x00\\x01\\x02\\x03binary data")

        mock_file_service = MagicMock()
        mock_file_service.should_ignore_file.return_value = False
        mock_context.services = {"file_service": mock_file_service}

        # Mock the binary file reading (would normally detect binary and handle appropriately)
        import backend.src.tools.filesystem.read_file_tool_sdk as module
        module.read_text_file_auto_encoding = AsyncMock(side_effect=UnicodeDecodeError("utf-8", b"", 0, 1, ""))

        try:
            args = ReadFileArgs(file_path="binary.dat")
            result = await tool.run(args, mock_context)

            # Should handle binary files gracefully
            assert result["success"] is False or "binary" in result["llm_content"].lower()

        finally:
            module.read_text_file_auto_encoding = original_read
```

### Integration Testing Example

```python
"""
Example: Integration Testing

This example shows how to write integration tests that test multiple components working together.
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from backend.src.agent.core import AgentSession
from backend.src.agent.executor import AgentExecutor
from backend.src.llm.llm_client import LLMClient
from backend.src.tools.registry import ToolRegistry
from backend.src.memory.memory_manager import MemoryManager


@pytest.mark.integration
class TestAgentIntegration:
    """Integration tests for agent functionality."""

    @pytest.fixture
    async def agent_session(self):
        """Create a fully configured agent session for integration testing."""
        # Mock configuration
        config = MagicMock()
        config.memory_enabled = True
        config.max_history_length = 50

        # Mock LLM client
        llm_client = AsyncMock(spec=LLMClient)
        llm_client.generate_response.return_value = AsyncMock()
        llm_client.generate_response.return_value.content = "I'll help you with that task."
        llm_client.generate_response.return_value.tool_calls = []

        # Mock tool registry
        tool_registry = MagicMock(spec=ToolRegistry)
        tool_registry.get_tools.return_value = {}

        # Mock memory manager
        memory_manager = AsyncMock(spec=MemoryManager)
        memory_manager.store_interaction.return_value = None
        memory_manager.retrieve_relevant_memory.return_value = []

        # Create agent executor
        executor = AgentExecutor(
            llm_client=llm_client,
            tool_registry=tool_registry,
            memory_manager=memory_manager,
            config=config
        )

        # Create agent session
        session = AgentSession(
            cfg=config,
            user_id="test_user",
            session_id="test_session_123",
            executor=executor,
            memory_manager=memory_manager
        )

        return session

    @pytest.mark.asyncio
    async def test_agent_handles_simple_query(self, agent_session):
        """Test that agent can handle a simple query without tools."""
        query = "Hello, how are you?"

        result = await agent_session.process_query(query)

        assert result is not None
        assert isinstance(result, str)
        assert len(result) > 0

        # Verify LLM was called
        agent_session.executor.llm.generate_response.assert_called_once()

        # Verify memory storage was attempted
        agent_session.memory_manager.store_interaction.assert_called_once()

    @pytest.mark.asyncio
    async def test_agent_with_tool_execution(self, agent_session):
        """Test agent interaction with tool execution."""
        # Mock a tool
        mock_tool = AsyncMock()
        mock_tool.name = "test_tool"
        mock_tool.run.return_value = {
            "success": True,
            "data": {"result": "tool executed"},
            "llm_content": "Tool executed successfully",
            "return_display": "✅ Tool completed"
        }

        # Configure tool registry to return the mock tool
        agent_session.executor.tool_registry.get_tool.return_value = mock_tool

        # Mock LLM response with tool call
        tool_call = MagicMock()
        tool_call.name = "test_tool"
        tool_call.arguments = '{"param": "value"}'

        agent_session.executor.llm.generate_response.return_value.tool_calls = [tool_call]
        agent_session.executor.llm.generate_response.return_value.content = "I'll use the test tool."

        query = "Please run the test tool"

        result = await agent_session.process_query(query)

        assert result is not None
        assert "test_tool" in result or "tool executed" in result

        # Verify tool was executed
        mock_tool.run.assert_called_once()

        # Verify LLM was called twice (initial + tool result processing)
        assert agent_session.executor.llm.generate_response.call_count >= 2

    @pytest.mark.asyncio
    async def test_agent_handles_tool_failure(self, agent_session):
        """Test agent handles tool execution failures gracefully."""
        # Mock a failing tool
        mock_tool = AsyncMock()
        mock_tool.name = "failing_tool"
        mock_tool.run.return_value = {
            "success": False,
            "data": {"error": "Tool execution failed"},
            "llm_content": "Tool failed: execution error",
            "return_display": "❌ Tool failed"
        }

        agent_session.executor.tool_registry.get_tool.return_value = mock_tool

        # Mock LLM response with tool call
        tool_call = MagicMock()
        tool_call.name = "failing_tool"
        tool_call.arguments = '{"param": "value"}'

        agent_session.executor.llm.generate_response.return_value.tool_calls = [tool_call]
        agent_session.executor.llm.generate_response.return_value.content = "I'll try this tool."

        query = "Run the failing tool"

        result = await agent_session.process_query(query)

        assert result is not None
        assert "failed" in result.lower() or "error" in result.lower()

        # Verify tool was attempted
        mock_tool.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_agent_memory_integration(self, agent_session):
        """Test agent integrates with memory system."""
        query1 = "Remember that I like pizza"
        query2 = "What food do I like?"

        # First interaction
        await agent_session.process_query(query1)

        # Mock memory retrieval for second query
        agent_session.memory_manager.retrieve_relevant_memory.return_value = [
            {"content": "User likes pizza", "timestamp": "2024-01-01T00:00:00Z"}
        ]

        # Second interaction
        result = await agent_session.process_query(query2)

        # Verify memory was retrieved
        agent_session.memory_manager.retrieve_relevant_memory.assert_called()

        # Verify both interactions were stored
        assert agent_session.memory_manager.store_interaction.call_count == 2

    @pytest.mark.asyncio
    async def test_agent_handles_llm_failure(self, agent_session):
        """Test agent handles LLM failures gracefully."""
        # Mock LLM failure
        agent_session.executor.llm.generate_response.side_effect = Exception("LLM service unavailable")

        query = "Hello"

        result = await agent_session.process_query(query)

        assert result is not None
        assert "error" in result.lower() or "failed" in result.lower()

        # Verify error handling didn't crash the session
        assert agent_session.user_id == "test_user"
        assert agent_session.session_id == "test_session_123"
```

This concludes the comprehensive code examples and tutorials. These examples demonstrate practical usage patterns for developing tools, agents, plugins, and integrations with the Personal Assistant system. Each example includes detailed comments explaining the key concepts and best practices.
