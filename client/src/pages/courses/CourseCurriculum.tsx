import { useOutletContext, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { Plus, BookOpen, Edit, Trash2, ChevronDown, ChevronRight, CheckCircle2, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStaff } from "../../lib/roles";
import { useConfirmContext } from "../../hooks/useConfirm";
import { SkeletonTable } from "../../components/ui/skeletons";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import LessonEditor from "../../components/editor/LessonEditor";
import { isStructuredCourse } from "../../lib/courseExperience";
import AlgorithmCourseCurriculum from "./AlgorithmCourseCurriculum";

export default function CourseCurriculum() {
  const confirm = useConfirmContext();
  const ctx = useOutletContext<{ course: any; courseId: string } | null>();
  const course = ctx?.course;
  const courseId = ctx?.courseId || "";
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isTeacher = isStaff(user?.role);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [editingModule, setEditingModule] = useState<any>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDesc, setModuleDesc] = useState("");
  const [showLessonForm, setShowLessonForm] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [showQuizForm, setShowQuizForm] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<{ question: string; options: string[]; correctIndex: number }[]>([
    { question: "", options: ["", ""], correctIndex: 0 }
  ]);

  const { data: modules, isLoading } = useQuery({
    queryKey: ["course-modules", courseId],
    queryFn: () => api.get(`/courses/${courseId}/modules`).then((r) => r.data || []),
    enabled: !!courseId,
  });

  const moduleIds = (modules || []).map((m: any) => m.id).join(",");

  const { data: allLessons } = useQuery({
    queryKey: ["course-all-lessons", courseId, moduleIds],
    queryFn: async () => {
      if (!modules?.length) return {};
      const results = await Promise.all(
        modules.map((m: any) =>
          api.get(`/modules/${m.id}/lessons`).then((r) => ({ moduleId: m.id, lessons: r.data || [] }))
        )
      );
      const map: Record<string, any[]> = {};
      for (const r of results) map[r.moduleId] = r.lessons;
      return map;
    },
    enabled: !!courseId && (modules?.length || 0) > 0,
  });

  const lessonsMap = allLessons || {};

  const handleSaveModule = async () => {
    if (!moduleTitle) return;
    try {
      if (editingModule) {
        await api.patch(`/modules/${editingModule.id}`, { title: moduleTitle, description: moduleDesc });
      } else {
        await api.post(`/courses/${courseId}/modules`, { title: moduleTitle, description: moduleDesc });
      }
      setShowModuleForm(false);
      setEditingModule(null);
      setModuleTitle("");
      setModuleDesc("");
      qc.invalidateQueries({ queryKey: ["course-modules", courseId] });
      qc.invalidateQueries({ queryKey: ["course-all-lessons", courseId] });
    } catch (err) {}
  };

  const handleDeleteModule = async (id: string) => {
    const ok = await confirm({ title: "Xóa chương", message: "Bạn có chắc muốn xóa chương này?", variant: "danger" });
    if (!ok) return;
    try { await api.delete(`/modules/${id}`); qc.invalidateQueries({ queryKey: ["course-modules", courseId] }); } catch (err) {}
  };

  const handleSaveLesson = async () => {
    if (!lessonTitle || !showLessonForm) return;
    try {
      if (editingLesson) {
        await api.patch(`/lessons/${editingLesson.id}`, { title: lessonTitle, content: lessonContent });
      } else {
        await api.post(`/modules/${showLessonForm}/lessons`, { title: lessonTitle, content: lessonContent });
      }
      setShowLessonForm(null);
      setEditingLesson(null);
      setLessonTitle("");
      setLessonContent("");
      qc.invalidateQueries({ queryKey: ["course-all-lessons", courseId] });
    } catch (err) {}
  };

  const handleDeleteLesson = async (id: string) => {
    const ok = await confirm({ title: "Xóa bài học", message: "Bạn có chắc muốn xóa bài học này?", variant: "danger" });
    if (!ok) return;
    try { await api.delete(`/lessons/${id}`); qc.invalidateQueries({ queryKey: ["course-all-lessons", courseId] }); } catch (err) {}
  };

  const handleSaveQuiz = async () => {
    if (!quizTitle || !showQuizForm) return;
    try {
      await api.post(`/lessons/${showQuizForm}/quizzes`, {
        title: quizTitle,
        questions: quizQuestions.filter(q => q.question.trim() && q.options.some(o => o.trim())),
      });
      setShowQuizForm(null);
      setQuizTitle("");
      setQuizQuestions([{ question: "", options: ["", ""], correctIndex: 0 }]);
      qc.invalidateQueries({ queryKey: ["quizzes", showQuizForm] });
    } catch (err) {}
  };

  if (isLoading) return <div className="bg-card rounded-b-xl border border-border border-t-0"><SkeletonTable rows={5} cols={3} /></div>;
  if (isStructuredCourse(course)) return <AlgorithmCourseCurriculum course={course} courseId={courseId} />;

  if (!modules || modules.length === 0) {
    return (
      <div className="bg-card rounded-b-xl border border-border border-t-0">
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium dark:text-muted-foreground">Chưa có chương trình học</p>
          <p className="text-sm text-muted-foreground mt-1 dark:text-muted-foreground">Xây dựng chương trình với các chương và bài học.</p>
          {isTeacher && (
            <Button
              onClick={() => { setShowModuleForm(true); setEditingModule(null); setModuleTitle(""); setModuleDesc(""); }}
              className="mt-4"
            >
              <Plus className="w-4 h-4" /> Thêm chương đầu tiên
            </Button>
          )}
        </div>
        {showModuleForm && (
          <div className="p-4 border-t border-border bg-muted/40 space-y-3 dark:border-border dark:bg-muted/40">
            <input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="Tên chương" className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring/30 dark:border-border" />
            <textarea value={moduleDesc} onChange={(e) => setModuleDesc(e.target.value)} placeholder="Mô tả (không bắt buộc)" rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none resize-none dark:border-border" />
            <div className="flex gap-2">
              <Button onClick={handleSaveModule} size="xs">{editingModule ? "Cập nhật" : "Lưu"}</Button>
              <Button onClick={() => { setShowModuleForm(false); setEditingModule(null); }} variant="outline" size="xs">Hủy</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-b-xl border border-border border-t-0">
      {isTeacher && (
        <div className="p-4 border-b border-border flex gap-2 dark:border-border">
          <Button
            onClick={() => { setShowModuleForm(true); setEditingModule(null); setModuleTitle(""); setModuleDesc(""); }}
            size="xs"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm chương
          </Button>
        </div>
      )}

      {showModuleForm && (
        <div className="p-4 border-b border-border bg-muted/40 space-y-3 dark:border-border dark:bg-muted/40">
          <Input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="Tên chương" />
          <textarea value={moduleDesc} onChange={(e) => setModuleDesc(e.target.value)} placeholder="Mô tả (không bắt buộc)" rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none resize-none dark:border-border" />
          <div className="flex gap-2">
            <Button onClick={handleSaveModule} size="xs">{editingModule ? "Cập nhật" : "Lưu"}</Button>
            <Button onClick={() => { setShowModuleForm(false); setEditingModule(null); }} variant="outline" size="xs">Hủy</Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {modules.map((mod: any, idx: number) => {
          const modId = mod.id;
          const lessons = lessonsMap[modId] || [];

          return (
            <div key={modId} className="group overflow-hidden">
              <button type="button" className="flex w-full items-center px-4 py-3 hover:bg-muted cursor-pointer" onClick={() => setExpanded(prev => ({ ...prev, [modId]: !prev[modId] }))}>
                <Button variant="ghost" size="icon-sm" className="mr-2 text-muted-foreground">{expanded[modId] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</Button>
                <span className="text-xs font-semibold text-muted-foreground mr-2 dark:text-muted-foreground">Chương {idx + 1}</span>
                <span className="text-sm font-medium text-foreground flex-1 dark:text-foreground">{mod.title}</span>
                <span className="text-xs text-muted-foreground mr-3 dark:text-muted-foreground">{lessons.length} bài học</span>
                {isTeacher && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button onClick={(e) => { e.stopPropagation(); setEditingModule(mod); setModuleTitle(mod.title); setModuleDesc(mod.description || ""); setShowModuleForm(true); }} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary dark:text-muted-foreground"><Edit className="w-3.5 h-3.5" /></Button>
                    <Button onClick={(e) => { e.stopPropagation(); handleDeleteModule(modId); }} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-red-500 dark:text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
              </button>

              <div className={`grid transition-all duration-200 ease-out ${expanded[modId] ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="bg-muted/40 pl-10 dark:bg-muted/40">
                  {lessons.map((lesson: any, li: number) => (
                    <div key={lesson.id} className="flex items-center px-4 py-2.5 hover:bg-muted group/lesson border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground mr-2 dark:text-muted-foreground">{idx + 1}.{li + 1}</span>
                      {lesson.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mr-1.5 flex-shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-border mr-1.5 flex-shrink-0 dark:border-border" />
                      )}
                      <Button
                        onClick={() => navigate(`/lessons/${lesson.id}`)}
                        variant="ghost"
                        className="flex-1 text-left justify-start text-foreground/90 hover:text-primary dark:text-muted-foreground"
                      >
                        {lesson.title}
                      </Button>
                      {lesson.estimatedDuration && <span className="text-xs text-muted-foreground mr-3 dark:text-muted-foreground">{lesson.estimatedDuration}p</span>}
                      {isTeacher && (
                        <div className="flex gap-1 opacity-0 group-hover/lesson:opacity-100 transition-opacity">
                          <Button onClick={() => { setEditingLesson(lesson); setLessonTitle(lesson.title); setLessonContent(lesson.content || ""); setShowLessonForm(modId); }} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary dark:text-muted-foreground"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button onClick={() => handleDeleteLesson(lesson.id)} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-red-500 dark:text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></Button>
                          <Button onClick={(e) => { e.stopPropagation(); setShowQuizForm(lesson.id); setQuizTitle(""); setQuizQuestions([{ question: "", options: ["", ""], correctIndex: 0 }]); }} variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary dark:text-muted-foreground" title="Tạo quiz"><HelpCircle className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {isTeacher && (
                    <div className="px-4 pb-3">
                      {showLessonForm === modId ? (
                        <div className="space-y-2 pt-2">
                          <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Tên bài học" className="text-xs" />
                          <LessonEditor
                            initialHtml={lessonContent}
                            onSave={(html) => {
                              setLessonContent(html);
                              // Save immediately
                              const saveFn = editingLesson
                                ? () => api.patch(`/lessons/${editingLesson.id}`, { title: lessonTitle, content: html })
                                : () => api.post(`/modules/${showLessonForm}/lessons`, { title: lessonTitle, content: html });
                              saveFn().then(() => {
                                setShowLessonForm(null);
                                setEditingLesson(null);
                                setLessonTitle("");
                                setLessonContent("");
                                qc.invalidateQueries({ queryKey: ["course-all-lessons", courseId] });
                              }).catch(() => {});
                            }}
                            onCancel={() => { setShowLessonForm(null); setEditingLesson(null); }}
                          />
                        </div>
                      ) : (
                        <Button onClick={() => { setEditingLesson(null); setLessonTitle(""); setLessonContent(""); setShowLessonForm(modId); }} variant="ghost" size="xs" className="text-primary hover:text-primary">
                          <Plus className="w-3 h-3" /> Thêm bài học
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Quiz creation form */}
                  {isTeacher && showQuizForm === modId && (
                    <div className="px-4 pb-4">
                      <div className="border border-primary/20 rounded-lg p-4 bg-primary/10 space-y-3">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">Tạo quiz cho "{lessons.find((l: any) => l.id === showQuizForm)?.title || 'bài học'}"</span>
                        </div>
                        <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Tên quiz (VD: Kiểm tra kiến thức vòng lặp)" className="text-xs" />
                        <div className="space-y-3">
                          {quizQuestions.map((q, qi) => (
                            <div key={qi} className="bg-card border border-border rounded-lg p-3 space-y-2 dark:bg-card dark:border-border">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground/90">Câu {qi + 1}</span>
                                {quizQuestions.length > 1 && (
                                  <button type="button" onClick={() => setQuizQuestions(quizQuestions.filter((_, j) => j !== qi))} className="text-xs text-red-500 hover:text-red-700 dark:text-red-400">Xóa</button>
                                )}
                              </div>
                              <input value={q.question} onChange={(e) => { const n = [...quizQuestions]; n[qi].question = e.target.value; setQuizQuestions(n); }} placeholder="Câu hỏi..." className="w-full px-3 py-1.5 border border-border rounded text-xs outline-none dark:border-border" />
                              <div className="space-y-1">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className="flex items-center gap-2">
                                    <input type="radio" name={`correct-${qi}`} checked={q.correctIndex === oi} onChange={() => { const n = [...quizQuestions]; n[qi].correctIndex = oi; setQuizQuestions(n); }} className="w-3 h-3" />
                                    <input value={opt} onChange={(e) => { const n = [...quizQuestions]; n[qi].options[oi] = e.target.value; setQuizQuestions(n); }} placeholder={`Đáp án ${String.fromCharCode(65 + oi)}${q.correctIndex === oi ? ' (đúng)' : ''}`} className="flex-1 px-2 py-1 border border-border rounded text-xs outline-none dark:border-border" />
                                  </div>
                                ))}
                              </div>
                              {q.options.length < 4 && (
                                <button type="button" onClick={() => { const n = [...quizQuestions]; n[qi].options.push(""); setQuizQuestions(n); }} className="text-xs text-primary">+ Thêm đáp án</button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 items-center">
                          <button type="button" onClick={() => setQuizQuestions([...quizQuestions, { question: "", options: ["", ""], correctIndex: 0 }])} className="text-xs text-primary hover:text-primary">+ Thêm câu hỏi</button>
                          <div className="flex-1" />
                          <button onClick={handleSaveQuiz} className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:bg-primary">Lưu quiz</button>
                          <button onClick={() => setShowQuizForm(null)} className="px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-muted dark:border-border">Hủy</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
