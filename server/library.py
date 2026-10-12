"""Searchable references to exchanged documents; original messages remain the evidence."""
import hashlib
import json
import re
import unicodedata
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

URL = re.compile(r'(?:https?://|www\.)[^\s<>"\u201c\u201d]+', re.I)
EXTENSIONS = r'(?:pdf|docx?|xlsx?|pptx?|csv|txt|md|json|xml|yaml|yml|zip|rar|7z|fig|drawio|bpmn|png|jpe?g|svg)'
FILE = re.compile(r'(?<![\w./\\])([\w][\w.()\-]*\.' + EXTENSIONS + r')\b', re.I)
QUOTED = re.compile(r'["\u201c`]([^"\u201d`\n]+)["\u201d`]')
PATH = re.compile(r'(?<!\w)(?:[A-Za-z]:\\|\\\\|/|\./|\.\./)[^\s<>"\u201c\u201d`]+')


def folded(text):
    return ''.join(char for char in unicodedata.normalize('NFKD', str(text).casefold().replace('đ', 'd')) if not unicodedata.combining(char))


def safe_url(value):
    if not isinstance(value, str):
        return None
    value = 'https://' + value if value.startswith('www.') else value
    try:
        parsed = urlparse(value)
        return value if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:
        return None


def references(message):
    text = message['text']
    found = {}
    attachment = message.get('attachment')
    if attachment and attachment.get('name'):
        found[attachment['name']] = {'kind': 'file', 'name': attachment['name'], 'value': attachment.get('path') or attachment['name'], 'url': None, 'mimeType': attachment.get('mimeType'), 'size': attachment.get('size'), 'origin': 'attachment'}
    links = list(message.get('links') or []) + [match.group().rstrip('.,;!?') for match in URL.finditer(text)]
    for value in links:
        # Closing punctuation is prose only when it is not balanced inside the URL.
        while value.endswith(')') and value.count(')') > value.count('('):
            value = value[:-1]
        url = safe_url(value)
        if not url:
            continue
        parsed = urlparse(url)
        name = unquote(PurePosixPath(parsed.path).name) or parsed.hostname
        found[url] = {'kind': 'folder' if '/folders/' in parsed.path else 'link', 'name': name, 'value': url, 'url': url, 'origin': 'link'}
    without_urls = URL.sub('', text)
    for match in QUOTED.finditer(without_urls):
        if re.search(r'(?:thư mục|folder)\s*$', without_urls[:match.start()], re.I):
            value = match.group(1)
            found.setdefault(value, {'kind': 'folder', 'name': value, 'value': value, 'url': None, 'origin': 'mentioned'})
    paths = [match.group(1) for match in QUOTED.finditer(without_urls)]
    unquoted = QUOTED.sub('', without_urls)
    paths += [match.group() for match in PATH.finditer(unquoted)]
    for value in paths:
        value = value.rstrip('.,;!?')
        is_file = bool(re.search(r'\.' + EXTENSIONS + r'$', value, re.I))
        if not is_file and (not re.match(r'^(?:[A-Za-z]:\\|\\\\|/|\./|\.\./)', value) or not re.search(r'[a-zA-Z_]', value)):
            continue
        found.setdefault(value, {'kind': 'file' if is_file else 'folder', 'name': value.replace('\\', '/').rstrip('/').rsplit('/', 1)[-1], 'value': value, 'url': None, 'origin': 'mentioned'})
        without_urls = without_urls.replace(value, '')
    for match in FILE.finditer(without_urls):
        value = match.group(1)
        if attachment and attachment.get('name', '').casefold().endswith(value.casefold()):
            continue
        found.setdefault(value, {'kind': 'file', 'name': value, 'value': value, 'url': None, 'origin': 'mentioned'})
    result = []
    for value, reference in found.items():
        key = message['id'] + ':' + hashlib.sha256(value.encode()).hexdigest()[:20]
        record = reference | {'id': key, 'sourceId': message['id'], 'sourceUrl': safe_url(message.get('url')) if message['kind'] in ('group', 'channel') else None, 'chatUrl': safe_url(message.get('url')) if message['kind'] in ('private', 'bot') else None, 'sender': message['sender'], 'senderId': message.get('senderId'), 'chat': message['chat'], 'chatId': message['chatId'], 'date': message['date'], 'outgoing': message['outgoing'], 'text': text}
        record['search'] = folded(' '.join(str(record.get(field) or '') for field in ('name', 'value', 'sender', 'chat', 'text')))
        result.append(record)
    return result


def index_message(connection, message):
    connection.execute("DELETE FROM records WHERE kind = 'resource' AND json_extract(data, '$.sourceId') = ?", (message['id'],))
    connection.executemany('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', [('resource', item['id'], json.dumps(item, ensure_ascii=False)) for item in references(message)])


def search_resources(connection, query='', kind='', chat='', sender='', direction='', start='', end='', offset=0, limit=40):
    indexed = connection.execute("SELECT data FROM records WHERE kind = 'meta' AND id = 'libraryVersion'").fetchone()
    if not indexed or indexed[0] != '2':
        connection.execute("DELETE FROM records WHERE kind = 'resource'")
        for row in connection.execute("SELECT data FROM records WHERE kind = 'message'").fetchall():
            index_message(connection, json.loads(row[0]))
        connection.execute('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', ('meta', 'libraryVersion', '2'))
    clauses, values = ["kind = 'resource'"], []
    for term in folded(query).split():
        clauses.append("json_extract(data, '$.search') LIKE ? ESCAPE '\\'")
        values.append('%' + term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%')
    for field, value in (('kind', kind), ('chatId', chat), ('senderId', sender)):
        if value:
            clauses.append(f"json_extract(data, '$.{field}') = ?")
            values.append(value)
    if direction:
        clauses.append("json_extract(data, '$.outgoing') = ?")
        values.append(direction == 'sent')
    for operator, value in (('>=', start), ('<=', end)):
        if value:
            clauses.append(f"date(json_extract(data, '$.date'), '+7 hours') {operator} ?")
            values.append(value)
    where = ' AND '.join(clauses)
    total = connection.execute('SELECT count(*) FROM records WHERE ' + where, values).fetchone()[0]
    rows = connection.execute('SELECT data FROM records WHERE ' + where + " ORDER BY julianday(json_extract(data, '$.date')) DESC, id LIMIT ? OFFSET ?", values + [limit, offset])
    items = [{key: value for key, value in json.loads(row[0]).items() if key != 'search'} for row in rows]
    chats = connection.execute("SELECT DISTINCT json_extract(data, '$.chatId'), json_extract(data, '$.chat') FROM records WHERE kind = 'resource' ORDER BY 2").fetchall()
    senders = connection.execute("SELECT DISTINCT json_extract(data, '$.senderId'), json_extract(data, '$.sender') FROM records WHERE kind = 'resource' AND json_extract(data, '$.senderId') IS NOT NULL ORDER BY 2").fetchall()
    return {'items': items, 'total': total, 'chats': [{'id': row[0], 'name': row[1]} for row in chats], 'senders': [{'id': row[0], 'name': row[1]} for row in senders]}
