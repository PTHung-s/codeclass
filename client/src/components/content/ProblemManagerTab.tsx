import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { useConfirmContext } from "../../hooks/useConfirm";

interface Problem {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  status: string;
  tags: string[];
  createdAt: string;
}

export default function ProblemManagerTab() {
  const confirm = useConfirmContext();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Fetch problems
  const { data: problems = [], isLoading } = useQuery<Problem[]>({
    queryKey: ["problems-admin"],
    queryFn: () => api.get("/problems").then((r) => r.data),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (problemId: string) => api.delete(`/problems/${problemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["problems-admin"] });
    },
  });

  const handleDelete = async (problemId: string, problemTitle: string) => {
    const confirmed = await confirm({
      title: "Xóa đề code",
      message: `Bạn có chắc muốn xóa đề "${problemTitle}"? Đề sẽ được archive.`,
      confirmLabel: "Xóa",
      cancelLabel: "Hủy",
      variant: "danger",
    });
    if (confirmed) {
      deleteMutation.mutate(problemId);
    }
  };

  // Filter logic
  const filteredProblems = problems.filter((p) => {
    if (searchTerm && !p.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (difficultyFilter && p.difficulty !== difficultyFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const getDifficultyBadge = (difficulty: string) => {
    const colors: Record<string, string> = {
      easy: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
      hard: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[difficulty] || colors.medium}`}>
        {difficulty}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted text-foreground dark:bg-card dark:text-muted-foreground",
      published: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      archived: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.draft}`}>
        {status}
      </span>
    );
  };

  if (isLoading) {
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
            placeholder="Tìm kiếm đề code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none dark:bg-card"
          />
        </div>
        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm outline-none dark:bg-card"
        >
          <option value="">Tất cả độ khó</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
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
        <Link to="/problems/new">
          <Button>
            <Plus className="h-4 w-4 mr-1" />
            Tạo đề code mới
          </Button>
        </Link>
      </div>

      {/* Table */}
      {filteredProblems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {searchTerm || difficultyFilter || statusFilter ? "Không tìm thấy đề code nào" : "Chưa có đề code nào"}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden dark:border-border">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground dark:text-muted-foreground">Tiêu đề</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground dark:text-muted-foreground">Độ khó</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground dark:text-muted-foreground">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground dark:text-muted-foreground">Tags</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-foreground dark:text-muted-foreground">Ngày tạo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-foreground dark:text-muted-foreground">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProblems.map((problem) => (
                <tr key={problem.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/problems/${problem.id}`}
                      className="text-sm font-medium text-primary hover:text-primary dark:text-primary dark:hover:text-primary"
                    >
                      {problem.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{getDifficultyBadge(problem.difficulty)}</td>
                  <td className="px-4 py-3">{getStatusBadge(problem.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {problem.tags?.slice(0, 3).map((t: any, i) => {
                        const label = typeof t === "string" ? t : t?.tag;
                        return (
                          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground">
                            {label}
                          </span>
                        );
                      })}
                      {problem.tags?.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{problem.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(problem.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/problems/${problem.id}`}>
                        <Button size="sm" variant="ghost" title="Xem">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Link to={`/problems/${problem.id}/edit`}>
                        <Button size="sm" variant="ghost" title="Sửa">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(problem.id, problem.title)}
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
