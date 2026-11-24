import { graph, emission, direct } from "./patches.js";
function hash(i) {
  i = Math.imul(i ^ (i >>> 16), 0x45d9f3b);
  return (i ^ (i >>> 16)) >>> 0;
}
export function solvePackets(room, s) {
  const rows = graph(room),
    e = emission(room, s);
  let r = room.rotors;
  if (!r || r.batch !== s.a || r.random !== s.b) {
    const lit = direct(room, e),
      start = [],
      schedule = [],
      cursor = new Uint32Array(room.n);
    let power = 0;
    for (let i = 0; i < room.n; i++) {
      const row = rows[i],
        deck = new Int32Array(1024);
      deck.fill(-1);
      let j = 0,
        cumulative = row[0];
      for (let k = 0; k < deck.length; k++) {
        const target = (k + 0.5) / deck.length;
        while (cumulative < target && j + 1 < room.n) cumulative += row[++j];
        if (cumulative >= target) deck[(k * 619 + hash(i)) & 1023] = j;
      }
      schedule.push(deck);
      const rgb = Array.from(
        { length: 3 },
        (_, c) => lit[i * 3 + c] - e[i * 3 + c],
      );
      const intensity = Math.max(...rgb) * room.patches[i].area;
      if (intensity > 0) {
        power += intensity;
        start.push({
          i,
          rgb: rgb.map((v) => (v * room.patches[i].area) / intensity),
          end: power,
        });
      }
    }
    r = room.rotors = {
      batch: s.a,
      random: s.b,
      lit,
      schedule,
      start,
      power,
      cursor,
      total: 0,
      energy: new Float64Array(room.n * 3),
    };
  }
  const count = s.releases * s.a;
  for (let k = 0; k < count && r.start.length; k++) {
    const ticket = ++r.total;
    const target = ((ticket * 0.618033988749895) % 1) * r.power;
    let lo = 0,
      hi = r.start.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r.start[mid].end < target) lo = mid + 1;
      else hi = mid;
    }
    const start = r.start[lo],
      power = start.rgb.map((v) => v * r.power);
    let i = start.i;
    for (let bounce = 0; bounce < 12; bounce++) {
      const turn = s.b
        ? hash(Math.imul(ticket, 65537) + bounce) & 1023
        : r.cursor[i]++ & 1023;
      i = r.schedule[i][turn];
      if (i < 0) break;
      const p = room.patches[i];
      for (let c = 0; c < 3; c++) {
        power[c] *= p.tint[c];
        r.energy[i * 3 + c] += power[c] / p.area;
      }
    }
  }
  const rgb = r.lit.slice();
  for (let i = 0; i < rgb.length; i++)
    rgb[i] += r.energy[i] / Math.max(1, r.total);
  return {
    rgb,
    info:
      r.total.toLocaleString("en-US") +
      " emitted packets · " +
      (s.b ? "random" : "rotor") +
      " routing",
  };
}
