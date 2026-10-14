#!/usr/bin/env python3
"""Interactive private mail setup. Never prints or accepts the API key as an argument."""
import getpass
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit
import warnings

project = Path(__file__).resolve().parent.parent
target = project / 'data' / 'email-settings.json'


def valid_origin(value):
    if not isinstance(value, str) or re.search(r'[\s\\]', value):
        return False
    try:
        url = urlsplit(value)
        host = url.hostname
        port = url.port
        if not host or url.username or url.password or url.path or url.query or url.fragment:
            return False
        local = host in ('localhost', '127.0.0.1', '::1')
        if url.scheme != 'https' and not (url.scheme == 'http' and local):
            return False
        if ':' in host:
            if '%' in host:
                return False
            authority = '[' + str(ipaddress.IPv6Address(host)) + ']'
        elif re.fullmatch(r'(?:[0-9]+|0x[0-9a-f]+)', host.rstrip('.').rsplit('.', 1)[-1]):
            authority = str(ipaddress.IPv4Address(host))
        elif re.fullmatch(r'[a-z0-9.-]+', host):
            authority = host
        else:
            return False
        if port == (443 if url.scheme == 'https' else 80):
            return False
        if port is not None:
            authority += ':' + str(port)
        # Match the canonical URL.origin accepted by the application, without normalizing silently.
        return value == url.scheme + '://' + authority
    except ValueError:
        return False


def private_key():
    # getpass warns before falling back to echoing input; turn that warning into a hard stop.
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        return getpass.getpass('API key Brevo (ввод скрыт): ').strip()


def save_settings(settings, destination):
    destination.parent.mkdir(exist_ok=True, mode=0o700)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', encoding='utf-8', prefix='.email-settings-', suffix='.tmp',
            dir=destination.parent, delete=False,
        ) as file:
            temporary = Path(file.name)
            json.dump(settings, file)
            file.flush()
            os.fsync(file.fileno())
        temporary.replace(destination)
        os.chmod(destination, 0o600)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    if not sys.stdin.isatty():
        print('Открой этот скрипт в своём Terminal: ввод ключа должен быть скрыт.')
        return 1
    if target.exists():
        answer = input('Настройки уже существуют. Заменить их? [да/нет]: ').strip()
        if answer.lower() not in ('да', 'yes'):
            print('Настройки оставлены без изменений.')
            return 0
    print('Настройка бесплатной отправки писем через Brevo.')
    print('Ключ вводится скрыто и сохраняется только локально, вне Git.')
    sender = input('Подтверждённый email отправителя в Brevo: ').strip().lower()
    if len(sender) > 254 or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', sender):
        print('Проверь email отправителя.')
        return 1
    origin = input('Адрес приложения [http://localhost:3103]: ').strip() or 'http://localhost:3103'
    if not valid_origin(origin):
        print('Нужен HTTPS-адрес без пути или локальный адрес без завершающего слеша.')
        return 1
    try:
        key = private_key()
    except getpass.GetPassWarning:
        print('Ключ не запрошен: скрытый ввод недоступен. Открой свой Terminal и повтори настройку.')
        return 1
    # These are public Brevo key-format prefixes, not credential values.
    if key.startswith('xsmtpsib-'):
        print('Это SMTP-ключ. Открой в Brevo «API Keys & MCP» и создай API-ключ: его текущий формат начинается с xkeysib-.')
        print('Настройки не изменены. Скопируй API-ключ и запусти настройку снова.')
        return 1
    if not 20 <= len(key) <= 500 or '\n' in key or '\r' in key:
        print('Ключ не сохранён: проверь, что скопирован API key целиком.')
        return 1
    save_settings({'apiKey': key, 'senderEmail': sender, 'publicOrigin': origin}, target)
    print('Настройки сохранены. Ключ не выводился. Можно вернуться в Codex.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print('\nНастройка отменена.')
        sys.exit(1)
    except OSError:
        print('Не удалось сохранить настройки. Ключ не выводился; повтори настройку.')
        sys.exit(1)
