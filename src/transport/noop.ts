import type { AgentTelemetryEvent } from '../telemetry/agent-telemetry-event'

export class NoopTransport {
  async emit(_event: AgentTelemetryEvent): Promise<void> {}
  async flush(): Promise<void> {}
}
