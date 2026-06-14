import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { JsonlTransport } from '../src/transport/jsonl'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('JSONL transport', () => {
  test('appends normalized events as newline-delimited JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amp-langfuse-'))
    dirs.push(dir)
    const path = join(dir, 'events.jsonl')
    const transport = new JsonlTransport(path)

    await transport.emit({
      agent: 'ampcode',
      plugin_name: 'ampcode-langfuse-extension',
      plugin_version: '0.0.0',
      event_type: 'session.start',
      timestamp: '2026-05-30T00:00:00.000Z',
      session_id: 'T-thread',
      run_id: 'T-thread:session',
      span_id: 'session:T-thread',
    })

    expect(await readFile(path, 'utf8')).toBe('{"agent":"ampcode","plugin_name":"ampcode-langfuse-extension","plugin_version":"0.0.0","event_type":"session.start","timestamp":"2026-05-30T00:00:00.000Z","session_id":"T-thread","run_id":"T-thread:session","span_id":"session:T-thread"}\n')
  })

  test('resolves relative paths from the workspace root instead of the plugin working directory', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'amp-langfuse-workspace-'))
    const pluginWorkingDirectory = join(workspaceRoot, '.amp/plugins')
    dirs.push(workspaceRoot)
    await mkdir(pluginWorkingDirectory, { recursive: true })

    const previousCwd = process.cwd()
    process.chdir(pluginWorkingDirectory)
    try {
      const transport = new JsonlTransport('.amp/langfuse/events.jsonl', { baseDirectory: workspaceRoot })

      await transport.emit({
        agent: 'ampcode',
        plugin_name: 'ampcode-langfuse-extension',
        plugin_version: '0.0.0',
        event_type: 'session.start',
        timestamp: '2026-05-30T00:00:00.000Z',
        session_id: 'T-thread',
        run_id: 'T-thread:session',
        span_id: 'session:T-thread',
      })
    } finally {
      process.chdir(previousCwd)
    }

    expect(await readFile(join(workspaceRoot, '.amp/langfuse/events.jsonl'), 'utf8')).toContain('"event_type":"session.start"')
  })
})
