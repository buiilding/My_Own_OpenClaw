import logging
from pydantic import BaseModel, Field
from typing import List, Optional

from backend.src.sdk.agents.base import Agent
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

logger = logging.getLogger(__name__)

# --- Arguments Models ---
class TopicArgs(BaseModel):
    topic: str = Field(..., description="The topic to research or write about")

class OutlineArgs(BaseModel):
    outline: str = Field(..., description="The outline to write the article from")

# --- Agent 1: Researcher ---
class ResearcherAgent(Agent[TopicArgs]):
    name = "researcher_agent"
    description = "Researches a topic and produces an outline."
    args_model = TopicArgs
    
    # The magic: Just define the persona and capabilities
    system_prompt = """
    You are an expert Researcher.
    Identify target audience, research trends, and produce a structured outline (H1/H2/H3).
    Return ONLY the outline.
    """
    # Using tools available in the system
    allowed_tools = ["read_file", "run_shell_command"]

# --- Agent 2: Writer ---
class WriterAgent(Agent[OutlineArgs]):
    name = "writer_agent"
    description = "Writes a polished article based on an outline."
    args_model = OutlineArgs
    
    system_prompt = """
    You are an expert Writer.
    Convert the provided outline into a polished blog post.
    Ensure tone is professional.
    """
    allowed_tools = [] # Pure writer, no external tools needed

# --- The Orchestrator Tool ---
class BlogOrchestrator(Tool[TopicArgs]):
    name = "write_blog_post"
    description = "Creates a full blog post by researching and then writing it using specialized sub-agents."
    args_model = TopicArgs

    async def run(self, args: TopicArgs, ctx: Context) -> dict:
        """
        Executes the two-agent workflow: Researcher -> Writer.
        """
        logger.info(f"Starting Blog Workflow for topic: {args.topic}")
        
        # 1. Call the Researcher
        # Note: We can execute agents just like tools because they ARE tools
        # We instantiate them here.
        researcher = ResearcherAgent() 
        
        # We manually inject the name if it wasn't set in class (it is set)
        
        logger.info("Running Researcher Agent...")
        # Pass the context!
        research_result = await researcher.run(args, ctx)
        
        if not research_result["success"]:
            return {
                "success": False, 
                "error": f"Research failed: {research_result.get('error')}",
                "llm_content": "Research failed"
            }
            
        outline = research_result["llm_content"]
        logger.info(f"Researcher finished. Outline length: {len(outline)}")
        
        # 2. Call the Writer
        writer = WriterAgent()
        writer_args = OutlineArgs(outline=outline)
        
        logger.info("Running Writer Agent...")
        write_result = await writer.run(writer_args, ctx)
        
        if not write_result["success"]:
             return {
                "success": False, 
                "error": f"Writing failed: {write_result.get('error')}",
                "llm_content": "Writing failed"
            }

        final_post = write_result["llm_content"]
        logger.info("Writer finished.")
        
        return {
            "success": True,
            "llm_content": final_post,
            "return_display": "Blog post created successfully!"
        }

