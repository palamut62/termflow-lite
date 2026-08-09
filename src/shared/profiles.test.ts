import { describe, expect, it } from 'vitest'
import { BUILTIN_PROFILES, mergeProfiles } from './profiles'

describe('mergeProfiles', () => {
  it('kullanıcı profili yoksa yerleşikleri döner', () => {
    expect(mergeProfiles([]).map((p) => p.id)).toEqual(BUILTIN_PROFILES.map((p) => p.id))
  })

  it('aynı id\'de kullanıcı profili yerleşiği ezer, sıra korunur', () => {
    const merged = mergeProfiles([{ id: 'codex', name: 'Benim Codex', command: 'codex.exe' }])
    const codex = merged.find((p) => p.id === 'codex')
    expect(codex?.name).toBe('Benim Codex')
    expect(merged).toHaveLength(BUILTIN_PROFILES.length)
  })

  it('yalnızca kullanıcıya ait profiller sona eklenir', () => {
    const merged = mergeProfiles([{ id: 'dev', name: 'Dev', command: 'tmux' }])
    expect(merged).toHaveLength(BUILTIN_PROFILES.length + 1)
    expect(merged[merged.length - 1].id).toBe('dev')
  })

  it('yerleşik CLI ajanlarının komutu boş, startupCommand ve rengi var', () => {
    for (const p of BUILTIN_PROFILES) {
      expect(p.command).toBe('')
      expect(p.startupCommand).toBeTruthy()
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
