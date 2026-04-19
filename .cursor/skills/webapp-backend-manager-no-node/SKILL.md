---
name: webapp-backend-manager-no-node
description: Manages programming and backend implementation for this web-app without Node.js. Use for most coding tasks in this repository, especially API design, server logic, data contracts, and performance/reliability improvements.
---

# Web-App Backend Manager (No Node.js)

## Purpose

Own programming and backend decisions for this project while enforcing a strict no-Node.js constraint.

## Non-Negotiables

- Do not use Node.js, npm, yarn, pnpm, or Node-based backend frameworks.
- Do not introduce bundlers or build tooling that depends on Node.js.
- Keep solutions simple, explicit, and easy to run locally.
- Preserve existing project architecture unless the request requires a structural change.

## When to Apply

Apply this skill for most coding tasks in this repository, especially when requests involve:
- implementing features or refactors with backend implications
- API endpoint design and request/response contracts
- performance, reliability, and scalability improvements
- data flow between frontend and backend

## Runtime Selection Rule

1. Detect whether a backend runtime already exists in the repo.
2. If one exists, continue using it.
3. If none exists, propose a non-Node default (prefer Python FastAPI) and proceed with user-approved implementation direction.
4. Keep frontend integration contracts stable and documented.

## Workflow

1. Define the contract first
   - List required endpoints, payloads, status codes, and error shapes.
   - Keep response models consistent and predictable.

2. Implement backend behavior
   - Build focused handlers/services for each capability.
   - Validate inputs early and return explicit errors.
   - Keep business logic separate from transport wiring.

3. Optimize for reliability and performance
   - Avoid repeated expensive operations in hot paths.
   - Add pagination/filtering for list endpoints when needed.
   - Make slow operations observable (timing/logging hooks as appropriate).

4. Integrate with frontend safely
   - Match payload fields used by UI/game scenes.
   - Keep names and types stable across request/response cycles.
   - Add graceful fallback behavior for backend errors.

5. Verify before completion
   - Confirm happy path plus at least one failure path per endpoint.
   - Check for regressions in existing gameplay/UI flows.
   - Validate that no Node.js dependency was introduced.

## API Design Defaults

- Use resource-oriented endpoint naming.
- Prefer explicit versioning for externally consumed endpoints.
- Return machine-readable error bodies (`code`, `message`, optional `details`).
- Use idempotent semantics where appropriate.

## Performance Defaults

- Prioritize algorithmic improvements before micro-optimizations.
- Reduce redundant parsing/serialization across layers.
- Cache only when read patterns justify it and invalidation is clear.
- Measure impact with simple before/after timings when feasible.

## Output Expectations

When completing work with this skill:
1. State backend/API changes and why they were made.
2. Call out performance/reliability impact.
3. Provide quick verification steps.
4. Confirm no Node.js tooling or dependency was added.
