export type ProtoFieldValue =
  | { wireType: 0; varint: bigint }
  | { wireType: 1; bytes: Buffer }
  | { wireType: 2; bytes: Buffer }
  | { wireType: 5; bytes: Buffer }

export type ProtoFields = Map<number, ProtoFieldValue[]>

function readVarint(buf: Buffer, offset: number): [bigint, number] {
  let result = 0n
  let shift = 0n
  let pos = offset
  while (true) {
    if (pos >= buf.length) {
      throw new Error('truncated varint')
    }
    const byte = buf[pos]
    result |= BigInt(byte & 0x7f) << shift
    pos++
    if ((byte & 0x80) === 0) {
      break
    }
    shift += 7n
  }
  return [result, pos]
}

export function decodeProtoFields(buf: Buffer, start = 0, end: number = buf.length): ProtoFields {
  const fields: ProtoFields = new Map()
  let pos = start
  while (pos < end) {
    const [tag, afterTag] = readVarint(buf, pos)
    pos = afterTag
    const fieldNumber = Number(tag >> 3n)
    const wireType = Number(tag & 7n)

    let value: ProtoFieldValue
    if (wireType === 0) {
      const [v, afterV] = readVarint(buf, pos)
      value = { wireType: 0, varint: v }
      pos = afterV
    } else if (wireType === 1) {
      const fixedEnd = pos + 8
      if (fixedEnd > end) {
        throw new Error('truncated fixed64 field')
      }
      value = { wireType: 1, bytes: buf.subarray(pos, fixedEnd) }
      pos = fixedEnd
    } else if (wireType === 2) {
      const [len, afterLen] = readVarint(buf, pos)
      const lenNum = Number(len)
      const sliceEnd = afterLen + lenNum
      if (sliceEnd > end) {
        throw new Error('truncated length-delimited field')
      }
      value = { wireType: 2, bytes: buf.subarray(afterLen, sliceEnd) }
      pos = sliceEnd
    } else if (wireType === 5) {
      const fixedEnd = pos + 4
      if (fixedEnd > end) {
        throw new Error('truncated fixed32 field')
      }
      value = { wireType: 5, bytes: buf.subarray(pos, fixedEnd) }
      pos = fixedEnd
    } else {
      throw new Error(`unsupported protobuf wire type ${wireType}`)
    }

    const existing = fields.get(fieldNumber)
    if (existing) {
      existing.push(value)
    } else {
      fields.set(fieldNumber, [value])
    }
  }
  return fields
}

export function getVarintNumber(fields: ProtoFields, fieldNumber: number): number | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 0) {
    return null
  }
  return Number(values[0].varint)
}

export function getDouble(fields: ProtoFields, fieldNumber: number): number | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 1) {
    return null
  }
  return values[0].bytes.readDoubleLE(0)
}

export function getString(fields: ProtoFields, fieldNumber: number): string | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 2) {
    return null
  }
  return values[0].bytes.toString('utf-8')
}

export function getSubmessage(fields: ProtoFields, fieldNumber: number): ProtoFields | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 2) {
    return null
  }
  return decodeProtoFields(values[0].bytes)
}

export function getFloat(fields: ProtoFields, fieldNumber: number): number | null {
  const values = fields.get(fieldNumber)
  if (!values || values[0].wireType !== 5) {
    return null
  }
  return values[0].bytes.readFloatLE(0)
}

export function getRepeatedSubmessages(fields: ProtoFields, fieldNumber: number): ProtoFields[] {
  const values = fields.get(fieldNumber)
  if (!values) {
    return []
  }
  return values.filter((v) => v.wireType === 2).map((v) => decodeProtoFields(v.bytes))
}
