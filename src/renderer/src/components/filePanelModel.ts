// Pure helpers for the file panel (tested without a DOM).

/** Text and code files open in the editor; everything else in its default app. */
const EDITOR_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'md', 'mdx', 'txt', 'log', 'css', 'scss', 'sass', 'less', 'html', 'htm',
  'vue', 'svelte', 'astro', 'py', 'pyi', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'fs',
  'php', 'swift', 'dart', 'lua', 'r', 'sql', 'graphql', 'gql', 'proto', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'xml', 'svg', 'csproj', 'sln', 'gradle', 'lock', 'tf', 'hcl', 'nix', 'zig', 'ex', 'exs'
])
const EDITOR_NAMES = new Set(['dockerfile', 'makefile', 'license', 'readme', 'procfile', 'gemfile', 'rakefile', 'jenkinsfile'])

export function opensInEditor(name: string): boolean {
  const lower = name.toLowerCase()
  if (EDITOR_NAMES.has(lower)) return true
  // Dotfiles like .gitignore, .env, .editorconfig are text.
  if (lower.startsWith('.') && !lower.slice(1).includes('.')) return true
  const dot = lower.lastIndexOf('.')
  return dot > 0 && EDITOR_EXTENSIONS.has(lower.slice(dot + 1))
}

/** Whether an entry passes the filter box (folders always stay, so the tree can be walked). */
export function matchesFilter(name: string, isDirectory: boolean, filter: string): boolean {
  const query = filter.trim().toLowerCase()
  return !query || isDirectory || name.toLowerCase().includes(query)
}

/** A path ready to type into a shell or an agent prompt: quoted when it has spaces. */
export function quotePath(path: string): string {
  return /[\s'"&()]/.test(path) ? `"${path.replace(/"/g, '\\"')}"` : path
}

/** The folder's own name, for the panel header ("C:\\work\\app" -> "app"). */
export function folderName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}
