/** Resume only internal dashboard paths; never turn login into an open redirect. */
export function loginReturnPath(
  from: { pathname?: string; search?: string } | undefined,
): string | null {
  const pathname = from?.pathname
  if (
    !pathname ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    [...pathname].some((character) => character.charCodeAt(0) <= 32 || character === '\\') ||
    pathname === '/login'
  )
    return null
  return `${pathname}${from?.search?.startsWith('?') ? from.search : ''}`
}
