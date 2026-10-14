# Engineering Roadmap

This project is not only a React application. It is a long-term engineering sandbox for building a product-minded frontend/full-stack skillset through one real domain: a discounted food marketplace with buyer, cafe, and admin workflows.

The goal is to grow beyond "React developer who assembles screens" into an engineer who understands state, data, backend contracts, business processes, automation, quality, and security.

## Learning Direction

We will expand the work in four directions:

- Down: API, backend contracts, data modeling, SQL, PostgreSQL, Supabase, RLS.
- Sideways: workflow automation, admin/internal tools, moderation operations, Retool/n8n-style thinking.
- Up: business process, analytics, domain modeling, operational rules, product decisions.
- Around: testing, regressions, AI-assisted QA, performance, observability, security review.

The preferred learning mode is:

```text
runtime mechanism -> small code step -> verification -> explanation -> commit
```

For every important concept, we should understand the execution chain:

```text
event -> handler -> state/API -> validation -> response -> store update -> rerender -> UI/business result
```

## Stage 1: Frontend Foundation

Status: in progress.

Product goals:

- Application shell.
- Routing.
- Auth state.
- Protected routes.
- Public and private screens.
- Buyer/cafe/admin role model.
- Cafe moderation status model.

Engineering skills:

- React runtime model.
- JSX as React element objects.
- React Router.
- Zustand state management.
- Selectors and subscriptions.
- Closures in event handlers.
- Local state vs global state.
- Guard components.
- Git branches and commits.
- Prettier and basic project hygiene.

Key concepts:

```text
create(...) -> Zustand creates state once
useAuthStore(selector) -> component reads one state slice
set(...) -> store update
React rerender -> UI follows state
```

## Stage 2: Auth And Access Architecture

Product goals:

- Splash/session check flow.
- Auth welcome screen.
- Login/register flow.
- OAuth first-login role selection.
- Buyer route access.
- Cafe pending/approved/rejected access.
- Admin-only route model.

Engineering skills:

- Auth flow design.
- Role-based access control.
- Frontend guards vs real backend security.
- Session lifecycle.
- Loading/error states.
- Redirect logic.
- Secure token handling principles.

Security rules:

- Do not store passwords in global state.
- Do not manually center frontend logic around raw tokens.
- Frontend route guards are UX, not real security.
- Backend/Supabase RLS must enforce data access.

## Stage 3: Domain Modeling And System Analysis

Product goals:

- Define core entities:
  - users;
  - profiles;
  - restaurants;
  - cafe applications;
  - products/offers;
  - orders;
  - reviews;
  - notifications;
  - moderation logs.
- Define lifecycle states:
  - cafe application;
  - product/offer;
  - order;
  - review/moderation.

Engineering skills:

- System analysis.
- Entity modeling.
- State machines.
- Business rules.
- Edge cases.
- Acceptance criteria.
- Data ownership boundaries.

Example business rules:

- Pending cafe cannot create offers.
- Rejected cafe sees rejection reason and can resubmit.
- Buyer can see only their own orders.
- Cafe can manage only its own restaurant/offers.
- Admin can approve/reject cafe applications.
- Product quantity cannot go below zero.
- Order status transitions must be explicit and limited.

## Stage 4: Data Layer And SQL

Product goals:

- PostgreSQL schema.
- Supabase tables.
- Relations and constraints.
- RLS policies.
- Seed data for development.

Engineering skills:

- SQL basics.
- Tables and relations.
- Foreign keys.
- Indexes.
- Migrations.
- Query reasoning.
- Row Level Security.
- Data integrity.

Minimum SQL/PostgreSQL path:

- `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- `WHERE`, `JOIN`, `ORDER BY`, `LIMIT`.
- Primary keys and foreign keys.
- Unique constraints.
- Index basics.
- Migration discipline.
- RLS policies with `auth.uid()`.

## Stage 5: Backend Foundation

Product goals:

- Simple Node.js API.
- Request/response flow.
- REST endpoints.
- Server-side validation.
- Auth middleware.
- Rate limiting.
- Error response format.

Engineering skills:

- Node.js runtime.
- HTTP request/response.
- Express/Fastify basics.
- Middleware chain.
- API contracts.
- Status codes.
- Validation.
- Error handling.
- Security boundaries.

Backend path:

```text
Node.js basics
  -> simple Express/Fastify API
  -> validation
  -> auth middleware
  -> REST contracts
  -> rate limiting
  -> webhooks
  -> background jobs later
```

NestJS is intentionally later. First we should understand the lower-level request/response mechanism.

## Stage 6: API Contracts And Forms

Product goals:

- Login form.
- Register form.
- Cafe application form.
- Offer creation form.
- Checkout flow.
- Review form.

Engineering skills:

- Controlled forms.
- Validation.
- Dirty/touched/submitting states.
- API DTOs.
- Error shape contracts.
- Client validation vs server validation.
- Async form flows.

Rule:

```text
Frontend validation improves UX.
Backend validation protects the system.
```

## Stage 7: Internal Tools And Automation

Product goals:

- Admin moderation dashboard.
- Cafe application review queue.
- Order management.
- Support/refund workflow.
- Notification triggers.
- Webhook-driven automation.

Engineering skills:

- Internal tools thinking.
- Workflow automation.
- Retool/n8n-style process design.
- Operational dashboards.
- Audit trails.
- Admin permissions.
- Webhooks.

Example workflows:

```text
cafe submitted application
  -> admin review queue
  -> approve/reject
  -> notification
  -> moderation log
```

```text
order created
  -> notify cafe
  -> reserve quantity
  -> buyer receives pickup code
```

## Stage 8: Testing, Regression And AI-Assisted QA

Product goals:

- Basic unit tests.
- Critical flow tests.
- Smoke checks.
- Regression checklist.
- AI-assisted QA scenarios.

Engineering skills:

- Unit testing business logic.
- Component testing.
- Integration smoke flows.
- Regression thinking.
- Test data setup.
- Bug reproduction.
- AI-assisted test case generation.

Core flows to test:

- Auth redirect.
- Role-based route access.
- Cafe pending cannot access cafe dashboard.
- Admin can approve/reject.
- Buyer cannot access cafe-only routes.
- Product quantity cannot be oversold.
- Order lifecycle transitions.

## Stage 9: Performance And PWA Quality

Product goals:

- PWA readiness.
- Route lazy loading.
- Image optimization.
- Offline/poor network states.
- Core Web Vitals awareness.

Engineering skills:

- Bundle size.
- Lazy routes.
- Avoiding unnecessary rerenders.
- Zustand selectors.
- Memoization only where justified.
- Loading skeletons.
- Cache strategy.
- Web Vitals.

Rule:

```text
Optimize based on observed bottlenecks, not superstition.
```

## Stage 10: Technical Leadership Practice

Product goals:

- Keep decisions documented.
- Keep scope controlled.
- Make trade-offs explicit.
- Prepare portfolio-quality explanations.

Engineering skills:

- Task decomposition.
- Code review mindset.
- Architecture review.
- Risk analysis.
- Security review.
- Roadmap thinking.
- Pull request summaries.
- Technical documentation.

After each major feature, capture:

- What problem was solved.
- What options were considered.
- Why this approach was chosen.
- What risks remain.
- What should be tested.
- What can become painful at scale.

## Portfolio Outcome

The final portfolio story should not be:

```text
Built a React app.
```

It should be:

```text
Built a PWA marketplace with role-based auth, protected routes, cafe moderation workflow, typed API contracts, PostgreSQL/Supabase data model, RLS security, resilient async flows, validation, internal admin tooling, testing strategy, and performance work.
```

The target is not to become a faster screen assembler. The target is to become an engineer who can understand a domain, model business rules, design system boundaries, use AI effectively, and deliver reliable product features.

## Career Positioning

The long-term career goal is not to compete in the general pool of frontend developers. The goal is to build a specific professional niche:

```text
financial / banking / internal business systems
+ data-heavy UI
+ workflow automation
+ AI-assisted engineering
```

This direction fits the existing background:

- banking operations experience;
- investment planning experience;
- experience with large-scale operational and financial datasets;
- experience reducing complex business data into decision-ready numbers;
- frontend engineering growth;
- interest in backend, SQL, security, automation, and systems analysis.

The previous work with investment programs and large infrastructure datasets is an advantage, not a detour. It trained the ability to work with:

- thousands of rows;
- hundreds of columns;
- financial and operational indicators;
- statuses and lifecycle tracking;
- debt/credit/funding/completion logic;
- high-responsibility reporting;
- business chaos that must become a controlled decision model.

This project should intentionally convert that background into software engineering strengths:

```text
complex domain -> entity model -> business rules -> data model -> UI workflow -> validation -> auditability -> reliable decision support
```

Portfolio positioning should eventually emphasize:

- operational dashboards;
- data-heavy interfaces;
- approval and moderation workflows;
- role-based internal systems;
- financial/revenue analytics;
- audit-friendly state changes;
- backend contracts;
- SQL/data modeling;
- AI-assisted QA and regression thinking.

The target profile is:

```text
Product-minded frontend/full-stack engineer for financial, banking, and internal systems,
with strong systems analysis, data-heavy UI, workflow automation, and AI-assisted engineering skills.
```
