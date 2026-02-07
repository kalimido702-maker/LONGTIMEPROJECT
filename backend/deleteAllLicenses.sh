#!/bin/bash

# ===========================================
# سكريبت حذف جميع License Keys من السيرفر
# ===========================================

# الإعدادات
SERVER="http://13coffee.net:3030"
USERNAME="admin"
PASSWORD="admin123"

echo "=========================================="
echo "🗑️  حذف جميع License Keys"
echo "=========================================="

# 1. تسجيل الدخول والحصول على Token
echo ""
echo "🔐 تسجيل الدخول..."
LOGIN_RESPONSE=$(curl -s -X POST "$SERVER/api/auth/login" \
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

# 2. جلب جميع المفاتيح
echo ""
echo "📋 جلب قائمة المفاتيح..."
LICENSES_RESPONSE=$(curl -s -X GET "$SERVER/api/admin/licenses?limit=1000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

# استخراج الـ IDs
LICENSE_IDS=$(echo $LICENSES_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$LICENSE_IDS" ]; then
  echo "📭 لا توجد مفاتيح للحذف"
  exit 0
fi

# عد المفاتيح
COUNT=$(echo "$LICENSE_IDS" | wc -l | tr -d ' ')
echo "📊 وجدنا $COUNT مفتاح"

# 3. تأكيد الحذف
echo ""
read -p "⚠️  هل أنت متأكد من حذف جميع المفاتيح؟ (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "❌ تم الإلغاء"
  exit 0
fi

# 4. حذف كل مفتاح
echo ""
echo "🗑️  جاري الحذف..."
DELETED=0
FAILED=0

for ID in $LICENSE_IDS; do
  RESULT=$(curl -s -X DELETE "$SERVER/api/admin/licenses/$ID" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$RESULT" | grep -q "success\|تم"; then
    DELETED=$((DELETED + 1))
    echo "   ✅ تم حذف: $ID"
  else
    FAILED=$((FAILED + 1))
    echo "   ❌ فشل حذف: $ID"
  fi
done

echo ""
echo "=========================================="
echo "📋 ملخص:"
echo "   ✅ تم حذف: $DELETED مفتاح"
echo "   ❌ فشل: $FAILED مفتاح"
echo "=========================================="
