import { useEffect, useState } from 'react'
import { useTerminalStore } from '../store/terminalStore'
import { formatRate, outputSamples, sampleOutput, sparklinePoints } from '../fun/outputMeter'

const WIDTH = 46
const HEIGHT = 12

/** Aktif sekmenin son 32 saniyelik çıktı hızı; sessizken gizlenir. */
export function OutputPulse(): React.JSX.Element | null {
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const waiting = useTerminalStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.activity === 'waiting')
  const [samples, setSamples] = useState<number[]>([])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return
      sampleOutput(useTerminalStore.getState().tabs.map((t) => t.id))
      const id = useTerminalStore.getState().activeTabId
      setSamples(id ? [...outputSamples(id)] : [])
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setSamples(activeTabId ? [...outputSamples(activeTabId)] : [])
  }, [activeTabId])

  if (!samples.some((v) => v > 0)) return null
  const last = samples[samples.length - 1] ?? 0
  return (
    <span className={`status-item status-pulse${waiting ? ' status-pulse-waiting' : ''}`} title={`Output: ${formatRate(last)} (last 32 s)`}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <polyline points={sparklinePoints(samples, WIDTH, HEIGHT)} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
