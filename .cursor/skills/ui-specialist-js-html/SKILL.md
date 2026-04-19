---
name: ui-specialist-js-html
description: Builds and refines web UI with semantic HTML, modern CSS, and vanilla JavaScript interaction patterns. Use when the user asks for UI or frontend interface work, component or page implementation, layout and styling changes, or DOM-driven behavior updates.
---

# UI Specialist for JS & HTML

## Purpose

Deliver production-ready UI implementation for web interfaces using HTML, CSS, and JavaScript, with strong defaults for accessibility, responsiveness, and maintainability.

## When to Apply

Apply this skill when requests include terms like:
- UI, frontend, interface, page, component
- layout, styling, responsive, mobile
- DOM behavior, interactions, form UX

## Implementation Workflow

Use this workflow in order:

1. Define constraints
   - Identify target screen sizes, browser assumptions, and interaction goals.
   - Confirm whether the change is new UI, a refactor, or a bug fix.

2. Build semantic structure first
   - Use semantic elements (`main`, `section`, `nav`, `button`, `form`, `label`).
   - Prefer clear hierarchy and keyboard-friendly controls.

3. Add styling with stable patterns
   - Use mobile-first CSS.
   - Prefer reusable classes and CSS custom properties for repeated values.
   - Avoid brittle selectors tied to document structure when simpler class hooks work.

4. Implement JavaScript behavior
   - Prefer `addEventListener` and `data-*` hooks over inline handlers.
   - Use event delegation for repeated/dynamic elements.
   - Keep logic small and focused by behavior (toggle, filter, submit, validate).

5. Validate and refine
   - Verify keyboard navigation and visible focus states.
   - Check responsive layout at small, medium, and large widths.
   - Confirm no console errors and that empty/loading/error states are handled.

## Standards

### HTML
- Always pair form fields with labels.
- Use buttons for actions and links for navigation.
- Provide alt text for meaningful images.

### CSS
- Prefer class-based styling over element-only selectors for scalable UI.
- Keep spacing and typography consistent via tokens or variables.
- Avoid hardcoded magic numbers unless clearly justified.

### JavaScript
- Query DOM once per element when practical; avoid repeated expensive lookups.
- Guard against missing elements before attaching behavior.
- Keep state explicit and easy to trace.

## Response Format

When completing a UI task, structure the response as:

1. What changed
2. Why this implementation
3. How to verify (manual test steps)
4. Optional next improvements

## Practical Patterns

### Toggle behavior

```js
const trigger = document.querySelector('[data-toggle-target]');
const target = document.querySelector('#panel');

if (trigger && target) {
  trigger.addEventListener('click', () => {
    const isOpen = target.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  });
}
```

### Event delegation

```js
const list = document.querySelector('[data-action-list]');

if (list) {
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    // Route to small handlers by action value
  });
}
```

## Do Not

- Do not use non-semantic containers when semantic elements fit.
- Do not rely only on color to communicate state.
- Do not bind behavior through inline `onclick` attributes.
- Do not ship UI changes without responsive and keyboard checks.
