# Quick Start Guide

This guide gets you up and running with the Personal Assistant Backend in under 10 minutes.

## Prerequisites

- **Python 3.9+**: Check with `python --version`
- **Git**: For cloning the repository

## 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd personal-assistant

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

## 2. Configure API Keys

Set up your LLM provider API keys:

```powershell
# Windows PowerShell
$env:OPENAI_API_KEY = "your-openai-api-key"
$env:ANTHROPIC_API_KEY = "your-anthropic-api-key"
```

Or create a `.env` file in the `backend/` directory:

```bash
# backend/.env
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## 3. First Run

```bash
# Navigate to backend
cd backend

# Start the server (development mode)
python -m src.main
```

**Expected Output:**
```
INFO: Started server process [12345]
INFO: Waiting for application startup.
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8765 (Press CTRL+C to quit)
```

## 4. Test the API

Open a new terminal and test the WebSocket connection:

```javascript
// Create a test file (test_connection.js)
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8765/ws');

// Send handshake
ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'handshake',
    user_id: 'test-user'
  }));

  // Send a ping
  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 'test-ping',
      type: 'ping',
      payload: { text: 'Hello!' }
    }));
  }, 1000);
});

ws.on('message', (data) => {
  console.log('Received:', JSON.parse(data.toString()));
});

// Run with: node test_connection.js
```

## 5. Send Your First Query

```javascript
// Send a simple query
ws.send(JSON.stringify({
  id: 'first-query',
  type: 'query',
  payload: {
    text: 'Hello, can you help me with Python development?'
  }
}));
```

**Expected Response Flow:**
1. `streaming-response` messages with the assistant's reply
2. `streaming-complete` when finished

## 6. Development Workflow

### Auto-Reload Development
```bash
# The server auto-reloads on code changes
# Edit files and see changes immediately
```

### Running Tests
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=backend/src --cov-report=html
```

### Code Quality
```bash
# Type checking
mypy backend/src

# Linting
flake8 backend/src
```

## 7. Common Issues

### Import Errors
```bash
# Fix Python path
export PYTHONPATH=$PWD:$PYTHONPATH
python -m backend.src.main
```

### Port Already in Use
```bash
# Kill existing process
lsof -ti:8765 | xargs kill -9
```

### Missing Dependencies
```bash
# Reinstall requirements
pip install -r backend/requirements.txt --force-reinstall
```

## 8. Next Steps

Now that you're up and running:

- **[Developer Guide](DEVELOPER_GUIDE.md)**: Complete development setup and best practices
- **[Architecture Overview](architecture.md)**: Understand system design
- **[Tool Development Guide](tool_development.md)**: Create custom tools
- **[API Reference](api_reference.md)**: Full WebSocket API documentation

## Frontend Development

To develop with the frontend:

```bash
# In a separate terminal
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Production Deployment

For production deployment:

```bash
# Use production settings
uvicorn backend.src.main:app --host 0.0.0.0 --port 8765 --workers 4
```

See **[Deployment Guide](deployment_operations.md)** for complete production setup.

## Getting Help

- Check **[Troubleshooting Guide](troubleshooting.md)** for common issues
- Review **[Testing Guide](testing_guide.md)** for test patterns
- Read **[Architecture Decision Records](adr/)** for design rationale

🎉 **You're ready to develop with the Personal Assistant Backend!**
