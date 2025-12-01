# Deployment and Operations Guide

This comprehensive guide covers deployment strategies, monitoring, logging, and operational procedures for the Personal Assistant Backend in production environments.

## Deployment Strategies

### Development Deployment

#### Local Development Server

```bash
# Quick development server with auto-reload
cd backend
uvicorn backend.src.main:app --host 0.0.0.0 --port 8765 --reload

# Or using the module approach
python -m backend.src.main

# With custom configuration
PYTHONPATH=/path/to/backend python -m backend.src.main --config /path/to/config.yaml
```

#### Development Docker Setup

```dockerfile
# Dockerfile.dev
FROM python:3.11-slim

WORKDIR /app

# Install development dependencies
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements.txt -r requirements-dev.txt

# Mount source code for development
COPY . .

EXPOSE 8765

# Development command with reload
CMD ["uvicorn", "backend.src.main:app", "--host", "0.0.0.0", "--port", "8765", "--reload", "--log-level", "debug"]
```

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  assistant:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "8765:8765"
    volumes:
      - .:/app
      - /app/__pycache__
    environment:
      - ENVIRONMENT=development
      - LOG_LEVEL=DEBUG
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped
```

### Production Deployment

#### Production Server Configuration

```bash
# Uvicorn with production settings
uvicorn backend.src.main:app \
    --host 0.0.0.0 \
    --port 8765 \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --log-level warning \
    --access-log \
    --proxy-headers \
    --forwarded-allow-ips "*"

# Gunicorn with uvicorn workers (alternative)
gunicorn backend.src.main:app \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8765 \
    --log-level warning \
    --access-logfile - \
    --error-logfile - \
    --capture-output
```

#### Production Docker Configuration

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash app
USER app

WORKDIR /app

# Install Python dependencies
COPY --chown=app:app requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Copy application code
COPY --chown=app:app . .

# Create data directories
RUN mkdir -p /app/data /app/logs

EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8765/health || exit 1

# Production command
CMD ["python", "-m", "backend.src.main"]
```

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  assistant:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8765:8765"
    environment:
      - ENVIRONMENT=production
      - LOG_LEVEL=WARNING
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DATABASE_URL=postgresql://user:pass@db:5432/assistant
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=assistant
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Cloud Deployment Options

#### AWS ECS/Fargate

```yaml
# ecs-task-definition.json
{
  "family": "personal-assistant",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "assistant",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/personal-assistant:latest",
      "portMappings": [
        {
          "containerPort": 8765,
          "hostPort": 8765,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "ENVIRONMENT", "value": "production"},
        {"name": "LOG_LEVEL", "value": "WARNING"}
      ],
      "secrets": [
        {"name": "OPENAI_API_KEY", "valueFrom": "/personal-assistant/openai-key"},
        {"name": "DATABASE_URL", "valueFrom": "/personal-assistant/database-url"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/personal-assistant",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Google Cloud Run

```yaml
# cloud-run-service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: personal-assistant
spec:
  template:
    spec:
      containers:
      - image: gcr.io/project-id/personal-assistant:latest
        ports:
        - containerPort: 8765
        env:
        - name: ENVIRONMENT
          value: "production"
        - name: LOG_LEVEL
          value: "WARNING"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: assistant-secrets
              key: openai-api-key
        resources:
          limits:
            cpu: 1000m
            memory: 2Gi
        startupProbe:
          httpGet:
            path: /health
            port: 8765
          initialDelaySeconds: 10
          periodSeconds: 10
```

#### Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: personal-assistant
spec:
  replicas: 3
  selector:
    matchLabels:
      app: personal-assistant
  template:
    metadata:
      labels:
        app: personal-assistant
    spec:
      containers:
      - name: assistant
        image: personal-assistant:latest
        ports:
        - containerPort: 8765
        env:
        - name: ENVIRONMENT
          value: "production"
        - name: LOG_LEVEL
          value: "WARNING"
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 1000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8765
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8765
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: config
          mountPath: /app/config
      volumes:
      - name: config
        configMap:
          name: assistant-config
---
apiVersion: v1
kind: Service
metadata:
  name: personal-assistant
spec:
  selector:
    app: personal-assistant
  ports:
    - port: 8765
      targetPort: 8765
  type: LoadBalancer
```

## Configuration Management

### Environment Variables

```bash
# Core Configuration
export ENVIRONMENT=production
export LOG_LEVEL=WARNING
export HOST=0.0.0.0
export PORT=8765

# Database
export DATABASE_URL=postgresql://user:pass@host:5432/assistant
export DATABASE_POOL_SIZE=10
export DATABASE_MAX_OVERFLOW=20

# Cache
export REDIS_URL=redis://redis:6379
export CACHE_TTL=3600

# LLM Providers
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=...

# Security
export SECRET_KEY=your-secret-key-here
export JWT_SECRET_KEY=your-jwt-secret
export ALLOWED_ORIGINS=https://yourdomain.com

# File Storage
export UPLOAD_DIR=/app/uploads
export MAX_FILE_SIZE_MB=100
export ALLOWED_FILE_TYPES=pdf,txt,md,png,jpg

# Monitoring
export METRICS_ENABLED=true
export METRICS_PORT=9090
export SENTRY_DSN=https://...
```

### Configuration Files

```yaml
# config/production.yaml
environment: production

server:
  host: 0.0.0.0
  port: 8765
  workers: 4
  log_level: WARNING

database:
  url: postgresql://user:pass@db:5432/assistant
  pool_size: 10
  max_overflow: 20
  echo: false

cache:
  redis_url: redis://redis:6379
  default_ttl: 3600

llm:
  default_provider: openai
  temperature: 0.7
  max_tokens: 4000
  timeout: 30

security:
  secret_key: ${SECRET_KEY}
  jwt_secret: ${JWT_SECRET_KEY}
  allowed_origins:
    - https://yourdomain.com
  rate_limit_requests: 100
  rate_limit_window: 60

files:
  upload_dir: /app/uploads
  max_file_size_mb: 100
  allowed_types: [pdf, txt, md, png, jpg]

monitoring:
  enabled: true
  metrics_port: 9090
  health_check_interval: 30
  sentry_dsn: ${SENTRY_DSN}
```

## Monitoring and Observability

### Application Metrics

```python
# backend/src/core/metrics.py
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry

class Metrics:
    def __init__(self):
        self.registry = CollectorRegistry()

        # Request metrics
        self.requests_total = Counter(
            'assistant_requests_total',
            'Total number of requests',
            ['method', 'endpoint', 'status'],
            registry=self.registry
        )

        self.request_duration = Histogram(
            'assistant_request_duration_seconds',
            'Request duration in seconds',
            ['method', 'endpoint'],
            registry=self.registry
        )

        # LLM metrics
        self.llm_requests_total = Counter(
            'assistant_llm_requests_total',
            'Total LLM API requests',
            ['provider', 'model'],
            registry=self.registry
        )

        self.llm_tokens_total = Counter(
            'assistant_llm_tokens_total',
            'Total tokens used',
            ['provider', 'model', 'type'],
            registry=self.registry
        )

        # Tool metrics
        self.tool_executions_total = Counter(
            'assistant_tool_executions_total',
            'Total tool executions',
            ['tool_name', 'success'],
            registry=self.registry
        )

        self.tool_execution_duration = Histogram(
            'assistant_tool_execution_duration_seconds',
            'Tool execution duration',
            registry=self.registry
        )

        # System metrics
        self.active_connections = Gauge(
            'assistant_active_connections',
            'Number of active WebSocket connections',
            registry=self.registry
        )

        self.memory_usage = Gauge(
            'assistant_memory_usage_bytes',
            'Memory usage in bytes',
            registry=self.registry
        )

# Global metrics instance
metrics = Metrics()
```

### Health Checks

```python
# backend/src/api/health.py
from fastapi import APIRouter, HTTPException
from backend.src.core.container import ApplicationContainer
import psutil
import time

router = APIRouter()

@router.get("/health")
async def health_check():
    """Basic health check."""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "1.0.0"
    }

@router.get("/ready")
async def readiness_check(container: ApplicationContainer):
    """Readiness check - verifies all dependencies."""
    checks = {}

    # Check database
    try:
        # Ping database
        checks["database"] = "ready"
    except Exception as e:
        checks["database"] = f"unready: {e}"

    # Check LLM providers
    try:
        llm_client = container.core.llm_client()
        # Quick LLM check (cached model list)
        checks["llm"] = "ready"
    except Exception as e:
        checks["llm"] = f"unready: {e}"

    # Check memory store
    try:
        memory_store = container.memory.memory_store()
        # Quick memory check
        checks["memory"] = "ready"
    except Exception as e:
        checks["memory"] = f"unready: {e}"

    # Overall status
    all_ready = all(status == "ready" for status in checks.values())

    if not all_ready:
        raise HTTPException(status_code=503, detail=checks)

    return {
        "status": "ready",
        "timestamp": time.time(),
        "checks": checks
    }

@router.get("/metrics")
async def metrics_endpoint():
    """Prometheus metrics endpoint."""
    from backend.src.core.metrics import metrics
    from prometheus_client import generate_latest

    return generate_latest(metrics.registry)
```

### Logging Configuration

```python
# backend/src/core/logging.py
import logging
import logging.config
from pythonjsonlogger import jsonlogger
import sys

def setup_logging(level: str = "INFO", format: str = "json"):
    """Configure application logging."""

    log_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "class": "pythonjsonlogger.jsonlogger.JsonFormatter",
                "format": "%(asctime)s %(name)s %(levelname)s %(message)s"
            },
            "console": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "console" if format == "console" else "json",
                "stream": sys.stdout
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": "/app/logs/assistant.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5,
                "formatter": "json"
            }
        },
        "root": {
            "level": level,
            "handlers": ["console", "file"]
        },
        "loggers": {
            "backend": {
                "level": level,
                "handlers": ["console", "file"],
                "propagate": False
            },
            "uvicorn": {
                "level": level,
                "handlers": ["console", "file"],
                "propagate": False
            }
        }
    }

    logging.config.dictConfig(log_config)

# Setup structured logging
setup_logging(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format=os.getenv("LOG_FORMAT", "json")
)
```

### Monitoring Dashboard

```yaml
# monitoring/grafana-dashboard.yaml
dashboard:
  title: Personal Assistant Backend
  panels:
    - title: Request Rate
      type: graph
      targets:
        - expr: rate(assistant_requests_total[5m])
          legend: Requests per second

    - title: Response Time
      type: graph
      targets:
        - expr: histogram_quantile(0.95, rate(assistant_request_duration_seconds_bucket[5m]))
          legend: 95th percentile

    - title: Active Connections
      type: singlestat
      targets:
        - expr: assistant_active_connections

    - title: Memory Usage
      type: graph
      targets:
        - expr: assistant_memory_usage_bytes / 1024 / 1024
          legend: Memory (MB)

    - title: LLM Token Usage
      type: graph
      targets:
        - expr: rate(assistant_llm_tokens_total[1h])
          legend: Tokens per hour

    - title: Tool Execution Success Rate
      type: graph
      targets:
        - expr: rate(assistant_tool_executions_total{success="true"}[5m]) / rate(assistant_tool_executions_total[5m])
          legend: Success rate
```

## Operational Procedures

### Startup and Shutdown

#### Graceful Startup

```python
# backend/src/main.py
import asyncio
import signal
import logging
from backend.src.core.container import ApplicationContainer

logger = logging.getLogger(__name__)

async def main():
    """Main application entry point."""
    container = ApplicationContainer()

    # Setup signal handlers for graceful shutdown
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating graceful shutdown")
        asyncio.create_task(shutdown(container))

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        logger.info("Starting Personal Assistant Backend")

        # Initialize components
        await container.initialize()

        logger.info("All components initialized, starting server")

        # Start the server
        from backend.src.api.routes.websocket import start_server
        server = await start_server(
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", 8765))
        )

        # Wait for shutdown signal
        await asyncio.Future()  # Run forever

    except Exception as e:
        logger.error(f"Application startup failed: {e}", exc_info=True)
        await shutdown(container)
        raise
    finally:
        await shutdown(container)

async def shutdown(container: ApplicationContainer):
    """Graceful shutdown procedure."""
    logger.info("Starting graceful shutdown")

    try:
        # Shutdown in reverse order of initialization
        await container.shutdown()
        logger.info("Graceful shutdown completed")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}", exc_info=True)
        raise
```

#### Graceful Shutdown Sequence

1. **Stop accepting new connections**
2. **Complete in-flight requests** (with timeout)
3. **Shutdown WebSocket connections**
4. **Close database connections**
5. **Flush metrics and logs**
6. **Clean up temporary resources**

### Backup and Recovery

#### Database Backup

```bash
# PostgreSQL backup
pg_dump -h localhost -U user -d assistant > backup_$(date +%Y%m%d_%H%M%S).sql

# SQLite backup (if using SQLite)
sqlite3 assistant.db ".backup 'backup_$(date +%Y%m%d_%H%M%S).db'"

# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/assistant"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h db -U user -d assistant > $BACKUP_DIR/db_$DATE.sql

# Configuration backup
cp /app/config/production.yaml $BACKUP_DIR/config_$DATE.yaml

# Compress
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz -C $BACKUP_DIR db_$DATE.sql config_$DATE.yaml

# Cleanup old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete
```

#### File System Backup

```bash
# Backup uploaded files and data
rsync -av --delete /app/uploads/ /backups/uploads/
rsync -av --delete /app/data/ /backups/data/

# Backup logs (compressed)
logrotate -f /etc/logrotate.d/assistant
```

#### Recovery Procedures

```bash
# Database recovery
psql -h localhost -U user -d assistant < backup.sql

# File system recovery
rsync -av /backups/uploads/ /app/uploads/
rsync -av /backups/data/ /app/data/

# Configuration recovery
cp /backups/config_backup.yaml /app/config/production.yaml
```

### Scaling and Performance

#### Horizontal Scaling

```yaml
# Kubernetes HPA for auto-scaling
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: assistant-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: personal-assistant
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### Database Scaling

```yaml
# Read replica configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: assistant-read-replica
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: assistant
        env:
        - name: DATABASE_URL
          value: postgresql://user:pass@read-replica-db:5432/assistant
        - name: READ_ONLY_MODE
          value: "true"
```

#### Caching Strategy

```python
# Multi-level caching configuration
cache_config = {
    "redis_url": os.getenv("REDIS_URL"),
    "default_ttl": 3600,  # 1 hour
    "max_memory": "512mb",
    "strategy": "LRU"
}

# Cache layers:
# 1. Application cache (frequently accessed data)
# 2. LLM response cache (expensive API calls)
# 3. Tool result cache (deterministic operations)
# 4. Session cache (user session data)
```

### Security Operations

#### Log Analysis

```bash
# Monitor for suspicious activity
tail -f /app/logs/assistant.log | jq 'select(.level == "WARNING" or .level == "ERROR")'

# Failed authentication attempts
grep "authentication failed" /app/logs/assistant.log

# Rate limit violations
grep "rate limit exceeded" /app/logs/assistant.log

# Security audit events
grep "security" /app/logs/assistant.log | jq .
```

#### Incident Response

```bash
# Emergency shutdown
docker-compose down

# Isolate affected components
kubectl scale deployment assistant --replicas=0

# Backup evidence
cp /app/logs/assistant.log /evidence/incident_$(date +%Y%m%d_%H%M%S).log

# Restore from backup
docker-compose up -d db
# Wait for database
docker-compose up -d assistant
```

#### Security Updates

```bash
# Update base image
docker build --no-cache -t personal-assistant:new .

# Rolling update
kubectl set image deployment/assistant assistant=personal-assistant:new
kubectl rollout status deployment/assistant

# Verify deployment
curl -f http://localhost:8765/health
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Log Rotation

```bash
# logrotate configuration: /etc/logrotate.d/assistant
/app/logs/assistant.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    create 644 app app
    postrotate
        docker-compose exec assistant kill -HUP 1
    endscript
}
```

#### Database Maintenance

```sql
-- Vacuum and analyze (PostgreSQL)
VACUUM ANALYZE memories;
VACUUM ANALYZE conversations;

-- Reindex if needed
REINDEX TABLE memories;
REINDEX TABLE conversations;

-- Monitor table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Cache Maintenance

```python
# Cache statistics and cleanup
async def cache_maintenance():
    """Periodic cache maintenance."""
    # Get cache statistics
    stats = await redis_client.info('memory')

    # Clean up expired keys
    await redis_client.expire('pattern:*', 3600)

    # Monitor cache hit rates
    hits = await redis_client.get('cache:hits')
    misses = await redis_client.get('cache:misses')

    if hits and misses:
        hit_rate = int(hits) / (int(hits) + int(misses))
        logger.info(f"Cache hit rate: {hit_rate:.2%}")
```

### Performance Monitoring

#### Key Metrics to Monitor

- **Response Time**: P95 response time < 2 seconds
- **Error Rate**: < 1% of requests
- **Throughput**: Requests per second capacity
- **Memory Usage**: < 80% of allocated memory
- **CPU Usage**: < 70% average utilization
- **Database Connections**: Monitor pool utilization
- **Cache Hit Rate**: > 85% for frequently accessed data

#### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: assistant_alerts
    rules:
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(assistant_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High response time detected

      - alert: HighErrorRate
        expr: rate(assistant_requests_total{status=~"5.."}[5m]) / rate(assistant_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected

      - alert: MemoryUsageHigh
        expr: assistant_memory_usage_bytes / 1024 / 1024 / 1024 > 1.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High memory usage
```

This comprehensive deployment and operations guide provides the foundation for running the Personal Assistant Backend reliably in production environments.
