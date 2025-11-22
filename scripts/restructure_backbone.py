import shutil
import os
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def move_path(src: Path, dest: Path):
    """Moves a file or directory from src to dest, creating parent dirs if needed."""
    if not src.exists():
        logger.warning(f"Source not found: {src}")
        return

    if dest.exists():
        logger.warning(f"Destination already exists: {dest}")
        if src.is_file():
            logger.info(f"Overwriting file: {dest}")
            os.remove(dest)
            shutil.move(str(src), str(dest))
        else:
            logger.info(f"Merging directory: {src} -> {dest}")
            for item in src.iterdir():
                move_path(item, dest / item.name)
            shutil.rmtree(src) 
        return

    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    logger.info(f"Moved: {src} -> {dest}")

def main():
    root = Path("backend/src")
    if not root.exists():
        logger.error(f"Root directory not found: {root}")
        return

    logger.info(f"Starting restructuring in: {root}")

    # --- 1. Core Foundation (nervous_system -> core) ---
    core_dir = root / "core"
    ns_dir = root / "nervous_system"
    
    if ns_dir.exists():
        logger.info("--- Migrating Nervous System to Core ---")
        # Move contents
        for item in ns_dir.iterdir():
            if item.name == "__pycache__": continue
            if item.name == "__init__.py": continue 
            
            if item.name == "wiring.py":
                move_path(item, core_dir / "container.py") 
            else:
                move_path(item, core_dir / item.name)
        
        if ns_dir.exists():
            shutil.rmtree(ns_dir, ignore_errors=True)

    # --- 2. API Gateway (interfaces -> api) ---
    api_dir = root / "api"
    interfaces_dir = root / "interfaces"
    
    if interfaces_dir.exists():
        logger.info("--- Migrating Interfaces to API ---")
        for item in interfaces_dir.iterdir():
            if item.name == "__pycache__": continue
            if item.name == "__init__.py": continue
            
            if item.name == "stream.py":
                move_path(item, api_dir / "routes" / "websocket.py")
            else:
                move_path(item, api_dir / item.name)
                
        if interfaces_dir.exists():
            shutil.rmtree(interfaces_dir, ignore_errors=True)

    # --- 3. Tooling Ecosystem (body -> tools) ---
    tools_dir = root / "tools"
    body_dir = root / "body"
    
    if body_dir.exists():
        logger.info("--- Migrating Body to Tools ---")
        
        # Direct moves
        move_path(body_dir / "base.py", tools_dir / "base.py")
        move_path(body_dir / "registry.py", tools_dir / "registry.py")
        move_path(body_dir / "adapter.py", tools_dir / "adapter.py")
        move_path(body_dir / "definitions.py", tools_dir / "definitions.py")
        move_path(body_dir / "loader.py", tools_dir / "loader.py")
        
        if (body_dir / "marketplace").exists():
            move_path(body_dir / "marketplace", tools_dir / "marketplace")
            
        # Flatten actions
        actions_dir = body_dir / "actions"
        if actions_dir.exists():
            # Computer
            if (actions_dir / "computer").exists():
                move_path(actions_dir / "computer", tools_dir / "computer")
            # Filesystem
            if (actions_dir / "filesystem").exists():
                move_path(actions_dir / "filesystem", tools_dir / "filesystem")
        
        # Internal Shell Tool
        shell_tool = body_dir / "internal" / "shell_tool.py"
        if shell_tool.exists():
            move_path(shell_tool, tools_dir / "system" / "shell_tool.py")

        if body_dir.exists():
            shutil.rmtree(body_dir, ignore_errors=True)

    # --- 4. Agent Brain (Brain Restructuring) ---
    brain_dir = root / "brain"
    executive_dir = brain_dir / "executive"
    language_dir = brain_dir / "language"
    
    # brain/control
    if executive_dir.exists():
        logger.info("--- Migrating Brain Executive to Control/Processing ---")
        control_dir = brain_dir / "control"
        processing_dir = brain_dir / "processing"
        
        move_path(executive_dir / "executor.py", control_dir / "agent_loop.py")
        move_path(executive_dir / "tool_orchestrator.py", control_dir / "orchestrator.py")
        move_path(executive_dir / "pipeline.py", control_dir / "pipeline.py")
        move_path(executive_dir / "plugin_manager.py", control_dir / "plugin_manager.py")
        move_path(executive_dir / "plugin_interface.py", control_dir / "plugin_interface.py")
        if (executive_dir / "plugins").exists():
             move_path(executive_dir / "plugins", control_dir / "plugins")

        move_path(executive_dir / "response_parser.py", processing_dir / "parser.py")
        
        if executive_dir.exists():
             shutil.rmtree(executive_dir, ignore_errors=True)
             
    # brain/llm
    if language_dir.exists():
        logger.info("--- Migrating Brain Language to LLM ---")
        llm_dir = brain_dir / "llm"
        move_path(language_dir, llm_dir) # rename directory

    # --- 5. Utilities (shared -> core/utils) ---
    shared_dir = root / "shared"
    if shared_dir.exists():
        logger.info("--- Migrating Shared to Core/Utils ---")
        if (shared_dir / "utils").exists():
            move_path(shared_dir / "utils", core_dir / "utils")
        
        if shared_dir.exists():
            shutil.rmtree(shared_dir, ignore_errors=True)

    # --- Create __init__.py files where missing ---
    dirs_to_init = [
        core_dir, api_dir, tools_dir, 
        core_dir / "utils", 
        tools_dir / "system", 
        api_dir / "routes",
        brain_dir / "control",
        brain_dir / "processing",
        brain_dir / "llm"
    ]
    
    for d in dirs_to_init:
        d.mkdir(parents=True, exist_ok=True)
        init_file = d / "__init__.py"
        if not init_file.exists():
            init_file.touch()

    logger.info("Restructuring complete!")

if __name__ == "__main__":
    main()

