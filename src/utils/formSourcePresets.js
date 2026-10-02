/** Answer arrays are addressed by field ref/key or question label, not position. */
export const FORM_SOURCE_PRESETS = [
  {
    id: 'typeform', name: 'Typeform',
    description: 'Typeform response webhooks', responseFormat: 'json',
    fieldMap: {
      name: 'form_response.answers.name.text',
      mobile: 'form_response.answers.phone_number.phone_number',
      email: 'form_response.answers.email.email',
      company: 'form_response.answers.company.text',
      product: 'form_response.answers.message.text',
      country: 'form_response.answers.country.choice.label',
      consent: 'form_response.answers.email_consent.boolean',
    },
    notes: 'Use question titles Name, Company, Message, Country and Email_consent, or matching field refs. Use Email and Phone Number question types. Put ?apiKey=<key> on the webhook URL; Typeform cannot add a custom x-api-key header.',
  },
  {
    id: 'tally', name: 'Tally',
    description: 'Tally form submission webhooks', responseFormat: 'json',
    fieldMap: {
      name: 'data.fields.name.value', mobile: 'data.fields.phone.value',
      email: 'data.fields.email.value', company: 'data.fields.company.value',
      product: 'data.fields.message.value', country: 'data.fields.country.value',
      consent: 'data.fields.email_consent.value',
    },
    notes: 'Use field labels Name, Phone, Email, Company, Message, Country and Email_consent, or map stable field keys such as data.fields.question_abc.value. Add the source key as an x-api-key header in Tally.',
  },
  {
    id: 'googleforms', name: 'Google Forms',
    description: 'Google Forms via an installable Apps Script submit trigger', responseFormat: 'json',
    fieldMap: {
      name: 'name', mobile: 'phone', email: 'email', company: 'company',
      product: 'message', country: 'country', consent: 'email_consent',
    },
    notes: 'Attach the documented Apps Script to the form and add an installable On form submit trigger. It posts JSON with x-api-key; Google Forms has no native direct-webhook setting.',
  },
];
