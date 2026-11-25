import { useState, useRef } from"react";
import { useMutation, useQuery } from"@tanstack/react-query";
import { useNavigate } from"react-router-dom";
import api from"../../lib/api";
import { ArrowLeft, Loader2, Send, ImagePlus, X } from"lucide-react";
import { Button } from"../../components/ui/button";
import { Input } from"../../components/ui/input";

interface Course {
 id: string;
 title: string;
}

export default function BugReportForm() {
 const navigate = useNavigate();
 const [title, setTitle] = useState("");
 const [description, setDescription] = useState("");
 const [courseId, setCourseId] = useState("");
 const [images, setImages] = useState<string[]>([]);
 const [uploading, setUploading] = useState(false);
 const [error, setError] = useState("");
 const fileInputRef = useRef<HTMLInputElement>(null);

 // Fetch courses for the dropdown
 const { data: courses } = useQuery<Course[]>({
 queryKey: ["courses-for-report"],
 queryFn: async () => {
 const res = await api.get("/courses");
 return res.data ?? [];
 },
 });

 async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
 const files = e.target.files;
 if (!files || files.length === 0) return;

 setUploading(true);
 setError("");

 for (const file of Array.from(files)) {
 // Only allow images
 if (!file.type.startsWith("image/")) {
 setError(`File"${file.name}" không phải ảnh, đã bỏ qua`);
 continue;
 }

 try {
 const formData = new FormData();
 formData.append("file", file);
 const res = await api.post("/upload", formData, {
 headers: {"Content-Type":"multipart/form-data" },
 });
 setImages((prev) => [...prev, res.data.fileUrl]);
 } catch (err: any) {
 setError(err.response?.data?.error || `Upload"${file.name}" thất bại`);
 }
 }

 setUploading(false);
 // Reset file input so same file can be re-selected
 if (fileInputRef.current) fileInputRef.current.value ="";
 }

 function removeImage(url: string) {
 setImages((prev) => prev.filter((u) => u !== url));
 }

 const mutation = useMutation({
 mutationFn: () =>
 api.post("/bug-reports", {
 title,
 description,
 images,
 courseId: courseId || null,
 }),
 onSuccess: () => {
 navigate("/bug-reports");
 },
 onError: (err: any) => {
 setError(err.response?.data?.error || err.response?.data?.detail ||"Lỗi khi gửi báo cáo");
 },
 });

 function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setError("");
 if (!title.trim()) { setError("Tiêu đề không được để trống"); return; }
 if (!description.trim()) { setError("Mô tả không được để trống"); return; }
 mutation.mutate();
 }

 return (
 <div className="max-w-2xl mx-auto px-4 py-8">
 <Button variant="ghost" size="sm" onClick={() => navigate("/bug-reports")} className="mb-6">
 <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
 </Button>

 <div className="bg-card rounded-xl border border-border p-6">
 <h1 className="text-xl font-bold mb-1 dark:text-foreground">Báo cáo lỗi</h1>
 <p className="text-sm mb-6">Mô tả lỗi bạn gặp phải để chúng tôi có thể khắc phục</p>

 {error && (
 <div className="bg-red-500/10 border text-sm rounded-lg p-3 mb-4">{error}</div>
 )}

 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label className="block text-sm font-medium mb-1">Tiêu đề</label>
 <Input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="VD: Không hiển thị kết quả sau khi nộp bài..."
 />
 </div>

 <div>
 <label className="block text-sm font-medium mb-1">Mô tả chi tiết</label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="Hãy mô tả chi tiết lỗi, các bước để tái hiện, và kết quả mong đợi..."
 rows={6}
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
 />
 </div>

 {/* Image upload */}
 <div>
 <label className="block text-sm font-medium mb-2">
 Ảnh chụp màn hình (tùy chọn)
 </label>

 {/* Preview thumbnails */}
 {images.length > 0 && (
 <div className="flex flex-wrap gap-2 mb-3">
 {images.map((url) => (
 <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border group">
 <img
 src={url}
 alt="Screenshot"
 className="w-full h-full object-cover"
 />
 <Button
 type="button"
 variant="destructive"
 size="icon-sm"
 onClick={() => removeImage(url)}
 className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 rounded-full"
 >
 <X className="w-3 h-3" />
 </Button>
 </div>
 ))}
 </div>
 )}

 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 multiple
 onChange={handleFileChange}
 className="hidden"
 />
 <Button
 type="button"
 variant="outline"
 disabled={uploading}
 onClick={() => fileInputRef.current?.click()}
 className="border-dashed"
 >
 {uploading ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <ImagePlus className="w-4 h-4" />
 )}
 {uploading ?"Đang tải lên..." :"Thêm ảnh chụp màn hình"}
 </Button>
 </div>

 {courses && courses.length > 0 && (
 <div>
 <label className="block text-sm font-medium mb-1">Khóa học liên quan (tùy chọn)</label>
 <select
 value={courseId}
 onChange={(e) => setCourseId(e.target.value)}
 className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
 >
 <option value="">-- Không chọn khóa học --</option>
 {courses.map((c) => (
 <option key={c.id} value={c.id}>{c.title}</option>
 ))}
 </select>
 </div>
 )}

 <div className="flex justify-end gap-3 pt-4">
 <Button
 type="button"
 variant="outline"
 onClick={() => navigate("/bug-reports")}
 >
 Hủy
 </Button>
 <Button
 type="submit"
 variant="default"
 disabled={mutation.isPending || uploading}
 className="bg-primary hover:bg-primary"
 >
 {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
 Gửi báo cáo
 </Button>
 </div>
 </form>
 </div>
 </div>
 );
}
