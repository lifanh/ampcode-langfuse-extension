export interface LangfuseExtensionConfig {
  publicKey: string | undefined
  secretKey: string | undefined
  baseUrl: string | undefined
  environment: string | undefined
  release: string | undefined
  sampleRate: number
  captureInputs: boolean
  captureOutputs: boolean
  captureToolIo: boolean
  captureCwd: boolean
  redactionMode: 'strict' | 'off'
  debug: boolean
  localJsonlPath: string
}

export interface LangfusePluginSettings {
  langfuse?: {
    publicKey?: string
    secretKey?: string
    baseUrl?: string
    environment?: string
    release?: string
    sampleRate?: number | string
    captureInputs?: boolean | string
    captureOutputs?: boolean | string
    captureToolIo?: boolean | string
    captureCwd?: boolean | string
    redactionMode?: 'strict' | 'off'
    debug?: boolean | string
    localJsonlPath?: string
  }
  'amp.langfuse'?: LangfusePluginSettings['langfuse']
}

export interface ConfigStatus {
  langfuseExportEnabled: boolean
  missingLangfuseKeys: string[]
  message: string
}

export function createDefaultConfig(): LangfuseExtensionConfig {
  return {
    publicKey: undefined,
    secretKey: undefined,
    baseUrl: undefined,
    environment: undefined,
    release: undefined,
    sampleRate: 1,
    captureInputs: false,
    captureOutputs: false,
    captureToolIo: false,
    captureCwd: false,
    redactionMode: 'strict',
    debug: false,
    localJsonlPath: '.amp/langfuse/events.jsonl',
  }
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): LangfuseExtensionConfig {
  return configFromSources(env, {})
}

export function configFromSources(env: Record<string, string | undefined> = process.env, settings: LangfusePluginSettings = {}): LangfuseExtensionConfig {
  const defaults = createDefaultConfig()
  const langfuse = settings.langfuse ?? settings['amp.langfuse'] ?? {}
  return {
    ...defaults,
    publicKey: env.LANGFUSE_PUBLIC_KEY ?? langfuse.publicKey,
    secretKey: env.LANGFUSE_SECRET_KEY ?? langfuse.secretKey,
    baseUrl: env.LANGFUSE_BASE_URL ?? env.LANGFUSE_HOST ?? langfuse.baseUrl,
    environment: env.LANGFUSE_ENVIRONMENT ?? langfuse.environment,
    release: env.LANGFUSE_RELEASE ?? langfuse.release,
    sampleRate: parseSampleRate(env.LANGFUSE_SAMPLE_RATE ?? stringValue(langfuse.sampleRate), defaults.sampleRate),
    captureInputs: parseBoolean(env.LANGFUSE_CAPTURE_INPUTS ?? stringValue(langfuse.captureInputs), defaults.captureInputs),
    captureOutputs: parseBoolean(env.LANGFUSE_CAPTURE_OUTPUTS ?? stringValue(langfuse.captureOutputs), defaults.captureOutputs),
    captureToolIo: parseBoolean(env.LANGFUSE_CAPTURE_TOOL_IO ?? stringValue(langfuse.captureToolIo), defaults.captureToolIo),
    captureCwd: parseBoolean(env.LANGFUSE_CAPTURE_CWD ?? stringValue(langfuse.captureCwd), defaults.captureCwd),
    redactionMode: env.LANGFUSE_REDACTION_MODE === 'off' || langfuse.redactionMode === 'off' ? 'off' : defaults.redactionMode,
    debug: parseBoolean(env.LANGFUSE_DEBUG ?? stringValue(langfuse.debug), defaults.debug),
    localJsonlPath: env.LANGFUSE_LOCAL_JSONL_PATH ?? langfuse.localJsonlPath ?? defaults.localJsonlPath,
  }
}

export function describeConfigStatus(config: LangfuseExtensionConfig): ConfigStatus {
  const missingLangfuseKeys = [
    ...(!config.publicKey ? ['LANGFUSE_PUBLIC_KEY'] : []),
    ...(!config.secretKey ? ['LANGFUSE_SECRET_KEY'] : []),
    ...(!config.baseUrl ? ['LANGFUSE_BASE_URL'] : []),
  ]
  const langfuseExportEnabled = missingLangfuseKeys.length === 0
  return {
    langfuseExportEnabled,
    missingLangfuseKeys,
    message: langfuseExportEnabled
      ? `Langfuse export enabled for ${config.baseUrl}. Local JSONL telemetry enabled at ${config.localJsonlPath}.`
      : `Langfuse export disabled; missing ${missingLangfuseKeys.join(', ')}. Local JSONL telemetry enabled at ${config.localJsonlPath}.`,
  }
}

export function describeCaptureSettings(config: LangfuseExtensionConfig): string {
  return `Capture settings: inputs ${onOff(config.captureInputs)}, outputs ${onOff(config.captureOutputs)}, tool I/O ${onOff(config.captureToolIo)}, cwd ${onOff(config.captureCwd)}.`
}

function onOff(value: boolean): 'on' | 'off' {
  return value ? 'on' : 'off'
}

function stringValue(value: string | number | boolean | undefined): string | undefined {
  return value == null ? undefined : String(value)
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (value == null) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(1, Math.max(0, parsed))
}
