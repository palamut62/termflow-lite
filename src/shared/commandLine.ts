/** Split an argument editor value without splitting quoted paths or eating Windows slashes. */
export function splitCommandLine(value: string): string[] {
  const args: string[] = []
  let token = '', quote = '', started = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\' && quote !== "'") {
      let end = i
      while (value[end] === '\\') end++
      if (value[end] === '"') {
        const count = end - i
        token += '\\'.repeat(Math.floor(count / 2))
        if (count % 2) token += '"'
        else quote = quote === '"' ? '' : '"'
        i = end; started = true; continue
      }
    }
    if (quote) { if (ch === quote) quote = ''; else token += ch; started = true }
    else if (ch === '"' || ch === "'") { quote = ch; started = true }
    else if (/\s/.test(ch)) { if (started) args.push(token); token = ''; started = false }
    else { token += ch; started = true }
  }
  if (quote) throw new Error('Close the quote in the arguments field.')
  if (started) args.push(token)
  return args
}

export function formatArguments(args: string[]): string {
  return args.map(arg => !arg || /[\s"']/.test(arg) ? `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"` : arg).join(' ')
}
