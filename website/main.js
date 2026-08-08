/* ============================================================
   TermFlow promo — interactions
   ------------------------------------------------------------
   DOWNLOAD LINKS: the installer is served from GitHub Releases.
   The "latest/download/..." URL always resolves to the newest
   release, so publishing a new tag is enough — no edit needed here
   unless the file name changes.
   (The old Vercel Blob URL is no longer used.)
   ============================================================ */
const DOWNLOADS = {
  installer: 'https://github.com/palamut62/termflow/releases/latest/download/TermFlow-0.4.4-x64.exe'
}

// Wire download buttons
const inst = document.getElementById('dl-installer')
const heroDl = document.getElementById('hero-download')
if (inst) inst.href = DOWNLOADS.installer
// Hero "Download" scrolls to the section; the actual file links live there.

// Year
document.getElementById('year').textContent = new Date().getFullYear()

// Sticky nav shadow
const nav = document.getElementById('nav')
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8)
onScroll()
window.addEventListener('scroll', onScroll, { passive: true })

// Mobile menu
const burger = document.getElementById('burger')
burger?.addEventListener('click', () => document.body.classList.toggle('menu-open'))
document.querySelectorAll('.nav__links a').forEach((a) =>
  a.addEventListener('click', () => document.body.classList.remove('menu-open'))
)

// Scroll reveal
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in')
        io.unobserve(e.target)
      }
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
)
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`
  io.observe(el)
})

// Lightbox
const lb = document.getElementById('lightbox')
const lbImg = document.getElementById('lightbox-img')
document.querySelectorAll('.gallery__item img').forEach((img) => {
  img.addEventListener('click', () => {
    lbImg.src = img.src
    lbImg.alt = img.alt
    lb.classList.add('open')
    lb.setAttribute('aria-hidden', 'false')
  })
})
const closeLb = () => {
  lb.classList.remove('open')
  lb.setAttribute('aria-hidden', 'true')
}
lb?.addEventListener('click', closeLb)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLb()
})
