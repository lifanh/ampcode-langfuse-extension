import { describe, expect, test } from 'bun:test'

import { configFromSources, describeCaptureSettings, describeConfigStatus } from '../src/config/env'

describe('configuration UX', () => {
  test('loads Langfuse settings from Amp configuration while letting environment variables override secrets', () => {
    const config = configFromSources(
      { LANGFUSE_SECRET_KEY: 'env-override', LANGFUSE_CAPTURE_INPUTS: 'true' },
      {
        langfuse: {
          publicKey: 'pk-lf-config',
          secretKey: 'sk-lf-config',
          baseUrl: 'https://cloud.langfuse.com',
          captureInputs: false,
        },
      },
    )

    expect(config.publicKey).toBe('pk-lf-config')
    expect(config.secretKey).toBe('env-override')
    expect(config.baseUrl).toBe('https://cloud.langfuse.com')
    expect(config.captureInputs).toBe(true)
  })

  test('loads Langfuse settings from Amp namespaced workspace configuration', () => {
    const config = configFromSources(
      {},
      {
        'amp.langfuse': {
          publicKey: 'pk-lf-config',
          secretKey: 'workspace-secret',
          baseUrl: 'https://us.cloud.langfuse.com',
        },
      },
    )

    expect(config.publicKey).toBe('pk-lf-config')
    expect(config.secretKey).toBe('workspace-secret')
    expect(config.baseUrl).toBe('https://us.cloud.langfuse.com')
  })

  test('describes capture settings for command-palette status messages', () => {
    expect(describeCaptureSettings(configFromSources({}, {}))).toBe('Capture settings: inputs off, outputs off, tool I/O off, cwd off.')
    expect(describeCaptureSettings(configFromSources({}, { langfuse: { captureInputs: true, captureOutputs: true, captureToolIo: true, captureCwd: true } }))).toBe(
      'Capture settings: inputs on, outputs on, tool I/O on, cwd on.',
    )
  })

  test('describes the current setup without exposing secrets', () => {
    expect(describeConfigStatus(configFromSources({}, {}))).toEqual({
      langfuseExportEnabled: false,
      missingLangfuseKeys: ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL'],
      message: 'Langfuse export disabled; missing LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL. Local JSONL telemetry enabled at .amp/langfuse/events.jsonl.',
    })

    expect(describeConfigStatus(configFromSources({}, { langfuse: { publicKey: 'pk-lf-test', secretKey: 'sk-lf-test', baseUrl: 'https://cloud.langfuse.com' } }))).toEqual({
      langfuseExportEnabled: true,
      missingLangfuseKeys: [],
      message: 'Langfuse export enabled for https://cloud.langfuse.com. Local JSONL telemetry enabled at .amp/langfuse/events.jsonl.',
    })
  })
})
