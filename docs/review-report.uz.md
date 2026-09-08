# Sayt review hisoboti

Serverga joylashdan oldingi audit — barcha rollar (mehmon, ro'yxatdan o'tgan
foydalanuvchi, uy egasi, admin va admin ichidagi super admin/owner) va
sahifalar bo'yicha: funksional to'g'rilik, responsive dizayn (1440 / 768 /
390px), accessibility (qulaylik) va backend xavfsizligi tekshirildi. Quyida
topilgan va tuzatilgan kamchiliklar, shuningdek hali qolgan (bloklovchi
bo'lmagan) muammolar ro'yxati keltirilgan. Har bir tuzatish loyihaning o'z
build/lint/test to'plami bilan, shuningdek jonli tekshiruv (curl yoki
brauzer) bilan tasdiqlangandan keyin push qilingan — shunchaki ko'rib
chiqilmagan.

## Qamrov

**Ommaviy / mehmon**
- Bosh sahifa (header, qidiruv paneli, filtrlar, e'lonlar ro'yxati, footer)
- Qidiruv natijalari (saralash, sahifalash, faol filtr chiplari, bo'sh/xato
  holatlar)
- E'lon tafsiloti (galereya, qulayliklar, xaritaga havola, uy egasi
  kartochkasi, shikoyat dialogi)
- Xarita (`/map` — Yandex Maps, marker preview, joylashuv, qatlam almashish)
- Autentifikatsiya: ro'yxatdan o'tish (email va telefon usullari), kirish,
  chiqish, parolni tiklash

**Ro'yxatdan o'tgan foydalanuvchi**
- Saqlanganlar ("Saqlangan uylar")
- Dashboard: profilni tahrirlash, suhbatlar, bloklangan foydalanuvchilar,
  mening shikoyatlarim
- Suhbat: suhbatlar ro'yxati, xabarlar oqimi, fayl biriktirish,
  bloklash/shikoyat

**Uy egasi** (bu alohida hisob turi emas, e'lon joylash orqali qo'lga
kiritiladigan rol)
- E'lon yaratish/tahrirlash formasi, rasm yuklash, mening e'lonlarim
  dashboardi, e'lon holati o'zgarishlari, analitika (ko'rishlar)

**Admin / super admin**
- Dashboard (statistika + o'sish grafiklari + eng faol tumanlar)
- Foydalanuvchilar, e'lonlar (barchasi/kutilayotgan/faol/yopilgan/
  qoralama/o'chirilgan), suhbatlar, shikoyatlar, analitika, bildirishnomalar,
  audit jurnali, sayt sozlamalari, adminlar, sidebar ko'rinish boshqaruvi,
  rollar/ruxsatlar

**Backend**
- Har bir route'ning autentifikatsiya/egalik tekshiruvlari, so'rovlarni
  cheklash (rate limiting), fayl yuklashni qayta ishlash, admin autentifikatsiya,
  va Docker/Compose orqali serverga joylash yo'lining o'zi.

## Bu bosqichda tuzatilganlar

### Xavfsizlik
- **Admin login hech qanday cheklovga ega emas edi** — tizimdagi eng yuqori
  huquqli hisoblarga qarshi cheksiz parol taxmin qilish mumkin edi. Endi
  marketpleys loginidagi kabi: bir nechta xato urinishdan keyin hisob
  vaqtincha bloklanadi (marketpleys hisoblaridan alohida hisoblanadigan
  `login_attempts` jadvali orqali), IP esa alohida cheklanadi.
- **Admin avatar URL orqali boshqa serverga yo'naltirish mumkin edi** —
  `isOwnUpload` tekshiruvi faqat URL ichida "/uploads/" so'zi bor-yo'qligini
  ko'rardi, shuning uchun `https://boshqa-server.com/x/uploads/y.jpg` ham
  o'tib ketardi. Har bir boshqa adminning brauzeri bu manzilga so'rov
  yuborgan bo'lardi — bu "auditoriyasi bor tracking pixel" edi. Endi
  mijoz ko'rsatgan host butunlay tashlab yuboriladi, faqat yo'l (path)
  saqlanadi — marketpleysning o'z avatar maydoni doim shunday ishlagan.
- **Rasm yuklashda faqat Content-Type sarlavhasi tekshirilardi** — HTML/skript
  faylni "image/jpeg" deb yuborish kifoya edi, u qabul qilinib saqlanardi va
  qaytarib berilardi. 4 ta qabul qilinadigan rasm formati uchun haqiqiy
  bayt (magic-byte) tekshiruvi qo'shildi.
- **Ikkala rasm yuklash endpointida ham cheklov yo'q edi** — hisobi bor har
  kim `/uploads/images` yoki `/admin/profile/avatar`ni tsiklda chaqirib
  diskni cheksiz to'ldira olardi. `RATE_LIMIT_UPLOAD_MAX/WINDOW` qo'shildi
  (standart — soatiga 60 ta), boshqa endpointlardagi bilan bir xil mexanizm.
- **Sozlamalar / Admin boshqaruvi super adminga yoqilishi mumkindek
  ko'rsatilardi, aslida server buni har doim rad etardi** — bu ikki bo'lim
  serverda doim `RequireOwner()` bilan yopilgan; sidebar boshqaruv sahifasi
  esa super adminga ularni berish mumkindek tugma ko'rsatardi. Sidebar
  konfiguratsiyasi va `/admin/permissions`ning o'zi ham serverning haqiqiy
  qoidasiga mos qilib tuzatildi.

### Serverga joylash
- `GIN_MODE` hech qachon o'rnatilmagan edi, shuning uchun konteyner
  production'da ham Gin'ning batafsil debug rejimida ishlardi.
  `docker-compose.yml`da `release`ga o'rnatildi.
- `migrate down --confirm` — hujjatlashtirilgan buyruq — `--confirm`ni
  jimgina e'tiborsiz qoldirardi, chunki Go'ning `flag` paketi birinchi
  flag-bo'lmagan argumentda parsing'ni to'xtatadi. Butun argumentlar
  ro'yxatini skanerlaydigan qilib qayta yozildi, endi ikkala tartib ham
  ishlaydi.
- Backend porti barcha interfeyslarga ochiq edi; `TRUSTED_PROXIES` esa
  butun Docker bridge tarmog'iga ishonardi — bu birgalikda, ba'zi Docker
  tarmoq sozlamalarida, to'g'ridan-to'g'ri (nginx'ni chetlab o'tib) so'rov
  yuborgan chaqiruvchiga `X-Forwarded-For`ni soxtalashtirib, so'rov
  cheklovlarini chetlab o'tish imkonini berishi mumkin edi. Endi faqat
  `127.0.0.1`ga bog'langan — lokal debug uchun hali ham ishlaydi, lekin
  tashqi tarmoqdan hech qachon ko'rinmaydi.

### To'g'rilik (funksional xatolar)
- E'lon kartasi HTML tuzilishida `<a>` ichida `<button>` bor edi — bu
  yaroqsiz HTML va screen reader'lar uchun bashorat qilib bo'lmaydigan
  natija beradi. Oddiy `<div>` va "stretched link" sarlavha havolasi
  bilan qayta qurildi, amal tugmalari esa mustaqil bosiladigan qilindi.
- E'lon galereyasini tahrirlashda eski rasm qatorlari bazadan o'chirilardi,
  lekin ular orqasidagi fayllar hech qachon o'chirilmasdi — doimiy, o'sib
  boruvchi disk sizib chiqishi edi. Endi `Update` eski va yangi galereyani
  solishtirib, olib tashlangan fayllarni ham o'chiradi.
- `AdminListingDetailPage`, `DashboardReportsPage`, `WishlistPage`, Xarita
  sahifasining katalogi, va suhbatlar ro'yxati/xabarlar oqimi — barchasi
  tarmoq yoki server xatosini "bu yerda hech narsa yo'q" / "natija topilmadi"
  bilan aralashtirib yuborardi, qayta urinish imkoniyati yo'q edi. Endi har
  birida alohida xato holati va ishlaydigan "qayta urinish" tugmasi bor,
  haqiqiy 404 (e'lon tafsiloti) esa vaqtinchalik xatodan farqlanadi.
- `AdminDashboardPage`dagi "Eng faol tumanlar" kartasi bo'sh bo'lganda
  hech narsa ko'rsatmasdi; endi analitika sahifasidagi shunga o'xshash
  kartaga mos keladi.
- CLAUDE.md'da uy egasi e'loni va filtr spetsifikatsiyasida ko'rsatilgan,
  lekin hech qachon qurilmagan "Uy turi" maydoni endi to'liq amalga
  oshirilgan: migratsiya, model, DTO, service, repository, admin tafsilot
  ko'rinishi, e'lon yaratish formasi, qidiruv/xarita filtrlari va tafsilot
  sahifasi.
- Profil sahifasidagi email maydoni `disabled` prop uzatilishiga qaramay
  tahrirlanadigan bo'lib ko'rinardi — `FormField` bu propni inputga
  uzatmayotgan edi.
- "Faqat o'qilmagan" bildirishnoma filtri tugmasida `aria-pressed` yo'q edi.
- Telefon raqami orqali ro'yxatdan o'tish o'chirilgan (Eskiz SMS hali
  ulanmagan) — bu ataylab, vaqtinchalik va qaytariladigan holat
  (`RegisterPage.jsx`).

## Ma'lum, lekin tuzatilmagan, bloklovchi bo'lmagan muammolar

Haqiqatan ta'sir qiladigandan sof kosmetik narsagacha darajalashtirilgan.

**Tez orada tuzatishga arziydi:**
1. Bir nechta admin sahifasi hali yuklash xatosini bo'sh holat bilan
   aralashtirib yuboradi, qayta urinish yo'q: `AdminUsersPage`,
   `AdminListingsPage`, `AdminAdminsPage`, `AdminChatsPage` (ham ro'yxat,
   ham ochiq suhbat), va `AdminDashboardPage`ning butun sahifa xatosi.
   `BlockedUsersPage` (dashboard) da ham xuddi shu bo'shliq bor. Boshqa
   joylarda allaqachon qo'llanilgan xuddi shu tuzatish — mavjud
   `EmptyState`ga `actionLabel`/`onAction` qo'shish kifoya.
2. `DashboardOverview`ning statistika kartasi va ko'rishlar grafigida ham
   xuddi shu bo'shliq bor, lekin ikkala hook ham oyna fokusga qaytganda
   avtomatik qayta yuklaydi, shuning uchun vaqtinchalik xato ko'pincha
   o'z-o'zidan tuzaladi.
3. `ContactChatModal`ning umumiy xato holatida qayta urinish yo'q (modalni
   yopib qayta ochish vaqtinchalik yechim bo'la oladi).

**Kosmetik / past ustuvorlik:**
4. Saytdagi hech qanday dialog ochiq turganda Tab-fokusni o'zi ichida
   ushlab turmaydi — Escape va boshlang'ich fokus ishlaydi, aylanish
   ishlamaydi. Barcha modallarga bir xilda tegishli, bu regressiya emas.
5. `ApartmentCard` ko'cha manzilini ko'rsatmaydi (CLAUDE.md'ning karta
   spetsifikatsiyasida bu bor) — faqat tuman + shahar. Bu ataylab
   qilingan zichlik qarori bo'lishi mumkin; ikkalasini ham taxmin
   qilishdan ko'ra bir og'iz tasdiqlash yaxshiroq.
6. E'lonni ko'rish hisoblanishi IP + User-Agent hashidan tuzilgan soatlik
   "bucket" orqali dublikatlardan tozalanadi; ikkalasidan birini
   o'zgartirish bu tozalashni chetlab o'tadi. Faqat qo'shish (insert-only),
   o'qishni kuchaytirmaydi — past darajali xavf.

**Serverga joylash hujjatlaridagi bo'shliqlar (infratuzilma, kod emas):**
7. Repozitoriyada HTTPS/reverse-proxy sozlash bo'yicha hech qanday
   yo'riqnoma yo'q — ilova to'g'ri ravishda TLS terminatsiyasi undan
   OLDIN sodir bo'lishini kutadi (xavfsizlik sarlavhalari haqidagi
   izohlarga qarang), lekin hech narsa operatorga aslida
   Caddy/nginx+Certbot/bulut load balancer qo'yishni aytmaydi.
   `frontend/nginx.conf` faqat 80-portda tinglaydi.
8. `UPLOAD_DIR`, `UPLOAD_PUBLIC_PATH`, `PUBLIC_BASE_URL` o'qiladi, lekin
   `backend/.env.example`da ro'yxatda yo'q; uchalasi ham joriy
   `docker-compose.yml` uchun xavfsiz standart qiymatlarga ega, lekin
   ayniqsa `PUBLIC_BASE_URL` CDN orqali yoki boshqa domen nomi bilan
   joylashtirishda o'rnatilishi kerak bo'ladigan narsa.
9. CI (`.github/workflows/ci.yml`) `go build`/testlarni ishga tushiradi,
   lekin hech qachon `Dockerfile`larni qurmaydi, va faqat `migrate up`ni
   tekshiradi, `migrate down`ni emas — Docker'ga xos yoki pastga
   migratsiya regressiyasi production'ga yetib borgunga qadar
   ushlanmagan bo'lardi.
10. `docker-compose.yml`da log rotatsiyasi yoki konteyner boshiga resurs
    cheklovlari (`mem_limit`/`cpus`) yo'q — kichik MVP server uchun
    o'tkazib yuborish oqilona, to'liqlik uchun ro'yxatga kiritilgan.
11. Bazaviy image teglari (`golang:1.25-alpine`, `node:22-alpine`) aniq
    digestga emas, minor versiya ichida "suzib yurgan" holatda.

## Sizning qaroringizni kutayotgan masalalar (bular xato emas)

- `ApartmentCard` har bir e'lonni yangi tabda ochadi (`target="_blank"`) —
  kodda ataylab shunday qilingani tasdiqlangan; qayta ko'rib chiqishga
  arzimi-yo'qmi deb belgilab qo'yilgan, xato sifatida emas.
- `AdminSettingsPage` 50+ sozlanadigan maydonni ko'rsatadi, bu CLAUDE.md'da
  belgilangan MVP admin ko'lamidan ("Do not overbuild") ancha oshib ketgan.
  Bu mahsulot/ko'lam bo'yicha qaror, yo'nalishsiz qisqartirib bo'lmaydigan
  narsa.
