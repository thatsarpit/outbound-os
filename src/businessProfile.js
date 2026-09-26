import './bootstrapEnv.js';

/**
 * Business Profile — Single source of truth for all customizable identity fields.
 * Every field is configurable via .env. This eliminates all hardcoded business names,
 * personas, and industry-specific language from the codebase.
 */
const businessProfile = {
  // Company Identity
  businessName: process.env.BUSINESS_NAME || 'Outbound OS',
  businessTagline: process.env.BUSINESS_TAGLINE || '',
  businessCity: process.env.BUSINESS_CITY || '',
  businessCountry: process.env.BUSINESS_COUNTRY || '',
  businessIndustry: process.env.BUSINESS_INDUSTRY || 'B2B outreach automation',
  businessCertifications: process.env.BUSINESS_CERTIFICATIONS || 'enterprise-grade workflow platform',
  businessUSP: process.env.BUSINESS_USP || 'high-conversion WhatsApp outreach playbooks',
  businessWebsite: process.env.BUSINESS_WEBSITE || '',
  // Optional product list page, linked from outreach emails.
  businessCatalogueUrl: process.env.BUSINESS_CATALOGUE_URL || '',
  // Where "message us on WhatsApp" buttons point: a full URL, or a number
  // that becomes a wa.me link. Leave both blank to drop the button.
  businessWhatsAppUrl: process.env.BUSINESS_WHATSAPP_URL
    || (process.env.BUSINESS_WHATSAPP_NUMBER
      ? `https://wa.me/${String(process.env.BUSINESS_WHATSAPP_NUMBER).replace(/[^0-9]/g, '')}`
      : ''),
  // Name that signs outreach emails, e.g. "Priya". Blank signs as the business.
  senderSignature: process.env.EMAIL_SIGNATURE_NAME || '',
  // One line of small print under the signature: registrations, licences.
  emailFooterNote: process.env.EMAIL_FOOTER_NOTE || '',

  // AI Persona
  personaName: process.env.AI_PERSONA_NAME || 'Anaya',
  personaGender: process.env.AI_PERSONA_GENDER || 'female',
  personaTitle: process.env.AI_PERSONA_TITLE || 'outreach specialist',

  // Dashboard Branding
  dashboardBrand: process.env.DASHBOARD_BRAND_NAME || 'Outbound OS',
  dashboardTagline: process.env.DASHBOARD_TAGLINE || 'WhatsApp Outreach Command Center',

  // Timezone
  timezone: process.env.BUSINESS_TIMEZONE || 'UTC',
};

export default businessProfile;
