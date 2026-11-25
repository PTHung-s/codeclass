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
  const [selectedEngine, setSelectedEngine] = useState<string>("ewma");
  const [saving, setSaving] = useState(false);
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
    try {
      await api.post("/skills/admin/engine", { engine: selectedEngine });
      setMsg("Đã lưu cấu hình engine.");
    } catch {
      setMsg("Lỗi khi lưu.");
    } finally {
      setSaving(false);
    }
  };

  const handleCalibrate = async () => {
    setCalibrating(true);
    setCalibMsg("Đang chạy calibrate (quét dữ liệu + EM)...");
    setCalibrations(null);
    try {
      const res = await api.post("/skills/admin/calibrate", { maxIterations: 100, minSequences: 2 });
      const rows = res.data?.skills;
      if (Array.isArray(rows)) {
        setCalibrations(rows);
        const done = rows.filter((r: CalibrationRow) => r.sampleSize >= 2 && r.converged);
        const low = rows.filter((r: CalibrationRow) => r.sampleSize < 2);
        setCalibMsg(
          `✅ Hoàn tất: ${done.length} skill đã calibrate (có ≥2 sequence), ${low.length} skill chưa đủ dữ liệu.`,
        );
      } else {
        setCalibMsg("✅ Chạy xong, nhưng không có dữ liệu trả về.");
      }
    } catch (e: any) {
      setCalibMsg(`❌ Lỗi: ${e?.response?.data?.error || e.message}`);
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
          className={`cursor-pointer border-2 transition-colors ${selectedEngine === "ewma" ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
          onClick={() => setSelectedEngine("ewma")}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">EWMA</h3>
              <Badge variant="secondary" className="text-[10px]">Mặc định</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Tín hiệu 0.4×đúng + 0.2×số lần thử + 0.2×thời gian + 0.2×gợi ý, làm mượt EWMA 0.7×cũ + 0.3×mới.
              Giải thích được từng số, không cần calibrate.
            </p>
            <div className="flex items-center gap-1 text-xs">
              <Zap className="h-3 w-3 text-blue-500" />
              <span className="text-blue-600 font-medium">Production-ready</span>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer border-2 transition-colors ${selectedEngine === "bkt" ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20" : "opacity-70"}`}
          onClick={() => setSelectedEngine("bkt")}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">BKT</h3>
              <Badge variant="outline" className="text-[10px] text-amber-600">Thử nghiệm</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Bayesian Knowledge Tracing: P(L0)×P(T)×P(slip)×P(guess). Cần calibrate riêng cho từng skill khi có
              đủ dữ liệu (≥5 sequences/skill).
            </p>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-amber-600 font-medium">⚠ Cần dữ liệu pilot để calibrate</span>
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

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Đang lưu..." : "Lưu cấu hình"}
      </Button>

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
