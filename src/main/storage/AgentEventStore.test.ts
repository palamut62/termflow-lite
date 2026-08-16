import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
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
})
