"""
Workflow Coordinator for CoAct-1 Multi-Agent System

Manages the main execution loop and coordinates agent interactions.
"""
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from backend.src.agent.core import AgentSession
from backend.src.sdk.agents.base import Agent
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)


class WorkflowCoordinator:
    """
    Coordinates the CoAct-1 multi-agent workflow execution.
    
    Manages the main loop: Screenshot → Orchestrator Planning → Agent Execution → Progress Evaluation
    """
    
    def __init__(
        self,
        parent_session: AgentSession,
        max_iterations: int = 10,
    ):
        """
        Initialize the workflow coordinator.
        
        Args:
            parent_session: The parent agent session
            max_iterations: Maximum number of workflow iterations
        """
        self.parent_session = parent_session
        self.max_iterations = max_iterations
        
        # Initialize computer interface for screenshots
        self.computer = ComputerInterface()
        self._computer_initialized = False
        
        # Execution state
        self.iteration_count = 0
        self.task_status = "running"
        self.execution_results: List[Dict[str, Any]] = []
        self.final_summary = ""
        
        # Initialize agents (will be created in initialize())
        self.orchestrator: Optional[Agent] = None
        self.gui_operator: Optional[Agent] = None
        self.programmer: Optional[Agent] = None
        
    def _load_prompt(self, filename: str) -> str:
        """Load prompt content from a file in the prompts directory."""
        current_dir = Path(__file__).parent
        prompts_dir = current_dir / "prompts"
        prompt_path = prompts_dir / filename
        
        try:
            with open(prompt_path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except FileNotFoundError:
            logger.warning(f"Prompt file not found: {prompt_path}, using empty prompt")
            return ""
        except Exception as e:
            logger.error(f"Error loading prompt file {prompt_path}: {e}", exc_info=True)
            return ""
    
    async def initialize(self) -> bool:
        """Initialize the coordinator and computer interface."""
        if not self._computer_initialized:
            success = await self.computer.initialize()
            if not success:
                logger.error("Failed to initialize computer interface")
                return False
            self._computer_initialized = True
        
        # Load prompts
        orchestrator_prompt = self._load_prompt("Orchestrator.txt")
        gui_operator_prompt = self._load_prompt("GUIOperator.txt")
        programmer_prompt = self._load_prompt("Programmer.txt")
        
        # Define tool lists
        computer_use_tools = [
            "screenshot",
            "click_ocr_element",
            "predict_click",
            "mouse_control",
            "keyboard_control",
            "scroll_control",
        ]
        programming_tools = [
            "run_shell_command",
            "read_file",
            "write_file",
            "list_directory",
            "glob",
            "search_file_content",
            "replace",
        ]
        
        # Initialize agents
        self.orchestrator = Agent(
            parent_session=self.parent_session,
            model_id="gemini-2.5-flash",
            system_prompt=orchestrator_prompt,
            tools=None
        )
        
        self.gui_operator = Agent(
            parent_session=self.parent_session,
            model_id="gemini-2.5-flash",
            system_prompt=gui_operator_prompt,
            tools=computer_use_tools
        )
        
        self.programmer = Agent(
            parent_session=self.parent_session,
            model_id="gemini-2.5-flash",
            system_prompt=programmer_prompt,
            tools=programming_tools
        )
        
        logger.info("Initialized all agents")
        return True
    
    async def execute_workflow(self, task: str) -> Dict[str, Any]:
        """
        Execute the main workflow loop.
        
        Matches the pseudo-code structure exactly.
        
        Args:
            task: The user's task description
            
        Returns:
            Dictionary with execution results
        """
        if not await self.initialize():
            return {
                "success": False,
                "error": "Failed to initialize coordinator",
            }
        
        logger.info(f"Starting CoAct-1 workflow for task: {task}")
        
        try:
            # --- Initial Query -----------------------------------------------------------
            initial_screenshot = await self._take_screenshot()
            if initial_screenshot:
                logger.info(f"Initial screenshot captured (size: {len(initial_screenshot)} chars)")
            
            orch_output_text = await self.orchestrator.respond(
                text=task,
                image=initial_screenshot
            )
            
            # Parse orchestrator response
            orch_output = self._parse_orchestrator_response(orch_output_text, task)
            current_agent = orch_output.get("agent")
            current_task = orch_output.get("subtask")
            
            # Log initial delegation decision
            if orch_output.get("type") == "delegate":
                agent_name = "GUI Operator" if current_agent == "gui" else "Programmer" if current_agent == "programmer" else "Unknown"
                logger.info(
                    f"🎯 Orchestrator Decision: Delegating to {agent_name}\n"
                    f"   Subtask: {current_task}"
                )
            
            # --- Main Loop ---------------------------------------------------------------
            while orch_output.get("type") == "delegate":
                self.iteration_count += 1
                logger.info(f"Workflow iteration {self.iteration_count}/{self.max_iterations}")
                
                if self.iteration_count > self.max_iterations:
                    logger.warning(f"Maximum iterations ({self.max_iterations}) reached")
                    break
                
                # Pick proper subagent
                agent_name = "GUI Operator" if current_agent == "gui" else "Programmer" if current_agent == "programmer" else "Unknown"
                logger.info(f"🤖 Executing {agent_name} agent...")
                logger.info(f"   Subtask: {current_task}")
                
                if current_agent == "gui":
                    result = await self.gui_operator.respond(text=current_task, collect_tool_calls=True)
                    if isinstance(result, tuple):
                        sub_output, tool_calls = result
                    else:
                        sub_output, tool_calls = result, []
                    self.gui_operator.clear_history()
                elif current_agent == "programmer":
                    result = await self.programmer.respond(text=current_task, collect_tool_calls=True)
                    if isinstance(result, tuple):
                        sub_output, tool_calls = result
                    else:
                        sub_output, tool_calls = result, []
                    self.programmer.clear_history()
                else:
                    raise Exception(f"Unknown agent requested: {current_agent}")
                
                # Log tool execution
                if tool_calls:
                    logger.info(f"   Tools executed by {agent_name}:")
                    for i, tool_call in enumerate(tool_calls, 1):
                        tool_name = tool_call.get("tool", "unknown")
                        params = tool_call.get("parameters", {})
                        logger.info(f"      [{i}] {tool_name}({', '.join(f'{k}={v}' for k, v in params.items() if k != 'image_data')})")
                else:
                    logger.info(f"   {agent_name} executed no tools")
                
                logger.info(f"   {agent_name} response: {sub_output[:200]}...")
                
                # Screenshot after subagent attempts action
                screenshot = await self._take_screenshot()
                if screenshot:
                    logger.info(f"Screenshot captured (size: {len(screenshot)} chars, iteration {self.iteration_count})")
                
                # Orchestrator re-evaluates the updated state
                logger.info("🔄 Orchestrator re-evaluating task status...")
                orch_output_text = await self.orchestrator.respond(
                    text=sub_output,
                    image=screenshot
                )
                orch_output = self._parse_orchestrator_response(orch_output_text, task)
                current_agent = orch_output.get("agent")
                current_task = orch_output.get("subtask")
                
                # Log orchestrator's decision
                if orch_output.get("type") == "delegate":
                    next_agent_name = "GUI Operator" if current_agent == "gui" else "Programmer" if current_agent == "programmer" else "Unknown"
                    logger.info(
                        f"🎯 Orchestrator Decision: Delegating to {next_agent_name}\n"
                        f"   Subtask: {current_task}"
                    )
                elif orch_output.get("type") == "final":
                    logger.info(f"✅ Orchestrator Decision: Task completed\n   Summary: {orch_output.get('content', 'N/A')[:200]}")
                
                # Store result for this iteration
                self.execution_results.append({
                    "iteration": self.iteration_count,
                    "delegation": orch_output,
                    "sub_output": sub_output,
                })
            
            # --- Final Output ------------------------------------------------------------
            final_content = orch_output.get("content", orch_output_text)
            self.task_status = "completed"
            self.final_summary = final_content
            
            logger.info(f"Task completed: {self.final_summary}")
            
            return {
                "success": True,
                "summary": self.final_summary,
                "iterations_completed": self.iteration_count,
                "execution_results": self.execution_results,
            }
            
        except Exception as e:
            logger.error(f"Error in workflow: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Workflow error: {str(e)}",
                "iterations_completed": self.iteration_count,
                "execution_results": self.execution_results,
            }
    
    async def _take_screenshot(self) -> Optional[str]:
        """Take a screenshot and return base64-encoded image."""
        try:
            result = await self.computer.screenshot()
            if result.success and result.screenshot_data:
                return result.screenshot_data
            else:
                logger.warning("Screenshot failed or returned no data")
                return None
        except Exception as e:
            logger.error(f"Screenshot error: {e}")
            return None
    
    
    def _parse_orchestrator_response(
        self,
        response: str,
        original_task: str
    ) -> Dict[str, Any]:
        """
        Parse orchestrator response to extract delegation decision.
        
        Returns structured dict matching pseudo-code format:
        {
            "type": "delegate" | "final",
            "agent": "gui" | "programmer" | None,
            "subtask": str | None,
            "content": str
        }
        
        The orchestrator responds with structured instructions:
        - DELEGATE_TO_PROGRAMMER: [subtask]
        - DELEGATE_TO_GUI_OPERATOR: [subtask]
        - TASK_COMPLETED: [summary]
        """
        response_upper = response.upper()
        
        # Check for structured delegation format first
        if "DELEGATE_TO_PROGRAMMER:" in response_upper:
            # Extract subtask after the colon
            parts = response.split("DELEGATE_TO_PROGRAMMER:", 1)
            if len(parts) > 1:
                subtask = parts[1].strip()
                # Remove any trailing text after the subtask
                if "\n" in subtask:
                    subtask = subtask.split("\n")[0].strip()
                return {
                    "type": "delegate",
                    "agent": "programmer",
                    "subtask": subtask or original_task,
                    "content": response,
                }
        
        if "DELEGATE_TO_GUI_OPERATOR:" in response_upper:
            parts = response.split("DELEGATE_TO_GUI_OPERATOR:", 1)
            if len(parts) > 1:
                subtask = parts[1].strip()
                if "\n" in subtask:
                    subtask = subtask.split("\n")[0].strip()
                return {
                    "type": "delegate",
                    "agent": "gui",
                    "subtask": subtask or original_task,
                    "content": response,
                }
        
        if "TASK_COMPLETED:" in response_upper:
            parts = response.split("TASK_COMPLETED:", 1)
            summary = parts[1].strip() if len(parts) > 1 else "Task completed"
            if "\n" in summary:
                summary = summary.split("\n")[0].strip()
            return {
                "type": "final",
                "agent": None,
                "subtask": None,
                "content": summary or "Task completed successfully",
            }
        
        # Fallback: check for completion phrases
        response_lower = response.lower()
        if any(phrase in response_lower for phrase in [
            "task completed",
            "task is complete",
            "completed successfully",
            "finished",
            "done",
        ]):
            return {
                "type": "final",
                "agent": None,
                "subtask": None,
                "content": response[:200] if len(response) > 200 else response,
            }
        
        # Fallback: check for delegation keywords
        if "delegate_to_programmer" in response_lower or "programmer" in response_lower:
            subtask = self._extract_subtask(response, original_task)
            return {
                "type": "delegate",
                "agent": "programmer",
                "subtask": subtask,
                "content": response,
            }
        
        if "delegate_to_gui_operator" in response_lower or "gui operator" in response_lower or "visual" in response_lower:
            subtask = self._extract_subtask(response, original_task)
            return {
                "type": "delegate",
                "agent": "gui",
                "subtask": subtask,
                "content": response,
            }
        
        # Default: try to infer from task content
        task_lower = original_task.lower()
        if any(keyword in task_lower for keyword in [
            "click", "screenshot", "visual", "gui", "interface", "button", "window",
            "screen", "image", "see", "look", "display"
        ]):
            return {
                "type": "delegate",
                "agent": "gui",
                "subtask": original_task,
                "content": response,
            }
        else:
            return {
                "type": "delegate",
                "agent": "programmer",
                "subtask": original_task,
                "content": response,
            }
    
    def _extract_subtask(self, response: str, fallback_task: str) -> str:
        """Extract subtask description from orchestrator response."""
        # Try to find quoted text or task description
        import re
        
        # Look for quoted text
        quoted = re.search(r'["\']([^"\']+)["\']', response)
        if quoted:
            return quoted.group(1)
        
        # Look for "subtask:" or similar patterns
        subtask_match = re.search(r'subtask[:\s]+(.+?)(?:\.|$)', response, re.IGNORECASE)
        if subtask_match:
            return subtask_match.group(1).strip()
        
        # Fallback to original task
        return fallback_task

