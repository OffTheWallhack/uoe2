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
- **Roads follow the traffic:** footpaths wear within 45 tiles of a village, and *anywhere* along a trip between villages (traders, visitors, pioneers: `roadWalker` in `updatePerson`), so a dirt track slowly appears between far villages. Gravel and cobbled roads are laid within 30 tiles of a village or within 10 tiles of the straight way between two villages less than 700 steps apart (`roadZone`, `nearLink`), and only growing out of a village or an existing road (`roadJoins` in `plan`). Roads are one tile wide. The route finder prefers tiles that people already trod (`findRoute`, cell kind 7), and wading in a river counts triple for people walking between villages, so bridges come where the traffic is (`S.wade`, 360 in new worlds).
- **Nobody stands around:** when there is no work within reach, villagers look farther (75 tiles) for trees and rocks, plant young trees, or tidy up around the houses (`chore` job); "rest" near the village hall is the last resort (`pickJob`). Roads are drawn as paths with wobbly edges and rounded corners, and old saves have wide road blobs thinned once to one tile (`thinRoads`, `S.rv`).
- **Chunks are pure:** a chunk is generated from the bare land only (never from villagers' bridges or fills) and the very first chunks are generated exactly as after a reload, so lazy generation, reloading and any order of exploring give the same trees, rocks and bushes. Saved changes are stored by index, so this must stay true. Checks: `node tests/chunks-are-pure.mjs` and `node tests/save-load-roundtrip.mjs 11 30`.
- **Villages spread sideways:** houses, fields and folds anchored on the village hall aim for a ring that grows with the number of buildings (`findSite`, `SPREAD`, radius about 5.5 + 1.9 x sqrt(buildings)); workplaces still sit next to their trees, rocks and shore.
- **Fast-forward stays smooth:** above 20x speed no floating texts or speech bubbles are drawn, the picture is drawn at most 20 times a second, and the simulation gets a time budget per frame (about 26 ms): what does not fit is dropped, so a slow device simply runs slower than 260x instead of freezing. `elev` remembers recent answers (`resetElevCache` whenever the world changes).
- **Graphics levels:** Menu > Graphics: Auto / Full / Simple / Very simple (`view.gfx`, saved as `uoe2-gfx`). Simple draws the far view (zoom below 1) on a coarser canvas without the vignette; Very simple also leaves out trees and rocks in the far view and the night glow, and draws fewer frames. Auto starts Full and steps down by itself when the far view stays under about 18 fps. Autosave runs when the browser is idle (every 20 s).
- **A new world never reuses the old world's picture:** `setWorld` in `js/render.js` only keeps baked ground when seed, start spot and generation version are the same, and clears the height cache otherwise (this was why trees, houses and villagers appeared on water after "New world").
- **World generation changes only for new worlds:** anything that changes where trees, rocks or bushes are generated is guarded by `S.gv` (world generation version), because saved changes are stored by index. Old saves keep their old trees.
- Sound is optional and soft. Music: put files in `assets/music/` and list them in `assets/music/list.json`.

- **World version 3 (`S.gv >= 3`, every new world):** the land is made by `baseElev` (v3 branch): big warped land shapes, wide flat plains (kept above the swamp band), small ponds, one wobbling great-sea band in front of the valley (then more land), mountain ranges. Biomes use `bn` (about 3.2 times bigger than before, warped, ragged edges) and their thresholds are shifted so that temperate land stays common. Far from the start there are winding rivers, thin in places and thick in others (`riverD3`, `riverW`); they stop in the high mountains. Old saves (gv 2 and below) keep their old land exactly.
- **Wonders are twice as big in new worlds:** the sprite is doubled (`wonderSpritesBig`, `wsp` in `js/render.js`) and the cleared ground around it is 1.9 times wider (`genChunk`). The Album keeps the normal art.
- **Preview of the whole world:** World map > "Preview the whole world" draws 1200 x 1200 steps around the start straight from the seed (`previewMap` in `js/render.js`, `wondersInRect` in `js/sim.js`), with filled stars for found wonders and hollow stars for hidden ones.
- **Settlements spread along roads (new worlds):** a village may stand only `ROAD_GAP` (150) steps from the others when it lies on a well-trodden path (`onTrail`); elsewhere `TOWN_GAP` (400) still holds. Explorers who reach the end of their way remember the camp (`S.campSite`), and the next new village is first looked for there. Founding is faster (a village for every 4 more people, every 1.25 to 3 hours) and up to 16 villages are allowed.
- **Exploring is common (new worlds):** expeditions start after 1 hour of play with 7 villagers, repeat every 0.8 to 8 hours and reach 60 to 280 steps; explorers see 9 tiles around them. Now and then an ordinary villager walks out to the edge of the known land (`wander` in `pickJob`, up to 120 steps), and scouts see 6 tiles around them.
