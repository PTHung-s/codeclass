import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuthContext } from "../contexts/AuthContext";
import { isStaff } from "../lib/roles";

export interface TeacherOnboardingData {
  courseCount: number;
  studentCount: number;
  assignmentCount: number;
  problemCount: number;
}

export interface StudentOnboardingData {
  enrolledCourseCount: number;
  submissionCount: number;
  reviewedCount: number;
}

const defaultState = {
  createdCourse: false,
  addedStudents: false,
  createdAssignment: false,
  createdProblem: false,
  joinedCourse: false,
  submittedAssignment: false,
  viewedFeedback: false,
};

export function useOnboarding(
  teacherData?: TeacherOnboardingData,
  studentData?: StudentOnboardingData
) {
  const { user } = useAuthContext();
  const [dismissed, setDismissed] = useState(false);
  const dismissKey = `onboarding_dismissed_${user?.id}`;

  useEffect(() => {
    if (!user?.id) return;
    try {
      setDismissed(localStorage.getItem(dismissKey) === "true");
    } catch {}
  }, [user?.id, dismissKey]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(dismissKey, "true");
  }, [dismissKey]);

  const isTeacher = isStaff(user?.role);

  // Derive actual state from real backend data, NOT localStorage
  const actualState = useMemo(() => {
    if (isTeacher && teacherData) {
      return {
        createdCourse: teacherData.courseCount > 0,
        addedStudents: teacherData.studentCount > 0,
        createdAssignment: teacherData.assignmentCount > 0,
        createdProblem: teacherData.problemCount > 0,
      };
    }
    if (!isTeacher && studentData) {
      return {
        joinedCourse: studentData.enrolledCourseCount > 0,
        submittedAssignment: studentData.submissionCount > 0,
        viewedFeedback: studentData.reviewedCount > 0,
      };
    }
    return defaultState;
  }, [isTeacher, teacherData, studentData]);

  const allDone = useMemo(() => {
    if (isTeacher) {
      return (
        actualState.createdCourse &&
        actualState.addedStudents &&
        actualState.createdAssignment &&
        actualState.createdProblem
      );
    }
    return (
      actualState.joinedCourse &&
      actualState.submittedAssignment &&
      actualState.viewedFeedback
    );
  }, [isTeacher, actualState]);

  const showChecklist = !dismissed && !allDone && !!user?.id;

  return { showChecklist, allDone, state: actualState, dismiss, isTeacher };
}
