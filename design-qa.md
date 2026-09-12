# Design QA

## Evidence

- Source visual truth: current user-message attachment (NFT dashboard reference; 1446 × 1064 px; the client did not expose a filesystem path).
- Rendered implementation: `design-qa-evidence/implementation-cua.jpg`.
- Local URL: `http://127.0.0.1:3107/`.
- Viewport and density: implementation captured at 1390 × 768 px by the Chrome CUA surface; app content is approximately 1390 × 683 CSS px. The source density is unknown and treated as 1×.
- State: source is a populated dashboard; implementation is the existing Xiaohongshu workbench in a populated cover-selection state. Content and layout were intentionally not normalized because the brief requires preserving the product structure and data; comparison is limited to the requested visual language.
- Comparison input: the user attachment and the browser-rendered implementation were both open in the same multimodal review context.

## Findings

- No actionable P0, P1, or P2 visual-language differences remain.
- Expected difference: the reference has NFT navigation, charts, and a chat rail, while the implementation keeps the existing four-step content workflow. This is required by the brief, not design drift.
- P3: the browser evidence contains Chrome UI, a development badge, and a translation-extension bubble. These are browser-only overlays and are not part of the page.
- Existing data issue: one stored cover-generation state displays an external `403 Request not allowed` inside generated preview iframes. The app shell, asset route, build, and style layer remain healthy; this error predates and is outside the CSS-only change.

## Required Fidelity Surfaces

- Fonts and typography: modern system sans stack (Inter / SF Pro / PingFang SC), dark ink title color, readable blue-gray body text, and no gradient text. Supporting text uses `#607085`, which is about 5.06:1 on white.
- Spacing and layout rhythm: internal structure and spacing are unchanged. A 34 px rounded outer shell, responsive peripheral gutter, 24 px panel radius, 20 px card radius, and 14 px controls reproduce the reference hierarchy without altering information architecture.
- Colors and tokens: large-scale blue, cyan, lilac, and blush color is concentrated in the background asset. Shell, panels, and cards use a 0.40 / 0.58 / 0.86 cold-white opacity ladder. Accent `#526ea9` is about 5.05:1 on white; focus `#667fc2` exceeds 3:1 for non-text focus indication.
- Image quality and assets: the decorative background is a project-local 1672 × 941 PNG generated for this direction. No CSS shape, emoji, or ad-hoc SVG substitutes the source's pearlescent artwork. Existing template imagery remains unchanged.
- Copy and content: page copy, task data, workflow labels, template content, and functionality are unchanged.

## Full-view and Focused Comparison

- Full view: both source and implementation show a high-key icy-blue stage, continuous low-contrast pastel ribbons at the perimeter, a luminous white rounded frame, near-white interior panels, and very shallow cool shadows.
- Focused surfaces: outer frame, workflow navigation, active task, controls, form cards, and preview stage were reviewed at the captured resolution. Separate crops were unnecessary because those surfaces remain legible in both full-resolution inputs.
- Material balance: color is now carried by the continuous background; content surfaces remain calm and mostly white. The previous scattered mint, cream, pink, and purple section fills are removed.

## Comparison History

1. First pass found three blocking fidelity issues: scattered per-section color, insufficient visibility of the continuous backdrop, and low-contrast tertiary text.
2. Fixes: unified first-level panels and cards to cold white; replaced layered CSS backdrops with the local pearlescent image; added the luminous outer frame and responsive gutter; unified active states to one blue accent; darkened tertiary text; removed the breakpoint gutter jump; raised muted-card opacity; added explicit light toast text.
3. Post-fix evidence: `design-qa-evidence/implementation-cua.jpg`. No actionable P0/P1/P2 differences remain within the visual-only scope.

## Primary Checks

- Browser load and asset routes return HTTP 200.
- Source and cover workflow states, task selection, template preview, and independent scrolling regions rendered in Chrome.
- The 1024 px desktop breakpoint was visually checked without body-level double scrolling or hidden persistent controls.
- No Next.js runtime error overlay appeared. Direct console streaming is not exposed by the CUA browser surface; production build, TypeScript, and 359 automated tests pass.

## Follow-up Polish

- Optional P3: tune peripheral ribbon intensity after user feedback on a calibrated display.

final result: passed
