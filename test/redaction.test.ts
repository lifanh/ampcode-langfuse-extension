import { describe, expect, test } from 'bun:test'

import { redactValue, relativePathMetadata } from '../src/redaction/redact'

describe('redaction', () => {
  test('redacts common secret-bearing fields and token-looking values recursively', () => {
    expect(redactValue({ Authorization: 'Bearer abc', nested: { token: 'sk-live-secret', safe: 'ok' }, text: 'password=hunter2' })).toEqual({
      Authorization: '[REDACTED]',
      nested: { token: '[REDACTED]', safe: 'ok' },
      text: 'password=[REDACTED]',
    })
  })

  test('stores repo-relative file metadata instead of absolute local paths', () => {
    expect(relativePathMetadata('/Users/alice/project/src/index.ts', '/Users/alice/project')).toEqual({ path: 'src/index.ts' })
  })
})
