# CodeClass

CodeClass is a classroom programming platform. [Code Lab](https://codeclass.vnotemate.com/code-lab) is its browser-based coding workspace.

- `client/`: React + Vite frontend
- `server/`: Express API and Prisma schema
- `Dockerfile`: production image build for the CodeClass app

This repository is a source snapshot. It does not include production databases, uploads, backups, secrets, or one-off production scripts. The Meet application is maintained separately in [online-meeting](https://github.com/PTHung-s/online-meeting).

## Development

Use Node.js 22 or later. Install dependencies separately in `client/` and `server/` with `npm ci`. Configure a development database and set `DATABASE_URL` and a local `JWT_SECRET` for the server before running `npm run dev` in each directory. Never reuse production credentials locally.
