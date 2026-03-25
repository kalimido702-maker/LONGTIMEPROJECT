#!/bin/bash

# ===========================================
# سكريبت إنشاء Client جديد + License Key
# ===========================================

# الإعدادات
SERVER="http://13coffee.net:3030"
USERNAME="admin"
PASSWORD="admin123"

# بيانات العميل الجديد
CLIENT_NAME="olive"
CLIENT_NAME_EN="olive"
TIMESTAMP=$(date +%s)
CLIENT_EMAIL="cafe13_${TIMESTAMP}@example.com"
CLIENT_PHONE="0123456789"
CLIENT_ADDRESS="القاهرة"
MAX_BRANCHES=5
MAX_DEVICES=2

echo "=========================================="
echo "🚀 بدء إنشاء Client + License"
echo "=========================================="

# 1. تسجيل الدخول والحصول على Token
echo ""
echo "🔐 الخطوة 1: تسجيل الدخول..."
LOGIN_RESPONSE=$(curl -s -X POST "$SERVER/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

# استخراج الـ Token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ فشل تسجيل الدخول"
  echo $LOGIN_RESPONSE
  exit 1
fi

echo "✅ تم الحصول على Token"

# 2. إنشاء Client جديد
echo ""
echo "� الخطوة 2: إنشاء Client جديد..."
CLIENT_RESPONSE=$(curl -s -X POST "$SERVER/api/admin/clients" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"$CLIENT_NAME\",
    \"nameEn\": \"$CLIENT_NAME_EN\",
    \"email\": \"$CLIENT_EMAIL\",
    \"phone\": \"$CLIENT_PHONE\",
    \"address\": \"$CLIENT_ADDRESS\",
    \"subscriptionPlan\": \"premium\",
    \"maxBranches\": $MAX_BRANCHES,
    \"maxDevices\": $MAX_DEVICES
  }")

# استخراج Client ID
CLIENT_ID=$(echo $CLIENT_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CLIENT_ID" ]; then
  echo "❌ فشل إنشاء Client"
  echo $CLIENT_RESPONSE | python3 -m json.tool 2>/dev/null || echo $CLIENT_RESPONSE
  exit 1
fi

echo "✅ تم إنشاء Client بنجاح"
echo "   � Client ID: $CLIENT_ID"

# 3. إنشاء License Key
echo ""
echo "🔑 الخطوة 3: إنشاء License Key..."
LICENSE_RESPONSE=$(curl -s -X POST "$SERVER/api/admin/licenses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"clientId\": \"$CLIENT_ID\",
    \"maxDevices\": $MAX_DEVICES,
    \"enableSync\": true,
    \"enableOfflineMode\": true,
    \"autoUpdate\": true,
    \"syncInterval\": 300000
  }")

# استخراج License Key
LICENSE_KEY=$(echo $LICENSE_RESPONSE | grep -o '"licenseKey":"[^"]*"' | cut -d'"' -f4)
LICENSE_ID=$(echo $LICENSE_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$LICENSE_KEY" ]; then
  echo "❌ فشل إنشاء License"
  echo $LICENSE_RESPONSE | python3 -m json.tool 2>/dev/null || echo $LICENSE_RESPONSE
  exit 1
fi

echo "✅ تم إنشاء License بنجاح"

echo ""
echo "=========================================="
echo "📋 ملخص النتائج:"
echo "=========================================="
echo "   🏢 Client Name: $CLIENT_NAME"
echo "   📋 Client ID:   $CLIENT_ID"
echo "   🔑 License ID:  $LICENSE_ID"
echo "   🎫 License Key: $LICENSE_KEY"
echo "=========================================="
echo ""
echo "✅ استخدم License Key ده في التطبيق!"
echo ""