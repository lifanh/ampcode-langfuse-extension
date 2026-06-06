import { relative } from 'node:path'

const SECRET_KEY_RE = /authorization|cookie|token|secret|password|api[_-]?key|private[_-]?key/i
const SECRET_VALUE_RE = /(Bearer\s+)[^\s]+|\b(sk-[A-Za-z0-9_-]+)\b|\b(password\s*=\s*)[^\s&]+/gi

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY_RE.test(key) ? '[REDACTED]' : redactValue(entry),
      ]),
    )
  }
  return value
}

export function redactString(value: string): string {
  return value.replace(SECRET_VALUE_RE, (_match, bearerPrefix: string | undefined, skToken: string | undefined, passwordPrefix: string | undefined) => {
    if (bearerPrefix) return `${bearerPrefix}[REDACTED]`
    if (skToken) return '[REDACTED]'
    if (passwordPrefix) return `${passwordPrefix}[REDACTED]`
    return '[REDACTED]'
  })
}

export function relativePathMetadata(path: string, workspaceRoot?: string): { path: string } {
  if (!workspaceRoot) return { path: basenameOnly(path) }
  const relativePath = relative(workspaceRoot, path)
  if (relativePath.startsWith('..') || relativePath === '') return { path: basenameOnly(path) }
  return { path: relativePath }
}

function basenameOnly(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts.at(-1) || path
}
