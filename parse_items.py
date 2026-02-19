import re

with open("/Users/mohamedahmed/Desktop/Desktop/MyWork/MYPOS/Customize/sahl2.sql") as f:
    lines = f.readlines()

service1 = []
dead1 = []

for idx in range(38996, min(39400, len(lines))):
    line = lines[idx].strip()
    if not line.startswith("("):
        continue
    # Look for the unit field pattern followed by service value
    # unit is a quoted string like 'xxx', then service is 0 or 1
    matches = re.findall(r"'([^']*)'", line)
    # Find which quoted string is the unit (it comes after category6)
    # Let's just look at the raw pattern after the unit field
    # The unit is field index 17, service is 18
    # Let's find by looking for the unit pattern
    unit_match = re.search(r"'(قطعة|كرتونة|متر|لفة|علبة|طقم|كيلو|[^']*)',\s*(\d+),", line)
    if unit_match:
        service_val = int(unit_match.group(2))
        if service_val == 1:
            service1.append(line[:600])
    
    # For dead=1: check the pattern near end
    # Fields: expirable(0/1), expire_after_days(int), expire_alert_days(int), dead(0/1), photo(0/1)
    dead_match = re.search(r",\s*0,\s*0,\s*0,\s*1,\s*0,\s*'", line)
    if dead_match:
        dead1.append(line[:600])

print("=== service=1 items ({}) ===".format(len(service1)))
for s in service1[:5]:
    print(s)
    print()

print("=== dead=1 items ({}) ===".format(len(dead1)))
for s in dead1[:5]:
    print(s)
    print()
