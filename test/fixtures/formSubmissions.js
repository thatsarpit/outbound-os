// Sanitized examples constructed from the providers' documented payload shapes.
// They are fixtures, not claims of submissions from live provider accounts.
export const FORM_PAYLOADS = {
  typeform: {
    event_id: 'test-typeform-event', event_type: 'form_response',
    form_response: {
      form_id: 'TESTFORM', token: 'test-response', submitted_at: '2026-10-01T09:30:00.000Z',
      definition: { fields: [
        { id: 'name-field', ref: 'random-name-ref', title: 'Name', type: 'short_text' },
        { id: 'email-field', ref: 'random-email-ref', title: 'Email', type: 'email' },
        { id: 'phone-field', ref: 'random-phone-ref', title: 'Phone', type: 'phone_number' },
        { id: 'message-field', ref: 'random-message-ref', title: 'Message', type: 'long_text' },
        { id: 'consent-field', ref: 'email_consent', title: 'Email_consent', type: 'yes_no' },
      ] },
      answers: [
        { type: 'email', email: 'typeform@example.test', field: { id: 'email-field', ref: 'random-email-ref', type: 'email' } },
        { type: 'text', text: 'Need 500 units', field: { id: 'message-field', ref: 'random-message-ref', type: 'long_text' } },
        { type: 'phone_number', phone_number: '+1 555 000 0011', field: { id: 'phone-field', ref: 'random-phone-ref', type: 'phone_number' } },
        { type: 'text', text: 'Typeform Buyer', field: { id: 'name-field', ref: 'random-name-ref', type: 'short_text' } },
        { type: 'boolean', boolean: true, field: { id: 'consent-field', ref: 'email_consent', type: 'yes_no' } },
      ],
    },
  },
  tally: {
    eventId: 'test-tally-event', eventType: 'FORM_RESPONSE',
    data: { formId: 'TESTFORM', submissionId: 'test-submission', createdAt: '2026-10-01T09:30:00.000Z', fields: [
      { key: 'question_email', label: 'Email', type: 'INPUT_EMAIL', value: 'tally@example.test' },
      { key: 'question_message', label: 'Message', type: 'TEXTAREA', value: 'Need 500 units' },
      { key: 'question_phone', label: 'Phone', type: 'INPUT_PHONE_NUMBER', value: '+1 555 000 0012' },
      { key: 'question_name', label: 'Name', type: 'INPUT_TEXT', value: 'Tally Buyer' },
      { key: 'question_consent', label: 'Email_consent', type: 'CHECKBOXES', value: null },
    ] },
  },
  googleforms: { name: 'Google Forms Buyer', email: 'googleforms@example.test', phone: '+1 555 000 0013', message: 'Need 500 units', email_consent: false, externalId: 'test-google-response', submittedAt: '2026-10-01T09:30:00.000Z' },
};
