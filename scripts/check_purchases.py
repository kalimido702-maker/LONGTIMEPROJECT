import re

with open('/Users/mohamedahmed/Desktop/Desktop/MyWork/MYPOS/Customize/sahl2.sql', 'r') as f:
    content = f.read()

# Find all invoice INSERT values
# Format: (pk, 'KIND', id, store_id, 'date', 'time', account_id, ...)
pattern = r"\((\d+),\s*'PURCHASE',\s*(\d+),\s*\d+,\s*'[^']+',\s*'[^']+',\s*(\d+),"
matches = re.findall(pattern, content)

cust3_purchases = [(pk, inv_id, acc_id) for pk, inv_id, acc_id in matches if acc_id == '3']

print(f"Total PURCHASE invoices in sahl2: {len(matches)}")
print(f"PURCHASE invoices for account_id=3 (قاصد كريم): {len(cust3_purchases)}")

if cust3_purchases:
    print("\nPurchase invoice PKs:")
    for pk, inv_id, _ in cust3_purchases:
        print(f"  pk={pk}, invoice_id={inv_id}")

# Also check RETURNPUR for this account
pattern_ret = r"\((\d+),\s*'RETURNPUR',\s*(\d+),\s*\d+,\s*'[^']+',\s*'[^']+',\s*(\d+),"
matches_ret = re.findall(pattern_ret, content)
cust3_returns = [(pk, inv_id, acc_id) for pk, inv_id, acc_id in matches_ret if acc_id == '3']
print(f"\nRETURNPUR invoices for account_id=3: {len(cust3_returns)}")

# Check account kind for id=3
acc_pattern = r"\(3,\s*'([^']+)',\s*'([^']*)',\s*([0-9.]+),\s*([0-9.]+),"
acc_match = re.search(acc_pattern, content)
if acc_match:
    print(f"\nAccount 3: name='{acc_match.group(1)}', code='{acc_match.group(2)}', balance_in={acc_match.group(3)}, balance_out={acc_match.group(4)}")
