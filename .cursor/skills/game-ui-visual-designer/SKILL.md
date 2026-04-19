---
name: game-ui-visual-designer
description: Designs and implements visuals for this game/web-app using only HTML, CSS, and vanilla JavaScript. Use when the user asks for UI design, visual polish, HUD/menu layout, animation, responsive styling, or DOM interactions. Do not use Node.js, npm packages, bundlers, or build tooling.
---

# Game UI Visual Designer

## Purpose

Own the visual direction and UI implementation for this project while keeping the stack simple: plain HTML, CSS, and JavaScript.

## Non-Negotiables

- Use only HTML, CSS, and vanilla JavaScript.
- Do not use Node.js, npm, package managers, bundlers, frameworks, or build pipelines.
- Prefer editing existing project files directly (`index.html`, CSS files, and JS modules).
- Keep solutions browser-native and easy to run by opening the project in a browser.

## When to Apply

Apply this skill when requests mention:
- visuals, UI, UX, layout, styling, design polish
- menus, HUD, overlays, character panels, boss screens, game feedback
- responsive behavior, accessibility, DOM interactions, transitions/animations

## Workflow

1. Identify the requested UI outcome
   - Define the target screen/state (menu, gameplay HUD, dialog, settings panel).
   - Confirm constraints: desktop/mobile behavior, readability, and interaction goals.

2. Structure first
   - Use semantic HTML elements and clear sectioning.
   - Add predictable class names and `data-*` hooks for behavior.

3. Style for game clarity
   - Build visual hierarchy first (primary actions, status info, alerts).
   - Use consistent spacing, typography, and color tokens.
   - Ensure strong contrast and readable text at common game resolutions.

4. Add behavior with vanilla JS
   - Use `addEventListener`, not inline handlers.
   - Keep UI logic modular and state-driven (open/close, active/inactive, selected).
   - Guard for missing elements before binding events.

5. Verify before finishing
   - Keyboard navigation and focus visibility work.
   - No console errors in normal flows.
   - Layout remains usable at small, medium, and large viewport widths.

## Implementation Defaults

### HTML
- Use meaningful landmarks (`header`, `main`, `section`, `nav`, `button`).
- Pair interactive controls with accessible labels/text.
- Keep UI components grouped by game function (combat info, controls, inventory, etc.).

### CSS
- Use class-based selectors and CSS custom properties for reusable design tokens.
- Prefer responsive, fluid sizing over fixed pixel-heavy layouts.
- Keep animation subtle and purposeful (feedback, emphasis, transitions).

### JavaScript
- Query once, reuse references where practical.
- Use event delegation for repeated UI items.
- Keep handlers small and move repeated logic into helper functions.

## Output Expectations

When completing a UI request with this skill:
1. Explain what visual/UI change was made.
2. Explain why it supports usability/game feel.
3. Provide quick manual verification steps.
4. Suggest one optional polish improvement.

## Avoid

- Node-based setup steps (`npm install`, `npm run`, bundlers, transpilers).
- Framework-specific patterns that require external tooling.
- Overly complex architecture for simple DOM/UI tasks.
