# Referee Training V1 (web)

Pixel-style single-position referee mini-game:
- 2 players (attacker red, defender blue)
- you are the referee (yellow)
- contact incidents trigger a bottom HUD
- you decide: FOUL / PLAY ON, then (if FOUL) ADVANTAGE / STOP
- score updates: correct calls add to RED; wrong calls add to BLUE

## Run

This is static. Just open `index.html` in a browser.

If your browser blocks module scripts when opening from disk, run a tiny local server:

```bash
cd referee-v1
python3 -m http.server 5173
# then open http://localhost:5173
```

## Notes
- V1 ends the position when you choose FOUL + STOP.
- No cards in V1 (future).
- The "HIGH/MED/LOW" hint is based on a hidden foul probability from severity.
