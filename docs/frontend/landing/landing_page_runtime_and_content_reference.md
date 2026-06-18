---
summary: "Frontend landing page technical reference: Vite HTML entrypoint wiring, section ordering and anchor contracts, static content sources, and CSS token/animation/runtime behavior."
read_when:
  - When editing landing-page sections, IDs, CTA links, or static feature/roadmap/privacy content.
  - When changing landing typography/colors/animations or troubleshooting landing-only rendering/layout differences.
title: "Landing Page Runtime and Content Reference"
---

# Landing Page Runtime and Content Reference

## Canonical Modules

- `frontend/landing.html`
- `frontend/src/landing/main.jsx`
- `frontend/src/landing/LandingPage.jsx`
- `frontend/src/landing/components/*.jsx`
- `frontend/src/landing/components/HeroSection.jsx`
- `frontend/src/landing/components/WhySection.jsx`
- `frontend/src/landing/components/HowItWorksSection.jsx`
- `frontend/src/landing/components/AvailableTodaySection.jsx`
- `frontend/src/landing/components/PrivacySection.jsx`
- `frontend/src/landing/components/RoadmapSection.jsx`
- `frontend/src/landing/components/CTAFooter.jsx`
- `frontend/src/landing/components/SectionIntro.jsx`
- `frontend/src/landing/components/icons/ProviderStackIcon.jsx`
- `frontend/src/landing/styles/LandingPage.css`
- `frontend/src/landing/styles/variables.css`
- `frontend/vite.config.js`

## Entrypoint and Build Wiring

1. `frontend/landing.html` mounts `<div id="root"></div>` and loads `/src/landing/main.jsx`.
2. `frontend/src/landing/main.jsx` creates React root under `StrictMode` and renders `LandingPage`.
3. `frontend/src/landing/LandingPage.jsx` defines page order by composing section components.
4. `frontend/vite.config.js` is shared for renderer + landing pages; no separate landing-specific config branch exists.

Practical implication:

- Root app entrypoint is `frontend/index.html` (`/src/renderer/app/main.jsx`).
- Landing page is a second HTML entry (`frontend/landing.html`), typically opened directly in dev/build output.

## Section Composition and Ordering Contract

`LandingPage` section order is fixed:

1. `HeroSection`
2. `WhySection`
3. `HowItWorksSection`
4. `AvailableTodaySection`
5. `PrivacySection`
6. `RoadmapSection`
7. `CTAFooter`

If order changes, anchored navigation + narrative flow should be reviewed together.

## Anchor ID and CTA Link Contract

Landing relies on in-page anchor links:

- `#how-it-works`
- `#available-today`
- `#privacy`
- `#roadmap`
- `#download`
- `#why-windieos`

Primary link sources:

- Hero CTA links (`Get Started`, `See How It Works`)
- Available section CTA (`View Installation Guide`)
- Footer column links (`Features`, `How It Works`, `Available Now`, `Roadmap`, `Privacy`)

If section `id` changes, update all anchor emitters in `HeroSection`, `AvailableTodaySection`, and `CTAFooter`.

## Static Content Sources by Section

Landing content is statically defined inside components (not fetched at runtime):

- `WhySection`: feature cards for desktop session as runtime, vision-first interaction, local runtime tool execution, memory, browser automation, provider choice.
- `HowItWorksSection`: 4-step flow array with `number`, `title`, `description`, `code`.
- `AvailableTodaySection`: category matrix (`Core`, `Tools`, `Memory`, `Browser`) with per-item status.
- `PrivacySection`: `privacyFeatures` + `privacyHighlights` arrays for trust claims.
- `RoadmapSection`: phase timeline array with `available|planned` state and checklist items.
- `CTAFooter`: CTA metadata row, footer link groups, and `new Date().getFullYear()` copyright text.

This means product capability changes require code edits in component arrays; there is no CMS/config document feed.

## Shared Component Contract

`SectionIntro` standardizes section top blocks:

- badge text
- split heading (`headingPrefix`, `headingGradient`)
- description text
- optional wrapper + style class hooks

Reuse this component when adding sections to keep heading/badge visual grammar consistent.

## Icon Contract

`ProviderStackIcon` is a local SVG component used in multiple sections:

- `WhySection`
- `PrivacySection`
- `CTAFooter`

Changing this icon affects provider branding in several locations simultaneously.

## Style System and Tokens

### Token source

- `frontend/src/landing/styles/variables.css` is canonical for colors, typography, spacing, radii, shadows, transitions, z-index, and container sizing.

### Runtime stylesheet

- `frontend/src/landing/styles/LandingPage.css` imports `variables.css` and provides:
  - reset/base styles
  - utility classes
  - section-level component classes
  - animation keyframes (`fadeInUp`, `fadeIn`, `pulse`, `float`, `gradientShift`)
  - responsive breakpoints (`1024px`, `768px`, `640px`)

### Notable behavior details

- `scroll-behavior: smooth` enables anchor scroll animation globally.
- `.landing-page::before` applies fixed atmospheric glow layers behind all sections.
- `HeroSection` uses staggered fade classes (`stagger-1..6`) + floating glow animations.
- `PrivacySection` uses sticky left column content on wide screens, disabled on narrow screens.
- CTA/footer links + cards are style-driven, no route-level navigation state.

## Link and Content Placeholders

Some CTA/footer links are placeholders (`href="#"`) in `CTAFooter`.

Examples:

- `Read Documentation`
- `Documentation`, `Installation`, `Changelog`
- `License`, `Terms`

When real endpoints are introduced, replace placeholders to avoid dead links.

## Drift and Integrity Checks

If landing copy or roadmap changes, verify:

1. anchors still resolve to existing IDs
2. capability claims match backend and web/desktop frontend implementation status
3. placeholder links are still intentional
4. section arrays preserve valid `key` stability (index-based map still safe for static order)

If landing layout breaks on mobile:

1. inspect breakpoints in `LandingPage.css` (`1024/768/640` blocks)
2. verify `.step-row` reorder and `.cta-actions` stacking behavior
3. check footer columns collapse rules

## Related Pages

- [Frontend Landing Docs Hub](README.md)
- [Frontend Landing Sections Docs Hub](sections/README.md)
- [Hero, How, Available, and Roadmap Section Content Contract Reference](sections/hero_how_available_and_roadmap_section_content_contract_reference.md)
- [Why, Privacy, CTA Footer, and Shared Intro Component Contract Reference](sections/why_privacy_cta_footer_and_shared_intro_component_contract_reference.md)
