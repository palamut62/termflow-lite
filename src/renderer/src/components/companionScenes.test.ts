import { describe, expect, it } from 'vitest'
import { renderScene, sceneFor, sceneLine, type SceneId } from './companionScenes'

const SCENES: SceneId[] = ['garden', 'volcano', 'building', 'digging', 'waiting', 'approval', 'mail', 'party', 'storm', 'night']
const W = 64
const H = 96

describe('sceneFor', () => {
  it('follows the agent state first', () => {
    expect(sceneFor('sleeping')).toBe('night')
    expect(sceneFor('error')).toBe('storm')
    expect(sceneFor('done')).toBe('party')
    expect(sceneFor('attention')).toBe('mail')
    expect(sceneFor('waiting')).toBe('waiting')
    expect(sceneFor('waiting', { kind: 'approval', title: 'Waiting for approval' })).toBe('approval')
  })

  it('acts out the latest event while working', () => {
    expect(sceneFor('working', { kind: 'tool', title: 'Running tests', detail: 'npm test' })).toBe('volcano')
    expect(sceneFor('working', { kind: 'tool', title: 'Editing files' })).toBe('building')
    expect(sceneFor('working', { kind: 'activity', title: 'Inspecting project' })).toBe('digging')
    expect(sceneFor('working')).toBe('garden')
  })
})

describe('renderScene', () => {
  it('fills the whole requested pixel grid', () => {
    for (const scene of SCENES) {
      for (const [w, h] of [[W, H], [40, 60], [80, 200]]) {
        const frame = renderScene(scene, 12, w, h)
        expect(frame.width).toBe(w)
        expect(frame.height).toBe(h)
        expect(frame.pixels).toHaveLength(w * h)
        expect(frame.pixels.every((pixel) => pixel !== null), scene).toBe(true)
      }
    }
  })

  it('draws the critter in the agent color in every scene', () => {
    for (const scene of SCENES) expect(renderScene(scene, 12, W, H).pixels, scene).toContain('body')
  })

  it('animates every scene', () => {
    for (const scene of SCENES) {
      const frames = new Set(Array.from({ length: 30 }, (_, tick) => renderScene(scene, tick, W, H).pixels.join(',')))
      expect(frames.size, scene).toBeGreaterThan(1)
    }
  })

  it('is deterministic for the same tick', () => {
    for (const scene of SCENES) expect(renderScene(scene, 33, W, H)).toEqual(renderScene(scene, 33, W, H))
  })

  it('puts the scene props on stage', () => {
    expect(renderScene('volcano', 12, W, H).pixels).toContain('lava')
    expect(renderScene('building', 40, W, H).pixels).toContain('brick')
    expect(renderScene('digging', 12, W, H).pixels).toContain('pit')
    expect(renderScene('storm', 0, W, H).pixels).toContain('rain')
    expect(renderScene('night', 12, W, H).pixels).toContain('moon')
    expect(renderScene('party', 12, W, H).pixels.filter((p) => ['red', 'gold', 'green', 'blue', 'pink', 'cyan'].includes(p as string)).length).toBeGreaterThan(5)
  })

  it('always has a speech bubble, plus the command on the volcano', () => {
    for (const scene of SCENES) expect(renderScene(scene, 0, W, H).texts.some((t) => t.kind === 'bubble' && t.text.length > 0), scene).toBe(true)
    const volcano = renderScene('volcano', 0, W, H, { title: 'Running tests', detail: 'npm test' })
    expect(volcano.texts.find((t) => t.kind === 'label')?.text).toBe('npm test')
  })

  it('shows z\'s while asleep', () => {
    expect(renderScene('night', 9, W, H).texts.some((t) => t.kind === 'float' && /z/i.test(t.text))).toBe(true)
  })

  it('tolerates tiny sizes and odd ticks', () => {
    expect(() => renderScene('garden', -5, 1, 1)).not.toThrow()
    expect(renderScene('garden', 2.6, W, H)).toEqual(renderScene('garden', 2, W, H))
  })
})

describe('sceneLine', () => {
  it('rotates through lines and fills in the command', () => {
    expect(sceneLine('volcano', 0)).not.toBe(sceneLine('volcano', 70))
    expect(sceneLine('volcano', 70, { detail: 'pnpm vitest' })).toContain('pnpm vitest')
  })
})
