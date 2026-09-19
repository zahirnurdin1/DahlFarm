# DahlFarm

Bot otomatis untuk membuat akun di [Dahl Inference](https://inference.dahl.global/) dengan auto allocate token ke API key.

## Fitur

- Buat banyak akun secara otomatis (jumlah bisa ditentukan)
- Pilihan mode **headless** atau **tampilkan browser**
- Pilihan username **bawaan website** atau **random** (auto retry jika taken)
- Auto allocate **100% token** ke API key
- Hapus cookies/cache/storage setiap akun baru (fresh session)
- Timeout 2 menit per akun — jika gagal, lanjut ke akun berikutnya
- Output berwarna: hijau (sukses), merah (gagal)
- Credentials disimpan ke `akun.txt` dengan format `fingerprint|apikey`

## Persyaratan

- [Node.js](https://nodejs.org/) v18+
- [Google Chrome](https://www.google.com/chrome/) / Chromium

## Instalasi

```bash
git clone https://github.com/zahirnurdin1/DahlFarm.git
cd DahlFarm
npm install
```

## Penggunaan

```bash
node bot.js
```

Bot akan menanyakan:

```
Mode browser? (1: Headless, 2: Tampilkan browser):
Username? (1: Bawaan website, 2: Random):
Berapa akun yang ingin dibuat?
```

## Output

### Console

```
 [1/5] 877db19b2af601e937847d4e194ea4ad => 100M | sukses
 [2/5] GAGAL - timeout 2 menit, fingerprint tidak muncul
```

### File `akun.txt`

```
877db19b2af601e937847d4e194ea4ad|dahl_3bcpvPEf8mY814yx85N91ymu3g54Vcnrp
342be8634639ce9b6156d3c4b72d4ada|dahl_5SNoUWN8K2kWC1EBEQoAbusvvHwPAE1ki
```

> Hanya akun yang berhasil dibuat yang disimpan ke file.

## Alur Bot

1. Buka halaman `/account`
2. Klik **Create account**
3. Isi username (bawaan/random, auto retry jika taken)
4. Submit dan tunggu fingerprint (max 2 menit)
5. Simpan fingerprint & API key
6. Centang checkbox dan klik **Continue**
7. Klik **Allocate** pada API key
8. Klik **Max** (100% token)
9. Confirm allocate
10. Clear cookies/cache, ulangi untuk akun berikutnya

## Disclaimer

Tool ini dibuat untuk keperluan edukasi. Gunakan dengan bijak dan tanggung jawab sendiri.
