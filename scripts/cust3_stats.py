import json

with open('/Users/mohamedahmed/Desktop/Desktop/MyWork/MYPOS/Customize/sahl2_import_for_mypos.json', 'r') as f:
    data = json.load(f)

cid = 'cust_3'
invoices = [i for i in data['data']['invoices'] if i.get('customerId') == cid]
payments = [p for p in data['data']['payments'] if p.get('customerId') == cid]
returns = [r for r in data['data']['salesReturns'] if r.get('customerId') == cid]

inv_total = sum(i['total'] for i in invoices)
pay_total = sum(p['amount'] for p in payments)
ret_total = sum(r['total'] for r in returns)
net = inv_total - pay_total - ret_total
cust = [c for c in data['data']['customers'] if c['id'] == cid][0]

print(f"Customer: {cust['name']} ({cid})")
print("─" * 35)
print(f"Invoices count:   {len(invoices)}")
print(f"Payments count:   {len(payments)}")
print(f"Returns count:    {len(returns)}")
print("─" * 35)
print(f"Invoices total:   {inv_total:,.2f}")
print(f"Payments total:   {pay_total:,.2f}")
print(f"Returns total:    {ret_total:,.2f}")
print("─" * 35)
print(f"Net transactions: {net:,.2f}")
print(f"previousStatement:{cust['previousStatement']:,.2f}")
print(f"currentBalance:   {cust['currentBalance']:,.2f}")
print(f"Calculated (prev+net): {cust['previousStatement'] + net:,.2f}")
