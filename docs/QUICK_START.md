# Quick Start Guide

## Prerequisites

- **Windows 10/11, macOS, or Linux**
- **Python 3.9+**
- **Node.js 18+** and npm
- **Git**

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ALL_OR_NOTHING
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

## Running the Application

### Development Mode

You must run the backend and frontend in separate terminals.

**Terminal 1: Start the Backend**

```bash
# Make sure your conda env is active (if using conda)
conda activate desktop-assistant-env

# Set a required API key (even a dummy one) for startup
export OPENAI_API_KEY="dummy-key"
# Note: A dummy key is sufficient for the application to start.
# A valid API key is only required if you set OpenAI as the active provider.

# Run the server as a module from the project root
python -m backend.src.main
```

**Terminal 2: Start the Frontend UI (Vite)**

```bash
cd frontend
npm run dev
```

**Terminal 3: Start the Frontend App (Electron)**

```bash
cd frontend
npm run electron
```

## Configuration

### Initial Setup

**Note**: The application uses Python-based configuration, not YAML files.

Configuration is defined in `backend/src/core/config/app_config.py`. To change settings, edit this file and restart the application.

API keys are loaded from environment variables (see above).

### Setting Up Your LLM Provider

1. **Get an API Key** from your chosen provider:
   - OpenAI: https://platform.openai.com/api-keys
   - Anthropic: https://console.anthropic.com/
   - Google: https://makersuite.google.com/app/apikey
   - OpenRouter: https://openrouter.ai/keys

2. **Set Environment Variable**:
   ```bash
   # For OpenAI
   export OPENAI_API_KEY="your-api-key-here"
   
   # For Anthropic
   export ANTHROPIC_API_KEY="your-api-key-here"
   
   # For other providers, see Configuration Guide
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
   python --version  # Should be 3.9+
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

1. **Check Backend is Running**:
   - Look for "Application startup complete" in backend logs

2. **Check WebSocket Connection**:
   - Look for connection status in UI
   - Should show "Connected" status

3. **Check Firewall**:
   - Ensure localhost connections are allowed

## Next Steps

- **Read the Documentation**: See [Documentation Index](README.md)
- **Configure Settings**: See [Configuration Guide](CONFIGURATION.md)
- **Develop Tools**: See [Tool Development Guide](TOOL_DEVELOPMENT.md)
- **Understand Architecture**: See [Architecture Overview](ARCHITECTURE.md)

## Getting Help

- **Documentation**: See [Documentation Index](README.md)
- **Troubleshooting**: See [Troubleshooting Guide](TROUBLESHOOTING.md)
- **Issues**: Check GitHub Issues
- **Discussions**: Check GitHub Discussions

---

**Welcome to Desktop Assistant!** 🚀
