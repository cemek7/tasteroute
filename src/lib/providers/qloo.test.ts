import { describe, expect, it, vi } from 'vitest'
import { QlooProvider, UnknownLocalityError } from './qloo'

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const provider = (fetchImpl: typeof fetch) =>
  new QlooProvider({ baseUrl: 'https://hackathon.example', apiKey: 'test-key', fetchImpl })

describe('QlooProvider', () => {
  it('sends the key in the X-Api-Key header and never in the URL', async () => {
    const spy = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).not.toContain('test-key')
      return ok({ success: true, results: { tags: [] } })
    })
    await provider(spy as unknown as typeof fetch).findTags('cocktail')
    const [, init] = spy.mock.calls[0] as unknown as [unknown, RequestInit]
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('test-key')
    expect(JSON.stringify(init.headers)).not.toContain('Bearer')
  })

  it('maps a Qloo place entity onto our Candidate shape', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'abc',
              name: 'Slate & Smoke',
              subtype: 'urn:entity:place',
              popularity: 0.79,
              tags: [
                {
                  id: 'urn:tag:genre:place:restaurant:cocktail_bar',
                  name: 'Cocktail Bar',
                  type: 'urn:tag:genre:place',
                  popularity: 0.99,
                },
              ],
              properties: {
                address: '21 Adeola Odeku St',
                geocode: { latitude: 6.4319, longitude: 3.4301 },
                business_rating: 4.4,
                is_closed: false,
              },
              query: { affinity: 0.86 },
            },
          ],
        },
      })

    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates[0]).toMatchObject({
      id: 'abc',
      name: 'Slate & Smoke',
      lat: 6.4319,
      lng: 3.4301,
      affinity: 0.86,
      address: '21 Adeola Odeku St',
      providerRank: 1,
    })
    expect(candidates[0].descriptors.rating).toBe(4.4)
    expect(candidates[0].providerRef).toEqual({ provider: 'qloo', entityId: 'abc' })
  })

  it('derives the category from the most specific genre tag', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'abc',
              name: 'Slate & Smoke',
              tags: [
                {
                  id: 'urn:tag:genre:place:restaurant:cocktail_bar',
                  name: 'Cocktail Bar',
                  type: 'urn:tag:genre:place',
                },
              ],
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates[0].category).toBe('cocktail_bar')
  })

  it('throws UnknownLocalityError on a 400 from an unmatched city', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: 'no locality found' }), { status: 400 })
    await expect(
      provider(fetchImpl as unknown as typeof fetch).suggestPlaces({ locality: 'Nowhereville' }),
    ).rejects.toBeInstanceOf(UnknownLocalityError)
  })

  it('gives UnknownLocalityError a message naming the city', async () => {
    const fetchImpl = async () => new Response('{}', { status: 400 })
    expect.assertions(1)
    await provider(fetchImpl as unknown as typeof fetch)
      .suggestPlaces({ locality: 'Nowhereville' })
      .catch((e: Error) => {
        expect(e.message).toContain('Nowhereville')
      })
  })

  it('requests explainability only when entities are seeded', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    const p = provider(fetchImpl as unknown as typeof fetch)
    await p.suggestPlaces({ locality: 'Lagos', tags: [{ id: 'urn:tag:x' }] })
    await p.suggestPlaces({ locality: 'Lagos', entities: ['abc'] })
    expect(urls[0]).not.toContain('feature.explainability')
    expect(urls[1]).toContain('feature.explainability=true')
  })

  it('caps take at the Qloo maximum of 50', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
      take: 500,
    })
    expect(urls[0]).toContain('take=50')
  })

  it('normalises Qloo explainability into our shape', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: { entities: [] },
        query: {
          explainability: {
            'signal.interests.entities': {
              effect_on_top3_recs: [{ entity_id: 'seed-1', avg_score: 1 }],
            },
          },
        },
      })
    const { explainability } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
      entities: ['seed-1'],
    })
    // appliesTo is empty here by design: only the caller still holds the
    // candidate list this block was computed against.
    expect(explainability?.signalEntities).toEqual([
      { entityId: 'seed-1', avgScore: 1, topN: 3, appliesTo: [] },
    ])
  })

  it('collects warnings so weak explainability is visible', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: { entities: [] },
        warnings: [{ type: 'Could not calculate explainability' }],
      })
    const { warnings } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(warnings[0]).toContain('explainability')
  })

  it('accepts the explicit nulls Qloo sends for absent properties', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'abc',
              name: 'Banana Island',
              references: null,
              tags: [],
              properties: {
                hours: null,
                good_for: null,
                keywords: null,
                live_music: null,
                cost_description: null,
                cuisine_description: null,
                ambience_description: null,
                business_rating: null,
                is_closed: null,
                address: null,
                geocode: null,
              },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].name).toBe('Banana Island')
    expect(candidates[0].address).toBeNull()
    expect(candidates[0].descriptors.goodFor).toBeUndefined()
    expect(candidates[0].isClosed).toBeNull()
  })

  it('flattens the good_for tag array Qloo actually returns into a readable phrase', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'abc',
              name: 'Eko Hotel',
              tags: [],
              properties: {
                good_for: [
                  {
                    id: 'urn:tag:ambience:place:large_group',
                    name: 'Large Group',
                    type: 'urn:tag:ambience:place',
                    weight: 1,
                  },
                  {
                    id: 'urn:tag:event:place:anniversary',
                    name: 'Anniversary',
                    type: 'urn:tag:event:place',
                    weight: 1,
                  },
                ],
              },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates[0].descriptors.goodFor).toBe('Large Group, Anniversary')
  })

  it('reads live_music as the boolean Qloo actually sends', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'a',
              name: 'Brass Room',
              tags: [],
              properties: { live_music: true, business_rating: 4 },
            },
            {
              entity_id: 'b',
              name: 'Quiet Cafe',
              tags: [],
              properties: { live_music: false },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates[0].descriptors.liveMusic).toBe('live music')
    expect(candidates[1].descriptors.liveMusic).toBeUndefined()
  })

  it('accepts an integer business_rating as well as a float', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            { entity_id: 'a', name: 'A', tags: [], properties: { business_rating: 4 } },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Lagos',
    })
    expect(candidates[0].descriptors.rating).toBe(4)
  })
})

describe('hard constraints reach Qloo as parameters', () => {
  it('sends the popularity ceiling when hidden gems were asked for', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
      constraints: { popularityMax: 0.5 },
    })
    expect(urls[0]).toContain('filter.popularity.max=0.5')
  })

  it('sends no popularity parameter when none was asked for', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({ locality: 'Abuja' })
    expect(urls[0]).not.toContain('popularity')
  })

  it('replaces the locality query with a point when a radius is given', async () => {
    const urls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url))
      return ok({ success: true, results: { entities: [] } })
    }
    await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
      constraints: { radius: { lat: 9.06, lng: 7.49, metres: 3000 } },
    })
    expect(urls[0]).toContain('filter.location.radius=3000')
    // URLSearchParams form-encodes the space as '+'. Verified against the
    // live host on 24 Oct: Qloo decodes '+' and '%20' identically here, so
    // both forms return the same places.
    expect(urls[0]).toContain('filter.location=POINT%287.49+9.06%29')
    expect(urls[0]).not.toContain('filter.location.query')
  })
})

describe('the richer fields Qloo already returns', () => {
  it('maps the image, rating, neighbourhood and descriptions onto the candidate', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'a',
              name: 'Bluecabana',
              tags: [],
              properties: {
                image: { url: 'https://images.qloo.com/i/abc-420x-auto.jpg' },
                images: [{ url: 'https://images.qloo.com/i/abc-1.jpg' }],
                business_rating: 4.3,
                neighborhood: 'Wuse 2',
                neighborhood_description: 'A busy strip. Lots of bars.',
                overall_description: 'Bluecabana is a courtyard bar. It gets loud after ten.',
                unique_selling_points: 'The courtyard. Also the grilled fish.',
                phone: '+234 000 0000',
              },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
    })
    const c = candidates[0]
    expect(c.media?.imageUrl).toContain('images.qloo.com')
    expect(c.media?.imageUrls).toHaveLength(1)
    expect(c.detail?.rating).toBe(4.3)
    expect(c.detail?.neighborhood).toBe('Wuse 2')
    expect(c.detail?.neighborhoodNote).toBe('A busy strip')
    expect(c.detail?.about).toBe('Bluecabana is a courtyard bar')
    expect(c.detail?.standout).toBe('The courtyard')
    expect(c.detail?.phone).toBe('+234 000 0000')
  })

  it('leaves media and detail fields undefined when Qloo sends nulls', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'b',
              name: 'Bare',
              tags: [],
              properties: {
                image: null,
                images: null,
                business_rating: null,
                neighborhood: null,
                overall_description: null,
              },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
    })
    expect(candidates[0].media?.imageUrl).toBeUndefined()
    expect(candidates[0].detail?.rating).toBeUndefined()
    expect(candidates[0].detail?.about).toBeUndefined()
  })
})

describe('the images array varies in shape', () => {
  it('accepts a bare string url alongside the object form', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            {
              entity_id: 'a',
              name: 'Mixed',
              tags: [],
              properties: {
                images: [
                  { url: 'https://images.qloo.com/i/one.jpg' },
                  'https://images.qloo.com/i/two.jpg',
                  { nourl: true },
                ],
              },
            },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
    })
    expect(candidates[0].media?.imageUrls).toEqual([
      'https://images.qloo.com/i/one.jpg',
      'https://images.qloo.com/i/two.jpg',
    ])
  })

  it('does not reject the whole response when an image entry is unusable', async () => {
    const fetchImpl = async () =>
      ok({
        success: true,
        results: {
          entities: [
            { entity_id: 'a', name: 'Odd', tags: [], properties: { images: [42, null] } },
          ],
        },
      })
    const { candidates } = await provider(fetchImpl as unknown as typeof fetch).suggestPlaces({
      locality: 'Abuja',
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].media?.imageUrls).toBeUndefined()
  })
})
