# TermFlow — Developer-Odaklı Özellik Geliştirme PRD'si

> **⚠️ Ürün pivotu notu:** Bu PRD, TermFlow'un eski "multi-agent canvas" (React Flow tabanlı serbest
> konumlu kart canvas'ı + agent orkestrasyonu) döneminde yazılmıştır. Ürün o zamandan beri kökten
> değişti: agent takımları, agent bağlantı/routing, flow şablonları, agent metrikleri ve agent
> aktivite paneli tamamen kaldırıldı; `claude`/`codex`/`gemini` gibi CLI'lar artık sıradan başlangıç
> profilidir. React Flow canvas'ı da kaldırıldı (`@xyflow/react` bağımlılığı yok); yerine tmux
> modeli geldi: workspace = session, window = sekme, pane = ikili bölme ağacı, prefix-key (Ctrl+A/
> Ctrl+B) komutları ve vi tarzı copy mode. Güncel ürün tanımı için `README.md`'ye bakın.
>
> Aşağıdaki maddelerin çoğu (split-pane/sekmeler, snippet kütüphanesi, workspace export/import,
> broadcast, SSH profilleri, plugin SDK) o tarihten bu yana zaten farklı bir biçimde (canvas değil,
> tmux modeli üzerinden) hayata geçmiş durumda — bkz. `README.md` Features bölümü. **"Madde 5:
> Agent-to-Agent Mesaj Yönlendirme"** ürünün yeni yönüyle çelişiyor ve kapsam dışı bırakıldı;
> uygulanmadı ve uygulanması planlanmıyor. Bu dosya artık aktif bir yol haritası değil, tarihsel bir
> kayıttır.
>
> **Mevcut sürüm:** v0.1.0 · **Stack:** Electron 39 + React 18 + TS + xterm.js 5 + node-pty + Zustand + atomik JSON store (bkz. `README.md`; aşağıdaki madde metinlerindeki React Flow/SQLite referansları eski döneme aittir)
>
> **Mimari hatırlatma:** `src/main` (PTY + JSON store + IPC), `src/preload` (contextBridge `window.termflow`), `src/renderer` (React SPA). Yeni IPC kanalı = `src/shared/types.ts` içindeki `IPC` sabitine ekle → `registerIpc.ts` handler → `preload/index.ts` expose → `preload/index.d.ts` tip.

---

## Öncelik Özeti

| # | Özellik | Değer | Efor | Öncelik |
|---|---------|-------|------|---------|
| 1 | Split-pane & sekmeli terminal grupları | Çok yüksek | M | P0 |
| 2 | Command runner / snippet kütüphanesi | Çok yüksek | S | P0 |
| 3 | Workspace export/import (JSON) | Yüksek | S | P0 |
| 4 | Broadcast input (çoklu terminale aynı komut) | Yüksek | S | P0 |
| 5 | Agent-to-agent mesaj yönlendirme (edge çalıştırma) | Çok yüksek | L | P1 |
| 6 | `.termflow.json` proje profili (repo'ya özel setup) | Yüksek | M | P1 |
| 7 | SSH oturum profilleri | Yüksek | M | P1 |
| 8 | Terminal arama & çıktı highlight kuralları | Orta | S | P1 |
| 9 | Git durumu rozeti (per-terminal cwd) | Orta | M | P2 |
| 10 | Terminal kayıt & replay (asciinema tarzı) | Orta | M | P2 |
| 11 | Ortam değişkeni / secrets yöneticisi | Orta | M | P2 |
| 12 | Global tema + font ayarları | Orta | S | P2 |
| 13 | Plugin/eklenti sistemi | Yüksek | XL | P3 |

---

## P0 — Hemen Değer Katan Özellikler

### 1. Split-Pane & Sekmeli Terminal Grupları

**Durum:** Bu madde, o zamanki "canvas node'u bölme" tasarımından farklı bir mimariyle (tam tmux
modeli: session/window/pane) hayata geçti. Güncel davranış için `README.md` → "tmux-Style Sessions,
Windows, and Panes" bölümüne bakın; aşağıdaki orijinal metin tarihsel referanstır.

**Gerekçe:** Tek terminal = tek node bugün. Geliştiriciler tek bir mantıksal işi (ör. "frontend": dev server + test watcher + shell) tek kart içinde bölünmüş panellerde görmek ister. Canvas'ı node enflasyonundan korur.

**Kabul kriterleri:**
- Bir terminal node'u yatay/dikey split edilebilir (`Ctrl+Shift+D` / `Ctrl+Shift+E`).
- Bir node içinde birden fazla PTY oturumu sekme olarak barınabilir.
- Split oranları sürüklenebilir; layout SQLite'a persist edilir.
- Focus yönetimi split içinde de çalışır (yalnız aktif pane tam render).

**Dokunulacak dosyalar:**
- `src/shared/types.ts` — `CanvasNode`'a `panes: PaneNode[]` (tree: split direction + ratio + terminalId) ve `activeTabId` ekle.
- `src/renderer/src/canvas/TerminalNode.tsx` — özyinelemeli pane render + splitter drag.
- `src/renderer/src/store/appStore.ts` — `splitPane`, `closePane`, `setActivePane` action'ları.
- `src/main/db/database.ts` — layout serialize güncellemesi (pane ağacı JSON kolonu).

**Teknik yaklaşım:** Pane ağacını binary tree olarak modelle (`{ dir, ratio, a, b }` veya `{ terminalId }`). `terminalRegistry.ts` zaten terminal-process eşlemesi tutuyor; sadece render katmanı çoklu PTY'yi bir node'a bağlayacak.

---

### 2. Command Runner / Snippet Kütüphanesi

**Gerekçe:** Geliştiriciler aynı komutları tekrar yazar (`npm run dev`, `docker compose up`, `git push`). Kayıtlı, parametreli snippet'ler + tek tık çalıştırma büyük hız kazandırır. Bugünkü Custom Command modal'ının doğal evrimi.

**Kabul kriterleri:**
- Snippet CRUD: ad, komut, opsiyonel `{{param}}` placeholder'ları, hedef shell türü, cwd.
- Command Palette (`Ctrl+K`) içinden snippet arama & çalıştırma.
- Parametreli snippet çalıştırmadan önce hızlı input formu açar.
- Snippet aktif terminale yazılır; "yeni terminalde çalıştır" seçeneği de olur.
- Snippet'ler workspace-scope veya global scope.

**Dokunulacak dosyalar:**
- `src/main/db/database.ts` — `snippets` tablosu (`id, workspaceId NULLABLE, name, command, params JSON, targetKind, cwd`).
- `src/shared/types.ts` — `Snippet` interface + `IPC.SNIPPET_*` kanalları.
- `src/main/ipc/registerIpc.ts` — CRUD handler'ları.
- `src/renderer/src/components/CommandPalette.tsx` — snippet listesi + parametre formu.
- Yeni: `src/renderer/src/components/SnippetModal.tsx`.

**Teknik yaklaşım:** Placeholder parse için basit `{{name}}` regex. Çalıştırma = `window.termflow.ptyWrite(termId, resolved + '\r')`. Mevcut IPC write kanalı yeterli.

---

### 3. Workspace Export/Import (JSON)

**Gerekçe:** Roadmap'te var. Kurulum paylaşımı, yedekleme, makine değiştirme için kritik. Takım içinde standart workspace şablonları dağıtmayı sağlar.

**Kabul kriterleri:**
- "Export Workspace" → node'lar, bağlantılar, viewport, terminal profilleri, snippet'ler tek `.termflow.json` dosyasına yazılır (PTY runtime state HARİÇ).
- "Import Workspace" → dosyadan yeni workspace oluşturur, ID çakışmalarını remap eder.
- Hassas veri (env secrets) export'ta opsiyonel olarak maskelenir/atlanır.

**Dokunulacak dosyalar:**
- `src/main/ipc/registerIpc.ts` — `WS_EXPORT`, `WS_IMPORT` handler (Electron `dialog.showSaveDialog`/`showOpenDialog`).
- `src/shared/types.ts` — `WorkspaceExport` şeması + IPC kanalları + `schemaVersion` alanı.
- `src/main/db/database.ts` — toplu okuma/yazma helper'ları, ID remap.
- `src/renderer/src/components/Sidebar.tsx` — sağ-tık menüsüne Export/Import.

**Teknik yaklaşım:** `schemaVersion` ekle ki gelecekte migration yapılabilsin. Import'ta tüm `id`'leri yeni UUID'lerle map'le, referansları (sourceNodeId/targetNodeId/terminalId) güncelle.

---

### 4. Broadcast Input (Çoklu Terminale Aynı Komut)

**Gerekçe:** Mikroservis/monorepo geliştirmede aynı komutu N terminale göndermek (ör. `git pull` tüm repolarda) yaygın. iTerm2/tmux'ın sevilen özelliği.

**Kabul kriterleri:**
- Terminaller "broadcast grubu"na eklenir; toolbar'da broadcast toggle.
- Aktifken bir terminale yazılan girdi gruptaki tümüne aynı anda gönderilir.
- Görsel gösterge (broadcast'teki node'larda belirgin border).

**Dokunulacak dosyalar:**
- `src/renderer/src/store/appStore.ts` — `broadcastGroup: Set<terminalId>`, `broadcastEnabled`.
- `src/renderer/src/components/TerminalView.tsx` — `onData` handler'da broadcast aktifse gruptaki tüm terminallere write.
- `src/renderer/src/components/Toolbar.tsx` — broadcast toggle + grup seçimi.

**Teknik yaklaşım:** Salt renderer-tarafı; her keystroke için `ptyWrite`'ı grup üyelerine fan-out. Sonsuz döngüyü önlemek için broadcast write'ları echo olarak geri tetikleme.

---

## P1 — Diferansiyasyon Yaratan Özellikler

### 5. ~~Agent-to-Agent Mesaj Yönlendirme (Edge'leri Çalıştırılabilir Yapmak)~~ — KAPSAM DIŞI

**Durum:** Bu madde ürünün tmux-modeline pivotu ile birlikte kapsam dışı bırakıldı. Agent node'lar,
tipli bağlantılar (edge'ler) ve agent-to-agent routing artık ürün vizyonunda yok; `claude`/`codex`
gibi CLI'lar sıradan terminal profilidir ve aralarında otomatik mesaj yönlendirme yapılmayacak.
Aşağıdaki orijinal madde metni yalnızca tarihsel referans için bırakılmıştır, uygulanmadı.

<details>
<summary>Orijinal madde metni (artık geçersiz)</summary>

**Gerekçe:** TermFlow'un "n8n meets tmux" vaadinin kalbi. Bugün edge'ler görsel. Bunları **çalıştırılabilir** yapmak ürünü benzersiz kılar: Planner agent çıktısı → Coder agent input'u.

**Kabul kriterleri:**
- Bir agent node'un çıktısından desen/marker (ör. `@@HANDOFF@@ ... @@END@@`) yakalanınca bağlı hedef node'un stdin'ine yazılır.
- Edge tipi `trigger`/`data`/`control` davranışı belirler (data=çıktı ilet, trigger=komut başlat).
- Kullanıcı edge üzerinde "transform" tanımlayabilir (opsiyonel prefix/template).
- Döngü koruması + görsel "akış animasyonu" edge üzerinde.

**Dokunulacak dosyalar:**
- `src/main/pty/PtyManager.ts` — çıktı batch'lerinde marker tarama (opt-in, per-terminal).
- `src/main/ipc/registerIpc.ts` — `AGENT_HANDOFF` event (main→renderer→hedefe write) veya main-içi doğrudan routing.
- `src/renderer/src/store/appStore.ts` — routing kuralları, connection `status: 'active'` animasyonu.
- `src/renderer/src/components/ConnectionModal.tsx` — transform/marker ayarları.
- `src/shared/types.ts` — `AgentConnection`'a `transform?`, `triggerPattern?` alanları.

**Teknik yaklaşım:** MVP olarak marker-tabanlı. Çıktıda regex eşleşince `sourceNode`'un giden edge'lerini bul, her hedefe `ptyWrite`. Performans için yalnız routing kuralı olan terminallerde tarama aç.

</details>

---

### 6. `.termflow.json` Proje Profili (Repo'ya Özel Otomatik Setup)

**Gerekçe:** Bir repoyu açınca "hangi terminaller, hangi agent'lar, hangi başlangıç komutları" otomatik kurulsun. Onboarding'i saniyelere indirir; takım standartlaşması sağlar.

**Kabul kriterleri:**
- Workspace path'inde `.termflow.json` varsa "Bu proje için önerilen kurulumu uygula?" prompt'u.
- Dosya: terminal listesi (kind, cwd, startupCommand), önerilen layout, snippet'ler, agent rolleri.
- "Save current workspace as project template" ile dosya üretilebilir.

**Dokunulacak dosyalar:**
- `src/main/ipc/registerIpc.ts` — workspace açılışında path'te dosya kontrolü + parse.
- `src/shared/types.ts` — `ProjectManifest` şeması (export şemasıyla ortaklaşabilir).
- `src/renderer/src/components/WorkspaceModal.tsx` — manifest algılandı bildirimi.

**Teknik yaklaşım:** #3 export şemasını yeniden kullan; fark = repo köküne commit'lenebilir, runtime-agnostik alt küme.

---

### 7. SSH Oturum Profilleri

**Gerekçe:** Roadmap'te var. Geliştiriciler uzak sunuculara sürekli bağlanır. Canvas'ta local + remote terminalleri yan yana güçlü bir kombinasyon.

**Kabul kriterleri:**
- SSH profili: host, port, user, auth (key path / agent), jump host opsiyonel.
- Profil seçilince PTY içinde `ssh` komutu ile bağlanır (ilk aşama), ileride native SSH.
- Bağlantı durumu node'da gösterilir (connected/disconnected/reconnecting).

**Dokunulacak dosyalar:**
- `src/main/pty/shells.ts` — `ssh` kind çözümü (komut inşası).
- `src/main/db/database.ts` — `ssh_profiles` tablosu.
- `src/shared/types.ts` — `SshProfile` + `ShellKind`'a `'ssh'`.
- `src/renderer/src/profiles.ts` — SSH profil grubu.
- Yeni: `src/renderer/src/components/SshProfileModal.tsx`.

**Teknik yaklaşım:** MVP = sistem `ssh` binary'sini PTY içinde çalıştır (`ssh -i key user@host`). Secret'ları OS credential store veya #11 secrets yöneticisine bağla; şifreyi düz metin persist ETME.

---

### 8. Terminal Arama & Çıktı Highlight Kuralları

**Gerekçe:** `xterm-addon-search` zaten stack'te. Log'larda arama ve `ERROR`/`WARN` gibi desenleri renklendirme geliştirici verimliliği için standart beklenti.

**Kabul kriterleri:**
- `Ctrl+F` ile aktif terminalde arama (next/prev, case, regex).
- Kullanıcı tanımlı highlight kuralları: regex → renk (global veya per-workspace).
- Hata deseni eşleşince node status `error` + StatusBar bildirimi (mevcut `PTY_ACTIVITY` genişletilir).

**Dokunulacak dosyalar:**
- `src/renderer/src/components/TerminalView.tsx` — SearchAddon mount + arama UI, decoration API ile highlight.
- `src/renderer/src/store/appStore.ts` — highlight kuralları state.
- `src/main/pty/PtyManager.ts` — mevcut activity sinyaline kural eşleşmesi ekle.

**Teknik yaklaşım:** xterm `registerDecoration` / marker API ile satır renklendirme. Arama zaten addon ile hazır, sadece UI bağla.

---

## P2 — Olgunlaştırıcı Özellikler

### 9. Git Durumu Rozeti (Per-Terminal cwd)

**Gerekçe:** Terminal cwd bir git repo ise branch + dirty durumu node başlığında görünsün. Bağlamsal farkındalık.

**Kabul kriterleri:** Node header'da `branch ●` (dirty) / `branch ✓`. Periyodik (5–10 sn) veya komut sonrası güncelleme. Repo değilse gizli.

**Dokunulacak dosyalar:** `src/main/ipc/registerIpc.ts` (yeni `GIT_STATUS` handler, `git rev-parse`/`git status --porcelain`), `src/shared/types.ts`, `src/renderer/src/canvas/TerminalNode.tsx`.

**Teknik yaklaşım:** Main'de hafif `child_process` git çağrısı; cwd bazlı cache + debounce. PTY cwd takibi için OSC 7 escape parse edilebilir (ileri seviye) ya da başlangıç cwd'si.

---

### 10. Terminal Kayıt & Replay

**Gerekçe:** Roadmap'te var. Bug tekrar üretimi, demo, dokümantasyon için değerli. asciinema `.cast` formatı ile uyum ekosistem avantajı.

**Kabul kriterleri:** Kayıt başlat/durdur; timing'li çıktı `.cast`/JSON'a yazılır. In-app replay (hız kontrolü). Export edilebilir.

**Dokunulacak dosyalar:** `src/main/pty/PtyManager.ts` (opt-in kayıt buffer'ı timestamp'li), yeni `src/main/recording/Recorder.ts`, `src/renderer/src/components/ReplayModal.tsx`, IPC kanalları.

**Teknik yaklaşım:** node-pty `onData` event'lerini `[t, bytes]` olarak kaydet. Replay = xterm'e zamanlı `write`. asciinema v2 formatı hedefle.

---

### 11. Ortam Değişkeni / Secrets Yöneticisi

**Gerekçe:** Terminal ve agent'lar sık sık API key ister. Merkezi, güvenli, workspace-scope env yönetimi düz metin `.env` dağınıklığını önler.

**Kabul kriterleri:** Workspace-scope env set'leri; terminal spawn'ında inject. Secret değerler UI'da maskeli. Diske şifreli yazım (OS keychain / `safeStorage`).

**Dokunulacak dosyalar:** `src/main/db/database.ts` (env tablosu), `src/main/pty/PtyManager.ts` (spawn env merge — zaten `env` alanı var), Electron `safeStorage` ile şifreleme, yeni `EnvManagerModal.tsx`.

**Teknik yaklaşım:** Electron `safeStorage.encryptString` ile at-rest şifreleme. `CreateTerminalInput.env` zaten mevcut — sadece merkezi yönetim + inject katmanı.

---

### 12. Global Tema + Font Ayarları

**Gerekçe:** `ThemeMode` tipte var ama sınırlı. Geliştiriciler font family/size, terminal renk şeması (Dracula, Solarized, One Dark), cursor stili ister.

**Kabul kriterleri:** SettingsModal'da: font family/size, ligature toggle, hazır xterm tema seçici, satır yüksekliği. Anında uygulanır, persist edilir.

**Dokunulacak dosyalar:** `src/shared/types.ts` (`AppSettings` genişlet), `src/renderer/src/components/SettingsModal.tsx`, `src/renderer/src/components/TerminalView.tsx` (xterm `ITheme` + font options).

**Teknik yaklaşım:** xterm `options.theme` ve font ayarları runtime değiştirilebilir. Hazır tema JSON'ları bir sabit dosyada tut.

---

## P3 — Uzun Vadeli / Platform

### 13. Plugin / Eklenti Sistemi

**Gerekçe:** Roadmap'te var. Özel shell entegrasyonları, custom node tipleri, komut sağlayıcılar için genişletilebilirlik. Ekosistem büyümesinin anahtarı ama en riskli/büyük iş.

**Kabul kriterleri:** Tanımlı plugin manifest'i; sandbox'lı yükleme; genişletme noktaları (yeni node tipi, command palette provider, çıktı işleyici). Güvenlik gözden geçirmesi zorunlu.

**Not:** Bu maddeyi ayrı bir spike/PRD olarak ele al; MVP'ye sokma. Önce #5 (edge routing) ve #6 (project manifest) stabilize olmalı.

---

## Genel Uygulama Notları (AI aracı için)

1. **IPC ekleme reçetesi (her yeni backend özelliği için):** `types.ts` `IPC` sabitine kanal ekle → `registerIpc.ts` handler → `preload/index.ts` `contextBridge` expose → `preload/index.d.ts` tip → renderer'da `window.termflow.*` çağır. Bu zinciri asla atlama.
2. **DB migration:** `database.ts` şema oluşturmayı yönetiyor; yeni tablo/kolonu geriye dönük uyumlu (idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER`) ekle. Mevcut kullanıcıların DB'sini bozma.
3. **Persistans:** Yeni canvas state alanları `LAYOUT_SAVE`/`LAYOUT_GET` yoluna dahil edilmeli, yoksa restart'ta kaybolur.
4. **Performans:** Çıktı tarama/routing (özellik #5, #8) opt-in olmalı — her terminalde default açık tarama render batch'ini yavaşlatır. Mevcut 16ms batch + ring buffer mimarisini koru.
5. **Güvenlik:** Secrets/SSH/env için asla düz metin persist etme; Electron `safeStorage` kullan. `agentAutoApprove` bypass flag'lerinin risklerini UI'da hatırlat.
6. **Test/doğrulama:** Her özellik sonrası `npm run dev` ile manuel akış + terminal spawn/kill/persist döngüsünü doğrula.
7. **Önerilen sıra:** P0 (1→4) → #8 arama → #3/#6 şema paylaşımı → #5 edge routing → kalan P2. Her biri bağımsız PR.
