// Usage of Empires II — the village server.
// Runs every minute (pg_cron) and on every Mayor action. Loads the world, lets it live
// until "now", applies the action, saves it back. Viewers only read the saved world.
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as M from "./sim.js";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const CITY = { lat: 48.1486, lon: 17.1077 }; // Bratislava

async function gz64(str: string) { const cs = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip")); const buf = new Uint8Array(await new Response(cs).arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s); }
async function ungz64(b64: string) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip")); return await new Response(ds).text(); }
async function sha256(s: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function isOwner(id: string, key: string) { if (!key) return false; const { data } = await sb.from("uoe2_owner").select("key_hash").eq("id", id).maybeSingle(); return !!data && data.key_hash === await sha256(key); }
async function loadRow(id: string) { const { data, error } = await sb.from("uoe2_world").select("state,ver,rev").eq("id", id).maybeSingle(); if (error) throw error; if (!data) return null; return { S: JSON.parse(await ungz64(data.state)), ver: data.ver as number }; }
async function saveRow(id: string, W: any, ver: number) {
  const S = M.serialize(W); const state = await gz64(JSON.stringify(S));
  const { data, error } = await sb.from("uoe2_world").update({ state, ver: ver + 1, rev: W.S.rev, tick: W.S.tick, saved_at: new Date().toISOString() }).eq("id", id).eq("ver", ver).select("ver");
  if (error) throw error; return (data || []).length === 1;
}
function kindOf(code: number) { if (code <= 1) return "clear"; if (code <= 3) return "cloudy"; if (code === 45 || code === 48) return "fog"; if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"; return "rain"; }
async function weather(W: any) {
  const S = W.S, now = Date.now(); if (S.weather && now - (S.weather.at || 0) < 30 * 60000) return;
  try { const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}&current=temperature_2m,weather_code`); const j = await r.json(); S.weather = { kind: kindOf(j.current.weather_code), temp: j.current.temperature_2m, code: j.current.weather_code, at: now }; }
  catch (_e) { S.weather = { ...(S.weather || { kind: "clear", temp: null }), at: now }; }
}
async function live(id: string, action?: any) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await loadRow(id); if (!row) return { error: "No world yet." };
    const W = M.load(row.S);
    M.advance(W, M.tickNow(W.S, Date.now()), 2400);
    await weather(W);
    let err = null; if (action) { err = M.act(W, action); if (err) return { error: err }; }
    if (await saveRow(id, W, row.ver)) return { ok: true, tick: W.S.tick, rev: W.S.rev };
  }
  return { error: "The village is busy, try again." };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const id = body.world || "main";
    if (body.op === "tick" || !body.op) return json(await live(id));
    if (body.op === "act") { if (!(await isOwner(id, body.key))) return json({ error: "Only the Mayor can do that." }, 403); return json(await live(id, body.action)); }
    if (body.op === "init") {
      if (!(await isOwner(id, body.key))) return json({ error: "Only the Mayor can do that." }, 403);
      const { data } = await sb.from("uoe2_world").select("id").eq("id", id).maybeSingle();
      if (data && !body.reset) return json({ error: "World already exists." });
      const W = M.createWorld(body.seed ?? Math.floor(Math.random() * 1e9), Date.now()); await weather(W);
      const state = await gz64(JSON.stringify(M.serialize(W)));
      const { error } = await sb.from("uoe2_world").upsert({ id, state, ver: 1, rev: 0, tick: 0, saved_at: new Date().toISOString() }); if (error) throw error;
      return json({ ok: true, seed: W.S.seed });
    }
    return json({ error: "Unknown op." }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
