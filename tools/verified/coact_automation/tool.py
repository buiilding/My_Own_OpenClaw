"""
CoAct-1 Computer Automation Tool

Marketplace tool implementing the CoAct-1 multi-agent architecture for intelligent
computer automation using coordinated AI agents.
"""

import asyncio
import logging
from typing import Any, Dict, List

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)


class CoActAutomationTool(Tool):
    """
    CoAct-1 Computer Automation Tool

    Marketplace tool implementing the CoAct-1 multi-agent architecture for intelligent
    computer automation using coordinated AI agents.

    Architecture:
    - Orchestrator: High-level planner with delegation tools only
    - Programmer: Filesystem and shell operation tools
    - GUI Operator: Computer/GUI interaction tools
    - Per-task histories: Agent histories cleared after each delegation
    - Persistent orchestrator history: Orchestrator history maintained throughout task
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="coact_automation",
            description="Execute complex computer automation tasks using multi-agent coordination. Supports natural language task descriptions and intelligent task decomposition.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.tool_registry = None  # Will be set during execution
        self.max_iterations = 10
        self.orchestrator_history: List[Dict[str, Any]] = []  # Persistent orchestrator history

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
        self.orchestrator_history = []
        self.episodic_memories = []
        self.semantic_facts = []

    async def execute_task(self, task: str) -> tuple[Dict[str, Any], Dict[str, List]]:
        """
        Execute a task using the CoAct-1 multi-agent system.

        Returns:
            Tuple of (result_dict, memories_dict)
        """
        start_time = asyncio.get_event_loop().time()

        print(f"\n{'='*80}")
        print("🚀 [COACT-1] TASK EXECUTION STARTED")
        print(f"📝 Task: '{task}'")
        print(f"⚙️  Max iterations: {self.max_iterations}")
        print(f"🤖 Orchestrator: {self.orchestrator_model}")
        print(f"👨‍💻 Programmer: {self.programmer_model}")
        print(f"🖥️  GUI Operator: {self.programmer_model}")
        print(f"{'='*80}")

        try:
            # Record initial task
            self._add_episodic_memory("task_started", f"CoAct-1 received task: {task}")
            self.orchestrator_history = []

            # Main execution loop
            for iteration in range(self.max_iterations):
                print(f"\n{'─'*60}")
                print(f"🔄 [ITERATION {iteration + 1}/{self.max_iterations}]")
                print(f"{'─'*60}")
                # 1. Orchestrator analyzes current state
                print("🤖 [ORCHESTRATOR] Analyzing current state and planning next action...")
                orchestrator_decision = await self._call_orchestrator(task)

                action = orchestrator_decision.get("action")
                subtask = orchestrator_decision.get("subtask", "")

                if action == "complete":
                    # Task completed
                    print("✅ [ORCHESTRATOR] Task completion decided")
                    print(f"📋 Summary: {orchestrator_decision.get('summary', 'Task completed')}")
                    result = {
                        "success": True,
                        "summary": orchestrator_decision.get("summary", "Task completed"),
                        "execution_time": asyncio.get_event_loop().time() - start_time,
                        "steps_completed": iteration + 1,
                        "agents_used": ["orchestrator"],
                    }
                    break

                # 2. Execute delegated action
                print(f"🔄 [AGENT TRANSITION] Orchestrator → {action}")
                print(f"📋 Subtask: '{subtask}'")

                if action == "delegate_programmer":
                    print("👨‍💻 [PROGRAMMER] Starting execution...")
                elif action == "delegate_gui_operator":
                    print("🖥️  [GUI OPERATOR] Starting execution...")

                execution_result = await self._execute_agent_action(orchestrator_decision)

                # Log agent completion
                agent_name = "Programmer" if action == "delegate_programmer" else "GUI Operator"
                success_status = "✅ SUCCESS" if execution_result.get("success") else "❌ FAILED"
                print(f"{success_status} [{agent_name.upper()}] Completed execution")
                print(f"🔄 [AGENT TRANSITION] {agent_name} → Orchestrator")

                # 3. Update conversation for next iteration
                self.orchestrator_history.append(orchestrator_decision)
                self.orchestrator_history.append(execution_result)

            else:
                # Max iterations reached
                print(f"\n{'❌'*20}")
                print("⏰ [COACT-1] MAXIMUM ITERATIONS REACHED")
                print(f"📊 Iterations completed: {self.max_iterations}")
                print("❌ Task failed: Maximum iterations reached without completion")
                print(f"{'❌'*20}")
                result = {
                    "success": False,
                    "error": "Maximum iterations reached without completion",
                    "execution_time": asyncio.get_event_loop().time() - start_time,
                    "steps_completed": self.max_iterations,
                    "failure_reason": "timeout",
                }

        except Exception as e:
            print(f"\n{'💥'*20}")
            print("💥 [COACT-1] EXECUTION ERROR")
            print(f"❌ Error: {str(e)}")
            print(f"{'💥'*20}")
            logger.error(f"CoAct coordination error: {e}")
            result = {
                "success": False,
                "error": f"Execution error: {str(e)}",
                "execution_time": asyncio.get_event_loop().time() - start_time,
                "failure_reason": "exception",
            }

        # Final status report
        execution_time = result.get("execution_time", 0)
        print(f"\n{'='*80}")
        if result["success"]:
            print("✅ [COACT-1] TASK COMPLETED SUCCESSFULLY")
            print(f"📋 Summary: {result.get('summary', 'Task completed')}")
        else:
            print("❌ [COACT-1] TASK FAILED")
            print(f"📋 Error: {result.get('error', 'Unknown error')}")
        print(f"⏱️  Total execution time: {execution_time:.2f} seconds")
        print(f"🔢 Steps completed: {result.get('steps_completed', 0)}")
        print(f"🤖 Agents used: {result.get('agents_used', [])}")
        print(f"{'='*80}")

        # Extract semantic insights
        self._extract_semantic_facts()

        memories = {
            "episodic": self.episodic_memories,
            "semantic": self.semantic_facts,
        }

        return result, memories

    async def _call_orchestrator(self, original_task: str) -> Dict[str, Any]:
        """Call the orchestrator agent to analyze current state and decide next action."""

        # Build orchestrator prompt - ONLY delegation tools available (Coact-1 style)
        system_prompt = """You are the Orchestrator agent in a CoAct-1 multi-agent computer automation system.

Your role is to decompose complex tasks into executable subtasks and delegate them to specialized agents.

Available delegation tools:
- delegate_to_programmer: Delegate filesystem/shell tasks to the programmer agent
- delegate_to_gui_operator: Delegate GUI/visual tasks to the GUI operator agent

The programmer agent has access to:
- run_shell_command: Execute shell commands
- list_directory: List directory contents
- read_file: Read file contents
- write_file: Write content to files
- grep_search: Search for patterns in files

The GUI operator agent has access to:
- screenshot: Take screenshots
- click_ocr_element: Click on OCR-detected elements
- mouse_control: Direct mouse control
- keyboard_control: Send keyboard input
- scroll_control: Scroll windows
- predict_click: AI-powered element detection

Respond with a JSON tool call:
{"tool": "delegate_to_programmer", "parameters": {"subtask": "description"}}
{"tool": "delegate_to_gui_operator", "parameters": {"subtask": "description"}}
"""

        user_prompt = f"Original Task: {original_task}\n\n"

        if self.orchestrator_history:
            user_prompt += "Previous Actions:\n"
            for i, msg in enumerate(self.orchestrator_history[-4:]):  # Last 4 messages
                user_prompt += f"{i+1}. {msg.get('description', str(msg))}\n"

        # Call LLM
        llm_client = await self._get_llm_client()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        response = await llm_client.get_completion("gemini-2.5-flash", messages)
        response_text = response.strip()

        # Parse the JSON response
        try:
            import json
            action = json.loads(response_text)

            tool_name = action.get("tool")
            parameters = action.get("parameters", {})

            if tool_name == "delegate_to_programmer":
                return {
                    "action": "delegate_programmer",
                    "subtask": parameters.get("subtask", ""),
                    "summary": "Delegated to programmer"
                }
            elif tool_name == "delegate_to_gui_operator":
                return {
                    "action": "delegate_gui_operator",
                    "subtask": parameters.get("subtask", ""),
                    "summary": "Delegated to GUI operator"
                }
            else:
                return {
                    "error": f"Unknown delegation tool: {tool_name}",
                    "action": "error"
                }

        except json.JSONDecodeError as e:
            return {
                "error": f"Failed to parse orchestrator response: {e}",
                "action": "error"
            }

    async def _execute_agent_action(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an action delegated by the orchestrator using per-task agent histories."""

        action = decision.get("action")
        subtask = decision.get("subtask", "")

        if action == "delegate_programmer":
            # Create fresh history for this programmer task (Coact-1 style)
            programmer_history = [{
                "role": "user",
                "content": f"Execute this programming task: {subtask}"
            }]

            # Execute with fresh history
            result = await self._execute_programmer_task_with_history(subtask, programmer_history)

            # History is automatically cleared after task completion (not persisted)
            return result

        elif action == "delegate_gui_operator":
            # Create fresh history for this GUI task (Coact-1 style)
            gui_history = [{
                "role": "user",
                "content": f"Execute this GUI task: {subtask}"
            }]

            # Execute with fresh history
            result = await self._execute_gui_task_with_history(subtask, gui_history)

            # History is automatically cleared after task completion (not persisted)
            return result

        else:
            return {"error": f"Unknown action: {action}"}

    async def _execute_programmer_task_with_history(self, subtask: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Execute a task using the programmer agent with per-task history (Coact-1 style)."""

        print(f"   🔧 [PROGRAMMER] Executing subtask: '{subtask}'")

        result = {"agent": "programmer", "subtask": subtask}
        max_agent_iterations = 3  # Allow agent to retry up to 3 times internally

        # Get available tools with their schemas
        available_tools = self._get_programmer_tools_schema()

        # Build programmer prompt with available tools
        system_prompt = f"""You are the Programmer agent in a CoAct-1 multi-agent computer automation system.

Your role is to execute programming and system-level tasks using available tools.

Available tools you can use:
{available_tools}

For shell commands, extract the actual command from instructions like:
- "Execute the shell command 'ls -la'" → run_shell_command with command="ls -la"
- "Run 'mkdir test'" → run_shell_command with command="mkdir test"
- "List files in current directory" → list_directory with path="."

If a tool call fails, analyze the error message and try again with corrected parameters.
Respond with a JSON action: {{"tool": "tool_name", "parameters": {{...}}}}
"""

        try:
            # Agent internal loop - retry up to max_agent_iterations times
            for agent_attempt in range(max_agent_iterations):
                print(f"   🔄 [PROGRAMMER] Attempt {agent_attempt + 1}/{max_agent_iterations}")

                # Use the current conversation history
                messages = [{"role": "system", "content": system_prompt}] + history

                # Call LLM to decide which tool to use
                print("   🧠 [PROGRAMMER] Analyzing subtask and selecting tool...")
                llm_client = await self._get_llm_client()
                response = await llm_client.get_completion("gemini-2.5-flash", messages)
                response_text = response.strip()

                # Parse the JSON response
                try:
                    import json
                    action = json.loads(response_text)

                    tool_name = action.get("tool")
                    parameters = action.get("parameters", {})

                    if tool_name:
                        print(f"   🛠️  [PROGRAMMER] Selected tool: {tool_name}")
                        if parameters:
                            print(f"   📊 [PROGRAMMER] Parameters: {parameters}")

                        # Execute the chosen tool
                        tool_result = await self.tool_registry.execute_tool(tool_name, **parameters)

                        # Add the tool call and result to conversation history
                        history.append({"role": "assistant", "content": f"Tool call: {tool_name} with parameters {parameters}"})
                        history.append({"role": "user", "content": f"Tool result: {tool_result.llm_content}"})

                        if tool_result.success:
                            print("   ✅ [PROGRAMMER] Tool execution successful")
                            result["tool_used"] = tool_name
                            result["parameters"] = parameters
                result["output"] = tool_result.llm_content
                            result["success"] = True
                            result["attempts"] = agent_attempt + 1
                            return result
                        else:
                            print(f"   ❌ [PROGRAMMER] Tool execution failed: {tool_result.error}")
                            # Continue the loop to try again with error in history
                            continue
                    else:
                        print("   ❌ [PROGRAMMER] No tool specified")
                        history.append({"role": "assistant", "content": "Error: No tool specified"})
                        history.append({"role": "user", "content": "Please specify a valid tool to use for this task."})
                        continue

                except json.JSONDecodeError as e:
                    print(f"   ❌ [PROGRAMMER] JSON parsing failed: {e}")
                    history.append({"role": "assistant", "content": f"Error: Invalid JSON response - {response_text}"})
                    history.append({"role": "user", "content": "Please respond with valid JSON format: {\"tool\": \"tool_name\", \"parameters\": {...}}"})
                    continue

            # If we get here, all attempts failed
            print(f"   💥 [PROGRAMMER] All {max_agent_iterations} attempts failed")
            result["error"] = f"Programmer agent failed after {max_agent_iterations} attempts"
            result["success"] = False
            result["attempts"] = max_agent_iterations

        except Exception as e:
            print(f"   💥 [PROGRAMMER] Exception: {str(e)}")
            result["error"] = str(e)
            result["success"] = False

        print("   🔄 [PROGRAMMER] Returning control to orchestrator")
        return result

    def _get_programmer_tools_schema(self) -> str:
        """Get formatted schema for all programmer tools."""
        programmer_tools = ["run_shell_command", "list_directory", "read_file", "write_file", "grep_search"]

        schema_lines = []
        for tool_name in programmer_tools:
            try:
                tool = self.tool_registry.get_tool(tool_name)
                if tool:
                    schema = tool.get_schema()
                    description = schema.get("description", "")
                    parameters = schema.get("parameters", {})

                    schema_lines.append(f"- {tool_name}: {description}")
                    if "properties" in parameters:
                        props = parameters["properties"]
                        required = parameters.get("required", [])
                        for param_name, param_info in props.items():
                            required_mark = "*" if param_name in required else ""
                            param_desc = param_info.get("description", "")
                            param_type = param_info.get("type", "")
                            schema_lines.append(f"  - {param_name}{required_mark}: {param_type} - {param_desc}")
            except Exception as e:
                schema_lines.append(f"- {tool_name}: Tool schema unavailable ({e})")

        return "\n".join(schema_lines)

    # Legacy method for backward compatibility
    async def _execute_programmer_task(self, subtask: str) -> Dict[str, Any]:
        """Legacy method - use _execute_programmer_task_with_history instead."""
        history = [{"role": "user", "content": f"Execute this programming task: {subtask}"}]
        return await self._execute_programmer_task_with_history(subtask, history)

    async def _execute_gui_task_with_history(self, subtask: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Execute a GUI task using the GUI operator agent with per-task history (Coact-1 style)."""

        print(f"   🎨 [GUI OPERATOR] Executing subtask: '{subtask}'")

        result = {"agent": "gui_operator", "subtask": subtask}
        max_agent_iterations = 3  # Allow agent to retry up to 3 times internally

        # Get available tools with their schemas
        available_tools = self._get_gui_tools_schema()

        # Build GUI operator prompt with available computer tools
        system_prompt = f"""You are the GUI Operator agent in a CoAct-1 multi-agent computer automation system.

Your role is to execute visual and interactive GUI tasks using available computer tools.

Available computer tools you can use:
{available_tools}

For visual tasks, you can:
1. Take screenshots to see the current state
2. Use OCR to find text elements and click on them
3. Move mouse cursor to specific coordinates
4. Send keyboard input (remember to specify action: "type" or "press")
5. Scroll windows
6. Use AI to predict and click on elements

IMPORTANT: When using keyboard_control, you MUST specify the 'action' parameter:
- action: "type" for typing text
- action: "press" for pressing special keys

If a tool call fails, analyze the error message and try again with corrected parameters.
Respond with a JSON action: {{"tool": "tool_name", "parameters": {{...}}}}
"""

        try:
            # Agent internal loop - retry up to max_agent_iterations times
            for agent_attempt in range(max_agent_iterations):
                print(f"   🔄 [GUI OPERATOR] Attempt {agent_attempt + 1}/{max_agent_iterations}")

                # Use the current conversation history
                messages = [{"role": "system", "content": system_prompt}] + history

                # Call LLM to decide which tool to use
                print("   👁️  [GUI OPERATOR] Analyzing visual subtask and selecting tool...")
                llm_client = await self._get_llm_client()
                response = await llm_client.get_completion("gemini-2.5-flash", messages)
                response_text = response.strip()

                # Parse the JSON response
                try:
                    import json
                    action = json.loads(response_text)

                    tool_name = action.get("tool")
                    parameters = action.get("parameters", {})

                    if tool_name:
                        print(f"   🖱️  [GUI OPERATOR] Selected tool: {tool_name}")
                        if parameters:
                            print(f"   📊 [GUI OPERATOR] Parameters: {parameters}")

                        # Execute the chosen tool
                        tool_result = await self.tool_registry.execute_tool(tool_name, **parameters)

                        # Add the tool call and result to conversation history
                        history.append({"role": "assistant", "content": f"Tool call: {tool_name} with parameters {parameters}"})
                        history.append({"role": "user", "content": f"Tool result: {tool_result.llm_content}"})

                        if tool_result.success:
                            print("   ✅ [GUI OPERATOR] Tool execution successful")
                            result["tool_used"] = tool_name
                            result["parameters"] = parameters
                result["output"] = tool_result.llm_content
                            result["success"] = True
                            result["attempts"] = agent_attempt + 1
                            return result
                        else:
                            print(f"   ❌ [GUI OPERATOR] Tool execution failed: {tool_result.error}")
                            # Continue the loop to try again with error in history
                            continue
            else:
                        print("   ❌ [GUI OPERATOR] No tool specified")
                        history.append({"role": "assistant", "content": "Error: No tool specified"})
                        history.append({"role": "user", "content": "Please specify a valid tool to use for this task."})
                        continue

                except json.JSONDecodeError as e:
                    print(f"   ❌ [GUI OPERATOR] JSON parsing failed: {e}")
                    history.append({"role": "assistant", "content": f"Error: Invalid JSON response - {response_text}"})
                    history.append({"role": "user", "content": "Please respond with valid JSON format: {\"tool\": \"tool_name\", \"parameters\": {...}}"})
                    continue

            # If we get here, all attempts failed
            print(f"   💥 [GUI OPERATOR] All {max_agent_iterations} attempts failed")
            result["error"] = f"GUI operator failed after {max_agent_iterations} attempts"
            result["success"] = False
            result["attempts"] = max_agent_iterations

        except Exception as e:
            print(f"   💥 [GUI OPERATOR] Exception: {str(e)}")
            result["error"] = str(e)
            result["success"] = False

        print("   🔄 [GUI OPERATOR] Returning control to orchestrator")
        return result

    def _get_gui_tools_schema(self) -> str:
        """Get formatted schema for all GUI operator tools."""
        gui_tools = ["screenshot", "click_ocr_element", "mouse_control", "keyboard_control", "scroll_control", "predict_click"]

        schema_lines = []
        for tool_name in gui_tools:
            try:
                tool = self.tool_registry.get_tool(tool_name)
                if tool:
                    schema = tool.get_schema()
                    description = schema.get("description", "")
                    parameters = schema.get("parameters", {})

                    schema_lines.append(f"- {tool_name}: {description}")
                    if "properties" in parameters:
                        props = parameters["properties"]
                        required = parameters.get("required", [])
                        for param_name, param_info in props.items():
                            required_mark = "*" if param_name in required else ""
                            param_desc = param_info.get("description", "")
                            param_type = param_info.get("type", "")
                            schema_lines.append(f"  - {param_name}{required_mark}: {param_type} - {param_desc}")
            except Exception as e:
                schema_lines.append(f"- {tool_name}: Tool schema unavailable ({e})")

        return "\n".join(schema_lines)

    # Legacy method for backward compatibility
    async def _execute_gui_task(self, subtask: str) -> Dict[str, Any]:
        """Legacy method - use _execute_gui_task_with_history instead."""
        history = [{"role": "user", "content": f"Execute this GUI task: {subtask}"}]
        return await self._execute_gui_task_with_history(subtask, history)

    async def _execute_legacy_gui_task(self, subtask: str) -> Dict[str, Any]:
        """Fallback legacy GUI task execution using OCR-based element detection."""

        result = {"agent": "gui_operator", "subtask": subtask, "method": "legacy"}

        try:
            # Take screenshot with OCR to get element IDs
            screenshot_result = await self.tool_registry.execute_tool("screenshot", include_ocr=True)

            if not screenshot_result.success:
                result["error"] = "Failed to capture screenshot with OCR"
                result["success"] = False
                return result

            # Use LLM to analyze the subtask and determine which OCR element to interact with
            element_analysis = await self._analyze_gui_subtask(subtask, screenshot_result.llm_content)

            if element_analysis.get("found_element"):
                ocr_id = element_analysis["ocr_id"]
                element_text = element_analysis["element_text"]

                # Use the click_ocr_element tool with the ID
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
        return get_llm_client(self.config.config)

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
