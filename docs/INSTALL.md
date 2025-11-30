# Installation Guide

This guide provides comprehensive instructions for installing and setting up the Personal Assistant on different platforms.

## 📋 Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Operating System** | Windows 10, macOS 10.15, Ubuntu 18.04 | Windows 11, macOS 12+, Ubuntu 20.04+ |
| **RAM** | 4GB | 8GB+ |
| **Storage** | 2GB free space | 5GB+ free space |
| **GPU** | Optional | NVIDIA GPU with CUDA support |
| **Network** | Internet connection for cloud LLMs | High-speed internet |

### Software Dependencies

- **Python 3.9+**: Backend runtime
- **Node.js 18+**: Frontend build tools
- **Git**: Version control
- **LLM API Access**: OpenAI, Anthropic, or local LLM setup

## 🚀 Quick Installation

### Option 1: Pre-built Release (Recommended for Users)

1. **Download** the latest release from [GitHub Releases](https://github.com/yourusername/desktop-assistant/releases)
2. **Run the installer** for your platform:
   - **Windows**: Run `Personal-Assistant-Setup.exe`
   - **macOS**: Open `Personal-Assistant.dmg` and drag to Applications
   - **Linux**: Extract and run `personal-assistant.AppImage`
3. **Launch** the application and follow the setup wizard

### Option 2: Development Installation

For developers or advanced users who want to contribute or customize:

```bash
# Clone the repository
git clone https://github.com/yourusername/desktop-assistant.git
cd desktop-assistant

# Follow platform-specific setup below
```

## 🪟 Windows Installation

### Method 1: Pre-built Installer (Recommended)

1. Download `Personal-Assistant-Setup.exe` from releases
2. Run the installer as administrator
3. Follow the installation wizard
4. Launch from Start Menu or desktop shortcut

### Method 2: Manual Setup

```powershell
# Install Python 3.9+ (using winget)
winget install Python.Python.3.9

# Install Node.js 18+
winget install OpenJS.NodeJS

# Clone and setup
git clone https://github.com/yourusername/desktop-assistant.git
cd desktop-assistant

# Backend setup
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ..\frontend
npm install
cd ..

# Install pre-commit hooks
pre-commit install
```

### Windows-Specific Notes

- **Antivirus Software**: May flag the application during installation - this is normal for automation software
- **Permissions**: Grant screen recording and accessibility permissions when prompted
- **Firewall**: Allow network access for LLM API calls
- **GPU Support**: Install CUDA toolkit if you have an NVIDIA GPU

## 🍎 macOS Installation

### Method 1: Pre-built App (Recommended)

1. Download `Personal-Assistant.dmg` from releases
2. Open the DMG file
3. Drag Personal Assistant to Applications folder
4. Launch from Applications or Spotlight

### Method 2: Manual Setup

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3.9+
brew install python@3.9

# Install Node.js
brew install node@18

# Clone and setup
git clone https://github.com/yourusername/desktop-assistant.git
cd desktop-assistant

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
cd ..

# Install pre-commit hooks
pre-commit install
```

### macOS-Specific Notes

- **Security**: First launch may be blocked by Gatekeeper
  - Right-click the app and select "Open"
  - Or run: `xattr -rd com.apple.quarantine /Applications/Personal\ Assistant.app`
- **Permissions**: Grant:
  - Accessibility access (System Preferences → Security & Privacy → Privacy → Accessibility)
  - Screen Recording (System Preferences → Security & Privacy → Privacy → Screen Recording)
  - Microphone access for voice features (when available)

## 🐧 Linux Installation

### Method 1: AppImage (Recommended)

1. Download `Personal-Assistant.AppImage` from releases
2. Make executable: `chmod +x Personal-Assistant.AppImage`
3. Run: `./Personal-Assistant.AppImage`

### Method 2: Manual Setup

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install python3.9 python3.9-venv nodejs npm git

# Install system dependencies (Fedora/RHEL)
sudo dnf install python39 python39-devel nodejs npm git

# Install system dependencies (Arch)
sudo pacman -S python python-pip nodejs npm git

# Clone and setup
git clone https://github.com/yourusername/desktop-assistant.git
cd desktop-assistant

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
cd ..

# Install pre-commit hooks
pre-commit install
```

### Linux-Specific Notes

- **Display Server**: Requires X11 or Wayland
- **Permissions**: May need to configure accessibility permissions
- **Sandboxing**: Works with Firejail for additional security
- **GPU Support**: Install CUDA drivers for NVIDIA GPU acceleration

## ⚙️ Configuration Setup

### First-Time Setup Wizard

The application includes a setup wizard that will:
1. Guide you through LLM provider selection
2. Help configure API keys
3. Set up basic preferences
4. Test connectivity

### Manual Configuration

Create configuration file at:
- **Windows**: `%APPDATA%\DesktopAssistant\config.yaml`
- **macOS**: `~/Library/Application Support/DesktopAssistant/config.yaml`
- **Linux**: `~/.config/DesktopAssistant/config.yaml`

Example configuration:
```yaml
# LLM Configuration
llm:
  provider: openai  # Options: openai, anthropic, google, ollama, lmstudio, openrouter, mistral
  model: gpt-4
  api_key: your-api-key-here

# Memory Configuration
memory:
  enabled: true
  vector_store: faiss
  cuda_acceleration: true

# Tool Configuration
tools:
  marketplace_enabled: true
  security_validation: true

# UI Configuration
ui:
  theme: system
  notifications: true
```

## 🔑 LLM Provider Setup

### OpenAI
```bash
# Set environment variable
export OPENAI_API_KEY="your-api-key-here"
# Or add to config.yaml
```

### Anthropic
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

### Google Gemini
```bash
export GOOGLE_API_KEY="your-api-key-here"
```

### Local LLM Setup (Ollama)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama2

# Configure in config.yaml
llm:
  provider: ollama
  model: llama2
```

### LM Studio
```bash
# Install LM Studio from https://lmstudio.ai/
# Start local server in LM Studio
# Configure in config.yaml
llm:
  provider: lmstudio
  base_url: http://localhost:1234
```

## 🚀 Running the Application

### Development Mode

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
python -m backend.src.main

# Terminal 2: Frontend (Development)
cd frontend
npm run dev

# Terminal 3: Electron App
cd frontend
npm run electron
```

### Production Mode

```bash
# Build and run
cd frontend
npm run build
npm run electron
```

## 🔍 Verification

After installation, verify everything works:

1. **Launch the application**
2. **Test basic functionality**:
   - Type "Hello, introduce yourself"
   - Check if response appears
3. **Test computer control**:
   - Ask to "take a screenshot"
   - Verify screenshot appears
4. **Test tool marketplace**:
   - Ask about available tools
   - Try a simple tool like weather

## 🐛 Troubleshooting Installation

### Common Issues

**"Python not found"**
- Ensure Python 3.9+ is installed and in PATH
- On Windows: Use `py -3.9` instead of `python`

**"Node.js version too old"**
- Update Node.js to version 18+
- Use nvm for version management

**"Permission denied"**
- Run terminal as administrator/sudo
- Check file permissions on installation directory

**"LLM connection failed"**
- Verify API keys are correct
- Check internet connectivity
- Test with a simple curl command to the API

**"CUDA not available"**
- Install CUDA toolkit for your GPU
- Verify GPU drivers are up to date

### Getting Help

- **Installation Issues**: Check [Troubleshooting Guide](TROUBLESHOOTING.md)
- **Community Support**: [GitHub Discussions](https://github.com/yourusername/desktop-assistant/discussions)
- **Bug Reports**: [GitHub Issues](https://github.com/yourusername/desktop-assistant/issues)

## 📈 Post-Installation

### Recommended Next Steps

1. **Explore Features**: Try different commands and tools
2. **Customize Settings**: Adjust preferences in the settings panel
3. **Install Tools**: Browse the marketplace for additional capabilities
4. **Learn Advanced Usage**: Read the [User Guide](user_guide.md)

### Performance Optimization

- **Enable CUDA**: If you have a compatible GPU
- **Configure Memory**: Adjust memory settings based on your system
- **Tool Selection**: Only enable tools you need

---

**Need Help?** Check the [Troubleshooting Guide](TROUBLESHOOTING.md) or join our [community discussions](https://github.com/yourusername/desktop-assistant/discussions).
