import { describe, expect, it } from 'vitest'
import { editorFileUrl, pickEditorScheme } from './editorLink'

describe('editorLink', () => {
  it('builds a VS Code style file URL with line and column', () => {
    expect(editorFileUrl('vscode', 'C:\\Users\\me\\My App\\src\\a.ts', 42, 7)).toBe('vscode://file/C:/Users/me/My%20App/src/a.ts:42:7')
    expect(editorFileUrl('cursor', '/home/me/a.py', 3)).toBe('cursor://file/home/me/a.py:3')
  })

  it('escapes characters that would end the URL path', () => {
    expect(editorFileUrl('vscode', '/tmp/a#b?.ts', 1)).toBe('vscode://file/tmp/a%23b%3F.ts:1')
  })

  it('picks the first registered editor protocol', () => {
    expect(pickEditorScheme((s) => s === 'cursor' || s === 'windsurf')).toBe('cursor')
    expect(pickEditorScheme(() => false)).toBeNull()
  })
})
