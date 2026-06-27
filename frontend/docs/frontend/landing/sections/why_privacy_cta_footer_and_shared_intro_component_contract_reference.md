---
summary: "Deep reference for landing Why/Privacy/CTA footer modules: static feature arrays, shared SectionIntro composition contract, ProviderStackIcon reuse surface, and footer link/anchor semantics."
read_when:
  - When editing `WhySection`, `PrivacySection`, `CTAFooter`, or `SectionIntro` content and layout behavior.
  - When changing footer/legal/resource links, privacy claims, or provider-icon usage shared across landing sections.
title: "Why, Privacy, CTA Footer, and Shared Intro Component Contract Reference"
---

# Why, Privacy, CTA Footer, and Shared Intro Component Contract Reference

## Canonical Modules

- `frontend/src/landing/components/WhySection.jsx`
- `frontend/src/landing/components/PrivacySection.jsx`
- `frontend/src/landing/components/CTAFooter.jsx`
- `frontend/src/landing/components/SectionIntro.jsx`
- `frontend/src/landing/components/icons/ProviderStackIcon.jsx`
- `frontend/src/landing/styles/LandingPage.css`

## Shared Section Intro Contract (`SectionIntro`)

`SectionIntro` is the reusable heading shell used by landing sections.

Required content props:

- `badge`
- `headingPrefix`
- `headingGradient`
- `description`

Optional style hooks:

- `wrapperClassName`
- `headingClassName` (default `heading-2 mb-4`)
- `descriptionClassName` (default `text-large text-secondary`)

Render behavior:

- when `wrapperClassName` is absent, component returns intro fragment directly
- when provided, wraps intro fragment in `<div className={wrapperClassName}>...`

## Why Section Contract (`WhySection`)

Section id:

- `id="why-windieos"`

Content source:

- inline `features` array (currently 6 cards)
- each card has `icon`, `title`, `description`

Notable card claims:

- desktop session as runtime
- vision-first interaction
- local runtime tool execution
- persistent memory
- browser automation
- multi-provider model support

Animation contract:

- each `feature-card` row sets inline `animationDelay` (`index * 0.1s`)

## Privacy Section Contract (`PrivacySection`)

Section id:

- `id="privacy"`

Content sources:

- `privacyFeatures` array (detailed cards)
- `privacyHighlights` array (compact left-column highlights)

Layout contract:

- two-column grid (`privacy-content` + `privacy-features`)
- left column uses `SectionIntro` with larger body text variant

Claim semantics:

- local-first storage
- encrypted memory wording
- minimal data transmission
- open-source verifiability
- provider choice
- session control

## Provider Icon Reuse Contract (`ProviderStackIcon`)

`ProviderStackIcon` is a local SVG component shared across sections:

- `WhySection` provider capability card
- `PrivacySection` provider-choice card and highlight
- `CTAFooter` metadata row

Props:

- `size` (default `24`)
- `strokeWidth` (default `2`)

Contract effect:

- icon updates affect multiple landing sections simultaneously

## CTA + Footer Contract (`CTAFooter`)

Section id:

- CTA section uses `id="download"` for anchor-targeted install links

Primary CTA actions:

- GitHub link (`https://github.com/buiilding/WindieOS`)
- documentation link (`https://github.com/buiilding/WindieOS/blob/main/docs/README.md`)

Meta row:

- `Open Source`
- `Privacy First`
- `MIT License` (with `ProviderStackIcon`)

Footer link groups:

- `Product` links to in-page anchors (`#why-windieos`, `#how-it-works`, `#available-today`, `#roadmap`)
- `Resources` links to GitHub, documentation, installation, and changelog targets
- `Legal` links to the repository license and the in-page privacy section

Year contract:

- copyright year derives from `new Date().getFullYear()`

## Drift Hotspots

1. Changing section ids in Why/Privacy/Download without syncing anchor emitters breaks in-page navigation.
2. Landing capability/privacy claims are static arrays and can drift from actual backend and web/desktop frontend behavior if not updated with releases.
3. CTA/footer links should stay real targets; do not reintroduce placeholder `href="#"` entries.
4. Changes to `ProviderStackIcon` impact multiple sections and can unintentionally alter visual consistency.

## Related Pages

- [Frontend Landing Sections Docs Hub](README.md)
- [Landing Page Runtime and Content Reference](../landing_page_runtime_and_content_reference.md)
- [Hero, How, Available, and Roadmap Section Content Contract Reference](hero_how_available_and_roadmap_section_content_contract_reference.md)
