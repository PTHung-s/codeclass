import assert from "node:assert/strict";
import prisma from "../../utils/prisma";
import {
  addParticipant,
  endRecording,
  getActiveRecording,
  isAutoEnrollEnabled,
  isParticipant,
  isRecording,
  recordEvent,
  startRecording,
} from "../recordingService";

async function run() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) {
      pass++;
      console.log(`  ✓ ${name}`);
    } else {
      fail++;
      console.log(`  ✗ ${name}`);
    }
  };

  console.log("\n── Recording Service: multi-session, dedup, throttling & live counters ──");
  const staff = await prisma.user.findFirst({ where: { role: { in: ["teacher", "admin"] } } });
  const students = await prisma.user.findMany({ where: { role: "student" }, take: 2 });
  assert.ok(staff, "Expected at least 1 teacher/admin in DB");
  assert.ok(students.length >= 1, "Expected at least 1 student in DB");

  const s1 = students[0];
  const s2 = students[1] ?? null;
  const createdSessionIds: string[] = [];

  try {
    // 1. Start session #1
    const started1 = await startRecording({
      startedById: staff.id,
      userIds: [s1.id],
      title: "Test Recording Session 1",
    });
    assert.ok(!("error" in started1), "Session 1 should start without error");
    createdSessionIds.push(started1.sessionId);

    check("isRecording() true and autoEnroll defaults to true", isRecording() && isAutoEnrollEnabled());
    check("student 1 enrolled on start", isParticipant(s1.id) && getActiveRecording()?.userIds.includes(s1.id) === true);

    // 2. Duplicate Start blocked
    const dup = await startRecording({ startedById: staff.id, userIds: [s1.id] });
    check("rejects concurrent recording session", "error" in dup);

    // 3. Initial code snapshot accepted
    const snap1 = await recordEvent(s1.id, {
      type: "code_snapshot",
      code: "print('hello')",
      label: "Bài tập: Hello",
    });
    check("accepts initial code_snapshot", !!snap1 && snap1.code === "print('hello')");

    // 4. Identical code deduplicated
    const snapDup = await recordEvent(s1.id, {
      type: "code_snapshot",
      code: "print('hello')",
      label: "Bài tập: Hello",
    });
    check("deduplicates unchanged code_snapshot", snapDup === null);

    // 5. Throttled when minSnapshotIntervalMs is active
    const snapThrottled = await recordEvent(
      s1.id,
      { type: "code_snapshot", code: "print('hello 2')", label: "Bài tập: Hello" },
      { minSnapshotIntervalMs: 60_000 },
    );
    check("respects minSnapshotIntervalMs throttle", snapThrottled === null);

    // 6. Accepted without throttle
    const snap2 = await recordEvent(s1.id, {
      type: "code_snapshot",
      code: "print('hello 2')",
      label: "Bài tập: Hello",
    });
    check("accepts updated code when not throttled", !!snap2 && snap2.code === "print('hello 2')");

    // 7. tab_out returns live incremented tabOutCount
    const tab1 = await recordEvent(s1.id, { type: "tab_out" });
    const tab2 = await recordEvent(s1.id, { type: "tab_out" });
    check("tab_out increments & returns live tabOutCount", tab1?.tabOutCount === 1 && tab2?.tabOutCount === 2);

    // 8. run returns live runCount and preserves code for finalCode fallback
    const runEv = await recordEvent(s1.id, {
      type: "run",
      code: "print('final from run')",
      label: "Code Lab: main.py",
      passed: true,
    });
    check(
      "run increments runCount and attaches code/passed",
      runEv?.runCount === 1 && runEv?.passed === true && runEv?.code === "print('final from run')",
    );

    // 9. Mid-session participant enrollment (auto-enroll)
    if (s2) {
      const addRes = await addParticipant(s2.id, false);
      const addAgain = await addParticipant(s2.id, false);
      check(
        "addParticipant enrolls late student idempotently",
        "added" in addRes && "alreadyIn" in addAgain && isParticipant(s2.id),
      );
    }

    // 10. End session #1 -> persists finalCode from latest code_snapshot/run
    const ended1 = await endRecording();
    check("endRecording closes session 1", !("error" in ended1) && !isRecording());

    const p1Row = await prisma.recordingParticipant.findFirst({
      where: { sessionId: started1.sessionId, userId: s1.id },
    });
    check(
      "endRecording stores finalCode (including run code) and counters",
      p1Row?.finalCode === "print('final from run')" && p1Row?.tabOutCount === 2 && p1Row?.runCount === 1,
    );

    // 11. Start & end session #2 on the SAME calendar day -> both sessions must survive!
    const started2 = await startRecording({
      startedById: staff.id,
      userIds: [s1.id],
      title: "Test Recording Session 2 (same day)",
    });
    assert.ok(!("error" in started2), "Session 2 should start without error");
    createdSessionIds.push(started2.sessionId);

    const ended2 = await endRecording();
    assert.ok(!("error" in ended2), "Session 2 should end without error");

    const both = await prisma.recordingSession.findMany({
      where: { id: { in: [started1.sessionId, started2.sessionId] } },
      select: { id: true, status: true },
    });
    check(
      "multiple sessions on the same calendar day are both preserved",
      both.length === 2 && both.every((s) => s.status === "ended"),
    );
  } finally {
    if (isRecording()) {
      await endRecording();
    }
    if (createdSessionIds.length) {
      await prisma.recordingSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    await prisma.$disconnect();
  }

  console.log(`\nrecordingService tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
