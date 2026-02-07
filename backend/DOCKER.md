# 🐳 POS Backend Docker Setup

## Quick Start

شغل كل الخدمات بأمر واحد:

```bash
./start.sh
```

## الأوامر المتاحة

| الأمر | الوصف |
|-------|-------|
| `./start.sh` | تشغيل MySQL + Backend |
| `./start.sh --tools` | تشغيل مع phpMyAdmin |
| `./start.sh --rebuild` | إعادة بناء الـ containers |
| `./start.sh --stop` | إيقاف كل الخدمات |
| `./start.sh --logs` | عرض الـ logs |

## الخدمات

| الخدمة | المنفذ | الرابط |
|--------|-------|--------|
| **API Server** | 3030 | http://localhost:3030 |
| **WebSocket** | 3031 | ws://localhost:3031 |
| **MySQL** | 3306 | localhost:3306 |
| **phpMyAdmin** | 8080 | http://localhost:8080 (مع `--tools`) |

## البيئة

انسخ الملف `.env.docker` إلى `.env` وعدل القيم:

```bash
cp .env.docker .env
nano .env
```

### المتغيرات المهمة:

```env
DATABASE_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_key
```

## الهيكل

```
backend/
├── Dockerfile           # صورة Docker للباك إند
├── docker-compose.yml   # تعريف كل الخدمات
├── start.sh            # سكريبت التشغيل
├── .dockerignore       # ملفات مستثناة من البناء
└── .env.docker         # نموذج المتغيرات
```

## أوامر Docker مباشرة

```bash
# تشغيل
docker compose up -d

# إيقاف
docker compose down

# إعادة بناء
docker compose up -d --build

# الـ logs
docker compose logs -f backend

# دخول MySQL
docker compose exec mysql mysql -u root -p
```

## Health Check

```bash
curl http://localhost:3030/health
```
