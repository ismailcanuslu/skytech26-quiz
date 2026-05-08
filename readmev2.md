# Kahoot Backend - Frontend Client Rehberi

Bu dokuman, frontend istemcilerinin backend ile hizli entegrasyon yapmasi icin hazirlanmistir.

## 1) Ortam ve Base URL

- Lokal API (docker compose ile): `http://localhost:8080`
- SignalR Hub: `http://localhost:8080/hubs/game`
- Tanimli roller:
  - `Admin`
  - `Player`

## 2) Kimlik Dogrulama

### 2.1 Admin Login

`POST /api/auth/admin/login`

Request:

```json
{
  "email": "admin@kahoot.local",
  "password": "Admin123!"
}
```

Response:

```json
{
  "accessToken": "<jwt>",
  "expiresAtUtc": "2026-05-08T12:00:00Z"
}
```

Admin gerektiren endpoint'lerde header:

`Authorization: Bearer <admin-jwt>`

### 2.2 Player Token

Player token iki sekilde alinabilir:

1. Direkt token endpoint'i:
   - `POST /api/auth/player/token`
2. Oyun katilim endpoint'i (onerilen):
   - `POST /api/gamesession/join`

Player token icinde:

- `role=Player`
- `nickname`
- `sessionId`

## 3) Oyun Akisi (REST)

## 3.0 Admin Quiz CRUD (Frontend icin kritik)

Frontend'in localStorage yerine backend kullanimina gecmesi icin bu endpoint'ler vardir.

- `GET /api/admin/quizzes` -> quiz listesi
- `GET /api/admin/quizzes/{id}` -> quiz detay (sorular + secenekler)
- `POST /api/admin/quizzes` -> yeni quiz
- `PUT /api/admin/quizzes/{id}` -> quiz guncelle
- `DELETE /api/admin/quizzes/{id}` -> quizi pasife al (`isActive=false`)
- `POST /api/admin/quizzes/{id}/questions` -> soruyu ve seceneklerini ekle
- `PUT /api/admin/quizzes/{quizId}/questions/{questionId}` -> soruyu guncelle
- `DELETE /api/admin/quizzes/{quizId}/questions/{questionId}` -> soruyu sil

Not:

- Tum endpoint'ler `Admin` JWT ister.
- Soru seceneklerinde tam olarak 1 tane dogru cevap olmasi zorunludur.

## 3.1 Oyun Baslatma (Admin)

`POST /api/gamesession/start`

Request:

```json
{
  "quizId": "00000000-0000-0000-0000-000000000000"
}
```

Response:

```json
{
  "gamePin": "123456"
}
```

Not: `gamePin` her zaman tam 6 haneli sayisal stringdir.

## 3.2 Oyuncu Katilim (Guest/Player)

`POST /api/gamesession/join`

Request:

```json
{
  "gamePin": "123456",
  "nickname": "ismail"
}
```

Response:

```json
{
  "gamePin": "123456",
  "nickname": "ismail",
  "sessionId": "<session-id>",
  "accessToken": "<player-jwt>",
  "expiresAtUtc": "2026-05-08T12:00:00Z"
}
```

Kurallar:

- `gamePin` tam 6 rakam olmali
- Ayni lobi icinde nickname benzersiz olmali

## 3.3 Sonraki Soru (Admin)

`POST /api/gamesession/{gamePin}/next-question`

Response:

```json
{
  "gamePin": "123456",
  "questionId": "<question-id>",
  "questionIndex": 0,
  "text": "Soru metni",
  "timeLimit": 20,
  "points": 1000,
  "options": [
    { "id": "<opt1>", "text": "A" },
    { "id": "<opt2>", "text": "B" }
  ]
}
```

Not: Admin bu endpoint'i tikladiginda soru acilir. `timeLimit` dolunca backend otomatik olarak:

- `ShowCorrectAnswer` event'ini
- `ShowLeaderboard` event'ini (ilk 10)
- eger son soruysa `EndGame` event'ini

yayinlar.

## 3.4 Oyuncu Cevap Gonderme (Player)

`POST /api/gamesession/{gamePin}/submit-answer`

Request:

```json
{
  "selectedOptionId": "<option-id>",
  "elapsedMilliseconds": 3200
}
```

Response:

```json
{
  "accepted": true
}
```

Notlar:

- Ayni soruya ikinci cevap reddedilir
- Cevap sadece soru aktifken kabul edilir

## 3.5 Dogru Cevap (Admin, Opsiyonel Manuel)

`POST /api/gamesession/{gamePin}/show-correct-answer`

Response:

```json
{
  "gamePin": "123456",
  "questionId": "<question-id>",
  "correctOptionId": "<option-id>",
  "correctOptionText": "Dogru sik"
}
```

## 3.6 Leaderboard (Admin, Opsiyonel Manuel)

`POST /api/gamesession/{gamePin}/show-leaderboard`

Response:

```json
{
  "gamePin": "123456",
  "roundIndex": 3,
  "top10": [
    {
      "sessionId": "<s1>",
      "nickname": "Ali",
      "totalScore": 980.25,
      "roundBasePoints": 877,
      "roundBonusPoints": 795,
      "roundTotalPoints": 1672
    }
  ]
}
```

Puanlama:

- Sadece dogru cevaplayan puan alir.
- Tur baz puani: `min 300, max 999` (hizlandikca artar)
- Tur bonus puani: `min 0, max 999` (dogru cevaplayan oran azaldikca artar)
- Tur toplami: `roundBasePoints + roundBonusPoints`

Detayli matematik:

- `basePoints = clamp(300 + 699 * (kalanSure / toplamSure), 300, 999)`
- `rarityFactor = 1 - (dogruSayisi / toplamOyuncuSayisi)`
- `bonusPoints = clamp(999 * rarityFactor, 0, 999)`
- `roundTotalPoints = basePoints + bonusPoints`

Ornek:

- 200 oyuncu var, 16 kisi dogru bildi -> `rarityFactor = 1 - 16/200 = 0.92`
- bonus yaklasik `999 * 0.92 = 919` (yuvarlama/clamp uygulanir)
- hizli cevaplayan bir oyuncu base puani yuksek alir (300-999 arasi)
- tur puani = base + bonus olarak toplama eklenir

## 3.7 Oyunu Bitirme (Admin)

`POST /api/gamesession/{gamePin}/end`

Response:

```json
{
  "gamePin": "123456",
  "status": "Finished",
  "finalTop10": [
    {
      "sessionId": "<s1>",
      "nickname": "Ali",
      "totalScore": 4200.5,
      "roundBasePoints": 0,
      "roundBonusPoints": 0,
      "roundTotalPoints": 0
    }
  ]
}
```

## 4) SignalR Entegrasyonu

## 4.1 Hub Baglantisi

Hub URL: `http://localhost:8080/hubs/game`

JWT ile baglanin ve ilgili odaya girin:

1. Hub connection olustur
2. `JoinGameGroup(gamePin)` cagir
3. Event'leri dinle

## 4.2 Yayimlanan Event'ler

- `PlayerJoined`
- `NextQuestion`
- `ShowCorrectAnswer`
- `ShowLeaderboard`
- `EndGame`

Tum event payload'lari ilgili REST response modelleriyle uyumludur.

## 5) Sistem Calisma Mantigi (Frontend Icin)

Bu bolum, oyun motorunun hangi adimda ne yaptigini netlestirir.

1. Admin oyunu baslatir (`/gamesession/start`) ve 6 haneli `gamePin` alir.
2. Oyuncular `join` ile girer, player JWT alir, hub grubuna katilir.
3. Admin `next-question` tiklar:
   - soru acilir (`QuestionActive`)
   - backend soru suresi kadar zamanlayici kurar
4. Oyuncular `submit-answer` gonderir:
   - ayni tur icin ikinci cevap kabul edilmez
   - sadece `QuestionActive` iken kabul edilir
5. Sure bitince backend otomatik calisir:
   - dogru cevabi bulur ve `ShowCorrectAnswer` yayar
   - puanlari hesaplar (base + bonus)
   - leaderboard'u gunceller ve `ShowLeaderboard` (ilk 10) yayar
6. Sonraki soruya gecis her zaman admin aksiyonudur:
   - admin tekrar `next-question` tiklar
7. Son sorunun suresi bitince:
   - backend otomatik `EndGame` yayar
   - final top10 ile oyunu `Finished` durumuna alir

Ozet:

- Soruyu acma: admin
- Turu kapatma: otomatik (sure bitimi)
- Sonraki tura gecis: admin
- Oyunu bitirme: son tur suresi bitince otomatik (opsiyonel manuel `/end` de var)

## 6) Minimal Frontend Sirasi

Admin panel:

1. `admin/login`
2. `gamesession/start`
3. Hub'a baglan + `JoinGameGroup(pin)`
4. `next-question`
5. Sure bitimini bekle (otomatik `ShowCorrectAnswer` + `ShowLeaderboard`)
6. Sonraki soru icin tekrar `next-question` tikla
7. Son soruda sure bitince `EndGame` event'ini isle (istersen manuel `end` de cagirabilirsin)

Player panel:

1. `gamesession/join` (token al)
2. Hub'a baglan + `JoinGameGroup(pin)`
3. `NextQuestion` bekle
4. `submit-answer`
5. `ShowCorrectAnswer`, `ShowLeaderboard`, `EndGame` event'lerini isle

## 7) Hata Kodlari (Beklenen)

- `400 BadRequest`: format/validation hatasi
- `401 Unauthorized`: token yok/gecersiz
- `404 NotFound`: pin/session/soru bulunamadi
- `409 Conflict`: nickname cakismasi

## 8) Local Calistirma

1. `.env.example` dosyasini kopyalayip `.env` olusturun
2. Calistirin:
   - `docker compose --env-file .env -f compose.yaml up --build`
3. API hazir oldugunda frontend base URL:
   - `http://localhost:8080`

