import OpenAI from 'openai'
import { serverEnv } from '../env'
import type { ChatClient } from './loop'

/**
 * The slice of the SDK this module uses. Narrowing it keeps the unit tests
 * free of a real client, and therefore free of an API key.
 */
type MinimalOpenAI = {
  chat: {
    completions: {
      create(body: Record<string, unknown>): Promise<{
        choices?: {
          message?: {
            content?: string | null
            tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[]
          }
        }[]
      }>
    }
  }
}

export function toChatClient(sdk: MinimalOpenAI, model: string): ChatClient {
  return {
    async complete({ system, messages, tools }) {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: system },
          ...messages.map((m) => {
            if (m.role === 'tool') {
              return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId }
            }
            if (m.role === 'assistant' && m.toolCalls?.length) {
              return {
                role: 'assistant' as const,
                content: m.content,
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function' as const,
                  function: { name: c.name, arguments: c.arguments },
                })),
              }
            }
            return { role: m.role, content: m.content }
          }),
        ],
      }
      if (tools.length > 0) {
        body.tools = tools
        body.tool_choice = 'auto'
      }

      const res = await sdk.chat.completions.create(body)
      const calls = res.choices?.[0]?.message?.tool_calls ?? []
      return {
        toolCalls: calls.map((c) => ({
          id: c.id,
          name: c.function?.name ?? '',
          arguments: c.function?.arguments ?? '{}',
        })),
      }
    },
  }
}

export function createOpenAIClient(): ChatClient {
  const env = serverEnv()
  const sdk = new OpenAI({
    apiKey: env.modelApiKey,
    ...(env.modelBaseUrl ? { baseURL: env.modelBaseUrl } : {}),
  })
  return toChatClient(sdk as unknown as MinimalOpenAI, env.model)
}
