export const BRAND_NAME = 'Outbound OS'

// Industry-neutral on purpose. The product automates multichannel outreach and
// follow-up for any B2B sales team. Segment-specific language belongs on the
// marketing site.
export const BRAND_TAGLINE = 'Multichannel sales automation for B2B teams'

// Where "Help" in the account menu goes. Self-hosted installs default to the
// project's community; a company running it for a team can point this at its
// own helpdesk or chat at build time.
export const SUPPORT_URL =
  (import.meta.env.VITE_SUPPORT_URL as string | undefined) ||
  'https://github.com/thatsarpit/outbound-os/discussions'
