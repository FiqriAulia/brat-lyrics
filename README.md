# brat lyrics

Generator video lirik gaya *brat* — teks lowercase, background hijau, blur tipis — langsung dari browser. Tinggal muat file lirik, pilih lagunya, lalu export jadi video.

![preview](docs/preview.png)

## Fitur

- **Jalan di browser, tanpa server.** Buka `index.html`, selesai. File lirik dan lagu nggak ke mana-mana, semua diproses lokal.
- **Input fleksibel.** File JSON hasil [LRCLIB](https://lrclib.net), file `.lrc`, atau tempel teks LRC langsung.
- **Tap sync.** Tempo lagunya meleset? Putar lagunya, tekan `Spasi` tiap ganti baris, timing-nya langsung kesimpen. Ada undo yang sekalian mundurin lagunya.
- **Geser timing global** kalau cuma telat/kecepetan beberapa detik.
- **Preview live** dengan daftar baris di bawahnya yang bisa diklik buat loncat.
- **Export video** 1:1, 9:16, atau 16:9, lengkap dengan audionya.
- **Download LRC** hasil tap biar timing-nya bisa dipakai lagi.
- Ada juga [`brat_lyrics.py`](brat_lyrics.py) buat render offline lewat ffmpeg — lebih cepat, tapi tanpa preview.

## Cara pakai

1. Buka `index.html` di browser (Chrome/Edge paling mulus buat export).
2. **Lirik** — pilih file JSON/LRC, atau tempel teks LRC lalu klik *Pakai LRC ini*.
   File JSON-nya bisa diambil dari LRCLIB, misalnya:
   ```
   https://lrclib.net/api/search?q=judul+lagu
   ```
   Simpan hasilnya jadi `.json`, terus muat di sini.
3. **Audio** — pilih file lagunya. Opsional, tapi butuh ini kalau mau ada suaranya di video.
4. **Tampilan** — atur ukuran, warna, blur, ukuran font.
5. **Timing** — kalau meleset, pakai geser global atau tap sync.
6. **Export video** — lagunya diputar sekali dari awal sambil direkam, jadi durasinya sama dengan lagunya. Jangan pindah tab selama proses ini.

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
2. Tiap denger baris baru mulai, tekan `Spasi`. Baris berikutnya yang harus di-tap muncul di bar bawah preview.
3. Salah tap? `Backspace` buat undo — lagu mundur beberapa detik biar bisa langsung coba lagi.
4. Setelah baris terakhir (atau klik *Selesai*), timing baru langsung kepakai.

Setelan tambahan:

- **Mulai dari baris #** — cuma benerin sebagian. Baris yang belum di-tap ikut bergeser sebesar selisih tap terakhir.
- **Kompensasi (ms)** — default 100 ms, karena tap manusia biasanya telat dikit. Masih telat? Naikin.
- **Mundur saat undo (detik)** — seberapa jauh lagu mundur waktu undo.

Timing hasil tap nggak otomatis kesimpen, jadi klik **Download LRC** kalau nggak mau ngulang.

## Render lewat CLI

Butuh `ffmpeg`, Python 3, dan Pillow:

```bash
python3 brat_lyrics.py search.json -o out.mp4 --audio lagu.mp3 --size 1080x1920
```

Opsi: `--index` (pilih lagu di JSON), `--start` / `--end` (render potongan), `--bg`, `--fg`, `--blur`, `--max-font`, `--valign`, `--font`.

## Catatan

- Export pakai `MediaRecorder`, jadi hasilnya `.mp4` di browser yang support, `.webm` di browser lain. Perekamannya real-time — lagu 3 menit ya 3 menit.
- Font default Arial Narrow. Di Windows/Linux yang nggak punya font itu, tampilannya jatuh ke Arial biasa yang lebih lebar.
- File lirik lagu itu karya berhak cipta. Repo ini sengaja nggak nyimpen file lirik atau audio apa pun — lihat `.gitignore`.

## Lisensi

[MIT](LICENSE)
