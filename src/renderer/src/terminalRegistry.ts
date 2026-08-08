// Routes batched PTY output from a single IPC listener to the right xterm
// instance. Terminals that are not currently mounted (minimized/offscreen)
// have no writer; their scrollback is rehydrated from the main-process buffer
// when they mount. (PRD §12)

type Writer = (data: string) => void

const writers = new Map<string, Writer>()
let started = false

function ensureStarted(): void {
  if (started) return
  started = true
  window.termflow.pty.onData((id, data) => {
    writers.get(id)?.(data)
  })
  window.termflow.pty.onExit((id) => {
    writers.get(id)?.('\r\n\x1b[90m[process exited]\x1b[0m\r\n')
  })
}

export function registerWriter(terminalId: string, writer: Writer): () => void {
  ensureStarted()
  writers.set(terminalId, writer)
  return () => {
    if (writers.get(terminalId) === writer) writers.delete(terminalId)
  }
}
