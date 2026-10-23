# outboundos.space

The project website: a Next.js static export deployed to Cloudflare Pages.

```bash
npm ci
npm run dev      # http://localhost:3002
npm run build    # static site in out/
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
