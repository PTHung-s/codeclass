import { useState, useEffect } from "react";
import api from "../../lib/api";
import type { EngineConfig } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Settings, Zap, Save, RefreshCw, Database } from "lucide-react";

interface CalibrationRow {
  skillId: string;
  pL0: number;
  pT: number;
  pSlip: number;
  pGuess: number;
  sampleSize: number;
  totalEvents: number;
  converged: boolean;
  iterations: number;
}

export default function EngineConfigPage() {
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<string>("bkt");
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [msg, setMsg] = useState("");

  // Calibration state
  const [calibrating, setCalibrating] = useState(false);
  const [calibrations, setCalibrations] = useState<CalibrationRow[] | null>(null);
  const [calibMsg, setCalibMsg] = useState("");

  useEffect(() => {
    api.get("/skills/admin/engine")
      .then((r) => {
        setConfig(r.data);
        setSelectedEngine(r.data.activeEngine);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await api.post("/skills/admin/engine", { engine: selectedEngine });
      const count = res.data?.recalculatedStudents;
      setMsg(
        Number.isFinite(count)
          ? `Đã lưu cấu hình engine (${selectedEngine.toUpperCase()}) và tính lại mastery cho ${count} học sinh.`
          : "Đã lưu cấu hình engine.",
      );
    } catch {
      setMsg("Lỗi khi lưu.");
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    setMsg("Đang tính lại mastery cho toàn bộ học sinh...");
    try {
      const res = await api.post("/skills/admin/recalculate-all");
      setMsg(`Đã tính lại mastery cho ${res.data?.updated ?? 0}/${res.data?.totalStudents ?? 0} học sinh.`);
    } catch (e: any) {
      setMsg(`Lỗi: ${e?.response?.data?.error || e.message}`);
    } finally {
      setRecalculating(false);
    }
  };

  const handleCalibrate = async () => {
    setCalibrating(true);
    setCalibMsg("Đang chạy calibrate (quét dữ liệu từ SkillEvidence + EM)...");
    setCalibrations(null);
    try {
      const res = await api.post("/skills/admin/calibrate", { maxIterations: 100, minSequences: 2 });
      const rows = res.data?.skills;
      const recalcCount = res.data?.recalculatedStudents;
      if (Array.isArray(rows)) {
        setCalibrations(rows);
        const done = rows.filter((r: CalibrationRow) => r.sampleSize >= 2 && r.converged);
        const low = rows.filter((r: CalibrationRow) => r.sampleSize < 2);
        const recalcNote = Number.isFinite(recalcCount) && recalcCount > 0
          ? ` Đã đồng bộ lại mastery cho ${recalcCount} học sinh.`
          : "";
        setCalibMsg(
          `Hoàn tất: ${done.length} skill đã calibrate (≥2 chuỗi), ${low.length} skill chưa đủ dữ liệu.${recalcNote}`,
        );
      } else {
        setCalibMsg("Chạy xong, nhưng không có dữ liệu trả về.");
      }
    } catch (e: any) {
      setCalibMsg(`Lỗi: ${e?.response?.data?.error || e.message}`);
    } finally {
      setCalibrating(false);
    }
  };

  const handleFetchCalibrations = async () => {
    try {
      const res = await api.get("/skills/admin/calibrate");
      const rows = res.data?.calibrations;
      if (Array.isArray(rows) && rows.length > 0) {
        setCalibrations(rows);
        setCalibMsg(`Đã tải ${rows.length} bản calibrate từ DB.`);
      } else {
        setCalibMsg("Chưa có calibrate nào trong DB. Bấm \"Chạy calibrate\" để tạo.");
      }
    } catch (e: any) {
      setCalibMsg(`Lỗi: ${e?.response?.data?.error || e.message}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <Settings className="h-6 w-6" /> Cấu hình Mastery Engine
        </h1>
        <p className="text-sm text-muted-foreground">Chọn engine tính mastery cho skill assessment</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className={`cursor-pointer border-2 transition-colors ${selectedEngine === "bkt" ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "opacity-80 hover:opacity-100"}`}
          onClick={() => setSelectedEngine("bkt")}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">BKT-IRT + Memory Decay</h3>
              <Badge variant="default" className="text-[10px]">Khuyến nghị · Mặc định</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Phân biệt loại bài (Code / Thi / Trắc nghiệm), độ khó IRT, mức độ gợi ý, chống đoán mò, đường cong quên
              và đồ thị kỹ năng tiên quyết.
            </p>
            <div className="flex items-center gap-1 text-xs">
              <Zap className="h-3 w-3 text-blue-500" />
              <span className="text-blue-600 font-medium dark:text-blue-400">Chính xác nhất cho lớp học</span>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer border-2 transition-colors ${selectedEngine === "ewma" ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "opacity-80 hover:opacity-100"}`}
          onClick={() => setSelectedEngine("ewma")}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">EWMA (Chuẩn hóa)</h3>
              <Badge variant="secondary" className="text-[10px]">Cơ bản</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Tín hiệu gắn theo tỷ lệ đúng (sai 0% không cộng điểm) kết hợp tốc độ, số lần thử, gợi ý và suy giảm trí nhớ 0.7×cũ + 0.3×mới.
            </p>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground font-medium">Đơn giản, không cần calibrate</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Calibration section ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-bold">BKT Calibration (fit tham số từ dữ liệu thật)</h3>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleFetchCalibrations} disabled={calibrating}>
                Xem kết quả
              </Button>
              <Button size="sm" onClick={handleCalibrate} disabled={calibrating} className="gap-1">
                <RefreshCw className={`h-4 w-4 ${calibrating ? "animate-spin" : ""}`} />
                {calibrating ? "Đang chạy..." : "Chạy calibrate"}
              </Button>
            </div>
          </div>
          {calibMsg && <p className="text-xs text-muted-foreground">{calibMsg}</p>}

          {calibrations && calibrations.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-2 py-1.5 text-left font-semibold">Skill</th>
                    <th className="px-2 py-1.5 text-right font-semibold">pL0</th>
                    <th className="px-2 py-1.5 text-right font-semibold">pT</th>
                    <th className="px-2 py-1.5 text-right font-semibold">pSlip</th>
                    <th className="px-2 py-1.5 text-right font-semibold">pGuess</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Seq</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Obs</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Hội tụ</th>
                  </tr>
                </thead>
                <tbody>
                  {calibrations.map((c) => (
                    <tr key={c.skillId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-2 py-1.5 font-mono text-[10px]">{c.skillId}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.pL0.toFixed(3)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.pT.toFixed(3)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.pSlip.toFixed(3)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.pGuess.toFixed(3)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.sampleSize}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{c.totalEvents}</td>
                      <td className="px-2 py-1.5 text-center">
                        {c.sampleSize < 2 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : c.converged ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-amber-600">⚠</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={saving || recalculating} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Đang lưu & tính lại..." : "Lưu cấu hình"}
        </Button>
        <Button
          variant="outline"
          onClick={handleRecalculateAll}
          disabled={recalculating || saving}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
          {recalculating ? "Đang tính lại..." : "Tính lại mastery toàn lớp"}
        </Button>
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {config?.bktParams && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-bold mb-2">BKT Params hiện tại (per-skill)</h3>
            <pre className="text-[11px] bg-muted rounded p-3 overflow-x-auto">
              {JSON.stringify(config.bktParams, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
