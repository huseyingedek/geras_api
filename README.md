# Node.js Express ve Prisma API

Bu proje, Node.js, Express, PostgreSQL ve Prisma ORM kullanarak oluşturulmuş bir RESTful API uygulamasıdır.

## Özellikler

- Express web sunucusu
- PostgreSQL veritabanı
- Prisma ORM
- RESTful API yapısı
- Kullanıcı CRUD işlemleri

## Kurulum

1. Repoyu klonlayın:
```
git clone <repo-url>
cd <proje-klasörü>
```

2. Bağımlılıkları yükleyin:
```
npm install
```

3. `.env` dosyasını oluşturun (örnek `.env.example` dosyasını kopyalayabilirsiniz):
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/mydatabase?schema=public"
PORT=3000
NODE_ENV=development
```

4. PostgreSQL veritabanınızı oluşturun ve bağlantı URL'sini `.env` dosyasında güncelleyin.

5. Prisma şemasını veritabanına aktarın:
```
npx prisma migrate dev --name init
```

6. Prisma istemcisini oluşturun:
```
npx prisma generate
```

## Çalıştırma

Geliştirme modunda çalıştırmak için:
```
npm run dev
```

Üretim modunda çalıştırmak için:
```
npm start
```

## API Endpoint'leri

### Kullanıcılar

- `GET /api/users`: Tüm kullanıcıları listeler
- `GET /api/users/:id`: Belirli bir kullanıcıyı getirir
- `POST /api/users`: Yeni bir kullanıcı oluşturur
- `PUT /api/users/:id`: Bir kullanıcıyı günceller
- `DELETE /api/users/:id`: Bir kullanıcıyı siler

## Veritabanı Modelleri

### User
- `id`: Int (primary key, auto-increment)
- `email`: String (unique)
- `name`: String (optional)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### Post
- `id`: Int (primary key, auto-increment)
- `title`: String
- `content`: String (optional)
- `published`: Boolean (default: false)
- `createdAt`: DateTime
- `updatedAt`: DateTime 