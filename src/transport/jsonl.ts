import { mkdir, appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AgentTelemetryEvent } from '../telemetry/agent-telemetry-event'

export class JsonlTransport {
  constructor(private readonly path: string) {}

  async emit(event: AgentTelemetryEvent): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, `${JSON.stringify(event)}\n`, 'utf8')
  }

  async flush(): Promise<void> {
    // appendFile completes each write before resolving; no buffered work remains.
  }
}
