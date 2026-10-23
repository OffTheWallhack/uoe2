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

## Rules for every update (please keep)

- **Every new biome comes with its own wonder of the world.** Add the biome to `BIOMES` and the wonder to `WONDERS` in `js/sim.js`
  (with `biome:` set, a sprite in `js/wonders.js`, and a bonus in `FX`). The game refuses to start if a wonder has no biome or a biome has no wonder.
- The **Wonder Album** in the Book is built from that list, so the total ("3 of 18") and the biome pages update by themselves.
  The total only shows once the Scroll of the Wonders (three pieces found on expeditions) is complete.
- A wonder only hides in a *huge* stretch of its biome (see `big:` in `WONDERS`), anywhere inside it, and it only appears on the map after villagers have walked or sailed there.
- **Economy:** every settlement has its own stock, storage and treasury. What does not fit into a storehouse is sold (10,000 goods = 5 coins, so 1 coin is about 1,000 goods; the rest is a tax). Villagers carry goods from villages with plenty to villages that are short; prices follow supply and demand (`localPrice`, `tradeAI` in `js/sim.js`). New resources or buildings must use `resOf`/`addRes`, never a global stock.
- **Settlements:** a new village is only founded in land the people already know (the site and the way to it are explored), at least 55 steps from any other village, and for a reason: next to a wonder (the village then gets +30% of that wonder's gift) or in a place rich in timber, stone or fertile land. If nothing known qualifies, explorers are sent out first (`townSite`, `expeditions`, `trekAI`).
- **Building layout:** villagers keep a free lane of two tiles around houses and workplaces, keep the square around the hall open and never build over paved roads (`findSite`).
- Sound is optional and soft. Music: put files in `assets/music/` and list them in `assets/music/list.json`.
