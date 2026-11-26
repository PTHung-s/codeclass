import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import api from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ArrowLeft, AlertCircle, Database, FileJson, Plus, Sparkles, Trash2, Upload, ArrowUp, ArrowDown } from "lucide-react";
import { nextUid, type BuilderQuestion } from "./builder/types";
import { QuestionSourcePickerDialog } from "./builder/QuestionSourcePickerDialog";
import { AiExamGenerateDialog } from "./builder/AiExamGenerateDialog";

const TEMPLATE_HINT = `{
  "phien_ban": "1.0",
  "de_thi": { "tieu_de": "...", "thoi_gian_phut": 60, "ngon_ngu_code": ["python","cpp"] },
  "cau_hoi": [ ... ]
}`;

export default function ExamImport() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<"builder" | "json">("builder");

  // JSON tab state
  const [text, setText] = useState("");
  const [courseId, setCourseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  // Visual builder state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [scale, setScale] = useState(10);
  const [antiCheatMode, setAntiCheatMode] = useState<"nghiem" | "ghi_log">("nghiem");
  const [showResults, setShowResults] = useState(true);
  const [questions, setQuestions] = useState<BuilderQuestion[]>([
    {
      uid: nextUid(),
      loai: "trac_nghiem",
      ma_cau: "C01",
      diem: 2,
      do_kho: 2,
      stem: "",
      lua_chon: ["", "", "", ""],
      dap_an_index: 0,
    },
  ]);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const coursesQ = useQuery({
    queryKey: ["courses-for-exam"],
    queryFn: () => api.get("/courses", { params: { status: "current" } }).then((r) => (Array.isArray(r.data) ? r.data : r.data?.courses || [])),
  });

  const importMut = useMutation({
    mutationFn: async (documentPayload: unknown) => {
      const body: Record<string, unknown> = { document: documentPayload };
      if (courseId) body.courseId = courseId;
      return api.post("/exams/import-json", body).then((r) => r.data);
    },
    onSuccess: (data) => {
      toast.success({ title: "Đã tạo đề thi" });
      navigate(`/exams/${data.id}/edit`);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || "Tạo đề thất bại");
      setDetails(err?.response?.data?.details || []);
    },
  });

  const onFile = async (file: File | null) => {
    if (!file) return;
    const t = await file.text();
    setText(t);
    setError(null);
    setDetails([]);
  };

  const loadSample = async () => {
    try {
      const res = await fetch("/docs-exam-sample.json").catch(() => null);
      if (res && res.ok) {
        setText(await res.text());
        return;
      }
    } catch { /* ignore */ }
    setText(
      JSON.stringify(
        {
          phien_ban: "1.0",
          de_thi: {
            tieu_de: "Đề mẫu nhanh",
            mo_ta: "Upload từ UI — nên dùng docs/exam/mau-de-thi.json",
            thoi_gian_phut: 45,
            thang_diem: 100,
            che_do_chat: "nghiem",
            cho_xem_ket_qua: false,
            ngon_ngu_code: ["python", "cpp"],
          },
          cau_hoi: [
            {
              ma_cau: "C01",
              loai: "trac_nghiem",
              do_kho: 1,
              diem: 10,
              stem: "2 + 2 = ?",
              lua_chon: ["3", "4", "5", "22"],
              dap_an_index: 1,
            },
            {
              ma_cau: "C02",
              loai: "tra_loi_ngan",
              do_kho: 2,
              diem: 10,
              stem: "Lệnh in trong Python?",
              dap_an: ["print", "print()"],
              huong_dan_cham: "Chấp nhận print hoặc print()",
            },
            {
              ma_cau: "C03",
              loai: "thuc_hanh",
              do_kho: 3,
              diem: 30,
              stem: "Nhập a b, in a+b",
              ngon_ngu: "python",
              code_dap_an: "a,b=map(int,input().split())\nprint(a+b)\n",
              rang_buoc: "1 <= a,b <= 1000",
              testcase_mau: [{ input: "1 2\n", output: "3\n" }],
              sinh_testcase: { so_luong: 5, chien_luoc: "de_den_max_constraints" },
            },
          ],
        },
        null,
        2,
      ),
    );
  };

  const addQuestion = (loai: BuilderQuestion["loai"]) => {
    const code = `C${String(questions.length + 1).padStart(2, "0")}`;
    if (loai === "trac_nghiem") {
      setQuestions((prev) => [
        ...prev,
        { uid: nextUid(), loai: "trac_nghiem", ma_cau: code, diem: 1, do_kho: 2, stem: "", lua_chon: ["", "", "", ""], dap_an_index: 0 },
      ]);
    } else if (loai === "tra_loi_ngan") {
      setQuestions((prev) => [
        ...prev,
        { uid: nextUid(), loai: "tra_loi_ngan", ma_cau: code, diem: 2, do_kho: 2, stem: "", dap_an_text: "" },
      ]);
    } else {
      setQuestions((prev) => [
        ...prev,
        {
          uid: nextUid(),
          loai: "thuc_hanh",
          ma_cau: code,
          diem: 3,
          do_kho: 3,
          stem: "",
          ngon_ngu: "python",
          code_dap_an: "# Code lời giải mẫu\n",
          sample_input: "1 2\n",
          sample_output: "3\n",
        },
      ]);
    }
  };

  const updateQuestion = (uid: string, patch: Partial<BuilderQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.uid === uid ? ({ ...q, ...patch } as BuilderQuestion) : q)));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const submitBuilder = () => {
    setError(null);
    setDetails([]);
    if (!title.trim()) {
      setError("Vui lòng nhập tiêu đề đề thi");
      return;
    }
    if (!questions.length) {
      setError("Cần ít nhất 1 câu hỏi");
      return;
    }

    const doc = {
      phien_ban: "1.0",
      de_thi: {
        tieu_de: title.trim(),
        mo_ta: description.trim() || undefined,
        thoi_gian_phut: Math.max(1, Number(durationMinutes) || 45),
        thang_diem: Math.max(1, Number(scale) || 10),
        che_do_chat: antiCheatMode,
        cho_xem_ket_qua: showResults,
        ngon_ngu_code: ["python", "cpp"],
      },
      cau_hoi: questions.map((q, idx) => {
        const ma_cau = q.ma_cau.trim() || `C${String(idx + 1).padStart(2, "0")}`;
        if (q.loai === "trac_nghiem") {
          return {
            ma_cau,
            loai: "trac_nghiem",
            do_kho: q.do_kho,
            diem: q.diem,
            stem: q.stem.trim(),
            lua_chon: q.lua_chon.map((x) => x.trim()).filter(Boolean),
            dap_an_index: q.dap_an_index,
            giai_thich: q.giai_thich?.trim() || undefined,
            ky_nang: q.ky_nang,
          };
        }
        if (q.loai === "tra_loi_ngan") {
          return {
            ma_cau,
            loai: "tra_loi_ngan",
            do_kho: q.do_kho,
            diem: q.diem,
            stem: q.stem.trim(),
            dap_an: q.dap_an_text
              .split(/\n|;/)
              .map((s) => s.trim())
              .filter(Boolean),
            huong_dan_cham: q.huong_dan_cham?.trim() || undefined,
            ky_nang: q.ky_nang,
          };
        }
        return {
          ma_cau,
          loai: "thuc_hanh",
          do_kho: q.do_kho,
          diem: q.diem,
          stem: q.stem.trim(),
          ngon_ngu: q.ngon_ngu,
          code_dap_an: q.code_dap_an,
          rang_buoc: q.rang_buoc?.trim() || undefined,
          testcase_mau: [{ input: q.sample_input, output: q.sample_output }],
          ky_nang: q.ky_nang,
        };
      }),
    };

    importMut.mutate(doc);
  };

  const submitJson = () => {
    setError(null);
    setDetails([]);
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      setError("JSON không parse được");
      return;
    }
    importMut.mutate(document);
  };

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/exams")}>
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tạo đề thi mới</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Soạn đề trực tiếp (hỗ trợ AI tạo đề, nhặt từ Thư viện &amp; Quiz Bank) hoặc nhập hàng loạt từ JSON.
            </p>
          </div>
          <div className="inline-flex h-8 rounded-lg border border-border bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setTab("builder")}
              className={`rounded-md px-3 text-xs font-medium transition-colors ${
                tab === "builder" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tạo đề trực tiếp
            </button>
            <button
              type="button"
              onClick={() => setTab("json")}
              className={`rounded-md px-3 text-xs font-medium transition-colors ${
                tab === "json" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Nhập từ JSON
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Gán khóa học (tùy chọn)</label>
            <select
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">— Không gắn / mở cho toàn bộ học sinh —</option>
              {(coursesQ.data || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {tab === "builder" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Tiêu đề đề thi</label>
                  <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Kiểm tra giữa kỳ Python" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Mô tả ngắn (không bắt buộc)</label>
                  <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Phạm vi kiến thức hoặc hướng dẫn làm bài..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Thời gian (phút)</label>
                  <Input type="number" min={1} max={1440} className="mt-1" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Thang điểm</label>
                  <Input type="number" min={1} max={1000} className="mt-1" value={scale} onChange={(e) => setScale(Number(e.target.value) || 10)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Chế độ chống gian lận</label>
                  <select
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
                    value={antiCheatMode}
                    onChange={(e) => setAntiCheatMode(e.target.value === "ghi_log" ? "ghi_log" : "nghiem")}
                  >
                    <option value="nghiem">Nghiêm ngặt (Fullscreen + 5 tim)</option>
                    <option value="ghi_log">Nhẹ (Chỉ ghi log chuyển tab)</option>
                  </select>
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} className="accent-primary" />
                    <span>Cho học sinh xem điểm/đáp án sau khi chấm</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Danh sách câu hỏi ({questions.length})</h2>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="border-primary/40 text-primary hover:bg-primary/5"
                  onClick={() => setAiDialogOpen(true)}
                >
                  <Sparkles className="mr-1 size-3.5" /> AI tạo đề / câu hỏi
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => setBankPickerOpen(true)}>
                  <Database className="mr-1 size-3.5 text-primary" /> Nhặt từ Thư viện / Quiz Bank
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => addQuestion("trac_nghiem")}>
                  <Plus className="mr-1 size-3" /> Trắc nghiệm
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => addQuestion("tra_loi_ngan")}>
                  <Plus className="mr-1 size-3" /> Trả lời ngắn
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => addQuestion("thuc_hanh")}>
                  <Plus className="mr-1 size-3" /> Thực hành Code
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.uid} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                        #{idx + 1} · {q.loai === "trac_nghiem" ? "Trắc nghiệm" : q.loai === "tra_loi_ngan" ? "Trả lời ngắn" : "Thực hành Code"}
                      </span>
                      <Input
                        value={q.ma_cau}
                        onChange={(e) => updateQuestion(q.uid, { ma_cau: e.target.value })}
                        className="h-7 w-20 font-mono text-xs"
                        title="Mã câu"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1">
                        <span className="text-muted-foreground">Điểm:</span>
                        <Input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={q.diem}
                          onChange={(e) => updateQuestion(q.uid, { diem: Math.max(0.5, Number(e.target.value) || 1) })}
                          className="h-7 w-16 text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="text-muted-foreground">Độ khó:</span>
                        <select
                          value={q.do_kho}
                          onChange={(e) => updateQuestion(q.uid, { do_kho: Number(e.target.value) || 2 })}
                          className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}/5</option>
                          ))}
                        </select>
                      </label>
                      <Button type="button" size="icon-xs" variant="ghost" disabled={idx === 0} onClick={() => moveQuestion(idx, -1)}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" disabled={idx === questions.length - 1} onClick={() => moveQuestion(idx, 1)}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setQuestions((prev) => prev.filter((x) => x.uid !== q.uid))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={q.stem}
                    onChange={(e) => updateQuestion(q.uid, { stem: e.target.value })}
                    placeholder="Nội dung câu hỏi (hỗ trợ Markdown & LaTeX)..."
                    className="w-full rounded-lg border border-input bg-background p-2.5 text-xs"
                  />

                  {q.loai === "trac_nghiem" && (
                    <div className="space-y-1.5">
                      {q.lua_chon.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.uid}`}
                            checked={q.dap_an_index === oi}
                            onChange={() => updateQuestion(q.uid, { dap_an_index: oi })}
                            className="accent-primary"
                            title="Chọn làm đáp án đúng"
                          />
                          <span className="w-4 text-xs font-semibold text-muted-foreground">{String.fromCharCode(65 + oi)}</span>
                          <Input
                            value={opt}
                            onChange={(e) => {
                              const nextOpts = [...q.lua_chon];
                              nextOpts[oi] = e.target.value;
                              updateQuestion(q.uid, { lua_chon: nextOpts });
                            }}
                            placeholder={`Đáp án ${String.fromCharCode(65 + oi)}`}
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.loai === "tra_loi_ngan" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Đáp án tham chiếu (mỗi dòng hoặc `;` 1 đáp án)</label>
                        <textarea
                          rows={2}
                          value={q.dap_an_text}
                          onChange={(e) => updateQuestion(q.uid, { dap_an_text: e.target.value })}
                          placeholder="print&#10;print()"
                          className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Hướng dẫn chấm cho AI/GV (tùy chọn)</label>
                        <textarea
                          rows={2}
                          value={q.huong_dan_cham || ""}
                          onChange={(e) => updateQuestion(q.uid, { huong_dan_cham: e.target.value })}
                          placeholder="Tiêu chí chấm điểm..."
                          className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {q.loai === "thuc_hanh" && (
                    <div className="space-y-2.5">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground">Ngôn ngữ bắt buộc</label>
                          <select
                            value={q.ngon_ngu}
                            onChange={(e) => updateQuestion(q.uid, { ngon_ngu: e.target.value === "cpp" ? "cpp" : "python" })}
                            className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="python">Python</option>
                            <option value="cpp">C++</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground">Giới hạn / ràng buộc (tùy chọn)</label>
                          <Input
                            value={q.rang_buoc || ""}
                            onChange={(e) => updateQuestion(q.uid, { rang_buoc: e.target.value })}
                            placeholder="1 <= N <= 10^5"
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Code đáp án mẫu (bắt buộc để sinh/kiểm tra test)</label>
                        <textarea
                          rows={3}
                          value={q.code_dap_an}
                          onChange={(e) => updateQuestion(q.uid, { code_dap_an: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-input bg-background p-2 font-mono text-xs"
                          spellCheck={false}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground">Sample Input</label>
                          <textarea
                            rows={2}
                            value={q.sample_input}
                            onChange={(e) => updateQuestion(q.uid, { sample_input: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-input bg-background p-2 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground">Sample Output</label>
                          <textarea
                            rows={2}
                            value={q.sample_output}
                            onChange={(e) => updateQuestion(q.uid, { sample_output: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-input bg-background p-2 font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
                <Upload className="h-4 w-4" /> Chọn file .json
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button variant="outline" size="sm" onClick={loadSample}>
                <FileJson className="h-4 w-4" /> Dán đề mẫu tối thiểu
              </Button>
            </div>
            <textarea
              className="h-96 w-full rounded-xl border border-border bg-card p-3 font-mono text-xs leading-relaxed"
              placeholder={TEMPLATE_HINT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
            {details.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {details.map((d, i) => (
                  <li key={`${d}-${i}`}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate("/exams")}>Hủy</Button>
          {tab === "builder" ? (
            <Button disabled={importMut.isPending} onClick={submitBuilder}>
              {importMut.isPending ? "Đang tạo..." : "Tạo đề thi"}
            </Button>
          ) : (
            <Button disabled={!text.trim() || importMut.isPending} onClick={submitJson}>
              {importMut.isPending ? "Đang import..." : "Import đề JSON"}
            </Button>
          )}
        </div>

        <QuestionSourcePickerDialog
          open={bankPickerOpen}
          onClose={() => setBankPickerOpen(false)}
          onPick={(item) => {
            setQuestions((prev) => [
              ...prev,
              {
                ...item,
                uid: nextUid(),
                ma_cau: `C${String(prev.length + 1).padStart(2, "0")}`,
              } as BuilderQuestion,
            ]);
            toast.success({ title: "Đã thêm câu hỏi vào đề" });
          }}
        />

        <AiExamGenerateDialog
          open={aiDialogOpen}
          onClose={() => setAiDialogOpen(false)}
          courseId={courseId}
          courseTitle={(coursesQ.data || []).find((c: any) => c.id === courseId)?.title || ""}
          existingStems={questions.map((q) => q.stem.trim()).filter(Boolean)}
          hasExistingContent={questions.some((q) => q.stem.trim().length > 0)}
          onApply={(generated, mode) => {
            const toBuilder = (q: any, index: number): BuilderQuestion => {
              const ma_cau = `C${String(index + 1).padStart(2, "0")}`;
              if (q.loai === "trac_nghiem") {
                return {
                  uid: nextUid(),
                  loai: "trac_nghiem",
                  ma_cau,
                  diem: Number(q.diem) || 1,
                  do_kho: Number(q.do_kho) || 2,
                  stem: q.stem || "",
                  lua_chon: Array.isArray(q.lua_chon) && q.lua_chon.length >= 2 ? q.lua_chon : ["", "", "", ""],
                  dap_an_index: Number(q.dap_an_index) || 0,
                  giai_thich: q.giai_thich || undefined,
                  ky_nang: Array.isArray(q.ky_nang) ? q.ky_nang : [],
                };
              }
              if (q.loai === "tra_loi_ngan") {
                return {
                  uid: nextUid(),
                  loai: "tra_loi_ngan",
                  ma_cau,
                  diem: Number(q.diem) || 1.5,
                  do_kho: Number(q.do_kho) || 2,
                  stem: q.stem || "",
                  dap_an_text: Array.isArray(q.dap_an) ? q.dap_an.join("\n") : String(q.dap_an || ""),
                  huong_dan_cham: q.huong_dan_cham || undefined,
                  ky_nang: Array.isArray(q.ky_nang) ? q.ky_nang : [],
                };
              }
              return {
                uid: nextUid(),
                loai: "thuc_hanh",
                ma_cau,
                diem: Number(q.diem) || 3,
                do_kho: Number(q.do_kho) || 3,
                stem: q.stem || "",
                ngon_ngu: q.ngon_ngu === "cpp" ? "cpp" : "python",
                code_dap_an: q.code_dap_an || "# Lời giải mẫu\n",
                sample_input: q.testcase_mau?.[0]?.input ?? "",
                sample_output: q.testcase_mau?.[0]?.output ?? "",
                rang_buoc: q.rang_buoc || undefined,
                ky_nang: Array.isArray(q.ky_nang) ? q.ky_nang : [],
              };
            };

            const list = Array.isArray(generated.cau_hoi) ? generated.cau_hoi : [];
            if (mode === "replace") {
              const mapped = list.map((item: any, i: number) => toBuilder(item, i));
              setQuestions(mapped);
              if (generated.tieu_de) setTitle(generated.tieu_de);
              if (generated.mo_ta) setDescription(generated.mo_ta);
              if (generated.thoi_gian_phut) setDurationMinutes(Number(generated.thoi_gian_phut) || 45);
              toast.success({ title: `AI đã tạo đề thi gồm ${mapped.length} câu hỏi` });
            } else {
              setQuestions((prev) => {
                const base = prev.length === 1 && !prev[0].stem.trim() ? [] : prev;
                const mapped = list.map((item: any, i: number) => toBuilder(item, base.length + i));
                return [...base, ...mapped];
              });
              if (!title.trim() && generated.tieu_de) setTitle(generated.tieu_de);
              if (!description.trim() && generated.mo_ta) setDescription(generated.mo_ta);
              toast.success({ title: `AI đã sinh thêm ${list.length} câu hỏi vào đề` });
            }
            setAiDialogOpen(false);
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
