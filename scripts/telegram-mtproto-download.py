#!/usr/bin/env python3
"""
Download a Telegram document via user MTProto (Telethon) — Docker-free.

Bot API (cloud ~20MB, and bot file_id) cannot pull large group docs.
This uses a user session that is a member of the group.

Env:
  TELEGRAM_API_ID, TELEGRAM_API_HASH
  TELEGRAM_SESSION_STRING (or ~/.arabicbuzz-telegram.session.txt)
  TELEGRAM_DL_CHAT_ID (default -1003855925966)
  TELEGRAM_DL_MESSAGE_ID (optional — preferred)
  TELEGRAM_DL_NAME_FILTER (optional substring; default prefers معلم اول seerah)
  TELEGRAM_DL_OUT (default ~/ArabicBuzz/recovered/tg-history)
  TELEGRAM_DL_MUALLIM_ONLY=1 (default)

Stdout: one JSON object (path to file on disk — no huge base64).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path


def norm_ar(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace("\u0640", "")
    # strip Arabic combining marks (e.g. hamza above on أ)
    s = re.sub(r"[\u064b-\u065f\u0670]", "", s)
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ة", "ه"), ("ى", "ي")):
        s = s.replace(a, b)
    return s


def is_biology(name: str) -> bool:
    n = norm_ar(name)
    return bool(re.search(r"احياء|biology|دليل\s*معلم\s*الاحياء", n))


def is_muallim_seerah(name: str) -> bool:
    if is_biology(name):
        return False
    n = norm_ar(name)
    return bool(re.search(r"المعلم\s*الاول|معلم\s*اول", n))


def load_dotenv_local() -> None:
    root = Path(__file__).resolve().parents[1]
    env_path = root / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def load_session() -> str:
    session = (
        os.environ.get("TELEGRAM_SESSION_STRING")
        or os.environ.get("TELEGRAM_SESSION")
        or ""
    ).strip()
    if session:
        return session
    p = Path.home() / ".arabicbuzz-telegram.session.txt"
    if p.is_file():
        return p.read_text(encoding="utf-8").strip()
    return ""


def file_name_from_message(m) -> str:
    name = ""
    if m.file and m.file.name:
        name = m.file.name
    elif m.document:
        for a in m.document.attributes:
            fn = getattr(a, "file_name", None)
            if fn:
                name = fn
                break
    return name or f"tg-{m.id}"


async def amain() -> int:
    load_dotenv_local()
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        from telethon.tl.types import InputMessagesFilterDocument
    except ImportError:
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": False,
                    "errorAr": "Telethon غير مثبّت — /tmp/tg-telethon-venv/bin/pip install telethon",
                },
                ensure_ascii=False,
            )
        )
        return 2

    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    session = load_session()
    if not api_id or not api_hash or not session:
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": False,
                    "errorAr": "ناقص TELEGRAM_API_ID / HASH / SESSION",
                    "setupAr": "npm run telegram:mtproto-login (QR أو هاتف) — بلا رسالة للمجموعة",
                },
                ensure_ascii=False,
            )
        )
        return 3

    chat = int(os.environ.get("TELEGRAM_DL_CHAT_ID") or "-1003855925966")
    message_id_raw = (os.environ.get("TELEGRAM_DL_MESSAGE_ID") or "").strip()
    message_id = int(message_id_raw) if message_id_raw.isdigit() else None
    name_filter = (os.environ.get("TELEGRAM_DL_NAME_FILTER") or "").strip() or None
    muallim_only = (os.environ.get("TELEGRAM_DL_MUALLIM_ONLY") or "1").strip() not in (
        "0",
        "false",
        "no",
    )
    out = Path(
        os.environ.get("TELEGRAM_DL_OUT")
        or str(Path.home() / "ArabicBuzz/recovered/tg-history")
    )
    out.mkdir(parents=True, exist_ok=True)

    client = TelegramClient(StringSession(session), int(api_id), api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": False,
                    "errorAr": "جلسة منتهية — أعد npm run telegram:mtproto-login",
                },
                ensure_ascii=False,
            )
        )
        await client.disconnect()
        return 4

    try:
        target = None
        if message_id is not None:
            target = await client.get_messages(chat, ids=message_id)
            if not target or not target.document:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "credentialsReady": True,
                            "errorAr": f"لا مستند في الرسالة {message_id}",
                        },
                        ensure_ascii=False,
                    )
                )
                await client.disconnect()
                return 5
        else:
            async for m in client.iter_messages(
                chat, filter=InputMessagesFilterDocument, limit=400
            ):
                name = file_name_from_message(m)
                if is_biology(name):
                    continue
                if muallim_only and not is_muallim_seerah(name):
                    if not (name_filter and name_filter in norm_ar(name)):
                        continue
                if name_filter and name_filter not in norm_ar(name):
                    if not is_muallim_seerah(name):
                        continue
                target = m
                break

        if not target or not target.document:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "credentialsReady": True,
                        "errorAr": "لم يُعثر على المستند في تاريخ المجموعة (MTProto)",
                    },
                    ensure_ascii=False,
                )
            )
            await client.disconnect()
            return 6

        name = file_name_from_message(target)
        if is_biology(name):
            print(
                json.dumps(
                    {
                        "ok": False,
                        "credentialsReady": True,
                        "errorAr": "رفض: ملف أحياء — ليس المعلم الأول للسيرة",
                    },
                    ensure_ascii=False,
                )
            )
            await client.disconnect()
            return 7

        size = getattr(target.document, "size", None)
        dest = out / (name or f"tg-{target.id}.pdf")
        path = await target.download_media(file=str(dest))
        if not path:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "credentialsReady": True,
                        "errorAr": "فشل download_media",
                    },
                    ensure_ascii=False,
                )
            )
            await client.disconnect()
            return 8

        p = Path(path)
        print(
            json.dumps(
                {
                    "ok": True,
                    "credentialsReady": True,
                    "source": "mtproto_user",
                    "chatId": str(chat),
                    "messageId": target.id,
                    "fileName": name,
                    "path": str(p.resolve()),
                    "sizeBytes": p.stat().st_size if p.is_file() else size,
                    "muallimSeerah": is_muallim_seerah(name),
                },
                ensure_ascii=False,
            )
        )
        await client.disconnect()
        return 0
    except Exception as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": True,
                    "errorAr": f"{type(e).__name__}: {e}",
                },
                ensure_ascii=False,
            )
        )
        await client.disconnect()
        return 9


if __name__ == "__main__":
    raise SystemExit(asyncio.run(amain()))
