import { describe, it, expect } from 'vitest'
import { decodeProtoFields, getVarintNumber, getString, getSubmessage } from '../src/providers/cursor/protobuf'

describe('decodeProtoFields', () => {
  it('decodes a varint field and a string field', () => {
    // field 1 (varint) = 150, field 2 (string) = "hi"
    const buf = Buffer.from([0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69])
    const fields = decodeProtoFields(buf)
    expect(getVarintNumber(fields, 1)).toBe(150)
    expect(getString(fields, 2)).toBe('hi')
  })

  it('returns null for a field that was not present', () => {
    const buf = Buffer.from([0x08, 0x01])
    const fields = decodeProtoFields(buf)
    expect(getVarintNumber(fields, 5)).toBeNull()
    expect(getString(fields, 5)).toBeNull()
    expect(getSubmessage(fields, 5)).toBeNull()
  })

  it('decodes a length-delimited submessage recursively', () => {
    // field 3 (submessage) containing: field 1 (varint) = 42
    const buf = Buffer.from([0x1a, 0x02, 0x08, 0x2a])
    const fields = decodeProtoFields(buf)
    const sub = getSubmessage(fields, 3)
    expect(sub).not.toBeNull()
    expect(getVarintNumber(sub!, 1)).toBe(42)
  })

  it('decodes a multi-byte varint correctly', () => {
    // field 1 (varint) = 1786014291000
    const buf = Buffer.from([0x08, 0xb8, 0xa8, 0xfd, 0xb5, 0xfd, 0x33])
    const fields = decodeProtoFields(buf)
    expect(getVarintNumber(fields, 1)).toBe(1786014291000)
  })
})
