/// <reference types="vite/client" />

// Injected by electron.vite.config.ts `define` from package.json at build time.
declare const __APP_VERSION__: string

// Chromium Local Font Access API (PRD §29 — sistem fontlarını listeleme).
// Yalnızca kullandığımız alanlar; API yoksa `'queryLocalFonts' in window` false.
interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

interface Window {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}
