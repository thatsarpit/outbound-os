export const nginxExample = `server {
    listen 80;
    server_name crm.example.com;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    location = /api/events {
        proxy_pass http://127.0.0.1:3001;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
    }
}`

export const googleFormsScript = `function onFormSubmit(e) {
  if (!e || !e.response) {
    throw new Error('Use an installable trigger: From form → On form submit.');
  }
  const settings = PropertiesService.getScriptProperties();
  const url = settings.getProperty('OUTBOUNDOS_WEBHOOK_URL');
  const key = settings.getProperty('OUTBOUNDOS_API_KEY');
  if (!url || !key) throw new Error('Set the webhook URL and API key in Script properties.');

  const answers = {};
  e.response.getItemResponses().forEach(function (item) {
    const title = item.getItem().getTitle().trim().toLowerCase();
    const value = item.getResponse();
    answers[title] = Array.isArray(value) ? value.join(', ') : value;
  });
  const payload = {
    name: answers.name || '',
    email: answers.email || e.response.getRespondentEmail() || '',
    phone: answers.phone || '',
    company: answers.company || '',
    message: answers.message || '',
    country: answers.country || '',
    email_consent: answers.email_consent === 'Yes',
    externalId: e.response.getId(),
    submittedAt: e.response.getTimestamp().toISOString()
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('Outbound OS rejected the submission: HTTP ' + response.getResponseCode());
  }
}`
