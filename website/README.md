# outboundos.space

The project website: a Next.js static export deployed to Cloudflare Pages.

```bash
npm ci
npm run dev      # http://localhost:3002
npm run build    # static site in out/
npm run check:export  # routes, metadata, assets and redirects
```

Preview the build the way Cloudflare serves it (redirects and headers included):

```bash
npx wrangler pages dev out
```

## Where things live

| Path | What |
|---|---|
| `lib/site-content.ts` | Name, links, navigation, install commands |
| `lib/routes.ts` | Every indexable page: sitemap entry and share-card text |
| `lib/integrations.ts` | Integration pages (one entry each) |
| `lib/alternatives.ts` | Comparison pages |
| `lib/docs.ts` | Docs index and sidebar; each guide is `app/docs/<slug>/page.tsx` |
| `lib/structured-data.ts` | schema.org JSON-LD |
| `lib/product-screens.ts`, `public/screenshots/manifest.json` | Real sample captures, dimensions and provenance |
| `app/og/[card]/route.tsx` | Per-page social images, rendered at build time |
| `public/_headers`, `public/_redirects` | Cloudflare Pages headers and redirects |
| `public/llms.txt` | Summary for AI search engines |

## Rules for content

- Every claim about the product must match the code in this repository.
  Check before writing, and update the page when behaviour changes.
- Claims about other products come from their own websites; no prices.
- A new page goes in `lib/routes.ts` too, or it gets no sitemap entry
  and no share image.

## Deploy

```bash
npm run build
npx wrangler pages deploy out --project-name=outboundos-site
```

## Optional GA4

Public marketing pages use `G-GS1BKVLCM0` (property `557595873`) through
`public/site-analytics.js`. Google loads only after visitor opt-in. Page views
omit query strings/fragments and form details. Enhanced measurement is off.
This integration is restricted to the public website and its production hosts.

## Website service enquiries

The static form posts to `NEXT_PUBLIC_API_URL` (default `https://api.outboundos.space`).
The API owner must enable `WEBSITE_ENQUIRY_ENABLED=true` and allow the exact site
origins in `WEBSITE_ENQUIRY_ORIGINS`. Submissions become paused CRM leads with no
marketing consent and no queued sends. They do not change existing contacts.
The intake is rate-limited and has a honeypot. Failed submissions offer an email
draft to `hello@outboundos.space`; they never show a false success message.

The checked-in Cloudflare CSP permits only the default API hostname. If you use
another API origin, update `connect-src` and `form-action` in `public/_headers`.
No public API key or account credential belongs in the static site.

## Product evidence

`public/screenshots/manifest.json` records the source application commit, sample fixture, routes, capture date, intrinsic dimensions and hashes. Use genuine browser captures from the sample application, in dark mode. Never publish customer records, recolour light captures, or present a hand-built illustration as a product screenshot. Proportionate responsive resizing and format conversion are allowed. Update `lib/product-screens.ts`, the manifest and `site.screenshotVersion` when replacing captures.

The current pack comes from the dashboard repair preview associated with PR #53. Release the matching application/demo features before promoting this website to production. Preview builds can link directly to that matching demo without changing production redirects:

```sh
NEXT_PUBLIC_DEMO_URL=https://matching-demo.example \
NEXT_PUBLIC_MOBILE_DEMO_URL=https://matching-demo.example/m/inbox \
npm run build --prefix website
```

Omit these variables for normal `/demo` and `/demo/mobile` Pages redirects. Both URLs must point to the same application version represented in the captures.

## Browser review

Check the homepage, workflow tabs, product tour, connection map, navigation and representative integration, pricing, hosting, contact, legal and documentation pages at desktop and phone widths. Include a narrow 320px layout. Validate keyboard tabs, visible focus, sticky navigation and the shared motion preference. Preserve the operating system's reduced-motion preference. Below-the-fold images load lazily; a hidden lazy image that has not loaded is not a failed request.

Google Analytics remains consent-only and limited to the configured production hostnames. Local and preview sites do not load the production analytics script. Never submit a real enquiry merely to test the form: validate required fields and use a controlled test receiver for end-to-end delivery checks.
