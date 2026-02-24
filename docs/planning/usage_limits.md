---
summary: "Usage Limits (Planned)"
read_when:
  - When changing quotas or limits.
---

# Usage Limits (Planned)

## Rate Limiting

- **RPS** and burst limits by plan.
- Enforced at gateway + backend.
- Redis-based token bucket or leaky bucket.

## Quotas

- Monthly token budget
- Monthly tool-call budget
- Monthly screenshot budget

## Enforcement

- Soft warning at 80–90% usage.
- Hard blocking when quota exceeded.
- `limit-reached` message with upgrade URL.

## Client UX

- Usage meter
- Plan upgrade CTA
- “Reset date” indicator
