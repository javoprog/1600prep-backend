# 1600prep-backend

NestJS + TypeScript + Prisma (SQLite) backend for **1600prep** — optional authentication and SAT practice results synchronization.

## Features

- **Optional Authentication (Only for Saving Results)**:
  - **Email & Password** (`POST /auth/register`, `POST /auth/login`)
  - **Google Auth** (`POST /auth/google` — supports Google Identity Services ID tokens & OAuth2 access tokens)
  - **Telegram Auth**:
    - **Telegram Login Widget** (`POST /auth/telegram/widget` — HMAC-SHA256 verification)
    - **Telegram Bot 6-Digit Code / Deep Link** (`POST /auth/telegram/bot-session`, `GET /auth/telegram/bot-session/:sessionToken` — works on `localhost` and production)
- **Full Cross-Provider Account Linking**:
  - Accounts created with Email & Password can connect **Telegram** (`POST /auth/link/telegram-widget` or `POST /auth/link/telegram-code`) and **Google** (`POST /auth/link/google`).
  - Accounts created with Telegram or Google can connect **Email & Password** (`POST /auth/link/email`) as well as the other social provider.
  - Seamless account merging if a user links a provider that previously had a standalone account.
- **Practice Results Synchronization**:
  - `GET /results/summary` — Overall accuracy, solved questions, mistake question IDs, subject breakdown (`rw` & `math`), recent sessions, and recent attempts.
  - `POST /results/attempts` — Real-time attempt recording.
  - `POST /results/sessions` — Completed session recording.
  - `POST /results/sync` — Bulk idempotent sync of guest sessions & attempts upon login/signup.

## Quick Start

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```
