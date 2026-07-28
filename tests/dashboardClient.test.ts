import { describe, it, expect } from 'vitest'
import {
  decodeGetCurrentPeriodUsageResponse,
  fetchCurrentPeriodUsage,
  decodeGetFilteredUsageEventsResponse,
  fetchFilteredUsageEvents,
} from '../src/providers/cursor/dashboardClient'

// Real bytes captured from a live GetCurrentPeriodUsage response (Connect+proto,
// application/proto unary), base64-encoded. See docs/superpowers/specs/2026-07-28-cursor-usage-source-design.md
// for how this was captured and cross-verified against the equivalent JSON API response.
const FIXTURE_BASE64 =
  'CLjg6LjzMxC4qP21/TMajgEI/AQQ/AQg1Aoo0A8wADpjV2Ugd29yayB3aXRoIG1vZGVsIHByb3ZpZGVycyB0byBnaXZlIHlvdSBmcmVlIHVzYWdlIGJleW9uZCB3aGF0IHlvdSd2ZSBwdXJjaGFzZWQuIEFtb3VudHMgbWF5IHZhcnkuYc3MzMzMzA9AaWdmZmZmZgNAcUVERERERAxAIhUI878DEID0AxjzvwMgjTRCBHRlYW0oyAEwATomWW91J3ZlIHVzZWQgMzIlIG9mIHlvdXIgaW5jbHVkZWQgdXNhZ2VaK1lvdSd2ZSB1c2VkIDQlIG9mIHlvdXIgaW5jbHVkZWQgdG90YWwgdXNhZ2ViKVlvdSd2ZSB1c2VkIDIlIG9mIHlvdXIgaW5jbHVkZWQgQVBJIHVzYWdlagdkZWZhdWx0agxjb21wb3Nlci0xLjVqCmNvbXBvc2VyLTJqD2NvbXBvc2VyLTItZmFzdGoMY29tcG9zZXItMi41ahFjb21wb3Nlci0yLjUtZmFzdGoEdmVnYWoLdmVnYS1tZWRpdW1qCXZlZ2EtaGlnaGoKdmVnYS14aGlnaGoQdmVnYS1mYXN0LW1lZGl1bWoOdmVnYS1mYXN0LWhpZ2hqD3ZlZ2EtZmFzdC14aGlnaGoIZ3Jvay00LjVqE2N1cnNvci1ncm9rLTQuNS1sb3dqGGN1cnNvci1ncm9rLTQuNS1sb3ctZmFzdGoWY3Vyc29yLWdyb2stNC41LW1lZGl1bWobY3Vyc29yLWdyb2stNC41LW1lZGl1bS1mYXN0ahRjdXJzb3ItZ3Jvay00LjUtaGlnaGoZY3Vyc29yLWdyb2stNC41LWhpZ2gtZmFzdGoPZ3Jvay00LjUtbWVkaXVtahRncm9rLTQuNS1mYXN0LW1lZGl1bWoNZ3Jvay00LjUtaGlnaGoSZ3Jvay00LjUtZmFzdC1oaWdoag5ncm9rLTQuNS14aGlnaGoTZ3Jvay00LjUtZmFzdC14aGlnaGoKY29tcG9zZXItMQ=='

describe('decodeGetCurrentPeriodUsageResponse', () => {
  it('decodes real captured response bytes into the known usage values', () => {
    const buf = Buffer.from(FIXTURE_BASE64, 'base64')
    expect(decodeGetCurrentPeriodUsageResponse(buf)).toEqual({
      billingCycleEndMs: 1786014291000,
      totalSpendCents: 636,
      limitCents: 2000,
      limitType: 'team',
    })
  })
})

describe('fetchCurrentPeriodUsage', () => {
  it('sends the access token as a Bearer header and decodes a successful response', async () => {
    const buf = Buffer.from(FIXTURE_BASE64, 'base64')
    let receivedUrl = ''
    let receivedHeaders: Record<string, string> = {}
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      receivedUrl = url
      receivedHeaders = init?.headers as Record<string, string>
      return new Response(buf, { status: 200 })
    }) as typeof fetch

    const result = await fetchCurrentPeriodUsage('fake-token', fakeFetch)

    expect(receivedUrl).toBe('https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage')
    expect(receivedHeaders.Authorization).toBe('Bearer fake-token')
    expect(receivedHeaders['Content-Type']).toBe('application/proto')
    expect(result).toEqual({
      billingCycleEndMs: 1786014291000,
      totalSpendCents: 636,
      limitCents: 2000,
      limitType: 'team',
    })
  })

  it('returns null when the response is not ok', async () => {
    const fakeFetch = (async () => new Response('', { status: 401 })) as typeof fetch
    expect(await fetchCurrentPeriodUsage('fake-token', fakeFetch)).toBeNull()
  })
})

// Real bytes captured from a live GetFilteredUsageEvents response (empty request body,
// default page), trimmed to the total-count field plus the first 3 real events and
// re-wrapped as a standalone message — everything here is real captured bytes, just fewer
// of them. Field mapping (timestamp/model are certain; the token and cost fields are a
// plausible reading of the live response, not independently cross-verified against a second
// reference UI the way GetCurrentPeriodUsage's fields were) — see the design doc addendum.
const FILTERED_EVENTS_FIXTURE_BASE64 =
  'ENwbGpQBCLawsKf6MxIHZGVmYXVsdBgENZqZmT86AS1AAUoPCN+0ARCLASCAAS0H8JZAUgkyNTk4Mzk3ODFaCDEzMzA4NzgxbQAAAABwAYIBBG51bGyIAQCVAVafPkC6ASRiZWFlMDAwOS1mYWFjLTQxODktOGM0OC01ZjVkNTE3NmQxNGTCARFlbnRlcnByaXNlLWxlZ2FjeRqrAQiwmuye+jMSG0dQVC01LjYgU29sIChBdXRvIEJhbGFuY2VkKRgENZqZiUA6AS1AAUoSCAYQ/gEY1r4BIIm3AS3whYlBUgkyNTk4Mzk3ODFaCDEzMzA4NzgxbbPqmT9wAYIBBG51bGyIAQCVAZwkk0G6ASQ3ZDIzZTdhNS0zM2Y4LTQ3MTYtYjczNi1mZWNhMDI2NWViMTXCARFlbnRlcnByaXNlLWxlZ2FjeRqmAQjP3OWe+jMSG0dQVC01LjYgU29sIChBdXRvIEJhbGFuY2VkKRgENc3MTEA6AS1AAUoNCAMQYxiRnAEtQqBMQVIJMjU5ODM5NzgxWggxMzMwODc4MW2KjgA/cAGCAQRudWxsiAEAlQEqqVRBugEkZDE5NTY3NzEtM2YzZC00ZGU5LWI5ZjMtNWQ0NTY2NmZmMTBlwgERZW50ZXJwcmlzZS1sZWdhY3k='

describe('decodeGetFilteredUsageEventsResponse', () => {
  it('decodes real captured response bytes into a list of usage events', () => {
    const buf = Buffer.from(FILTERED_EVENTS_FIXTURE_BASE64, 'base64')
    expect(decodeGetFilteredUsageEventsResponse(buf)).toEqual([
      { timestampMs: 1785178363958, model: 'default', totalTokens: 23402, costCents: 120 },
      { timestampMs: 1785160469808, model: 'GPT-5.6 Sol (Auto Balanced)', totalTokens: 23693, costCents: 430 },
      { timestampMs: 1785160363599, model: 'GPT-5.6 Sol (Auto Balanced)', totalTokens: 102, costCents: 320 },
    ])
  })
})

describe('fetchFilteredUsageEvents', () => {
  it('sends the access token as a Bearer header and decodes a successful response', async () => {
    const buf = Buffer.from(FILTERED_EVENTS_FIXTURE_BASE64, 'base64')
    let receivedUrl = ''
    let receivedHeaders: Record<string, string> = {}
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      receivedUrl = url
      receivedHeaders = init?.headers as Record<string, string>
      return new Response(buf, { status: 200 })
    }) as typeof fetch

    const result = await fetchFilteredUsageEvents('fake-token', fakeFetch)

    expect(receivedUrl).toBe('https://api2.cursor.sh/aiserver.v1.DashboardService/GetFilteredUsageEvents')
    expect(receivedHeaders.Authorization).toBe('Bearer fake-token')
    expect(result).toHaveLength(3)
    expect(result![0]).toEqual({ timestampMs: 1785178363958, model: 'default', totalTokens: 23402, costCents: 120 })
  })

  it('returns null when the response is not ok', async () => {
    const fakeFetch = (async () => new Response('', { status: 401 })) as typeof fetch
    expect(await fetchFilteredUsageEvents('fake-token', fakeFetch)).toBeNull()
  })
})
