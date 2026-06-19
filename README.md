# Ostatki Sladki

Early-stage FoodTech product for selling unsold restaurant food with dynamic discounts.

The project is currently in active development. At this stage, the focus is on product architecture, role-based flows, authentication state, and the foundation for future pricing and inventory logic.

## Product Idea

Restaurants often have unsold food at the end of the day. Customers want affordable ready-to-eat meals, while restaurants want to reduce waste and recover part of the cost.

Ostatki Sladki explores a marketplace-style flow where:

- cafes can publish food offers with time-sensitive discounts;
- buyers can discover discounted meals nearby;
- admins can review cafe applications before allowing them to sell;
- discount rules can later become dynamic based on time, stock, and demand.

## Current Focus

The current implementation is intentionally small. It lays the foundation for:

- authentication flow;
- role-based routing;
- buyer / cafe / admin user roles;
- cafe approval statuses;
- application shell and route structure;
- global auth state with Zustand.

## Implemented So Far

- React + TypeScript + Vite application setup.
- App routing with React Router.
- Basic route structure:
  - splash/session check;
  - login;
  - registration;
  - auth welcome;
  - home;
  - cafe pending review.
- Auth store with Zustand:
  - user id;
  - email;
  - role;
  - cafe approval status;
  - loading state;
  - error state;
  - auth reset/update actions.

## Domain Model Draft

```ts
type UserRole = 'buyer' | 'cafe' | 'admin'
type CafeStatus = 'pending' | 'approved' | 'rejected'
```

These states are important because the product is not a simple UI. It needs different flows for different users:

```text
new cafe -> registration -> pending review -> approved/rejected
buyer -> onboarding -> offer discovery -> purchase flow
admin -> cafe review -> moderation decisions
```

## Planned Product Logic

The future business logic will focus on:

- cafe onboarding and approval workflow;
- restaurant inventory/offers;
- time-based discount rules;
- buyer discovery and reservation flow;
- admin moderation;
- order lifecycle;
- pricing rules for remaining food stock;
- analytics for waste reduction and recovered revenue.

## Planned Dynamic Pricing Direction

The pricing model is expected to evolve from simple manual discounts to rules such as:

```text
base price
  -> time left before pickup
  -> remaining quantity
  -> cafe-defined minimum price
  -> demand/activity signals
  -> final discounted price
```

The long-term goal is to make discount calculation transparent, predictable, and easy to adjust for cafe owners.

## Tech Stack

- React
- TypeScript
- Vite
- React Router
- Zustand
- ESLint
- Prettier

## Project Structure

```text
src/app/router/          Application routes
src/features/auth/store  Auth state and role/status model
src/pages/               Product screens
src/main.tsx             Application entry point
```

## Local Setup

Install dependencies:

```bash
pnpm install
```

Run development server:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Run formatting check:

```bash
pnpm format:check
```

## Why This Project Matters

This project is my long-term product sandbox for practicing React, TypeScript, state management, product thinking, and business-rule design.

The main interest is not only UI implementation, but the logic behind a real product: roles, workflows, approval states, inventory, pricing, and user scenarios.

## Status

Work in progress. The repository is public to show the product direction, architecture decisions, and incremental development process.

## Author

Iuliia Usatova  
Frontend Engineer focused on fintech, business logic, internal tools, data-heavy interfaces, and AI-assisted engineering.
