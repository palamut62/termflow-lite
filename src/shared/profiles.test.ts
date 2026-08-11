import { describe, expect, it } from 'vitest'
import { BUILTIN_PROFILES, mergeProfiles, sshFromProfileId, sshProfileId } from './profiles'
import { DEFAULT_SETTINGS, type AppSettings } from './types'

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

  it('keeps the Claude Opus default when a legacy override omits model', () => {
    const merged = mergeProfiles([{ id: 'claude', name: 'Claude Custom', command: '', startupCommand: 'claude' }])
    expect(merged.find((profile) => profile.id === 'claude')?.model).toBe('opus')
  })
})

describe('sshFromProfileId', () => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    sshConnections: [{ id: 'srv1', name: 'Prod', host: 'prod.example.com', user: 'deploy' }]
  }

  it('ssh:<id> profil id\'sini bağlantıya çözer', () => {
    expect(sshFromProfileId(settings, sshProfileId('srv1'))?.name).toBe('Prod')
  })

  it('ssh öneki olmayan id\'ler için undefined döner', () => {
    expect(sshFromProfileId(settings, 'srv1')).toBeUndefined()
    expect(sshFromProfileId(settings, 'provider:deepseek')).toBeUndefined()
  })

  it('bilinmeyen bağlantı id\'si için undefined döner', () => {
    expect(sshFromProfileId(settings, 'ssh:yok')).toBeUndefined()
  })

  it('sshConnections tanımsızsa çökmez (eski ayar dosyaları)', () => {
    const legacy = { ...DEFAULT_SETTINGS, sshConnections: undefined as unknown as AppSettings['sshConnections'] }
    expect(sshFromProfileId(legacy, 'ssh:srv1')).toBeUndefined()
  })
})
