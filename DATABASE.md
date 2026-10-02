# FlowSuite Database Design & Migration Strategy

## Database Technology

FlowSuite uses PostgreSQL 16 as its relational database, with Prisma ORM used for database access and schema management.

## Database Schema

The database schema contains the core entities required by the FlowSuite PRD:

* **User** — stores user account information.
* **Organization** — represents a FlowSuite tenant/workspace.
* **Membership** — connects users with organizations and stores their roles.
* **Plan** — stores subscription plan limits and entitlements.
* **Subscription** — associates an organization with its current plan and subscription status.
* **Project** — stores organization-level projects.
* **Task** — stores tasks belonging to projects and optionally assigned to users.
* **Customer** — stores organization-level customer records and their project relationships.
* **UsageCounter** — tracks monthly API request usage for an organization.
* **AuditLog** — records important organization and account actions.

## Multi-Tenant Data Structure

Tenant-owned entities contain an `organizationId` relationship or derive it through parent relations (e.g. `Task -> Project -> Organization`).

This structure supports strict organization-level data isolation. API queries always use the authenticated user's organization context when accessing tenant-owned data.

Cross-organization access is blocked through server-side query scoping and authorization middleware.

## Roles

The `Membership` model supports the four roles defined in the PRD:

* `OWNER`
* `ADMIN`
* `MANAGER`
* `MEMBER`

Server-side role authorization is enforced across organization endpoints, project management, and task operations.

## Task Data Model & Relationships

### Task Entity

The `Task` model includes the following fields:

* `id` — UUID primary key.
* `projectId` — foreign key referencing `Project.id`.
* `assigneeId` — optional foreign key referencing `User.id`.
* `title` — string task title.
* `description` — optional detailed task description.
* `status` — enum (`TODO`, `IN_PROGRESS`, `COMPLETED`), defaulting to `TODO`.
* `createdAt` / `updatedAt` — timestamps.

### Entity Relationships

* A **Task** belongs to a **Project** (`Task.projectId -> Project.id`, cascade delete).
* A **Task** may be assigned to a **User** (`Task.assigneeId -> User.id`, set null on delete).
* A **Project** belongs to an **Organization** (`Project.organizationId -> Organization.id`).

Because `Task` belongs to `Project` which belongs to `Organization`, tenant isolation for `Task` records is derived through the `Project -> Organization` relation (`task.project.organizationId = authenticated organizationId`).

### Query Isolation

All task database queries enforce organization scoping:

```text
task.project.organizationId = authenticated organizationId
```

For users with the `MEMBER` role, Prisma queries enforce member-assigned task visibility directly in the database `where` clause:

```text
task.assigneeId = authenticated userId
```

This prevents `MEMBER` users from querying, viewing, or updating tasks assigned to other users and guarantees strict tenant boundary enforcement.

### Project Visibility Derivation for Members

`MEMBER` project visibility is derived directly from task assignments:

A user with the `MEMBER` role can see a project only when the project contains at least one task assigned to that Member (`tasks.some.assigneeId = authenticated userId`). No separate `MemberToProject` join table was added or required for Day 6.

### AuditLog Integration

Task mutations (`TASK_CREATED`, `TASK_UPDATED`, `TASK_ASSIGNED`, `TASK_STATUS_UPDATED`) execute within Prisma transactions (`prisma.$transaction`) to atomically write an entry to the `AuditLog` table with `organizationId` and `actorId`.

## Subscription Plans & States

The `Plan` model stores subscription limits in the database:
* Seat limits
* Project limits
* Monthly API request limits
* Advanced analytics entitlement

The three plans defined by the PRD are Free, Starter, and Professional.

The `Subscription` model supports states `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, and `EXPIRED`, with Stripe integration identifiers.

## Database Relationships Summary

```text
Organization
├── Membership
├── Project
│   ├── Task
│   └── Customer
├── Customer
├── Subscription
├── UsageCounter
└── AuditLog

User
├── Membership
├── Task assignments
└── AuditLog entries

Plan
└── Subscription
```

## Indexes and Constraints

Indexes defined in the Prisma schema include:

* `Organization`: primary key, unique constraints.
* `Membership`: `@@index([organizationId])`, `@@index([userId])`, `@@unique([organizationId, userId])`.
* `Project`: `@@index([organizationId])`, `@@index([organizationId, status])`.
* `Task`: `@@index([projectId])`, `@@index([assigneeId])`, `@@index([projectId, status])`.
* `Subscription`: `@@index([planId])`, `@@index([status])`, unique constraints on `organizationId`, `stripeCustomerId`, `stripeSubscriptionId`.
* `AuditLog`: `@@index([organizationId])`, `@@index([actorId])`, `@@index([organizationId, createdAt])`.
* `UsageCounter`: `@@index([organizationId])`, `@@unique([organizationId, year, month])`.

## Migration Status

* **Initial Migration**: `20261002043238_init` introduced all ten core models.
* **Day 6 Status**: Day 6 required **no database schema changes or migrations**, as the existing `Task`, `Project`, `User`, `Organization`, and `AuditLog` models introduced in the Day 2 baseline fully satisfied all Day 6 PRD requirements.
