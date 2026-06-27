---
summary: "Web landing page guide for WindieOS standalone landing entrypoint, section composition, assets, style tokens, and product-claim boundaries."
read_when:
  - When changing the public WindieOS landing page, section ordering, anchor links, copy, styles, or product claims.
  - When deciding whether a frontend change belongs to the landing page or the Electron desktop renderer.
title: "Landing Page"
---

# Landing Page

The landing page is a standalone frontend surface under `frontend/src/landing`. It is not the Electron desktop dashboard and should not depend on Electron IPC, local runtime state, user credentials, or backend websocket sessions.

For section, anchor, CTA, styling, and product-claim changes, start with [Landing Page Change Workflow](landing_page_change_workflow.md).

## Code Owners

| Concern | Files |
| --- | --- |
| entry HTML | `frontend/landing.html` |
| React entry | `frontend/src/landing/main.jsx` |
| page composition | `frontend/src/landing/LandingPage.jsx` |
| sections | `frontend/src/landing/components/*` |
| icons | `frontend/src/landing/components/icons/*` |
| styles and tokens | `frontend/src/landing/styles/*` |
| docs hub | `docs/frontend/landing/README.md` |

## Section Contract

Current section families:

- hero
- how it works
- available today
- roadmap
- why
- privacy
- CTA footer
- shared section intro

Keep landing claims aligned with current product docs. If a capability is planned, make that visible in copy instead of presenting it as implemented.

## Routing Rules

- Marketing/product web changes belong in `frontend/src/landing`.
- Desktop dashboard/chat changes belong in `frontend/src/renderer`.
- Hosted API integration docs belong in `docs/web` or `docs/sdk`, not landing copy.
- If landing copy mentions a runtime capability, link or update the matching product/runtime docs in the same change.

## Validation

For landing changes:

```bash
cd frontend
npm run build
npm run lint
```

For content-only docs updates, run:

```bash
<windie> docs list
```

## Related Docs

- [Frontend Landing Docs Hub](../frontend/landing/README.md)
- [Landing Page Change Workflow](landing_page_change_workflow.md)
- [Product Overview](../getting-started/product_overview.md)
- [Web Surface Matrix](web_surface_matrix.md)
- [Web Surfaces Hub](README.md)
