import { describe, expect, it } from 'vitest'
import type { AgentActivity } from '../fun/agentActivity'
import { critterRamp, renderScene, sceneFor, sceneLine, type SceneId } from './companionScenes'
import { CRITTER, CRITTER_H, CRITTER_W } from './critterSprites'

const SCENES: SceneId[] = ['typing', 'terminal', 'volcano', 'digging', 'thinking', 'waiting', 'approval', 'mail', 'party', 'storm', 'night']
const W = 64
const H = 96
const act = (kind: AgentActivity['kind'], target = ''): AgentActivity => ({ kind, target, at: 0 })
const bubble = (scene: SceneId, tick: number, activity?: AgentActivity | null, listening = false): string | undefined =>
  renderScene(scene, tick, W, H, { activity, listening }).texts.find((t) => t.kind === 'bubble')?.text

describe('sceneFor', () => {
  it('follows the agent state first', () => {
    expect(sceneFor('sleeping')).toBe('night')
    expect(sceneFor('error')).toBe('storm')
    expect(sceneFor('done')).toBe('party')
    expect(sceneFor('attention')).toBe('mail')
    expect(sceneFor('waiting')).toBe('waiting')
    expect(sceneFor('waiting', { kind: 'approval', title: 'Waiting for approval' })).toBe('approval')
  })

  it('acts out what the agent is really doing while it works', () => {
    expect(sceneFor('working', undefined, act('edit', 'app.ts'))).toBe('typing')
    expect(sceneFor('working', undefined, act('write', 'notes.md'))).toBe('typing')
    expect(sceneFor('working', undefined, act('run', 'git status'))).toBe('terminal')
    expect(sceneFor('working', undefined, act('test', 'npm test'))).toBe('volcano')
    expect(sceneFor('working', undefined, act('read', 'a.ts'))).toBe('digging')
    expect(sceneFor('working', undefined, act('search', 'foo'))).toBe('digging')
    expect(sceneFor('working', undefined, act('web'))).toBe('thinking')
    // No action shown yet: it is thinking, never a mini-game.
    expect(sceneFor('working')).toBe('thinking')
  })
})

describe('bubble lines', () => {
  it('say what the agent is doing, naming the file or command', () => {
    expect(bubble('typing', 0, act('edit', 'TerminalView.tsx'))).toBe('Editing TerminalView.tsx')
    expect(bubble('terminal', 0, act('run', 'git status'))).toBe('Running git status')
    expect(bubble('volcano', 0, act('test', 'npm test'))).toBe('Running npm test')
    expect(bubble('digging', 0, act('read', 'App.tsx'))).toBe('Reading App.tsx')
    expect(bubble('thinking', 0, null)).toBe('Thinking...')
  })

  it('slip in a short quip now and then', () => {
    expect(bubble('typing', 90, act('edit', 'a.ts'))).not.toBe('Editing a.ts')
  })

  it('use their own lines when the scene is about you or the session', () => {
    expect(sceneLine('waiting', 0)).toBe('Your turn!')
    expect(sceneLine('night', 0)).toMatch(/Session ended/)
  })

  it('say "Listening..." while you type, except asleep or in a storm', () => {
    expect(bubble('typing', 0, act('edit', 'a.ts'), true)).toBe('Listening...')
    expect(bubble('night', 0, null, true)).not.toBe('Listening...')
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

  it('leaves sky and ground out when asked (ASCII style)', () => {
    for (const scene of SCENES) {
      const pixels = renderScene(scene, 12, W, H, { backdrop: false }).pixels
      expect(pixels.some((p) => p === null), scene).toBe(true)
      expect(pixels, scene).not.toContain('sky0')
      expect(pixels, scene).not.toContain('grass')
      expect(pixels, scene).toContain('r2')
    }
  })

  it('draws the shaded critter with eyes in every scene', () => {
    for (const scene of SCENES) {
      const pixels = renderScene(scene, 12, W, H).pixels
      for (const tone of ['r1', 'r2', 'r3', 'line', 'ink']) expect(pixels, `${scene}/${tone}`).toContain(tone)
    }
  })

  it('puts the right props on stage', () => {
    const typing = renderScene('typing', 12, W, H).pixels
    expect(typing).toContain('key')
    expect(typing).toContain('screen')
    expect(renderScene('terminal', 12, W, H).pixels).toContain('screen')
    expect(renderScene('volcano', 12, W, H).pixels).toContain('lava')
    expect(renderScene('digging', 12, W, H).pixels).toContain('pit')
    expect(renderScene('thinking', 3, W, H).pixels).toContain('gold')
    expect(renderScene('storm', 0, W, H).pixels).toContain('rain')
    expect(renderScene('night', 12, W, H).pixels).toContain('moon')
  })

  it('types: keys flash and code appears on the screen over time', () => {
    const frames = new Set(Array.from({ length: 12 }, (_, tick) => renderScene('typing', tick, W, H).pixels.join(',')))
    expect(frames.size).toBeGreaterThan(6)
  })

  it('labels the prop with the file or command', () => {
    const label = renderScene('typing', 0, W, H, { activity: act('edit', 'app.ts') }).texts.find((t) => t.kind === 'label')
    expect(label?.text).toBe('app.ts')
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

  it('tolerates tiny sizes and odd ticks', () => {
    expect(() => renderScene('typing', -5, 1, 1)).not.toThrow()
    expect(renderScene('typing', 2.6, W, H)).toEqual(renderScene('typing', 2, W, H))
  })

  it("shows z's while asleep", () => {
    expect(renderScene('night', 9, W, H).texts.some((t) => t.kind === 'float' && /z/i.test(t.text))).toBe(true)
  })
})

describe('critter sprites (generated by art/critter/build.py)', () => {
  it('every pose has the declared size and only known tokens', () => {
    for (const [name, sprite] of Object.entries(CRITTER)) {
      expect(sprite.rows, name).toHaveLength(CRITTER_H)
      for (const row of sprite.rows) expect(row, name).toMatch(new RegExp(`^[.o0-4]{${CRITTER_W}}$`))
      const [ex, ey] = sprite.eyes
      expect(sprite.rows[ey][ex], name).not.toBe('.')
      expect(sprite.rows[ey][ex + sprite.eyeGap], name).not.toBe('.')
    }
  })
})

describe('critterRamp', () => {
  it('matches pixel-art-studio ramp() exactly, so the preview and the app agree', () => {
    expect(critterRamp([0xd9, 0x77, 0x57]).ramp).toEqual(['#822221', '#a04234', '#d97757', '#da9a75', '#f7cda6'])
    expect(critterRamp([0x3b, 0x82, 0xf6]).ramp).toEqual(['#071c94', '#1940ae', '#3b82f6', '#5da0e3', '#93d4fd'])
  })
})
