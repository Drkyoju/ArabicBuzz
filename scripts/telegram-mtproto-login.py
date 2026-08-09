#!/usr/bin/env python3
"""
One-time Telethon login → TELEGRAM_SESSION_STRING (Docker-free large-file path).

Never posts to Telegram chats. Prefers QR login (scan with Telegram mobile app).

  npm run telegram:mtproto-login
  # or: /tmp/tg-telethon-venv/bin/python scripts/telegram-mtproto-login.py

Loads TELEGRAM_API_ID / TELEGRAM_API_HASH from env or .env.local.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path


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


async def login_qr(client) -> None:
    """QR login — user scans with Telegram on phone (no SMS)."""
    qr = await client.qr_login()
    print("---")
    print("امسح رمز QR بتطبيق تيليجرام على هاتفك (Settings → Devices → Link Desktop Device)")
    print("أو افتح الرابط التالي من هاتف فيه تيليجرام مسجّل:")
    print(qr.url)
    print("---")
    # TELEGRAM_QR_TIMEOUT seconds (default 300 — longest practical for agent-assisted scan)
    try:
        timeout = max(30, int((os.environ.get("TELEGRAM_QR_TIMEOUT") or "300").strip()))
    except ValueError:
        timeout = 300
    qr_url_path = Path("/tmp/arabicbuzz-telegram-qr.url")
    qr_url_path.write_text(qr.url, encoding="utf-8")
    print(f"qr_url_file={qr_url_path}", flush=True)
    print(f"(بانتظار المسح… حتى ~{timeout} ثانية)", flush=True)
    await qr.wait(timeout=timeout)


async def login_phone(client) -> None:
    phone = (os.environ.get("TELEGRAM_PHONE") or "").strip()
    if not phone:
        phone = input("رقم الهاتف بصيغة دولية (+966…): ").strip()
    await client.send_code_request(phone)
    code = (os.environ.get("TELEGRAM_LOGIN_CODE") or "").strip()
    if not code:
        code = input("رمز تيليجرام (رسالة التطبيق — ليس SMS عادةً): ").strip()
    try:
        await client.sign_in(phone, code)
    except Exception as e:
        # 2FA
        if "password" in type(e).__name__.lower() or "SessionPasswordNeeded" in type(e).__name__:
            pw = (os.environ.get("TELEGRAM_2FA_PASSWORD") or "").strip()
            if not pw:
                pw = input("كلمة مرور التحقق بخطوتين: ").strip()
            await client.sign_in(password=pw)
        else:
            raise


async def amain() -> int:
    load_dotenv_local()
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        print(
            "ثبّت Telethon أولاً:\n"
            "  /tmp/tg-telethon-venv/bin/pip install telethon\n"
            "أو: python3 -m pip install --user telethon",
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

    prefer_phone = (os.environ.get("TELEGRAM_LOGIN_PHONE") or "").strip() in (
        "1",
        "true",
        "yes",
    )

    print(
        "سجّل الدخول بحساب عضو في مجموعة «عمل الجمعية» (ليس البوت).\n"
        "لن يُرسل أي رسالة للمجموعة — جلسة محلية فقط.",
        flush=True,
    )

    client = TelegramClient(StringSession(), int(api_id), api_hash)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            if prefer_phone:
                await login_phone(client)
            else:
                try:
                    await login_qr(client)
                except Exception as e:
                    print(f"QR تعذّر ({type(e).__name__}).", flush=True)
                    if sys.stdin.isatty():
                        print("التحويل لهاتف…", flush=True)
                        await login_phone(client)
                    else:
                        print(
                            "NEXT: أعد التشغيل وامسح QR خلال 90ث:\n"
                            "  cd /Users/abx/Desktop/ArabicBuzz && npm run telegram:mtproto-login\n"
                            "أو: TELEGRAM_LOGIN_PHONE=1 TELEGRAM_PHONE=+966… npm run telegram:mtproto-login",
                            flush=True,
                        )
                        return 2

        me = await client.get_me()
        string = client.session.save()
        print("---")
        print(f"logged_in_as={getattr(me, 'username', None) or me.id}")
        print("ضُبطت الجلسة على القرص. لا تلصق TELEGRAM_SESSION_STRING في الدردشة.")
        print("---")

        out = Path.home() / ".arabicbuzz-telegram.session.txt"
        out.write_text(string, encoding="utf-8")
        print(f"session_file={out}")

        # Also append/update .env.local without printing the secret
        root = Path(__file__).resolve().parents[1]
        env_path = root / ".env.local"
        key = "TELEGRAM_SESSION_STRING"
        line = f"{key}={string}"
        if env_path.is_file():
            lines = env_path.read_text(encoding="utf-8").splitlines()
            found = False
            out_lines = []
            for L in lines:
                if L.startswith(key + "="):
                    out_lines.append(line)
                    found = True
                else:
                    out_lines.append(L)
            if not found:
                out_lines.append(line)
            env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
            print("updated=.env.local (TELEGRAM_SESSION_STRING)")
        else:
            env_path.write_text(line + "\n", encoding="utf-8")
            print("created=.env.local")
        return 0
    finally:
        await client.disconnect()


def main() -> int:
    return asyncio.run(amain())


if __name__ == "__main__":
    raise SystemExit(main())
