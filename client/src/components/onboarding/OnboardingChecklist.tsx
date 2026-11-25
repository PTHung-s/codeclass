import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../hooks/useOnboarding";
import type { TeacherOnboardingData, StudentOnboardingData } from "../../hooks/useOnboarding";
import { CheckCircle2, Circle, X, Rocket, Loader2 } from "lucide-react";

interface Props {
  teacherData?: TeacherOnboardingData;
  studentData?: StudentOnboardingData;
  isLoading?: boolean;
}

export default function OnboardingChecklist({ teacherData, studentData, isLoading: dataLoading }: Props) {
  const { showChecklist, state, dismiss, isTeacher } = useOnboarding(teacherData, studentData);
  const navigate = useNavigate();

  if (!showChecklist) return null;

  const teacherSteps = [
    {
      key: "createdCourse" as const,
      label: "Tạo khóa học đầu tiên",
      doneLabel: "Đã tạo khóa học",
      path: "/courses/new",
      icon: "📚",
    },
    {
      key: "addedStudents" as const,
      label: "Thêm học viên vào khóa học",
      doneLabel: "Đã có học viên",
      path: "/courses",
      icon: "👥",
    },
    {
      key: "createdProblem" as const,
      label: "Tạo đề bài trong thư viện",
      doneLabel: "Đã có đề bài",
      path: "/problems/new",
      icon: "💻",
    },
  ];

  const studentSteps = [
    {
      key: "joinedCourse" as const,
      label: "Tham gia khóa học",
      doneLabel: "Đã tham gia khóa học",
      path: "/courses",
      icon: "📚",
    },
  ];

  const steps = isTeacher ? teacherSteps : studentSteps;
  const completed = steps.filter((s) => state[s.key]).length;
  const progress = Math.round((completed / steps.length) * 100);

  // Determine the next incomplete step for the message
  const nextStep = steps.find((s) => !state[s.key]);

  return (
    <div className="animate-slide-up">
      <div className="rounded-xl bg-brand-700 p-5 text-white shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {dataLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Rocket className="w-5 h-5" />
            )}
            <h3 className="text-sm font-semibold">
              {dataLoading
                ? "Đang kiểm tra tiến độ..."
                : completed === 0
                  ? "Bắt đầu với CodeClass"
                  : `Đang tiến triển tốt! (${completed}/${steps.length})`}
            </h3>
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-full hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            title="Ẩn hướng dẫn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700 ease-out dark:bg-gray-800"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-white/80 shrink-0 tabular-nums">
            {completed}/{steps.length}
          </span>
        </div>

        {/* Steps */}
        <div className="space-y-1">
          {steps.map((step) => {
            const done = state[step.key];
            return (
              <button
                key={step.key}
                onClick={() => {
                  if (!done) navigate(step.path);
                }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                  done
                    ? "bg-white/10 text-white/70 cursor-default"
                    : "bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                }`}
              >
                <span className="text-lg">{step.icon}</span>
                <span className="flex-1">
                  {done ? step.doneLabel : step.label}
                </span>
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-green-300 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-white/40 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Contextual message */}
        {completed === 0 && (
          <p className="text-xs text-white/60 mt-3 text-center">
            Nhấn vào mỗi bước để bắt đầu — CodeClass sẽ tự cập nhật khi bạn hoàn thành
          </p>
        )}
        {completed > 0 && completed < steps.length && nextStep && (
          <p className="text-xs text-white/60 mt-3 text-center">
            Tiếp theo: {nextStep.label} — nhấn để bắt đầu
          </p>
        )}
        {completed === steps.length && (
          <p className="text-xs text-green-300 mt-3 text-center font-medium">
            🎉 Bạn đã hoàn thành tất cả bước cơ bản! Hướng dẫn này sẽ tự ẩn.
          </p>
        )}
      </div>
    </div>
  );
}
