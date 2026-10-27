// In-process proof, deliberately absent from serialized tokens and request data.
// Only the middleware that has verified a personal delegation marks its actor.
const verified = new WeakSet();
export function markVerifiedMcpActor(actor) {
  verified.add(actor);
  return actor;
}
export const isVerifiedMcpActor = actor => !!actor && typeof actor === 'object' && verified.has(actor);
