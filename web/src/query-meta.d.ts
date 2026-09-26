// Module augmentation: type the `meta` payload we read in App.tsx's
// MutationCache / QueryCache handlers. Lets pages set
//   useMutation({ mutationFn, meta: { silent: true } })
// or { meta: { successMessage: 'Saved.' } } with full type safety.
import '@tanstack/react-query'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silent?: boolean }
    mutationMeta: { silent?: boolean; successMessage?: string }
  }
}
