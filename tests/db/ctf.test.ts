import { describe, expect, it } from "vitest";
import { inTx, newUser, type Db } from "./db";

// CTF hints, write-ups and track badges (202610220010). Flags are derived from a secret, so
// each test points the challenge's flag_hash at a known test flag inside its rolled-back tx.

async function setFlag(db: Db, challengeId: string, flag: string) {
  await db.query("reset role");
  await db.query("update public.ctf_challenges set flag_hash = encode(extensions.digest($2, 'sha256'), 'hex') where id = $1", [challengeId, flag]);
}

async function solve(db: Db, user: string, challengeId: string) {
  await setFlag(db, challengeId, `test{${challengeId}}`);
  await db.as({ user });
  return db.one<{ correct: boolean; points_awarded: number; already_solved: boolean }>("select * from public.submit_ctf_flag($1, $2)", [challengeId, `test{${challengeId}}`]);
}

describe("CTF hints", () => {
  it("hint text is hidden until taken, hints are progressive, and taken hints lower the solve's points", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.as({ user: r });
      expect(await db.fails("select * from public.ctf_hints")).toMatch(/permission denied/);

      const before = await db.rows<{ hint_position: number; cost: number; taken: boolean; body: string | null }>("select * from public.list_ctf_hints('c-crypto-1')");
      expect(before.map((h) => h.cost)).toEqual([10, 20, 30]);
      expect(before.every((h) => !h.taken && h.body === null)).toBe(true);

      expect(await db.fails("select * from public.take_ctf_hint('c-crypto-1', 2)")).toMatch(/HINT_LOCKED/);
      const first = await db.one<{ cost: number; body: string }>("select * from public.take_ctf_hint('c-crypto-1', 1)");
      expect(first.cost).toBe(10);
      expect(first.body.length).toBeGreaterThan(10);
      await db.query("select * from public.take_ctf_hint('c-crypto-1', 1)"); // idempotent
      await db.query("select * from public.take_ctf_hint('c-crypto-1', 2)");

      const after = await db.rows<{ taken: boolean; body: string | null }>("select * from public.list_ctf_hints('c-crypto-1')");
      expect(after.map((h) => h.taken)).toEqual([true, true, false]);
      expect(after[2].body).toBeNull();

      const result = await solve(db, r, "c-crypto-1");
      expect(result).toEqual({ correct: true, points_awarded: 70, already_solved: false });
      expect((await db.one<{ points_awarded: number }>("select points_awarded from public.ctf_solves where researcher_id = $1 and challenge_id = 'c-crypto-1'", [r])).points_awarded).toBe(70);
    });
  });

  it("an event credit carries the hint-reduced score", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await db.query("reset role");
      const event = await db.one<{ id: string }>(
        "insert into public.ctf_events (slug, name, description, starts_at, ends_at, status) values ('dbtest-hints', 'DB test', 'x', now() - interval '1 hour', now() + interval '1 hour', 'scheduled') returning id",
      );
      await db.query("insert into public.ctf_event_challenges (event_id, challenge_id) values ($1, 'c-re-4')", [event.id]);
      await db.as({ user: r });
      await db.query("select * from public.take_ctf_hint('c-re-4', 1)");
      expect((await solve(db, r, "c-re-4")).points_awarded).toBe(450);
      const row = await db.one<{ event_points: string }>("select event_points from public.get_ctf_event_leaderboard($1, 10) where researcher_id = $2", [event.id, r]);
      expect(Number(row.event_points)).toBe(450);
    });
  });

  it("organization accounts and signed-out callers cannot take hints", async () => {
    await inTx(async (db) => {
      const org = await newUser(db, "organization");
      await db.as({ user: org });
      expect(await db.fails("select * from public.take_ctf_hint('c-crypto-1', 1)")).toMatch(/FORBIDDEN/);
      await db.as("anon");
      expect(await db.fails("select * from public.take_ctf_hint('c-crypto-1', 1)")).toMatch(/permission denied/);
    });
  });
});

describe("CTF write-ups", () => {
  const body = "Shift every letter back by the distance between u and the first ciphertext letter.";

  it("only solvers read write-ups; a solver publishes one plain-text write-up that other solvers see", async () => {
    await inTx(async (db) => {
      const author = await newUser(db, "researcher");
      const reader = await newUser(db, "researcher");
      const outsider = await newUser(db, "researcher");

      await db.as({ user: author });
      expect(await db.fails("select * from public.get_ctf_writeups('c-crypto-1')")).toMatch(/NOT_SOLVED/);
      expect(await db.fails("select public.publish_ctf_writeup('c-crypto-1', $1)", [body])).toMatch(/NOT_SOLVED/);
      expect(await db.fails("select * from public.ctf_official_writeups")).toMatch(/permission denied/);

      await solve(db, author, "c-crypto-1");
      const official = await db.rows<{ is_official: boolean; body: string }>("select * from public.get_ctf_writeups('c-crypto-1')");
      // Other solvers' write-ups may exist (seeded E2E accounts keep theirs); count only the official one.
      expect(official.filter((w) => w.is_official)).toHaveLength(1);
      expect(official[0].is_official).toBe(true);

      expect(await db.fails("select public.publish_ctf_writeup('c-crypto-1', 'too short')")).toMatch(/WRITEUP_TOO_SHORT/);
      expect(await db.fails("select public.publish_ctf_writeup('c-crypto-1', $1)", ["x".repeat(2001)])).toMatch(/WRITEUP_TOO_LONG/);
      expect(await db.fails("select public.publish_ctf_writeup('c-crypto-1', $1)", [`${body} <script>alert(1)</script>`])).toMatch(/WRITEUP_NOT_PLAIN_TEXT/);
      await db.query("select public.publish_ctf_writeup('c-crypto-1', $1)", [body]);
      await db.query("select public.publish_ctf_writeup('c-crypto-1', $1)", [`${body} Edited.`]); // replaces, never a second row

      await solve(db, reader, "c-crypto-1");
      const seen = await db.rows<{ is_official: boolean; body: string; is_mine: boolean }>("select * from public.get_ctf_writeups('c-crypto-1')");
      expect(seen[0].is_official).toBe(true);
      expect(seen.find((w) => !w.is_official && w.body === `${body} Edited.`)).toMatchObject({ is_mine: false });
      // Direct table reads stay limited to one's own rows.
      expect(await db.rows("select * from public.ctf_writeups")).toHaveLength(0);

      await db.as({ user: outsider });
      expect(await db.fails("select * from public.get_ctf_writeups('c-crypto-1')")).toMatch(/NOT_SOLVED/);

      await db.as({ user: author });
      await db.query("select public.delete_my_ctf_writeup('c-crypto-1')");
      await db.as({ user: reader });
      const after = await db.rows<{ body: string }>("select * from public.get_ctf_writeups('c-crypto-1')");
      expect(after.some((w) => w.body === `${body} Edited.`)).toBe(false);
    });
  });

  it("every live challenge with hints has an official write-up", async () => {
    await inTx(async (db) => {
      const missing = await db.rows("select distinct h.challenge_id from public.ctf_hints h where not exists (select 1 from public.ctf_official_writeups o where o.challenge_id = h.challenge_id)");
      expect(missing).toEqual([]);
    });
  });
});

describe("CTF track badges", () => {
  it("finishing every challenge in a track stores one badge, visible to self and on an opted-in profile only", async () => {
    await inTx(async (db) => {
      const r = await newUser(db, "researcher");
      await solve(db, r, "c-network-1");
      expect(await db.rows("select * from public.get_researcher_ctf_badges($1)", [r])).toHaveLength(0);
      await solve(db, r, "c-network-2");
      await solve(db, r, "c-network-2"); // resubmitting never duplicates
      const mine = await db.rows<{ track_id: string; label: string }>("select track_id, label from public.get_researcher_ctf_badges($1)", [r]);
      expect(mine).toEqual([{ track_id: "trk-network-basics", label: "Network fundamentals" }]);

      await db.as("anon");
      expect(await db.rows("select * from public.get_researcher_ctf_badges($1)", [r])).toHaveLength(0);
      await db.query("reset role");
      await db.query("update public.users set public_username = $2 where id = $1", [r, `dbtest-pub-${r.slice(0, 8)}`]);
      await db.as("anon");
      expect(await db.rows("select * from public.get_researcher_ctf_badges($1)", [r])).toHaveLength(1);

      await db.as({ user: r });
      expect(await db.fails("insert into public.ctf_track_badges (researcher_id, track_id) values ($1, 'trk-crypto-basics')", [r])).toMatch(/permission denied/);
    });
  });
});
