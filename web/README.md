# Outbound OS Dashboard

This app is the authenticated dashboard served on `app.outboundos.space`.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: build the production dashboard bundle
- `npm run build:production`: validate the Clerk production key, then build
- `npm run preview`: preview the built dashboard locally
- `npm run lint`: run frontend linting
- `npm run format:check`: verify source formatting

## Key Areas

- `src/pages/`: route-level screens such as login, overview, pipeline, inbox, and settings
- `src/components/layout/`: app shell, sidebar, topbar, and brand/navigation chrome
- `src/components/ui/`: reusable dashboard primitives
- `src/stores/`: Zustand state for auth, UI, toasts, and notifications
- `src/api/`: frontend API client and endpoint bindings
- `src/lib/`: brand and role-shell helpers

## Notes

- The dashboard proxies API calls through Vite in local development.
- Production bundles are served by the Express backend or published as the
  Cloudflare Pages dashboard artifact. Never publish a production bundle made
  with a Clerk `pk_test_` key.
