import { useEffect, useState, useCallback } from"react";
import { useParams, useNavigate, Link } from"react-router-dom";
import { ArrowLeft, Play, Sparkles, CheckCircle2, Loader2, Trash2, Eye, RotateCw, Wand2, FileText, Code2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, LockKeyhole } from"lucide-react";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";
import { CodeDuelDraft } from"../../lib/codeDuelTypes";
import { ArenaMarkdown } from"../../components/arena/ArenaMarkdown";

/** Rút gọn input/output test case nếu quá dài để tránh tràn web. */
const MAX_TEST_PREVIEW_LINES = 3;
const MAX_TEST_PREVIEW_CHARS = 180;

function truncateTestValue(raw: string): { preview: string; trimmed: boolean } {
 const s = String(raw ??"");
 if (s.length <= MAX_TEST_PREVIEW_CHARS) {
 return { preview: s, trimmed: false };
 }
 const lines = s.split("\n");
 // Cắt theo số dòng (tối đa 3) RỒI theo số ký tự — một dòng duy nhất dài
 // 989.000 ký tự (dãy số của test n=100000) phải bị cắt chứ không thể hiện hết.
 const previewLines = lines.slice(0, MAX_TEST_PREVIEW_LINES);
 let preview = previewLines.join("\n");
 if (preview.length > MAX_TEST_PREVIEW_CHARS) {
 preview = preview.slice(0, MAX_TEST_PREVIEW_CHARS) +"…";
 }
 const ellipsis = lines.length > MAX_TEST_PREVIEW_LINES
 ? `\n... (${lines.length} dòng, ${s.length} ký tự)`
 : `... (${s.length} ký tự)`;
 return { preview: preview + ellipsis, trimmed: true };
}

interface RoundRow {
 id: string;
 orderIndex: number;
 title: string;
 difficulty: string;
 status: string;
 enabled: boolean;
 topic: string;
 algorithm: string;
 statement?: string;
 timeLimitSeconds?: number;
 constraints?: string;
 maxInputSize?: number;
 testCases?: string;
}

export default function CodeDuelAuthoring() {
 const { id } = useParams<{ id: string }>();
 const navigate = useNavigate();
 const toast = useToast();

 const [match, setMatch] = useState<any>(null);
 const [rounds, setRounds] = useState<RoundRow[]>([]);
 const [loading, setLoading] = useState(true);

 // AI chat state
 const [prompt, setPrompt] = useState("");
 const [drafting, setDrafting] = useState(false);
 const [draft, setDraft] = useState<CodeDuelDraft | null>(null);
 // Draft panel: edit the raw markdown or preview the rendered statement.
 const [draftTab, setDraftTab] = useState<"preview" |"edit">("preview");
 //"Ask the AI to fix THIS draft" — revision request, not a new problem.
 const [revisePrompt, setRevisePrompt] = useState("");
 const [revising, setRevising] = useState(false);
 const [finalizing, setFinalizing] = useState(false);
 const [expandedRound, setExpandedRound] = useState<string | null>(null);
 const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
 const [targetTestCount, setTargetTestCount] = useState<number>(10);

 const toggleTestExpanded = useCallback((key: string) => {
 setExpandedTests((prev) => {
 const next = new Set(prev);
 if (next.has(key)) next.delete(key); else next.add(key);
 return next;
 });
 }, []);
 // What the expanded locked round shows: rendered statement or raw tests.
 const [roundView, setRoundView] = useState<"statement" |"tests">("statement");
 const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

 // Skill options for tagging a round before finalize (feeds skill evidence).
 const [skillOptions, setSkillOptions] = useState<{ skillId: string; shortName: string; topicName: string }[]>([]);
 useEffect(() => {
 api.get("/skills").then((response) => {
 const options = (response.data || []).flatMap((group: {
 topicName: string;
 skills: { skillId: string; name: string }[];
 }) => group.skills.map((skill) => ({
 skillId: skill.skillId,
 shortName: skill.name.split(" —")[0],
 topicName: group.topicName,
 })));
 if (options.length > 0) setSkillOptions(options);
 }).catch(() => {});
 }, []);

 const load = async () => {
 setLoading(true);
 try {
 const [m, r] = await Promise.all([
 api.get(`/code-duel/${id}`).then((r) => r.data),
 api.get(`/code-duel/${id}/rounds`).then((r) => r.data).catch(() => null),
 ]);
 setMatch(m);
 if (r && Array.isArray(r)) setRounds(r);
 } catch (err: any) {
 toast.error({ title:"Không tải được", message: err?.response?.data?.error ||"Đã có lỗi." });
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => { load(); }, [id]);

 const requestDraft = async () => {
 if (!prompt.trim()) {
 toast.error({ title:"Cần nhập yêu cầu" });
 return;
 }
 setDrafting(true);
 setDraft(null);
 try {
 const res = await api.post(`/code-duel/${id}/rounds/ai-draft`, {
 prompt: prompt.trim(),
 language: match?.match?.language ||"python",
 });
 setDraft(res.data);
 setDraftTab("preview");
 } catch (err: any) {
 toast.error({ title:"AI chưa tạo được", message: err?.response?.data?.error ||"Thử lại." });
 } finally {
 setDrafting(false);
 }
 };

 // Revision flow: the AI edits the CURRENT draft per a specific instruction
 // instead of generating a brand-new problem.
 const requestRevision = async () => {
 if (!draft || !revisePrompt.trim()) return;
 setRevising(true);
 try {
 const res = await api.post(`/code-duel/${id}/rounds/ai-draft`, {
 prompt: revisePrompt.trim(),
 language: match?.match?.language ||"python",
 draft,
 });
 setDraft(res.data);
 setRevisePrompt("");
 setDraftTab("preview");
 toast.success({ title:"AI đã sửa đề", message:"Kiểm tra lại đề bên dưới trước khi chốt." });
 } catch (err: any) {
 toast.error({ title:"AI chưa sửa được", message: err?.response?.data?.error ||"Thử lại." });
 } finally {
 setRevising(false);
 }
 };

 const finalize = async () => {
 if (!draft) return;
 setFinalizing(true);
 try {
 const hiddenCount = Math.max(3, targetTestCount - 2);
 const res = await api.post(`/code-duel/${id}/rounds`, {
 ...draft,
 targetHiddenCount: hiddenCount,
 });
 toast.success({
 title:"Đã chốt câu hỏi",
 message: `Sinh ${res.data.testCaseCount} test (${res.data.generatedCount} ẩn).`,
 });
 setDraft(null);
 setPrompt("");
 setRevisePrompt("");
 load();
 } catch (err: any) {
 toast.error({ title:"Chốt thất bại", message: err?.response?.data?.error ||"Đã có lỗi." });
 } finally {
 setFinalizing(false);
 }
 };

 const start = async () => {
 try {
 if (match?.match?.status ==="lobby") {
 navigate(`/code-duel/${id}/game`);
 return;
 }
 // Mở phòng chờ (draft → lobby) để học sinh vào trước, rồi đi tới game
 // nơi giáo viên bấm"Bắt đầu" thật sự khi đủ người.
 await api.post(`/code-duel/${id}/lobby`);
 navigate(`/code-duel/${id}/game`);
 } catch (err: any) {
 toast.error({ title:"Không mở phòng được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 const regenerate = async (roundId: string) => {
 setRegeneratingId(roundId);
 try {
 const res = await api.post(`/code-duel/${id}/rounds/${roundId}/regenerate`);
 toast.success({ title:"Đã tạo lại test", message: `${res.data.testCaseCount} test (${res.data.generatedCount} ẩn).` });
 await load();
 } catch (err: any) {
 toast.error({ title:"Tạo lại thất bại", message: err?.response?.data?.error ||"Thử lại." });
 } finally {
 setRegeneratingId(null);
 }
 };

 const toggleRound = async (round: RoundRow) => {
 try {
 const nextEnabled = !round.enabled;
 await api.patch(`/code-duel/${id}/rounds/${round.id}/enabled`, { enabled: nextEnabled });
 setRounds((current) => current.map((item) => item.id === round.id ? { ...item, enabled: nextEnabled } : item));
 toast.success({ title: nextEnabled ?"Đã bật bài" :"Đã tắt bài", message: nextEnabled ?"Bài sẽ được đưa vào trận." :"Bài này sẽ bị bỏ qua khi bắt đầu trận." });
 } catch (err: any) {
 toast.error({ title:"Không đổi được", message: err?.response?.data?.error ||"Đã có lỗi." });
 }
 };

 interface TestCaseView { input: string; output: string; hidden?: boolean }
 const parseTests = (raw?: string): TestCaseView[] => {
 if (!raw) return [];
 try {
 const arr = JSON.parse(raw);
 return Array.isArray(arr) ? arr : [];
 } catch {
 return [];
 }
 };

 if (loading) return <div className="py-16 text-center text-muted-foreground">Đang tải...</div>;

 const readyCount = rounds.filter((r) => r.status ==="ready" && r.enabled).length;
 const busy = drafting || revising;

 return (
 <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <Link to="/code-duel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
 <ArrowLeft className="h-4 w-4" /> Trận đấu
 </Link>
 <h1 className="mt-1 text-2xl font-extrabold text-foreground">{match?.match?.title ||"Soạn thảo"}</h1>
 <p className="text-sm text-muted-foreground">
 {readyCount >= 1 ? `${readyCount} câu hỏi sẵn sàng.` :"Chưa có câu hỏi nào sẵn sàng."}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Link
 to={`/code-duel/${id}/access`}
 className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
 >
 <LockKeyhole className="h-4 w-4" /> Quản lý truy cập
 </Link>
 <button
 onClick={start}
 disabled={readyCount < 1}
 className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
 >
 <Play className="h-4 w-4" /> {match?.match?.status ==="lobby" ?"Vào phòng chờ" :"Mở phòng chờ"}
 </button>
 </div>
 </div>

 <div className="grid gap-6 lg:grid-cols-2">
 {/* Left: locked rounds */}
 <div className="space-y-3 rounded-xl border border-border bg-card p-5">
 <h2 className="flex items-center gap-2 font-semibold text-foreground">
 <CheckCircle2 className="h-5 w-5" /> Câu hỏi đã chốt
 </h2>
 {rounds.length === 0 ? (
 <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
 Chưa có câu hỏi nào. Dùng AI bên cạnh để soạn câu hỏi đầu tiên.
 </div>
 ) : (
 rounds.map((r) => {
 const tests = parseTests(r.testCases);
 const publicCount = tests.filter((t) => !t.hidden).length;
 const hiddenCount = tests.length - publicCount;
 const isOpen = expandedRound === r.id;
 return (
 <div key={r.id} className="rounded-lg border border-border bg-muted/30">
 <div className="flex items-center justify-between gap-2 p-3">
 <div className="min-w-0 flex-1">
 <p className="truncate font-medium text-foreground">
 Vòng {r.orderIndex + 1} · {r.title}
 </p>
 <p className="truncate text-xs text-muted-foreground">
 {r.difficulty} · {r.topic ||"chưa rõ chủ đề"}
 {r.status ==="ready" && (
 <span className="ml-1">· {tests.length} test ({publicCount} công khai / {hiddenCount} ẩn)</span>
 )}
 </p>
 </div>
 <div className="flex shrink-0 items-center gap-1.5">
 <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.enabled && r.status ==="ready" ?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :"bg-muted text-muted-foreground"}`}>
 {r.enabled ? (r.status ==="ready" ?"Đang bật" : r.status) :"Đã tắt"}
 </span>
 <button
 onClick={() => toggleRound(r)}
 title={r.enabled ?"Tắt bài này khỏi trận" :"Bật bài này cho trận"}
 className={`inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold ${r.enabled ?"bg-primary/10" :"border-border text-muted-foreground hover:bg-muted"}`}
 >
 {r.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
 {r.enabled ?"Bật" :"Tắt"}
 </button>
 <button
 onClick={() => {
 setExpandedRound(isOpen ? null : r.id);
 setRoundView("statement");
 }}
 title="Xem đề bài và test"
 className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
 >
 <Eye className="h-3.5 w-3.5" /> {isOpen ?"Ẩn" :"Xem"}
 </button>
 {r.status ==="ready" && (
 <button
 onClick={() => regenerate(r.id)}
 disabled={regeneratingId === r.id}
 title="Tạo lại test"
 className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
 >
 {regeneratingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
 Làm lại
 </button>
 )}
 </div>
 </div>
 {isOpen && (
 <div className="space-y-2 border-t border-border p-3">
 {/* Statement / tests switch — teachers see the rendered
 problem exactly as students will. */}
 <div className="flex gap-1.5">
 <button
 onClick={() => setRoundView("statement")}
 className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${roundView ==="statement" ?"bg-primary text-white" :"border border-border text-muted-foreground hover:bg-muted"}`}
 >
 <FileText className="h-3.5 w-3.5" /> Đề bài
 </button>
 <button
 onClick={() => setRoundView("tests")}
 className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${roundView ==="tests" ?"bg-primary text-white" :"border border-border text-muted-foreground hover:bg-muted"}`}
 >
 <Code2 className="h-3.5 w-3.5" /> Test ({tests.length})
 </button>
 </div>

 {roundView ==="statement" && (
 <div className="rounded-md border border-border bg-background/60 p-3">
 <ArenaMarkdown content={r.statement ||"Chưa có đề bài."} className="text-sm text-foreground/90" />
 {r.timeLimitSeconds ? (
 <p className="mt-2 text-xs text-muted-foreground">Giới hạn thời gian: {r.timeLimitSeconds}s</p>
 ) : null}
 </div>
 )}

 {roundView ==="tests" && (
 tests.length === 0 ? (
 <p className="text-xs text-muted-foreground">Chưa có test.</p>
 ) : (
 tests.map((t, i) => {
 const testKey = `${r.id}-${i}`;
 const inputInfo = truncateTestValue(t.input);
 const outputInfo = truncateTestValue(t.output);
 const needToggle = inputInfo.trimmed || outputInfo.trimmed;
 const isExpanded = expandedTests.has(testKey);
 return (
 <div key={i} className="grid gap-1 rounded-md border border-border bg-background/60 p-2.5 text-xs">
 <div className="flex items-center justify-between">
 <span className="font-semibold text-foreground">Test {i + 1}</span>
 <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.hidden ?"bg-amber-500/15 text-amber-700 dark:text-amber-400" :"bg-sky-500/15 text-sky-700 dark:text-sky-400"}`}>
 {t.hidden ?"Ẩn" :"Công khai"}
 </span>
 </div>
 <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/90">
 <span className="text-muted-foreground">Input: </span>{isExpanded ? t.input : inputInfo.preview}
 </pre>
 <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/90">
 <span className="text-muted-foreground">Output: </span>{isExpanded ? t.output : outputInfo.preview}
 </pre>
 {needToggle && (
 <button
 onClick={() => toggleTestExpanded(testKey)}
 className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-fit"
 >
 {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
 {isExpanded ?"Thu gọn" : `Xem đầy đủ (${(t.input.length + t.output.length).toLocaleString("vi-VN")} ký tự)`}
 </button>
 )}
 </div>
 );
 })
 )
 )}
 </div>
 )}
 </div>
 );
 })
 )}
 </div>

 {/* Right: AI chat + draft */}
 <div className="space-y-4 rounded-xl border border-border bg-card p-5">
 <h2 className="flex items-center gap-2 font-semibold text-foreground">
 <Sparkles className="h-5 w-5" /> Soạn câu hỏi cùng AI
 </h2>

 <div className="flex gap-2">
 <input
 value={prompt}
 onChange={(e) => setPrompt(e.target.value)}
 onKeyDown={(e) => { if (e.key ==="Enter" && !busy) requestDraft(); }}
 placeholder="VD: một bài dùng vòng lặp for, dễ, chủ đề dãy số..."
 className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
 />
 <button
 onClick={requestDraft}
 disabled={busy}
 className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
 >
 {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
 Tạo
 </button>
 </div>

 {draft && (
 <div className="space-y-3 rounded-lg border bg-primary/10 p-4">
 <div className="flex items-center justify-between gap-2">
 <p className="min-w-0 truncate font-semibold text-foreground">{draft.title}</p>
 <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">{draft.difficulty}</span>
 </div>

 {/* Preview / edit tabs for the statement */}
 <div className="flex gap-1.5">
 <button
 onClick={() => setDraftTab("preview")}
 className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${draftTab ==="preview" ?"text-white" :"border border-border text-muted-foreground hover:bg-muted"}`}
 >
 <Eye className="h-3.5 w-3.5" /> Xem trước
 </button>
 <button
 onClick={() => setDraftTab("edit")}
 className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${draftTab ==="edit" ?"text-white" :"border border-border text-muted-foreground hover:bg-muted"}`}
 >
 <FileText className="h-3.5 w-3.5" /> Sửa tay
 </button>
 </div>

 {draftTab ==="preview" ? (
 <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-3">
 <ArenaMarkdown content={draft.statement} className="text-sm text-foreground/90" />
 {draft.publicSamples.length > 0 && (
 <div className="mt-3 space-y-2">
 <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ví dụ</p>
 {draft.publicSamples.map((s, i) => (
 <div key={i} className="grid gap-1 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
 <pre className="whitespace-pre-wrap break-words font-mono text-foreground/80">{`Input: ${s.input}`}</pre>
 <pre className="whitespace-pre-wrap break-words font-mono">{`Output: ${s.output}`}</pre>
 </div>
 ))}
 </div>
 )}
 </div>
 ) : (
 <textarea
 value={draft.statement}
 onChange={(e) => setDraft((d) => (d ? { ...d, statement: e.target.value } : d))}
 rows={10}
 placeholder="Đề bài (markdown)..."
 className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
 />
 )}

 <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
 <div className="truncate">Chủ đề: {draft.topic}</div>
 <div className="truncate">Thuật toán: {draft.algorithm}</div>
 <div className="truncate">Giới hạn: {draft.timeLimitSeconds}s · độ lớn tối đa {draft.maxInputSize}</div>
 <div>Mẫu: {draft.publicSamples.length}</div>
 {draft.constraints && (
 <div className="truncate font-mono sm:col-span-2">Ràng buộc: {draft.constraints}</div>
 )}
 </div>

 {/* Skill tag — AC submissions of this round feed skill mastery. */}
 <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 p-2.5 text-xs">
 <span className="font-semibold text-foreground">Kỹ năng đánh giá:</span>
 <select
 value={draft.skillId ||""}
 onChange={(e) => setDraft((d) => (d ? { ...d, skillId: e.target.value || undefined } : d))}
 className={`rounded-md border border-border px-2 py-1 text-xs outline-none focus:border-primary ${draft.skillId ?"bg-primary/10" :"border-input bg-background text-muted-foreground"}`}
 >
 <option value="">— Chưa gắn tag —</option>
 {skillOptions.map((s) => (
 <option key={s.skillId} value={s.skillId}>{s.topicName} · {s.shortName}</option>
 ))}
 </select>
 {!draft.skillId && <span className="">Chưa gắn tag — lượt AC của vòng này không tính vào mastery.</span>}
 </div>

 {/* Ask the AI to fix THIS draft specifically */}
 <div className="space-y-1.5 rounded-lg border bg-background/60 p-2.5">
 <label className="flex items-center gap-1 text-xs font-semibold text-foreground">
 <Wand2 className="h-3.5 w-3.5" /> Kêu AI sửa đề này
 </label>
 <div className="flex gap-2">
 <input
 value={revisePrompt}
 onChange={(e) => setRevisePrompt(e.target.value)}
 onKeyDown={(e) => { if (e.key ==="Enter" && !busy) requestRevision(); }}
 placeholder="VD: đổi thành dãy tăng dần, thêm ràng buộc cụ thể, sửa ví dụ 2..."
 className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
 />
 <button
 onClick={requestRevision}
 disabled={busy || !revisePrompt.trim()}
 className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
 >
 {revising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
 Sửa
 </button>
 </div>
 <p className="text-[11px] text-muted-foreground">
 AI chỉ chỉnh phần bạn yêu cầu trên đề hiện tại — không tạo đề mới.
 </p>
 </div>

 <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs">
 <span className="font-medium text-foreground">Số lượng test case sinh ra:</span>
 <select
 value={targetTestCount}
 onChange={(e) => setTargetTestCount(Number(e.target.value))}
 disabled={finalizing || busy}
 className="rounded border border-input bg-background px-2 py-1 font-semibold text-foreground outline-none"
 >
 <option value={5}>5 test (2 công khai + 3 ẩn)</option>
 <option value={10}>10 test (2 công khai + 8 ẩn) — Chuẩn</option>
 <option value={15}>15 test (2 công khai + 13 ẩn)</option>
 <option value={20}>20 test (2 công khai + 18 ẩn)</option>
 </select>
 </div>

 <div className="flex gap-2">
 <button
 onClick={finalize}
 disabled={finalizing || busy}
 className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
 >
 {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
 Chốt + chạy sinh test
 </button>
 <button
 onClick={() => setDraft(null)}
 disabled={finalizing || busy}
 className="inline-flex items-center justify-center rounded-lg border border-input px-3 py-2 text-sm text-muted-foreground"
 >
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 <p className="text-[11px] text-muted-foreground">
 Khi chốt, hệ thống sẽ chạy chương trình sinh input + lời giải mẫu để tạo test theo độ khó (dễ→khó).
 </p>
 </div>
 )}

 {!draft && !busy && (
 <p className="text-sm text-muted-foreground">
 AI sẽ tránh trùng chủ đề/ý tưởng với các câu đã chốt ở trên.
 </p>
 )}
 </div>
 </div>
 </div>
 );
}
