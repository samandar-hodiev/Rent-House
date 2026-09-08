# Fayllar bo'yicha qo'llanma

Repozitoriyadagi har bir faylning vazifasi — papka bo'yicha guruhlangan, har
bir faylga bittadan yozuv. Bu qo'llanma [`PROJECT_ARCHITECTURE.md`](../PROJECT_ARCHITECTURE.md)
(loyihaning boshida yozilgan, yuqori darajadagi, lekin hozir eskirgan umumiy
ko'rinish) va [`CLAUDE.md`](../CLAUDE.md) (mahsulot/konvensiya qoidalari) ni
to'ldiradi. Papka daraxtining o'zi uchun [`project-structure.md`](./project-structure.md)ga,
shu qo'llanmaning ingliz tilidagi versiyasi uchun [`file-guide.md`](./file-guide.md)ga qarang.

Qatlamlanish, backend: **Router (`cmd/server/main.go`) → Handler → Service →
Repository → PostgreSQL.** Handler so'rovni bog'laydi va javobni shakllantiradi;
service kim nima qila olishi haqidagi barcha qoidalarni saqlaydi; repository
faqat so'rovlarni bajaradi. Frontend: sahifalar holatni boshqaradi va
komponentlarni birlashtiradi; komponentlar chizadi; `context/` sahifalararo
mijoz holatini saqlaydi; `services/` faqat API'ga murojaat qiladigan yagona
kod; `hooks/` va `utils/` esa o'z UI'siga ega bo'lmagan umumiy mantiq.

---

## Backend (`backend/`)

### `cmd/` — ishga tushirsa bo'ladigan 4 ta narsa

| Fayl | Nima qiladi |
|---|---|
| `cmd/server/main.go` | API'ning o'zi. Konfiguratsiyani yuklaydi, bazaga ulanadi, har bir handler/service/repository'ni bir-biriga bog'laydi, har bir route'ni ro'yxatdan o'tkazadi va tinglashni boshlaydi. Serverning qilgan hamma ishi shu yerdan boshlanadi. |
| `cmd/migrate/main.go` | Sxema o'zgarishlarini qo'llaydi yoki qaytaradi (`go run ./cmd/migrate up\|status\|down --confirm`). Serverdan alohida binary — sxema o'zgarishi ataylab qilinadigan qadam, jarayon qayta ishga tushgani uchun sodir bo'ladigan narsa emas. |
| `cmd/seed/main.go` | Ma'lumotnoma ma'lumotlarini (tumanlar va qulayliklar) bo'sh bazaga qo'shadi. Qayta-qayta ishga tushirish xavfsiz; hech qanday foydalanuvchi yoki e'lon yaratmaydi. |
| `cmd/admin/main.go` | Yangi bazada birinchi owner hisobini yaratadi. Owner yaratilishining yagona yo'li — buning uchun ataylab hech qanday HTTP endpoint yo'q, shunda bu ikki marta ochiq qoldirilishi mumkin bo'lgan eshik bo'lmaydi. |

### `internal/config/` — muhitni o'qish

| Fayl | Nima qiladi |
|---|---|
| `config.go` | Serverga kerak bo'lgan har bir sozlamani environment variable'lardan yuklaydi — baza, JWT, so'rov cheklovlari, OTP siyosati, email/SMS provayderi, yuklash yo'llari, ishonchli proksilar — va agar zarur narsa yo'q yoki xavfsiz bo'lmasa (zaif `JWT_SECRET`, manfiy bo'lmagan cheklov juftligi bo'lmasa), startup vaqtida ochiqchasiga xato beradi. Bu yerda hech bir sirning standart qiymati yo'q. |
| `config_test.go` | `validate()` uchun unit testlar — juda qisqa yoki placeholder JWT secret'ni, musbat bo'lmagan rate-limit juftligini, yomon OTP siyosatini rad etadi. |

### `internal/database/` — PostgreSQL ulanishi va migratsiya bajaruvchisi

| Fayl | Nima qiladi |
|---|---|
| `database.go` | GORM orqali PostgreSQL ulanishini ochadi va ping bilan tekshiradi (GORM'ning `Open`i "dangasa" — noto'g'ri host/parolni startup'da avtomatik ushlamaydi). GORM logini bog'langan parametr qiymatlarini hech qachon logga yozmaydigan qilib sozlaydi. |
| `migrate.go` | Haqiqiy migratsiya dvigateli: ichiga o'rnatilgan `.up.sql`/`.down.sql` juftliklarini yuklaydi, qaysi versiyalar bajarilganini `schema_migrations` jadvalida kuzatadi, va har birini o'z tranzaksiyasi ichida, birma-bir qo'llaydi yoki qaytaradi. |
| `migrate_test.go` | Migratsiya fayllarini juftlash/tartiblash uchun unit testlar. |
| `constraints_integration_test.go` | Haqiqiy PostgreSQL CHECK/UNIQUE cheklovlarini to'g'ridan-to'g'ri (ilova qatlami orqali emas) tekshiradigan integration testlar — sxemaning o'zi da'vo qilganini haqiqatan bajarayotganini tasdiqlaydi. |

### `internal/dto/` — so'rov/javob shakllari

Har bir so'rov ana shulardan biriga bog'lanadi, hech qachon to'g'ridan-to'g'ri
bazaviy modelga emas — aks holda mijoz `password_hash` yoki `id` kabi
o'ziga tegishli bo'lmagan maydonlarni o'rnatishi mumkin bo'lardi. Har bir
javob ham shulardan biri orqali aniq shakllantiriladi.

| Fayl | Nima qiladi |
|---|---|
| `auth.go` | Ro'yxatdan o'tish (3 bosqich), login, parolni tiklash, va `/auth/me` javob shakllari. |
| `apartment.go` | E'lon yaratish/tahrirlash so'rovi (`ApartmentWriteRequest`), qidiruv so'rovi (`ApartmentListQuery`), va e'lon javobi shakli. |
| `chat.go` | Suhbat boshlash, xabar yuborish/tahrirlash/o'chirish, ko'plab o'chirish. |
| `admin.go` | Admin login, admin yaratish, e'lon yoki foydalanuvchi holatini o'zgartirish, sidebar konfiguratsiyasi, sozlamalar payload'i. |
| `analytics.go` | Dashboard grafigi chizadigan ko'rishlar soni vaqt jadvali shakllari (`DayPoint`/`WeekPoint`/`MonthPoint`). |
| `dashboard.go` | Ro'yxatdan o'tgan foydalanuvchining dashboard birinchi ko'rinish javobi: saqlangan e'lonlar va hisoblagichlar. |
| `notification.go` | API qaytaradigan bitta bildirishnoma — tayyor gap emas, tur va data payload — mijoz uni o'qiuvchi tanlagan tilda chizadi. |
| `report.go` | E'lon haqidagi shikoyat — yuborilgandek, admin jadvalida ko'rsatilgandek, va shikoyat qiluvchining o'z tarixida ko'rsatilgandek. |
| `validation.go` | O'zbek telefon raqamini normalizatsiya/tekshirish (`+998...`) va bu uchun maxsus Gin validator tegini ro'yxatdan o'tkazish. |
| `auth_test.go` | Auth DTO'larining normalizatsiya mantig'i uchun unit testlar. |

### `internal/handler/` — HTTP qatlami (bog'lash, topshirish, javob berish)

Bu yerda hech qanday biznes qoidasi va bazaga murojaat yo'q — faqat so'rovni
bog'lash, service'ni chaqirish va natijani status kodiga moslashtirish.

| Fayl | Nima qiladi |
|---|---|
| `auth_handler.go` | Ro'yxatdan o'tish, login, refresh, logout, profilni yangilash, parolni tiklash endpointlari. |
| `apartment_handler.go` | E'lon yaratish/ro'yxatlash/olish/yangilash/o'chirish, egasining o'z e'lonlar ro'yxati va statistikasi. |
| `admin_handler.go` | Har bir admin-dashboard endpointi: login, profil, foydalanuvchilar, e'lonlar, adminlar, sidebar, sozlamalar, rollar/ruxsatlar, dashboard statistikasi. |
| `chat_handler.go` | Suhbat boshlash, suhbatlarni ro'yxatlash, xabarlarni ro'yxatlash/yuborish (matn yoki fayl). |
| `block_handler.go` | Foydalanuvchini bloklash/blokdan chiqarish, kimni bloklaganingizni ro'yxatlash. |
| `favorite_handler.go` | E'lonni saqlash/saqlashdan chiqarish, saqlangan e'lonlarni ro'yxatlash, dashboard xulosasi. |
| `notification_handler.go` | Ikkala bildirishnoma oqimi ham (marketpleys va admin) — bitta handler, chunki ikkalasi bir xil shaklda va qabul qiluvchi qaysi token route talab qilishiga qarab aniqlanadi. |
| `report_handler.go` | E'londan shikoyat qilish, hisobning o'z shikoyat tarixi, admin'ning shikoyat ro'yxati va holat yangilanishlari. |
| `analytics_handler.go` | Egasining ko'rishlar vaqt jadvali va bitta e'lonning o'z vaqt jadvali. |
| `settings_handler.go` | Tashrif buyuruvchining brauzeriga kirishdan oldin kerak bo'lgan, sayt konfiguratsiyasining ommaviy, faqat o'qish uchun bo'lagi (sayt nomi, standart til, texnik xizmat bayrog'i). |
| `upload_handler.go` | Yuklangan e'lon fotosuratini saqlaydi va uning URL'ini qaytaradi. |
| `ws_handler.go` | So'rovni real vaqtli suhbat kanali uchun WebSocket ulanishiga o'zgartiradi. |
| `validation_message_test.go` | Xom Gin bog'lash xatosini, yoki tana-juda-katta xatosini, mijoz uchun xavfsiz xabarga aylantiruvchi yordamchi funksiya uchun unit test (bazasiz). |
| `account_deletion_integration_test.go` | O'chirilgan hisobni qayta o'chirib bo'lmaydi; qator olib tashlanmaydi, balki anonimlashtiriladi. |
| `admin_create_integration_test.go` | Faqat owner administrator yarata oladi — bu API'da ta'minlangan, faqat UI'da yashirilgan emas. |
| `admin_login_lockout_integration_test.go` | Admin login bloklash to'g'ri hisoblanadi va bloklaydi, hamda marketpleys login bloklashlaridan alohida nomlanadi. |
| `admin_profile_integration_test.go` | Admin avatari shu server haqiqatan saqlagan narsa bo'lishi kerak — host-soxtalashtirish tuzatishi to'g'ridan-to'g'ri tekshirilgan. |
| `admin_session_integration_test.go` | Administratorni to'xtatib qo'yish uning ochiq dashboard sessiyalarini ham tugatadi, nafaqat keyingi kirishini. |
| `analytics_integration_test.go` | E'lon kartasidagi ko'rishlar hisoblagichi va analitika grafigi hech qachon bir-biriga zid bo'lmasligi kerak — ikkalasi ham bitta tranzaksiyada yoziladi. |
| `apartment_filters_integration_test.go` | Qidiruv/filtr so'rov parametrlari natija to'plamini da'vo qilganidek haqiqatan toraytiradi. |
| `apartment_integration_test.go` | E'lonlar bo'yicha egalik qoidalari: mijoz egani ko'rsata olmaydi, qoralama faqat muallifiga ko'rinadi. |
| `auth_integration_test.go` | Ro'yxatdan o'tish → login → refresh oqimining butun ketma-ketligi, haqiqiy bazaga qarshi. |
| `block_integration_test.go` | Bloklash faqat bloklovchining o'z ro'yxatidan suhbatni yashiradi; sabab ko'rsatilmasa ham foydalanish mumkin bo'lgan qator hosil bo'ladi. |
| `chat_grouping_integration_test.go` | Ikki kishi qancha ko'p e'lon haqida gaplashmasin, bitta suhbatga ega — guruhlash/rol almashish qoidalari. |
| `chat_settings_integration_test.go` | Mijozga aytilgan biriktirma hajmi/turi cheklovlari server haqiqatan qo'llaydigan cheklovlar bilan bir xil. |
| `conversation_state_integration_test.go` | Suhbatni bog'lash/arxivlash/o'zim uchun o'chirish/qayta ochish xatti-harakati. |
| `dashboard_integration_test.go` | Dashboard'ning birinchi ko'rinish xulosasi endpointi. |
| `listing_status_integration_test.go` | E'lon hayot sikli o'tishlari — faqat interfeys taklif qilgan o'tishlar qabul qilinadi, "o'chirish" esa yumshoq (soft). |
| `login_lockout_integration_test.go` | Marketpleys login bloklash mexanizmi (umumiy jadval, admin'nikidan alohida nomlash). |
| `message_actions_integration_test.go` | Suhbat xabarlari uchun javob berish, olib tashlash, va ko'plab o'chirish qoidalari. |
| `my_reports_integration_test.go` | Shikoyat qiluvchining o'z tarixi qarorni ko'rsatadi va boshqa hech kimning shikoyati haqida hech narsa ko'rsatmaydi. |
| `notification_integration_test.go` | Bildirishnoma turini o'chirib qo'yish umuman qator qoldirmaydi; oqimlar hisoblar orasida kesishmaydi. |
| `password_reset_integration_test.go` | Tiklash havolasi bir marta ishlaydi, yangisini so'rash eskisini bekor qiladi, va endpoint hech qachon manzil ro'yxatdan o'tganmi-yo'qmi deb oshkor qilmaydi. |
| `profile_integration_test.go` | Profil tahrirlari: tegilmagan maydonlar saqlanib qoladi, telefon boshqa hisobdan olinmaydi yoki u yagona aloqa bo'lganda tozalanmaydi. |
| `ratelimit_integration_test.go` | `cmd/server` bog'laydigan tarzda IP-bo'yicha so'rov cheklagichining o'zi. |
| `report_integration_test.go` | Shikoyat bilan bog'liq testlar tomonidan ulashiladigan fixture quruvchi. |
| `session_integration_test.go` | Marketpleys hisoblari uchun refresh-token sessiya mexanikasi. |
| `settings_enforcement_integration_test.go` | Owner o'zgartirgan sozlama (moderatsiya, rasm cheklovlari) haqiqatan yozishga nima ruxsat berilishini o'zgartiradi. |

### `internal/middleware/` — umumiy Gin middleware

| Fayl | Nima qiladi |
|---|---|
| `auth.go` | `Auth` (haqiqiy tokensiz hech kimni o'tkazmaydi), `OptionalAuth` (bor bo'lsa aniqlaydi, aks holda anonim sifatida o'tkazadi), `QueryAuth` (sarlavha o'rnata olmaydigan `<img>`/`<a>` URL'lari uchun so'rov satridan token). |
| `admin.go` | `AdminAuth` (dashboard-ko'lamli token tekshiruvi), `RequireOwner` (faqat owner o'tishi mumkin), `RequireSection` (faqat owner bu dashboard bo'limini o'chirmagan bo'lsa). |
| `cors.go` | Faqat sozlangan manbalardan brauzer so'rovlariga ruxsat beradi, `*` bilan javob berish o'rniga so'rovning o'z manbasini aks ettiradi (wildcard'ni credentials bilan birlashtirib bo'lmaydi). |
| `maintenance.go` | Texnik xizmat rejimi yoqilganda marketpleysni administratorlardan boshqa hammaga yopadi — API'da ta'minlangan, faqat UI'da yashirilgan emas. |
| `ratelimit.go` | Har bir ommaviy, hisobsiz endpoint (ro'yxatdan o'tish, login, parolni tiklash, e'lon yaratish, yuklashlar) ishlatadigan xotiradagi, IP-bo'yicha "sliding window" so'rov cheklagichi. |
| `request_limits.go` | Handler qolgan qismi bilan nima qilishidan qat'iy nazar, server o'qiydigan so'rov tanasi hajmini cheklaydi. |
| `security_headers.go` | Har bir javobga `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` o'rnatadi — CSP yo'q, ataylab (sababi izohda). |
| `auth_test.go` | `Auth`/`OptionalAuth`/`QueryAuth` uchun unit testlar. |
| `cors_test.go` | Manba ruxsat ro'yxati mantig'i uchun unit testlar. |
| `ratelimit_test.go` | So'rov cheklagichi uchun unit testlar (oyna muddati tugashi, kalit bo'yicha izolyatsiya). |
| `request_limits_test.go` | Tana hajmi cheklovi uchun unit testlar. |
| `security_headers_test.go` | Har bir sarlavha har bir javobda o'rnatilganini tasdiqlovchi unit testlar. |

### `internal/models/` — GORM entitylari

Bu yerdagilar ilova uchun sxemani tasvirlaydi; ular sxemani yaratmaydi
(buni `migrations/`dagi SQL fayllari qiladi, ikkalasi ham qo'lda bir-biriga
mos qilib turiladi).

| Fayl | Nima qiladi |
|---|---|
| `models.go` | Har bir entity o'ziga qo'shib oladigan `Base` (UUID asosiy kalit) va `Timestamps` (`created_at`/`updated_at`) strukturalari. |
| `user.go` | Marketpleys hisobi. Rol ustuni yo'q — kimnidir "egasi" qiladigan narsa e'longa egalik qilish, bayroq emas. |
| `admin.go` | Dashboard hisobi — ataylab o'z jadvalida, hech qachon rolga ega `users` qatori sifatida emas. |
| `apartment.go` | Ijara e'loni: narx (`decimal` sifatida, hech qachon float emas), joylashuv, xususiyatlar, holat, e'lon turi. |
| `apartment_image.go` | E'lonning bitta fotosurati, o'z qatorida — shunda fotosuratlarni alohida tartiblash/hisoblash/almashtirish mumkin. |
| `apartment_amenity.go` | E'lonlar va qulayliklar orasidagi bog'lovchi jadval. |
| `apartment_view.go` | E'lonning bitta hisoblangan ko'rishi — `apartments.views_count` ortidagi analitika yozuvi. |
| `amenity.go` | Ma'lumotnoma ma'lumoti: e'lon taklif qila oladigan xususiyat (wifi, avtoturargoh, ...). |
| `district.go` | Ma'lumotnoma ma'lumoti: e'lon joylasha oladigan Toshkent tumanlari. |
| `favorite.go` | Saqlangan (sevimlilar ro'yxatidagi) e'lon. |
| `conversation.go` | Ikki kishi orasidagi yozishma — e'lon bilan emas, juftlik bilan aniqlanadi. |
| `conversation_participant.go` | Bitta odamning suhbatdagi a'zoligi va unga bo'lgan fikri (bog'langan/arxivlangan/o'zi uchun o'chirilgan). |
| `message.go` | Bitta suhbat xabari. Olib tashlash — yumshoq o'chirish; qator qoladi, shunda suhbat o'z shaklini saqlaydi. |
| `message_attachment.go` | Suhbatda yuborilgan fayl; baytlar storage'da yashaydi, bu ularning qayerda ekanini yozadi. |
| `message_deletion.go` | "O'zim uchun o'chirish" — bitta xabarni bitta ishtirokchidan yashiradi, ikkinchisining nusxasiga tegmaydi. |
| `user_block.go` | Bir kishining ikkinchisini eshitishdan bosh tortishi — bir yo'nalishli saqlanadi, ikki tomonlama amal qiladi. |
| `admin_user_block.go` | Administrator marketpleys hisobini bloklagan bitta hodisa (`users.status` ortidagi tarix). |
| `admin_audit_log.go` | Administrator qilgan bitta ish — kirgan, kimnidir bloklagan, sozlamani o'zgartirgan. |
| `admin_refresh_token.go` | Admin dashboard sessiyasining yarmi, `refresh_token.go`ni aks ettiradi. |
| `refresh_token.go` | Marketpleys foydalanuvchisining sessiyasining server yarmi — "chiqish"ni haqiqatan biror narsani anglatadigan qiladigan narsa. |
| `auth_verification.go` | Bitta OTP tekshirish urinishi: xeshlangan kod, urinishlar soni, va to'g'ri bo'lganda berilgan qisqa muddatli token. |
| `listing_report.go` | Bitta e'lon haqidagi bitta shikoyat. |
| `notification.go` | Kimgadir bilinishi kerak bo'lgan bitta narsa — marketpleys va admin oqimi uchun umumiy shakl. |
| `site_setting.go` | Har bir sozlanadigan sayt sozlamasining turdagi deklaratsiyasi (kalit, tur, kategoriya, standart, min/maks) — `internal/service/settings_service.go` tekshiradigan registr. |
| `json_map.go` | `jsonb` ustuni Go map sifatida o'qiladi — GORM uchun kerak bo'lgan `Value`/`Scan` bog'lovchisi. |
| `models_test.go` | Umumiy o'rnatilgan turlar uchun sog'lomlik testlari. |

### `internal/notify/` — tasdiqlash kodlari, email, SMS yuborish

| Fayl | Nima qiladi |
|---|---|
| `sender.go` | Boshqa hamma narsa amalga oshiradigan `Sender` interfeysi, va `DevelopmentSMSSender` (lokal dev uchun yuborish o'rniga logga yozadi). |
| `factory.go` | Environment konfiguratsiyasidan haqiqiy provayderni tanlaydi va sozlaydi — noto'g'ri sozlangan bo'lsa jimgina soxta jo'natuvchiga o'tib ketmaydi. |
| `resend.go` | Resend API orqali tasdiqlash kodi va parolni tiklash email'larini yuboradi. |
| `smtp.go` | Xuddi shu ikki turdagi email'ni oddiy SMTP server orqali yuboradi (Resend'ga muqobil). |
| `eskiz.go` | Eskiz.uz orqali tasdiqlash kodi SMS'larini yuboradi (o'zbek operatorlari tranzaksion SMS'larni lokal shartnomalar orqali yo'naltiradi — bu yozilayotgan vaqtda hali ulanmagan; `CLAUDE.md`ga qarang). |
| `email_template.go` | Ikkala email turi uchun haqiqiy HTML/oddiy matn tanasini chizadi, kod/havola HTML-escape qilingan holda. |
| `provider_test.go`, `sender_test.go`, `smtp_test.go` | Har bir provayder to'g'ri qabul qiluvchiga yuborishini, xavfsiz logga yozishini (logda kod/sir yo'q) va rad etishni xato sifatida ko'rsatishini (yutib yubormasligini) tasdiqlovchi unit testlar. |

### `internal/otp/` — bir martalik kodlar

| Fayl | Nima qiladi |
|---|---|
| `otp.go` | Kriptografik jihatdan tasodifiy 6 xonali kod yaratadi, uni saqlash uchun xeshlaydi, va yuborilgan kodni doimiy vaqt ichida xesh bilan solishtiradi. |
| `otp_test.go` | Yuqoridagilar uchun unit testlar. |

### `internal/realtime/` — WebSocket suhbat kanali

| Fayl | Nima qiladi |
|---|---|
| `hub.go` | Qaysi foydalanuvchilarning jonli ulanishi ochiqligini kuzatadi (bitta foydalanuvchida bir nechtasi bo'lishi mumkin — ikkita tab, telefon) va online holat o'zgarishlarini xabar qiladi. O'zi hech qanday xabarni saqlamaydi. |
| `socket.go` | Haqiqiy `gorilla/websocket` ulanishini hub'ning `Connection` interfeysiga moslashtiradi — har bir socket uchun yozishlarni bitta goroutine orqali ketma-ketlashtiradi, chunki WebSocket bir vaqtda faqat bitta yozuvchiga ruxsat beradi. |

### `internal/repository/` — faqat bazaga murojaat

Bu yerda hech qanday biznes qoidasi yo'q — egalik tekshiruvi yo'q, holat
o'tishlari yo'q, faqat so'rovlar.

| Fayl | Nima qiladi |
|---|---|
| `apartment_repository.go` | E'lonlarni, ularning rasmlarini va qulaylik bog'lanishlarini o'qiydi va yozadi. |
| `admin_listing_repository.go` | Admin dashboard jadvali va tafsilot ko'rinishi uchun faqat o'qish uchun e'lon so'rovlari. |
| `admin_repository.go` | Admin hisoblarini va sidebar ko'rinish konfiguratsiyasini o'qiydi/yozadi. |
| `admin_refresh_token_repository.go` | Admin sessiya saqlash — `refresh_token_repository.go`ni aks ettiradi. |
| `admin_stats_repository.go` | Admin dashboard'ning bosh raqamlari va grafiklari ortidagi hisoblash va o'sish-seriyasi so'rovlari. |
| `analytics_repository.go` | Ko'rish hodisasini (dublikatlardan tozalash mantig'i bilan) yozadi va ko'rishlar sonini kun/hafta/oy bo'yicha to'playdi. |
| `block_repository.go` | Kim kimni bloklagan, va chat yuborish yo'li xabarga ruxsat berishdan oldin tekshiradigan so'rov. |
| `chat_repository.go` | Suhbatlar va xabarlar — suhbatni topish yoki yaratish, xabarlar sahifasini yuklash. |
| `favorite_repository.go` | Saqlangan e'lonlar — qo'shish, olib tashlash, hisoblash, ro'yxatlash. |
| `login_attempt_repository.go` | Ham marketpleys, ham admin login ishlatadigan (alohida nomlangan) umumiy xato-kirish hisoblagichi va bloklash jadvali. |
| `notification_repository.go` | Bildirishnomalarni saqlaydi va ro'yxatlaydi, va kim qabul qilishi kerakligini (hodisani har bir faol adminga tarqatish). |
| `refresh_token_repository.go` | Marketpleys foydalanuvchi sessiya saqlash — yaratish, topish, aylantirish (bir martalik), bekor qilish. |
| `report_repository.go` | E'lonlar haqidagi shikoyatlar — yaratish, bitta e'lon uchun ochiq-hisoblash, admin'ning sahifalangan ro'yxati. |
| `settings_repository.go` | Sayt konfiguratsiyasi uchun xom kalit/qiymat o'qish va yozish. |
| `user_repository.go` | Marketpleys hisoblarini o'qiydi va yozadi. |
| `verification_repository.go` | OTP tekshirish qatorlari — ro'yxatdan o'tish/parolni tiklash kod hayot sikli. |
| `repository_integration_test.go` | Bitta repository'ga tegishli bo'lmagan, kesishuvchi integration testlar (sessiya aylantirish bir martalik kafolati, dublikat-shikoyat rad etilishi). |

### `internal/seed/` — ma'lumotnoma-ma'lumot urug'lantirish mantig'i

| Fayl | Nima qiladi |
|---|---|
| `seed.go` | Yo'q bo'lsa tumanlar va qulayliklarni qo'shadi, mavjud qatorlarga tegmaydi — `cmd/seed` chaqiradigan mantiq. |
| `seed_test.go` | Frontend yubora oladigan har bir qulaylik slug'i haqiqatan urug'lantirilganini tasdiqlaydi. |

### `internal/service/` — biznes qoidalari

Handlerlar HTTP bilan, repositorylar SQL bilan shug'ullanadi; kim nima qila
olishi haqidagi har bir qoida shu yerda yashaydi.

| Fayl | Nima qiladi |
|---|---|
| `auth_service.go` | Ro'yxatdan o'tish, login, parolni tiklash, profil yangilanishlari, hisobni o'chirish — marketpleysning butun shaxsiyat hikoyasi. |
| `apartment_service.go` | Kim e'lon yarata/tahrirlay/ko'ra oladi, qaysi maydonlarga ruxsat berilgan, qachon ommaga ko'rinadigan bo'ladi, tahrirlashda olib tashlangan galereya rasmlarini tozalash. |
| `admin_service.go` | Admin login (bloklash bilan), administratorlarni yaratish/to'xtatib qo'yish, faqat-owner tekshiruvlari. |
| `admin_listing_service.go` | Admin tomonidagi e'lon moderatsiyasi: holat o'tishlari, tafsilot ko'rinishi. |
| `admin_stats_service.go` | Xom baza hisoblarini dashboard grafiklari chizadigan bo'shliqlar to'ldirilgan vaqt seriyasiga aylantiradi. |
| `analytics_service.go` | Ko'rishni yozadi (har bir tashrif buyuruvchi uchun soatiga dublikatlardan tozalangan) va egasining ko'rishlar vaqt jadvalini quradi. |
| `chat_service.go` | Kim suhbatda o'qiy/yoza oladi, xabar tahrirlash/olib tashlash qoidalari, baza yozuvi muvaffaqiyatli bo'lgandan keyin real vaqtli hub'ga uzatish. |
| `favorite_service.go` | E'lonni saqlash/saqlashdan chiqarish, dashboard'ning saqlangan-e'lonlar xulosasi. |
| `listing_expiry.go` | Marketpleys ruxsat bergandan uzoqroq e'lon qilingan e'lonlarni yopadigan fon tozalash (standart bo'yicha o'chirilgan). |
| `notification_service.go` | Odamlarga aytilishi kerak bo'lgan narsani yozadi va o'qiydi; hech narsa yozishdan oldin bildirishnoma turi yoqilganmi-yo'qmi tekshiradi. |
| `password.go` | Tizimdagi har bir parol (ro'yxatdan o'tish, tiklash, admin yaratish) tekshiriladigan yagona parol-kuchliligi qoidasi. |
| `report_service.go` | Kim e'londan shikoyat qila oladi, va yetarlicha shikoyat to'planganda e'lonni moderatsiyaga qaytarish. |
| `settings_service.go` | Saqlangan kalit/qiymat sozlamalarini turdagi `Settings` strukturasiga ajratadi; saqlangan qiymat yo'q yoki noto'g'ri bo'lsa deklaratsiya qilingan standartlarga qaytadi. |
| `settings_registry_test.go` | `Settings` strukturasi va sozlama-kalit registri bir xil maydonlarni tasvirlashini tasdiqlaydi (mos kelmaslik jimgina sozlamani yo'qotib qo'yardi). |
| `apartment_image_cleanup_integration_test.go` | E'lon galereyasini tahrirlash tushirilgan rasm fayllarini diskdan o'chirishini, nafaqat ularning baza qatorlarini, tasdiqlaydi. |
| `settings_integration_test.go` | Owner o'zgartirgan sozlama (moderatsiya yoqilgan/o'chirilgan, rasm soni cheklovlari) haqiqatan yozishga nima ruxsat berilishini o'zgartirishini tasdiqlaydi. |
| `password_test.go` | Parol siyosati uchun unit test. |

### `internal/storage/` — yuklangan fayllar qayerga boradi

| Fayl | Nima qiladi |
|---|---|
| `storage.go` | `Storage` interfeysi va uning yagona amalga oshirilishi, `LocalStorage` (diskdagi papkaga yozadi, statik fayl sifatida xizmat qiladi) — kelajakdagi S3/R2 backend'i qayta yozish emas, yangi tur bo'lishi uchun interfeys. |
| `kinds.go` | Uchta yuklash kategoriyasi (rasm/fayl/audio), ularning qabul qilinadigan MIME turlari → kengaytmalari, va hajm chegaralari. |
| `storage_test.go` | Yuklashlar faqat da'vo qilingan `Content-Type` bilan emas, haqiqiy fayl tarkibi (magic bytes) bilan tekshirilishini tasdiqlaydi. |

### `internal/token/` — JWT'lar

| Fayl | Nima qiladi |
|---|---|
| `token.go` | Imzolangan access tokenlarni tomoshabinga (`renthouse:user`ga qarshi `renthouse:admin`) ko'lamlangan holda yaratadi va tekshiradi, shunda biri hech qachon ikkinchisi talab qilinadigan joyda taqdim etilmaydi. |
| `token_test.go` | Token yaratish/tekshirish/muddati tugashi uchun unit testlar. |

### `migrations/` — sxema, bir marta ko'rib chiqiladigan qadam-baqadam

`migrations.go` quyidagi har bir `.sql` faylini `go:embed` orqali binary'ga
o'rnatadi, shunda serverga runtime'da diskda fayllar kerak bo'lmaydi. Har bir
raqamlangan juftlik (`.up.sql` / `.down.sql`) bitta sxema o'zgarishi, bitta
birlik sifatida qo'llaniladi va qaytariladi.

| Migratsiya | Nimani o'zgartirdi |
|---|---|
| `0001_init` | Boshlang'ich sxema: foydalanuvchilar, tumanlar, e'lonlar, e'lon rasmlari, qulayliklar, sevimlilar, suhbatlar, xabarlar. |
| `0002_auth_verifications` | Telefon-YOKI-email orqali ro'yxatdan o'tish, va OTP tekshirish jadvali. |
| `0003_apartment_listing_details` | `0001` ga joy topmagan egasi-formasi maydonlari: depozit, kommunal to'lovlar, minimal muddat, uy qoidalari, mahalla. |
| `0004_chat` | `0001` ning o'rnini bosuvchisidan tashqari haqiqiy suhbatga kerak bo'lgan narsa: kim boshlagan, tahrirlangan-vaqti, olib-tashlangan-vaqti, o'qilganlik tasdig'i. |
| `0005_message_attachments` | Suhbatda rasmlar, hujjatlar va ovozli xabarlar (xabarlar faqat matn bo'lishdan to'xtaydi). |
| `0006_apartment_views` | Haqiqiy, vaqt tamg'asi qo'yilgan ko'rish hodisalari, oddiy `views_count` oshirish o'rniga. |
| `0007_reconcile_views_count` | `0006`dan oldingi qatorlar uchun `views_count` hisoblagichini `apartment_views` hodisa tarixiga moslashtiruvchi bir martalik orqaga to'ldirish. |
| `0008_conversation_state` | Bog'lash/arxivlash/o'zim-uchun-o'chirish har bir ishtirokchi holati sifatida, suhbat haqidagi faktlar emas. |
| `0009_direct_conversations` | Suhbat shaxsini (e'lon, xaridor) juftligi emas, odamlar juftligi sifatida qayta belgilaydi — necha e'lon haqida gaplashmasin, bitta suhbat. |
| `0010_conversation_hidden_cleared` | "Bu suhbat mening ro'yxatimdan chiqdi"ni "bu eski xabarlar endi mening o'qishim uchun emas"dan ajratadi, shunda tushirilgan suhbatni qayta ochish tarixni yo'q qilmaydi. |
| `0011_user_blocks` | Bir kishi ikkinchisini eshitishdan bosh tortishi. |
| `0012_normalize_conversation_pair` | Suhbat juftligini tartibsiz qiladi, shunda kim "xaridor" va kim "egasi" ekani almashganda xuddi shu ikki kishi ikkinchi suhbatga ega bo'lib qolmaydi. |
| `0013_message_replies` | Xabar javob berayotgan xabarga ishora qila oladi. |
| `0014_apartment_deleted_status` | "O'chirish" qator olib tashlash emas, holatga aylanadi — e'longa ishora qilgan hamma narsa ishlashda davom etadi. |
| `0015_verification_token_rename` | Parolni tiklash ro'yxatdan o'tish allaqachon ega bo'lgan token mexanizmini qayta ishlatishi uchun ustunni qayta nomlaydi. |
| `0016_admins` | `admins` jadvali — dashboard hisoblari, `users`dan strukturaviy jihatdan alohida saqlanadi. |
| `0017_admin_users` | `users.status` (bloklangan/faol) va admin hisobining o'z holat maydonini qo'shadi. |
| `0018_user_block_reasons` | Marketpleys hisobi nima uchun/qachon/kim tomonidan bloklanganining tarix jadvali. |
| `0019_message_delete_audit` | Olib tashlangan xabarning original matnini va kim olib tashlaganini moderatsiya uchun saqlaydi. |
| `0020_admin_audit_logs` | Ilgari mock qilingan admin audit jurnali sahifasi ortidagi jadval. |
| `0021_site_settings` | Owner sozlanadigan sayt sozlamalari jadvalining birinchi versiyasi. |
| `0022_site_settings_registry` | O'sha jadvalni marketpleysning butun konfiguratsiya registriga aylantiradi (turdagi qiymatlar, kategoriyalar, oxirgi kim nimani o'zgartirgani). |
| `0023_login_attempts` | "Maksimal login urinishlari" / "bloklash muddati" sozlamalarini haqiqatan biror narsa qiladigan xato-kirish hisoblagichi. |
| `0024_refresh_tokens` | Marketpleys sessiyalariga server tomonidagi yarmini beradi, shunda chiqish (va majburiy chiqish) haqiqatan ishlaydi. |
| `0025_listing_reports` | Ilgari mock qilingan "shikoyatlar" admin bo'limi ortidagi jadval. |
| `0026_notifications` | Ham marketpleys, ham admin oqimlari uchun umumiy bildirishnoma jadvali. |
| `0027_admin_refresh_tokens` | `0024` bilan bir xil sessiya mexanizmi, admin hisoblari uchun. |
| `0028_user_account_deletion` | Marketpleys hisobiga unga ishora qilgan hamma narsani buzmasdan o'zini o'chirish (anonimlashtirish) imkonini beradi. |
| `0029_apartment_type` | `apartment_type` (kvartira/hovli uy/xona) qo'shadi — CLAUDE.md doim belgilagan, lekin hech qachon qurilmagan maydon. |

### `pkg/` — kichik, tashqi bog'liqliksiz umumiy paketlar

| Fayl | Nima qiladi |
|---|---|
| `pkg/logger/logger.go` | Ilovaning `Infof`/`Errorf`/`Fatalf`si — standart kutubxonaning `log` paketi ustidan ingichka o'ram, tashqi logging bog'liqligi yo'q. |
| `pkg/response/response.go` | Har bir handler javob beradigan yagona JSON konvert shakli (`{success, message, data, error}`). |

---

## Frontend (`frontend/src/`)

### Asosiy fayllar

| Fayl | Nima qiladi |
|---|---|
| `main.jsx` | Haqiqiy React DOM chizish kirish nuqtasi. |
| `App.jsx` | Har bir sahifa ichida chiziladigan to'liq route jadvali va provider daraxti (auth, til, tema, qidiruv, sevimlilar, suhbat, ...). Shuningdek texnik xizmat rejimi darvozasi. |
| `index.css` | Tailwind import, dizayn-token temasi (ranglar, shriftlar), va umumiy asosiy uslublar. |

### `components/` — yuqori darajadagi umumiy UI

| Fayl | Nima qiladi |
|---|---|
| `ApartmentCard.jsx` | E'lon ro'yxat elementi sifatida ko'rsatiladigan har bir joyda ishlatiladigan karta — rasm, narx, sarlavha, tuman, xususiyatlar, sevimlilar yuragi, "xaritada ko'rish" havolasi. |
| `ApartmentCardSkeleton.jsx` | `ApartmentCard` shaklidagi yuklash placeholder'i. |
| `ApartmentDetailsSkeleton.jsx` | E'lon tafsiloti sahifasi uchun yuklash placeholder'i. |
| `ApartmentGrid.jsx` | `ApartmentCard`lar ro'yxatini responsive tarzda joylashtiradi. |
| `ApartmentMap.jsx` | Xarita sahifasida ishlatiladigan Yandex Maps o'rami — markerlar, tuman chegarasi ta'kidlash, foydalanuvchi-joylashuvi nuqtasi. |
| `AuthCard.jsx` | Har bir auth ekrani chiziladigan yarim shaffof karta yuzasi. |
| `AuthedHeaderActions.jsx` | Kirilgandan keyingi header'ning o'ng tomoni — avatar, bildirishnomalar, suhbat belgisi. |
| `ContactChatModal.jsx` | E'londan ochiladigan "Xabar yozish" modali — egasi bilan haqiqiy suhbatni ochadi (yoki qayta ochadi). |
| `Container.jsx` | Sahifaning maksimal-kenglik tarkib o'rami, katta desktopda aynan beshta e'lon kartasi qatorga sig'adigan qilib sozlangan breakpoint bilan. |
| `DeleteAccountDialog.jsx` | Hisobni o'chirishni tasdiqlaydi, niyat isboti sifatida joriy parolni so'raydi. |
| `DistrictSelector.jsx` | Qidiruv panelida va filtrlarda ishlatiladigan qidiriladigan tuman popoveri — native `<select>` emas. |
| `EmptyState.jsx` | Sayt bo'ylab bo'sh va xato holatlarida ishlatiladigan umumiy "bu yerda hech narsa yo'q" bloki (belgi, sarlavha, tavsif, ixtiyoriy amal tugmasi). |
| `FilterBar.jsx` | "Filtrlar" tugmasi + faol filtr chiplari qatori; `FilterPanel`ni dropdown (desktop) yoki pastki varaq (mobil) sifatida ochadi. |
| `FilterPanel.jsx` | Haqiqiy filtr maydonlari: narx, xonalar, maydon, qavat, uy turi, jihozlangan. |
| `Footer.jsx` | Sayt footer'i. |
| `FormField.jsx` | Auth, profil va e'lon formalari bo'ylab ishlatiladigan umumiy nomlangan matn kiritish maydoni (parol ko'rsatish qo'llab-quvvatlashi bilan). |
| `Header.jsx` | Sayt header'i — logotip, tuman/kalit so'z qidiruvi, til, tema, auth holati. |
| `ImageGallery.jsx` | Tafsilot sahifasida e'lonning foto galereyasi. |
| `ImageLightbox.jsx` | Kichik rasmdan ochiladigan to'liq o'lchamdagi foto ko'ruvchi. |
| `LanguageSelector.jsx` | uz/ru/en almashtirgichi. |
| `LogoutDialog.jsx` | Chiqishni tasdiqlaydi. |
| `MapApartmentPreview.jsx` | Xarita markeri bosilganda ko'rsatiladigan suzuvchi (desktop) / pastki-varaq (mobil) karta. |
| `MapControls.jsx` | Xarita sahifasidagi kattalashtirish va joylashuvimni-ko'rsatish tugmalari. |
| `MapLayerSelector.jsx` | Xarita sahifasidagi ko'cha/sun'iy yo'ldosh/tirbandlik qatlami almashtirgichi. |
| `NoPhoneDialog.jsx` | Egasi telefon raqami qo'shmagan bo'lsa, qo'ng'iroq qilish o'rniga ko'rsatiladi — suhbatni taklif qiladi. |
| `Pagination.jsx` | Server-sahifalangan ro'yxat uchun sahifa raqami boshqaruvi, URL'ga sahifa raqamini o'qiydi/yozadi. |
| `ReportListingDialog.jsx` | "Bu e'londan shikoyat qilish" formasi — sabab ro'yxati va erkin matn. |
| `RequireAuth.jsx` | Marketpleysning faqat-kirgan-uchun qismi (dashboard, saqlanganlar, ...) uchun route darvozasi. |
| `SearchBar.jsx` | Header'ning tuman + kalit so'z qidiruv boshqaruvi. |
| `SortDropdown.jsx` | Qidiruv natijalaridagi "Saralash" tartib dropdown'i. |
| `ThemeToggle.jsx` | Yorug'/qorong'i almashtirgichi. |
| `headerMenuStyles.js` | Mobil header dropdown menyusi uchun umumiy Tailwind klasslari, `Header.jsx` va kirilgan-holat amallar menyusi bir-birini import qilmasligi uchun alohida chiqarilgan. |

### `components/admin/` — faqat admin-dashboard UI'si

| Fayl | Nima qiladi |
|---|---|
| `AdminChart.jsx` | `LineChart` (qo'lda chizilgan SVG, grafik kutubxonasisiz) va `BarList` — har bir admin analitika ko'rinishi ishlatadigan ikkita grafik asosiysi. |
| `AdminConfirmDialog.jsx` | Dashboard'ning har bir "ishonchingiz komilmi" uchun qayta ishlatiladigan yagona tasdiqlash dialogi (chiqish, bloklash, admin olib tashlash). |
| `AdminLayout.jsx` | Admin qobig'i: qat'iy nav ustuni + header + sahifa outlet, va hatto login sahifasiga ham admin tema/tilni beradigan yuqori darajadagi route o'rami (`AdminRoot`). |
| `AdminSidebar.jsx` | Navigatsiyaning o'zi — `ADMIN_NAV` (tartibda har bir yozuv), `CONFIGURABLE_NAV` (owner har bir super admin uchun almashtira oladigan qism), va `isNavVisible` (ko'rinish qoidasi). |
| `AdminSidebar.test.jsx` | Faqat-owner bo'limlari saqlangan sidebar konfiguratsiyasidan qat'iy nazar super admin'dan yashirin qolishini tasdiqlaydi. |
| `AvatarDialog.jsx` | Hisob avatarining to'liq o'lchamdagi ko'rinishi. |
| `ConversationAudit.jsx` | Bitta owner'ning e'lonlari haqidagi har bir suhbatning faqat-o'qish ko'rinishi, e'lon tafsiloti sahifasining audit kartasi uchun — faqat owner. |
| `ListingGalleryDialog.jsx` | Admin e'lon tafsiloti/jadvalidan ochiladigan e'lon fotolarining karusel ko'ruvchisi. |
| `RequireAdmin.jsx` | Har bir dashboard sahifasi oldidagi route darvozasi (qulaylik — haqiqiy tekshiruvni API ta'minlaydi). |
| `adminUi.jsx` | Kichik umumiy asosiylar: `AdminCard`, `StatCard`, `AdminTable` (gorizontal aylanadigan), `ViewLink`, `Switch`, `MockButton`. |

### `components/auth/` — ro'yxatdan o'tish/login ekrani qismlari

| Fayl | Nima qiladi |
|---|---|
| `AuthAlert.jsx` | Auth formalar uchun ichki xato/muvaffaqiyat banneri. |
| `AuthBackground.jsx` | Har bir auth ekrani ortidagi bezakli animatsiyali fon. |
| `AuthBrand.jsx` | Auth kartasi ustida ko'rsatiladigan logotip/nomi. |
| `AuthButton.jsx` | Har bir auth forma ulashadigan asosiy yuborish tugmasi uslubi. |
| `AuthCard.jsx` | (`components/AuthCard.jsx`ga qarang — auth papkasining o'z tarkibi uchun bu yerda qayta eksport qilingan/takrorlangan qobiq) |
| `AuthFooterLink.jsx` | Forma ostidagi "Hisobingiz yo'qmi? / Ro'yxatdan o'tish" havolasi. |
| `AuthInput.jsx` | Maxsus auth ekranlari uchun uslublangan matn kiritish maydoni (bittasini qayta uslublash dashboard'ning formalariga hech qachon tegmasligi uchun umumiy `FormField`dan alohida saqlangan). |
| `AuthLayout.jsx` | Har bir autentifikatsiya sahifasi ichida chiziladigan to'liq ekranli qobiq (header/footer yo'q). |
| `AuthProgress.jsx` | 3-bosqichli ro'yxatdan o'tish oqimi uchun qadam ko'rsatkichi. |
| `MethodChoice.jsx` | Ro'yxatdan o'tish/login formalaridagi telefon-yoki-email tanlagichi — telefon varianti Eskiz SMS integratsiyasini kutib hozircha o'chirilgan. |
| `OtpInput.jsx` | 6 xonali kod kiritish boshqaruvi. |

### `components/chat/` — suhbat funksiyasining UI'si

| Fayl | Nima qiladi |
|---|---|
| `ApartmentContextBar.jsx` | Xabar "haqida" bo'lgan e'lon uchun suhbat ichida ko'rsatiladigan kichik e'lon-konteksti chizig'i. |
| `BlockUserDialog.jsx` | Kimnidir bloklashni, ixtiyoriy sabab bilan, tasdiqlaydi. |
| `ChatComposer.jsx` | Xabar kiritish qatori: matn, bitta biriktirma, yoki ovozli xabar. |
| `ChatConversationList.jsx` | Sidebar'dagi suhbatlar ro'yxati, eng oxirgi faol birinchi, bog'langanlari yuqorida. |
| `ChatHeaderMenu.jsx` | Ochiq suhbat header'ining amallar menyusi (bloklash/arxivlash/o'chirish). |
| `ChatMessage.jsx` | Bitta xabar pufakchasi. |
| `ChatSettingsMenu.jsx` | Suhbat sidebar'i ostidagi arxiv va bloklangan-foydalanuvchilar havolalari. |
| `ChatThread.jsx` | Ochiq suhbat: xabarlar ro'yxati, kompozitor, sahifalash, real vaqtli yangilanishlar. |
| `ConversationDialogs.jsx` | `ArchiveConversationDialog` va `DeleteConversationDialog` — ikkalasi uchun umumiy tasdiqlash qobig'i. |
| `ConversationMenu.jsx` | Suhbat-ro'yxati yozuvidagi har-qator amallar menyusi. |
| `DeleteMessageDialog.jsx` | Xabarni qanday olib tashlashni tasdiqlaydi — o'zim uchun yashirish yoki hamma uchun olib tashlash. |
| `MessageActionsMenu.jsx` | Javob berish / Tanlash / Tahrirlash / O'chirish, xabar pufakchasidagi bitta tugma ortida. |
| `MessageAttachment.jsx` | Pufakcha ichida rasm/fayl/ovozli-xabar biriktirmasini chizadi; `VoiceNote` audio pleyeri. |
| `MessageNotifications.jsx` | Yangi xabar ogohlantirishlari — tab fokusda bo'lganda ilova-ichi toast, bo'lmaganda brauzer bildirishnomasi. |
| `MessageQuote.jsx` | Javob ustida ko'rsatiladigan iqtibos-xabar oldindan ko'rinishi, ham pufakchada, ham yozish paytida. |
| `UnblockDialog.jsx` | Bloklashni bekor qilishni tasdiqlaydi. |

### `components/dashboard/` — kirilgan foydalanuvchi dashboard qismlari

| Fayl | Nima qiladi |
|---|---|
| `DashboardHeader.jsx` | Dashboard'ning o'z header qatori. |
| `DashboardLayout.jsx` | Har bir `/dashboard/*` route uchun sidebar + header + sahifa outlet qobig'i. |
| `DashboardListingStatusNav.jsx` | Kengayadigan "E'lonlar holati" nav guruhi (barchasi/faol/kutilayotgan/yopilgan/qoralamalar/o'chirilgan). |
| `DashboardMobileMenu.jsx` | Dashboard nav'ining mobil tortma versiyasi. |
| `DashboardNavItem.jsx` | Bitta sidebar nav qatori. |
| `DashboardNotifications.jsx` | Dashboard xulosasidagi kichik "e'lonlaringizga nima bo'ldi" ro'yxati. |
| `DashboardOverview.jsx` | Dashboard bosh sahifasi: bosh hisoblagichlar va ko'rishlar grafigi. |
| `DashboardSettingsMenu.jsx` | Dashboard sidebar'i ostidagi tema/til menyusi. |
| `DashboardSidebar.jsx` | Qat'iy nav ustuni. |
| `ListingGalleryModal.jsx` | Kirilgan foydalanuvchining o'z e'lonlaridan birining foto ko'ruvchisi. |
| `ListingStatusDialog.jsx` | E'lon holati o'zgarishini (e'lon qilish/yopish/o'chirish/...) tasdiqlaydi. |
| `ListingStatusMenu.jsx` | Faqat server e'lonning joriy holati uchun haqiqatan qabul qiladigan o'tishlarni taklif qiluvchi menyu. |
| `MyListingCard.jsx` | Egasining o'z e'lonlar jadvali/to'ri qatori — kichik rasm, holat belgisi, amallar. |
| `UserAvatar.jsx` | Rasm-yoki-bosh-harflar avatari, hisobning shaxsi ko'rsatiladigan har joyda ishlatiladi. |
| `ViewsChart.jsx` | Dashboard xulosasidagi va har-e'lon analitika ko'rinishidagi chiziqli grafik. |

### `components/listing/` — e'lon yaratish/tahrirlash formasining qismlari

| Fayl | Nima qiladi |
|---|---|
| `CheckboxGroup.jsx` | Ko'p-tanlovli checkbox qatori (qulayliklar, uy qoidalari). |
| `FormSection.jsx` | Sarlavhali karta o'rami — e'lon formasidagi har bir maydon guruhi uchun bittadan. |
| `ImageUploader.jsx` | Har bir rasm uchun xato bo'lganda qayta-urinish imkoniyati bilan sudrab-tashlab/tanlab-yuklaydigan galereya muharriri. |
| `ListingLocationPicker.jsx` | E'lon koordinatalarini o'rnatish uchun bosib-joylashtirish xaritasi. |
| `ListingPreview.jsx` | Forma yonida jonli "kartangiz shunday ko'rinadi" oldindan ko'rinishi. |
| `SegmentedField.jsx` | Pill-tugma bitta-tanlov boshqaruvi (valyuta, jihozlangan, ijara davri, uy turi). |
| `SelectField.jsx` | Native `<select>`-uslublangan dropdown (segmented qator juda keng bo'lgan joyda ishlatiladi — tumanlar). |
| `TextAreaField.jsx` | Belgilar hisoblagichi bilan nomlangan ko'p-qatorli matn kiritish maydoni. |

### `context/` — sahifalararo mijoz holati (React Context)

| Fayl | Nima qiladi |
|---|---|
| `AdminAuthContext.jsx` | Kirilgan administratorning sessiyasi — har bir yuklashda API'ga qarshi qayta tekshiriladi. |
| `AdminLogoutContext.jsx` | Header menyusi va sidebar'ning o'z chiqish havolasi ulashadigan yagona admin chiqish tasdig'i. |
| `AdminSettingsContext.jsx` | Admin dashboard'ning o'z tema/tili va sidebar ko'rinish konfiguratsiyasi (`ADMIN_ROLE`, `DEFAULT_SIDEBAR`). |
| `AuthContext.jsx` | Kirilgan marketpleys foydalanuvchisining sessiyasi va profili. |
| `ChatContext.jsx` | Butun sessiya uchun yagona WebSocket ulanishi, suhbatlar ro'yxati, va o'qilmagan belgisi. |
| `ListingsContext.jsx` | Kirilgan owner'ning o'z e'lonlari (dashboard ro'yxati, statistika). |
| `LocaleContext.jsx` | Faol uz/ru/en tili va `t()` tarjima qidiruvi. |
| `LocaleContext.test.jsx` | Yuklashda qaysi til g'olib chiqishi (saqlangan tanlov yoki sayt standarti) uchun unit testlar. |
| `SearchContext.jsx` | Bosh sahifa, Qidiruv va Xarita ortidagi umumiy tuman/kalit-so'z/filtr holati. |
| `SiteSettingsContext.jsx` | Har bir tashrif buyuruvchi uchun bir marta olinadigan ommaviy sayt konfiguratsiyasi (nom, standart til, texnik xizmat bayrog'i). |
| `ThemeContext.jsx` | Ommaviy sayt uchun yorug'/qorong'i tema holati. |
| `ToastContext.jsx` | Qisqa tasdiqlar ("Saqlandi", ...) — allaqachon suhbat ekranida bo'lganda bostirilib qo'yiladigan chat'ning o'z xabar bildirishnomalaridan farqli. |
| `WishlistContext.jsx` | `favorites` jadvali bilan quvvatlanadigan kirilgan foydalanuvchining saqlangan-e'lon id'lari va soni. |

### `data/` — statik ma'lumotnoma ma'lumoti va shakl/tekshiruv ta'riflari

| Fayl | Nima qiladi |
|---|---|
| `districtBoundaries.js` | Ilova iste'mol qilishi uchun quyidagi xom GeoJSON'ni yuklaydi/normalizatsiya qiladi. |
| `districts.geo.json` | Xom GeoJSON'ning o'zi — OpenStreetMap'dan olingan haqiqiy Toshkent tuman poligon chegaralari. |
| `districts.js` | Tanlagichlar, filtr chiplari va kartalar ishlatadigan tekis id+nom tuman ro'yxati — hech qanday tuman nomi ikki marta yozilmasligi uchun yagona manba. |
| `listingForm.js` | E'lon formasining maydon ta'riflari, variantlari (jihozlanganlik, uy turi, valyutalar, ...), va bo'sh-forma/tekshirish mantig'i. |
| `listingStatus.js` | PostgreSQL'ning CHECK cheklovi qabul qiladigan narsa bilan aynan mos keladigan e'lon hayot sikli lug'ati — mos qilib turiladigan ikkinchi, tarjima qilingan lug'at yo'q. |
| `mapLayers.js` | Xarita sahifasining qatlam almashtirgichi taklif qiladigan asosiy xarita uslublari (ko'cha/sun'iy yo'ldosh/tirbandlik). |

### `hooks/` — o'z UI'siga ega bo'lmagan umumiy mantiq

| Fayl | Nima qiladi |
|---|---|
| `useConversation.js` | Bitta ochiq suhbatga kerak bo'lgan hamma narsa: xabarlar, sahifalash, real vaqtli yangilanishlar, yuborish/tahrirlash/o'chirish. |
| `useDashboardSummary.js` | Dashboard'ning hisoblagichlari + qisqa ro'yxatlarini oladi, tab fokusni qaytarganda qayta oladi. |
| `useDismiss.js` | Tashqi bosish yoki Escape'da popover/menyuni yopadi. |
| `useGeolocation.js` | Brauzer geolokatsiya API'sini izchil holat/xato lug'ati bilan o'raydi, Xarita sahifasi va e'lon joylashuv tanlagichi ulashadi. |
| `useMediaQuery.js` | CSS media so'rovini reaktiv tarzda boolean sifatida. |
| `useMessageSound.js` | Kiruvchi suhbat xabarida qisqa tovush chalinadi. |
| `useModalDialog.js` | Har bir dialogga kerak bo'lgan ikkita narsa: ochilganda fokus, yopish uchun Escape. |
| `useRequireAuth.js` | Autentifikatsiyadan o'tmagan foydalanuvchi avval kirishga yuborilishi, keyin qaytarilishi uchun bosish handler'ini o'raydi. |
| `useSiteFormat.js` | Sayt sozlangan format va soat uslubi bo'yicha sana/vaqt formatlash. |
| `useSiteLocation.js` | Sozlangan shahar nomi ("Toshkent"), har bir ekranda qattiq yozilmasdan, bir marta o'qiladi. |
| `useViewsAnalytics.js` | Egasi yoki e'lonning ko'rishlar-soni vaqt jadvalini oladi, tab fokusda qayta oladi. |
| `useVoiceRecorder.js` | MediaRecorder API orqali ovozli xabar yozadi — idle/recording/stopped holat mashinasi. |

### `layouts/`

| Fayl | Nima qiladi |
|---|---|
| `RootLayout.jsx` | Har bir ommaviy-sayt route'ini o'raydigan Header + `<Outlet/>` + Footer qobig'i. |

### `locales/` — tarjima lug'atlari

| Fayl | Nima qiladi |
|---|---|
| `uz.js` | Ommaviy marketpleys uchun o'zbekcha satrlar (standart til). |
| `ru.js` | Ommaviy marketpleys uchun ruscha satrlar. |
| `en.js` | Ommaviy marketpleys uchun inglizcha satrlar. |
| `admin.js` | Admin dashboard uchun uchala tildagi satrlar ham, alohida faylda saqlanadi, chunki ikki hudud mustaqil tarjima qilinadi va o'qiladi. |
| `languages.js` | Almashtirgich chizadigan qo'llab-quvvatlanadigan tillar ro'yxati. |

### `pages/` — ommaviy sayt/dashboard route'i uchun bitta fayl

| Fayl | Nima qiladi |
|---|---|
| `HomePage.jsx` | Header, qidiruv, filtrlar, va e'lonlar to'ri. |
| `SearchPage.jsx` | Qidiruv natijalari — har bir filtr, saralash tartibi va sahifa raqami URL'da yashaydi. |
| `ApartmentDetailsPage.jsx` | Galereya, narx, xususiyatlar, tavsif, qulayliklar, egasi kartasi, bog'lanish amallari, o'xshash e'lonlar. |
| `MapPage.jsx` | Butun ekranga yaqin xarita ko'rinishi. |
| `WishlistPage.jsx` | "Saqlangan uylar" — kirilgan foydalanuvchining saqlangan e'lonlari. |
| `LoginPage.jsx` | Kirish formasi. |
| `RegisterPage.jsx` | 3-bosqichli ro'yxatdan o'tish oqimi (kod so'rash → tekshirish → parol o'rnatish). |
| `ForgotPasswordPage.jsx` | Parolni tiklash havolasini so'raydi. |
| `ResetPasswordPage.jsx` | Emailga yuborilgan havoladan yangi parol o'rnatadi. |
| `DashboardPage.jsx` | `/dashboard` route'ining o'z qobig'i/outlet'i. |
| `DashboardEditProfilePage.jsx` | Kirilgan hisobning o'z profil tahrirlash formasi (ism, avatar, telefon/email, hisobni o'chirish). |
| `DashboardListingsPage.jsx` | Egasining o'z e'lonlari, holat bo'yicha filtrlanadigan. |
| `DashboardChatsPage.jsx` | To'liq-sahifali suhbat ko'rinishi (suhbatlar ro'yxati + ochiq suhbat). |
| `DashboardReportsPage.jsx` | Bu hisob nima haqida shikoyat qilgan, va natijasi. |
| `BlockedUsersPage.jsx` | Bu hisob bloklagan hamma, blokdan chiqarish imkoniyati bilan. |
| `CreateListingPage.jsx` | Yangi e'lon yaratish uchun ham, mavjudini tahrirlash uchun ham route kirish nuqtasi. |
| `OwnerLandingPage.jsx` | Footer'dan bog'langan "uy egalari uchun" marketing sahifasi. |
| `MaintenancePage.jsx` | Texnik xizmat rejimi yoqilgan paytda tashrif buyuruvchilarga ko'rsatiladi. |
| `NotFoundPage.jsx` | 404 sahifasi. |

### `pages/admin/` — admin-dashboard route'i uchun bitta fayl

| Fayl | Nima qiladi |
|---|---|
| `AdminLoginPage.jsx` | Dashboard'ga kirishning yagona yo'li — o'z-o'zidan ro'yxatdan o'tish yo'q. |
| `AdminDashboardPage.jsx` | Bosh statistika, ikkala o'sish grafigi, va eng-faol-tumanlar reytingi. |
| `AdminUsersPage.jsx` | Marketpleys hisoblari — qidirish, filtrlash, sahifalash, bloklash/blokdan chiqarish. |
| `AdminUserDetailPage.jsx` | Bitta marketpleys hisobining o'z tafsilot/tarix ko'rinishi. |
| `AdminListingsPage.jsx` | Har bir e'lon, yoki bitta holatga tegishlisi (barcha oltita holat-filtrlangan sidebar yozuvi ulashadi). |
| `AdminListingDetailPage.jsx` | Ixcham karta sifatida bitta e'lon: galereya, statistika, egasi, suhbat auditi, moderatsiya amallari. |
| `AdminChatsPage.jsx` | Moderatsiya uchun suhbatlar — kim kimga nima haqida gaplashgani, faqat o'qish uchun. |
| `AdminReportsPage.jsx` | E'lonlar haqidagi shikoyatlar — jadval va hal qilish/rad etish amallari. |
| `AdminAnalyticsPage.jsx` | Maxsus analitika sahifasi (dashboard bilan bir xil asosiy raqamlar, chuqurroq taqdim etilgan). |
| `AdminNotificationsPage.jsx` | Administrator bilishi kerak bo'lgan sodir bo'lgan narsalar. |
| `AdminAuditLogsPage.jsx` | Administratorlar nima qilgani — haqiqiy, yozib olingan amal jurnali. |
| `AdminSettingsPage.jsx` | `settingsSchema.js` bo'yicha joylashtirilgan to'liq sayt-konfiguratsiya muharriri. |
| `AdminAdminsPage.jsx` | Faqat owner: administratorlar ro'yxati, va yangisini yaratish formasi. |
| `AdminRolesPage.jsx` | Har bir rol (owner/super admin) haqiqatan nimaga yeta olishi, serverning o'zi ta'minlagan qoidalaridan olingan. |
| `AdminSidebarControlPage.jsx` | Faqat owner: super adminga qaysi sidebar bo'limlari taklif qilinishi. |
| `AdminProfilePage.jsx` | Kirilgan administratorning o'z ism/avatar tahrirlash formasi. |
| `AdminDashboardSettingsPage.jsx` | Admin dashboard'ning o'z tema/tili (dashboard'ga tegishli ko'lamlangan, hech qachon ommaviy saytga emas). |
| `settingsSchema.js` | **Sahifa emas** — `AdminSettingsPage.jsx` uchun joylashuv ta'rifi: server `internal/models/site_setting.go`da e'lon qiladigan har bir sozlama uchun bittadan yozuv, u qanday tahrirlanishini aytadi (switch, raqam, ro'yxat) va qaysi kartaga tegishli ekanini. Belgilar lug'atdan, haqiqiy qoidalar esa serverdan keladi; bu fayl faqat qiymat qanday chizilishini aytadi. |

### `routes/`

| Fayl | Nima qiladi |
|---|---|
| `paths.js` | Har bir ommaviy-sayt route yo'li bir joyda, plus `listingsPathFor` (berilgan holatdagi e'lon qaysi dashboard sahifasida yashaydi). |
| `adminPaths.js` | Har bir admin-dashboard route yo'li bir joyda. |

### `services/` — API'ga murojaat qiladigan yagona kod

Har bir fayl API'ning snake_case shakllari va komponentlar chizadigan
camelCase shakllari orasida tarjima qiladi, shunda ikkala tomondagi
nomlanish o'zgarishi bitta faylga o'zgarish bo'ladi.

| Fayl | Nima qiladi |
|---|---|
| `apiClient.js` | Markaziy HTTP mijoz — asosiy URL, auth sarlavhasi, konvertni ochish, 401-qo'zg'atgan token yangilash, xatoni qayta ishlash. Har bir boshqa `*Api.js` fayli shu orqali murojaat qiladi. |
| `authApi.js` | Ro'yxatdan o'tish (3 bosqich), login, sessiya yangilash/chiqish, profil yangilash. |
| `apartmentsApi.js` | E'lon CRUD, qidiruv, sevimlilar, bildirishnomalar — `toApartment`/`toApartmentPayload` shakl tarjimasi. |
| `adminApi.js` | Har bir admin-dashboard endpointi. |
| `analyticsApi.js` | Ko'rishlar-soni vaqt jadvalini olish va grafik-nuqta shakllantirish. |
| `chatApi.js` | Suhbatlar, xabarlar, biriktirmalar. |
| `chatSocket.js` | Yagona real vaqtli WebSocket ulanishini avtomatik qayta ulanish bilan ochadi va boshqaradi. |
| `favoritesApi.js` | Saqlash/saqlashdan chiqarish, va dashboard'ning saqlangan-e'lonlar xulosasi. |

### `test/`

| Fayl | Nima qiladi |
|---|---|
| `setup.js` | Test-muhiti sozlash — har bir test fayli uchun `jest-dom` moslashtiruvchilarini (`toBeInTheDocument`, va h.k.) ro'yxatdan o'tkazadi. |

### `utils/` — umumiy, UI'siz mantiq

| Fayl | Nima qiladi |
|---|---|
| `districtFocus.js` | Xaritada "bu tuman tanlangan" ta'kidlashini chizadi. |
| `districtGeometry.js` | Tuman GeoJSON chegarasini Yandex Maps kutgan narsaga aylantiradi (tashqi halqalar, chegaralar, markaz). |
| `filterApartments.js` | Xarita sahifasi ishlatadigan mijoz-tomonidagi filtr quvuri (har bir filtr o'zgarishida qayta so'rash o'rniga butun katalogni xotirada saqlaydi). |
| `filterApartments.test.js` | Yuqoridagi uchun unit testlar. |
| `formatChatTime.js` | Suhbat xabari vaqt tamg'alariga xos sana/vaqt formatlash. |
| `formatPeriod.js` | Grafik nuqtasining davri uchun inson-o'qiy oladigan belgilar ("18–24 Avgust 2026", "Avgust 2026", ...). |
| `formatPrice.js` | Pul formatlash — summa + valyuta + ijara davri, bir joyda, shunda hech qanday ekran o'z narx satrini qurmaydi. |
| `formatRelativeTime.js` | "2 kun oldin" uslubidagi nisbiy vaqt tamg'alari. |
| `geo.js` | Haversine masofasi va "yaqin-atrofdagi e'lonlar" filtrlash, Xarita sahifasining joylashuv xususiyati ishlatadi. |
| `getSimilarApartments.js` | E'lon tafsiloti sahifasida ko'rsatiladigan "o'xshash e'lonlar"ni tanlaydi. |
| `listingText.js` | E'lon haqiqatan ko'rsatadigan sarlavha/tavsifni aniqlaydi (egasining o'z matni, so'zma-so'z — tarjima qilingan zaxira yo'q). |
| `mapFilterParams.js` | Xarita sahifasining tuman/filtr holatini URL so'rov parametrlariga va aksincha xaritalaydi. |
| `readableText.js` | Egasi HAMMASI-BOSH-HARFDA yozgan matnni oddiy gap holatiga aylantiradi. |
| `redirectTarget.js` | Kirishdan-keyingi navigatsiya uchun xavfsiz `?redirect=` boshqaruvi — bir xil manbadan bo'lmagan har qanday nisbiy yo'lni rad etadi (ochiq-yo'naltirish himoyasi). |
| `searchParams.js` | Qidiruv sahifasining butun holati ↔ URL so'rov satri tarjimasi (tuman, kalit so'z, filtrlar, saralash, sahifa). |
| `searchParams.test.js` | Yuqoridagi uchun unit testlar. |
| `sortApartments.js` | Mijoz-tomonidagi e'lon saralash yordamchilari. |
| `uploadUrl.js` | Saqlangan yuklash yo'lini API manbasini qaytarib qo'shish orqali yuklanadigan `<img>` URL'iga aylantiradi. |
| `userInitials.js` | Hisobda avatar bo'lmaganda ko'rsatiladigan ikki-harfli bosh harflar. |
| `yandexMaps.js` | Yandex Maps JS API skriptini har bir sahifa yuklanishida bir marta yuklaydi va `ymaps` nomlar makonini qaytaradi. |
