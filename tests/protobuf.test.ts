import { describe, it, expect } from 'vitest'
import {
  decodeProtoFields,
  getVarintNumber,
  getString,
  getSubmessage,
  getDouble
} from '../src/providers/cursor/protobuf'

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

  it('throws on truncated varint', () => {
    // field 1 with varint that has continuation bit set but no following byte
    const buf = Buffer.from([0x08, 0x80])
    expect(() => {
      decodeProtoFields(buf)
    }).toThrow('truncated varint')
  })

  it('throws on truncated length-delimited field', () => {
    // field 1, wire type 2 (length-delimited), declares 10 bytes but only 2 available
    const buf = Buffer.from([0x0a, 0x0a, 0x68, 0x69])
    expect(() => {
      decodeProtoFields(buf)
    }).toThrow('truncated length-delimited field')
  })

  it('decodes wire type 1 (double) field', () => {
    // field 1, wire type 1 (64-bit fixed): tag = (1 << 3) | 1 = 0x09
    // Double 3.14 in little-endian: 0x1f, 0x85, 0xeb, 0x51, 0xb8, 0x1e, 0x09, 0x40
    const buf = Buffer.from([0x09, 0x1f, 0x85, 0xeb, 0x51, 0xb8, 0x1e, 0x09, 0x40])
    const fields = decodeProtoFields(buf)
    const val = getDouble(fields, 1)
    expect(val).not.toBeNull()
    // Use closeTo for floating point comparison
    expect(val).toBeCloseTo(3.14, 5)
  })

  it('decodes wire type 5 (32-bit fixed) field structurally', () => {
    // field 1, wire type 5 (32-bit fixed): tag = (1 << 3) | 5 = 0x0d
    // 4 bytes: 0x01, 0x02, 0x03, 0x04
    const buf = Buffer.from([0x0d, 0x01, 0x02, 0x03, 0x04])
    const fields = decodeProtoFields(buf)
    const values = fields.get(1)
    expect(values).not.toBeNull()
    const value = values![0]
    if (value.wireType !== 5) {
      throw new Error('expected wireType 5')
    }
    expect(value.bytes.equals(Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBe(true)
  })
})
