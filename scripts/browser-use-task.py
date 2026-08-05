#!/usr/bin/env python3
"""
browser-use task runner for the Arabic Buzz Mac sync agent.

Usage:
  python3 scripts/browser-use-task.py <url> <task...>

Install (once on the Mac):
  pip install "browser-use>=0.1.40" langchain-openai
  playwright install chromium

Optional env:
  OPENAI_API_KEY / BROWSER_USE_LLM_MODEL — LLM for the agent
  BROWSER_USE_HEADLESS=1 — headless Chromium

Prints a single JSON object to stdout for the Mac bridge / Netlify caller.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys


def fail(message_ar: str, **extra):
    print(
        json.dumps(
            {
                "ok": False,
                "messageAr": message_ar,
                "extracted": {},
                "currentUrl": sys.argv[2] if len(sys.argv) > 2 else None,
                **extra,
            },
            ensure_ascii=False,
        )
    )
    raise SystemExit(1)


async def run(url: str, task: str) -> dict:
    try:
        from browser_use import Agent
    except ImportError:
        fail(
            "browser-use غير مثبت. على الماك: pip install browser-use && playwright install chromium"
        )

    # Prefer OpenAI-compatible env; browser-use uses LangChain under the hood.
    llm = None
    try:
        from langchain_openai import ChatOpenAI

        model = os.environ.get("BROWSER_USE_LLM_MODEL") or os.environ.get(
            "OPENAI_MODEL", "gpt-4o-mini"
        )
        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get(
            "BROWSER_USE_OPENAI_API_KEY"
        )
        base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get(
            "BROWSER_USE_OPENAI_BASE_URL"
        )
        kwargs = {"model": model, "temperature": 0}
        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["base_url"] = base_url
        llm = ChatOpenAI(**kwargs)
    except Exception as e:
        fail(
            f"تعذّر تهيئة نموذج LLM لـ browser-use: {e}",
            logs=[str(e)],
        )

    headless = os.environ.get("BROWSER_USE_HEADLESS", "0") in ("1", "true", "yes")
    full_task = f"Open {url} then: {task}"

    agent = Agent(task=full_task, llm=llm)
    # browser-use API varies slightly by version — keep kwargs minimal.
    try:
        history = await agent.run()
    except TypeError:
        history = await agent.run(max_steps=int(os.environ.get("BROWSER_USE_MAX_STEPS", "25")))

    final = ""
    urls: list[str] = []
    try:
        if hasattr(history, "final_result") and callable(history.final_result):
            final = str(history.final_result() or "")
        else:
            final = str(history)
        if hasattr(history, "urls") and callable(history.urls):
            urls = [str(u) for u in (history.urls() or [])]
    except Exception as e:
        final = f"{final} ({e})"

    return {
        "ok": True,
        "extracted": {
            "result": final[:8000],
            "urls": urls[-10:],
            "task": task[:500],
        },
        "currentUrl": urls[-1] if urls else url,
        "logs": [f"browser-use headless={headless}", f"task={task[:200]}"],
        "messageAr": "اكتملت مهمة browser-use على الماك — راجع النتيجة (HITL).",
        "provider": "browser-use",
    }


def main():
    if len(sys.argv) < 3:
        fail("usage: browser-use-task.py <url> <task>")
    url = sys.argv[1].strip()
    task = " ".join(sys.argv[2:]).strip()
    if not url.startswith("http"):
        fail("يلزم رابط http(s) صالح.")
    if not task:
        fail("يلزم وصف المهمة.")

    try:
        result = asyncio.run(run(url, task))
    except SystemExit:
        raise
    except Exception as e:
        fail(f"فشل browser-use: {e}", logs=[str(e)])

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
