"""Local, deterministic extraction. Original messages always remain available."""
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Asia/Ho_Chi_Minh')
ACTION = re.compile(r'\b(review|check|kiểm tra|xác nhận|cập nhật|chuẩn bị|gửi|làm rõ|chốt|phản hồi|giúp|nhờ|cần|deadline|hoàn thành|bổ sung|sửa|duyệt|đặt lịch|hãy|please|can you|could you|verify|prepare|update|send|confirm|finish|deliver|approve)\b|\?', re.I)


def local_day(iso):
    value = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return value.replace(tzinfo=TZ).astimezone(TZ).date().isoformat() if value.tzinfo is None else value.astimezone(TZ).date().isoformat()


def deadline(text, iso):
    date = datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone(TZ)
    if re.search(r'\b(ngày mai|tomorrow)\b', text, re.I):
        date += timedelta(days=1)
    match = re.search(r'(?<!\d)([01]?\d|2[0-3])\s*(?:h|:)([0-5]\d)?(?!\d)', text)
    if match:
        return date.replace(hour=int(match[1]), minute=int(match[2] or 0), second=0, microsecond=0).isoformat()
    # ponytail: Keep inferred deadlines unset until supported by explicit date evidence.
    return None


def analyze(messages, day):
    chats = {}
    for message in messages:
        if message['kind'] not in ('private', 'group'):
            continue
        chats.setdefault(message['chatId'], []).append(message)
    tasks = []
    for chat in chats.values():
        chat.sort(key=lambda message: datetime.fromisoformat(message['date']))
        by_id = {message['id']: message for message in chat}
        outgoing = [item for item in chat if item['outgoing']]
        replies = {}
        for item in chat:
            if item['replyTo']:
                replies.setdefault(item['replyTo'], []).append(item)
        relevant = set()
        for index, message in enumerate(chat):
            parent = by_id.get(message['replyTo'])
            directed = message['mentioned'] or (parent is not None and parent['outgoing']) or message['replyTo'] in relevant
            if directed and not message['outgoing']:
                relevant.add(message['id'])
            if message['outgoing'] or local_day(message['date']) != day:
                continue
            if not (message['kind'] == 'private' or directed) or not ACTION.search(message['text']):
                continue
            reply = reply_state(message, outgoing)
            context = [item for item in chat[max(0, index - 2):index + 3] if abs((datetime.fromisoformat(item['date']) - datetime.fromisoformat(message['date'])).total_seconds()) <= 1800]
            if parent and parent not in context:
                context.insert(0, parent)
            direct_replies = replies.get(message['id'], [])
            context = list({item['id']: item for item in context + direct_replies}.values())
            tasks.append(make_task(message, context, reply))
    return tasks


def make_task(message, context, reply='unanswered'):
    title = re.sub(r'@[\w]+', '', message['text']).strip().split('\n')[0][:110]
    return {
        'id': 'tg-' + message['id'], 'title': title or 'Kiểm tra yêu cầu trong tin nhắn',
        'description': message['text'], 'project': message['chat'], 'sender': message['sender'],
        'senderId': message.get('senderId'), 'chatId': message['chatId'], 'kind': message['kind'],
        'priority': 'high' if re.search(r'\b(gấp|urgent|asap|khẩn|deadline)\b', message['text'], re.I) else 'medium',
        'status': 'todo', 'replyStatus': reply, 'createdAt': message['date'],
        'dueAt': deadline(message['text'], message['date']), 'sourceId': message['id'], 'context': context,
        'tags': [tag for tag in ['BRD', 'UAT', 'API', 'User story', 'Acceptance criteria', 'Wireframe'] if tag.lower() in message['text'].lower()],
        'snoozedUntil': None, 'completedAt': None,
    }


def person_key(task):
    return task.get('senderId') or (task['sender'] + ':' + (task.get('chatId') or task['project']))


def group_tasks(tasks):
    people = {}
    for task in tasks:
        key = person_key(task)
        people.setdefault(key, {'id': key, 'name': task['sender'], 'tasks': []})['tasks'].append(task)
    for person in people.values():
        person['tasks'].sort(key=lambda task: ({'high': 0, 'medium': 1, 'low': 2}[task['priority']], task['createdAt']))
    return sorted(people.values(), key=lambda person: person['name'].casefold())


def reply_state(message, later):
    outgoing = [item for item in later if item['outgoing'] and datetime.fromisoformat(item['date']) > datetime.fromisoformat(message['date'])]
    if any(item['replyTo'] == message['id'] for item in outgoing):
        return 'replied'
    return 'uncertain' if message['kind'] == 'private' and outgoing else 'unanswered'


def flatten_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ''.join(item if isinstance(item, str) else str(item.get('text', '')) if isinstance(item, dict) else '' for item in value)
    return ''


def parse_export(payload, self_id, username):
    if not isinstance(payload, dict):
        raise ValueError('File phải là Telegram Desktop JSON export.')
    if not self_id:
        self_id = str(payload.get('personal_information', {}).get('user_id', ''))
    self_id = self_id.removeprefix('user')
    if not self_id.isdigit():
        raise ValueError('Cần Telegram User ID của bạn để xác định chính xác tin đã gửi.')
    chats_root = payload.get('chats', {})
    chats = chats_root.get('list', []) if isinstance(chats_root, dict) else []
    if 'messages' in payload:
        chats = [payload]
    if not isinstance(chats, list) or not chats:
        raise ValueError('Không tìm thấy cuộc trò chuyện trong file export.')
    messages = []
    for chat in chats:
        if not isinstance(chat, dict):
            continue
        chat_id = str(chat.get('id', ''))
        if not chat_id:
            continue
        chat_type = chat.get('type')
        kind = 'private' if chat_type == 'personal_chat' else 'saved' if chat_type == 'saved_messages' else 'bot' if chat_type == 'bot_chat' else 'channel' if chat_type in ('private_channel', 'public_channel') else 'group'
        for item in chat.get('messages', []):
            if not isinstance(item, dict) or item.get('type') != 'message':
                continue
            text = flatten_text(item.get('text', ''))
            raw_date = item.get('date', '')
            try:
                date = datetime.fromisoformat(raw_date.replace('Z', '+00:00'))
                if date.tzinfo is None:
                    date = date.replace(tzinfo=TZ)
            except (ValueError, AttributeError):
                continue
            entities = item.get('text_entities', [])
            entities = entities if isinstance(entities, list) else []
            mentioned = bool(username and re.search(r'@' + re.escape(username.lstrip('@')) + r'\b', text, re.I)) or any(isinstance(entity, dict) and entity.get('type') == 'mention_name' and str(entity.get('user_id')) == self_id for entity in entities)
            reply = item.get('reply_to_message_id')
            messages.append({'id': f'{chat_id}:{item["id"]}', 'chatId': chat_id, 'chat': chat.get('name', 'Telegram'), 'sender': item.get('from', 'Telegram'), 'senderId': str(item.get('from_id', '')).removeprefix('user') or None, 'text': text or '[Tin nhắn đính kèm]', 'date': date.isoformat(), 'outgoing': str(item.get('from_id')) == f'user{self_id}', 'replyTo': f'{chat_id}:{reply}' if reply is not None else None, 'kind': kind, 'mentioned': mentioned, 'url': None})
            entities = entities + (item.get('text', []) if isinstance(item.get('text'), list) else [])
            messages[-1]['links'] = list(dict.fromkeys(entity['href'] for entity in entities if isinstance(entity, dict) and isinstance(entity.get('href'), str)))
            path = item.get('file')
            if isinstance(path, str) and not path.startswith('('):
                name = item.get('file_name')
                size = item.get('file_size')
                messages[-1]['attachment'] = {'name': name if isinstance(name, str) and name else path.replace('\\', '/').rsplit('/', 1)[-1], 'path': path, 'mimeType': item.get('mime_type') if isinstance(item.get('mime_type'), str) else None, 'size': size if isinstance(size, int) and not isinstance(size, bool) and size >= 0 else None}
                if item.get('media_type') in ('sticker', 'custom_emoji'):
                    messages[-1]['attachment']['mediaType'] = 'sticker' if item['media_type'] == 'sticker' else 'emoji'
    if not messages:
        raise ValueError('File không chứa tin nhắn hợp lệ.')
    return messages, self_id


def brief_text(text, limit=110):
    value = ' '.join(text.split())
    return value if len(value) <= limit else value[:limit - 1].rsplit(' ', 1)[0] + '…'


def report_lines(tasks, day):
    active = [task for task in tasks if task['status'] != 'done']
    waiting = [task for task in tasks if task['replyStatus'] in ('unanswered', 'uncertain')]
    lines = [f'BA Desk · {datetime.fromisoformat(day).strftime("%d/%m/%Y")}', f'{len(waiting)} cần phản hồi · {len(active)} chưa xong · {len(tasks) - len(active)} hoàn thành', '']
    labels = {'unanswered': 'Cần trả lời', 'uncertain': 'Kiểm tra phản hồi', 'replied': 'Đã trả lời', 'na': 'Tự tạo'}
    for person in group_tasks(tasks):
        lines.append(brief_text(person['name'], 80))
        for task in person['tasks']:
            at = datetime.fromisoformat(task['createdAt']).astimezone(TZ).strftime('%H:%M')
            state = '✓ Hoàn thành' if task['status'] == 'done' else labels[task['replyStatus']] + (' · Đang làm' if task['status'] == 'doing' else '')
            if task['status'] == 'done' and task['replyStatus'] in ('unanswered', 'uncertain'):
                state += ' · ' + labels[task['replyStatus']]
            line = f'• {at} {brief_text(task["title"])} — {state}'
            if task.get('dueAt'):
                due = datetime.fromisoformat(task['dueAt']).astimezone(TZ).strftime('%d/%m %H:%M')
                line += ' · Hạn ' + due
            lines.append(line)
        lines.append('')
    if not tasks:
        lines.append('Không có yêu cầu công việc trong ngày đang theo dõi.')
    return lines


def report_text(tasks, day):
    return '\n'.join(report_lines(tasks, day))
