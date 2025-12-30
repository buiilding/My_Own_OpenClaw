# Deployment Checklist

This checklist ensures successful deployment of the Personal Assistant Backend to production environments. Follow each step in order for a smooth deployment process.

## Pre-Deployment Preparation

### Environment Setup
- [ ] **Target Environment**: Confirm deployment target (AWS/GCP/Azure/Docker/on-premises)
- [ ] **Server Requirements**:
  - Python 3.9+ installed
  - Sufficient RAM (4GB minimum, 8GB recommended)
  - Sufficient disk space (10GB minimum)
  - Network connectivity to required services
- [ ] **Security Groups/Firewalls**: Open port 8765 for WebSocket connections
- [ ] **SSL/TLS Certificates**: Valid certificates configured for HTTPS

### Configuration
- [ ] **Environment Variables**: All required API keys configured
  - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
  - `LOG_LEVEL=WARNING` (production)
  - `DATABASE_URL` (if using external database)
- [ ] **Configuration File**: Production config file validated
  ```yaml
  # config/production.yaml
  llm:
    provider: "openai"  # or "anthropic"
    temperature: 0.7
  security:
    allowed_origins: ["https://yourdomain.com"]
  ```
- [ ] **Database**: Database connection tested (SQLite for simple deployments, PostgreSQL for production)

### Application Preparation
- [ ] **Code Freeze**: No active development on deployment branch
- [ ] **Tests Pass**: All tests passing
  ```bash
  pytest --cov=backend/src --cov-fail-under=80
  ```
- [ ] **Linting**: Code passes quality checks
  ```bash
  mypy backend/src
  flake8 backend/src
  ```
- [ ] **Dependencies**: Requirements.txt up to date and tested
- [ ] **Version Tag**: Repository tagged with version number

## Deployment Steps

### Method 1: Direct Python Deployment (Recommended)
- [ ] **Python Environment**: Create isolated Python environment
  ```bash
  docker build -t personal-assistant:latest .
  ```
- [ ] **Environment File**: Production .env file prepared
- [ ] **Docker Compose**: Configuration file ready
  ```yaml
  version: '3.8'
  services:
    assistant:
      image: personal-assistant:latest
      ports:
        - "8765:8765"
      environment:
        - OPENAI_API_KEY=${OPENAI_API_KEY}
      restart: unless-stopped
  ```
- [ ] **Deploy**: Start containers
  ```bash
  docker-compose up -d
  ```

### Method 2: Direct Server Deployment
- [ ] **Server Access**: SSH access to target server
- [ ] **Code Deployment**: Copy code to server
  ```bash
  scp -r . user@server:/path/to/app
  ```
- [ ] **Virtual Environment**: Set up production venv
  ```bash
  python -m venv /path/to/venv
  source /path/to/venv/bin/activate
  pip install -r requirements.txt
  ```
- [ ] **Process Manager**: Configure systemd or supervisor
  ```ini
  # /etc/systemd/system/personal-assistant.service
  [Unit]
  Description=Personal Assistant Backend
  After=network.target

  [Service]
  User=assistant
  WorkingDirectory=/path/to/app
  ExecStart=/path/to/venv/bin/uvicorn backend.src.main:app --host 0.0.0.0 --port 8765 --workers 4
  Restart=always

  [Install]
  WantedBy=multi-user.target
  ```

### Method 3: Cloud Platform Deployment
- [ ] **Platform Selection**: Choose platform (Heroku/Railway/Fly.io/Vercel)
- [ ] **Build Configuration**: Platform-specific config files
- [ ] **Environment Variables**: Set in platform dashboard
- [ ] **Resource Allocation**: Configure CPU/memory limits
- [ ] **Domain/SSL**: Configure custom domain and SSL

## Post-Deployment Verification

### Basic Connectivity
- [ ] **Health Check**: Application responds to requests
  ```bash
  curl http://your-server:8765/health
  ```
- [ ] **WebSocket Connection**: Can establish WebSocket connection
- [ ] **CORS Headers**: Correct CORS configuration
- [ ] **SSL Certificate**: Valid certificate (if HTTPS)

### API Functionality
- [ ] **Handshake**: WebSocket handshake works
  ```javascript
  const ws = new WebSocket('ws://your-server:8765/ws');
  ws.send(JSON.stringify({type: 'handshake', user_id: 'test'}));
  ```
- [ ] **Ping/Pong**: Ping messages respond correctly
- [ ] **Settings Load**: Can load application settings
- [ ] **Model List**: Can retrieve available models

### LLM Integration
- [ ] **API Key Validity**: LLM provider accepts API key
- [ ] **Model Selection**: Configured model is available
- [ ] **Basic Query**: Simple text query works end-to-end
- [ ] **Streaming**: Response streaming functions properly

### Tool System
- [ ] **Tool Discovery**: Tools are discovered and loaded
- [ ] **Tool Execution**: At least one tool executes successfully
- [ ] **Tool Schema**: Tool schemas are generated correctly
- [ ] **Error Handling**: Tool errors are handled gracefully

### Database/Storage
- [ ] **Connection**: Database connection established
- [ ] **Migrations**: Database schema is current
- [ ] **Memory Storage**: Conversation memory persists
- [ ] **Embeddings**: Vector storage operational

### Performance Validation
- [ ] **Response Time**: Initial queries respond within 5 seconds
- [ ] **Memory Usage**: Stable memory usage under normal load
- [ ] **Concurrent Connections**: Handles multiple simultaneous connections
- [ ] **Resource Limits**: Stays within allocated resources

### Monitoring Setup
- [ ] **Logging**: Application logs are accessible
- [ ] **Metrics**: Basic metrics collection configured
- [ ] **Alerts**: Critical error alerts set up
- [ ] **Health Checks**: Automated health monitoring

## Rollback Plan

### Preparation
- [ ] **Backup**: Database backup created before deployment
- [ ] **Previous Version**: Previous working version identified
- [ ] **Rollback Script**: Automated rollback procedure documented
- [ ] **Communication**: Stakeholders notified of deployment window

### Execution
- [ ] **Quick Rollback**: Can rollback within 5 minutes if critical issues
- [ ] **Graceful Shutdown**: Existing connections handled properly
- [ ] **Data Integrity**: No data loss during rollback
- [ ] **User Communication**: Users notified of any downtime

## Security Verification

### Access Control
- [ ] **API Keys**: Sensitive keys not exposed in logs
- [ ] **Network Security**: Only required ports open
- [ ] **Authentication**: User authentication working (if implemented)
- [ ] **Authorization**: Permission checks functioning

### Data Protection
- [ ] **Encryption**: Data encrypted in transit and at rest
- [ ] **Secrets Management**: API keys stored securely
- [ ] **Input Validation**: All inputs properly validated
- [ ] **Error Messages**: No sensitive information in error responses

## Documentation Update

### Post-Deployment
- [ ] **Runbook**: Update operational runbook with new deployment
- [ ] **Monitoring Docs**: Document new monitoring alerts
- [ ] **Incident Response**: Update incident response procedures
- [ ] **Change Log**: Record deployment in change log

### Communication
- [ ] **Team Notification**: Development team notified of successful deployment
- [ ] **Stakeholder Update**: Product owners informed of new features
- [ ] **User Communication**: End users notified of new capabilities (if applicable)

## Performance Monitoring

### Initial Monitoring
- [ ] **Baseline Metrics**: Establish performance baseline
- [ ] **Error Rates**: Monitor for increased error rates
- [ ] **Response Times**: Track response time trends
- [ ] **Resource Usage**: Monitor CPU, memory, and disk usage

### Ongoing Monitoring
- [ ] **Automated Alerts**: Set up alerts for critical metrics
- [ ] **Log Analysis**: Configure log aggregation and analysis
- [ ] **Performance Tests**: Schedule regular performance tests
- [ ] **Capacity Planning**: Monitor usage patterns for scaling needs

## Emergency Contacts

- **Technical Lead**: [Name] - [Contact]
- **DevOps/SRE**: [Name] - [Contact]
- **Security Team**: [Name] - [Contact]
- **Business Owner**: [Name] - [Contact]

## Deployment Sign-off

- [ ] **Deployed By**: ____________________ Date: __________
- [ ] **Verified By**: ____________________ Date: __________
- [ ] **Approved By**: ____________________ Date: __________

---

## Quick Reference Commands

### Health Checks
```bash
# Basic health check
curl http://localhost:8765/health

# WebSocket test
node test_websocket.js

# Load test
ab -n 100 -c 10 http://localhost:8765/health
```

### Monitoring
```bash
# View logs
docker logs personal-assistant

# Check resource usage
docker stats personal-assistant

# Check running processes
ps aux | grep uvicorn
```

### Troubleshooting
```bash
# Restart service
docker-compose restart assistant

# View detailed logs
docker logs -f personal-assistant

# Check database
sqlite3 ~/.config/DesktopAssistant/assistant.db "SELECT COUNT(*) FROM memories;"
```
