/**
 * Browser's Fetch API treats certain headers as "forbidden" and silently drops them.
 * https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
 *
 * User-Agent is the most commonly customized forbidden header.
 * To work around this, we convert forbidden headers to proxy headers (X-Custom-*)
 * so they can pass through fetch(), and the main process restores them via
 * session.webRequest.onBeforeSendHeaders.
 */

const FORBIDDEN_HEADER_PROXY_MAP: Record<string, string> = {
  'user-agent': 'X-Custom-User-Agent'
}

/**
 * Convert forbidden headers in the given headers object to their proxy equivalents.
 * Non-forbidden headers are passed through unchanged.
 */
export function proxyForbiddenHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const proxyKey = FORBIDDEN_HEADER_PROXY_MAP[key.toLowerCase()]
    if (proxyKey) {
      result[proxyKey] = value
    } else {
      result[key] = value
    }
  }
  return result
}
