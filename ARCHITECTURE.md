# FlowSuite Architecture

This document describes the foundational architecture, multi-tenant isolation, role-based authorization model, and system design principles for FlowSuite.

## 1. System Overview & Runtime Setup

FlowSuite operates with the following runtime architecture:

- **Frontend (Host)**: React + Vite + TypeScript single-page application (SPA) running locally on host port `5173`.
- **Backend (Host)**: Express.js + TypeScript API server running locally on host port `5000`.
- **Infrastructure Containers (Docker)**: PostgreSQL 16 and Redis 7 services running via Docker Compose.

```text
+------------------------------------+
|   Client (Host: React + Vite)      |
+------------------------------------+
                  |
                  | HTTP REST APIs (/api/v1)
                  v
+------------------------------------+
|   Server (Host: Express + TS)      |
+------------------------------------+
         |                  |
         | Prisma ORM       | ioredis
         v                  v
+----------------+  +----------------+
| PostgreSQL 16  |  | Redis 7        |
| (Docker: 5432) |  | (Docker: 6379) |
+----------------+  +----------------+
```

## 2. Request Processing Pipeline

All protected API requests follow a layered, security-first pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware → Route Handler → Service Layer → Prisma / PostgreSQL
```

1. **JWT Authentication Middleware (`authenticate`)**:
   - Verifies the `Authorization: Bearer <token>` header.
   - Extracts and decodes the JWT payload.
   - Attaches `req.user = { userId, organizationId }` to the request object.

2. **RBAC Authorization Middleware (`requireRole(...)`)**:
   - Queries the database (`Membership`) using `organizationId` and `userId`.
   - Validates that the user holds an active membership and one of the required roles.
   - Attaches `req.userRole` to the request object for downstream consumption.

3. **Service Layer Execution**:
   - Receives validated inputs, `organizationId`, `userId`, and `userRole`.
   - Executes business operations inside atomic database transactions (`prisma.$transaction`).
   - Writes transactional audit log records corresponding to entity mutations.

## 3. Task Management Flow

Task operations follow the standard backend processing flow:

```text
Authenticated Request → JWT Middleware → RBAC Middleware → Task Route → Task Service → Prisma / PostgreSQL
```

Before accessing or mutating tenant-owned task data, task operations resolve the authenticated user's:
- `userId`
- `organizationId`
- `role` / `membership`

Task queries resolve tenant ownership through the parent project's `organizationId` field (`task.project.organizationId = organizationId`).

## 4. Multi-Tenant Data Isolation

FlowSuite enforces strict organization-level data isolation at the backend service layer:

- **Organization Scoping**: Every database query for tenant-owned entities (Projects, Tasks, Memberships, AuditLogs) is explicitly scoped by `req.user.organizationId`.
- **Untrusted Client Inputs**: Organization IDs provided in request bodies, URL params, or query strings are strictly ignored in favor of the authenticated token context.
- **Cross-Tenant Handling**: Attempts to access or modify resources belonging to another organization reject with generic 404 (`PROJECT_NOT_FOUND`, `TASK_NOT_FOUND`) responses to prevent resource enumeration.
- **Member Visibility Scoping**:
  - **Member Project Visibility**: `MEMBER → only projects containing tasks assigned to authenticated user` (`tasks.some.assigneeId = userId`).
  - **Member Task Visibility**: `MEMBER → only tasks where assigneeId = authenticated userId` (`assigneeId = userId`).

## 5. Server-Side Role-Based Access Control (RBAC)

FlowSuite implements a four-tier server-side RBAC authorization model (`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`):

### Task Management Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **Create Task** | Yes | Yes | Yes | No |
| **Update Task Fields** | Yes | Yes | No | No |
| **Update Task Status** | Yes | Yes | Yes | Assigned Tasks Only |
| **Assign / Reassign Task** | Yes | Yes | Yes | No |
| **View Tasks** | Yes | Yes | Yes | Assigned Tasks Only |

### Project Management & Visibility Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **Create Project** | Yes | Yes | Yes | No |
| **Update Project** | Yes | Yes | Yes | No |
| **Archive Project** | Yes | Yes | Yes | No |
| **View Organization Projects** | Yes | Yes | Yes | Assigned-Task Projects Only |

Permissions are strictly enforced on the server side via `requireRole` middleware and service-level role verification.

## 6. Audit Logging

Key system and domain mutations execute within atomic database transactions (`prisma.$transaction`) alongside an `AuditLog` creation step. This guarantees that an audit log entry is persisted whenever a mutation succeeds, and rolled back if the mutation fails.

Implemented task audit actions:
- `TASK_CREATED`: Logged when a task is created, recording title, projectId, assigneeId, and status.
- `TASK_UPDATED`: Logged when arbitrary task fields (title, description, status, assigneeId) are updated.
- `TASK_ASSIGNED`: Logged when a task is assigned or unassigned, recording previous and new assignee IDs.
- `TASK_STATUS_UPDATED`: Logged when task status changes, recording previous and new status values.

Other implemented audit actions:
- Membership: `MEMBER_INVITED`, `INVITATION_ACCEPTED`, `MEMBER_ROLE_UPDATED`, `MEMBER_REMOVED`.
- Projects: `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED`.

## 7. Testing & Verification Architecture

The backend test suite is built with Vitest and focuses on service-level unit tests and RBAC middleware validation:

- **84 automated tests passing across 9 test suites.**
- **Service Tests**: Cover authentication, registration, login, refresh, password reset, membership/invitations, project CRUD, task CRUD, and assignment validation.
- **RBAC & Visibility Tests**: Test exact role permission boundaries for `OWNER`, `ADMIN`, `MANAGER`, and `MEMBER`, including Member project and task visibility scoping.
- **Tenant Isolation Tests**: Explicit cross-tenant isolation tests asserting that queries attempting to access Organization B resources from Organization A context return 404.
- **Build Status**: Verified clean compilation via `npm run build` (`tsc`).
