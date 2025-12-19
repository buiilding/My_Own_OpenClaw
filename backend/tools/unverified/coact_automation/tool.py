"""
CoAct-1 Computer Automation Tool

Main entry point for the CoAct-1 multi-agent computer automation system.
Implements a hierarchical multi-agent workflow using Orchestrator, Programmer, and GUI Operator agents.
"""
import logging
from typing import Dict, Any

from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext

from .coordinator import WorkflowCoordinator

logger = logging.getLogger(__name__)


class CoAct1Args(BaseModel):
    """Arguments for CoAct-1 automation tool."""
    task: str = Field(..., description="Natural language description of the computer automation task to execute")


class CoAct1Tool(Tool[CoAct1Args]):
    """
    CoAct-1 Multi-Agent Computer Automation Tool
    
    Executes complex computer automation tasks using a hierarchical multi-agent system:
    - Orchestrator: Task decomposition and delegation
    - Programmer: Shell commands and file operations
    - GUI Operator: Vision-based GUI interactions
    
    The system coordinates these agents to break down complex tasks into executable subtasks.
    """
    
    name = "coact1_computer_automation"
    description = (
        "Multi-agent system for complex computer automation tasks. "
        "Uses three specialized agents (Orchestrator, Programmer, GUI Operator) "
        "to execute tasks through coordinated action. Supports natural language task descriptions."
    )
    args_model = CoAct1Args
    
    async def run(self, args: CoAct1Args, ctx: ToolContext) -> Dict[str, Any]:
        """
        Execute a computer automation task using the CoAct-1 multi-agent system.

        Args:
            args: Task arguments containing the task description
            ctx: Tool execution context

        Returns:
            Dictionary with execution results
        """
        try:
            # Get parent session from context
            parent_session = ctx.services.get("session")
            if not parent_session:
                return {
                "success": False,
                    "error": "Parent AgentSession not available in context",
                    "llm_content": "Error: Context missing parent session",
                }
            
            # Create workflow coordinator
            coordinator = WorkflowCoordinator(
                parent_session=parent_session,
                max_iterations=10,
            )
            
            # Execute workflow
            logger.info(f"Starting CoAct-1 workflow for task: {args.task}")
            result = await coordinator.execute_workflow(args.task)
            
            # Format response
            if result.get("success"):
                summary = result.get("summary", "Task completed")
                iterations = result.get("iterations_completed", 0)
                
                return {
                    "success": True,
                    "summary": summary,
                    "iterations_completed": iterations,
                    "execution_results": result.get("execution_results", []),
                    "llm_content": (
                        f"✅ CoAct-1 task completed successfully.\n"
                        f"Summary: {summary}\n"
                        f"Iterations: {iterations}"
                    ),
                    "return_display": (
                        f"✅ Task completed: {summary}\n"
                        f"Completed in {iterations} iteration(s)"
                    ),
                }
            else:
                error = result.get("error", "Task execution failed")
                iterations = result.get("iterations_completed", 0)
                
                return {
                    "success": False,
                    "error": error,
                    "iterations_completed": iterations,
                    "execution_results": result.get("execution_results", []),
                    "llm_content": (
                        f"❌ CoAct-1 task failed.\n"
                        f"Error: {error}\n"
                        f"Iterations completed: {iterations}"
                    ),
                    "return_display": (
                        f"❌ Task failed: {error}\n"
                        f"Completed {iterations} iteration(s) before failure"
                    ),
                }
                
        except Exception as e:
            logger.error(f"CoAct-1 tool execution error: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"CoAct-1 execution failed: {str(e)}",
                "llm_content": f"Error: CoAct-1 system encountered an error: {str(e)}",
                "return_display": f"Automation error: {str(e)}",
            }
