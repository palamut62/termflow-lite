// ThemeColors artık shared/types.ts'te yaşıyor (settings.customTheme orada
// kullanılıyor); renderer tarafında eski import yolları bozulmasın diye
// buradan re-export edilir.
import type { ThemeColors, ThemeUiColors } from '../../../shared/types'

export type { ThemeColors, ThemeUiColors }

export interface Theme {
  id: string
  name: string
  colors: ThemeColors
  /** VS Code workbench renkleri; verilmezse paletten türetilir. */
  ui?: ThemeUiColors
}
