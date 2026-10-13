import hashlib
import json
import os
import sqlite3
from datetime import datetime
from .analyzer import reply_state
from .library import index_message, search_resources
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

DATA_DIR = Path(os.environ.get('BA_DESK_DATA_DIR', str(Path(__file__).resolve().parent.parent / '.local')))


@contextmanager
def database():
    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = DATA_DIR / 'desk.sqlite'
    connection = sqlite3.connect(path)
    os.chmod(path, 0o600)
    connection.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY (kind, id))')
    connection.execute("CREATE INDEX IF NOT EXISTS resource_source ON records(json_extract(data, '$.sourceId')) WHERE kind = 'resource'")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_all(kind):
    with database() as connection:
        return [json.loads(row[0]) for row in connection.execute('SELECT data FROM records WHERE kind = ?', (kind,))]


def day_messages(day):
    with database() as connection:
        rows = connection.execute("SELECT data FROM records WHERE kind = 'message' AND date(json_extract(data, '$.date'), '+7 hours') = ?", (day,))
        return [json.loads(row[0]) for row in rows]


def resources(**filters):
    with database() as connection:
        return search_resources(connection, **filters)


def get(kind, key, default=None):
    with database() as connection:
        row = connection.execute('SELECT data FROM records WHERE kind = ? AND id = ?', (kind, key)).fetchone()
    return json.loads(row[0]) if row else default


def put(kind, key, data):
    with database() as connection:
        connection.execute('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', (kind, key, json.dumps(data, ensure_ascii=False)))


def remove(kind, key):
    with database() as connection:
        connection.execute('DELETE FROM records WHERE kind = ? AND id = ?', (kind, key))


def set_task_status(keys, status, now):
    with database() as connection:
        tasks = []
        for key in dict.fromkeys(keys):
            row = connection.execute("SELECT data FROM records WHERE kind = 'task' AND id = ?", (key,)).fetchone()
            if not row:
                raise KeyError(key)
            task = json.loads(row[0])
            if task['status'] != status:
                task.update(status=status, completedAt=now.isoformat() if status == 'done' else None)
            tasks.append(task)
        for task in tasks:
            connection.execute("UPDATE records SET data = ? WHERE kind = 'task' AND id = ?", (json.dumps(task, ensure_ascii=False), task['id']))
        return tasks


def bind_account(account_id, mode='telegram', user='Bạn', username=''):
    account_id = str(account_id)
    previous = get('meta', 'accountId')
    if previous == account_id:
        put('meta', 'mode', mode)
        if user != 'Bạn':
            put('meta', 'user', user)
        return False
    revision = get('meta', 'accountRevision', 0) + 1
    legacy = previous is None and bool(get_all('message'))
    with database() as connection:
        if legacy:
            # Legacy messages have no owner; preserve one recovery copy before replacing them.
            path = DATA_DIR / f'legacy-{uuid4().hex}.sqlite'
            backup = sqlite3.connect(path)
            try:
                connection.backup(backup)
            finally:
                backup.close()
            os.chmod(path, 0o600)
        connection.execute("DELETE FROM records WHERE kind NOT IN ('settings', 'event', 'task')")
        connection.execute("DELETE FROM records WHERE kind = 'task' AND json_extract(data, '$.kind') != 'manual'")
        row = connection.execute("SELECT data FROM records WHERE kind = 'settings' AND id = 'main'").fetchone()
        config = json.loads(row[0]) if row else {}
        config.update(selfId=account_id, username=username)
        connection.execute('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', ('settings', 'main', json.dumps(config, ensure_ascii=False)))
        for key, value in {'accountId': account_id, 'accountRevision': revision, 'mode': mode, 'user': user}.items():
            connection.execute('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', ('meta', key, json.dumps(value, ensure_ascii=False)))
    bot_path = DATA_DIR / 'telegram-bot.json'
    if bot_path.exists():
        bot_config = json.loads(bot_path.read_text())
        if str(bot_config.get('chatId')) != account_id:
            bot_path.unlink()
    return True


def watched_tasks():
    ignored = {group['id'] for group in get_all('group') if group.get('ignored')}
    return [task for task in get_all('task') if task.get('aiRelevant', True) and (task.get('chatId') or (task.get('sourceId') or '').rsplit(':', 1)[0]) not in ignored]


def conversation(chat_id):
    with database() as connection:
        rows = connection.execute("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.chatId') = ?", (str(chat_id),))
        return sorted([json.loads(row[0]) for row in rows], key=lambda item: datetime.fromisoformat(item['date']))


def save_messages_and_tasks(messages, tasks, refresh_replies=True):
    with database() as connection:
        for message in messages:
            connection.execute('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', ('message', message['id'], json.dumps(message, ensure_ascii=False)))
            index_message(connection, message)
        for task in tasks:
            row = connection.execute('SELECT data FROM records WHERE kind = ? AND id = ?', ('task', task['id'])).fetchone()
            if row:
                previous = json.loads(row[0])
                for field in ('status', 'priority', 'snoozedUntil', 'completedAt', 'ai', 'aiRelevant'):
                    if field in previous:
                        task[field] = previous[field]
                if previous.get('ai'):
                    task['title'] = previous['title']
                if previous.get('replyOverride'):
                    task['replyStatus'] = previous['replyStatus']
                    task['replyOverride'] = True
            connection.execute('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', ('task', task['id'], json.dumps(task, ensure_ascii=False)))
        if not refresh_replies:
            return
        all_messages = {item['id']: item for item in [json.loads(row[0]) for row in connection.execute('SELECT data FROM records WHERE kind = ?', ('message',))]}
        outgoing, chats = {}, {}
        for item in all_messages.values():
            chats.setdefault(item['chatId'], []).append(item)
            if item['outgoing']:
                outgoing.setdefault(item['chatId'], []).append(item)
        hashes = {key: conversation_hash(items) for key, items in chats.items()}
        for row in connection.execute('SELECT data FROM records WHERE kind = ?', ('task',)).fetchall():
            task = json.loads(row[0])
            source = all_messages.get(task.get('sourceId'))
            if source and not task.get('replyOverride'):
                later = outgoing.get(source['chatId'], [])
                ai = task.get('ai', {})
                changed = ai and ai.get('conversationHash') != hashes.get(source['chatId'])
                if changed:
                    ai['stale'] = True
                    task['aiRelevant'] = True
                if ai.get('stale'):
                    task['replyStatus'] = 'uncertain'
                elif not ai:
                    task['replyStatus'] = reply_state(source, later)
                else:
                    task['replyStatus'] = ai['replyStatus']
                replies = [item for item in later if item['replyTo'] == source['id']]
                task['context'] = list({item['id']: item for item in task['context'] + replies}.values())
                connection.execute('UPDATE records SET data = ? WHERE kind = ? AND id = ?', (json.dumps(task, ensure_ascii=False), 'task', task['id']))


def save_group(chat_id, name, last_message_at=None):
    key = str(chat_id)
    previous = get('group', key, {})
    put('group', key, previous | {'id': key, 'name': name, 'ignored': previous.get('ignored', False), 'lastMessageAt': last_message_at or previous.get('lastMessageAt')})


def conversation_hash(messages):
    data = [{key: item.get(key) for key in ('id', 'text', 'date', 'outgoing', 'replyTo', 'mentioned')} for item in sorted(messages, key=lambda item: item['id'])]
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
