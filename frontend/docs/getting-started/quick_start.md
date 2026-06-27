---
summary: "Quick Start Guide"
read_when:
  - When running first-time setup.
---

# Quick Start Guide

## Prerequisites

- **Windows 10/11, macOS, or Linux**
- **Python 3.11**
- **Node.js 18+** and npm
- **Git**

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd WindieOS
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install
```

On Windows PowerShell, use `npm.cmd` if `npm` resolves to `npm.ps1` and the
default execution policy blocks it:

```powershell
cd frontend
npm.cmd install
```

Install local-runtime Python dependencies (used for tool execution) into the same
Python environment you will use to launch Electron:

```bash
cd frontend/src/main/python
pip install -r requirements.txt
```

## Running the Application

### Development Mode

You must run the backend and frontend in separate terminals.

**Terminal 1: Start the Backend**

```bash
# Activate your Python env (conda or venv) if you use one

# Optional: set an API key for the provider you plan to use
export OPENAI_API_KEY="your-api-key"
# Note: The backend can start without a key, but requests to that provider will fail.

# Run the backend from the project root (auto-uses `jarvis` env if present)
<windie> start backend
```

**Terminal 2: Start the Desktop Dev Loop**

```bash
<windie> start dev
```

Windows PowerShell:

```powershell
<windie> start dev
```

## Hosted Mode (Planned)

The current build runs locally. A hosted mode is planned with:
- Login/signup
- Subscription plans
- Usage limits and plan-based feature access

When available, you will:
1. Log in to the hosted backend.
2. Connect via secure `wss://` WebSocket.
3. See usage meters and plan entitlements in the UI.

## Configuration

### Initial Setup

There is no YAML config file. Configuration is split between:

- **Backend**: `backend/src/core/config/app_config.py` (requires restart)
- **Frontend**: Local JSON settings stored in Electron user data (`frontend-config.json`)

### Setting Up Your LLM Provider

1. **Get an API Key** from your chosen provider:
   - OpenAI: https://platform.openai.com/api-keys
   - Anthropic: https://console.anthropic.com/
   - Gemini (Google AI Studio): https://makersuite.google.com/app/apikey
   - OpenRouter: https://openrouter.ai/keys

2. **Set Environment Variable**:
   ```bash
   # For OpenAI
   export OPENAI_API_KEY="your-api-key-here"
   
   # For Anthropic
   export ANTHROPIC_API_KEY="your-api-key-here"
   
   # For other providers, see Configuration Guide
   ```

   Windows PowerShell:

   ```powershell
   $env:OPENAI_API_KEY = "your-api-key-here"
   $env:ANTHROPIC_API_KEY = "your-api-key-here"
   ```

3. **Configure in Settings**:
   - Open the Settings Panel in the UI
   - Select your model provider
   - Choose your model
   - Settings save automatically

## First Steps

### 1. Send a Test Message

Type a message in the chat interface:
```
Hello! Can you help me?
```

### 2. Try Computer Control

Ask the assistant to interact with your computer:
```
Take a screenshot
```

```
Click on the Start button
```

### 3. Try File Operations

Ask the assistant to work with files:
```
List files in the current directory
```

```
Read the file README.md
```

## Common Tasks

### Changing LLM Provider

1. Open Settings Panel
2. Select "Model Mode" (Online or Local)
3. Choose your provider
4. Select your model
5. Settings save automatically

### Enabling Voice Mode

1. Open Settings Panel
2. Toggle "Voice Mode" on
3. Speak your commands
4. Assistant will transcribe and respond

### Enabling Text-to-Speech

1. Open Settings Panel
2. Toggle "Speech Mode" on
3. Assistant responses will be spoken

## Troubleshooting

### Backend Won't Start

1. **Check Python Version**:
   ```bash
   python --version  # Should be 3.11
   ```

2. **Check Dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **Check API Key**:
   ```bash
   echo $OPENAI_API_KEY  # Should show your key
   ```

### Frontend Won't Start

1. **Check Node.js Version**:
   ```bash
   node --version  # Should be 18+
   ```

2. **Check Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Check Port Availability**:
   - Backend uses port `8765`
   - Frontend dev server uses port `5173`

### Connection Issues

1. **Check Which Backend Mode You Expect**:
   - Hosted mode: verify the app can reach `https://api.windieos.com` / `wss://api.windieos.com/ws`
   - Local/self-hosted mode: verify your backend process is running and reachable

2. **Check WebSocket Connection**:
   - Look for connection status in UI
   - Should show "Connected" status

3. **Check Firewall**:
   - Ensure backend host/port is reachable from the Electron machine
   - For remote backend, set `BACKEND_HOST` (or `BACKEND_HTTP_URL` / `BACKEND_WS_URL`) before launching Electron

## Next Steps

- **Read the Documentation**: See [Documentation Index](../README.md)
- **Configure Settings**: See Configuration Guide (private backend docs)
- **Develop Tools**: See [Tool Development Guide](../development/tool_development.md)
- **Understand Architecture**: See [Architecture Overview](../architecture/architecture.md)

## Getting Help

- **Documentation**: See [Documentation Index](../README.md)
- **Troubleshooting**: See [Troubleshooting Guide](troubleshooting.md)
- **Issues**: Check GitHub Issues
- **Discussions**: Check GitHub Discussions

---

**Welcome to WindieOS.**
