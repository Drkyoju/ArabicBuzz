#!/usr/bin/env python3
"""
One-time Telethon login → print TELEGRAM_SESSION_STRING.
Never posts to Telegram chats. Run on the Mac that will host storage:sync.

  python3 scripts/telegram-mtproto-login.py

Requires TELEGRAM_API_ID + TELEGRAM_API_HASH from https://my.telegram.org
(or set them interactively). Account must be a member of «عمل الجمعية».
"""
from __future__ import annotations

import os
import sys


def main() -> int:
    try:
        from telethon.sync import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        print(
            "ثبّت Telethon أولاً:\n  python3 -m pip install --user telethon\n"
            "أو: /tmp/tg-telethon-venv/bin/pip install telethon",
            file=sys.stderr,
        )
        return 1

    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    if not api_id:
        api_id = input("TELEGRAM_API_ID: ").strip()
    if not api_hash:
        api_hash = input("TELEGRAM_API_HASH: ").strip()
    if not api_id or not api_hash:
        print("مطلوب API_ID و API_HASH من https://my.telegram.org", file=sys.stderr)
        return 1

    print(
        "سجّل الدخول بحساب عضو في مجموعة «عمل الجمعية» (ليس البوت).\n"
        "لن يُرسل أي رسالة للمجموعة — جلسة محلية فقط.",
        flush=True,
    )
    with TelegramClient(StringSession(), int(api_id), api_hash) as client:
        me = client.get_me()
        string = client.session.save()
        print("---")
        print(f"logged_in_as={getattr(me, 'username', None) or me.id}")
        print("ضع السطر التالي في .env.local على الماك (ولا ترسله للدردشة):")
        print(f"TELEGRAM_SESSION_STRING={string}")
        print("---")
        out = os.path.expanduser("~/.arabicbuzz-telegram.session.txt")
        with open(out, "w", encoding="utf-8") as f:
            f.write(string)
        print(f"نُسخ أيضاً إلى {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
