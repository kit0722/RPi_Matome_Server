#!/usr/bin/env python3
"""Read-only MAGI suite executor; records all failures without downgrading safety tests.

Usage: python3 Tools/magi_runner.py --config Tools/magi_plan.json
Every command is explicit argv (no shell expansion). No app or source deletion.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


def validate(raw):
    if raw.get("schema") != 1 or not isinstance(raw.get("checks"), list) or not raw["checks"]:
        raise ValueError("schema=1 and non-empty checks required")
    ids = set()
    for item in raw["checks"]:
        if not isinstance(item, dict):
            raise ValueError("check must be object")
        name = item.get("id")
        if not isinstance(name, str) or not name or not all(c.isascii() and (c.isalnum() or c in "_-") for c in name):
            raise ValueError("invalid check id")
        if name in ids:
            raise ValueError("duplicate check id: " + name)
        ids.add(name)
        if item.get("category") not in {"safety", "functional", "ui", "build"}:
            raise ValueError(name + ": missing/invalid category")
        if type(item.get("required")) is not bool:
            raise ValueError(name + ": required must be boolean")
        cmd = item.get("command")
        if not isinstance(cmd, list) or not cmd or not all(isinstance(c, str) and c for c in cmd):
            raise ValueError(name + ": command must be nonempty argv")
        if not isinstance(item.get("depends_on", []), list) or not all(isinstance(d, str) for d in item.get("depends_on", [])):
            raise ValueError(name + ": depends_on must be list")
        probe = item.get("preflight")
        if probe is not None:
            if (not isinstance(probe, dict) or not isinstance(probe.get("command"), list)
                or not probe["command"] or not all(isinstance(v, str) and v for v in probe["command"])
                or not isinstance(probe.get("contains"), str) or not probe["contains"]):
                raise ValueError(name + ": invalid preflight")
        if "capture_path" in item and (not isinstance(item["capture_path"], str) or not item["capture_path"] or Path(item["capture_path"]).is_absolute() or ".." in Path(item["capture_path"]).parts):
            raise ValueError(name + ": invalid capture_path")
        if type(item.get("timeout", 600)) not in (int, float) or item.get("timeout", 600) <= 0:
            raise ValueError(name + ": timeout must be positive")
    seen = set()
    for item in raw["checks"]:
        if any(dep not in seen for dep in item.get("depends_on", [])):
            raise ValueError(item["id"] + ": dependency missing or ordered incorrectly")
        seen.add(item["id"])
    return raw["checks"]


def atomic_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".magi-", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def run(config: Path, out: Path):
    root = config.resolve().parent.parent  # Tools/magi_plan.json -> repo root
    checks = validate(json.loads(config.read_text(encoding="utf-8")))
    out = out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    results = []
    status = {}
    for item in checks:
        key = item["id"]
        cmd = item["command"]
        missing = [d for d in item.get("depends_on", []) if status[d] != "PASS"]
        start = time.monotonic()
        entry = {"id": key, "category": item["category"], "required": item["required"], "command": cmd,
                 "status": None, "reason": "", "duration_seconds": 0.0}
        log_path = out / (key + ".log")
        if log_path.exists():
            log_path.unlink()  # Never reuse a previous PASS log after SKIP / command failure.
        if missing:
            entry.update(status="SKIP", reason="dependency not PASS: " + ", ".join(missing))
        elif not shutil.which(cmd[0]) and not (root / cmd[0]).is_file():
            entry.update(status="SKIP", reason="executable missing: " + cmd[0])
        else:
            probe = item.get("preflight")
            if probe:
                precommand = probe["command"]
                if not shutil.which(precommand[0]):
                    entry.update(status="SKIP", reason="preflight executable missing: " + precommand[0])
                else:
                    try:
                        pr = subprocess.run(precommand, cwd=root, stdout=subprocess.PIPE,
                                            stderr=subprocess.STDOUT, text=True, errors="replace",
                                            timeout=30, check=False)
                        if pr.returncode != 0 or probe["contains"] not in pr.stdout:
                            entry.update(status="SKIP", reason="preflight missing: " + probe["contains"])
                    except (OSError, subprocess.TimeoutExpired) as exc:
                        entry.update(status="SKIP", reason="preflight unavailable: " + str(exc))
            if entry["status"] is not None:
                entry["duration_seconds"] = round(time.monotonic() - start, 3)
                results.append(entry)
                status[key] = entry["status"]
                print(f"{entry['status']:4s} {key} [{entry['category']}] {entry['reason']}", flush=True)
                continue
            try:
                proc = subprocess.run(cmd, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                      timeout=item.get("timeout", 600), text=True, errors="replace", check=False)
                log_path.write_text(proc.stdout, encoding="utf-8")
                entry.update(status="PASS" if proc.returncode == 0 else "FAIL", reason="exit=" + str(proc.returncode))
            except subprocess.TimeoutExpired as exc:
                captured = exc.stdout or b""
                if isinstance(captured, bytes):
                    captured = captured.decode("utf-8", "replace")
                log_path.write_text(captured, encoding="utf-8")
                entry.update(status="FAIL", reason="timeout")
            except OSError as exc:
                entry.update(status="FAIL", reason=f"execution error: {exc}")
        if item.get("capture_path") and log_path.exists() and entry["status"] == "PASS":
            capture_path = (root / item["capture_path"]).resolve()
            if capture_path != root and root not in capture_path.parents:
                raise ValueError("capture_path escapes project root")
            capture_path.parent.mkdir(parents=True, exist_ok=True)
            capture_path.write_bytes(log_path.read_bytes())
        entry["duration_seconds"] = round(time.monotonic() - start, 3)
        results.append(entry)
        status[key] = entry["status"]
        print(f"{entry['status']:4s} {key} [{entry['category']}] {entry['reason']}", flush=True)
    failed = [r for r in results if r["status"] == "FAIL"]
    skipped_required = [r for r in results if r["status"] == "SKIP" and r["required"]]
    skipped_any = any(r["status"] == "SKIP" for r in results)
    overall = "FAIL" if failed else "INCOMPLETE" if skipped_any else "PASS"
    report = {"schema": 1, "required_skips": len(skipped_required), "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
              "overall": overall, "results": results,
              "summary": {s: sum(r["status"] == s for r in results) for s in ("PASS", "FAIL", "SKIP")}}
    atomic_json(out / "report.json", report)
    print(f"MAGI={overall} PASS={report['summary']['PASS']} FAIL={report['summary']['FAIL']} SKIP={report['summary']['SKIP']}")
    return 1 if failed else 2 if skipped_any else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="Tools/magi_plan.json", type=Path)
    ap.add_argument("--out", default=".build/verification/magi", type=Path)
    args = ap.parse_args()
    try:
        return run(args.config, args.out)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("MAGI=FAIL configuration error:", exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
