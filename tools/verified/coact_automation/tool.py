"""
CoAct-1 Computer Automation Tool

Marketplace tool implementing the CoAct-1 multi-agent architecture for intelligent
computer automation using coordinated AI agents.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)


class CoActAutomationTool(Tool):
    """
    CoAct-1 Multi-Agent Computer Automation Tool.

    Implements the CoAct-1 architecture with three specialized agents:
    - Orchestrator: Task decomposition and delegation
    - Programmer: Code execution and system operations
    - GUI Operator: Vision-based GUI interactions

    All agent coordination happens internally within this single marketplace tool.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="coact_automation",
            description="Execute complex computer automation tasks using multi-agent coordination. Supports natural language task descriptions and intelligent task decomposition.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.tool_registry = None  # Will be set during execution

    async def execute_async(self, context: ToolContext, task: str, **kwargs) -> ToolResult:
        """
        Execute a computer automation task using the CoAct-1 multi-agent system.

        Args:
            context: Tool execution context (includes tool_registry)
            task: Natural language description of the task to perform
            **kwargs: Additional parameters

        Returns:
            ToolResult with execution results and memory contributions
        """
        try:
            if not task or not task.strip():
                return ToolResult(
                    success=False,
                    error="Task description is required",
                    llm_content="Error: No task description provided",
                    return_display="Task description required",
                )

            # Get tool registry from context
            self.tool_registry = context.tool_registry if hasattr(context, 'tool_registry') else None
            if not self.tool_registry:
                return ToolResult(
                    success=False,
                    error="Tool registry not available in context",
                    llm_content="Error: Cannot access built-in tools",
                    return_display="Tool registry unavailable",
                )

            # Initialize agent coordination system
            coordinator = CoActCoordinator(self.config, self.tool_registry)

            # Execute task through multi-agent system
            result, memories = await coordinator.execute_task(task)

            # Format response
            if result["success"]:
                return ToolResult(
                    success=True,
                    data=result,
                    episodic_memories=memories.get("episodic", []),
                    semantic_facts=memories.get("semantic", []),
                    llm_content=f"✅ Task completed: {result['summary']}",
                    return_display=f"Task completed: {result['summary']}",
                    metadata={
                        "execution_time": result.get("execution_time", 0),
                        "agents_used": result.get("agents_used", []),
                        "steps_completed": result.get("steps_completed", 0),
                    }
                )
            else:
                return ToolResult(
                    success=False,
                    error=result.get("error", "Task execution failed"),
                    data=result,
                    episodic_memories=memories.get("episodic", []),
                    llm_content=f"❌ Task failed: {result.get('error', 'Unknown error')}",
                    return_display=f"Task failed: {result.get('error', 'Unknown error')}",
                    metadata={
                        "execution_time": result.get("execution_time", 0),
                        "failure_reason": result.get("failure_reason"),
                    }
                )

        except Exception as e:
            logger.error(f"CoAct automation tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"CoAct automation failed: {str(e)}",
                llm_content="Error: CoAct automation system encountered an error",
                return_display=f"Automation error: {str(e)}",
            )

    def get_capabilities(self) -> Dict[str, Any]:
        """Get tool capabilities."""
        capabilities = super().get_capabilities()
        capabilities.update(
            {
                "supports_multi_agent": True,
                "agent_types": ["orchestrator", "programmer", "gui_operator"],
                "execution_model": "internal_coordination",
                "memory_contribution": True,
                "natural_language_input": True,
                "safe": False,  # Can execute system commands and modify files
            }
        )
        return capabilities


class CoActCoordinator:
    """
    Internal coordinator for CoAct-1 multi-agent execution.

    Manages the three agents and their coordination within the marketplace tool.
    """

    def __init__(self, config: AppServices, tool_registry):
        self.config = config
        self.tool_registry = tool_registry

        # Agent configurations
        self.orchestrator_model = "gemini/gemini-2.5-flash"  # Could be configurable
        self.programmer_model = "gemini/gemini-2.5-flash"
        self.max_iterations = 10

        # Execution state
        self.conversation_history = []
        self.episodic_memories = []
        self.semantic_facts = []

    async def execute_task(self, task: str) -> tuple[Dict[str, Any], Dict[str, List]]:
        """
        Execute a task using the CoAct-1 multi-agent system.

        Returns:
            Tuple of (result_dict, memories_dict)
        """
        start_time = asyncio.get_event_loop().time()

        try:
            # Record initial task
            self._add_episodic_memory("task_started", f"CoAct-1 received task: {task}")
            self.conversation_history = []

            # Main execution loop
            for iteration in range(self.max_iterations):
                # 1. Orchestrator analyzes current state
                orchestrator_decision = await self._call_orchestrator(task)

                if orchestrator_decision.get("action") == "complete":
                    # Task completed
                    result = {
                        "success": True,
                        "summary": orchestrator_decision.get("summary", "Task completed"),
                        "execution_time": asyncio.get_event_loop().time() - start_time,
                        "steps_completed": iteration + 1,
                        "agents_used": ["orchestrator"],
                    }
                    break

                # 2. Execute delegated action
                execution_result = await self._execute_agent_action(orchestrator_decision)

                # 3. Update conversation for next iteration
                self.conversation_history.append(orchestrator_decision)
                self.conversation_history.append(execution_result)

            else:
                # Max iterations reached
                result = {
                    "success": False,
                    "error": "Maximum iterations reached without completion",
                    "execution_time": asyncio.get_event_loop().time() - start_time,
                    "steps_completed": self.max_iterations,
                    "failure_reason": "timeout",
                }

        except Exception as e:
            logger.error(f"CoAct coordination error: {e}")
            result = {
                "success": False,
                "error": f"Execution error: {str(e)}",
                "execution_time": asyncio.get_event_loop().time() - start_time,
                "failure_reason": "exception",
            }

        # Extract semantic insights
        self._extract_semantic_facts()

        memories = {
            "episodic": self.episodic_memories,
            "semantic": self.semantic_facts,
        }

        return result, memories

    async def _call_orchestrator(self, original_task: str) -> Dict[str, Any]:
        """Call the orchestrator agent to analyze current state and decide next action."""

        # Build orchestrator prompt
        system_prompt = """You are the Orchestrator agent in a CoAct-1 multi-agent computer automation system.

Your role is to decompose complex tasks into executable subtasks and delegate them to specialized agents.

Available agents:
- programmer: Execute shell commands, file operations, and code
- gui_operator: Handle visual GUI interactions using screenshots with OCR and click_ocr_element tool

Current environment: Linux desktop with GUI applications available.

For GUI tasks, the gui_operator can:
1. Take screenshots with OCR to identify text elements by ID
2. Click on specific text elements using their OCR IDs
3. Provide precise GUI automation based on visual text recognition

Respond with a JSON action:
{"action": "delegate_programmer|delegate_gui_operator|complete", "subtask": "description", "summary": "completion summary"}
"""

        user_prompt = f"Original Task: {original_task}\n\n"

        if self.conversation_history:
            user_prompt += "Previous Actions:\n"
            for i, msg in enumerate(self.conversation_history[-4:]):  # Last 4 messages
                user_prompt += f"{i+1}. {msg.get('description', str(msg))}\n"

        # Call LLM
        llm_client = await self._get_llm_client()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        response = await llm_client.get_completion(self.orchestrator_model, messages)

        # Parse response (simplified - would need better parsing)
        try:
            # Extract JSON from response
            action_data = self._parse_llm_response(response)
            self._add_episodic_memory("orchestrator_decision", f"Decided: {action_data}")
            return action_data
        except:
            # Fallback action
            return {"action": "delegate_programmer", "subtask": "Execute the requested task using available tools"}

    async def _execute_agent_action(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an action delegated by the orchestrator."""

        action = decision.get("action")
        subtask = decision.get("subtask", "")

        if action == "delegate_programmer":
            return await self._execute_programmer_task(subtask)
        elif action == "delegate_gui_operator":
            return await self._execute_gui_task(subtask)
        else:
            return {"error": f"Unknown action: {action}"}

    async def _execute_programmer_task(self, subtask: str) -> Dict[str, Any]:
        """Execute a task using the programmer agent (shell/file operations)."""

        # For now, use a simple mapping to built-in tools
        # This would be expanded to use LLM for complex decisions

        result = {"agent": "programmer", "subtask": subtask}

        try:
            if "list" in subtask.lower() and "directory" in subtask.lower():
                # Use list_directory tool
                tool_result = await self.tool_registry.execute_tool("list_directory", path=".")
                result["tool_used"] = "list_directory"
                result["output"] = tool_result.llm_content
                result["success"] = tool_result.success

            elif "run" in subtask.lower() and "command" in subtask.lower():
                # Use shell tool
                tool_result = await self.tool_registry.execute_tool("run_shell_command", command="ls -la")
                result["tool_used"] = "run_shell_command"
                result["output"] = tool_result.llm_content
                result["success"] = tool_result.success

            else:
                # Default to shell command
                tool_result = await self.tool_registry.execute_tool("run_shell_command", command=subtask)
                result["tool_used"] = "run_shell_command"
                result["output"] = tool_result.llm_content
                result["success"] = tool_result.success

        except Exception as e:
            result["error"] = str(e)
            result["success"] = False

        self._add_episodic_memory("programmer_execution", f"Executed: {subtask} -> {result.get('success', False)}")
        return result

    async def _execute_gui_task(self, subtask: str) -> Dict[str, Any]:
        """Execute a GUI task using the GUI operator agent with OCR-based element detection."""

        result = {"agent": "gui_operator", "subtask": subtask}

        try:
            # Take screenshot with OCR to get element IDs
            screenshot_result = await self.tool_registry.execute_tool("screenshot", include_ocr=True)

            if not screenshot_result.success:
                result["error"] = "Failed to capture screenshot with OCR"
                result["success"] = False
                return result

            # The screenshot now provides OCR elements with IDs in the LLM content
            # We need to determine which element ID to click based on the subtask

            # Use LLM to analyze the subtask and determine which OCR element to interact with
            element_analysis = await self._analyze_gui_subtask(subtask, screenshot_result.llm_content)

            if element_analysis.get("found_element"):
                ocr_id = element_analysis["ocr_id"]
                element_text = element_analysis["element_text"]

                # Use the new click_ocr_element tool with the ID
                click_result = await self.tool_registry.execute_tool("click_ocr_element", ocr_id=ocr_id)
                result["tool_used"] = "click_ocr_element"
                result["clicked_element"] = element_text
                result["ocr_id"] = ocr_id
                result["output"] = click_result.llm_content
                result["success"] = click_result.success
            else:
                result["error"] = element_analysis.get("reason", "No suitable GUI element found for the task")
                result["success"] = False

        except Exception as e:
            result["error"] = str(e)
            result["success"] = False

        self._add_episodic_memory("gui_execution", f"GUI task: {subtask} -> {result.get('success', False)}")
        return result

    async def _analyze_gui_subtask(self, subtask: str, ocr_content: str) -> Dict[str, Any]:
        """
        Use LLM to analyze the GUI subtask and determine which OCR element to interact with.

        Args:
            subtask: The GUI task description
            ocr_content: The OCR text content from screenshot

        Returns:
            Dict with element analysis results
        """
        analysis_prompt = f"""Analyze this GUI automation task and identify which OCR element should be clicked.

Task: {subtask}

Available OCR elements:
{ocr_content}

Respond with JSON in this exact format:
{{"found_element": true, "ocr_id": 5, "element_text": "File", "confidence": 0.9, "reason": "File menu matches the task"}}
OR
{{"found_element": false, "reason": "No suitable element found"}}

Only respond with the JSON, no other text."""

        try:
            llm_client = await self._get_llm_client()
            messages = [
                {"role": "system", "content": "You are a GUI automation expert. Analyze OCR text and match it to user tasks."},
                {"role": "user", "content": analysis_prompt}
            ]

            response = await llm_client.get_completion(self.programmer_model, messages)

            # Parse JSON response
            import json
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = response[start:end]
                analysis = json.loads(json_str)

                # Validate the response
                if analysis.get("found_element") and isinstance(analysis.get("ocr_id"), int):
                    return analysis
                else:
                    return {"found_element": False, "reason": "LLM analysis did not identify a valid element"}

        except Exception as e:
            logger.warning(f"GUI subtask analysis failed: {e}")
            return {"found_element": False, "reason": f"Analysis error: {str(e)}"}

    async def _get_llm_client(self):
        """Get LLM client for agent calls."""
        from backend.agent.llm.llm_client import get_llm_client
        return get_llm_client(self.config)

    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM response to extract structured action."""
        # Simplified parsing - would need more robust implementation
        try:
            # Look for JSON in response
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = response[start:end]
                import json
                return json.loads(json_str)
        except:
            pass

        # Fallback
        return {"action": "delegate_programmer", "subtask": response[:200]}

    def _add_episodic_memory(self, event_type: str, description: str):
        """Add an episodic memory for tracking."""
        memory = {
            "timestamp": asyncio.get_event_loop().time(),
            "event_type": event_type,
            "description": description,
            "tool_name": "coact_automation"
        }
        self.episodic_memories.append(memory)

    def _extract_semantic_facts(self):
        """Extract semantic facts from execution."""
        # Simple extraction - would be more sophisticated
        facts = [
            "CoAct-1 successfully coordinates multiple AI agents for complex tasks",
            "OCR-enhanced screenshots enable precise GUI element detection",
            "Multi-agent systems can break down complex tasks into manageable subtasks"
        ]
        self.semantic_facts.extend(facts)
