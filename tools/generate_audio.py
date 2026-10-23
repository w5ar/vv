#!/usr/bin/env python3
"""Generates the demonstration sound of the exercises with OpenAI text-to-speech.

Reads the audio plans written by `pnpm import:all`:

    content/exercises/<exercise-id>/zvuk.plan.json

and writes next to them, for every clip of the plan:

    content/exercises/<exercise-id>/<clip-id>.webm     e.g. act.prvi-mlaz-naprijed.webm
    content/exercises/<exercise-id>/zvuk.json          durations read by the web app

Descriptions of steps (voice "opis") use a female voice, orders and reports (voice "zapovijed")
a strict male voice. Clips whose text, voice and settings did not change are skipped, so the
script can be re-run after editing an exercise.

Setup (once):
    cp .env.example .env        # and enter OPENAI_API_KEY
    ffmpeg and ffprobe must be installed (e.g. `brew install ffmpeg`, `apt install ffmpeg`)

Usage:
    python3 tools/generate_audio.py                    # all exercises (synthetic ones skipped)
    python3 tools/generate_audio.py vjezba-1-dva-c-mlaza
    python3 tools/generate_audio.py --dry-run          # show what would be generated
    python3 tools/generate_audio.py --force            # regenerate everything
    python3 tools/generate_audio.py --clean            # also delete clips no longer in the plan

Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXERCISES = REPO / "content" / "exercises"

DEFAULTS = {
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_TTS_MODEL": "gpt-4o-mini-tts",
    "OPENAI_TTS_VOICE_OPIS": "nova",
    "OPENAI_TTS_VOICE_ZAPOVIJED": "onyx",
    "OPENAI_TTS_INSTRUCTIONS_OPIS": (
        "Govori na hrvatskom jeziku, standardnim hrvatskim izgovorom. Ti si mirna i jasna pripovjedačica "
        "koja opisuje tijek vatrogasne vježbe: ujednačen, umjeren tempo i prirodna intonacija. Kratice u "
        "zagradama (N1, N2, V1, V2, Z, S) izgovaraj slovo po slovo hrvatskim izgovorom (en jedan, ve dva, zet, es)."
    ),
    "OPENAI_TTS_INSTRUCTIONS_ZAPOVIJED": (
        "Govori na hrvatskom jeziku, standardnim hrvatskim izgovorom. Ti si vatrogasni zapovjednik koji na "
        "vježbi izdaje zapovijed: strogo, glasno, odlučno i autoritativno, kratko i jasno, bez emocija. "
        "Tri točke označavaju mjesto na kojem se u stvarnoj zapovijedi navodi pravac; izgovori ih kao kratku stanku."
    ),
}
VOICES = ("opis", "zapovijed")
MAX_INPUT_CHARS = 4096


def load_env(path: Path) -> None:
    """Minimal .env reader (KEY=value, # comments). Variables already set in the environment win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def setting(name: str) -> str:
    return os.environ.get(name) or DEFAULTS.get(name, "")


def fail(message: str, code: int = 1) -> None:
    print(f"GREŠKA: {message}", file=sys.stderr)
    sys.exit(code)


def synthesize(text: str, voice: str, model: str, instructions: str, api_key: str, base_url: str) -> bytes:
    """Calls POST /audio/speech and returns Ogg Opus audio. Retries on rate limits and server errors."""
    body: dict[str, str] = {"model": model, "input": text, "voice": voice, "response_format": "opus"}
    if instructions and not model.startswith("tts-1"):  # tts-1 / tts-1-hd do not accept instructions
        body["instructions"] = instructions
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/audio/speech",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            try:
                detail = json.loads(detail).get("error", {}).get("message", detail)
            except (ValueError, AttributeError):
                pass
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                wait = 2 ** (attempt + 1)
                print(f"    API {e.code}, novi pokušaj za {wait} s …")
                time.sleep(wait)
                continue
            raise RuntimeError(f"OpenAI API {e.code}: {detail}") from None
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(2 ** (attempt + 1))
                continue
            raise RuntimeError(f"Veza s {base_url} nije uspjela: {e.reason}") from None
    raise RuntimeError("OpenAI API nije odgovorio.")


def duration_ms(path: Path) -> int:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return max(1, round(float(out) * 1000))


def to_webm(ogg: bytes, target: Path) -> int:
    """Repackages Ogg Opus as WebM (no re-encoding) and returns the duration in ms."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "clip.ogg"
        dst = Path(tmp) / "clip.webm"
        src.write_bytes(ogg)
        ms = duration_ms(src)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "copy", "-f", "webm", str(dst)], check=True)
        shutil.move(str(dst), target)
    return ms


def write_manifest(path: Path, exercise_id: str, clips: dict) -> None:
    data = {"schemaVersion": 1, "exerciseId": exercise_id, "clips": dict(sorted(clips.items()))}
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generira zvučne zapise demonstracija (OpenAI TTS).")
    parser.add_argument("exercises", nargs="*", help="id vježbi (zadano: sve)")
    parser.add_argument("--force", action="store_true", help="ponovno generiraj i nepromijenjene zapise")
    parser.add_argument("--dry-run", action="store_true", help="samo prikaži što bi se generiralo")
    parser.add_argument("--clean", action="store_true", help="obriši zapise koji više nisu u planu")
    parser.add_argument("--include-synthetic", action="store_true", help="generiraj i za sintetičke vježbe")
    args = parser.parse_args()

    load_env(REPO / ".env")
    model = setting("OPENAI_TTS_MODEL")
    base_url = setting("OPENAI_BASE_URL")
    voices = {v: setting(f"OPENAI_TTS_VOICE_{v.upper()}") for v in VOICES}
    instructions = {v: setting(f"OPENAI_TTS_INSTRUCTIONS_{v.upper()}") for v in VOICES}
    api_key = os.environ.get("OPENAI_API_KEY", "")

    plans = sorted(EXERCISES.glob("*/zvuk.plan.json"))
    if not plans:
        fail(f"nema planova zvuka u {EXERCISES.relative_to(REPO)}; najprije pokrenite `pnpm import:all`.")
    if args.exercises:
        unknown = set(args.exercises) - {p.parent.name for p in plans}
        if unknown:
            fail(f"nepoznate vježbe: {', '.join(sorted(unknown))}")
        plans = [p for p in plans if p.parent.name in args.exercises]
    if not args.dry_run:
        if not api_key:
            fail("OPENAI_API_KEY nije postavljen. Kopirajte .env.example u .env i upišite ključ.")
        for tool in ("ffmpeg", "ffprobe"):
            if not shutil.which(tool):
                fail(f"{tool} nije instaliran (potreban za spremanje u .webm).")

    generated = skipped = sent_chars = 0
    errors: list[str] = []
    for plan_path in plans:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        exercise_id = plan["exerciseId"]
        if plan.get("synthetic") and not args.include_synthetic and not args.exercises:
            print(f"[{exercise_id}] sintetička vježba – preskočeno (--include-synthetic)")
            continue
        folder = plan_path.parent
        manifest_path = folder / "zvuk.json"
        manifest = {}
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8")).get("clips", {})
        wanted = {c["id"] for c in plan["clips"]}
        todo = []
        for clip in plan["clips"]:
            entry = manifest.get(clip["id"])
            current = (
                entry is not None
                and entry.get("hash") == clip["hash"]
                and entry.get("voice") == clip["voice"]
                and entry.get("model") == model
                and entry.get("voiceName") == voices[clip["voice"]]
                and (folder / entry["file"]).exists()
            )
            if current and not args.force:
                skipped += 1
            else:
                todo.append(clip)
        print(f"[{exercise_id}] isječaka: {len(plan['clips'])}, za generiranje: {len(todo)}")

        for n, clip in enumerate(todo, 1):
            text, voice = clip["text"], clip["voice"]
            label = f"  {n}/{len(todo)} {clip['id']} ({voice}, {len(text)} znakova)"
            if len(text) > MAX_INPUT_CHARS:
                errors.append(f"{exercise_id}/{clip['id']}: tekst je dulji od {MAX_INPUT_CHARS} znakova")
                print(f"{label} – PREDUGO, preskočeno")
                continue
            if args.dry_run:
                print(label)
                sent_chars += len(text)
                continue
            print(label, flush=True)
            try:
                audio = synthesize(text, voices[voice], model, instructions[voice], api_key, base_url)
                file = f"{clip['id']}.webm"
                ms = to_webm(audio, folder / file)
            except (RuntimeError, subprocess.CalledProcessError, ValueError) as e:
                errors.append(f"{exercise_id}/{clip['id']}: {e}")
                print(f"    neuspjelo: {e}")
                if "401" in str(e):
                    break  # invalid key: further requests would fail the same way
                continue
            manifest[clip["id"]] = {
                "file": file, "durationMs": ms, "voice": voice, "hash": clip["hash"], "model": model, "voiceName": voices[voice],
            }
            write_manifest(manifest_path, exercise_id, manifest)  # after every clip, so an interrupted run keeps its work
            generated += 1
            sent_chars += len(text)

        # Clips that are no longer part of the plan.
        orphans = sorted(set(manifest) - wanted)
        files_in_plan = {f"{c['id']}.webm" for c in plan["clips"]}
        orphan_files = sorted(p.name for p in folder.glob("*.webm") if p.name not in files_in_plan)
        if (orphans or orphan_files) and not args.dry_run:
            if args.clean:
                for clip_id in orphans:
                    manifest.pop(clip_id, None)
                for name in orphan_files:
                    (folder / name).unlink()
                write_manifest(manifest_path, exercise_id, manifest)
                print(f"  obrisano zastarjelih zapisa: {len(orphan_files)}")
            else:
                print(f"  {len(orphan_files)} zapisa više nije u planu (obrišite ih s --clean)")

    verb = "bi se poslalo" if args.dry_run else "poslano"
    print(f"\nGenerirano: {generated}, nepromijenjeno: {skipped}, {verb} znakova: {sent_chars}")
    if errors:
        print(f"Greške ({len(errors)}):", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
