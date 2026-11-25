import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, ChevronDown, ChevronRight, RefreshCw, BarChart3 } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { useConfirmContext } from "../../hooks/useConfirm";
import QuizFormDialog from "./QuizFormDialog";

interface Course {
  id: string;
  title: string;
}

interface Module {
  id: string;
  title: string;
  courseId: string;
}

interface Lesson {
  id: string;
  title: string;
  moduleId: string;
}

interface Quiz {
  id: string;
  title: string;
  lessonId: string;
  passScore: number;
  questionCount: number;
  shuffle: boolean;
  _count?: { questions: number };
}

interface CalibrationQuestion {
  id: string;
  question: string;
  difficulty: number;
  effectiveDifficulty: number;
  calibrationSamples: number;
  calibrationConfidence: number;
  calibrationStatus: string;
  calibrationLocked: boolean;
}

export default function QuizManagerTab() {
  const confirm = useConfirmContext();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [courseModulesCache, setCourseModulesCache] = useState<Map<string, Module[]>>(new Map());
  const [moduleLessonsCache, setModuleLessonsCache] = useState<Map<string, Lesson[]>>(new Map());
  const [lessonQuizzesCache, setLessonQuizzesCache] = useState<Map<string, Quiz[]>>(new Map());
  const [quizFormOpen, setQuizFormOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<{ quizId?: string; lessonId?: string } | null>(null);

  const calibration = useQuery<CalibrationQuestion[]>({
    queryKey: ["quiz-calibration", selectedCourse],
    queryFn: () => api.get(`/quizzes/calibration/${selectedCourse}`).then((r) => r.data),
    enabled: !!selectedCourse,
  });

  const recalibrate = useMutation({
    mutationFn: () => api.post(`/quizzes/calibration/${selectedCourse}/recalculate`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quiz-calibration", selectedCourse] }),
  });

  // Fetch courses (lightweight — no modules in list response)
  const { data: courses = [], isLoading: loadingCourses } = useQuery<Course[]>({
    queryKey: ["courses"],
    queryFn: () => api.get("/courses").then((r) => r.data),
  });

  const loadCourseModules = async (courseId: string) => {
    if (courseModulesCache.has(courseId)) return;
    try {
      const res = await api.get(`/courses/${courseId}`);
      setCourseModulesCache((prev) => new Map(prev).set(courseId, res.data.modules || []));
    } catch (err) {
      console.error("Failed to load modules:", err);
    }
  };

  const loadModuleLessons = async (moduleId: string) => {
    if (moduleLessonsCache.has(moduleId)) return;
    try {
      const res = await api.get(`/modules/${moduleId}/lessons`);
      setModuleLessonsCache((prev) => new Map(prev).set(moduleId, res.data));
    } catch (err) {
      console.error("Failed to load lessons:", err);
    }
  };

  const loadLessonQuizzes = async (lessonId: string) => {
    if (lessonQuizzesCache.has(lessonId)) return;
    try {
      const res = await api.get(`/lessons/${lessonId}/quizzes`);
      setLessonQuizzesCache((prev) => new Map(prev).set(lessonId, res.data));
    } catch (err) {
      console.error("Failed to load quizzes:", err);
    }
  };

  const toggleCourse = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
        loadCourseModules(courseId);
      }
      return next;
    });
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
        loadModuleLessons(moduleId);
      }
      return next;
    });
  };

  const toggleLesson = (lessonId: string) => {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
        loadLessonQuizzes(lessonId);
      }
      return next;
    });
  };

  const deleteQuiz = useMutation({
    mutationFn: (quizId: string) => api.delete(`/quizzes/${quizId}`),
    onSuccess: () => {
      setLessonQuizzesCache(new Map());
    },
  });

  const handleDelete = async (quizId: string, quizTitle: string) => {
    const confirmed = await confirm({
      title: "Xóa quiz",
      message: `Bạn có chắc muốn xóa quiz "${quizTitle}"?`,
      confirmLabel: "Xóa",
      cancelLabel: "Hủy",
      variant: "danger",
    });
    if (confirmed) {
      deleteQuiz.mutate(quizId);
    }
  };

  const handleCreateQuiz = (lessonId: string) => {
    setEditingQuiz({ lessonId });
    setQuizFormOpen(true);
  };

  const handleEditQuiz = (quizId: string) => {
    setEditingQuiz({ quizId });
    setQuizFormOpen(true);
  };

  const handleFormSuccess = () => {
    setQuizFormOpen(false);
    setEditingQuiz(null);
    setLessonQuizzesCache(new Map());
  };

  const filteredCourses = courses.filter((course) => {
    if (selectedCourse && course.id !== selectedCourse) return false;
    if (searchTerm && !course.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const getModulesForCourse = (courseId: string): Module[] => {
    return courseModulesCache.get(courseId) || [];
  };

  const getLessonsForModule = (moduleId: string): Lesson[] => {
    return moduleLessonsCache.get(moduleId) || [];
  };

  const getFilteredQuizzes = (lessonId: string): Quiz[] => {
    const quizzes = lessonQuizzesCache.get(lessonId) || [];
    return quizzes.filter((quiz) => {
      if (searchTerm && !quiz.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  };

  if (loadingCourses) {
    return <div className="text-center py-12 text-muted-foreground">Đang tải...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm kiếm quiz..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none dark:bg-card"
          />
        </div>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm outline-none dark:bg-card"
        >
          <option value="">Tất cả khóa học</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {selectedCourse && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 dark:border-primary/20 dark:bg-primary/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary dark:text-primary" />
              <div>
                <h3 className="font-semibold text-foreground dark:text-foreground">Hiệu chỉnh độ khó câu hỏi</h3>
                <p className="text-xs text-muted-foreground">Độ khó gốc vẫn được giữ; chỉ câu đủ dữ liệu mới ảnh hưởng adaptive.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => recalibrate.mutate()} disabled={recalibrate.isPending}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${recalibrate.isPending ? "animate-spin" : ""}`} />
              {recalibrate.isPending ? "Đang tính..." : "Cập nhật dữ liệu"}
            </Button>
          </div>
          {calibration.isError && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Telemetry chưa được bật hoặc database chưa chạy migration.</p>}
          {calibration.data && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-background">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr><th className="px-3 py-2">Câu hỏi</th><th className="px-3 py-2">Gốc</th><th className="px-3 py-2">Thực tế</th><th className="px-3 py-2">Mẫu</th><th className="px-3 py-2">Trạng thái</th></tr>
                </thead>
                <tbody>
                  {calibration.data.slice(0, 12).map((item) => (
                    <tr key={item.id} className="border-b border-border/60 last:border-0">
                      <td className="max-w-[360px] truncate px-3 py-2 text-foreground dark:text-muted-foreground">{item.question}</td>
                      <td className="px-3 py-2">{item.difficulty}/5</td>
                      <td className="px-3 py-2 font-semibold">{item.effectiveDifficulty.toFixed(1)}/5</td>
                      <td className="px-3 py-2">{item.calibrationSamples}</td>
                      <td className="px-3 py-2">{item.calibrationLocked ? "Đã khóa" : item.calibrationStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tree view */}
      <div className="space-y-2">
        {filteredCourses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Không tìm thấy khóa học nào</div>
        ) : (
          filteredCourses.map((course) => (
            <div key={course.id} className="border border-border rounded-lg overflow-hidden dark:border-border">
              <div
                className="flex items-center gap-2 p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleCourse(course.id)}
              >
                {expandedCourses.has(course.id) ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="font-semibold text-foreground dark:text-foreground">{course.title}</span>
              </div>

              {expandedCourses.has(course.id) && (
                <div className="p-2 space-y-2">
                  {getModulesForCourse(course.id).length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      {courseModulesCache.has(course.id) ? "Không có module nào" : "Đang tải..."}
                    </div>
                  ) : (
                    getModulesForCourse(course.id).map((module) => (
                      <div key={module.id} className="border border-border rounded-lg overflow-hidden dark:border-border">
                        <div
                          className="flex items-center gap-2 p-2 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => toggleModule(module.id)}
                        >
                          {expandedModules.has(module.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm text-foreground dark:text-foreground">{module.title}</span>
                        </div>

                        {expandedModules.has(module.id) && (
                          <div className="p-2 space-y-1">
                            {getLessonsForModule(module.id).length === 0 ? (
                              <div className="text-center py-4 text-sm text-muted-foreground">
                                {moduleLessonsCache.has(module.id) ? "Không có bài học nào" : "Đang tải..."}
                              </div>
                            ) : (
                              getLessonsForModule(module.id).map((lesson) => (
                                <div key={lesson.id} className="border border-border rounded-lg overflow-hidden dark:border-border">
                                  <div
                                    className="flex items-center gap-2 p-2 bg-muted/10 cursor-pointer hover:bg-muted/30 transition-colors"
                                    onClick={() => toggleLesson(lesson.id)}
                                  >
                                    {expandedLessons.has(lesson.id) ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                    <span className="text-sm text-foreground dark:text-muted-foreground">{lesson.title}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCreateQuiz(lesson.id);
                                      }}
                                      className="ml-auto"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Tạo quiz
                                    </Button>
                                  </div>

                                  {expandedLessons.has(lesson.id) && (
                                    <div className="p-2 space-y-1">
                                      {getFilteredQuizzes(lesson.id).length === 0 ? (
                                        <div className="text-center py-4 text-xs text-muted-foreground">
                                          {lessonQuizzesCache.has(lesson.id) ? "Chưa có quiz nào" : "Đang tải..."}
                                        </div>
                                      ) : (
                                        getFilteredQuizzes(lesson.id).map((quiz) => (
                                          <div
                                            key={quiz.id}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                                          >
                                            <span className="flex-1 text-sm text-foreground dark:text-muted-foreground">{quiz.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {quiz._count?.questions || 0} câu
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              Pass: {quiz.passScore}%
                                            </span>
                                            <div className="flex items-center gap-1">
                                              <Button size="sm" variant="ghost" onClick={() => handleEditQuiz(quiz.id)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                              <Button size="sm" variant="ghost" onClick={() => handleDelete(quiz.id, quiz.title)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quiz Form Dialog */}
      {quizFormOpen && editingQuiz && (
        <QuizFormDialog
          open={quizFormOpen}
          onClose={() => {
            setQuizFormOpen(false);
            setEditingQuiz(null);
          }}
          quizId={editingQuiz.quizId}
          lessonId={editingQuiz.lessonId}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
