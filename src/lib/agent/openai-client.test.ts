import { describe, expect, it, vi } from 'vitest'
import { toChatClient } from './openai-client'

describe('toChatClient', () => {
  it('maps OpenAI tool calls onto our ChatToolCall shape', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'find_tags', arguments: '{"query":"cocktail"}' },
              },
            ],
          },
        },
      ],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'openai/gpt-5-mini')
    const out = await client.complete({ system: 'sys', messages: [], tools: [] })
    expect(out.toolCalls).toEqual([
      { id: 'call_1', name: 'find_tags', arguments: '{"query":"cocktail"}' },
    ])
  })

  it('returns no tool calls when the model replies with prose', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [{ message: { content: 'done' } }],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'openai/gpt-5-mini')
    expect((await client.complete({ system: 's', messages: [], tools: [] })).toolCalls).toEqual([])
  })

  it('puts the system prompt first and passes the model through', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [{ message: {} }],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'openai/gpt-5-nano')
    await client.complete({
      system: 'SYS',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    })
    const arg = create.mock.calls[0][0] as unknown as {
      model: string
      messages: { role: string; content: string }[]
    }
    expect(arg.model).toBe('openai/gpt-5-nano')
    expect(arg.messages[0]).toEqual({ role: 'system', content: 'SYS' })
  })

  it('sends tool results with their tool_call_id', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [{ message: {} }],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'm')
    await client.complete({
      system: 's',
      messages: [{ role: 'tool', content: '{"ok":true}', toolCallId: 'call_9' }],
      tools: [],
    })
    const arg = create.mock.calls[0][0] as unknown as {
      messages: Record<string, unknown>[]
    }
    expect(arg.messages[1]).toMatchObject({ role: 'tool', tool_call_id: 'call_9' })
  })

  it('omits the tools field entirely when there are no tools', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [{ message: {} }],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'm')
    await client.complete({ system: 's', messages: [], tools: [] })
    expect(create.mock.calls[0][0]).not.toHaveProperty('tools')
  })

  it('serialises an assistant turn with its tool_calls in OpenAI wire format', async () => {
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [{ message: {} }],
    }))
    const client = toChatClient({ chat: { completions: { create } } } as never, 'm')
    await client.complete({
      system: 's',
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_a', name: 'find_tags', arguments: '{"query":"x"}' }],
        },
        { role: 'tool', content: '{"ok":true}', toolCallId: 'call_a' },
      ],
      tools: [],
    })
    const arg = create.mock.calls[0][0] as unknown as {
      messages: Record<string, unknown>[]
    }
    expect(arg.messages[1]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_a',
          type: 'function',
          function: { name: 'find_tags', arguments: '{"query":"x"}' },
        },
      ],
    })
    expect(arg.messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_a' })
  })
})
