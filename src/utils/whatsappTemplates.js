/** Only expose campaign-relevant template data, never account credentials. */
export function summarizeWhatsAppTemplate(template) {
  const body = template.components?.find((component) => component.type === 'BODY')?.text || '';
  const bodyVariables = [...new Set([...body.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((match) => match[1]))];
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    body,
    bodyVariables,
  };
}
