# TermFlow — promo & download site

A self-contained, dependency-free landing + download page for TermFlow. Pure
HTML/CSS/JS — no build step — so it deploys to Vercel with zero config.

## Structure
```
website/
├── index.html      # the page
├── styles.css      # design system (matches the app brand)
├── main.js         # scroll reveal, lightbox, download links
├── vercel.json     # caching + clean URLs
└── assets/
    ├── demo-hero.gif  demo-agents.gif  demo-layout.gif  demo-tools.gif
    ├── shot-01..08.png     # real screenshots
    └── favicon.svg
```

## Deploy to Vercel
1. Push this folder (or the whole repo) to GitHub.
2. On Vercel: **New Project → Import** the repo.
3. Set **Root Directory** to `website` (Framework preset: *Other*). No build
   command, no output dir — it's static.
4. Deploy. Done.

Or with the CLI:
```bash
cd website
npx vercel        # preview
npx vercel --prod # production
```

## Wire the Download button
The installer is hosted on **GitHub Releases** — no file-size limits. `main.js`
already points at the `latest/download/...` URL:
```js
const DOWNLOADS = {
  installer: 'https://github.com/palamut62/termflow/releases/latest/download/TermFlow-0.4.1-x64.exe'
}
```
Publish a release with the matching asset name:
```bash
gh release create v0.4.1 \
  dist/TermFlow-0.4.1-x64.exe \
  --repo palamut62/termflow --title "TermFlow v0.4.1" --notes "Latest release"
```
Because the URL uses `latest/download/...`, every new release is picked up
automatically — you only need to touch `main.js` when the file name changes
(i.e. on a version bump). Also update the version and size shown in
`index.html` (hero meta line and the download card).

The Vercel Blob / `website/public/download/` self-hosting setup is no longer
used; the installer is ~91 MB and belongs in Releases.

## Regenerate the GIFs
From the repo root (needs ffmpeg + `tmp-promo/termflow-promo.mp4`):
```bash
ffmpeg -y -ss 5  -t 8 -i tmp-promo/termflow-promo.mp4 -vf "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" website/assets/demo-hero.gif
```
(repeat with different `-ss` start seconds for the other demos).

## Customize
- Colors/spacing: CSS variables at the top of `styles.css`.
- Copy, features, changelog: plain HTML in `index.html`.
- Screenshots: replace anything in `assets/` and update the `<img src>`.
