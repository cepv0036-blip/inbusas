#!/usr/bin/env python3
"""Envía sendMessage a Telegram. Usado por .github/workflows/telegram-send.yml"""
import json
import os
import re
import sys
import urllib.error
import urllib.request


def clean_token(s: str) -> str:
    """Token BotFather: solo ASCII imprimible típico (evita \\n pegados al pegar en GitHub)."""
    s = s or ""
    s = re.sub(r"[^\w\-:]", "", s)
    return s


def clean_chat_id(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"[^\d\-]", "", s)
    return s


def fail(msg: str) -> None:
    print("::error::" + msg.replace("\n", " "))
    sys.exit(1)


def main() -> None:
    token = clean_token(os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    chat_raw = clean_chat_id(os.environ.get("TELEGRAM_CHAT_ID", ""))
    text = (os.environ.get("TEXT") or "").strip()

    if not token or not chat_raw:
        fail("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID (revisá secretos en GitHub).")
    if not text:
        fail("El texto del workflow está vacío.")

    if ":" not in token or not re.match(r"^\d+:[A-Za-z0-9_-]+$", token):
        fail(
            "TELEGRAM_BOT_TOKEN no tiene formato esperado (123456:ABC...). "
            "Sin espacios ni saltos de línea; pegalo de nuevo en Secrets."
        )

    try:
        chat_id = int(chat_raw)
    except ValueError:
        fail("TELEGRAM_CHAT_ID debe ser un número entero, ej. 6597963754")

    url = "https://api.telegram.org/bot" + token + "/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace") if e.fp else str(e)
        fail("HTTP " + str(e.code) + " Telegram: " + err_body[:500])
    except urllib.error.URLError as e:
        fail("Red / URL: " + str(e.reason if hasattr(e, "reason") else e))

    try:
        j = json.loads(body)
    except json.JSONDecodeError:
        fail("Respuesta no JSON: " + body[:300])

    if not j.get("ok"):
        desc = j.get("description") or body[:500]
        ec = j.get("error_code")
        hints = []
        dlow = str(desc).lower()
        if ec == 401 or "unauthorized" in dlow:
            hints.append("Token inválido: nuevo token en BotFather y actualizá el secreto.")
        if "chat not found" in dlow or "chat_id is empty" in dlow:
            hints.append("Mandá /start al bot y revisá TELEGRAM_CHAT_ID.")
        if "blocked" in dlow:
            hints.append("Desbloqueá el bot en Telegram.")
        fail("Telegram: " + str(desc) + (" | " + " ".join(hints) if hints else ""))

    print("OK, message_id:", j.get("result", {}).get("message_id"))


if __name__ == "__main__":
    main()
