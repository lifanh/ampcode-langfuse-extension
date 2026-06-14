import { mkdir, appendFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

import type { AgentTelemetryEvent } from '../telemetry/agent-telemetry-event'

interface JsonlTransportOptions {
  baseDirectory?: string
}

export class JsonlTransport {
  private readonly path: string

  constructor(path: string, options: JsonlTransportOptions = {}) {
    this.path = options.baseDirectory && !isAbsolute(path) ? resolve(options.baseDirectory, path) : path
  }

  async emit(event: AgentTelemetryEvent): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, `${JSON.stringify(event)}\n`, 'utf8')
  }

  async flush(): Promise<void> {
    // appendFile completes each write before resolving; no buffered work remains.
  }
}
