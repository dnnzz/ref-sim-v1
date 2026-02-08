#!/usr/bin/env python3
import sys
import re

body = sys.argv[1]

# Prefer ```diff ... ``` blocks
m = re.search(r"```diff\\s*(.*?)\\s*```", body, re.S)
if not m:
    # Fallback to any fenced code block
    m = re.search(r"```\\s*(.*?)\\s*```", body, re.S)

if not m:
    print("No patch found in comment. Include a ```diff``` block.", file=sys.stderr)
    sys.exit(1)

print(m.group(1).strip() + "\n", end="")
