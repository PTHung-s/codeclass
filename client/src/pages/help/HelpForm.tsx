import { useState } from"react";
import { useMutation } from"@tanstack/react-query";
import { useNavigate } from"react-router-dom";
import api from"../../lib/api";
import { ArrowLeft, Loader2, Send, Plus, X } from"lucide-react";
import { Button } from"../../components/ui/button";
import { Input } from"../../components/ui/input";

export default function HelpForm() {
 const navigate = useNavigate();
 const [title, setTitle] = useState("");
 const [description, setDescription] = useState("");
 const [tags, setTags] = useState<string[]>([]);
 const [tagInput, setTagInput] = useState("");
 const [priority, setPriority] = useState("medium");
 const [error, setError] = useState("");

 const mutation = useMutation({
 mutationFn: () =>
 api.post("/help-requests", { title, description, tags, priority }),
 onSuccess: (resp) => {
 navigate(`/help/${resp.data.id}`);
 },
 onError: (err: any) => {
 setError(err.response?.data?.error ||"Lỗi khi tạo yêu cầu");
 },
 });

 function addTag() {
 const t = tagInput.trim().toLowerCase();
 if (t && !tags.includes(t)) {
 setTags([...tags, t]);
 setTagInput("");
 }
 }

 function removeTag(tag: string) {
 setTags(tags.filter((t) => t !== tag));
 }

 function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setError("");
 if (!title.trim()) { setError("Tiêu đề không được để trống"); return; }
 if (!description.trim()) { setError("Mô tả không được để trống"); return; }
 mutation.mutate();
 }

 return (
 <div className="max-w-2xl mx-auto px-4 py-8">
 <Button variant="ghost" onClick={() => navigate("/help")} className="mb-6">
 <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
 </Button>

 <div className="bg-card rounded-xl border border-border p-6">
 <h1 className="text-xl font-bold mb-1 dark:text-foreground">Tạo yêu cầu trợ giúp</h1>
 <p className="text-sm mb-6">Mô tả vấn đề bạn đang gặp phải để mọi người có thể giúp đỡ</p>

 {error && (
 <div className="bg-red-500/10 border text-sm rounded-lg p-3 mb-4">{error}</div>
 )}

 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium mb-1">Tiêu đề</label>
 <Input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="VD: Em không hiểu bài toán số nguyên tố..."
 />
 </div>

 <div>
 <label className="block text-sm font-medium mb-1">Mô tả chi tiết</label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="Hãy mô tả chi tiết vấn đề bạn gặp phải, code lỗi, hoặc câu hỏi cần giải đáp..."
 rows={6}
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
 />
 </div>

 <div>
 <label className="block text-sm font-medium mb-1">Tags</label>
 <div className="flex items-center gap-2 mb-2">
 <Input
 value={tagInput}
 onChange={(e) => setTagInput(e.target.value)}
 onKeyDown={(e) => { if (e.key ==="Enter") { e.preventDefault(); addTag(); } }}
 placeholder="Thêm tag..."
 className="flex-1"
 />
 <Button type="button" variant="outline" size="icon-sm" onClick={addTag}>
 <Plus className="w-4 h-4" />
 </Button>
 </div>
 {tags.length > 0 && (
 <div className="flex flex-wrap gap-1">
 {tags.map((tag) => (
 <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
 {tag}
 <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeTag(tag)}><X className="w-3 h-3" /></Button>
 </span>
 ))}
 </div>
 )}
 </div>

 <div>
 <label className="block text-sm font-medium mb-1">Mức độ ưu tiên</label>
 <div className="flex gap-2">
 {[
 { value: "low", label: "Thấp", color: "bg-muted text-muted-foreground" },
 { value: "medium", label: "Trung bình", color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
 { value: "high", label: "Cao", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
 ].map((opt) => (
 <button
 key={opt.value}
 type="button"
 onClick={() => setPriority(opt.value)}
 className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
 priority === opt.value
 ? `${opt.color} border-current`
 :"bg-card hover:bg-muted"
 }`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="flex justify-end gap-3 pt-4">
 <Button
 type="button"
 variant="outline"
 onClick={() => navigate("/help")}
 >
 Hủy
 </Button>
 <Button
 type="submit"
 variant="default"
 disabled={mutation.isPending}
 >
 {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
 Tạo yêu cầu
 </Button>
 </div>
 </form>
 </div>
 </div>
 );
}
