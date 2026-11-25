import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Upload, FileJson, AlertCircle } from "lucide-react";

const TEMPLATE_HINT = `{
  "phien_ban": "1.0",
  "de_thi": { "tieu_de": "...", "thoi_gian_phut": 60, "ngon_ngu_code": ["python","cpp"] },
  "cau_hoi": [ ... ]
}`;

export default function ExamImport() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [courseId, setCourseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  const coursesQ = useQuery({
    queryKey: ["courses-for-exam"],
    queryFn: () => api.get("/courses").then((r) => r.data as any[]),
  });

  const importMut = useMutation({
    mutationFn: async () => {
      let document: unknown;
      try {
        document = JSON.parse(text);
      } catch {
        throw { response: { data: { error: "JSON không parse được", details: [] } } };
      }
      const body: any = { document };
      if (courseId) body.courseId = courseId;
      return api.post("/exams/import-json", body).then((r) => r.data);
    },
    onSuccess: (data) => {
      navigate(`/exams/${data.id}/edit`);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || "Import thất bại");
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
      // Prefer repo sample if served; else minimal inline
      const res = await fetch("/docs-exam-sample.json").catch(() => null);
      if (res && res.ok) {
        setText(await res.text());
        return;
      }
    } catch { /* ignore */ }
    setText(JSON.stringify({
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
    }, null, 2));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => navigate("/exams")}>
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Tạo đề từ JSON</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dùng template tại <code className="text-xs">docs/exam/mau-de-thi.json</code>. Hỗ trợ trắc nghiệm, trả lời ngắn, thực hành Python/C++.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
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

      <div className="mt-4">
        <label className="text-xs font-medium text-muted-foreground">Gán khóa học (tuỳ chọn)</label>
        <select
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        >
          <option value="">— Không gán / mọi thành viên xem khi published —</option>
          {(coursesQ.data || []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      <textarea
        className="mt-4 h-96 w-full rounded-xl border border-border bg-card p-3 font-mono text-xs leading-relaxed"
        placeholder={TEMPLATE_HINT}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
          {details.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/exams")}>Hủy</Button>
        <Button
          disabled={!text.trim() || importMut.isPending}
          onClick={() => {
            setError(null);
            setDetails([]);
            importMut.mutate();
          }}
        >
          {importMut.isPending ? "Đang import…" : "Import đề"}
        </Button>
      </div>
    </div>
  );
}
