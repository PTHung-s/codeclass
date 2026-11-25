import { useQuery, useMutation, useQueryClient } from"@tanstack/react-query";
import { useParams, useNavigate } from"react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardList, Code2, Download, FileText, FileUp, FlaskConical, FolderUp, Plus, RefreshCw, Trash2, Upload } from"lucide-react";
import { useEffect, useState } from"react";
import api from"../../lib/api";
import { useToast } from"../../hooks/useToast";
import { useConfirmContext } from"../../hooks/useConfirm";
import { socketSubscribe } from"../../lib/socket";

function formatFileSize(bytes?: number | null) {
 if (!bytes || bytes <= 0) return null;
 return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}

export default function SessionTeacherPage() {
 const { lessonId } = useParams();
 const qc = useQueryClient();

 const { data, isLoading, isError } = useQuery<any>({
 queryKey: ["teacher-session-lesson", lessonId],
 queryFn: () => api.get(`/session-course/lesson/${lessonId}`).then((r) => r.data),
 enabled: !!lessonId,
 });

 useEffect(() => socketSubscribe((message) => {
 if (
 message.type ==="__socket_open" ||
 (message.type ==="session_video_compression" && message.payload?.lessonId === lessonId)
 ) {
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 }
 }), [lessonId, qc]);

 if (isLoading || isError || !data) {
 return (
 <main className="min-h-screen bg-background px-5 py-8">
 <section className="mx-auto max-w-[1400px] rounded-xl border border-border bg-card px-8 py-16 text-center text-muted-foreground shadow-sm">
 {isLoading ?"Đang tải..." :"Không tải được buổi học."}
 </section>
 </main>
 );
 }

 // Inner component holds all the hooks for the editor form. It is only mounted
 // AFTER loading finishes, so there is never a render with fewer hooks (which
 // would trigger React #310"more hooks than previous render").
 return <TeacherForm lessonId={lessonId!} data={data} />;
}

function TeacherForm({ lessonId, data }: { lessonId: string; data: any }) {
 const navigate = useNavigate();
 const qc = useQueryClient();
 const toast = useToast();
 const confirm = useConfirmContext();
 const { courseId } = useParams();
 const { lesson, codeFiles, materials } = data;

 // ── form state ──
 const [title, setTitle] = useState(lesson.title);
 const [reading, setReading] = useState(lesson.readingContent ||"");
 const [videoFile, setVideoFile] = useState<File | null>(null);
 const [videoDuration, setVideoDuration] = useState<number | null>(null);
 const [videoUploadPercent, setVideoUploadPercent] = useState<number | null>(null);
 const [materialFiles, setMaterialFiles] = useState<File[]>([]);
 const [newCode, setNewCode] = useState("");
 const [newCodeName, setNewCodeName] = useState("main.cpp");

 // quiz builder
 const [qs, setQs] = useState<any[]>(
 data.quiz?.questions?.length ? data.quiz.questions : [{ question:"", options: ["",""], correctIndex: 0 }],
 );
 const [passScore, setPassScore] = useState(data.quiz?.passScore ?? 70);

 // Skill options for per-question tagging (evidence replay needs a skillId).
 const { data: skillOptions = [] } = useQuery<{ skillId: string; shortName: string; topicName: string }[]>({
 queryKey: ["skill-options"],
 queryFn: () =>
 api.get("/skills").then((response) =>
 (response.data || []).flatMap((group: {
 topicName: string;
 skills: { skillId: string; name: string }[];
 }) => group.skills.map((skill) => ({
 skillId: skill.skillId,
 shortName: skill.name.split(" —")[0],
 topicName: group.topicName,
 }))),
 ),
 staleTime: 10 * 60 * 1000,
 });

 const saveMeta = useMutation({
 mutationFn: () =>
 api.patch(`/session-course/teacher/lesson/${lessonId}`, {
 title,
 readingContent: reading,
 }).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 toast.success({ title:"Đã lưu", message:"Thông tin buổi học đã được cập nhật." });
 },
 onError: (err: any) => toast.error({ title:"Lỗi", message: err.response?.data?.error ||"Không lưu được" }),
 });

 const uploadVideo = useMutation({
 mutationFn: async () => {
 if (!videoFile) throw new Error("Chưa chọn file video.");
 setVideoUploadPercent(0);
 const prepared = await api.post(`/session-course/teacher/lesson/${lessonId}/video/direct-upload`, {
 originalName: videoFile.name,
 contentType: videoFile.type,
 size: videoFile.size,
 videoDuration,
 }).then((r) => r.data);

 await new Promise<void>((resolve, reject) => {
 const request = new XMLHttpRequest();
 request.open("PUT", prepared.uploadUrl);
 request.setRequestHeader("Content-Type", videoFile.type);
 request.upload.onprogress = (event) => {
 if (event.lengthComputable) setVideoUploadPercent(Math.min(100, Math.round((event.loaded / event.total) * 100)));
 };
 request.onload = () => {
 if (request.status >= 200 && request.status < 300) resolve();
 else reject(new Error(`R2 từ chối upload (${request.status}).`));
 };
 request.onerror = () => reject(new Error("Không thể kết nối tới kho lưu trữ video."));
 request.onabort = () => reject(new Error("Upload video đã bị hủy."));
 request.send(videoFile);
 });

 return api.post(`/session-course/teacher/lesson/${lessonId}/video/direct-upload/complete`, { intent: prepared.intent }).then((r) => r.data);
 },
 onSuccess: () => {
 setVideoFile(null);
 setVideoDuration(null);
 setVideoUploadPercent(null);
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 toast.success({ title:"Đã upload video", message:"Video đã lên kho lưu trữ trực tiếp; đang tạo bản MP4 1080p nhẹ hơn." });
 },
 onError: (err: any) => {
 setVideoUploadPercent(null);
 toast.error({ title:"Upload video lỗi", message: err.response?.data?.error || err.message ||"Thất bại" });
 },
 });

 const addCode = useMutation({
 mutationFn: () =>
 api.post(`/session-course/teacher/lesson/${lessonId}/code`, {
 filename: newCodeName,
 language: newCodeName.endsWith(".py") ?"python" :"cpp",
 content: newCode,
 }).then((r) => r.data),
 onSuccess: () => {
 setNewCode("");
 setNewCodeName("main.cpp");
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 toast.success({ title:"Đã thêm code" });
 },
 onError: (err: any) => toast.error({ title:"Lỗi", message: err.response?.data?.error ||"Không thêm được" }),
 });

 const deleteCode = useMutation({
 mutationFn: (id: string) => api.delete(`/session-course/teacher/code/${id}`).then((r) => r.data),
 onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] }),
 });

 const deleteMaterial = useMutation({
 mutationFn: (id: string) => api.delete(`/session-course/teacher/material/${id}`).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 toast.success({ title:"Đã xóa tài liệu", message:"File đã được đưa vào hàng đợi dọn khỏi lưu trữ." });
 },
 onError: (err: any) => toast.error({ title:"Không xóa được tài liệu", message: err.response?.data?.error ||"Vui lòng thử lại." }),
 });

 const deleteLesson = useMutation({
 mutationFn: () => api.delete(`/session-course/teacher/lesson/${lessonId}`).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["session-course", courseId] });
 toast.success({ title:"Đã xóa vĩnh viễn buổi học", message:"Video và tài liệu liên quan đang được dọn khỏi lưu trữ." });
 navigate(`/course/${courseId}`);
 },
 onError: (err: any) => toast.error({ title:"Không thể xóa buổi học", message: err.response?.data?.error ||"Vui lòng thử lại." }),
 });

 const askDeleteMaterial = async (material: any) => {
 const approved = await confirm({
 title:"Xóa tài liệu vĩnh viễn",
 message: `Xóa “${material.name}” khỏi buổi học và lưu trữ? Hành động này không thể hoàn tác.`,
 variant:"danger",
 });
 if (approved) deleteMaterial.mutate(material.id);
 };

 const askDeleteLesson = async () => {
 const approved = await confirm({
 title:"Xóa vĩnh viễn buổi học",
 message:"Video, tài liệu, code, quiz, kết quả và tiến độ của học sinh trong buổi này sẽ bị xóa. Hành động này không thể hoàn tác.",
 variant:"danger",
 });
 if (approved) deleteLesson.mutate();
 };

 const uploadMaterial = useMutation({
 mutationFn: () => {
 const fd = new FormData();
 materialFiles.forEach((f) => fd.append("files", f));
 return api.post(`/session-course/teacher/lesson/${lessonId}/material`, fd).then((r) => r.data);
 },
 onSuccess: () => {
 setMaterialFiles([]);
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 toast.success({ title:"Upload tài liệu OK" });
 },
 onError: (err: any) => toast.error({ title:"Lỗi", message: err.response?.data?.error ||"Không upload được" }),
 });

 const saveQuiz = useMutation({
 mutationFn: () =>
 api.put(`/session-course/teacher/lesson/${lessonId}/quiz`, { title:"Quiz bắt buộc", passScore, questions: qs }).then((r) => r.data),
 onSuccess: () => toast.success({ title:"Đã lưu quiz", message:"Câu hỏi quiz đã được lưu." }),
 onError: (err: any) => toast.error({ title:"Lỗi", message: err.response?.data?.error ||"Quiz chưa đủ thông tin" }),
 });

 const importQuizFile = async (file: File | null) => {
 if (!file) return;
 try {
 if (file.size > 1_000_000) throw new Error("File quiz quá lớn. Vui lòng dùng file JSON dưới 1 MB.");
 const parsed = JSON.parse(await file.text());
 const rawQuestions = Array.isArray(parsed) ? parsed : parsed?.questions;
 if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) throw new Error("File phải có mảng questions với ít nhất một câu hỏi.");
 if (rawQuestions.length > 100) throw new Error("Mỗi lần chỉ được import tối đa 100 câu hỏi.");
 const imported = rawQuestions.map((item: any, index: number) => {
 const question = typeof item?.question ==="string" ? item.question.trim() :"";
 const options = Array.isArray(item?.options) ? item.options.map((option: unknown) => typeof option ==="string" ? option.trim() :"") : [];
 const correctIndex = Number(item?.correctIndex);
 if (!question) throw new Error(`Câu ${index + 1} chưa có nội dung.`);
 if (options.length < 2 || options.some((option: string) => !option)) throw new Error(`Câu ${index + 1} cần ít nhất 2 đáp án không rỗng.`);
 if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) throw new Error(`Câu ${index + 1} có correctIndex không hợp lệ.`);
 const skillId = typeof item?.skillId ==="string" && item.skillId.trim() ? item.skillId.trim() : null;
 return { question, options, correctIndex, skillId };
 });
 setQs(imported);
 const importedPassScore = Number(Array.isArray(parsed) ? NaN : parsed?.passScore);
 if (Number.isInteger(importedPassScore) && importedPassScore >= 1 && importedPassScore <= 100) setPassScore(importedPassScore);
 toast.success({ title:"Đã import quiz", message: `${imported.length} câu hỏi đã được nạp. Bấm “Lưu quiz” để áp dụng.` });
 } catch (error: any) {
 toast.error({ title:"Không import được quiz", message: error.message ||"File JSON không đúng định dạng." });
 }
 };

 const downloadQuizTemplate = () => {
 const template = {
 passScore: 70,
 questions: [
 { question:"Độ phức tạp của thuật toán này là gì?", options: ["O(1)","O(n)","O(n²)","O(log n)"], correctIndex: 1, skillId:"algo.complexity_estimate" },
 { question:"Câu hỏi mẫu thứ hai", options: ["Đáp án A","Đáp án B"], correctIndex: 0 },
 ],
 };
 const url = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type:"application/json" }));
 const link = document.createElement("a");
 link.href = url;
 link.download ="quiz-template.json";
 link.click();
 URL.revokeObjectURL(url);
 };

 const publish = useMutation({
 mutationFn: () => api.post(`/session-course/teacher/lesson/${lessonId}/publish`, { status: lesson.status ==="published" ?"draft" :"published" }).then((r) => r.data),
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["teacher-session-lesson", lessonId] });
 toast.success({ title: lesson.status ==="published" ?"Đã chuyển Draft" :"Đã PUBLISH", message:"Học sinh giờ có thể truy cập buổi này." });
 },
 onError: (err: any) => toast.error({ title:"Lỗi", message: err.response?.data?.error ||"Không đổi được trạng thái" }),
 });

 const selectVideo = (file: File | null) => {
 setVideoFile(file);
 setVideoDuration(null);
 setVideoUploadPercent(null);
 if (!file) return;
 const source = URL.createObjectURL(file);
 const probe = document.createElement("video");
 probe.preload ="metadata";
 probe.onloadedmetadata = () => {
 if (Number.isFinite(probe.duration)) setVideoDuration(Math.round(probe.duration));
 URL.revokeObjectURL(source);
 };
 probe.onerror = () => URL.revokeObjectURL(source);
 probe.src = source;
 };

 const publishChecks = [
 { label:"Tiêu đề buổi học", complete: Boolean(title.trim()) },
 { label:"Quiz mở khóa", complete: Boolean(qs.length && qs.every((q) => q.question?.trim() && q.options?.filter((x: string) => x.trim()).length >= 2)) },
 ];
 const canPublish = publishChecks.every((item) => item.complete);
 const compression = lesson.video?.compression;
 const savingsPercent = compression?.originalSize && compression?.optimizedSize
 ? Math.round((1 - compression.optimizedSize / compression.originalSize) * 100)
 : null;

 return (
 <main className="min-h-screen bg-background px-5 py-8 text-foreground">
 <section className="mx-auto max-w-6xl rounded-xl border border-border bg-card px-6 py-7 shadow-sm md:px-8">
 <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
 <div>
 <button className="mb-3 flex items-center gap-2 text-sm font-semibold hover:text-foreground" onClick={() => navigate(`/course/${courseId}`)}><ArrowLeft className="h-4 w-4" /> Quay lại khóa học</button>
 <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Chuẩn bị buổi học · Buổi {String(lesson.orderIndex).padStart(2,"0")}</p>
 <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">{lesson.title}</h1>
 <p className="mt-3 text-muted-foreground">Chuẩn bị nội dung trong lúc dạy, sau đó publish để học sinh truy cập.</p>
 </div>
 <span className={`inline-flex w-fit items-center gap-2 border border-border px-3 py-2 text-sm font-semibold ${lesson.status === "published" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border bg-muted text-muted-foreground"}`}>
 {lesson.status ==="published" ?"Published" :"Draft"}
 </span>
 </div>

 {/* Title + reading */}
 <div className="mt-7 rounded-xl border border-border bg-card p-6">
 <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><FlaskConical className="h-5 w-5" />Thông tin buổi học</h2>
 <div className="mt-4 grid gap-4">
 <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề buổi học"
 className="w-full rounded-lg border border-input bg-card px-4 py-3 text-lg font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 <textarea value={reading} onChange={(e) => setReading(e.target.value)} rows={6} placeholder="Nội dung bài đọc (Markdown được hỗ trợ)..."
 className="w-full rounded-lg border border-input bg-card px-4 py-3 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 </div>
 <div className="mt-4 flex justify-end">
 <button onClick={() => saveMeta.mutate()} className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90">Lưu thông tin</button>
 </div>
 </div>

 <div className="mt-6 grid gap-6 lg:grid-cols-2">
 {/* Video */}
 <section className="rounded-xl border border-border bg-card p-6">
 <div><h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><FileText className="h-5 w-5" />Video buổi học <span className="text-sm font-medium text-muted-foreground">(tùy chọn)</span></h2></div>
 <p className="mt-1 text-sm text-muted-foreground">Bạn có thể bỏ trống video và vẫn lưu/publish buổi học. Nếu upload, hãy nén thủ công trước; file sẽ được phát nguyên bản.</p>
 {lesson.video && (
 <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3">
 <video className="h-14 w-24 rounded-lg bg-black object-cover" src={lesson.video.url} controls muted playsInline preload="metadata" />
 <div className="min-w-0 flex-1">
 <div className="truncate font-semibold text-foreground">{(() => { try { return decodeURIComponent(escape(atob(lesson.video.originalName ||""))); } catch { return lesson.video.originalName ||"video"; } })()}</div>
 <div className="text-sm text-muted-foreground">{formatFileSize(lesson.video.size)}</div>
 </div>
 </div>
 )}
 {compression?.status ==="processing" && (
 <div className="mt-3 flex gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
 <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
 <div><p className="font-bold">Đang tối ưu bản 1080p</p><p className="mt-0.5">Học viên vẫn xem được video gốc. Trang này tự cập nhật khi quá trình hoàn tất.</p></div>
 </div>
 )}
 {compression?.status ==="ready" && compression.optimizedSize && (
 <div className="mt-3 flex gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
 <div><p className="font-bold">Đã tạo MP4 1080p{savingsPercent !== null ? savingsPercent > 0 ? ` · giảm ${savingsPercent}% dung lượng` : ` · tăng ${Math.abs(savingsPercent)}% dung lượng` :""}</p><p className="mt-0.5">{formatFileSize(compression.originalSize)} → {formatFileSize(compression.optimizedSize)}. Video gốc đã được xóa sau khi thay thế an toàn.</p></div>
 </div>
 )}
 {compression?.status ==="skipped" && (
 <div className="mt-3 flex gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3 text-sm text-sky-800 dark:text-sky-300">
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
 <div><p className="font-bold">Đang dùng video bạn đã nén thủ công</p><p className="mt-0.5">Tối ưu video tự động hiện tạm tắt. File được upload sẽ được phát nguyên bản.</p></div>
 </div>
 )}
 {compression?.status ==="failed" && (
 <div className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
 <p className="font-bold">Bản nén cũ chưa hoàn tất</p><p className="mt-0.5">Cơ chế nén tự động đang tạm tắt. Bạn có thể nén thủ công và upload thay thế video này.</p>
 </div>
 )}
 <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => selectVideo(e.target.files?.[0] || null)} className="mt-4 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground" />
 {videoFile && (
 <div className="mt-3 rounded-xl border border-primary/20 bg-primary/10 p-3">
 <p className="truncate text-sm font-semibold text-foreground">{videoFile.name}</p>
 <p className="mt-1 text-xs text-muted-foreground">{(videoFile.size / 1e6).toFixed(1)} MB{videoDuration ? ` · ${Math.floor(videoDuration / 60)}:${String(videoDuration % 60).padStart(2,"0")}` :" · Đang đọc thời lượng..."}</p>
 <button onClick={() => uploadVideo.mutate()} disabled={uploadVideo.isPending} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 <Upload className="h-4 w-4" /> {uploadVideo.isPending ? (videoUploadPercent === 100 ?"Đang hoàn tất..." : `Đang upload${videoUploadPercent !== null ? ` ${videoUploadPercent}%` :""}...`) :"Upload video"}
 </button>
 </div>
 )}
 </section>

 {/* Code */}
 <section className="rounded-xl border border-border bg-card p-6">
 <div><h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Code2 className="h-5 w-5" />Code trong buổi học</h2><p className="mt-1 text-sm text-muted-foreground">Các file code học sinh cần lấy.</p></div>
 <div className="mt-4 space-y-2">
 {codeFiles.map((f: any) => (
 <div key={f.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-foreground">
 <span className="flex items-center gap-2 font-semibold text-foreground"><Code2 className="h-4 w-4" />{f.filename}</span>
 <button onClick={() => deleteCode.mutate(f.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Xóa code"><Trash2 className="h-4 w-4" /></button>
 </div>
 ))}
 </div>
 <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 p-4">
 <input value={newCodeName} onChange={(e) => setNewCodeName(e.target.value)} className="w-40 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 <textarea value={newCode} onChange={(e) => setNewCode(e.target.value)} rows={5} placeholder="// code... (hoặc dán code)" className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 <button onClick={() => addCode.mutate()} disabled={!newCode.trim()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 <Plus className="h-4 w-4" /> Thêm code
 </button>
 </div>
 </section>
 </div>

 {/* Materials */}
 <section className="mt-6 rounded-xl border border-border bg-card p-6">
 <div><h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><FolderUp className="h-5 w-5" />Tài liệu</h2><p className="mt-1 text-sm text-muted-foreground">Slide, bài tập, PDF...</p></div>
 <div className="mt-3 flex flex-wrap gap-3">
 {materials.map((m: any) => (
 <div key={m.id} className="flex items-center rounded-xl border border-border bg-muted/40 text-sm font-semibold text-foreground">
 <a href={m.storageUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 px-4 py-2.5"><FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{m.name}</span></a>
 <button onClick={() => void askDeleteMaterial(m)} disabled={deleteMaterial.isPending} title={`Xóa ${m.name}`} className="mr-2 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
 </div>
 ))}
 </div>
 <input type="file" multiple onChange={(e) => setMaterialFiles(Array.from(e.target.files || []))} className="mt-4 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground" />
 {materialFiles.length > 0 && (
 <button onClick={() => uploadMaterial.mutate()} disabled={uploadMaterial.isPending} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 <Upload className="h-4 w-4" /> {uploadMaterial.isPending ?"Đang upload..." :"Upload tài liệu"}
 </button>
 )}
 </section>

 {/* Quiz builder */}
 <section className="mt-6 rounded-xl border border-border bg-card p-6">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div><h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><ClipboardList className="h-5 w-5" />Quiz buổi học</h2><p className="mt-1 text-sm text-muted-foreground">Có thể soạn trực tiếp hoặc import từ file JSON.</p></div>
 <div className="flex items-center gap-2 text-sm text-foreground">
 <span className="text-muted-foreground">Điểm đạt:</span>
 <input type="number" min={1} max={100} value={passScore} onChange={(e) => setPassScore(Number(e.target.value))} className="w-16 rounded-lg border border-input bg-card px-2 py-1 text-center text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 <span className="text-muted-foreground">%</span>
 </div>
 </div>
 <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-border py-4 text-sm text-foreground">
 <label className="inline-flex cursor-pointer items-center gap-2 border border-border bg-card px-3 py-2 font-semibold transition hover:bg-muted/40"><FileUp className="h-4 w-4" />Import quiz JSON<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void importQuizFile(event.target.files?.[0] || null); event.currentTarget.value =""; }} /></label>
 <button type="button" onClick={downloadQuizTemplate} className="inline-flex items-center gap-2 border border-border bg-card px-3 py-2 font-semibold transition hover:bg-muted/40"><Download className="h-4 w-4" />Tải file mẫu</button>
 <span className="text-xs text-muted-foreground">Gồm <code className="rounded bg-muted px-1 py-0.5 text-foreground">passScore</code>, <code className="rounded bg-muted px-1 py-0.5 text-foreground">questions</code>, <code className="rounded bg-muted px-1 py-0.5 text-foreground">options</code> và <code className="rounded bg-muted px-1 py-0.5 text-foreground">correctIndex</code> (đếm từ 0).</span>
 </div>
 <div className="mt-4 space-y-4">
 {qs.map((q: any, qi: number) => (
 <div key={qi} className="rounded-2xl border border-border bg-card p-4 text-foreground">
 <div className="flex items-center gap-2">
 <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{qi + 1}</span>
 <input value={q.question} onChange={(e) => setQs((p) => p.map((x: any, i: number) => (i === qi ? { ...x, question: e.target.value } : x)))}
 placeholder="Câu hỏi" className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 <button onClick={() => setQs((p) => p.filter((_: any, i: number) => i !== qi))} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Xóa câu hỏi"><Trash2 className="h-4 w-4" /></button>
 </div>
 <div className="mt-3 space-y-2">
 {q.options.map((opt: string, oi: number) => (
 <div key={oi} className="flex items-center gap-2">
 <button onClick={() => setQs((p) => p.map((x: any, i: number) => (i === qi ? { ...x, correctIndex: oi } : x)))}
 className={`h-5 w-5 shrink-0 rounded-full border-2 ${q.correctIndex === oi ? "border-primary bg-primary shadow-[inset_0_0_0_3px_hsl(var(--card))]" : "border-muted-foreground/40"} ${q.options.length < 2 ? "opacity-30" : ""}`} />
 <input value={opt} onChange={(e) => setQs((p: any) => p.map((x: any, i: number) => (i === qi ? { ...x, options: (x.options as string[]).map((o: string, j: number) => (j === oi ? e.target.value : o)) } : x)))}
 placeholder={`Đáp án ${oi + 1}`} className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30" />
 {q.options.length > 2 && (
 <button onClick={() => setQs((p: any) => p.map((x: any, i: number) => (i === qi ? { ...x, options: (x.options as string[]).filter((_: any, j: number) => j !== oi) } : x)))} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Xóa đáp án"><Trash2 className="h-3.5 w-3.5" /></button>
 )}
 </div>
 ))}
 </div>
 <button onClick={() => setQs((p) => p.map((x: any, i: number) => (i === qi ? { ...x, options: [...(x.options as string[]),""] } : x)))} className="mt-2 text-sm font-medium text-primary hover:underline">+ Thêm đáp án</button>
 <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm text-foreground">
 <span className="text-muted-foreground">Kỹ năng đánh giá:</span>
 <select
 value={q.skillId ||""}
 onChange={(e) => setQs((p) => p.map((x: any, i: number) => (i === qi ? { ...x, skillId: e.target.value || null } : x)))}
 className={`rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30 ${q.skillId ? "bg-primary/10" : ""}`}
 >
 <option value="">— Chưa gắn tag —</option>
 {skillOptions.map((s) => (
 <option key={s.skillId} value={s.skillId}>{s.topicName} · {s.shortName}</option>
 ))}
 </select>
 {!q.skillId && <span className="text-xs text-muted-foreground">Câu chưa gắn tag sẽ không tính vào mastery.</span>}
 </div>
 </div>
 ))}
 </div>
 <button onClick={() => setQs((p) => [...p, { question:"", options: ["",""], correctIndex: 0 }])} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2.5 font-semibold text-primary">
 <Plus className="h-4 w-4" /> Thêm câu hỏi
 </button>
 <div className="mt-4 flex justify-end">
 <button onClick={() => saveQuiz.mutate()} disabled={saveQuiz.isPending} className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 {saveQuiz.isPending ?"Đang lưu..." :"Lưu quiz"}
 </button>
 </div>
 </section>

 {/* Publish */}
 <section className="mt-8 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/40 p-6">
 <div className="flex-1">
 <h3 className="text-lg font-extrabold text-foreground">{lesson.status ==="published" ?"Buổi đang hiển thị cho học sinh" :"Buổi đang ở chế độ nháp"}</h3>
 <p className="mt-1 text-sm text-muted-foreground">Publish để buổi này xuất hiện và mở khóa cho học sinh (buổi đầu tiên sẽ là"Đang học").</p>
 {lesson.status !=="published" && (
 <div className="mt-3 flex flex-wrap gap-2">
 {publishChecks.map((item) => (
 <span key={item.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${item.complete ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
 {item.complete ?"✓" :"!"} {item.label}
 </span>
 ))}
 </div>
 )}
 </div>
 <button onClick={() => publish.mutate()} disabled={publish.isPending || (lesson.status !=="published" && !canPublish)} title={!canPublish ?"Nhập tiêu đề và hoàn thiện quiz trước khi publish" : undefined} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
 <CheckCircle2 className="h-4 w-4" /> {publish.isPending ?"Đang xử lý..." : lesson.status ==="published" ?"Chuyển về nháp" :"Publish buổi học"}
 </button>
 </section>

 <section className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 p-6">
 <h2 className="text-lg font-extrabold text-foreground">Vùng nguy hiểm</h2>
 <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Xóa vĩnh viễn buổi học sẽ xóa video, tài liệu, code, quiz và toàn bộ tiến độ liên quan. File lưu trữ được dọn qua hàng đợi có cơ chế tự thử lại nếu R2 tạm thời lỗi.</p>
 <button onClick={() => void askDeleteLesson()} disabled={deleteLesson.isPending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-destructive px-5 py-2.5 font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"><Trash2 className="h-4 w-4" /> {deleteLesson.isPending ?"Đang xóa..." :"Xóa vĩnh viễn buổi học"}</button>
 </section>
 </section>
 </main>
 );
}
