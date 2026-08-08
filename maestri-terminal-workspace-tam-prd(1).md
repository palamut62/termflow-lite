# Maestri Terminal Workspace — Windows Çoklu Terminal ve Multi-Agent Canvas PRD

## 1. Ürün Tanımı

**Maestri Terminal Workspace**, Windows üzerinde çalışan, uygulama içinde birden çok gerçek terminal oturumu açabilen, bu terminalleri canvas üzerinde görsel paneller halinde gösterebilen, her terminali bağımsız process olarak çalıştırabilen ve AI agent tabanlı iş akışlarını bağlantı çizgileriyle görselleştirebilen profesyonel bir masaüstü uygulamasıdır.

Uygulamanın amacı sadece klasik terminal göstermek değildir. Amaç; Windows Terminal, AI coding agent araçları, proje bazlı workspace yönetimi, terminal otomasyonu ve multi-agent orchestration mantığını tek bir modern arayüzde birleştirmektir.

Kullanıcı uygulama içinde:

- Birden fazla terminal açabilir.
- Her terminali ayrı panel/node olarak canvas üzerinde görebilir.
- Terminal panellerini büyütüp küçültebilir.
- Terminal panellerini canvas üzerinde taşıyabilir.
- Terminalleri otomatik olarak canvas’a sığdırabilir.
- Sadece seçili terminali aktif giriş terminali yapabilir.
- Pasif terminallerin arka planda çalışmaya devam etmesini sağlayabilir.
- Claude Code, Codex, OpenCode, Ollama, WSL, PowerShell, CMD, Git Bash gibi araçları ayrı terminallerde çalıştırabilir.
- Her agent’i ayrı terminalde izleyebilir.
- Agentler/terminaller arasında bağlantılar kurabilir.
- Bu bağlantıları görev akışı, veri akışı, log akışı, hata akışı veya parent-child ilişkisi olarak gösterebilir.
- Workspace bazlı terminal düzenini kaydedip tekrar açabilir.

---

## 2. Ürün Vizyonu

Bu ürünün vizyonu, Windows için gelişmiş bir **AI Agent Terminal Workspace Manager** oluşturmaktır.

Klasik terminal uygulamaları genellikle sekme, bölme ve komut çalıştırma üzerine odaklanır. Bu uygulama ise terminali daha yüksek seviyeli bir çalışma nesnesi olarak ele alır.

Ürünün ana vizyonu:

```text
Terminal + Workspace + Canvas + Multi-Agent Graph + AI Workflow Manager
```

Yani kullanıcı sadece terminal kullanmaz; aynı zamanda projelerini, çalışan servislerini, AI agent oturumlarını, komutlarını, loglarını, hata akışlarını ve görev ilişkilerini tek görsel çalışma alanında yönetir.

---

## 3. Hedef Platform

### 3.1 Birincil hedef

- Windows 10
- Windows 11

### 3.2 İkincil hedef

İlerleyen sürümlerde:

- macOS
- Linux

Ancak ilk ürün kalitesi Windows üzerine kurulmalıdır. Özellikle Windows ConPTY, PowerShell, CMD, WSL ve Git Bash desteği birinci sınıf olmalıdır.

---

## 4. Hedef Kullanıcı Kitlesi

### 4.1 Yazılım geliştiriciler

- Frontend developer
- Backend developer
- Full-stack developer
- Python developer
- C# / .NET developer
- Node.js developer
- DevOps kullanıcısı
- Electron/Tauri/PyQt masaüstü geliştiricileri

### 4.2 AI coding araçları kullanan geliştiriciler

- Claude Code kullanıcıları
- Codex kullanıcıları
- OpenCode kullanıcıları
- Ollama kullanıcıları
- Aider kullanıcıları
- Goose / agentic CLI kullanıcıları
- Kendi local agent sistemini çalıştıran kullanıcılar

### 4.3 Çoklu terminal kullanan teknik kullanıcılar

Aynı projede birden çok terminal kullanan kişiler:

```text
Terminal 1 → npm run dev
Terminal 2 → python api.py
Terminal 3 → dotnet watch
Terminal 4 → claude
Terminal 5 → codex
Terminal 6 → git status
Terminal 7 → ollama serve
```

---

## 5. Çözülen Temel Problem

Kullanıcılar genellikle şu sorunları yaşar:

1. Çok fazla terminal penceresi açılır.
2. Hangi terminalin hangi projeye ait olduğu karışır.
3. AI coding araçları ayrı ayrı pencerelerde dağınık kalır.
4. Geliştirme sunucuları arka planda çalışırken takibi zorlaşır.
5. Agentlerin birbirleriyle ilişkisi görünmez.
6. Terminal logları proje bazında düzenlenmez.
7. Aynı proje tekrar açıldığında terminal düzeni kaybolur.
8. Hangi agentin hangi görevi yaptığı net görünmez.
9. Bir terminalin çıktısını diğer agente bağlamak manuel ve zahmetlidir.
10. Windows Terminal güçlü olsa da multi-agent workflow görselleştirme sunmaz.

Bu uygulama bu sorunları tek bir canvas tabanlı terminal çalışma ortamında çözer.

---

## 6. Tasarım Referansı ve Görsel Yaklaşım

Kullanıcı tarafından verilen görsel referans temel alınmalıdır.

Tasarım karakteri:

- Koyu tema
- Sol sidebar
- Workspace/proje listesi
- Ortada grid/canvas alanı
- Canvas üzerinde terminal kartları
- Seçili terminal için belirgin border
- Üstte kompakt toolbar
- Sağda context/info paneli
- Terminal kartlarının taşınabilir ve resize edilebilir olması
- Mac tarzı modern pencere hissi ancak Windows için doğal paketleme
- Grid arka plan
- Developer tool estetiği
- Minimal ikonlar
- Yüksek kontrastlı aktif terminal vurgusu

Örnek ekran yapısı:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Top Toolbar                                                         │
├───────────────┬───────────────────────────────────────┬─────────────┤
│ Sidebar       │ Main Canvas                           │ Info Panel  │
│               │                                       │             │
│ Workspaces    │  ┌───────────────────────────────┐    │ Context     │
│ Terminals     │  │ Active Terminal Panel         │    │ Process     │
│ Agents        │  │ OpenCode / Claude / etc.      │    │ Usage       │
│ Commands      │  └───────────────────────────────┘    │ Status      │
│               │                                       │             │
└───────────────┴───────────────────────────────────────┴─────────────┘
```

---

## 7. Ürün Hedefleri

### 7.1 Ana hedefler

- Gerçek terminal process’lerini uygulama içinde çalıştırmak.
- Aynı canvas üzerinde birden fazla terminal paneli göstermek.
- Her terminali bağımsız process olarak yönetmek.
- Terminal panelini kullanıcı tarafından büyütülebilir/küçültülebilir yapmak.
- Terminal panelini kullanıcı tarafından taşınabilir yapmak.
- Terminal panellerini otomatik olarak canvas’a sığdırabilmek.
- Sadece seçili terminali aktif giriş terminali yapmak.
- Pasif terminallerin arka planda çalışmaya devam etmesini sağlamak.
- Terminal/agent ilişkilerini bağlantı çizgileriyle göstermek.
- Workspace bazlı terminal düzenini kaydetmek.
- Gerçek Windows Terminal’e yakın hız ve performans sağlamak.
- AI coding araçları için özel agent terminal profilleri oluşturmak.

### 7.2 İleri seviye hedefler

- Agentler arası otomasyon kuralları.
- Bir terminal çıktısını diğer agente iletme.
- Hata loglarını otomatik Debugger Agent’e gönderme.
- Test başarısız olursa Coder Agent’i tetikleme.
- Planner → Coder → Tester → Reviewer akışı.
- Komut şablonları.
- Terminal log arama.
- AI ile log özetleme.
- Workspace import/export.
- Plugin/skill/rules sistemi.
- GitHub repo bazlı workspace oluşturma.
- SSH ve WSL workspace yönetimi.

---

## 8. Ürün Kapsamı

## 8.1 MVP kapsamı

İlk sürümde mutlaka olmalıdır:

1. Windows masaüstü uygulaması
2. Workspace oluşturma
3. Workspace silme
4. Workspace yeniden adlandırma
5. Workspace klasörü seçme
6. Workspace içinde terminal oluşturma
7. PowerShell terminal açma
8. CMD terminal açma
9. WSL terminal açma
10. Git Bash terminal açma
11. Custom shell tanımlama
12. Canvas üzerinde terminal paneli gösterme
13. Birden çok terminal paneli ekleme
14. Terminal panelini taşıma
15. Terminal panelini yeniden boyutlandırma
16. Terminal panelini küçültme
17. Terminal panelini büyütme
18. Terminal panelini tam ekrana alma
19. Terminale komut yazma
20. Aktif terminal değiştirme
21. Pasif terminallerin çalışmaya devam etmesi
22. Terminal çıktı buffer’ı
23. Terminal process kapatma
24. Terminal restart
25. Terminal layout kaydetme
26. Workspace restore
27. Canvas zoom/pan
28. Auto Fit All layout
29. Grid layout
30. Agent node türleri
31. İki terminal/agent arasında bağlantı çizgisi kurma
32. Bağlantı tipi seçme
33. Bağlantı etiketi yazma
34. Terminal paneli içi info alanı
35. Temel ayarlar
36. Performans ayarları
37. Tema ayarları

## 8.2 MVP dışı ama planlanacak özellikler

1. Claude Code gelişmiş agent profili
2. Codex gelişmiş agent profili
3. OpenCode gelişmiş agent profili
4. Ollama local model profili
5. AI log özetleme
6. Agent otomasyon kuralları
7. Terminal çıktısını başka terminale iletme
8. Regex tabanlı tetikleme
9. Process CPU/RAM izleme
10. Git branch/diff izleme
11. SSH bağlantı yöneticisi
12. Komut palette
13. Global hotkey
14. Plugin sistemi
15. Workspace paylaşımı
16. Terminal session snapshot
17. Layout şablonları
18. Agent flow template sistemi
19. Rules/skills klasörü entegrasyonu
20. AI workflow marketplace

---

## 9. Ana Kullanım Senaryoları

## 9.1 Yeni workspace oluşturma

Kullanıcı uygulamayı açar. Sol sidebar’dan `+ Workspace` butonuna basar. Proje klasörünü seçer. Workspace adı verir. Uygulama workspace’i oluşturur ve boş canvas açar.

## 9.2 Canvas’a terminal ekleme

Kullanıcı `+ Terminal` butonuna basar. Terminal tipi seçer:

- PowerShell
- CMD
- WSL
- Git Bash
- Claude Code
- Codex
- OpenCode
- Ollama
- Custom Command

Seçimden sonra canvas üzerinde yeni bir terminal paneli oluşur.

## 9.3 Birden fazla terminal kullanma

Kullanıcı aynı canvas’a birden çok terminal ekler:

```text
Terminal 1 → OpenCode
Terminal 2 → Claude Code
Terminal 3 → npm run dev
Terminal 4 → python api.py
Terminal 5 → git status
```

Her terminal ayrı panelde görünür. Her terminal bağımsız çalışır.

## 9.4 Terminal boyutu değiştirme

Kullanıcı terminal panelinin kenarından veya köşesinden tutarak boyutunu değiştirir. Uygulama terminalin gerçek `cols` ve `rows` değerlerini yeniden hesaplar ve PTY process’e resize gönderir.

## 9.5 Terminali aktif etme

Canvas üzerinde terminal paneline tıklayınca o terminal aktif olur.

Aktif terminal:

- Klavye girdisi alır.
- Border ile vurgulanır.
- Cursor aktif görünür.
- Sağ panelde bilgileri gösterilir.

Diğer terminaller:

- Çalışmaya devam eder.
- Buffer üretmeye devam eder.
- Pasif görünür.

## 9.6 Otomatik sığdırma

Kullanıcı `Auto Fit All` seçer. Uygulama açık terminal sayısına göre panelleri canvas’a otomatik yerleştirir.

Örnek:

```text
1 terminal  → Tam genişlik
2 terminal → Yan yana
4 terminal → 2 x 2
6 terminal → 3 x 2
9 terminal → 3 x 3
```

## 9.7 Multi-agent workflow

Kullanıcı agent terminalleri oluşturur:

```text
Planner Agent
Coder Agent
Tester Agent
Reviewer Agent
Git Agent
```

Canvas üzerinde bu agentleri bağlantılarla ilişkilendirir:

```text
Planner → Coder → Tester → Reviewer → Git Agent
```

Bağlantılar görev akışını görsel olarak gösterir.

---

## 10. Fonksiyonel Gereksinimler

# 10.1 Workspace Yönetimi

### FR-001 — Workspace oluşturma

Kullanıcı yeni workspace oluşturabilmelidir.

Alanlar:

- Workspace adı
- Klasör yolu
- Açıklama
- İkon
- Varsayılan terminal profili
- Varsayılan layout modu
- Otomatik başlatılacak terminaller

### FR-002 — Workspace listeleme

Sol sidebar’da workspace’ler listelenmelidir.

Her workspace için:

- İsim
- İkon
- Çalışan terminal sayısı
- Toplam terminal sayısı
- Aktif agent sayısı
- Son açılma zamanı
- Hata/uyarı rozeti

### FR-003 — Workspace açma

Workspace seçilince ilgili canvas layout, terminal kayıtları ve bağlantılar yüklenmelidir.

### FR-004 — Workspace silme

Workspace silinirken çalışan terminal varsa uyarı verilmelidir.

Seçenekler:

- Tüm process’leri sonlandır ve sil
- Sadece workspace kaydını sil
- İptal

### FR-005 — Workspace klonlama

Mevcut workspace ayarları, terminal profilleri ve layout bilgileriyle klonlanabilmelidir.

### FR-006 — Workspace restore

Uygulama kapanıp açıldığında son açık workspace ve canvas layout geri gelmelidir.

---

# 10.2 Terminal Yönetimi

### FR-010 — Terminal oluşturma

Kullanıcı workspace içinde terminal oluşturabilmelidir.

Terminal tipleri:

- PowerShell
- PowerShell Core
- CMD
- WSL
- Git Bash
- SSH
- Custom executable
- Custom command
- Claude Code
- Codex
- OpenCode
- Ollama

### FR-011 — Terminal process başlatma

Her terminal ayrı bir PTY process olarak başlatılmalıdır.

```text
Terminal ID → PTY Process
Terminal Buffer → Output history
Terminal Node → Canvas panel
Terminal Profile → Shell/command/env/cwd
```

### FR-012 — Terminale veri yazma

Kullanıcının klavye girdisi sadece aktif terminale gönderilmelidir.

### FR-013 — Terminal çıktısını alma

PTY process’ten gelen çıktı terminal buffer’ına yazılmalıdır.

Aktif terminal için:

- Buffer’a yaz
- UI’a canlı gönder

Pasif terminal için:

- Buffer’a yaz
- Gerekirse düşük frekansta güncelle
- Sidebar/canvas üzerinde aktivite göstergesi göster

### FR-014 — Terminal aktif etme

Terminal aktif olduğunda:

- Önceki terminal pasif olur.
- Yeni terminal aktif olur.
- Aktif terminal vurgulanır.
- Klavye odağı yeni terminale geçer.
- Sağ panel güncellenir.

### FR-015 — Terminal kapatma

Terminal kapatılırken process çalışıyorsa kullanıcıya uyarı verilmelidir.

Seçenekler:

- Terminate
- Detach
- Cancel

### FR-016 — Terminal restart

Terminal aynı shell, args, cwd ve env ile yeniden başlatılabilmelidir.

### FR-017 — Terminal resize

Terminal panel boyutu değişince gerçek PTY process de resize edilmelidir.

### FR-018 — Terminal rename

Terminal adı değiştirilebilmelidir.

### FR-019 — Terminal duplicate

Terminal aynı profil ve cwd ile çoğaltılabilmelidir.

### FR-020 — Terminal pin

Kullanıcı önemli terminali pinleyebilmelidir.

---

# 10.3 Canvas Üzerinde Çoklu Terminal Paneli

## 10.3.1 Temel yapı

Canvas üzerinde her terminal bir panel/node olarak görünmelidir. Kullanıcı aynı anda birden fazla terminal panelini görebilmeli ve yönetebilmelidir.

Örnek:

```text
┌─────────────────────┐   ┌─────────────────────┐
│ OpenCode Terminal   │   │ Claude Terminal     │
│                     │   │                     │
└─────────────────────┘   └─────────────────────┘

┌─────────────────────┐   ┌─────────────────────┐
│ npm run dev         │   │ Python API          │
│                     │   │                     │
└─────────────────────┘   └─────────────────────┘
```

## 10.3.2 Terminal panel davranışı

Her terminal panelinde şunlar olmalıdır:

- Başlık çubuğu
- Terminal adı
- Terminal tipi
- Agent tipi varsa agent etiketi
- Process durumu
- Çalışma süresi
- Aktif/pasif göstergesi
- Resize handle
- Minimize
- Maximize
- Restart
- Close
- Terminal ekranı

## 10.3.3 Panel taşıma

Kullanıcı terminal panelini canvas üzerinde sürükleyebilmelidir.

Davranış:

- Drag sırasında panel yarı saydam olabilir.
- Konum canlı güncellenir.
- Bırakıldığında layout kaydedilir.
- Snap-to-grid opsiyonel olmalıdır.

## 10.3.4 Panel boyutlandırma

Kullanıcı terminal panelinin boyutunu elle değiştirebilmelidir.

Minimum boyut:

```text
Width: 420 px
Height: 260 px
```

Varsayılan boyut:

```text
Width: 900 px
Height: 520 px
```

Büyük terminal varsayılanı:

```text
Width: 1100 px
Height: 640 px
```

Resize sonrası:

```text
1. Panel pixel ölçüsü alınır.
2. xterm.js fit addon çalışır.
3. Terminal cols/rows hesaplanır.
4. node-pty resize çağrılır.
5. Layout kaydedilir.
```

## 10.3.5 Panel küçültme

Terminal minimize edilirse process çalışmaya devam etmelidir.

Küçültülmüş panelde:

- Terminal adı
- Durum
- Son aktivite
- Hata rozeti
- Çalışma süresi

gösterilmelidir.

## 10.3.6 Panel büyütme

Terminal paneli maximize edilirse canvas alanını büyük ölçüde kaplamalıdır. Diğer terminaller arka planda çalışmaya devam etmelidir.

## 10.3.7 Focus mode

Aktif terminal büyük gösterilir. Diğer terminaller küçük izleme kartları olarak kenarda gösterilir.

---

# 10.4 Otomatik Sığdırma ve Layout Modları

Kullanıcı terminalleri manuel yerleştirebileceği gibi otomatik sığdırma modlarını da kullanabilmelidir.

## 10.4.1 Layout modları

Desteklenecek modlar:

```text
Manual Layout
Auto Fit All
Auto Grid
Auto Columns
Auto Rows
Focus + Mini Panels
Agent Graph Layout
Compact Monitoring
Split Grid
```

## 10.4.2 Manual Layout

Kullanıcı panelleri istediği gibi taşır ve boyutlandırır. Uygulama sadece konum ve boyutu kaydeder.

## 10.4.3 Auto Fit All

Tüm açık terminal panelleri görünür canvas alanına sığdırılır.

Yerleşim örnekleri:

```text
1 terminal  → Tam alan
2 terminal → 2 kolon
3 terminal → 2 üstte, 1 altta
4 terminal → 2 x 2
5 terminal → 3 x 2, bir boş hücre
6 terminal → 3 x 2
9 terminal → 3 x 3
```

## 10.4.4 Auto Grid

Terminal sayısına ve canvas oranına göre otomatik satır/sütun hesaplanır.

Algoritma:

```text
N = terminal sayısı
columns = ceil(sqrt(N * viewportWidth / viewportHeight))
rows = ceil(N / columns)
cellWidth = viewportWidth / columns
cellHeight = viewportHeight / rows
```

## 10.4.5 Auto Columns

Terminaller dikey kolonlar halinde dizilir.

Kullanım:

```text
Frontend | Backend | AI Agent | Test
```

## 10.4.6 Auto Rows

Terminaller yatay satırlar halinde dizilir.

Kullanım:

```text
Üst: aktif geliştirme
Orta: loglar
Alt: test/git
```

## 10.4.7 Focus + Mini Panels

Aktif terminal büyük, diğerleri küçük panel olarak gösterilir.

Örnek:

```text
┌──────────────────────────────────────────┬──────────────┐
│                                          │ Terminal 2   │
│             ACTIVE TERMINAL              ├──────────────┤
│                                          │ Terminal 3   │
│                                          ├──────────────┤
│                                          │ Terminal 4   │
└──────────────────────────────────────────┴──────────────┘
```

## 10.4.8 Agent Graph Layout

Agentler arası bağlantılara göre otomatik yerleşim yapılır.

Örnek:

```text
Planner → Coder → Tester → Reviewer
             ↓
          Git Agent
```

## 10.4.9 Compact Monitoring

Her terminal küçük izleme kartına dönüşür.

Kartta:

- Terminal adı
- Durum
- Son 5-10 satır
- CPU/RAM
- Hata rozeti
- Aktivite göstergesi

bulunur.

---

# 10.5 Multi-Agent Canvas Sistemi

## 10.5.1 Agent terminal kavramı

Her agent ayrı bir terminalde çalışmalıdır.

Örnek:

```text
Planner Agent → Claude Code terminali
Coder Agent → Codex terminali
Reviewer Agent → OpenCode terminali
Tester Agent → npm test terminali
Git Agent → Git terminali
```

## 10.5.2 Agent node türleri

Hazır agent node türleri:

```text
Planner Agent
Coder Agent
Reviewer Agent
Tester Agent
Debugger Agent
Git Agent
Documentation Agent
Research Agent
Shell Agent
Ollama Local Agent
Custom Agent
```

## 10.5.3 Agent terminal kartı

Agent terminal kartında ekstra bilgiler gösterilmelidir:

- Agent adı
- Agent tipi
- Model/provider bilgisi
- Bağlı agent sayısı
- Son görev
- Son hata
- Token tahmini
- Çalışma süresi
- Process ID

## 10.5.4 Agent akış örneği

```text
Planner Agent
   ↓
Coder Agent
   ↓
Tester Agent
   ↓
Reviewer Agent
   ↓
Git Agent
```

Alternatif karma akış:

```text
Planner ─────▶ Coder ─────▶ Tester
   │              │             │
   │              ▼             ▼
   │          Debugger ─────▶ Reviewer
   │                            │
   └──────────────────────────▶ Git Agent
```

---

# 10.6 Agent/Terminal Bağlantı Sistemi

## 10.6.1 Bağlantı türleri

Terminal/agent node’ları arasında bağlantı çizgileri kurulabilmelidir.

Bağlantı türleri:

```text
Control Flow
Data Flow
Log Flow
Error Flow
Dependency
Parent/Child
Manual Link
Trigger Link
```

## 10.6.2 Bağlantı görselliği

Bağlantı çizgileri:

- Yön oku içermeli
- Etiket gösterebilmeli
- Tipine göre farklı görünebilmeli
- Aktif/pasif durum gösterebilmeli
- Hata durumunda uyarı rengine dönebilmeli
- İsteğe bağlı animasyonlu veri akışı gösterebilmeli

## 10.6.3 Bağlantı oluşturma

Kullanıcı bağlantıyı şu şekilde oluşturur:

1. Kaynak terminal/agent node’un output port’una tıklar.
2. Hedef node’un input port’una sürükler.
3. Bağlantı tipi seçer.
4. Etiket yazar.
5. Bağlantıyı kaydeder.

## 10.6.4 Bağlantı portları

Port tipleri:

```text
Input Port
Output Port
Control Port
Data Port
Log Port
Error Port
Message Port
```

## 10.6.5 MVP bağlantı davranışı

İlk sürümde bağlantılar görsel ve açıklayıcı olabilir.

MVP’de:

- Bağlantı çizilir.
- Bağlantı tipi saklanır.
- Etiket saklanır.
- Sağ panelde bağlantı bilgisi gösterilir.

## 10.6.6 İleri sürüm bağlantı davranışı

İleri sürümde bağlantılar işlevsel olmalıdır.

Örnekler:

```text
Tester terminalinde "failed" görülürse → Debugger Agent terminaline son 200 satırı gönder.
Planner "TASK_READY" üretirse → Coder Agent’e görev metnini gönder.
Reviewer "APPROVED" derse → Git Agent terminalinde commit komutu öner.
Backend terminali crash olursa → Log Agent’e hata çıktısını gönder.
```

---

# 10.7 Terminal Profilleri

## 10.7.1 Profil oluşturma

Kullanıcı terminal profili oluşturabilmelidir.

Profil alanları:

- Profil adı
- Shell executable
- Arguments
- Working directory
- Environment variables
- Başlangıç komutu
- Renk/tema
- İkon
- Otomatik başlatma
- Scrollback limiti

## 10.7.2 Varsayılan profiller

Uygulama şu profillerle gelmelidir:

```text
PowerShell
PowerShell Core
CMD
WSL Ubuntu
Git Bash
Node Dev
Python
.NET
Claude Code
Codex
OpenCode
Ollama Serve
Ollama Run
SSH
Custom
```

## 10.7.3 AI agent profili

AI agent profillerinde ekstra alanlar:

- Agent adı
- Agent tipi
- Komut
- Model
- Provider
- API key environment variable adı
- Rules/skills klasörü
- Maksimum token notu
- Auto-restart
- Agent açıklaması

---

# 10.8 Komut Şablonları

## 10.8.1 Komut kaydetme

Kullanıcı sık kullandığı komutları kaydedebilmelidir.

Örnek:

```text
npm install
npm run dev
npm run build
python app.py
python -m venv .venv
dotnet watch
git status
git pull
ollama serve
claude
codex
opencode
```

## 10.8.2 Workspace komutları

Her workspace için özel komut listesi olmalıdır.

## 10.8.3 Tek tıkla komut çalıştırma

Seçili terminalde kayıtlı komut tek tıkla çalıştırılabilmelidir.

## 10.8.4 Command palette

`Ctrl + K` ile komut paleti açılmalıdır.

Örnek komutlar:

```text
Create Workspace
Create Terminal
Run npm dev
Open Claude Code
Restart Terminal
Kill All Terminals
Focus Next Terminal
Search Logs
Open Settings
Auto Fit Terminals
Switch to Agent Graph Layout
```

---

# 10.9 Log ve Buffer Yönetimi

## 10.9.1 Scrollback buffer

Her terminal için scrollback buffer tutulmalıdır.

Varsayılan:

```text
10.000 satır
```

Seçenekler:

```text
1.000
5.000
10.000
50.000
100.000
```

## 10.9.2 Pasif terminal buffer

Pasif terminal çıktısı buffer’a yazılmalı, ancak UI sürekli render edilmemelidir.

## 10.9.3 Log dosyasına yazma

Kullanıcı isterse terminal logları diske yazılabilmelidir.

## 10.9.4 Log arama

Terminal çıktısı içinde arama yapılabilmelidir.

## 10.9.5 Hata algılama

Çıktıda şu ifadeler yakalanabilmelidir:

```text
error
exception
failed
fatal
traceback
npm ERR
ModuleNotFound
SyntaxError
TypeError
Permission denied
```

Yakalanan hatalar:

- Terminal kartında rozet olarak
- Sidebar’da uyarı olarak
- Sağ panelde detay olarak

gösterilmelidir.

## 10.9.6 AI log özeti

İleri sürümde terminal çıktısı AI ile özetlenebilmelidir.

---

## 11. Performans Gereksinimleri

Performans bu uygulamanın en kritik alanıdır.

## 11.1 Komut çalışma hızı

Terminal içinde çalıştırılan komutlar gerçek Windows Terminal’e çok yakın hızda çalışmalıdır.

Hedef:

```text
Build / npm / python / git / dotnet / ollama işlemlerinde %95-100 eşdeğer süre.
```

## 11.2 Input gecikmesi

Klavye girdisi ile terminalde görünmesi arasındaki gecikme düşük olmalıdır.

Hedef:

```text
Ortalama input latency < 30 ms
Yoğun durumda < 80 ms
```

## 11.3 Aktif terminal render performansı

Aktif terminal canlı ve hızlı render edilmelidir.

Hedef:

```text
Normal log akışında 60 FPS hissi
Yoğun logda UI donmadan kullanılabilirlik
```

## 11.4 Çoklu görünür terminal performansı

Canvas üzerinde birden fazla terminal görünürken performans korunmalıdır.

Minimum hedef:

```text
5 görünür terminal paneli
10 çalışan terminal process
20 bağlantı
Akıcı pan/zoom
Aktif terminal input gecikmesi < 40 ms
```

İyi seviye hedef:

```text
10 görünür terminal paneli
20 çalışan terminal process
50 bağlantı
Aktif terminal input gecikmesi < 30 ms
```

Üst seviye hedef:

```text
20 görünür/minimize karışık terminal node
30+ çalışan terminal process
100 bağlantı
Monitoring mode ile stabil kullanım
```

## 11.5 Pasif terminal optimizasyonu

Pasif terminallerin output’u doğrudan UI’a yüksek frekansta basılmamalıdır.

Doğru politika:

```text
Aktif terminal → canlı render
Görünür pasif terminal → throttle render
Minimize/offscreen terminal → buffer only
```

## 11.6 IPC batching

PTY çıktıları karakter karakter gönderilmemelidir.

Hedef:

```text
16 ms veya 32 ms batch interval
```

## 11.7 Resize performansı

Terminal resize olayları debounce edilmelidir.

Öneri:

```text
resize debounce: 50-100 ms
```

## 11.8 Bellek yönetimi

Sonsuz string buffer kullanılmamalıdır. Ring buffer veya satır limitli buffer kullanılmalıdır.

## 11.9 Uygulama açılış hızı

Hedef:

```text
Cold start: 2-4 saniye
Warm start: 1-2 saniye
Workspace restore: 1-3 saniye
```

---

## 12. Render Politikası

## 12.1 Active Full Render

Aktif terminal:

- Canlı output alır.
- Tam hız render edilir.
- Klavye input anlık gönderilir.
- Cursor aktif görünür.

## 12.2 Visible Passive Throttled Render

Görünür ama pasif terminal:

- Process çalışır.
- Buffer güncellenir.
- UI güncellemesi throttle edilir.
- Örneğin 250 ms veya 500 ms aralıklarla son output gösterilir.

## 12.3 Minimized Buffer Only

Minimize terminal:

- Process çalışır.
- Buffer güncellenir.
- xterm render durdurulur.
- Sadece aktivite rozeti gösterilir.

## 12.4 Offscreen No Render

Canvas viewport dışında kalan terminal:

- Process çalışır.
- Buffer güncellenir.
- UI render edilmez.
- Viewport’a girince son buffer yüklenir.

## 12.5 Monitoring Mode

Monitoring mode’da terminal kartları tam xterm render yapmayabilir. Sadece son N satır gösterilebilir.

---

## 13. Teknik Mimari

## 13.1 Önerilen teknoloji

Birinci tercih:

```text
Electron + TypeScript + React + xterm.js + node-pty + SQLite
```

Canvas için:

```text
@xyflow/react veya React Flow
```

Terminal için:

```text
xterm.js
xterm-addon-fit
node-pty
Windows ConPTY
```

Veri için:

```text
SQLite
better-sqlite3
```

State için:

```text
Zustand veya Redux Toolkit
```

## 13.2 Neden Electron?

- node-pty ile uyumlu
- Windows PTY desteği güçlü
- Native dependency yönetimi mümkün
- xterm.js entegrasyonu olgun
- Çoklu pencere, tray, hotkey, dosya sistemi erişimi kolay

## 13.3 Ana modüller

```text
App Shell
├── Workspace Manager
├── Terminal Manager
├── PTY Process Manager
├── Canvas Layout Manager
├── Agent Graph Manager
├── Profile Manager
├── Command Manager
├── Buffer Manager
├── Log Manager
├── Settings Manager
├── Performance Monitor
├── AI Agent Manager
├── Update Manager
└── Security Manager
```

## 13.4 Process mimarisi

```text
Electron Main Process
├── PTY Process Manager
├── Workspace DB Access
├── File System Access
├── Shell Discovery
├── Process Monitoring
├── Credential Manager Access
└── IPC API

Renderer Process
├── React UI
├── Canvas / React Flow
├── xterm.js instances
├── Sidebar
├── Right Panel
├── Command Palette
└── Settings UI
```

## 13.5 Terminal veri akışı

```text
User Keyboard
    ↓
Renderer xterm.js
    ↓ IPC
Main Process
    ↓
node-pty
    ↓
Shell Process
    ↓
Command Output
    ↓
node-pty onData
    ↓
Buffer Manager
    ↓
if active or visible → batched IPC
    ↓
Renderer xterm.js write()
```

---

## 14. Veri Modelleri

## 14.1 Workspace

```ts
type Workspace = {
  id: string;
  name: string;
  path: string;
  description?: string;
  icon?: string;
  defaultProfileId?: string;
  defaultLayoutMode: LayoutMode;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
};
```

## 14.2 Terminal

```ts
type TerminalSession = {
  id: string;
  workspaceId: string;
  name: string;
  profileId?: string;
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  processId?: number;
  status: "running" | "stopped" | "error" | "exited";
  isActive: boolean;
  bufferLineCount: number;
  unreadActivity: boolean;
  createdAt: string;
  updatedAt: string;
};
```

## 14.3 Terminal Node

```ts
type TerminalNode = {
  id: string;
  workspaceId: string;
  terminalId: string;
  title: string;
  nodeType: "terminal" | "agent" | "service" | "database" | "test" | "custom";
  agentType?: "claude" | "codex" | "opencode" | "ollama" | "custom";
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  zIndex: number;
  isActive: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  status: "idle" | "running" | "waiting" | "error" | "completed" | "stopped";
  ports?: NodePort[];
  metadata?: Record<string, unknown>;
};
```

## 14.4 Node Port

```ts
type NodePort = {
  id: string;
  nodeId: string;
  name: string;
  direction: "input" | "output";
  portType: "control" | "data" | "log" | "error" | "message";
};
```

## 14.5 Agent Connection

```ts
type AgentConnection = {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  sourcePortId?: string;
  targetNodeId: string;
  targetPortId?: string;
  connectionType:
    | "control"
    | "data"
    | "log"
    | "error"
    | "dependency"
    | "parent_child"
    | "manual"
    | "trigger";
  label?: string;
  isActive: boolean;
  status: "idle" | "active" | "error" | "disabled";
  createdAt: string;
  updatedAt: string;
};
```

## 14.6 Canvas Layout

```ts
type CanvasLayout = {
  workspaceId: string;
  nodes: TerminalNode[];
  connections: AgentConnection[];
  layoutMode: LayoutMode;
  viewport: {
    zoom: number;
    offsetX: number;
    offsetY: number;
  };
  selectedNodeId?: string;
  selectedConnectionId?: string;
  updatedAt: string;
};
```

## 14.7 Layout Mode

```ts
type LayoutMode =
  | "manual"
  | "auto_fit"
  | "grid"
  | "columns"
  | "rows"
  | "focus"
  | "agent_graph"
  | "monitoring"
  | "split_grid";
```

## 14.8 Agent Automation Rule

```ts
type AgentAutomationRule = {
  id: string;
  connectionId: string;
  triggerType: "output_contains" | "regex_match" | "process_exit" | "manual" | "timer";
  triggerValue?: string;
  actionType: "send_text" | "run_command" | "forward_logs" | "set_status" | "notify";
  actionValue?: string;
  enabled: boolean;
};
```

---

## 15. Veritabanı Tasarımı

## 15.1 workspaces

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  default_profile_id TEXT,
  default_layout_mode TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,
  settings_json TEXT
);
```

## 15.2 terminals

```sql
CREATE TABLE terminals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_id TEXT,
  shell TEXT NOT NULL,
  args_json TEXT,
  cwd TEXT,
  env_json TEXT,
  auto_start INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
```

## 15.3 terminal_nodes

```sql
CREATE TABLE terminal_nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  node_type TEXT NOT NULL,
  agent_type TEXT,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  z_index INTEGER DEFAULT 0,
  is_minimized INTEGER DEFAULT 0,
  is_maximized INTEGER DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY(terminal_id) REFERENCES terminals(id)
);
```

## 15.4 agent_connections

```sql
CREATE TABLE agent_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  source_port_id TEXT,
  target_node_id TEXT NOT NULL,
  target_port_id TEXT,
  connection_type TEXT NOT NULL,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  status TEXT DEFAULT 'idle',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
```

## 15.5 profiles

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  shell TEXT NOT NULL,
  args_json TEXT,
  env_json TEXT,
  icon TEXT,
  theme_json TEXT,
  settings_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 15.6 command_templates

```sql
CREATE TABLE command_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  description TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 15.7 agent_automation_rules

```sql
CREATE TABLE agent_automation_rules (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT,
  action_type TEXT NOT NULL,
  action_value TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 15.8 terminal_logs

```sql
CREATE TABLE terminal_logs (
  id TEXT PRIMARY KEY,
  terminal_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  log_file_path TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  size_bytes INTEGER,
  FOREIGN KEY(terminal_id) REFERENCES terminals(id)
);
```

---

## 16. UI/UX Gereksinimleri

## 16.1 Ana ekran

Ana ekran şu bölümlerden oluşmalıdır:

1. Sol sidebar
2. Üst toolbar
3. Canvas alanı
4. Terminal node/panelleri
5. Agent bağlantı çizgileri
6. Terminal paneli içi info alanı
7. Alt status bar
8. Zoom/layout kontrolleri

## 16.2 Sol sidebar

İçerik:

- Filter/search
- Workspace listesi
- Workspace içindeki terminaller
- Agent listesi
- Terminal grupları
- Komutlar
- Ayarlar

Örnek:

```text
Filter

Workspaces
▾ Reports
  ◉ OpenCode
  ◉ Claude Agent
  ◉ npm dev
  ◉ Python API

▾ Agents
  Planner
  Coder
  Tester
  Reviewer

▾ SSH
  VPS
  Production
```

## 16.3 Üst toolbar

Butonlar:

- Run
- New Terminal
- New Agent
- Auto Fit
- Layout Mode
- Connect Nodes
- Open Folder
- Search
- Command Palette
- Settings
- Export Layout

## 16.4 Canvas

Canvas özellikleri:

- Grid arka plan
- Zoom in/out
- Pan
- Node drag
- Node resize
- Node select
- Connection draw
- Multi-select
- Snap-to-grid
- Mini-map
- Fit view
- Reset view

## 16.5 Terminal paneli

Terminal paneli başlığında:

- Terminal adı
- Shell/agent tipi
- Aktif/pasif rozeti
- Çalışma süresi
- PID
- Minimize
- Maximize
- Restart
- Close

Terminal gövdesinde:

- xterm.js terminal
- Copy/paste
- Sağ tık menüsü
- Search
- Scrollback

## 16.6 Terminal paneli içi info alanı

Sekmeler:

```text
Context
Process
Logs
Agent
Connection
Git
Performance
Settings
```

Seçili terminal için:

- Terminal adı
- Process ID
- Shell
- CWD
- Durum
- CPU/RAM
- Son komut
- Son hata
- Buffer satır sayısı
- Bağlantılar

Seçili bağlantı için:

- Kaynak node
- Hedef node
- Bağlantı tipi
- Etiket
- Aktif/pasif
- Otomasyon kuralı

---

## 17. Özelleştirme Gereksinimleri

## 17.1 Tema

Desteklenecek temalar:

- Dark
- Light
- System
- Custom

Varsayılan tema koyu olmalıdır.

Önerilen CSS değişkenleri:

```css
:root {
  --bg-main: #111318;
  --bg-sidebar: #1a1b20;
  --bg-panel: #20242c;
  --bg-terminal: #141820;
  --border-soft: #2f3440;
  --accent: #2f80ff;
  --accent-soft: rgba(47, 128, 255, 0.25);
  --active-border: #f5e642;
  --text-primary: #e8eaf0;
  --text-secondary: #a0a7b4;
  --text-muted: #6f7685;
  --danger: #ff4d4f;
  --warning: #f6c343;
  --success: #3fb950;
}
```

## 17.2 Aktif terminal border

Kullanıcı aktif terminal border rengini seçebilmelidir.

Varsayılan seçenekler:

```text
Blue
Yellow
Green
Purple
Red
Custom
```

Kullanıcının görselindeki sarı kutu mantığı için `Yellow Active Border` hazır tema olarak sunulmalıdır.

## 17.3 Terminal fontları

Desteklenecek fontlar:

- Cascadia Mono
- Cascadia Code
- JetBrains Mono
- Fira Code
- Consolas
- Custom font family

## 17.4 Layout özelleştirme

Kullanıcı ayarlayabilmelidir:

- Sidebar genişliği
- Sağ panel genişliği
- Canvas grid görünürlüğü
- Grid boyutu
- Snap-to-grid
- Node border kalınlığı
- Terminal opacity
- Bağlantı çizgisi tipi
- Bağlantı animasyonu
- Zoom seviyesi
- Varsayılan terminal boyutu

---

## 18. AI Coding Tool Entegrasyonu

## 18.1 Claude Code

Profil:

```text
Name: Claude Code
Command: claude
Working Directory: workspace path
```

Özellikler:

- Tek tıkla başlat
- Proje klasöründe aç
- Agent node olarak göster
- Bağlantı kur
- Sağ panelde agent bilgisi göster

## 18.2 Codex

Profil:

```text
Name: Codex
Command: codex
Working Directory: workspace path
```

## 18.3 OpenCode

Profil:

```text
Name: OpenCode
Command: opencode
Working Directory: workspace path
```

## 18.4 Ollama

Profil örnekleri:

```text
ollama serve
ollama run llama3
ollama list
```

## 18.5 Custom agent

Kullanıcı kendi agent komutunu tanımlayabilmelidir:

```text
python agent.py
node agent.mjs
dotnet run
```

---

## 19. Güvenlik Gereksinimleri

## 19.1 Komut güvenliği

Tehlikeli komutlarda uyarı verilebilir:

```text
rm -rf
del /s /q
format
powershell -EncodedCommand
curl ... | powershell
Invoke-Expression
```

## 19.2 API key güvenliği

API key değerleri açık metin saklanmamalıdır.

Windows için öneri:

```text
Windows Credential Manager
```

## 19.3 Log gizliliği

Log kaydı varsayılan olarak kapalı olabilir. Kullanıcı açarsa workspace bazında saklanmalıdır.

## 19.4 Workspace izolasyonu

Her terminal kendi cwd ve env ayarlarıyla çalışmalıdır.

## 19.5 SSH güvenliği

Parola saklamak yerine key-based auth önerilmelidir.

---

## 20. Ayarlar Ekranı

Ayar bölümleri:

```text
General
Appearance
Terminal
Canvas
Profiles
AI Agents
Keyboard Shortcuts
Performance
Logs
Security
Updates
About
```

## 20.1 Performance ayarları

Kullanıcı ayarlayabilmelidir:

- Scrollback satır limiti
- Pasif terminal render politikası
- IPC batch interval
- Render throttle
- Max terminal process sayısı
- Log dosyası limiti
- Auto cleanup
- GPU acceleration on/off
- Startup restore
- Auto Fit davranışı
- Monitoring mode satır sayısı

---

## 21. Klavye Kısayolları

Varsayılan:

```text
Ctrl + `          Yeni terminal
Ctrl + Shift + `  Yeni agent terminali
Ctrl + K          Komut paleti
Ctrl + Tab        Sonraki terminal
Ctrl + Shift+Tab  Önceki terminal
Ctrl + W          Terminal kapat
Ctrl + R          Terminal restart
Ctrl + F          Terminal içinde ara
Ctrl + Shift+C    Kopyala
Ctrl + Shift+V    Yapıştır
Ctrl + Plus       Zoom in
Ctrl + Minus      Zoom out
Ctrl + 0          Zoom reset
Ctrl + Alt + F    Auto Fit All
Ctrl + Alt + G    Agent Graph Layout
F11               Focus mode
```

Kullanıcı tüm kısayolları değiştirebilmelidir.

---

## 22. Paketleme ve Dağıtım

Windows için:

- NSIS installer
- MSI installer
- Portable ZIP opsiyonu

Gereksinimler:

- Auto-update desteği
- Code signing desteği
- Kullanıcı data dizini
- Crash log
- App version bilgisi

---

## 23. Önerilen Paketler

Ana paketler:

```text
electron
typescript
react
xterm
xterm-addon-fit
node-pty
@xyflow/react
better-sqlite3
zustand
lucide-react
zod
nanoid
pidusage
electron-store
```

Opsiyonel:

```text
chokidar
monaco-editor
electron-updater
keytar
```

---

## 24. Önerilen Klasör Yapısı

```text
maestri-terminal/
├── apps/
│   └── desktop/
│       ├── electron/
│       │   ├── main/
│       │   │   ├── ipc/
│       │   │   ├── pty/
│       │   │   ├── workspace/
│       │   │   ├── profiles/
│       │   │   ├── graph/
│       │   │   ├── logs/
│       │   │   └── database/
│       │   └── preload/
│       └── renderer/
│           ├── components/
│           ├── features/
│           │   ├── sidebar/
│           │   ├── terminal/
│           │   ├── canvas/
│           │   ├── agent-graph/
│           │   ├── workspace/
│           │   ├── settings/
│           │   └── command-palette/
│           ├── stores/
│           ├── styles/
│           └── utils/
├── packages/
│   ├── shared/
│   ├── terminal-core/
│   ├── graph-core/
│   └── ui/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── PERFORMANCE.md
│   └── SECURITY.md
└── README.md
```

---

## 25. Geliştirme Aşamaları

## Aşama 1 — Teknik iskelet

- Electron + React + TypeScript kurulumu
- Ana pencere
- xterm.js kurulumu
- node-pty ile PowerShell başlatma
- Input/output akışı

Çıktı:

```text
Uygulama içinde çalışan tek terminal
```

## Aşama 2 — Çoklu terminal altyapısı

- Terminal Manager
- Birden fazla PTY process
- Terminal ID sistemi
- Aktif/pasif terminal modeli
- Buffer sistemi

Çıktı:

```text
Aynı uygulamada çoklu terminal
```

## Aşama 3 — Canvas terminal panelleri

- React Flow / XYFlow entegrasyonu
- Terminal node
- Panel drag
- Panel resize
- Panel focus
- Panel minimize/maximize

Çıktı:

```text
Canvas üzerinde birden çok terminal paneli
```

## Aşama 4 — Auto layout

- Auto Fit All
- Grid
- Columns
- Rows
- Focus mode
- Monitoring mode

Çıktı:

```text
Terminal panellerini otomatik sığdırma
```

## Aşama 5 — Workspace ve kayıt

- SQLite DB
- Workspace oluşturma
- Terminal kaydetme
- Canvas layout kaydetme
- Restore

Çıktı:

```text
Proje bazlı kalıcı terminal çalışma alanı
```

## Aşama 6 — Agent graph

- Agent node türleri
- Connection çizgileri
- Port sistemi
- Bağlantı tipi
- Bağlantı etiketi
- Sağ panelde bağlantı bilgisi

Çıktı:

```text
Multi-agent görsel workflow
```

## Aşama 7 — Performans optimizasyonu

- Output batching
- Ring buffer
- Passive terminal throttling
- Offscreen render kapatma
- Resize debounce
- Stress test

Çıktı:

```text
Çoklu terminalde yüksek performans
```

## Aşama 8 — AI agent entegrasyonları

- Claude Code
- Codex
- OpenCode
- Ollama
- Custom agent

Çıktı:

```text
AI coding terminal workspace
```

## Aşama 9 — Profesyonel özellikler

- Log arama
- Komut şablonları
- Process monitor
- Settings
- Theme customization
- Auto-update

Çıktı:

```text
Beta ürün
```

---

## 26. Test Planı

## 26.1 Fonksiyonel testler

- Workspace oluşturma
- Workspace silme
- Terminal oluşturma
- PowerShell açma
- CMD açma
- WSL açma
- Git Bash açma
- Claude/OpenCode/Codex komut profili açma
- Terminale yazma
- Aktif terminal değiştirme
- Pasif terminalin çalışmaya devam etmesi
- Terminal paneli taşıma
- Terminal paneli resize
- Auto Fit All
- Grid Layout
- Agent bağlantısı oluşturma
- Bağlantı etiketi değiştirme
- Workspace restore

## 26.2 Performans testleri

### Test 1 — Yoğun output

```bat
for /L %i in (1,1,10000) do @echo line %i
```

Beklenti:

- UI donmamalı
- Aktif terminal kullanılabilir kalmalı
- Buffer limiti uygulanmalı

### Test 2 — Çoklu process

Aynı anda:

```text
npm run dev
python app.py
dotnet watch
ollama serve
claude
codex
opencode
wsl
git bash
```

Beklenti:

- Process’ler çalışmalı
- Aktif terminal gecikmesiz kullanılmalı
- Pasif terminaller output üretmeye devam etmeli

### Test 3 — Çoklu canvas terminal

Canvas üzerinde:

```text
10 görünür terminal paneli
20 bağlantı çizgisi
Zoom/pan
Drag/resize
```

Beklenti:

- Canvas kullanılabilir kalmalı
- Aktif terminal input gecikmesi düşük olmalı

### Test 4 — Uzun süreli kullanım

Uygulama 8 saat açık bırakılır.

Beklenti:

- Bellek sızıntısı olmamalı
- Process yönetimi bozulmamalı
- Log dosyaları kontrolsüz büyümemeli

### Test 5 — Workspace restore

Uygulama kapatılıp açılır.

Beklenti:

- Workspace listesi geri gelir
- Terminal node konumları geri gelir
- Bağlantılar geri gelir
- Layout modu korunur

---

## 27. Kabul Kriterleri

MVP tamamlanmış sayılması için:

1. Windows’ta uygulama açılır.
2. Workspace oluşturulur.
3. Workspace içinde en az 5 terminal açılır.
4. Her terminal ayrı process olarak çalışır.
5. Her terminal canvas üzerinde ayrı panel olarak görünür.
6. Terminal panelleri taşınabilir.
7. Terminal panelleri yeniden boyutlandırılabilir.
8. Terminal panelleri minimize/maximize edilebilir.
9. Terminale tıklanınca aktif terminal değişir.
10. Sadece aktif terminal klavye input alır.
11. Pasif terminaller çalışmaya devam eder.
12. Auto Fit All ile terminaller canvas’a sığdırılır.
13. Grid Layout çalışır.
14. En az iki agent/terminal arasında bağlantı çizilir.
15. Bağlantı tipi seçilir.
16. Bağlantı etiketi yazılır.
17. Terminal panelinin içindeki info alanı seçili terminal/agent bilgisini gösterir. Bağlantı bilgileri terminal içi info alanında veya opsiyonel inspector’da gösterilir.
18. Workspace kapatılıp açıldığında layout geri gelir.
19. `npm run dev`, `python`, `git`, `wsl`, `powershell`, `cmd` çalışır.
20. 10.000 satır output testinde UI tamamen donmaz.
21. 10 çalışan terminal ve 20 bağlantı ile uygulama kullanılabilir kalır.
22. Performans gerçek terminal deneyimine yakın olur.

---

## 28. Teknik Riskler ve Çözümler

## Risk 1 — node-pty Windows build sorunları

Çözüm:

- Windows CI kurulmalı.
- Native dependency sürümleri sabitlenmeli.
- Electron rebuild otomasyonu yapılmalı.

## Risk 2 — Çoklu terminalde UI yavaşlaması

Çözüm:

- Aktif terminal tam render
- Pasif terminal throttle
- Minimize/offscreen buffer only
- Output batching
- React state’e output yazmama

## Risk 3 — Canvas içinde xterm performansı

Çözüm:

- Görünmeyen terminal render edilmemeli.
- Monitoring mode kullanılmalı.
- xterm instance lifecycle dikkatli yönetilmeli.

## Risk 4 — Bellek şişmesi

Çözüm:

- Ring buffer
- Scrollback limit
- Log rotation
- Cleanup worker

## Risk 5 — Resize hataları

Çözüm:

- xterm fit addon
- Debounce
- PTY resize sync
- Minimum panel boyutu

## Risk 6 — AI CLI araçlarının farklı davranması

Çözüm:

- Her araç için ayrı profil
- Custom command desteği
- Env override
- Shell seçimi

---

## 29. Ürün Konumlandırması

Bu uygulama klasik terminal uygulamalarından farklı konumlanmalıdır.

### Windows Terminal

Güçlü genel terminaldir. Ancak multi-agent canvas ve workflow bağlantıları sunmaz.

### VS Code Terminal

Kod editörüne bağlıdır. Bağımsız agent terminal canvas yöneticisi değildir.

### Tabby / Hyper

Terminal odaklıdır. Agent workflow ve görsel node bağlantıları sınırlıdır.

### Maestri Terminal Workspace

```text
Terminal + Workspace + Canvas + Multi-Agent Graph + AI Workflow Manager
```

---

## 30. Başarı Metrikleri

MVP için:

- 10 terminal aynı anda açılabilmeli.
- 5 terminal aynı anda canvas üzerinde görünür kalabilmeli.
- Terminal panelleri sorunsuz taşınıp resize edilebilmeli.
- Auto Fit All doğru çalışmalı.
- 20 bağlantı çizgisi performansı bozmamalı.
- Workspace restore güvenilir olmalı.
- Windows Terminal’e yakın komut çalışma hızı sağlanmalı.

Beta için:

- 20+ terminal process stabil çalışmalı.
- 10 görünür terminal panelinde kabul edilebilir performans sağlanmalı.
- 50 bağlantılı agent graph çalışmalı.
- AI agent profilleri aktif kullanılabilir olmalı.
- Log arama ve komut şablonları tamamlanmalı.
- Bellek sızıntısı olmamalı.

---

## 31. İlk Sprint Görevleri

## Sprint 1

- Electron + React + TypeScript iskeleti
- xterm.js ekleme
- node-pty ile PowerShell açma
- Input/output akışı
- Basit terminal ekranı

## Sprint 2

- Çoklu terminal manager
- Terminal ID
- Aktif/pasif terminal
- Buffer
- Terminal listesi

## Sprint 3

- React Flow canvas
- Terminal node
- Node drag
- Node resize
- Node focus
- xterm fit

## Sprint 4

- Auto Fit All
- Grid layout
- Focus layout
- Monitoring layout

## Sprint 5

- Workspace DB
- Terminal kayıt
- Node layout kayıt
- Restore

## Sprint 6

- Agent node türleri
- Connection çizgileri
- Port sistemi
- Bağlantı modalı
- Sağ panel bağlantı bilgisi

## Sprint 7

- Performans optimizasyonu
- Output batching
- Passive terminal throttling
- Ring buffer
- Stress test

## Sprint 8

- Claude/Codex/OpenCode/Ollama profilleri
- Komut şablonları
- Ayarlar
- Paketleme

---

## 32. Nihai Ürün Tanımı

Maestri Terminal Workspace, Windows üzerinde çalışan, uygulama içinde birden çok gerçek terminal process’i açan, bu terminalleri canvas üzerinde taşınabilir ve yeniden boyutlandırılabilir paneller olarak gösteren, kullanıcıya manuel veya otomatik layout seçenekleri sunan, AI agent terminallerini görsel node’lar halinde yöneten ve agentler arasındaki iş akışını bağlantı çizgileriyle gösteren üst seviye bir geliştirici aracıdır.

Bu ürünün ana farkı şudur:

```text
Kullanıcı terminal pencereleri arasında kaybolmaz.
Tüm proje, tüm terminaller, tüm agentler ve tüm ilişkiler tek canvas üzerinde görünür hale gelir.
```



---

## 33. Önemli UI Düzeltmesi: Info Panel Terminalin İçinde Olmalıdır

Kullanıcı tarafından verilen referans arayüzde sağdaki bilgi alanı, uygulamanın ayrı bir sağ sidebar paneli değildir. Bu bilgi alanı **seçili terminal panelinin içinde**, terminal kartının sağ bölmesi olarak yer almalıdır.

Bu nedenle uygulamada klasik anlamda sürekli görünen ayrı bir uygulama sağ paneli zorunlu değildir. Asıl tasarım şu şekilde olmalıdır:

```text
Canvas
┌─────────────────────────────────────────────────────────────────────┐
│ Terminal Panel / Terminal Node                                      │
│                                                                     │
│  ┌──────────────────────────────────────┬────────────────────────┐  │
│  │ Terminal Output Area                 │ Terminal Info Area     │  │
│  │                                      │                        │  │
│  │ $ opencode                           │ Context                │  │
│  │ $ npm run dev                        │ Tokens                 │  │
│  │ $ git status                         │ LSP                    │  │
│  │                                      │ Model                  │  │
│  │                                      │ Agent Status           │  │
│  └──────────────────────────────────────┴────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Yani her terminal node/panel kendi içinde iki alana ayrılabilir:

1. **Terminal Output Area**
   - Gerçek xterm.js terminal alanı
   - Komut çıktıları
   - Kullanıcı input’u
   - Shell/agent çalışma ekranı

2. **Terminal Info Area**
   - Context bilgisi
   - Token kullanımı
   - Model/provider bilgisi
   - LSP durumu
   - CWD / branch bilgisi
   - Agent durumu
   - Process bilgisi
   - Son hata/uyarı
   - Terminal çalışma süresi

Bu alan uygulama genelinde ayrı bir sağ panel gibi değil, doğrudan terminal kartının içinde gösterilmelidir.

---

## 33.1 Terminal Panel İç Yerleşimi

Her terminal paneli şu iç yapıya sahip olmalıdır:

```text
┌────────────────────────────────────────────────────────────┐
│ Header: Terminal Name / Agent Type / Status / Actions      │
├──────────────────────────────────────┬─────────────────────┤
│                                      │                     │
│ Terminal Output Area                 │ Terminal Info Area  │
│ xterm.js                             │ Context             │
│                                      │ Model               │
│                                      │ Tokens              │
│                                      │ LSP                 │
│                                      │ Process             │
│                                      │ Git                 │
│                                      │                     │
├──────────────────────────────────────┴─────────────────────┤
│ Footer: cwd / branch / provider / status / command hints    │
└────────────────────────────────────────────────────────────┘
```

### Terminal Info Area genişliği

Varsayılan:

```text
260 px - 340 px
```

Kullanıcı değiştirebilmelidir.

Minimum:

```text
220 px
```

Info alanı kapatılabilir olmalıdır.

---

## 33.2 Terminal Info Area Davranışı

Terminal info alanı terminal tipine göre değişmelidir.

### Normal terminal için

Gösterilecek bilgiler:

- Shell tipi
- CWD
- Process ID
- Çalışma süresi
- Git branch
- Son komut
- Son exit code
- CPU/RAM
- Buffer satır sayısı

### AI agent terminali için

Gösterilecek bilgiler:

- Agent adı
- Agent tipi
- Model/provider
- Token tahmini
- Context kullanımı
- LSP durumu
- Son görev
- Son düşünme/süre bilgisi
- Bağlı agentler
- Son hata/uyarı

### Servis terminali için

Örneğin `npm run dev`, `python api.py`, `dotnet watch`:

- Port bilgisi
- URL
- Process status
- Restart count
- Son hata
- Son log özeti

---

## 33.3 Uygulama Sağ Paneli Opsiyonel Olmalıdır

Önceki bölümlerde bahsedilen “terminal paneli içi info alanı” uygulama arayüzünde sabit ve zorunlu bir panel olarak değerlendirilmemelidir.

Yeni tasarım kararı:

```text
Ana bilgi gösterimi terminal panelinin içindeki Terminal Info Area içinde yapılacaktır.
```

Opsiyonel olarak uygulamada ayrı bir global inspector panel bulunabilir; ancak MVP için zorunlu değildir.

MVP’de öncelik:

```text
Her terminal node kendi info panelini içinde taşımalıdır.
```

Opsiyonel global inspector:

- Seçili node detaylarını geniş gösterebilir.
- Agent bağlantı detaylarını gösterebilir.
- Debug/performans için kullanılabilir.
- Kullanıcı isterse açıp kapatabilir.

---

## 33.4 Canvas Üzerindeki Çoklu Terminal Görünümü

Canvas üzerinde birden çok terminal olduğunda her terminal kendi info alanını içinde taşıyabilir.

Örnek:

```text
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ OpenCode Terminal             │    │ Claude Planner                │
├────────────────────┬──────────┤    ├────────────────────┬──────────┤
│ Terminal Output    │ Info     │    │ Terminal Output    │ Info     │
│                    │ Context  │    │                    │ Tokens   │
│                    │ LSP      │    │                    │ Model    │
└────────────────────┴──────────┘    └────────────────────┴──────────┘
```

Küçük boyutlu terminal panellerinde info alanı otomatik gizlenebilir.

Davranış:

```text
Panel genişliği > 900 px → Info area görünür
Panel genişliği 650-900 px → Info area kompakt görünür
Panel genişliği < 650 px → Info area gizlenir, ikonla açılır
```

---

## 33.5 PRD Genelinde Tasarım Notu

Bu PRD’de geçen “sağ panel”, “info panel”, “context panel” ifadeleri öncelikli olarak **terminal panelinin içindeki sağ bilgi alanı** olarak anlaşılmalıdır.

Uygulama genelinde ayrıca sabit bir sağ sidebar bulunması zorunlu değildir. Referans görseldeki doğru yapı:

```text
Terminal kartı içinde:
Sol taraf → terminal çıktısı
Sağ taraf → terminal/agent info alanı
```

Bu düzeltme tasarım kararlarında bağlayıcıdır.
