#!/usr/bin/env python3
import os, json, re, sys

event_path = os.environ.get("GITHUB_EVENT_PATH")
if not event_path:
    print("GITHUB_EVENT_PATH not set", file=sys.stderr)
    sys.exit(1)

with open(event_path, "r", encoding="utf-8") as f:
    event = json.load(f)

body = (event.get("comment") or {}).get("body") or ""

# Prefer ```diff ... ``` blocks
m = re.search(r"```diff\s*(.*?)\s*```", body, re.S)
if not m:
    # Fallback to any fenced code block
    m = re.search(r"```\s*(.*?)\s*```", body, re.S)

if not m:
    print("No patch found in comment. Include a ```diff``` block.", file=sys.stderr)
    sys.exit(1)

print(m.group(1).strip() + "\n", end="")
