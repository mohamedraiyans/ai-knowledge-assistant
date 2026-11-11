# @slm/api

The NestJS backend of AI Knowledge Assistant. Run it with the rest of the repo; see the
[root README](../../README.md) for what it does and [HOW_TO_RUN.txt](../../HOW_TO_RUN.txt) for setup.

```bash
npm run dev            # watch mode, port 4000
npx tsc --noEmit       # type-check
npx jest               # unit tests, no Docker or network needed
npm run prisma:generate   # regenerate the Prisma client (also marks it as an ES module folder)
npx prisma migrate deploy # apply migrations
```

## Endpoints

Everything except `/health`, `/settings/public` and the Google login routes needs a signed-in session.
"Admin" means the `ADMIN` role.

| Area | Routes |
|---|---|
| Auth | `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Chat | `POST /chat`, `GET /chat/faq`, `GET /chat/recent`, `DELETE /chat/faq` (admin), `GET /chat/history`, `POST /chat/history/clear` |
| Documents | `GET /documents`, `POST /documents`, `DELETE /documents/:filename`, `GET /documents/:filename/file` |
| Graph | `GET /graph`, `GET /graph/facts?q=` |
| Settings | `GET /settings/public`, `GET /settings` (admin), `PUT /settings` (admin), `DELETE /settings/:key` (admin) |
| Features | `GET /features`, `PATCH /features/:key` (admin) |
| Providers | `GET /providers/available`, `GET /providers/usage`, `GET/POST/PATCH/DELETE /providers` (admin), `POST /providers/test` (admin) |
| Users | `GET /users`, `PATCH /users/:id/role`, `DELETE /users/:id`, `GET/POST /users/invites`, `DELETE /users/invites/:email` (all admin) |
| Tracing | `GET /tracing/usage` (admin) |
| Evaluation | `GET/POST /eval/cases`, `DELETE /eval/cases/:id`, `GET /eval/runs`, `POST /eval/run` (all admin) |
