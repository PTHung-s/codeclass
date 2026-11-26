import assert from "node:assert/strict";
import prisma from "../../utils/prisma";
import { fromMeetingQuizSubmission } from "../skillEvidence";
import { syncMeetingQuizEvent, syncRoomEvent } from "../meetingService";
import { SKILL_SEEDS } from "../../utils/skillGraph";

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

  const validSkillId = SKILL_SEEDS[0].skillId;

  console.log("\n── Meeting SkillEvidence builder ──");
  const ev = fromMeetingQuizSubmission(
    "u1",
    "sess_1",
    "room_1",
    [
      { questionId: "q1", isCorrect: true, skillId: validSkillId, difficulty: "hard" },
      { questionId: "q2", isCorrect: false, skillId: "not_a_real_skill_id", difficulty: "easy" },
      { questionId: "q3", isCorrect: true, skillId: null, difficulty: "medium" },
    ],
    new Date("2026-11-26T12:00:00Z"),
  );
  check("keeps only valid canonical skillId rows", ev.length === 1 && ev[0].skillId === validSkillId);
  check("maps source='meeting_quiz' and hard difficulty=4", ev[0].source === "meeting_quiz" && ev[0].difficultyUsed === 4);

  console.log("\n── Meeting DB sync + SkillEvidence persistence ──");
  const student = await prisma.user.findFirst({ where: { role: "student", status: "active" } });
  assert.ok(student, "Expected at least 1 active student in DB");

  const tempRoomId = `test_meet_${Date.now()}`;
  try {
    await syncRoomEvent(
      {
        roomId: tempRoomId,
        title: "Test Meeting Class",
        hostName: "Teacher Smoke",
        activeParticipantCount: 1,
        participants: [
          {
            participantKey: `cc:${student.id}`,
            ccId: student.id,
            displayName: student.fullName,
            role: "student",
            isConnected: true,
            points: 3,
          },
        ],
      },
      false,
    );

    const dbRoom = await prisma.meetingRoom.findUnique({ where: { id: tempRoomId } });
    check("syncRoomEvent upserts MeetingRoom", dbRoom?.status === "live" && dbRoom.activeParticipantCount === 1);

    const quizRes = await syncMeetingQuizEvent({
      roomId: tempRoomId,
      roomTitle: "Test Meeting Class",
      externalQuizId: "qz_100",
      kind: "quiz",
      title: "Quick Loop Check",
      questions: [
        {
          id: "q1",
          question: "1+1=?",
          options: ["1", "2", "3", "4"],
          correctAnswer: 1,
          difficulty: "easy",
          skillId: validSkillId,
        },
        {
          id: "q2",
          question: "2+2=?",
          options: ["3", "4", "5", "6"],
          correctAnswer: 1,
          difficulty: "medium",
          skillId: validSkillId,
        },
      ],
      submissions: [
        {
          participantKey: `cc:${student.id}`,
          ccId: student.id,
          studentName: student.fullName,
          score: 1,
          totalQuestions: 2,
          timeTaken: 25,
          rank: 1,
          answers: [{ questionId: "q1", selectedOption: 1, isCorrect: true }],
        },
      ],
    });
    check("syncMeetingQuizEvent inserts initial SkillEvidence", quizRes.ok && quizRes.evidenceInserted === 1);

    // Re-sync with extra question submitted (quiz:submit-extra idempotency)
    const extraRes = await syncMeetingQuizEvent({
      roomId: tempRoomId,
      roomTitle: "Test Meeting Class",
      externalQuizId: "qz_100",
      kind: "quiz",
      title: "Quick Loop Check",
      questions: [
        {
          id: "q1",
          question: "1+1=?",
          options: ["1", "2", "3", "4"],
          correctAnswer: 1,
          difficulty: "easy",
          skillId: validSkillId,
        },
        {
          id: "q2",
          question: "2+2=?",
          options: ["3", "4", "5", "6"],
          correctAnswer: 1,
          difficulty: "medium",
          skillId: validSkillId,
        },
      ],
      submissions: [
        {
          participantKey: `cc:${student.id}`,
          ccId: student.id,
          studentName: student.fullName,
          score: 2,
          totalQuestions: 2,
          timeTaken: 35,
          rank: 1,
          answers: [
            { questionId: "q1", selectedOption: 1, isCorrect: true },
            { questionId: "q2", selectedOption: 1, isCorrect: true },
          ],
        },
      ],
    });
    check("idempotent re-sync inserts only new q2 SkillEvidence", extraRes.ok && extraRes.evidenceInserted === 1);

    const adaptiveRes = await syncMeetingQuizEvent({
      roomId: tempRoomId,
      externalQuizId: "adp_100",
      kind: "adaptive",
      title: "Adaptive Live Check",
      questions: [
        {
          id: "aq1",
          question: "For loop range(3)?",
          options: ["0,1,2", "1,2,3", "0,1,2,3", "1,2"],
          correctAnswer: 0,
          difficulty: "hard",
          skillId: validSkillId,
        },
      ],
      submissions: [
        {
          participantKey: `cc:${student.id}`,
          ccId: student.id,
          studentName: student.fullName,
          score: 1,
          totalQuestions: 1,
          timeTaken: 0,
          rank: 1,
          answers: [{ questionId: "aq1", selectedOption: 0, isCorrect: true }],
        },
      ],
    });
    check("adaptive:sync persists session & evidence", adaptiveRes.ok && adaptiveRes.evidenceInserted === 1);

    const totalEvCount = await prisma.skillEvidence.count({
      where: { userId: student.id, source: "meeting_quiz", contextId: tempRoomId },
    });
    check("total SkillEvidence rows in DB = 3", totalEvCount === 3);
  } finally {
    await prisma.skillEvidence.deleteMany({ where: { contextId: tempRoomId } }).catch(() => {});
    await prisma.meetingRoom.deleteMany({ where: { id: tempRoomId } }).catch(() => {});
  }

  console.log(`\nmeetingIntegration tests: ${pass} passed, ${fail} failed.`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
