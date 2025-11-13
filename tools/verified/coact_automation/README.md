# CoAct-1 Computer Automation Tool

A marketplace tool for the Desktop Assistant that implements the CoAct-1 multi-agent architecture for intelligent computer automation.

## Overview

CoAct-1 uses three specialized AI agents working together to execute complex computer tasks:

- **Orchestrator**: Task decomposition and strategic planning
- **Programmer**: Code execution and system operations
- **GUI Operator**: Vision-based graphical user interface interactions

## Features

- **Intelligent Task Decomposition**: Breaks complex tasks into executable subtasks
- **Multi-Modal Execution**: Combines code execution with visual GUI interactions
- **Advanced OCR Integration**: Text element detection with ID-based clicking using `click_ocr_element` tool
- **Precision GUI Automation**: LLM-powered element matching for accurate visual interactions
- **Memory Learning**: Contributes execution insights to improve future performance
- **Local Execution**: No external dependencies or cloud APIs required

## Usage

The tool accepts natural language task descriptions and executes them using the coordinated agent system.

### Example Tasks

- "Open Firefox and navigate to GitHub"
- "Create a text file with 'Hello World' content"
- "Take a screenshot and save it as test.png"
- "Open a terminal and check disk usage"

## Architecture

The tool implements internal agent coordination:

1. **Orchestrator Agent** analyzes the task and creates an execution plan
2. **Programmer Agent** handles shell commands, file operations, and code execution
3. **GUI Operator Agent** manages visual interactions using OCR and vision models
4. **Coordination Layer** manages agent communication and state throughout execution

## Memory Contributions

This tool contributes to the system's learning by providing:

- **Episodic Memories**: Detailed execution logs of agent actions and decisions
- **Semantic Facts**: Learned patterns about tool effectiveness and system behaviors
- **Performance Insights**: Success rates and execution times for different task types

## Requirements

- Desktop Assistant with marketplace support
- Built-in tools: screenshot (with OCR), click_ocr_element, mouse_control, keyboard_control, run_shell_command, file operations
- Optional: OCR support for enhanced text element detection
- Optional: Vision models for advanced GUI element detection

## Configuration

The tool automatically uses available built-in tools and gracefully degrades when advanced features aren't available.

## Privacy & Security

- All execution happens locally on the user's computer
- No data is sent to external services
- User consent required for memory contributions
- Isolated execution within the Desktop Assistant environment

## License

MIT License - See main project LICENSE file.
