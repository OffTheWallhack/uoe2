# Usage of Empires II

A cozy idle village in pixel-art isometric style. The villagers live on their own, in real time:
they gather, farm, explore, tread footpaths and build what they need. The Mayor only helps.

- `index.html` – the live world (everyone can watch). With the Mayor's private link you can act.
- `index.html?sandbox` – a private test world that lives only in your browser (with fast-forward).

## How it works

- `js/sim.js` – the whole simulation (no graphics). The same file runs in the browser and on the server.
- `js/gfx.js` – pixel sprites (buildings are ray-cast from simple 3D shapes, trees drawn pixel by pixel).
- `js/render.js` – the world is cut into 32×32 tile chunks; ground, fog and small overview tiles are painted per chunk.
- `js/app.js` – modes, UI, input, talking to the server.
- `supabase/functions/uoe2` – the server: every minute it lets the world live until "now" and saves it.
  Real weather for Bratislava comes from Open-Meteo.

The world is deterministic: the same saved state and the same number of ticks (0.25 s each) give the same result,
so the browser can keep simulating between server saves without drifting.
