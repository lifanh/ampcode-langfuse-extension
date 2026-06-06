import { describe, expect, test } from 'bun:test'

import { createDefaultConfig } from '../src/config/env'
import { LangfuseTransport } from '../src/transport/langfuse'
import type { AgentTelemetryEvent } from '../src/telemetry/agent-telemetry-event'

function event(fields: Partial<AgentTelemetryEvent>): AgentTelemetryEvent {
  return {
    agent: 'ampcode',
    plugin_name: 'ampcode-langfuse-extension',
    plugin_version: '0.0.0',
    event_type: 'agent.start',
    timestamp: '2026-05-30T00:00:00.000Z',
    session_id: 'T-thread',
    run_id: 'T-thread:msg-1',
    span_id: 'agent:T-thread:msg-1',
    ...fields,
  }
}

describe('Langfuse transport', () => {
  test('posts a completed Amp turn as one Langfuse ingestion batch', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    const transport = new LangfuseTransport({
      config: {
        ...createDefaultConfig(),
        publicKey: 'pk-lf-test',
        secretKey: 'sk-lf-test',
        baseUrl: 'https://cloud.langfuse.com',
        environment: 'development',
        release: '0.1.0',
      },
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} })
        return new Response(JSON.stringify({ successes: [] }), { status: 207 })
      },
    })

    await transport.emit(event({ event_type: 'agent.start', status: 'running', input: { message: 'hello' } }))
    await transport.emit(event({
      event_type: 'tool.call',
      timestamp: '2026-05-30T00:00:01.000Z',
      span_id: 'tool-1',
      parent_span_id: 'agent:T-thread:msg-1',
      tool_name: 'Read',
      status: 'running',
      metadata: { files: [{ path: 'README.md' }] },
    }))
    await transport.emit(event({
      event_type: 'tool.result',
      timestamp: '2026-05-30T00:00:02.000Z',
      span_id: 'tool-1',
      parent_span_id: 'agent:T-thread:msg-1',
      tool_name: 'Read',
      status: 'done',
    }))

    expect(requests).toHaveLength(0)

    await transport.emit(event({ event_type: 'agent.end', timestamp: '2026-05-30T00:00:03.000Z', status: 'done', output: { messages: [] } }))

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://cloud.langfuse.com/api/public/ingestion')
    expect(requests[0]?.init.headers).toEqual({
      Authorization: `Basic ${btoa('pk-lf-test:sk-lf-test')}`,
      'Content-Type': 'application/json',
    })

    const payload = JSON.parse(String(requests[0]?.init.body))
    expect(payload.batch).toEqual([
      {
        id: 'trace-create:T-thread:msg-1',
        type: 'trace-create',
        timestamp: '2026-05-30T00:00:00.000Z',
        body: {
          id: 'T-thread:msg-1',
          name: 'ampcode.agent',
          sessionId: 'T-thread',
          input: { message: 'hello' },
          output: { messages: [] },
          release: '0.1.0',
          environment: 'development',
          metadata: { agent: 'ampcode', plugin: 'ampcode-langfuse-extension', pluginVersion: '0.0.0' },
        },
      },
      {
        id: 'span-create:agent:T-thread:msg-1',
        type: 'span-create',
        timestamp: '2026-05-30T00:00:00.000Z',
        body: {
          id: 'agent:T-thread:msg-1',
          traceId: 'T-thread:msg-1',
          name: 'agent',
          startTime: '2026-05-30T00:00:00.000Z',
          endTime: '2026-05-30T00:00:03.000Z',
          input: { message: 'hello' },
          output: { messages: [] },
          metadata: { eventType: 'agent.end', status: 'done' },
        },
      },
      {
        id: 'span-create:tool-1',
        type: 'span-create',
        timestamp: '2026-05-30T00:00:01.000Z',
        body: {
          id: 'tool-1',
          traceId: 'T-thread:msg-1',
          parentObservationId: 'agent:T-thread:msg-1',
          name: 'tool.Read',
          startTime: '2026-05-30T00:00:01.000Z',
          endTime: '2026-05-30T00:00:02.000Z',
          metadata: { eventType: 'tool.result', status: 'done', files: [{ path: 'README.md' }] },
        },
      },
    ])
  })

  test('does not send without Langfuse credentials', async () => {
    let calls = 0
    const transport = new LangfuseTransport({
      config: createDefaultConfig(),
      fetch: async () => {
        calls += 1
        return new Response('{}', { status: 207 })
      },
    })

    await transport.emit(event({ event_type: 'agent.start' }))
    await transport.emit(event({ event_type: 'agent.end', status: 'done' }))
    await transport.flush()

    expect(calls).toBe(0)
  })
})
