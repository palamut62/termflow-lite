import { app, utilityProcess, type UtilityProcess } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { PluginDiagnostic, TermFlowPluginManifest } from '../../shared/types'

export class PluginRuntime {
  private hosts = new Map<string, UtilityProcess>()
  private activeVersions = new Map<string, string>()
  private logs: PluginDiagnostic[] = []

  diagnostics(): PluginDiagnostic[] { return this.logs.slice(-300).reverse() }

  private record(pluginId: string, level: PluginDiagnostic['level'], message: string): void {
    this.logs.push({ pluginId, level, message, timestamp: new Date().toISOString() })
    if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500)
  }

  async activate(plugin: TermFlowPluginManifest, pluginDir: string): Promise<void> {
    if (this.hosts.has(plugin.id) && this.activeVersions.get(plugin.id) === plugin.version) return
    await this.deactivate(plugin.id)
    if (!plugin.entry) return
    const entry = join(pluginDir, plugin.entry)
    const code = await readFile(entry, 'utf-8')
    if (code.length > 512 * 1024) throw new Error('Plugin entry is too large')
    const hostPath = join(__dirname, 'pluginHost.js')
    const host = utilityProcess.fork(hostPath, [], { serviceName: `TermFlow Plugin: ${plugin.id}` })
    this.hosts.set(plugin.id, host)
    this.activeVersions.set(plugin.id, plugin.version)
    host.on('message', (message: unknown) => {
      const value = message as { type?: string; level?: PluginDiagnostic['level']; message?: string; capability?: string; commandId?: string }
      if (value.type === 'log') this.record(plugin.id, value.level || 'info', value.message || '')
      if (value.type === 'error') this.record(plugin.id, 'error', value.message || 'Plugin failed')
      if (value.type === 'request') {
        const granted = plugin.permissions?.includes(value.capability as never)
        this.record(plugin.id, granted ? 'info' : 'warning', granted ? `Requested ${value.capability}: ${value.commandId}` : `Blocked capability: ${value.capability}`)
      }
    })
    host.on('exit', (code) => { this.hosts.delete(plugin.id); if (code !== 0) this.record(plugin.id, 'error', `Plugin host exited with code ${code}`) })
    host.postMessage({ type: 'activate', pluginId: plugin.id, code, permissions: plugin.permissions || [], context: { appVersion: app.getVersion(), platform: process.platform } })
    this.record(plugin.id, 'info', 'Plugin host started')
  }

  async deactivate(pluginId: string): Promise<void> {
    const host = this.hosts.get(pluginId)
    if (!host) return
    host.postMessage({ type: 'deactivate' })
    setTimeout(() => { try { host.kill() } catch { /* already stopped */ } }, 500)
    this.hosts.delete(pluginId)
    this.activeVersions.delete(pluginId)
  }

  shutdown(): void { for (const host of this.hosts.values()) host.kill(); this.hosts.clear(); this.activeVersions.clear() }
}
