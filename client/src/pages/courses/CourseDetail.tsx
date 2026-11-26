import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, GraduationCap, LineChart, Settings } from "lucide-react";
import api from "../../lib/api";
import { useAuthContext } from "../../contexts/AuthContext";
import { isStructuredCourse, stripCourseMetaMarkers } from "../../lib/courseExperience";
import { isStaff } from "../../lib/roles";
import { getCourseCoverUrl } from "../../lib/courseCovers";
import { ErrorState } from "../../components/ui/StateViews";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { CourseStatusBadge } from "../../components/courses/CourseStatusBadge";

export default function CourseDetail() {
  const { courseId } = useParams();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const isTeacher = isStaff(user?.role);
  const staff = isTeacher;

  const { data: course, isLoading, isError, refetch } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.get(`/courses/${courseId}`).then((r) => r.data),
    enabled: !!courseId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} className="h-10 w-28" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Không tải được khóa học" onRetry={() => refetch()} />;
  }

  if (!course) {
    return <div className="py-8 text-center text-muted-foreground">Không tìm thấy khóa học</div>;
  }

  const basePath = `/courses/${courseId}`;
  const structured = isStructuredCourse(course);
  const coverUrl = getCourseCoverUrl(course);
  const tabs = [
    { label: "Chương trình", path: `${basePath}/curriculum`, icon: GraduationCap },
    { label: "Theo dõi", path: `${basePath}/tracking`, icon: LineChart, staffOnly: true },
  ].filter((tab) => !tab.staffOnly || staff);
  // Structured courses (Python/C++/Thuật toán) historically rendered no tab
  // bar for students — they keep the uninterrupted reading flow.
  const showTabs = structured ? staff : true;

  return (
    <div className="space-y-5">
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate("/courses")}
          className="-ml-2 mb-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            {coverUrl && structured ? (
              <img
                src={coverUrl}
                alt=""
                className="hidden aspect-video w-44 shrink-0 rounded-xl border border-border object-cover sm:block"
              />
            ) : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="min-w-0 text-xl font-semibold leading-tight tracking-tight text-foreground">
                  {course.title}
                </h1>
                <CourseStatusBadge status={course.status} />
              </div>
              {stripCourseMetaMarkers(course.description) ? (
                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
                  {stripCourseMetaMarkers(course.description)}
                </p>
              ) : null}
            </div>
          </div>

          {isTeacher ? (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate(`${basePath}/edit`)}>
                <Settings className="h-3.5 w-3.5" /> Cài đặt
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {showTabs ? <CourseTabs tabs={tabs} basePath={basePath} /> : null}

      <Outlet context={{ course, courseId }} />
    </div>
  );
}

/**
 * Course tab bar — neutral underline style shared by every course kind.
 */
function CourseTabs({
  tabs,
  basePath,
}: {
  tabs: { label: string; path: string; icon: any }[];
  basePath: string;
}) {
  return (
    <div className="flex flex-wrap border-b border-border">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === basePath}
          className={({ isActive }) =>
            `flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-xs font-medium transition-colors sm:text-sm ${
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`
          }
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
