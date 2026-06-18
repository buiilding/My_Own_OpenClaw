---
summary: "Deep reference for landing Hero/How/Available/Roadmap sections: static content source arrays, anchor/CTA targets, and status-label semantics used in the public product narrative."
read_when:
  - When updating landing marketing claims in Hero, How-It-Works, Available-Today, or Roadmap sections.
  - When changing CTA anchors (`#how-it-works`, `#available-today`, `#roadmap`, `#download`) and validating in-page nav behavior.
title: "Hero, How, Available, and Roadmap Section Content Contract Reference"
---

# Hero, How, Available, and Roadmap Section Content Contract Reference

## Canonical Modules

- `frontend/src/landing/LandingPage.jsx`
- `frontend/src/landing/components/HeroSection.jsx`
- `frontend/src/landing/components/HowItWorksSection.jsx`
- `frontend/src/landing/components/AvailableTodaySection.jsx`
- `frontend/src/landing/components/RoadmapSection.jsx`

## Section Composition Contract

`LandingPage` renders sections in fixed order:

1. `HeroSection`
2. `WhySection`
3. `HowItWorksSection`
4. `AvailableTodaySection`
5. `PrivacySection`
6. `RoadmapSection`
7. `CTAFooter`

The four documented modules form the main narrative spine between hero claim, workflow explanation, present-day capability matrix, and future roadmap.

## Hero Contract (`HeroSection`)

Primary responsibilities:

- show launch-state badge (`Now Available`)
- present top-level one-line positioning (`Desktop runtime for personal AI agents`)
- provide two top CTA anchors:
  - `Get Started` -> `#download`
  - `See How It Works` -> `#how-it-works`
- render three short feature chips (`Desktop-Native`, `Local Memory`, `Privacy First`)

Animation/styling contract:

- uses stagger classes (`stagger-1..5`) and `animate-fade-in-up`
- relies on `.hero-glow-*` background layers in landing CSS

## How-It-Works Contract (`HowItWorksSection`)

Section id:

- `id="how-it-works"`

Content source:

- inline `steps` array (4 items)
- each item defines `number`, `title`, `description`, `code`

UI contract:

- each step maps to a `step-row` with text + code window
- code snippets are static explanation strings; they are illustrative, not executed

## Available-Today Contract (`AvailableTodaySection`)

Section id:

- `id="available-today"`

Content source:

- inline `features` category array (`Core`, `Tools`, `Memory`, `Browser`)
- each item has `name` and `status`

Current expectation:

- all listed items are marked `status: 'available'`
- this section should track real shipped functionality; stale claims are user-facing trust risk

CTA contract:

- bottom primary CTA links to `#download`
- includes copyable clone command snippet in `cta-code` block

## Roadmap Contract (`RoadmapSection`)

Section id:

- `id="roadmap"`

Content source:

- inline `phases` array with fields:
  - `status` (`available` or `planned`)
  - `phase`
  - `title`
  - `description`
  - `items[]`

Rendering semantics:

- `status` controls badge label text and icon style for checklist rows
- planned phases use outline-circle glyph; available phase uses checkmark glyph

## Anchor Integrity Matrix

Anchors produced in these modules:

- `#how-it-works`
- `#available-today`
- `#roadmap`
- `#download`

Any section id or CTA href change requires parity check across hero/footer/available link emitters.

## Drift Hotspots

1. Capability list changes in `AvailableTodaySection` can drift from actual backend and web/desktop frontend functionality if not updated with releases.
2. Roadmap phase status flags (`available/planned`) can become stale and misrepresent product maturity.
3. Changing anchor IDs in section roots without CTA updates breaks smooth-scroll navigation and external deep links.

## Related Pages

- [Frontend Landing Sections Docs Hub](README.md)
- [Landing Page Runtime and Content Reference](../landing_page_runtime_and_content_reference.md)
