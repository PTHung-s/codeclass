// Admin Panel — cấu hình hệ thống (AI model, API keys) + liên kết công cụ quản trị.
// Chỉ role admin truy cập được (route + API đều chặn).
import { useState, useEffect, useCallback } from "react";
import api from "../../lib/api";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useConfirmContext } from "../../hooks/useConfirm";
import { cn } from "../../lib/utils";
import {
  Settings, Sparkles, Database, Activity, Tag, Wand2, Terminal,
  Save, RefreshCw, PlugZap, RotateCcw, Check, X, ListChecks, Server, Megaphone,
} from "lucide-react";

interface LlmConfigResponse {
  primary: "vilao" | "deepseek";
  vilao: { baseUrl: string; model: string; apiKeyMasked: string; hasKey: boolean; source: "db" | "env" | "default" };
  deepseek: { baseUrl: string; model: string; apiKeyMasked: string; hasKey: boolean; source: "db" | "env" | "default" };
  overrides: { key: string; value: string; updatedAt: string; updatedBy: string | null }[];
}

interface TestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  preview?: string;
  error?: string;
}

type Tab = "ai" | "links" | "announcement";

type AnnouncementMode = "never" | "once" | "daily" | "always";

interface AnnouncementConfig {
  enabled: boolean;
  mode: AnnouncementMode;
  timesPerDay: number;
  title: string;
  body: string;
  updatedBy?: string | null;
}

export default function AdminPanelPage() {
  const confirm = useConfirmContext();
  const [tab, setTab] = useState<Tab>("ai");
  const [config, setConfig] = useState<LlmConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // announcement config state
  const [ann, setAnn] = useState<AnnouncementConfig | null>(null);
  const [annSaving, setAnnSaving] = useState(false);

  // form state (empty = giữ nguyên)
  const [primary, setPrimary] = useState<"vilao" | "deepseek">("vilao");
  const [vilaoBaseUrl, setVilaoBaseUrl] = useState("");
  const [vilaoModel, setVilaoModel] = useState("");
  const [vilaoApiKey, setVilaoApiKey] = useState("");
  const [deepseekModel, setDeepseekModel] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState("");

  const load = useCallback(async () => {
    const c = await api.get("/admin-settings").then((r) => r.data).catch(() => null);
    setConfig(c);
    if (c) {
      setPrimary(c.primary);
      setVilaoBaseUrl(c.vilao.baseUrl);
      setVilaoModel(c.vilao.model);
      setDeepseekBaseUrl(c.deepseek.baseUrl);
      setDeepseekModel(c.deepseek.model);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadAnn = useCallback(async () => {
    const c = await api.get("/admin-settings/announcement").then((r) => r.data).catch(() => null);
    setAnn(c);
  }, []);

  useEffect(() => {
    if (tab === "announcement") loadAnn();
  }, [tab, loadAnn]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, string> = { primary };
      if (vilaoBaseUrl.trim()) body.vilaoBaseUrl = vilaoBaseUrl.trim();
      if (vilaoModel.trim()) body.vilaoModel = vilaoModel.trim();
      if (vilaoApiKey.trim()) body.vilaoApiKey = vilaoApiKey.trim();
      if (deepseekBaseUrl.trim()) body.deepseekBaseUrl = deepseekBaseUrl.trim();
      if (deepseekModel.trim()) body.deepseekModel = deepseekModel.trim();
      if (deepseekApiKey.trim()) body.deepseekApiKey = deepseekApiKey.trim();
      const r = await api.put("/admin-settings/llm", body);
      setMsg(`Đã lưu (${r.data.updated} thay đổi). Cấu hình mới có hiệu lực trong ~30 giây.`);
      setVilaoApiKey("");
      setDeepseekApiKey("");
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.error || "Không lưu được cấu hình.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post("/admin-settings/test-llm");
      setTestResult(r.data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.response?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleClearOverride = async () => {
    const ok = await confirm({
      title: "Xóa override trong DB",
      message: "Xóa toàn bộ cấu hình LLM đã lưu trong database, quay về dùng biến .env trên server. Tiếp tục?",
      confirmLabel: "Xóa override",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const r = await api.delete("/admin-settings/llm/override");
      setMsg(`Đã xóa ${r.data.removed} override. Đang dùng cấu hình từ .env.`);
      load();
    } catch {
      setMsg("Không xóa được override.");
    }
  };

  const saveAnn = async () => {
    if (!ann) return;
    setAnnSaving(true);
    try {
      const r = await api.put("/admin-settings/announcement", ann);
      setMsg("Đã lưu cấu hình thông báo. Popup sẽ áp dụng ngay từ lần tải trang sau của học viên.");
      setAnn(r.data.config);
    } catch (err: any) {
      setMsg(err.response?.data?.error || "Không lưu được cấu hình thông báo.");
    } finally {
      setAnnSaving(false);
    }
  };

  const sourceBadge = (source: "db" | "env" | "default", hasKey: boolean) => {
    if (!hasKey) return <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">Chưa có key</Badge>;
    if (source === "db") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 text-[10px]">DB override</Badge>;
    if (source === "env") return <Badge variant="outline" className="text-[10px]">từ .env</Badge>;
    return <Badge variant="outline" className="text-[10px]">mặc định</Badge>;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Settings className="h-6 w-6 text-primary" /> Quản trị hệ thống
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cấu hình AI model, API keys và các công cụ quản trị. Thay đổi có hiệu lực sau ~30 giây, không cần restart.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {([["ai", "AI Model & Keys"], ["announcement", "Thông báo"], ["links", "Công cụ & liên kết"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn("rounded-md px-4 py-1.5 text-xs font-medium transition-colors", tab === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary">{msg}</div>}

      {tab === "ai" && (
        loading ? (
          <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
        ) : (
          <div className="space-y-4">
            {/* Primary provider */}
            <Card><CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-bold"><Sparkles className="size-4 text-primary" /> Provider chính (primary)</h2>
                {config && sourceBadge(config.vilao.source === "db" || config.deepseek.source === "db" ? "db" : "env",
                  config.primary === "vilao" ? config.vilao.hasKey : config.deepseek.hasKey)}
              </div>
              <div className="flex gap-2">
                {(["vilao", "deepseek"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPrimary(p)}
                    className={cn("flex-1 rounded-lg border p-3 text-left transition-colors",
                      primary === p ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40")}
                  >
                    <div className="flex items-center gap-2">
                      {primary === p
                        ? <Check className="size-4 text-primary" />
                        : <span className="size-4 rounded-full border" />}
                      <span className="text-sm font-semibold">{p === "vilao" ? "Vilao.ai" : "DeepSeek"}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {p === "vilao" ? config?.vilao.model : config?.deepseek.model}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Provider chính được thử trước; nếu lỗi sẽ tự động fallback sang provider còn lại.
              </p>
            </CardContent></Card>

            {/* Vilao config */}
            <Card><CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Vilao.ai {config?.primary === "vilao" && <Badge className="ml-1 bg-primary/10 text-primary text-[10px]">PRIMARY</Badge>}</h2>
                {config && sourceBadge(config.vilao.source, config.vilao.hasKey)}
              </div>
              <Field label="Base URL" value={vilaoBaseUrl} onChange={setVilaoBaseUrl} placeholder="https://api.vilao.ai/v1/chat/completions" />
              <Field label="Model" value={vilaoModel} onChange={setVilaoModel} placeholder="hpx/Qwen3.8-Max-agent" />
              <Field
                label={`API Key ${config?.vilao.apiKeyMasked ? `(hiện tại: ${config.vilao.apiKeyMasked})` : "(chưa có)"}`}
                value={vilaoApiKey}
                onChange={setVilaoApiKey}
                placeholder="Để trống = giữ key hiện tại"
                type="password"
              />
            </CardContent></Card>

            {/* Deepseek config */}
            <Card><CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">DeepSeek {config?.primary === "deepseek" && <Badge className="ml-1 bg-primary/10 text-primary text-[10px]">PRIMARY</Badge>}</h2>
                {config && sourceBadge(config.deepseek.source, config.deepseek.hasKey)}
              </div>
              <Field label="Base URL" value={deepseekBaseUrl} onChange={setDeepseekBaseUrl} placeholder="https://api.deepseek.com/v1/chat/completions" />
              <Field label="Model" value={deepseekModel} onChange={setDeepseekModel} placeholder="deepseek-chat" />
              <Field
                label={`API Key ${config?.deepseek.apiKeyMasked ? `(hiện tại: ${config.deepseek.apiKeyMasked})` : "(chưa có)"}`}
                value={deepseekApiKey}
                onChange={setDeepseekApiKey}
                placeholder="Để trống = giữ key hiện tại"
                type="password"
              />
            </CardContent></Card>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu cấu hình
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Test kết nối LLM
              </Button>
              {config && config.overrides.length > 0 && (
                <Button variant="outline" onClick={handleClearOverride} className="gap-1.5 text-muted-foreground">
                  <RotateCcw className="h-4 w-4" /> Xóa override DB (dùng .env)
                </Button>
              )}
            </div>

            {testResult && (
              <div className={cn("rounded-lg border p-4 text-sm",
                testResult.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200")}>
                {testResult.ok ? (
                  <>
                    <p className="font-bold flex items-center gap-1.5"><Check className="size-4" /> Kết nối thành công</p>
                    <p className="mt-1 text-xs">Provider: <b>{testResult.provider}</b> · Model: <b>{testResult.model}</b> · Latency: <b>{testResult.latencyMs}ms</b></p>
                    {testResult.preview && <p className="mt-1 text-xs opacity-80">Phản hồi: {testResult.preview}</p>}
                  </>
                ) : (
                  <>
                    <p className="font-bold flex items-center gap-1.5"><X className="size-4" /> Kết nối thất bại</p>
                    <p className="mt-1 text-xs">{testResult.error}</p>
                  </>
                )}
              </div>
            )}

            {config && config.overrides.length > 0 && (
              <Card><CardContent className="p-4">
                <p className="mb-2 text-xs font-bold text-muted-foreground">OVERRIDE ĐANG LƯU TRONG DB</p>
                <div className="space-y-1 font-mono text-[11px]">
                  {config.overrides.map((o) => (
                    <div key={o.key} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{o.key}</span>
                      <span className="truncate">{o.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            )}
          </div>
        )
      )}

      {tab === "announcement" && (
        !ann ? (
          <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
        ) : (
          <div className="space-y-4">
            <Card><CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Megaphone className="size-4 text-primary" />
                <h2 className="font-bold">Thông báo toàn cục (popup)</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Popup hiện cho mọi tài khoản đăng nhập. Admin có thể bật/tắt, chọn tần suất hiển thị và sửa toàn bộ nội dung.
              </p>

              {/* On/off */}
              <label className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Bật popup</p>
                  <p className="text-xs text-muted-foreground">Tắt = không ai thấy popup này.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ann.enabled}
                  onClick={() => setAnn({ ...ann, enabled: !ann.enabled })}
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", ann.enabled ? "bg-primary" : "bg-muted-foreground/30")}
                >
                  <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", ann.enabled && "translate-x-5")} />
                </button>
              </label>

              {/* Mode */}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Cách hiển thị</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["never", "Không bao giờ", "Không hiện popup (dù vẫn bật 'Bật popup')"],
                    ["once", "Một lần", "Hiện đúng 1 lần duy nhất trên mỗi trình duyệt"],
                    ["daily", "Theo ngày", "Hiện nhiều lần nhất mỗi ngày (đặt số lần bên dưới)"],
                    ["always", "Liên tục", "Hiện mỗi lần vào / quay lại web"],
                  ] as const).map(([val, label, desc]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAnn({ ...ann, mode: val })}
                      className={cn("rounded-lg border p-3 text-left transition-colors", ann.mode === val ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40")}
                    >
                      <div className="flex items-center gap-2">
                        {ann.mode === val ? <Check className="size-4 text-primary" /> : <span className="size-4 rounded-full border" />}
                        <span className="text-sm font-semibold">{label}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* timesPerDay only for daily */}
              {ann.mode === "daily" && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Số lần hiện mỗi ngày</span>
                  <input
                    type="number" min={1} max={99}
                    value={ann.timesPerDay}
                    onChange={(e) => setAnn({ ...ann, timesPerDay: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-32 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              )}
            </CardContent></Card>

            {/* Content editing */}
            <Card><CardContent className="space-y-3 p-5">
              <h2 className="font-bold">Nội dung</h2>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Tiêu đề</span>
                <input
                  value={ann.title}
                  onChange={(e) => setAnn({ ...ann, title: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Thông báo hệ thống"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Nội dung (mỗi đoạn cách nhau một dòng trống; bắt đầu đoạn bằng <code className="rounded bg-muted px-1">!callout</code> để làm nổi bật)
                </span>
                <textarea
                  value={ann.body}
                  onChange={(e) => setAnn({ ...ann, body: e.target.value })}
                  rows={8}
                  className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </CardContent></Card>

            <div className="flex items-center gap-2">
              <Button onClick={saveAnn} disabled={annSaving} className="gap-1.5">
                {annSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu thông báo
              </Button>
              {ann.updatedBy && <span className="text-xs text-muted-foreground">Cập nhật bởi: {ann.updatedBy}</span>}
            </div>
          </div>
        )
      )}

      {tab === "links" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkCard to="/admin/ai-tools" icon={<Wand2 className="h-5 w-5" />} title="AI Playground" desc="Chat với AI để tạo/sửa nội dung khóa học (preview + execute)." />
          <LinkCard to="/admin/quiz-bank" icon={<Database className="h-5 w-5" />} title="Quiz Bank" desc="Duyệt, lọc và phân loại câu hỏi trắc nghiệm bằng AI." />
          <LinkCard to="/admin/skill-tags" icon={<Tag className="h-5 w-5" />} title="Duyệt tag kỹ năng" desc="Xem đề xuất skill của AI cho quiz/problem trước khi duyệt." />
          <LinkCard to="/admin/engine-config" icon={<ListChecks className="h-5 w-5" />} title="Mastery Engine" desc="Chọn engine tính mastery (EWMA/BKT) và các thông số." />
          <LinkCard to="/admin/server" icon={<Activity className="h-5 w-5" />} title="Hiệu năng server" desc="Giám sát CPU, RAM, độ trễ API theo thời gian thực." />
          <LinkCard to="/admin/rec-logs" icon={<Server className="h-5 w-5" />} title="Recommendation Logs" desc="Audit trail các khuyến nghị học tập đã sinh." />
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        autoComplete="off"
      />
    </label>
  );
}

function LinkCard({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <a href={to} className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="font-semibold group-hover:text-primary">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
    </a>
  );
}