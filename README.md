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
- **Settlements:** a new village is only founded in land the people already know (the site and the way to it are explored), at least 400 steps from any other village (`TOWN_GAP`, a real journey of several minutes on foot; wonder villages 260), and for a reason: next to a wonder (the village then gets +30% of that wonder's gift) or in a place rich in timber, stone or fertile land. If nothing known qualifies, explorers are sent out first (`townSite`, `expeditions`, `trekAI`).
- **Building layout:** villagers keep a free lane of two tiles around houses and workplaces, keep the square around the hall open and never build over paved roads (`findSite`).
- **Land and water:** nobody walks, builds or plants on water. Houses need dry ground with a dry ring around them (no thin strips of land), villagers walk on routes found around lakes, cliffs and other villages (`findRoute`, `walk`), and an errand they cannot reach is given up. New code that moves people must go through `walk`.
- **Nature comes back:** old stumps sprout again (about 9 in 10) or rot away, cut rocks slowly grow back (smaller), bushes regrow. Nothing the villagers use may run out for good (`step` in `js/sim.js`, the 20-tick loop).
- **Roads stay near villages:** footpaths wear only within 45 tiles of a village; gravel and cobbled roads are laid only within 30 tiles of one, and only growing out of the village or an existing road (`roadZone`, `roadJoins` in `plan`). Roads are one tile wide. Nobody should see long random tracks across the wild.
- **Nobody stands around:** when there is no work within reach, villagers look farther (75 tiles) for trees and rocks, plant young trees, or tidy up around the houses (`chore` job); "rest" near the village hall is the last resort (`pickJob`). Roads are drawn as paths with wobbly edges and rounded corners, and old saves have wide road blobs thinned once to one tile (`thinRoads`, `S.rv`).
- **Chunks are pure:** a chunk is generated from the bare land only (never from villagers' bridges or fills) and the very first chunks are generated exactly as after a reload, so lazy generation, reloading and any order of exploring give the same trees, rocks and bushes. Saved changes are stored by index, so this must stay true. Checks: `node tests/chunks-are-pure.mjs` and `node tests/save-load-roundtrip.mjs 11 30`.
- **Villages spread sideways:** houses, fields and folds anchored on the village hall aim for a ring that grows with the number of buildings (`findSite`, `SPREAD`, radius about 5.5 + 1.9 x sqrt(buildings)); workplaces still sit next to their trees, rocks and shore.
- **Graphics levels:** Menu > Graphics: Auto / Full / Simple / Very simple (`view.gfx`, saved as `uoe2-gfx`). Simple draws the far view (zoom below 1) on a coarser canvas without the vignette; Very simple also leaves out trees and rocks in the far view and the night glow, and draws fewer frames. Auto starts Full and steps down by itself when the far view stays under about 18 fps. Autosave runs when the browser is idle (every 20 s).
- **A new world never reuses the old world's picture:** `setWorld` in `js/render.js` only keeps baked ground when seed, start spot and generation version are the same, and clears the height cache otherwise (this was why trees, houses and villagers appeared on water after "New world").
- **World generation changes only for new worlds:** anything that changes where trees, rocks or bushes are generated is guarded by `S.gv` (world generation version), because saved changes are stored by index. Old saves keep their old trees.
- Sound is optional and soft. Music: put files in `assets/music/` and list them in `assets/music/list.json`.
