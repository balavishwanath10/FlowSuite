# FlowSuite

## Product Vision

FlowSuite is a production-style B2B SaaS platform designed to provide organizations with isolated workspaces for managing teams, customers, projects, and tasks — backed by role-based access control (RBAC), subscription billing, a flexible feature-entitlement engine, usage limits, and audit logging.

## Current Status — Day 3 Authentication & JWT

The repository currently contains the completed **Day 1 foundation, Day 2 database schema, and Day 3 authentication implementation**.

### Day 1 — Foundation

* Docker Compose infrastructure with PostgreSQL 16 and Redis 7.
* Express.js + TypeScript backend.
* React + Vite + TypeScript + Tailwind CSS frontend.
* Health check endpoint at `/api/v1/health`.
* Initial architecture and database documentation.

### Day 2 — Database Schema

* Complete Prisma schema for the 10 core FlowSuite entities.
* PostgreSQL migrations configured and applied.
* Seeded Free, Starter, and Professional subscription plans.
* Tenant-aware organization relationships and indexes.

### Day 3 — Authentication & JWT

* User registration with bcrypt password hashing.
* Automatic organization creation and Owner membership during registration.
* Free-plan subscription creation during registration.
* Login with credential validation.
* JWT access and refresh token generation.
* Protected authentication middleware.
* Authenticated user/organization endpoint.
* Refresh-token endpoint.
* Logout endpoint.
* Password-reset request and password-reset flow.
* Zod validation for authentication inputs.
* Automated authentication service tests using Vitest.
* **17 authentication tests passing.**
* TypeScript backend build passing.

> [!IMPORTANT]
> **Planned vs. Implemented Functionality:** Authentication and JWT functionality is now implemented and tested. Role-based access control (RBAC), organization membership management, projects, tasks, customers, subscription upgrades/billing, usage enforcement, audit logging, and the remaining business-domain functionality are planned according to the FlowSuite PRD and will be implemented in their scheduled phases.

## Tech Stack

* **Frontend**: React + Vite + TypeScript + Tailwind CSS
* **Backend**: Node.js + Express.js + TypeScript
* **Database & ORM**: PostgreSQL 16 + Prisma ORM
* **Cache**: Redis 7
* **Authentication**: JWT + bcrypt
* **Validation**: Zod
* **Testing**: Vitest
* **Infrastructure**: Docker & Docker Compose

## Repository Layout

```text
FlowSuite/

├── client/               # React + Vite + TypeScript + Tailwind CSS frontend
├── server/               # Node.js + Express + TypeScript + Prisma backend
├── docker-compose.yml    # Infrastructure containers (PostgreSQL & Redis)
├── .env.example          # Environment configuration template
├── ARCHITECTURE.md       # System architecture documentation
└── DATABASE.md           # Database strategy & migration guidelines
```

## Getting Started

### Prerequisites

* Node.js (v18+ or v20+)
* npm
* Docker & Docker Compose

### 1. Start Infrastructure

Start PostgreSQL and Redis services:

```bash
docker compose up -d
```

### 2. Configure Environment Variables

Copy `.env.example` to `server/.env`:

```bash
cp .env.example server/.env
```

### 3. Start Backend Server

```bash
cd server
npm install
npm run dev
```

The backend API will run on `http://localhost:5000`.

Test the health status at:

```text
http://localhost:5000/api/v1/health
```

### 4. Start Frontend Client

```bash
cd client
npm install
npm run dev
```

The client app will run on:

```text
http://localhost:5173
```

## Authentication

FlowSuite currently provides the following authentication endpoints:

| Method | Endpoint                              | Purpose                                    |
| ------ | ------------------------------------- | ------------------------------------------ |
| POST   | `/api/v1/auth/register`               | Register a user and create an organization |
| POST   | `/api/v1/auth/login`                  | Authenticate an existing user              |
| GET    | `/api/v1/auth/me`                     | Retrieve the authenticated user context    |
| POST   | `/api/v1/auth/refresh`                | Generate a new access token                |
| POST   | `/api/v1/auth/logout`                 | End the authenticated session flow         |
| POST   | `/api/v1/auth/password-reset/request` | Request a password reset                   |
| POST   | `/api/v1/auth/password-reset`         | Reset the account password                 |

### Authentication Security

* Passwords are hashed using bcrypt before storage.
* Access tokens and refresh tokens are signed using separate JWT secrets.
* Access tokens are short-lived.
* Refresh tokens have a longer lifetime.
* Protected endpoints require a valid Bearer access token.
* Authentication input is validated using Zod.
* Invalid credentials return a consistent authentication error.
* Password-reset tokens are time-limited and single-use within the current server process.

## Testing

The backend uses Vitest for automated service-level testing.

Run the complete test suite:

```bash
npm test
```

Build the backend:

```bash
npm run build
```

Current Day 3 authentication test coverage includes:

* Access-token generation and verification.
* Refresh-token generation and verification.
* Invalid access-token rejection.
* Invalid refresh-token rejection.
* Duplicate registration rejection.
* Missing Free-plan configuration handling.
* Successful organization registration flow.
* Invalid login credentials.
* Missing organization membership.
* Successful login.
* Refresh-token handling.
* Password-reset token generation.
* Password-reset validation.
* Password update handling.

**Current result: 17 authentication tests passing.**

## Database

FlowSuite uses PostgreSQL with Prisma ORM.

The database currently contains the following core entities:

* User
* Organization
* Membership
* Plan
* Subscription
* Project
* Task
* Customer
* UsageCounter
* AuditLog

Database migrations are managed through Prisma.

To check migration status:

```bash
npx prisma migrate status
```

To open Prisma Studio:

```bash
npx prisma studio
```

## Development Progress

### Week 1

#### Day 1 — Foundation

* Project repository initialized.
* Docker infrastructure configured.
* PostgreSQL and Redis connected.
* Backend and frontend foundations created.
* Health endpoint implemented.
* Initial documentation created.

#### Day 2 — Database

* Complete Prisma database schema implemented.
* Initial migration created and applied.
* Subscription plans seeded.
* Database documentation updated.

#### Day 3 — Authentication

* Registration implemented.
* Login implemented.
* JWT access and refresh tokens implemented.
* Authentication middleware implemented.
* `/me` endpoint implemented.
* Refresh endpoint implemented.
* Logout endpoint implemented.
* Password-reset flow implemented.
* Authentication validation implemented with Zod.
* Authentication tests implemented with Vitest.
* 17 authentication tests passing.
* Backend build verified successfully.

### Upcoming Development

The remaining functionality will be implemented according to the FlowSuite PRD schedule.

#### Day 4–5 — Organization & RBAC

* Organization membership management.
* Owner/Admin invitations.
* Role management.
* Owner, Admin, Manager, and Member permissions.
* Server-side authorization checks.

#### Day 6–7 — Projects, Tasks & Customers

* Organization-scoped project management.
* Organization-scoped task management.
* Organization-scoped customer management.
* Tenant-isolation verification.

#### Week 3 — Subscriptions & Usage

* Subscription and plan logic.
* Entitlement checks.
* Seat and project limits.
* API request usage limits.
* Stripe test-mode integration.
* Billing and usage dashboard.
* Audit logging.

#### Week 4 — Testing, Documentation & Deployment

* Backend business-logic coverage target.
* Tenant-isolation integration testing.
* Validation and rate limiting.
* API documentation.
* Architecture documentation.
* Docker deployment verification.
* Cloud deployment.
* Final acceptance-criteria verification.

## Project Scope

FlowSuite development follows the approved Product Requirements Document (PRD).

The implementation will focus only on the functionality defined in the PRD. Features outside the approved scope will not be added unless the project requirements are formally changed.

## License

This project is developed as part of an academic/internship project.
