# Database Schema (Planned)

This is a draft schema for the hosted, multi-tenant backend.

## Core Tables

### users
- id (uuid)
- email
- password_hash
- created_at
- status (active/suspended)

### tenants
- id (uuid)
- name
- created_at

### memberships
- user_id
- tenant_id
- role (owner/admin/member)

### subscriptions
- id
- tenant_id
- plan_id
- status (active/trial/canceled/past_due)
- current_period_start
- current_period_end

### usage_events
- id
- tenant_id
- user_id
- event_type (tokens/tool_call/screenshot/compute)
- quantity
- metadata (json)
- created_at

### entitlements
- tenant_id
- payload (json)
- updated_at

## Notes

- All queries must be tenant-scoped.
- Consider partitioning usage_events by month.
- Use a strict migration system.
