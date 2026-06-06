import type { PluginAPI } from '@ampcode/plugin'

import { createAmpTelemetryAdapter } from '../../src/adapter/amp-events'
import { configFromSources, describeCaptureSettings, describeConfigStatus, type LangfuseExtensionConfig, type LangfusePluginSettings } from '../../src/config/env'
import { JsonlTransport } from '../../src/transport/jsonl'
import { LangfuseTransport } from '../../src/transport/langfuse'
import type { AgentTelemetryEvent } from '../../src/telemetry/agent-telemetry-event'

interface TelemetryTransport {
  emit(event: AgentTelemetryEvent): Promise<void>
  flush(): Promise<void>
}

export default function (amp: PluginAPI) {
  let config = configFromSources()
  let adapter = createAdapter(config)
  let transports = createTransports(config)

  function createAdapter(nextConfig: LangfuseExtensionConfig) {
    return createAmpTelemetryAdapter({
      config: nextConfig,
      helpers: amp.helpers,
      workspaceRoot: process.cwd(),
    })
  }

  function createTransports(nextConfig: LangfuseExtensionConfig): TelemetryTransport[] {
    return [new JsonlTransport(nextConfig.localJsonlPath), new LangfuseTransport({ config: nextConfig })]
  }

  function applyConfig(nextConfig: LangfuseExtensionConfig): void {
    config = nextConfig
    adapter = createAdapter(nextConfig)
    transports = createTransports(nextConfig)
  }

  async function loadConfigFromAmp(): Promise<void> {
    const settings = (await amp.configuration.get()) as LangfusePluginSettings
    applyConfig(configFromSources(process.env, settings))
  }

  async function emit(event: AgentTelemetryEvent): Promise<void> {
    try {
      await Promise.all(transports.map((transport) => transport.emit(event)))
      if (config.debug) amp.logger.log('Langfuse telemetry event written', event.event_type, event.run_id)
    } catch (error) {
      amp.logger.log('Langfuse telemetry write failed; Amp execution continues', error)
    }
  }

  async function flush(): Promise<void> {
    try {
      await Promise.all(transports.map((transport) => transport.flush()))
    } catch (error) {
      amp.logger.log('Langfuse telemetry flush failed; Amp execution continues', error)
    }
  }

  amp.registerCommand('langfuse-status', { title: 'Status', category: 'Langfuse', description: 'Show Langfuse telemetry configuration status' }, async (ctx) => {
    await loadConfigFromAmp()
    await ctx.ui.notify(`${describeConfigStatus(config).message} ${describeCaptureSettings(config)}`)
  })

  amp.registerCommand('langfuse-configure-capture', { title: 'Configure Capture', category: 'Langfuse', description: 'Configure prompt, output, tool I/O, and cwd capture' }, async (ctx) => {
    await loadConfigFromAmp()
    const settings = (await amp.configuration.get()) as LangfusePluginSettings
    const current = settings.langfuse ?? settings['amp.langfuse'] ?? {}
    const next = {
      ...current,
      captureInputs: await selectBoolean(ctx, 'Capture user prompts?', config.captureInputs),
      captureOutputs: await selectBoolean(ctx, 'Capture assistant outputs?', config.captureOutputs),
      captureToolIo: await selectBoolean(ctx, 'Capture tool input/output?', config.captureToolIo),
      captureCwd: await selectBoolean(ctx, 'Capture shell working directories?', config.captureCwd),
    }
    await amp.configuration.update({ langfuse: next }, 'workspace')
    await loadConfigFromAmp()
    await ctx.ui.notify(describeCaptureSettings(config))
  })

  amp.registerCommand('langfuse-configure', { title: 'Configure', category: 'Langfuse', description: 'Configure Langfuse export for this workspace' }, async (ctx) => {
    await loadConfigFromAmp()
    const baseUrl = await ctx.ui.input({
      title: 'Langfuse base URL',
      helpText: 'For Langfuse Cloud EU use https://cloud.langfuse.com. US cloud uses https://us.cloud.langfuse.com.',
      initialValue: config.baseUrl ?? 'https://cloud.langfuse.com',
      submitButtonText: 'Next',
    })
    if (!baseUrl) return

    const publicKey = await ctx.ui.input({
      title: 'Langfuse public key',
      helpText: 'Starts with pk-lf-. Environment variables still override workspace configuration.',
      initialValue: config.publicKey ?? '',
      submitButtonText: 'Next',
    })
    if (!publicKey) return

    const secretKey = await ctx.ui.input({
      title: 'Langfuse secret key',
      helpText: 'Leave blank to keep an existing configured secret. Do not paste this key into chat.',
      submitButtonText: 'Save',
    })
    if (secretKey === undefined) return

    const settings = (await amp.configuration.get()) as LangfusePluginSettings
    const current = settings.langfuse ?? settings['amp.langfuse'] ?? {}
    await amp.configuration.update({
      langfuse: {
        ...current,
        baseUrl,
        publicKey,
        secretKey: secretKey || current.secretKey,
      },
    }, 'workspace')
    await loadConfigFromAmp()
    await ctx.ui.notify(describeConfigStatus(config).message)
  })

  amp.configuration.subscribe(() => {
    void loadConfigFromAmp()
  })

  void loadConfigFromAmp().then(() => {
    amp.logger.log('ampcode-langfuse-extension initialized;', describeConfigStatus(config).message)
  })

  amp.on('session.start', async (event) => {
    await emit(adapter.onSessionStart(event))
  })

  amp.on('agent.start', async (event) => {
    await emit(adapter.onAgentStart(event))
    return {}
  })

  amp.on('tool.call', async (event) => {
    await emit(adapter.onToolCall(event))
    return { action: 'allow' }
  })

  amp.on('tool.result', async (event) => {
    await emit(adapter.onToolResult(event))
  })

  amp.on('agent.end', async (event) => {
    await emit(adapter.onAgentEnd(event))
    await flush()
  })

  process.once('beforeExit', () => {
    void flush()
  })
}

async function selectBoolean(ctx: { ui: { select(options: { title: string; message?: string; initialValue?: string; options: string[] }): Promise<string | undefined> } }, title: string, current: boolean): Promise<boolean> {
  const selected = await ctx.ui.select({
    title,
    message: 'These settings can send sensitive prompt, response, tool, or local-path data to Langfuse. Strict redaction remains enabled unless disabled separately.',
    initialValue: current ? 'on' : 'off',
    options: ['off', 'on'],
  })
  return selected ? selected === 'on' : current
}
