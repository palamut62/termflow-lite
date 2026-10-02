// TermFlow Lite site: hero demo + latest release links.
(() => {
  'use strict'

  const REPO = 'palamut62/termflow-lite'
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ------------------------------------------------------------------ *
   * Latest release and stars (falls back to the static 1.11.0 links)
   * ------------------------------------------------------------------ */
  const ASSET_PATTERNS = {
    exe: /-x64\.exe$/,
    zip: /-x64\.zip$/,
    appimage: /\.AppImage$/,
    deb: /\.deb$/
  }

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((release) => {
      const version = String(release.tag_name || '').replace(/^v/, '')
      if (!/^\d+\.\d+\.\d+$/.test(version)) return
      for (const [kind, pattern] of Object.entries(ASSET_PATTERNS)) {
        const asset = (release.assets || []).find((a) => pattern.test(a.name))
        if (!asset || !String(asset.browser_download_url).startsWith(`https://github.com/${REPO}/releases/download/`)) continue
        document.querySelectorAll(`[data-dl="${kind}"]`).forEach((a) => (a.href = asset.browser_download_url))
        document.querySelectorAll(`[data-file="${kind}"]`).forEach((el) => (el.textContent = asset.name))
      }
      document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = `Version ${version}`))
      document.querySelectorAll('[data-version-sentence]').forEach((el) => (el.textContent = `Version ${version}`))
      document.querySelectorAll('[data-version-short]').forEach((el) => (el.textContent = version))
      if (String(release.html_url).startsWith(`https://github.com/${REPO}/releases/`)) {
        document.querySelectorAll('[data-release-notes]').forEach((a) => (a.href = release.html_url))
      }
      const date = release.published_at ? new Date(release.published_at) : null
      if (date) {
        const label = date.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })
        document.querySelectorAll('[data-release-date]').forEach((el) => (el.textContent = `released ${label}`))
      }
    })
    .catch(() => {})

  fetch(`https://api.github.com/repos/${REPO}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((repo) => {
      const stars = Number(repo.stargazers_count)
      if (!Number.isFinite(stars) || stars < 1) return
      const label = stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars)
      document.querySelectorAll('[data-stars]').forEach((el) => {
        el.textContent = `${label} stars`
        el.hidden = false
      })
      document.querySelectorAll('[data-stars-big]').forEach((el) => (el.textContent = `${label} stars`))
    })
    .catch(() => {})

  /* ------------------------------------------------------------------ *
   * Hero demo
   * ------------------------------------------------------------------ */
  const app = document.getElementById('demo')
  if (!app) return
  const linesEl = app.querySelector('[data-lines]')
  const pane = app.querySelector('[data-pane="pwsh"]')
  const fx = app.querySelector('[data-fx]')
  const flash = app.querySelector('[data-flash]')
  const dot = app.querySelector('[data-dot="pwsh"]')
  const pulse = app.querySelector('[data-pulse]')
  const mascot = document.querySelector('.mascot')
  const eyes = document.querySelector('.mascot-eyes')

  const PROMPT = 'PS C:\\dev\\acme-api> '
  let cursorEffect = 'blaze'
  let run = 0

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms))

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  /** PowerShell-like colouring: command yellow, flags dim, strings cyan. */
  function highlight(cmd) {
    const parts = cmd.split(/(\s+)/)
    let first = true
    return parts
      .map((part) => {
        if (/^\s+$/.test(part) || part === '') return part
        const safe = escapeHtml(part)
        if (first) {
          first = false
          return `<span class="c-yel">${safe}</span>`
        }
        if (part.startsWith('-')) return `<span class="c-dim">${safe}</span>`
        if (/^["']/.test(part)) return `<span class="c-cyan">${safe}</span>`
        return safe
      })
      .join('')
  }

  function addLine(html = '', cls = '') {
    const ln = document.createElement('div')
    ln.className = `ln ${cls}`.trim()
    ln.innerHTML = html || ' '
    linesEl.appendChild(ln)
    trim()
    return ln
  }

  /** Keep the newest lines visible, like a scrolling terminal. */
  function trim() {
    const max = pane.clientHeight - 28
    while (linesEl.scrollHeight > max && linesEl.firstChild) linesEl.firstChild.remove()
  }

  let cursorEl = null
  function placeCursor(line) {
    cursorEl?.remove()
    cursorEl = document.createElement('span')
    cursorEl.className = 'cursor'
    line.appendChild(cursorEl)
    moveFx()
  }

  async function typeCommand(token, line, cmd, { suggestion } = {}) {
    app.classList.add('typing')
    let typed = ''
    for (const ch of cmd) {
      if (token !== run) return false
      typed += ch
      line.innerHTML = `${escapeHtml(PROMPT)}${highlight(typed)}`
      placeCursor(line)
      await sleep(45 + Math.random() * 70)
    }
    if (suggestion) {
      const ghost = document.createElement('span')
      ghost.className = 'c-ghost'
      ghost.textContent = suggestion
      line.appendChild(ghost)
      const hint = document.createElement('span')
      hint.className = 'key-hint'
      hint.textContent = '→ to accept'
      line.appendChild(hint)
      // The cursor sits before the grey suggestion, as in the app.
      line.insertBefore(cursorEl, ghost)
      app.classList.remove('typing')
      await sleep(1700)
      if (token !== run) return false
      typed += suggestion
      line.innerHTML = `${escapeHtml(PROMPT)}${highlight(typed)}`
      placeCursor(line)
      await sleep(500)
    }
    app.classList.remove('typing')
    await sleep(350)
    return token === run
  }

  /** One command block: prompt + output, then the status line and badge. */
  async function block(token, cmd, output, result, opts = {}) {
    const prompt = addLine(escapeHtml(PROMPT))
    placeCursor(prompt)
    await sleep(opts.pause ?? 600)
    if (!(await typeCommand(token, prompt, cmd, opts))) return false
    cursorEl?.remove()
    const blockLines = [prompt]
    prompt.classList.add('gut', 'gut-run')
    dot.classList.add('is-running')
    const started = performance.now()
    for (const [html, delay] of output) {
      await sleep(delay)
      if (token !== run) return false
      const ln = addLine(html, 'gut gut-run')
      blockLines.push(ln)
      placeCursor(ln)
      cursorEl.remove()
      bump(html.length)
    }
    await sleep(opts.tail ?? 120)
    if (token !== run) return false
    dot.classList.remove('is-running')
    const status = result.exit === 0 ? 'pass' : 'fail'
    for (const ln of blockLines) {
      if (!ln.isConnected) continue
      ln.classList.remove('gut-run')
      ln.classList.add(`gut-${status}`)
    }
    const elapsed = result.ms ?? performance.now() - started
    if (status === 'fail' || elapsed >= 2000) {
      const badge = document.createElement('span')
      badge.className = `badge badge-${status}`
      badge.textContent = status === 'pass' ? `✓ ${(elapsed / 1000).toFixed(1)}s` : `✗ ${result.exit}  ${Math.round(elapsed)}ms`
      prompt.appendChild(badge)
    }
    react(status)
    return true
  }

  function react(status) {
    if (reduceMotion) return
    flash.className = 'tab-flash'
    void flash.offsetWidth
    flash.classList.add(status === 'pass' ? 'is-pass' : 'is-fail')
    mascot.classList.remove('is-happy', 'is-sad')
    void mascot.offsetWidth
    mascot.classList.add(status === 'pass' ? 'is-happy' : 'is-sad')
    clearTimeout(react.timer)
    react.timer = setTimeout(() => mascot.classList.remove('is-happy', 'is-sad'), status === 'pass' ? 900 : 1600)
  }

  const TEST_OUTPUT = [
    ['', 220],
    ['<span class="c-dim">&gt;</span> acme-api@2.4.0 test', 120],
    ['<span class="c-dim">&gt;</span> node --test', 80],
    ['', 200],
    ['<span class="c-grn">✓ adds tax to the basket</span> <span class="c-dim">(1.5ms)</span>', 260],
    ['<span class="c-grn">✓ handles an empty basket</span> <span class="c-dim">(0.2ms)</span>', 90],
    ['<span class="c-grn">✓ settles the invoice queue</span> <span class="c-dim">(2306ms)</span>', 2300],
    ['<span class="c-blue">ℹ</span> tests 3  pass 3  fail 0', 90]
  ]

  async function play() {
    const token = ++run
    linesEl.textContent = ''
    for (const el of app.querySelectorAll('.badge')) el.remove()
    if (reduceMotion) return renderStatic()
    if (!(await block(token, 'git status -sb', [
      ['## <span class="c-grn">main</span>', 140],
      [' <span class="c-red">M</span> src/price.js', 60]
    ], { exit: 0, ms: 140 }, { pause: 500 }))) return
    if (!(await block(token, 'npm test', TEST_OUTPUT, { exit: 0, ms: 4100 }))) return
    if (!(await block(token, 'git push', [
      ['<span class="c-red">fatal: No configured push destination.</span>', 180],
      ['Either specify the URL or add a remote with git remote add.', 40]
    ], { exit: 128, ms: 190 }))) return
    const last = addLine(escapeHtml(PROMPT))
    placeCursor(last)
    await sleep(900)
    if (token !== run) return
    await typeCommand(token, last, 'npm t', { suggestion: 'est' })
    if (token !== run) return
    placeCursor(last)
  }

  /** Reduced motion: the finished transcript, no typing. */
  function renderStatic() {
    const lines = [
      [`${escapeHtml(PROMPT)}${highlight('npm test')}<span class="badge badge-pass">✓ 4.1s</span>`, 'gut gut-pass'],
      ...TEST_OUTPUT.map(([h]) => [h, 'gut gut-pass']),
      [`${escapeHtml(PROMPT)}${highlight('git push')}<span class="badge badge-fail">✗ 128  190ms</span>`, 'gut gut-fail'],
      ['<span class="c-red">fatal: No configured push destination.</span>', 'gut gut-fail'],
      [`${escapeHtml(PROMPT)}${highlight('npm t')}<span class="cursor"></span><span class="c-ghost">est</span><span class="key-hint">→ to accept</span>`, '']
    ]
    for (const [html, cls] of lines) addLine(html, cls)
  }

  /* ---------- output sparkline (status bar) ---------- */
  const samples = Array(24).fill(0)
  let pending = 0
  function bump(n) { pending += n + 10 }
  if (!reduceMotion) {
    setInterval(() => {
      samples.push(pending)
      samples.shift()
      pending = 0
      const max = Math.max(1, ...samples)
      pulse.setAttribute('points', samples.map((v, i) => `${(i * 46 / 23).toFixed(1)},${(11 - (v / max) * 10).toFixed(1)}`).join(' '))
    }, 300)
  }

  /* ---------- cursor effect + mascot eyes ---------- */
  const ctx = fx.getContext('2d')
  let lastRect = null
  const streaks = []
  let frame = 0

  function cursorRect() {
    if (!cursorEl || !cursorEl.isConnected) return null
    const c = cursorEl.getBoundingClientRect()
    const p = pane.getBoundingClientRect()
    return { x: c.left - p.left, y: c.top - p.top, w: c.width, h: c.height, cx: c.left + c.width / 2, cy: c.top + c.height / 2 }
  }

  function moveFx() {
    const rect = cursorRect()
    if (!rect) return
    lookAt(rect.cx, rect.cy)
    if (lastRect && !reduceMotion && cursorEffect !== 'none' && (lastRect.x !== rect.x || lastRect.y !== rect.y)) {
      streaks.push({ from: lastRect, to: rect, start: performance.now() })
      if (streaks.length > 4) streaks.shift()
      if (!frame) frame = requestAnimationFrame(draw)
    }
    lastRect = rect
  }

  function draw(now) {
    frame = 0
    const dpr = window.devicePixelRatio || 1
    const w = pane.clientWidth
    const h = pane.clientHeight
    if (fx.width !== Math.round(w * dpr)) { fx.width = Math.round(w * dpr); fx.height = Math.round(h * dpr) }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const color = getComputedStyle(app).getPropertyValue('--t-cursor').trim() || '#fff'
    const duration = cursorEffect === 'blaze' ? 260 : 170
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i]
      const t = (now - s.start) / duration
      if (t >= 1) { streaks.splice(i, 1); continue }
      const fade = 1 - t * t
      const a = s.from
      const b = s.to
      ctx.save()
      if (cursorEffect === 'blaze') {
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        g.addColorStop(0, 'transparent')
        g.addColorStop(1, color)
        ctx.fillStyle = g
        ctx.shadowColor = color
        ctx.shadowBlur = 14 * fade
        ctx.globalAlpha = 0.75 * fade
      } else {
        ctx.fillStyle = color
        ctx.globalAlpha = 0.3 * fade
      }
      const shrink = cursorEffect === 'blaze' ? 0.25 + 0.5 * (1 - t) : 0.6
      ctx.beginPath()
      ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2 - (a.h / 2) * shrink)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(b.x, b.y + b.h)
      ctx.lineTo(a.x + a.w / 2, a.y + a.h / 2 + (a.h / 2) * shrink)
      ctx.closePath()
      ctx.fill()
      if (cursorEffect === 'blaze') {
        ctx.globalAlpha = 0.4 * fade
        ctx.fillStyle = color
        ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2)
      }
      ctx.restore()
    }
    if (streaks.length) frame = requestAnimationFrame(draw)
  }

  function lookAt(x, y) {
    if (!mascot || reduceMotion) return
    const m = mascot.getBoundingClientRect()
    const dx = x - (m.left + m.width / 2)
    const dy = y - (m.top + m.height * 0.55)
    const len = Math.hypot(dx, dy) || 1
    eyes.style.transform = `translate(${((dx / len) * 6).toFixed(1)}px, ${((dy / len) * 5).toFixed(1)}px)`
  }

  /* ---------- controls ---------- */
  function press(group, button) {
    document.querySelectorAll(`[${group}]`).forEach((b) => b.setAttribute('aria-pressed', String(b === button)))
  }

  document.querySelectorAll('[data-set-theme]').forEach((button) =>
    button.addEventListener('click', () => {
      app.dataset.theme = button.dataset.setTheme
      press('data-set-theme', button)
    })
  )
  document.querySelectorAll('[data-set-cursor]').forEach((button) =>
    button.addEventListener('click', () => {
      cursorEffect = button.dataset.setCursor
      press('data-set-cursor', button)
    })
  )
  document.querySelector('[data-replay]').addEventListener('click', () => {
    showTab('pwsh')
    play()
  })

  function showTab(id) {
    app.querySelectorAll('.app-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === id))
    app.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== id))
  }
  app.querySelectorAll('.app-tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)))

  // Easter egg, same as in the app: ↑↑↓↓←→←→BA turns on the Matrix CRT screen.
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  let k = 0
  window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    k = key === KONAMI[k] ? k + 1 : key === KONAMI[0] ? 1 : 0
    if (k === KONAMI.length) {
      k = 0
      const button = document.querySelector('[data-set-theme="matrix"]')
      button.click()
    }
  })

  // Start when the demo scrolls into view; restart nothing on resize.
  let started = false
  const io = new IntersectionObserver((entries) => {
    if (started || !entries.some((e) => e.isIntersecting)) return
    started = true
    play()
  }, { threshold: 0.3 })
  io.observe(app)
})()
