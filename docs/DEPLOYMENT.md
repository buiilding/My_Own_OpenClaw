# Deployment Guide (Planned)

## Environments

- **Local**: single-user developer mode
- **Staging**: pre-prod validation
- **Production**: multi-tenant hosted platform

## Hosted Architecture Summary

- API Gateway
- Auth Service
- Agent Workers
- Tool Dispatch Queue
- Postgres + Redis
- Vector DB + Object Storage

## Required Services (Suggested)

- **Postgres**: users, plans, usage, metadata
- **Redis**: sessions, rate limits, queues
- **Object Storage**: screenshots, logs, and artifacts
- **Vector Store**: per-tenant embeddings
- **Observability**: metrics + logs + tracing

## Secrets & Configuration

- Use managed secrets (Vault, AWS/GCP secrets manager).
- Separate secrets per environment.
- Rotate API keys regularly.

## Deployment Checklist

- Infrastructure provisioning (IaC)
- Secrets management
- TLS certificates
- Observability stack (logs, metrics, tracing)
- Backup and restore plans
- Health checks + readiness probes
- Rollback strategy for releases

## Scaling Strategy

- Horizontal API scaling
- Worker pool scaling
- Queue-based workloads
- Partitioned vector indexes

## Rollout Strategy

- Canary release for backend workers
- Feature flags for hosted UX
- Staged rollout by plan tier

## Disaster Recovery

- Database backups
- RTO/RPO targets
- Failover procedures

## Monitoring Targets

- API latency (p50/p95/p99)
- Error rates by endpoint
- Tool execution failures
- Usage meter accuracy
