import { describe, expect, test } from 'bun:test'

import { createAmpTelemetryAdapter } from '../src/adapter/amp-events'
import { createDefaultConfig } from '../src/config/env'
import { createRunKey } from '../src/adapter/ids'

describe('Amp telemetry adapter', () => {
  test('normalizes a prompt-only turn without capturing prompt text by default', () => {
    const adapter = createAmpTelemetryAdapter({ config: createDefaultConfig(), now: () => '2026-05-30T00:00:00.000Z' })

    const start = adapter.onAgentStart({ thread: { id: 'T-thread' }, id: 'msg-1', message: 'please read SECRET_TOKEN=abc123' })
    const end = adapter.onAgentEnd({ thread: { id: 'T-thread' }, id: 'msg-1', message: 'please read SECRET_TOKEN=abc123', status: 'done', messages: [] })

    expect(start).toMatchObject({
      agent: 'ampcode',
      plugin_name: 'ampcode-langfuse-extension',
      event_type: 'agent.start',
      session_id: 'T-thread',
      run_id: 'T-thread:msg-1',
      span_id: 'agent:T-thread:msg-1',
      status: 'running',
    })
    expect(start.input).toBeUndefined()
    expect(end).toMatchObject({ event_type: 'agent.end', status: 'done' })
    expect(end.parent_span_id).toBeUndefined()
  })

  test('captures redacted prompt text only when input capture is enabled', () => {
    const adapter = createAmpTelemetryAdapter({
      config: { ...createDefaultConfig(), captureInputs: true },
      now: () => '2026-05-30T00:00:00.000Z',
    })

    const event = adapter.onAgentStart({ thread: { id: 'T-thread' }, id: 'msg-1', message: 'use token sk-test-secret' })

    expect(event.input).toEqual({ message: 'use token [REDACTED]' })
  })

  test('correlates tool calls to the active agent turn and derives shell and file metadata', () => {
    const adapter = createAmpTelemetryAdapter({
      config: { ...createDefaultConfig(), captureToolIo: true },
      now: () => '2026-05-30T00:00:00.000Z',
      helpers: {
        shellCommandFromToolCall: () => ({ command: 'echo hello', dir: '/Users/alice/project' }),
        filesModifiedByToolCall: () => [{ toString: () => 'file:///Users/alice/project/src/index.ts' }],
        filePathFromURI: () => '/Users/alice/project/src/index.ts',
      },
      workspaceRoot: '/Users/alice/project',
    })

    adapter.onAgentStart({ thread: { id: 'T-thread' }, id: 'msg-1', message: 'edit file' })
    const event = adapter.onToolCall({ thread: { id: 'T-thread' }, toolUseID: 'tool-1', tool: 'shell_command', input: { command: 'echo hello' } })

    expect(event).toMatchObject({
      event_type: 'tool.call',
      run_id: createRunKey('T-thread', 'msg-1'),
      span_id: 'tool-1',
      parent_span_id: 'agent:T-thread:msg-1',
      tool_name: 'shell_command',
      command_kind: 'shell',
      input: { command: 'echo hello' },
      metadata: {
        shell: { command: 'echo hello' },
        files: [{ path: 'src/index.ts' }],
      },
    })
  })

  test('handles tool results without an active run safely', () => {
    const adapter = createAmpTelemetryAdapter({ config: createDefaultConfig(), now: () => '2026-05-30T00:00:00.000Z' })

    const event = adapter.onToolResult({ thread: { id: 'T-thread' }, toolUseID: 'tool-1', tool: 'Read', input: {}, status: 'error', error: 'failed' })

    expect(event.run_id).toBe('T-thread:unknown')
    expect(event.parent_span_id).toBeUndefined()
    expect(event.status).toBe('error')
  })
})
