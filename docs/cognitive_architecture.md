# Cognitive Architecture Refactor: The Pipeline

To make the agent's "brain" intuitive and enterprise-grade, we will move from a monolithic "Executor" loop to a modular **Cognitive Pipeline**.

## 1. The Architecture

The "Thinking Process" will be broken down into distinct, testable steps:

1.  **Perception (Input)**:
    *   Receives user query.
    *   Retrieves relevant memories (Episodic + Semantic).
    *   Processes visual inputs (Screenshots).
    *   *Output*: `Context` object.

2.  **Cognition (Thinking)**:
    *   Constructs the prompt (System + Context + Tools).
    *   Streams the LLM response.
    *   Parses the decision (Text vs. Tool Call).
    *   *Output*: `Thought` or `Decision`.

3.  **Action (Execution)**:
    *   If `Decision` is a tool call: Executes the tool.
    *   *Output*: `ActionResult`.

4.  **Consolidation (Learning)**:
    *   Updates Short-term Memory (History).
    *   Updates Long-term Memory (Episodic Store).

## 2. Benefits

*   **Intuitive**: You can see exactly *where* the agent fails (e.g., "It failed in Perception, so it didn't see the memory").
*   **Modular**: You can swap out the "Cognition" step for a different model logic without breaking the "Action" step.
*   **Enterprise-Grade**: Each step is independently unit-testable.

## 3. Implementation Plan

We will refactor `backend/src/brain/executive/` to include this pipeline.

### New Files
*   `backend/src/brain/executive/pipeline.py`: Defines `CognitiveStep` interface and `Pipeline` runner.
*   `backend/src/brain/executive/steps/perception.py`: Handles memory/input.
*   `backend/src/brain/executive/steps/cognition.py`: Handles LLM interaction.
*   `backend/src/brain/executive/steps/action.py`: Handles tool execution.

### Modified Files
*   `backend/src/brain/executive/executor.py`: Will now coordinate the pipeline instead of containing the raw loop.
*   `backend/src/brain/core.py`: Clean up initialization.
*   `backend/src/memory/memory_manager.py`: Remove formatting logic.

