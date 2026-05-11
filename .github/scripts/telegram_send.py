#!/usr/bin/env python3
"""Envía sendMessage a Telegram. Usado por .github/workflows/telegram-send.yml"""
import json
import os
import re
import sys
import urllib.error
import urllib.request


def fail(msg: str) -> None:
    print("::error::" + msg.replace("\n", " "))
    sys.exit(1)


def read_secret_first_line(env_key: str) -> str:
    """
    GitHub a veces guarda el secreto con Enter al final (o varias líneas).
    Telegram exige el token en la URL sin caracteres de control.
    """
    raw = os.environ.get(env_key) or ""
    for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        t = line.strip()
        if not t:
            continue
        # Solo ASCII visible (32-126), típico del token BotFather
        return "".join(ch for ch in t if 32 <= ord(ch) <= 126)
    return ""


def main() -> None:
    token = read_secret_first_line("TELEGRAM_BOT_TOKEN")
    chat_raw = read_secret_first_line("TELEGRAM_CHAT_ID")
    chat_raw = "".join(ch for ch in chat_raw if ch.isdigit() or ch == "-")
    text = (os.environ.get("TEXT") or "").strip()

    if not token or not chat_raw:
        fail("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.")
    if not text:
        fail("El texto del workflow está vacío.")

    if "\n" in token or "\r" in token:
        fail("Bug interno: token con salto de línea tras limpiar. Reportá el log.")

    if not re.match(r"^\d+:[A-Za-z0-9_-]+$", token):
        fail(
            "TELEGRAM_BOT_TOKEN inválido tras limpiar. En GitHub → Secrets → "
            "pegá UNA sola línea desde BotFather (número:letras)."
        )

    try:
        chat_id = int(chat_raw)
    except ValueError:
        fail("TELEGRAM_CHAT_ID debe ser solo dígitos (y opcional - para grupos).")

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
            hints.append("Token inválido: nuevo en BotFather y actualizá el secreto.")
        if "chat not found" in dlow or "chat_id is empty" in dlow:
            hints.append("Mandá /start al bot y revisá TELEGRAM_CHAT_ID.")
        if "blocked" in dlow:
            hints.append("Desbloqueá el bot en Telegram.")
        fail("Telegram: " + str(desc) + (" | " + " ".join(hints) if hints else ""))

    print("OK, message_id:", j.get("result", {}).get("message_id"))


if __name__ == "__main__":
    main()
