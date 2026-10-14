filepath = r'C:\Users\Chicco\.gemini\antigravity\scratch\slope-stability-app\ebm-engine\ebm-frontend\components\WorkspaceModal.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()
bad_char = chr(7)
old_str = '                ' + '<' + 'div className={' + bad_char + 'bsolute inset-0 bg-gradient-to-br  opacity-0 group-hover:opacity-10 transition-opacity} />'
new_str = '                ' + '<' + "div className={'absolute inset-0 bg-gradient-to-br ' + tpl.color + ' opacity-0 group-hover:opacity-10 transition-opacity'} />"
print('Old found:', old_str in content)
content = content.replace(old_str, new_str)
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')