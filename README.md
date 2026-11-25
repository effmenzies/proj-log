# proj-log

A React frontend and a TypeScript API backed by PostgreSQL. Creating an account
or logging in starts a seven-day server-side session.

## Prerequisites

Node.js 22.12 or newer, npm, and Docker with Compose. No Python installation or
virtual environment is required.

## Fresh database setup

```sh
npm ci
npm run db:generate
docker compose up -d --wait
export DATABASE_URL='postgresql://projlog:projlog@localhost:5432/projlog'
npm run db:migrate
```

The Compose credentials are for local development only. Use separately managed
credentials elsewhere. PostgreSQL data persists in a Docker volume; `docker compose
stop` stops the database without deleting it.

## Upgrade an existing Alembic database

Back up the database first. Set `DATABASE_URL` to its PostgreSQL URL (replace the
old `postgresql+psycopg://` prefix with `postgresql://`). Run `npm ci` and
`npm run db:generate`, then:

```sh
npm run db:baseline
npm run db:migrate
```

The baseline command checks the `users` columns, defaults and constraints and
requires Alembic revision `0001` with no existing Prisma migration history. It
then records the baseline as already applied; it does not recreate `users` or
remove the legacy `alembic_version` table. If validation fails, investigate
the drift and back up the database before making any changes; do not reset it.
For a non-public PostgreSQL schema, add `?schema=your_schema` to `DATABASE_URL`.

## Run the app

After database setup, start the API with `DATABASE_URL` set:

```sh
npm run dev:api
```

In a second terminal, start the frontend:

```sh
npm run dev
```

Open the URL printed by Vite. Visit `/next-rep` for the standalone Next Rep landing
page: a dark, full-width page with a geometric ribbon that untangles as you
scroll. Reduced-motion preferences show a static ribbon. This page needs no API
or database connection and has no sidebar, top bar, or session requests.
Its **Get started** link opens the existing app home at `/`.

The app home shows **Log in** and **Create account** buttons only after confirming
the visitor is signed out; signed-in visitors do not see these buttons.
The home page also links to `/create-account` and
`/login` through the profile menu. The sidebar and profile menu show additional
links when signed in. In progress, My plans, Create plan, profile, and settings pages
are placeholders; their contents are not implemented. Either Log out control
revokes the current browser session and returns to home.

Vite proxies `/api` to the API at `127.0.0.1:3000`; keep the API port
at its default when using this proxy. The API runs locally and uses an in-memory
per-client rate limit, which is not shared across processes or restarts. A public
deployment needs appropriate HTTPS, proxy configuration, and shared rate limiting.
Sessions use an HTTP-only, SameSite=Lax cookie and store only a hash of the
random session token in PostgreSQL. Set `NODE_ENV=production` when using HTTPS
to mark cookies Secure. Sessions expire after seven days; logging in again
replaces the current browser's session. Run `npm run db:migrate` after updating
the app to add the sessions table without altering existing users.

## Tests and build

```sh
export TEST_DATABASE_URL='postgresql://projlog:projlog@localhost:5432/projlog'
npm test
npm run typecheck:server
npm run build
npm audit
```

PostgreSQL integration tests require `TEST_DATABASE_URL` and permission to create
schemas. They create and remove uniquely named test schemas and skip when the
variable is unset. They cover fresh migration and non-destructive Alembic
baselining; unit and frontend tests still run without the database.

## Deferred work

Plan and profile features, server-side authorization for future data endpoints,
and payment provider integration are not implemented.
The database stores only an optional
provider payment-method reference, card brand, and last four digits, never card
numbers or CVVs. Do not add a public user read without authentication and
authorization.
