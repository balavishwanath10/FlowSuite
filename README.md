# FlowSuite

## Product Vision

FlowSuite is a production-style B2B SaaS platform designed to provide organizations with isolated workspaces for managing teams, customers, projects, and tasks — backed by role-based access control (RBAC), subscription billing, a flexible feature-entitlement engine, usage limits, and audit logging.

## Current Status — Day 1 Foundation

The repository currently contains the **Day 1 foundational setup ONLY**:

- **Docker Compose Infrastructure**: Containerized PostgreSQL 16 and Redis 7.
- **PostgreSQL 16**: Relational database service running and healthy.
- **Redis 7**: In-memory data store service running and healthy.
- **Prisma Foundation**: Configured datasource and client generator setup.
- **Express / TypeScript Backend**: API server baseline running on port 5000.
- **Health Check Endpoint**: `/api/v1/health` returning server, database, and Redis health statuses.
- **React / Vite / TypeScript / Tailwind Frontend**: Client SPA baseline running on port 5173.

> [!IMPORTANT]
> **Planned vs. Implemented Functionality**: Authentication (auth, JWT), role-based access control (RBAC), organizations/memberships, projects, tasks, customers, subscriptions/billing (Stripe), usage limits, audit logging, and other business domain features are planned according to the FlowSuite PRD for upcoming phases and are **NOT implemented yet**.

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database & ORM**: PostgreSQL 16 + Prisma ORM
- **Cache**: Redis 7
- **Infrastructure**: Docker & Docker Compose

## Repository Layout

```
FlowSuite/
├── client/              # React + Vite + TypeScript + Tailwind CSS frontend
├── server/              # Node.js + Express + TypeScript + Prisma backend
├── docker-compose.yml   # Infrastructure containers (PostgreSQL & Redis)
├── .env.example         # Environment configuration template
├── ARCHITECTURE.md      # System architecture documentation
└── DATABASE.md          # Database strategy & migration guidelines
```

## Getting Started

### Prerequisites
- Node.js (v18+ or v20+)
- npm
- Docker & Docker Compose

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
The backend API will run on `http://localhost:5000`. Test health status at `http://localhost:5000/api/v1/health`.

### 4. Start Frontend Client
```bash
cd client
npm install
npm run dev
```
The client app will run on `http://localhost:5173`.
