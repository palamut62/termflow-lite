import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentEventStore } from './AgentEventStore'
import type { AgentEvent } from '../../shared/types'

let root = ''
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = '' })

function event(id: string): AgentEvent {
  return { id, tabId: 'tab-1', agent: 'codex', kind: 'activity', title: 'Running tests', createdAt: Date.now(), permissionMode: 'workspace' }
}

describe('AgentEventStore', () => {
  it('persists events as JSONL and reloads them in order', () => {
    root = mkdtempSync(join(tmpdir(), 'termflow-agent-events-'))
    const store = new AgentEventStore(root)
    store.append(event('one')); store.append(event('two'))
    expect(store.list().map((item) => item.id)).toEqual(['one', 'two'])
    expect(readFileSync(join(root, 'agent-events.jsonl'), 'utf8')).not.toContain('undefined')
  })

  it('keeps valid history when the final JSONL line is torn', () => {
    root = mkdtempSync(join(tmpdir(), 'termflow-agent-events-'))
    writeFileSync(join(root, 'agent-events.jsonl'), `${JSON.stringify(event('valid'))}\n{"id":`, 'utf8')
    expect(new AgentEventStore(root).list().map((item) => item.id)).toEqual(['valid'])
  })

  // Eşik, trim sonrası kalan boyutun (2000 satır × ~130B ≈ 260KB) ÜSTÜNDE
  // olmalı; altında kalırsa her append trim'i yeniden tetikler (O(n²) yazım).
  it('keeps the on-disk file bounded, keeping the newest events', () => {
    root = mkdtempSync(join(tmpdir(), 'termflow-agent-events-'))
    const threshold = 400_000
    const store = new AgentEventStore(root, threshold)
    const total = 4000
    for (let i = 0; i < total; i++) store.append(event(`event-${i}`))

    const listed = store.list(5000)
    expect(listed.length).toBeLessThanOrEqual(2000)
    expect(listed[listed.length - 1].id).toBe(`event-${total - 1}`)

    // Asıl sözleşme sınırsız büyümeyi durdurmak: her append sonrası dosya
    // eşiğin altında kalmalı (tek satırlık taşma payıyla). Satır sayısı son
    // trim'den bu yana geçici olarak 2000'i aşabilir — bu davranışın parçası.
    const { size } = statSync(join(root, 'agent-events.jsonl'))
    expect(size).toBeLessThanOrEqual(threshold + 1000)
    // Gerçek disk I/O'su (4000 append + trim yeniden yazımları) yavaş
    // makinelerde/runner'larda varsayılan 5sn'yi aşabilir.
  }, 30_000)
})
