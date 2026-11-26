// Run only against a named test project with two disposable, authorized accounts.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const names = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_PUBLISHABLE_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
];
if (names.some((n) => !process.env[n])) {
  console.log(
    "SKIP: configure as seis variáveis TEST_* documentadas. Nenhuma API foi chamada.",
  );
  process.exit(0);
}
const client = () =>
  createClient(
    process.env.TEST_SUPABASE_URL,
    process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const a = client(),
  b = client();
let uid;
const contest = crypto.randomUUID(),
  discipline = crypto.randomUUID(),
  topic = crypto.randomUUID(),
  session = crypto.randomUUID();
const material = crypto.randomUUID();
let path;
const ok = (r) => {
  assert.equal(r.error, null, "Operação autorizada falhou");
  return r.data;
};
try {
  const sa = ok(
    await a.auth.signInWithPassword({
      email: process.env.TEST_USER_A_EMAIL,
      password: process.env.TEST_USER_A_PASSWORD,
    }),
  );
  const sb = ok(
    await b.auth.signInWithPassword({
      email: process.env.TEST_USER_B_EMAIL,
      password: process.env.TEST_USER_B_PASSWORD,
    }),
  );
  uid = sa.user.id;
  assert.notEqual(uid, sb.user.id, "Use duas contas distintas");
  for (const n of [
    { id: contest, parent_id: null, kind: "contest" },
    { id: discipline, parent_id: contest, kind: "discipline" },
    { id: topic, parent_id: discipline, kind: "topic" },
  ])
    ok(
      await a
        .from("study_nodes")
        .insert({
          ...n,
          name: "Teste descartável de isolamento",
          owner_id: uid,
        }),
    );
  ok(
    await a
      .from("study_members")
      .insert({ contest_id: contest, user_id: sb.user.id, role: "reader" }),
  );
  ok(
    await a
      .from("study_sessions")
      .insert({
        id: session,
        user_id: uid,
        topic_id: topic,
        started_at: new Date().toISOString(),
        seconds: 30,
        client_event_id: crypto.randomUUID(),
      }),
  );
  assert.equal(
    ok(await b.from("study_sessions").select("*").eq("id", session)).length,
    0,
  );
  assert.equal(
    ok(
      await b
        .from("study_sessions")
        .update({ seconds: 999 })
        .eq("id", session)
        .select(),
    ).length,
    0,
  );
  assert.equal(
    ok(await b.from("study_sessions").delete().eq("id", session).select())
      .length,
    0,
  );
  assert.ok(
    (
      await b
        .from("study_sessions")
        .insert({
          user_id: uid,
          topic_id: topic,
          started_at: new Date().toISOString(),
          client_event_id: crypto.randomUUID(),
        })
    ).error,
  );
  assert.ok(
    (await b.from("study_roles").upsert({ user_id: sb.user.id, role: "admin" }))
      .error,
  );
  assert.ok(
    (
      await b.rpc("study_authorize_email", {
        address: "blocked@example.test",
        valid_until: new Date(Date.now() + 60000).toISOString(),
      })
    ).error,
    "A conta B precisa ser não administrativa",
  );
  assert.equal(
    ok(await a.from("study_sessions").select("seconds").eq("id", session))[0]
      .seconds,
    30,
  );
  ok(
    await a
      .from("study_notes")
      .insert({ user_id: uid, topic_id: topic, body: "Nota privada de teste" }),
  );
  assert.equal(
    ok(await b.from("study_notes").select("*").eq("user_id", uid)).length,
    0,
  );
  assert.equal(
    ok(await b.from("study_profiles").select("*").eq("user_id", uid)).length,
    0,
  );
  path = `${uid}/${material}/test.pdf`;
  ok(
    await a
      .from("study_materials")
      .insert({
        id: material,
        topic_id: topic,
        owner_id: uid,
        section: "Bibliografia",
        title: "PDF descartável de teste",
        kind: "pdf",
        file_path: path,
      }),
  );
  ok(
    await a.storage
      .from("study-materials")
      .upload(path, new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" })),
  );
  assert.ok(
    (await b.storage.from("study-materials").createSignedUrl(path, 60)).error,
  );
  ok(
    await a
      .from("study_materials")
      .update({ visibility: "shared", shared_with: [sb.user.id] })
      .eq("id", material),
  );
  assert.ok(
    ok(await b.storage.from("study-materials").createSignedUrl(path, 60))
      .signedUrl,
  );
  ok(
    await a
      .from("study_materials")
      .update({ visibility: "private", shared_with: [] })
      .eq("id", material),
  );
  assert.ok(
    (await b.storage.from("study-materials").createSignedUrl(path, 60)).error,
  );
  console.log(
    "PASS: duas contas via Auth e PostgREST; SELECT/UPDATE/DELETE/INSERT privados e autoelevação bloqueados.",
  );
} finally {
  if (uid) {
    if (path) await a.storage.from("study-materials").remove([path]);
    await a.from("study_materials").delete().eq("id", material);
    await a
      .from("study_notes")
      .delete()
      .eq("user_id", uid)
      .eq("topic_id", topic);
    await a.from("study_sessions").delete().eq("id", session);
    await a.from("study_members").delete().eq("contest_id", contest);
  }
  // Hierarchy has no client DELETE policy: deliberately retained, clearly named fixtures.
  await Promise.all([
    a.auth.signOut({ scope: "local" }),
    b.auth.signOut({ scope: "local" }),
  ]);
  console.log(
    "Estrutura de teste retida; remova os três nós pelo SQL Editor após conferir dependências. IDs: " +
      [contest, discipline, topic].join(", "),
  );
}
