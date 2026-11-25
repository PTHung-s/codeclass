import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Search } from "lucide-react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { useConfirmContext } from "../../hooks/useConfirm";
import LessonFormDialog from "./LessonFormDialog";

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
  status: string;
  orderIndex: number;
  estimatedDuration?: number;
}

export default function LessonManagerTab() {
  const confirm = useConfirmContext();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [courseModulesCache, setCourseModulesCache] = useState<Map<string, Module[]>>(new Map());
  const [moduleLessonsCache, setModuleLessonsCache] = useState<Map<string, Lesson[]>>(new Map());
  const [lessonFormOpen, setLessonFormOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<{ lessonId?: string; moduleId?: string } | null>(null);

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

  const deleteLesson = useMutation({
    mutationFn: (lessonId: string) => api.delete(`/lessons/${lessonId}`),
    onSuccess: () => {
      setModuleLessonsCache(new Map());
    },
  });

  const handleDelete = async (lessonId: string, lessonTitle: string) => {
    const confirmed = await confirm({
      title: "Xóa bài học",
      message: `Bạn có chắc muốn xóa bài học "${lessonTitle}"? Bài học sẽ được archive.`,
      confirmLabel: "Xóa",
      cancelLabel: "Hủy",
      variant: "danger",
    });
    if (confirmed) {
      deleteLesson.mutate(lessonId);
    }
  };

  const handleCreateLesson = (moduleId: string) => {
    setEditingLesson({ moduleId });
    setLessonFormOpen(true);
  };

  const handleEditLesson = (lessonId: string) => {
    setEditingLesson({ lessonId });
    setLessonFormOpen(true);
  };

  const handleFormSuccess = () => {
    setLessonFormOpen(false);
    setEditingLesson(null);
    setModuleLessonsCache(new Map());
  };

  // Filter logic
  const filteredCourses = courses.filter((course) => {
    if (selectedCourse && course.id !== selectedCourse) return false;
    if (searchTerm && !course.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const getModulesForCourse = (courseId: string): Module[] => {
    return courseModulesCache.get(courseId) || [];
  };

  const getFilteredLessons = (moduleId: string): Lesson[] => {
    const lessons = moduleLessonsCache.get(moduleId) || [];
    return lessons.filter((lesson) => {
      if (statusFilter && lesson.status !== statusFilter) return false;
      if (searchTerm && !lesson.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted text-foreground dark:bg-card dark:text-muted-foreground",
      published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      archived: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.draft}`}>
        {status}
      </span>
    );
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
            placeholder="Tìm kiếm bài học..."
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm outline-none dark:bg-card"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateLesson(module.id);
                            }}
                            className="ml-auto"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Tạo bài học
                          </Button>
                        </div>

                        {expandedModules.has(module.id) && (
                          <div className="p-2 space-y-1">
                            {getFilteredLessons(module.id).length === 0 ? (
                              <div className="text-center py-6 text-sm text-muted-foreground">
                                {moduleLessonsCache.has(module.id) ? "Chưa có bài học nào" : "Đang tải..."}
                              </div>
                            ) : (
                              getFilteredLessons(module.id).map((lesson) => (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                                >
                                  <span className="flex-1 text-sm text-foreground dark:text-muted-foreground">{lesson.title}</span>
                                  {getStatusBadge(lesson.status)}
                                  {lesson.estimatedDuration && (
                                    <span className="text-xs text-muted-foreground">{lesson.estimatedDuration} phút</span>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => handleEditLesson(lesson.id)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(lesson.id, lesson.title)}>
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

      {/* Lesson Form Dialog */}
      {lessonFormOpen && editingLesson && (
        <LessonFormDialog
          open={lessonFormOpen}
          onClose={() => {
            setLessonFormOpen(false);
            setEditingLesson(null);
          }}
          lessonId={editingLesson.lessonId}
          moduleId={editingLesson.moduleId}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
