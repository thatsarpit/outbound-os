/** Immutable mail objects tolerate KV's delayed visibility; delivery always retries. */
export function kvMailSpool(namespace) {
  if (!namespace?.put || !namespace?.getWithMetadata || !namespace?.list) {
    throw new Error('Private inbound email KV storage is not configured');
  }
  return {
    async put(key, value, options = {}) {
      // KV requires a known stream length. Email Routing supplies a readable
      // stream, already bounded by the receiver's size check.
      const data = value instanceof ReadableStream ? await new Response(value).arrayBuffer() : value;
      await namespace.put(key, data, {
        ...(options.customMetadata ? { metadata: options.customMetadata } : {}),
      });
    },
    async get(key) {
      const { value, metadata } = await namespace.getWithMetadata(key, { type: 'arrayBuffer' });
      if (value === null) return null;
      return {
        size: value.byteLength,
        customMetadata: metadata || {},
        arrayBuffer: async () => value,
        json: async () => JSON.parse(new TextDecoder().decode(value)),
      };
    },
    async head(key) {
      const { value } = await namespace.getWithMetadata(key, { type: 'arrayBuffer' });
      return value === null ? null : { key };
    },
    async list({ prefix, limit, cursor }) {
      const page = await namespace.list({ prefix, limit, ...(cursor ? { cursor } : {}) });
      return {
        objects: page.keys.map(entry => ({ key: entry.name, uploaded: new Date(entry.metadata?.receivedAt || 0) })),
        truncated: !page.list_complete,
        cursor: page.cursor,
      };
    },
  };
}
