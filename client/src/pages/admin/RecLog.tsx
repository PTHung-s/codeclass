import { useState, useEffect } from "react";
import api from "../../lib/api";
import type { RecLogEntry } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { FileText, BarChart3 } from "lucide-react";
import { cn } from "../../lib/utils";

export default function RecLogPage() {
  const [logs, setLogs] = useState<RecLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/skills/admin/rec-logs?limit=100")
      .then((r) => setLogs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: logs.length,
    avgConfidence: logs.length
      ? Math.round(logs.reduce((s, l) => s + l.confidence, 0) / logs.length * 100)
      : 0,
    topRule: (() => {
      const counts: Record<string, number> = {};
      logs.forEach((l) => { counts[l.ruleId] = (counts[l.ruleId] || 0) + 1; });
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    })(),
  };

  const RULE_COLORS: Record<string, string> = {
    R1: "bg-blue-100 text-blue-700", R2: "bg-cyan-100 text-cyan-700",
    R3: "bg-blue-100 text-blue-700", R7: "bg-amber-100 text-amber-700",
    R8: "bg-red-100 text-red-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Recommendation Log
        </h1>
        <p className="text-sm text-muted-foreground">Lịch sử tất cả recommendations được tạo</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-black">{stats.total}</p><p className="text-xs text-muted-foreground">Tổng recommendations</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-black">{stats.avgConfidence}%</p><p className="text-xs text-muted-foreground">Độ tin cậy TB</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="flex items-center justify-center gap-1"><BarChart3 className="h-4 w-4 text-blue-500" /><span className="text-2xl font-black">{stats.topRule}</span></div><p className="text-xs text-muted-foreground">Rule phổ biến nhất</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2">Thời gian</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-3 py-2">Skill</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{l.userId.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <Badge className={cn("text-[10px]", RULE_COLORS[l.ruleId] || "")}>{l.ruleId}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.skillId}</td>
                    <td className="px-3 py-2">
                      <Badge variant={l.action === "created" ? "default" : l.action === "completed" ? "secondary" : "outline"} className="text-[10px]">{l.action}</Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{Math.round(l.confidence * 100)}%</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{l.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
