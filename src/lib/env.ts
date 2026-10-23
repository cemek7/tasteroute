import 'server-only'

export type ServerEnv = {
  qlooBaseUrl: string
  qlooApiKey: string
  modelBaseUrl: string | undefined
  modelApiKey: string
  model: string
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

export function serverEnv(): ServerEnv {
  return {
    qlooBaseUrl: process.env.QLOO_API_BASE_URL ?? 'https://hackathon.api.qloo.com',
    qlooApiKey: required('QLOO_API_KEY'),
    modelBaseUrl: process.env.OPENAI_BASE_URL,
    modelApiKey: process.env.OPENROUTER_API_KEY ?? required('OPENAI_API_KEY'),
    model: process.env.TASTEROUTE_MODEL ?? 'openai/gpt-5-mini',
  }
}

export function hasModelAccess(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY)
}
