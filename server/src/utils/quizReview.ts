/**
 * Who is allowed to see the answer key of a graded quiz answer.
 *
 * The key — correctIndex plus the explanation that spells it out — is what
 * students were reading out of the network tab. Three endpoints handed it over:
 * the attempt response itself, GET /quizzes/attempt/:id, and the student's own
 * profile feed. Submitting once and reading the reply was enough to sit the
 * same paper again with the answers in hand.
 *
 * Rotating the drawn subset only narrows that, it does not close it: the bank
 * is often exactly the size of the paper, so there is nothing to rotate to.
 * The release is therefore gated on whether the key is still worth anything:
 *
 * - Staff see everything, always. They are marking, not sitting.
 * - A student sees the key for a question they already answered correctly —
 *   knowing it teaches them nothing they could reuse.
 * - Once they pass the quiz the whole review opens up. The assessment is over
 *   at that point and the review is the payoff for finishing it.
 * - A wrong answer on a quiz they have not passed comes back marked wrong and
 *   nothing else. To fix it they have to go back to the lesson, which is the
 *   behaviour the review was supposed to encourage in the first place.
 *
 * Redaction applies only to what is *sent*. Everything written to
 * QuizAttempt.answers and QuizQuestionResponse keeps the real key — those rows
 * feed calibration and teacher reports.
 */

export type GradedAnswer = {
  questionId: string;
  correctIndex?: number | null;
  explanation?: string | null;
  isCorrect: boolean;
  [key: string]: any;
};

export function canSeeAnswerKey(role: string, hasPassedQuiz: boolean): boolean {
  return role !== "student" || hasPassedQuiz;
}

/**
 * Returns a copy with the key stripped from every question the viewer has not
 * earned the right to see. Never mutates the input — callers pass the same
 * array they are about to persist.
 */
export function redactAnswerKey<T extends GradedAnswer>(
  answers: T[],
  opts: { role: string; hasPassedQuiz: boolean },
): T[] {
  if (canSeeAnswerKey(opts.role, opts.hasPassedQuiz)) return answers;
  return answers.map((a) =>
    a.isCorrect ? a : { ...a, correctIndex: null, explanation: null },
  );
}
