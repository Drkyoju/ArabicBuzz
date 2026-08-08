#!/usr/bin/env python3
"""
Scan Telegram group history via user MTProto (Telethon) and download
matching documents/voice. Bot tokens CANNOT call this API.

Env:
  TELEGRAM_API_ID, TELEGRAM_API_HASH
  TELEGRAM_SESSION_STRING (or TELEGRAM_SESSION)
  TELEGRAM_SCAN_CHAT_ID (default -1003855925966)
  TELEGRAM_SCAN_OUT (default ~/ArabicBuzz/recovered/tg-history)
  TELEGRAM_SCAN_LIMIT (default 500)
  TELEGRAM_SCAN_NAME_FILTER (optional substring)
  TELEGRAM_SCAN_DOWNLOAD=1 (default) / 0 metadata-only
  TELEGRAM_SCAN_OFFSET_ID (optional, resume)

Stdout: JSON summary (one object).
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
    if not re.search(r"المعلم\s*الاول|معلم\s*اول", n):
        return False
    return True


def want_name(name: str, filt: str | None) -> bool:
    if not name:
        return False
    if is_biology(name):
        return False
    if filt:
        return filt in norm_ar(name) or filt in name
    # default: documents + voice-ish extensions; prefer muallim but keep all media for archive
    return True


async def amain() -> int:
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
                    "errorAr": "Telethon غير مثبّت على الماك — pip install telethon",
                    "setupAr": "python3 -m pip install --user telethon ثم npm run telegram:mtproto-login",
                },
                ensure_ascii=False,
            )
        )
        return 2

    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    session = (
        os.environ.get("TELEGRAM_SESSION_STRING")
        or os.environ.get("TELEGRAM_SESSION")
        or ""
    ).strip()
    if not session:
        p = Path.home() / ".arabicbuzz-telegram.session.txt"
        if p.is_file():
            session = p.read_text(encoding="utf-8").strip()

    if not api_id or not api_hash or not session:
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": False,
                    "errorAr": "ناقص TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION_STRING",
                    "setupAr": (
                        "مرة واحدة على الماك: احصل على المفاتيح من https://my.telegram.org ثم "
                        "python3 scripts/telegram-mtproto-login.py — لا رسالة للمجموعة. "
                        "بعدها cron/MAC_SYNC يكمل الأرشفة تلقائياً."
                    ),
                    "mtprotoEnvPresent": False,
                },
                ensure_ascii=False,
            )
        )
        return 3

    chat = int(os.environ.get("TELEGRAM_SCAN_CHAT_ID") or "-1003855925966")
    out = Path(
        os.environ.get("TELEGRAM_SCAN_OUT")
        or str(Path.home() / "ArabicBuzz/recovered/tg-history")
    )
    out.mkdir(parents=True, exist_ok=True)
    limit = int(os.environ.get("TELEGRAM_SCAN_LIMIT") or "500")
    name_filter = (os.environ.get("TELEGRAM_SCAN_NAME_FILTER") or "").strip() or None
    download = (os.environ.get("TELEGRAM_SCAN_DOWNLOAD") or "1").strip() not in (
        "0",
        "false",
        "no",
    )
    offset_id = int(os.environ.get("TELEGRAM_SCAN_OFFSET_ID") or "0")
    prefer_muallim = (os.environ.get("TELEGRAM_SCAN_MUALLIM_ONLY") or "0").strip() in (
        "1",
        "true",
        "yes",
    )

    client = TelegramClient(StringSession(session), int(api_id), api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": False,
                    "errorAr": "جلسة تيليجرام منتهية — أعد telegram:mtproto-login",
                },
                ensure_ascii=False,
            )
        )
        await client.disconnect()
        return 4

    files = []
    scanned = 0
    downloaded = 0
    muallim_hits = []
    min_id_seen = None
    try:
        async for m in client.iter_messages(
            chat,
            filter=InputMessagesFilterDocument,
            limit=limit,
            offset_id=offset_id or None,
        ):
            scanned += 1
            if min_id_seen is None or m.id < min_id_seen:
                min_id_seen = m.id
            name = ""
            if m.file and m.file.name:
                name = m.file.name
            elif m.document:
                for a in m.document.attributes:
                    fn = getattr(a, "file_name", None)
                    if fn:
                        name = fn
                        break
            if prefer_muallim and not is_muallim_seerah(name):
                if not (name_filter and name_filter in norm_ar(name)):
                    continue
            if not want_name(name, norm_ar(name_filter) if name_filter else None):
                continue
            size = getattr(m.document, "size", None) if m.document else None
            entry = {
                "messageId": m.id,
                "fileName": name or f"tg-{m.id}",
                "sizeBytes": size,
                "mimeType": getattr(m.file, "mime_type", None) if m.file else None,
                "muallimSeerah": is_muallim_seerah(name),
            }
            if download and m.document:
                # Prefer downloading muallim first; always download if filter set or muallim
                should_dl = (
                    is_muallim_seerah(name)
                    or bool(name_filter)
                    or not prefer_muallim
                )
                if should_dl:
                    path = await m.download_media(file=str(out / (name or f"tg-{m.id}")))
                    if path:
                        entry["path"] = str(path)
                        downloaded += 1
                        # base64 only for muallim (bounded) — caller may read path
                        if is_muallim_seerah(name):
                            muallim_hits.append(entry)
            files.append(entry)
            if is_muallim_seerah(name) and entry not in muallim_hits:
                muallim_hits.append(entry)
    except Exception as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "credentialsReady": True,
                    "errorAr": f"فشل المسح: {type(e).__name__}: {e}",
                    "scanned": scanned,
                },
                ensure_ascii=False,
            )
        )
        await client.disconnect()
        return 5

    await client.disconnect()
    print(
        json.dumps(
            {
                "ok": True,
                "credentialsReady": True,
                "source": "mtproto_user",
                "chatId": str(chat),
                "scanned": scanned,
                "downloaded": downloaded,
                "outDir": str(out),
                "nextOffsetId": min_id_seen or 0,
                "muallimHits": muallim_hits,
                "files": files[:80],
                "limitationAr": (
                    "مسح MTProto بحساب مستخدم عضو في المجموعة — بوت API لا يستطيع قراءة التاريخ القديم."
                ),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(amain()))
