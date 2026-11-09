import { describe, expect, it } from 'vitest'

import {
  BLOCKED_TAG_COLOR,
  BLOCKED_TAG_NAME,
  isBlockedTagName,
  isContactBlocked,
} from './blocked'

describe('isBlockedTagName', () => {
  it('matches the reserved name case-insensitively, ignoring padding', () => {
    expect(isBlockedTagName(BLOCKED_TAG_NAME)).toBe(true)
    expect(isBlockedTagName('blocked')).toBe(true)
    expect(isBlockedTagName('  BLOCKED  ')).toBe(true)
  })

  it('rejects other tags and empty input', () => {
    expect(isBlockedTagName('VIP')).toBe(false)
    expect(isBlockedTagName('Blocked lead')).toBe(false)
    expect(isBlockedTagName(null)).toBe(false)
    expect(isBlockedTagName(undefined)).toBe(false)
  })
})

describe('isContactBlocked', () => {
  it('is true when any assigned tag is the reserved Blocked tag', () => {
    expect(
      isContactBlocked([{ name: 'VIP' }, { name: BLOCKED_TAG_NAME }]),
    ).toBe(true)
  })

  it('is false without tags or with only other tags', () => {
    expect(isContactBlocked([])).toBe(false)
    expect(isContactBlocked(null)).toBe(false)
    expect(isContactBlocked(undefined)).toBe(false)
    expect(isContactBlocked([{ name: 'VIP' }])).toBe(false)
  })
})

describe('BLOCKED_TAG_COLOR', () => {
  it('uses the destructive red', () => {
    expect(BLOCKED_TAG_COLOR).toBe('#ef4444')
  })
})
