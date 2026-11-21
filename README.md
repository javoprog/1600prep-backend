# 1600prep-backend

NestJS + TypeScript + Prisma (SQLite) backend for **1600prep** — optional email/password authentication and SAT practice results synchronization.

## Features

- **Optional Authentication (Only for Saving Results)**:
  - `POST /auth/register` — Create an account with name, email, and password
  - `POST /auth/login` — Sign in with email and password
  - `GET /auth/me` — Fetch current authenticated user profile
  - `PATCH /auth/profile` — Update display name and email
  - `PATCH /auth/password` — Change account password
  - `DELETE /auth/account` — Delete account and saved data
- **Practice Results Synchronization**:
  - `GET /results/summary` — Overall accuracy, solved questions, mistake question IDs, subject breakdown (`rw` & `math`), recent sessions, and recent attempts
  - `POST /results/attempts` — Real-time attempt recording
  - `POST /results/sessions` — Completed session recording
  - `POST /results/sync` — Bulk idempotent sync of guest sessions & attempts upon login/signup
  - `DELETE /results` — Reset saved practice history

## Quick Start

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```
