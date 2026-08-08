import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** Plugin ids reach the filesystem; every id-taking handler must validate. */

const harness = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => harness.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  net: { fetch: vi.fn() }
}))

import { createPluginHandlers, isValidPluginId } from './plugins'
import type { PluginRuntime } from '../../plugins/PluginRuntime'

const manifest = (id: string): Record<string, unknown> => ({
  schemaVersion: 1,
  id,
  name: 'Demo',
  version: '1.0.0',
  commands: [{ id: 'run', title: 'Run', command: 'echo hi' }]
})

let runtime: { activate: ReturnType<typeof vi.fn>; deactivate: ReturnType<typeof vi.fn> }
let handlers: ReturnType<typeof createPluginHandlers>

beforeEach(() => {
  harness.userData = mkdtempSync(join(tmpdir(), 'termflow-plugins-'))
  runtime = { activate: vi.fn(), deactivate: vi.fn() }
  handlers = createPluginHandlers(runtime as unknown as PluginRuntime, () => null)
})

afterEach(() => {
  rmSync(harness.userData, { recursive: true, force: true })
})

const BAD_IDS = [
  '../../evil',
  '..\\..\\evil',
  '..',
  'a/b',
  'a\\b',
  '/etc/passwd',
  'C:\\Windows\\System32\\config',
  '\\\\attacker\\share\\x',
  'UPPER',
  '',
  'a'.repeat(200),
  'x' // single char fails the >=2 char id rule
]

describe('isValidPluginId', () => {
  it.each(BAD_IDS)('rejects %j', (id) => {
    expect(isValidPluginId(id)).toBe(false)
  })

  it.each([null, undefined, 42, {}, []])('rejects non-string %j', (id) => {
    expect(isValidPluginId(id)).toBe(false)
  })

  it('accepts a normal id', () => {
    expect(isValidPluginId('termflow.git-essentials')).toBe(true)
  })
})

describe('plugin reload', () => {
  it('reloads a valid plugin', async () => {
    mkdirSync(handlers.pluginsDir, { recursive: true })
    writeFileSync(join(handlers.pluginsDir, 'demo.plugin.json'), JSON.stringify(manifest('demo.plugin')), 'utf-8')
    await handlers.reload('demo.plugin')
    expect(runtime.activate).toHaveBeenCalledTimes(1)
  })

  it.each(BAD_IDS)('refuses to reload traversal id %j', async (id) => {
    await expect(handlers.reload(id)).rejects.toThrow(/Plugin ID is invalid/)
    expect(runtime.activate).not.toHaveBeenCalled()
  })
})

describe('plugin delete / enable', () => {
  it.each(BAD_IDS)('refuses to delete %j', async (id) => {
    await expect(handlers.remove(id)).rejects.toThrow(/Plugin ID is invalid/)
  })

  it('deletes a valid plugin file', async () => {
    mkdirSync(handlers.pluginsDir, { recursive: true })
    const file = join(handlers.pluginsDir, 'demo.plugin.json')
    writeFileSync(file, JSON.stringify(manifest('demo.plugin')), 'utf-8')
    await handlers.remove('demo.plugin')
    expect(existsSync(file)).toBe(false)
  })

  it.each(BAD_IDS)('refuses to toggle %j', async (id) => {
    await expect(handlers.setEnabled(id, true)).rejects.toThrow(/Plugin state is invalid/)
  })

  it.each([['string', 'true'], ['number', 1], ['null', null], ['undefined', undefined]])(
    'refuses a %s enabled flag',
    async (_label, enabled) => {
      await expect(handlers.setEnabled('demo.plugin', enabled)).rejects.toThrow(/Plugin state is invalid/)
    }
  )

  it('persists the disabled state and deactivates', async () => {
    await handlers.setEnabled('demo.plugin', false)
    expect(runtime.deactivate).toHaveBeenCalledWith('demo.plugin')
    const listed = await handlers.list()
    expect(listed.find((p) => p.id === 'demo.plugin')).toBeUndefined()
  })
})

describe('plugin list', () => {
  it('returns the builtin plugins as enabled', async () => {
    const plugins = await handlers.list()
    expect(plugins.length).toBeGreaterThanOrEqual(4)
    expect(plugins.every((p) => p.enabled)).toBe(true)
  })

  it('marks a disabled builtin', async () => {
    await handlers.setEnabled('termflow.docker', false)
    const plugins = await handlers.list()
    expect(plugins.find((p) => p.id === 'termflow.docker')?.enabled).toBe(false)
  })

  it('skips corrupt plugin files instead of throwing', async () => {
    mkdirSync(handlers.pluginsDir, { recursive: true })
    writeFileSync(join(handlers.pluginsDir, 'broken.json'), '{not json', 'utf-8')
    await expect(handlers.list()).resolves.toBeInstanceOf(Array)
  })
})

describe('plugin save / registry', () => {
  it.each([
    ['null', null],
    ['array', []],
    ['string', 'manifest'],
    ['missing commands', { schemaVersion: 1, id: 'demo.plugin', name: 'x', version: '1.0.0' }],
    ['bad version', { ...manifest('demo.plugin'), version: 'latest' }],
    ['traversal id', manifest('../../evil')]
  ])('refuses to save a %s manifest', async (_label, value) => {
    await expect(handlers.save(value)).rejects.toThrow()
  })

  it.each([
    ['null entry', null],
    ['missing url', {}],
    ['non-string url', { packageUrl: 42 }]
  ])('refuses registry install with %s', async (_label, entry) => {
    await expect(handlers.registryInstall(entry)).rejects.toThrow(/invalid/i)
  })

  it('refuses a non-HTTPS registry package', async () => {
    await expect(handlers.registryInstall({ packageUrl: 'http://evil.test/p.tfplugin' })).rejects.toThrow(/HTTPS/)
    await expect(handlers.registryInstall({ packageUrl: 'file:///C:/evil.tfplugin' })).rejects.toThrow(/HTTPS/)
  })

  it('rejects a bundle whose hash does not match', async () => {
    const bundle = JSON.stringify({
      format: 'termflow-plugin-bundle',
      formatVersion: 1,
      manifest: manifest('demo.plugin'),
      files: {},
      sha256: 'deadbeef'
    })
    await expect(handlers.installBundle(bundle)).rejects.toThrow(/integrity/i)
  })

  it('rejects an oversized bundle', async () => {
    await expect(handlers.installBundle('x'.repeat(3 * 1024 * 1024))).rejects.toThrow(/too large/)
  })
})
