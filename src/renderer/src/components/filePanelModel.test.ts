import { describe, expect, it } from 'vitest'
import { folderName, matchesFilter, opensInEditor, quotePath } from './filePanelModel'

describe('opensInEditor', () => {
  it('sends code and text to the editor', () => {
    for (const name of ['app.ts', 'App.TSX', 'README.md', 'package.json', '.gitignore', '.env', 'Dockerfile', 'build.ps1', 'run.bat']) expect(opensInEditor(name)).toBe(true)
  })

  it('leaves documents, images and programs to their default app', () => {
    for (const name of ['report.pdf', 'photo.png', 'sheet.xlsx', 'setup.exe', 'archive.zip', 'noext']) expect(opensInEditor(name)).toBe(false)
  })
})

describe('matchesFilter', () => {
  it('matches names case-insensitively and always keeps folders', () => {
    expect(matchesFilter('FilePanel.tsx', false, 'panel')).toBe(true)
    expect(matchesFilter('App.tsx', false, 'panel')).toBe(false)
    expect(matchesFilter('src', true, 'panel')).toBe(true)
    expect(matchesFilter('App.tsx', false, '  ')).toBe(true)
  })
})

describe('quotePath / folderName', () => {
  it('quotes only when needed', () => {
    expect(quotePath('C:\\work\\app.ts')).toBe('C:\\work\\app.ts')
    expect(quotePath('C:\\My Files\\a.ts')).toBe('"C:\\My Files\\a.ts"')
  })

  it('names the folder', () => {
    expect(folderName('C:\\work\\termflow-lite\\')).toBe('termflow-lite')
    expect(folderName('/home/u/app')).toBe('app')
  })
})
