#!/bin/bash

# ===========================================
# سكريبت حذف جميع Clients من السيرفر
# ===========================================

# الإعدادات
SERVER="http://13coffee.net:3030"
USERNAME="admin"
PASSWORD="admin123"

echo "=========================================="
echo "🗑️  حذف جميع Clients"
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

# 2. جلب جميع الـ Clients
echo ""
echo "📋 جلب قائمة Clients..."
CLIENTS_RESPONSE=$(curl -s -X GET "$SERVER/api/admin/clients?limit=1000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

# استخراج الـ IDs
CLIENT_IDS=$(echo $CLIENTS_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CLIENT_IDS" ]; then
  echo "📭 لا يوجد Clients للحذف"
  exit 0
fi

# عد الـ Clients
COUNT=$(echo "$CLIENT_IDS" | wc -l | tr -d ' ')
echo "📊 وجدنا $COUNT Client"

# 3. تأكيد الحذف
echo ""
echo "⚠️  تحذير: حذف الـ Clients سيحذف أيضاً:"
echo "   - جميع الـ Branches المرتبطة"
echo "   - جميع الـ Licenses المرتبطة"
echo "   - جميع البيانات المرتبطة"
echo ""
read -p "⚠️  هل أنت متأكد من حذف جميع الـ Clients؟ (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "❌ تم الإلغاء"
  exit 0
fi

# 4. حذف كل Client
echo ""
echo "🗑️  جاري الحذف..."
DELETED=0
FAILED=0

for ID in $CLIENT_IDS; do
  RESULT=$(curl -s -X DELETE "$SERVER/api/admin/clients/$ID" \
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
echo "   ✅ تم حذف: $DELETED Client"
echo "   ❌ فشل: $FAILED Client"
echo "=========================================="
