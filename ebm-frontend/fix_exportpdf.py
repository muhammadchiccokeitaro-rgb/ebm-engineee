filepath = r'C:\Users\Chicco\.gemini\antigravity\scratch\slope-stability-app\ebm-engine\ebm-frontend\lib\exportPDF.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Print lines 24-28 to see what is wrong
lines = content.split('\n')
for i, line in enumerate(lines[23:30], start=24):
    print(i, repr(line[:80]))