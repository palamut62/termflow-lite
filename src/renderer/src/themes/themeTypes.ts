// ThemeColors artık shared/types.ts'te yaşıyor (settings.customTheme orada
// kullanılıyor); renderer tarafında eski import yolları bozulmasın diye
// buradan re-export edilir.
import type { ThemeColors } from '../../../shared/types'

export type { ThemeColors }

export interface Theme {
  id: string
  name: string
  colors: ThemeColors
}
