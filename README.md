# brat lyrics

Bikin video lirik gaya *brat* — teks lowercase, latar hijau, blur tipis — langsung dari browser.

**[Coba di sini →](https://fiqriaulia.github.io/brat-lyrics/)**

![preview](docs/preview.png)

## Abstrak

Bikin video lirik itu kerjaan yang ngeselin: buka editor video, tarik teks satu-satu, geser timeline sampai pas, ulangi enam puluh kali. Padahal buat video lirik bergaya *brat* — satu baris teks, latar polos, tanpa transisi — sebenernya yang dibutuhkan cuma dua hal: daftar kalimat, dan kapan tiap kalimat muncul.

Proyek ini ngambil jalan pintas itu. Lirik bertimestamp (format LRC, atau JSON dari [LRCLIB](https://lrclib.net)) dipakai langsung sebagai timeline. Tiap baris digambar ke `<canvas>` dengan ukuran font yang dihitung otomatis biar penuh sekotak, lalu kanvasnya direkam pakai `MediaRecorder` bareng audio aslinya jadi satu file video.

Masalahnya, timestamp dari database lirik sering meleset — kadang beberapa detik, kadang tiap baris beda-beda. Karena itu ada **tap sync**: putar lagunya, tekan spasi tiap ganti baris, dan waktunya langsung kesimpen. Ngoreksi satu lagu jadi cuma selama lagunya itu sendiri.

Semua jalan di browser. Nggak ada server, nggak ada upload, nggak ada proses render di belakang layar.

## Fitur

![fitur](docs/fitur.gif)

- **Tanpa server** — tiga file statis, nggak ada build step. Buka lokal atau hosting di GitHub Pages, sama aja.
- **Input fleksibel** — JSON dari LRCLIB, file `.lrc`, atau tempel teks LRC langsung.
- **Tap sync** — benerin timing yang meleset sambil lagunya jalan, lengkap sama undo yang ikut mundurin lagunya.
- **Geser timing global** — buat yang telat atau kecepetan sekian detik di semua baris.
- **Preview live** — plus daftar baris yang bisa diklik buat loncat.
- **Export video** — 1:1, 9:16, atau 16:9, lengkap sama audionya.
- **Download LRC** — hasil tap biar timing-nya bisa dipakai lagi lain kali.
- **Render offline** — [`brat_lyrics.py`](brat_lyrics.py) nge-render lewat ffmpeg, jauh lebih cepat tapi tanpa preview.

## Cara pakai

1. Buka `index.html` di browser. Chrome atau Edge paling mulus buat export.
2. **Lirik** — pilih file JSON/LRC, atau tempel teks LRC lalu klik *Pakai LRC ini*.
3. **Audio** — pilih file lagunya. Opsional, tapi wajib kalau mau ada suaranya di video.
4. **Tampilan** — atur ukuran, warna, blur, ukuran font.
5. **Timing** — kalau meleset, pakai geser global atau tap sync.
6. **Export video** — lagunya diputar sekali dari awal sambil direkam. Jangan pindah tab selama proses ini.

Buat nyobain cepat tanpa nyari lirik dulu, muat aja [`sample.lrc`](sample.lrc) yang ada di repo ini.

### Dapetin file liriknya

LRCLIB punya API terbuka. Cari lagunya, simpan hasilnya jadi `.json`, terus muat di aplikasinya:

```
https://lrclib.net/api/search?q=judul+lagu
```

### Shortcut

| Tombol | Fungsi |
| --- | --- |
| `Spasi` | play/pause, atau tap saat mode tap sync |
| `←` `→` | geser 5 detik |
| `T` | mulai tap sync |
| `Backspace` | undo tap terakhir (lagu ikut mundur) |
| `Esc` | batalin tap sync |

## Tap sync

Buat lagu yang timing LRC-nya berantakan:

1. Klik **Mulai tap sync** (atau tekan `T`). Lagu jalan dari awal.
2. Tiap denger baris baru mulai, tekan `Spasi`. Baris berikutnya yang harus di-tap kelihatan di bar bawah preview.
3. Salah tap? `Backspace` — lagu mundur beberapa detik biar bisa langsung coba lagi.
4. Setelah baris terakhir (atau klik *Selesai*), timing baru langsung kepakai.

Setelan tambahan:

- **Mulai dari baris #** — cuma benerin sebagian. Baris yang belum di-tap ikut bergeser sebesar selisih tap terakhir, jadi ritme sisanya nggak rusak.
- **Kompensasi (ms)** — default 100 ms, karena refleks orang biasanya telat dikit dari yang didenger. Masih telat? Naikin.
- **Mundur saat undo (detik)** — seberapa jauh lagu mundur waktu undo.

Timing hasil tap nggak kesimpen otomatis, jadi klik **Download LRC** kalau nggak mau ngulang dari nol.

## Struktur file

```
index.html   rangka halaman
style.css    tampilan
app.js       semua logikanya
fonts/       Archivo Narrow, cadangan buat HP
brat_lyrics.py   renderer offline lewat ffmpeg
sample.lrc   lirik contoh buat nyobain
```

Tiga file pertama saling bergantung, jadi kalau mau jalanin lokal ambil satu folder utuh — bukan cuma `index.html`-nya. Sengaja nggak pakai ES module biar tetap jalan waktu dibuka langsung lewat `file://`, tanpa perlu nyalain server.

## Cara kerjanya

Empat langkah, semuanya di browser:

1. **Parse.** (`parseLRC`) Teks LRC diubah jadi daftar `{mulai, selesai, teks}`. Waktu selesai satu baris diambil dari waktu mulai baris berikutnya, jadi cukup satu timestamp per baris.
2. **Layout.** (`layout`) Tiap baris dicari ukuran font terbesar yang masih muat sekotak, lewat binary search pakai `measureText`. Hasilnya di-cache, karena baris yang sama sering muncul berkali-kali di satu lagu.
3. **Render.** (`draw`) Tiap frame nggambar ulang kanvas: latar polos, teks lowercase, blur pakai `ctx.filter`. Posisi waktunya diambil dari `audio.currentTime` biar nggak pernah ngedrift dari lagunya.
4. **Rekam.** `canvas.captureStream()` digabung sama audio lewat `AudioContext`, terus disuapin ke `MediaRecorder`. Hasilnya blob yang langsung di-download.

Konsekuensinya: perekaman jalan real-time. Lagu tiga menit ya tiga menit, dan browser harus tetep di depan selama itu. Kalau butuh cepat, pakai versi CLI-nya yang nge-render frame langsung ke ffmpeg tanpa nunggu.

## Hosting & privasi

Nggak ada backend, jadi cukup hosting statis apa pun. Repo ini udah bawa workflow [`pages.yml`](.github/workflows/pages.yml) yang nge-deploy otomatis tiap push ke `main`:

1. Push repo-nya ke GitHub.
2. Buka **Settings → Pages**, bagian *Source* pilih **GitHub Actions**.
3. Tunggu workflow-nya jalan. Situsnya muncul di `https://<username>.github.io/<repo>/`.

Workflow-nya udah pakai `enablement: true`, jadi harusnya nyalain Pages sendiri. Tapi di sebagian repo token bawaan Actions nggak dibolehin bikin site Pages (`Resource not accessible by integration`) — kalau kena itu, nyalain manual lewat langkah 2 di atas, atau sekali jalan pakai:

```bash
gh api -X POST repos/<username>/<repo>/pages -f build_type=workflow
```

Yang perlu diingat soal data:

- File lirik dan audio dibaca lewat `FileReader`/`URL.createObjectURL` — nggak pernah ninggalin browser lu.
- Video hasilnya dibikin di memori terus langsung di-download. Nggak ada yang nyangkut di server.
- Yang kesimpen cuma setelan tampilan (ukuran, warna, blur) di `localStorage`, buat kenyamanan aja.
- Artinya kuota GitHub yang kepake cuma buat file statisnya — sekitar seratus kilobyte, nggak peduli berapa banyak video yang dibikin orang.

## Render lewat CLI

Butuh `ffmpeg`, Python 3, dan Pillow:

```bash
python3 brat_lyrics.py search.json -o out.mp4 --audio lagu.mp3 --size 1080x1920
```

Opsi lain: `--index` (pilih lagu di JSON), `--start` / `--end` (render potongan buat ngecek cepat), `--bg`, `--fg`, `--blur`, `--max-font`, `--valign`, `--font`.

## Batasan

- Export pakai `MediaRecorder`, jadi hasilnya `.mp4` di browser yang support dan `.webm` di sisanya. Perekamannya real-time dan browser harus tetep di depan.
- Ganti baris masih potong langsung, belum ada transisi atau animasi per kata.
- Di macOS dan Windows teksnya pakai Arial Narrow bawaan sistem. HP nggak punya font itu, jadi kebagian Archivo Narrow yang ikut di repo ini — lebarnya cuma beda 2%, dan cuma di-download kalau Arial Narrow beneran nggak ada.
- Tap sync ngatur waktu mulai baris. Belum bisa ngedit teksnya, mecah baris, atau gabungin dua baris.

## Rencana

Hal-hal yang kepikiran tapi belum dikerjain:

- Animasi teks muncul per kata.
- Edit teks dan pecah/gabung baris langsung dari daftar.
- Simpan sesi otomatis biar nggak ilang pas refresh.
- Cari lirik langsung dari LRCLIB tanpa download JSON manual.

## Kredit

Timestamp lirik datang dari [LRCLIB](https://lrclib.net). Font cadangan buat HP pakai [Archivo Narrow](https://github.com/Omnibus-Type/ArchivoNarrow) dari Omnibus-Type, lisensi SIL OFL 1.1 ([`fonts/OFL.txt`](fonts/OFL.txt)). Arial Narrow sendiri font komersial punya Monotype, jadi cuma dipakai kalau udah kepasang di sistem — nggak ikut dibagikan di repo ini. Tampilannya jelas terinspirasi dari artwork album *brat*-nya Charli XCX — dibikin buat iseng-iseng bikin video lirik, bukan buat ngaku-ngaku punya siapa pun.

Lirik lagu itu karya berhak cipta. Repo ini sengaja nggak nyimpen file lirik atau audio apa pun; lihat [`.gitignore`](.gitignore).

## Lisensi

[MIT](LICENSE)
