/**
 * Error text we are willing to put in a server log.
 *
 * A provider error message is not ours: it can echo back the request, and
 * the Qloo key travels in a header. A full key in a log is a leak; a
 * truncated one is the shape that actually tends to appear, so both are
 * covered. Over-redacting a diagnostic line costs nothing — the opposite
 * costs a key.
 */
const SECRET_ENV = ['QLOO_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']

/** Short enough to catch a truncated key, long enough not to match prose. */
const FRAGMENT = 8

const TOKEN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(x-api-key|api[-_]?key|authorization)\b\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}/gi,
]

export function redactSecrets(text: string): string {
  let out = text
  for (const name of SECRET_ENV) {
    const value = process.env[name]
    if (!value || value.length < FRAGMENT) continue
    // Any run of key-ish characters that starts with the key's opening
    // fragment, so a truncated key goes too.
    const head = value.slice(0, FRAGMENT).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`${head}[A-Za-z0-9._~+/=-]*`, 'g'), '[redacted]')
  }
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const separator = match.search(/[:=\s]/)
      return separator === -1 ? '[redacted]' : `${match.slice(0, separator + 1)} [redacted]`
    })
  }
  return out
}

export function safeMessage(error: unknown): string {
  if (typeof error === 'string') return redactSecrets(error)
  if (error instanceof Error) return redactSecrets(error.message)
  return 'unknown error'
}
