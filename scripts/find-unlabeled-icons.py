"""Lists icon-only touchables with no accessibilityLabel. A screen reader
announces nothing useful for these. Run: python3 scripts/find-unlabeled-icons.py"""
import re, glob, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

EMOJI = re.compile('[\U0001F300-\U0001FAFF…‹›←-⇿∀-⋿■-◿☀-➿⬀-⯿\xd7]')
TAGS = ("TouchableOpacity", "Pressable", "TouchableHighlight")


def elements(src):
    for m in re.finditer(r'<(%s)\b' % "|".join(TAGS), src):
        tag, i, depth = m.group(1), m.end(), 0
        while i < len(src):
            c = src[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            elif c == '>' and depth == 0 and src[i - 1] != '=':
                break
            i += 1
        if src[i - 1] == '/':
            continue
        close = src.find('</%s>' % tag, i)
        if close >= 0:
            yield m.start(), src[m.end():i], src[i + 1:close]


def announced(body):
    """Text a screen reader would read: JSX text plus string literals."""
    body = re.sub(r'<[^>]*>', '', body)
    out, buf, depth, i = [], '', 0, 0
    while i < len(body):
        c = body[i]
        if c == '{':
            depth += 1
            if depth == 1:
                out.append(buf); buf = ''
        elif c == '}':
            depth -= 1
        elif depth == 0:
            buf += c
        elif c in '"\'`':
            j = body.find(c, i + 1)
            if j < 0:
                break
            out.append(body[i + 1:j]); i = j
        i += 1
    out.append(buf)
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()


hits = []
for path in sorted(glob.glob('src/**/*.tsx', recursive=True) + ['App.tsx']):
    try:
        src = open(path, encoding='utf8').read()
    except UnicodeDecodeError as e:
        hits.append('%s: not valid UTF-8 (byte 0x%02x at offset %d)' % (path, e.object[e.start], e.start))
        continue
    for pos, attrs, body in elements(src):
        if 'accessibilityLabel' in attrs or any('<' + t in body for t in TAGS):
            continue
        text = announced(body)
        if EMOJI.search(text) and len(re.sub(r'[^A-Za-z]', '', text)) < 3:
            hits.append('%s:%d  %s' % (path, src[:pos].count('\n') + 1, text[:40]))

print('\n'.join(hits))
print('%d unlabeled icon-only touchables' % len(hits))
sys.exit(1 if hits else 0)
