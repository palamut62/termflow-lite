import { parentPort } from 'electron'
import vm from 'vm'

type HostMessage = { type: 'activate'; pluginId: string; code: string; permissions: string[]; context: Record<string, unknown> } | { type: 'deactivate' }

let deactivate: (() => void | Promise<void>) | undefined

function send(value: Record<string, unknown>): void { parentPort?.postMessage(value) }

parentPort?.on('message', async (event) => {
  const message = event.data as HostMessage
  try {
    if (message.type === 'deactivate') {
      await deactivate?.()
      deactivate = undefined
      send({ type: 'deactivated' })
      return
    }
    const api = Object.freeze({
      context: Object.freeze(message.context),
      log: (text: unknown): void => send({ type: 'log', level: 'info', message: String(text).slice(0, 2000) }),
      warn: (text: unknown): void => send({ type: 'log', level: 'warning', message: String(text).slice(0, 2000) }),
      execute: (commandId: string): void => send({ type: 'request', capability: 'terminal:execute', commandId: String(commandId) })
    })
    const sandbox = Object.create(null) as Record<string, unknown>
    Object.assign(sandbox, { api, console: Object.freeze({ log: api.log, warn: api.warn, error: api.warn }), setTimeout, clearTimeout })
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
    const script = new vm.Script(`"use strict";let exports={};let module={exports};\n${message.code}\n;module.exports`, { filename: `${message.pluginId}/entry.js` })
    const exported = script.runInContext(context, { timeout: 1000 }) as { activate?: (pluginApi: unknown) => unknown; deactivate?: () => void | Promise<void> }
    if (typeof exported.activate !== 'function') throw new Error('Plugin entry must export activate(api)')
    await Promise.resolve(exported.activate(api))
    deactivate = typeof exported.deactivate === 'function' ? exported.deactivate : undefined
    send({ type: 'activated' })
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})
