import { useState, useRef, useEffect } from"react";
import api from"../../lib/api";
import { Button } from"../../components/ui/button";
import { Badge } from"../../components/ui/badge";
import { Sparkles, Send, Play, Eye, Code, Trash2, ChevronDown, ChevronUp, Copy, Check } from"lucide-react";
import { SyntaxHighlighter, oneDark } from"../../components/ui/CodeHighlighter";

interface AIResponse {
 explanation: string;
 code: string | null;
 mode:"preview" |"execute";
 output?: string;
 status?: string;
}

interface LogEntry {
 id: string;
 prompt: string;
 mode: string;
 code: string | null;
 result: string | null;
 status: string;
 createdAt: string;
}

export default function AIAdmin() {
 const [prompt, setPrompt] = useState("");
 const [loading, setLoading] = useState(false);
 const [response, setResponse] = useState<AIResponse | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [history, setHistory] = useState<LogEntry[]>([]);
 const [showHistory, setShowHistory] = useState(false);
 const [expandedLog, setExpandedLog] = useState<string | null>(null);
 const chatEndRef = useRef<HTMLDivElement>(null);
 const inputRef = useRef<HTMLTextAreaElement>(null);

 useEffect(() => {
 chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
 }, [response, loading]);

 useEffect(() => {
 if (showHistory) fetchHistory();
 }, [showHistory]);

 const fetchHistory = async () => {
 try {
 const res = await api.get("/ai/history?limit=20");
 setHistory(res.data);
 } catch {
 // silent
 }
 };

 const submitPrompt = async (mode:"preview" |"execute") => {
 if (!prompt.trim()) return;
 setLoading(true);
 setError(null);
 setResponse(null);

 try {
 const res = await api.post("/ai/admin", { prompt: prompt.trim(), mode });
 setResponse(res.data);
 } catch (err: any) {
 setError(err.response?.data?.error || err.message ||"Lỗi không xác định");
 } finally {
 setLoading(false);
 }
 };

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (e.key ==="Enter" && e.ctrlKey) {
 e.preventDefault();
 submitPrompt("preview");
 }
 };

 const samplePrompts = ["Kiểm tra khóa học Python hiện có và liệt kê tất cả modules + lessons","Tạo bài học về vòng lặp for, mức cơ bản, cho module Biến và kiểu dữ liệu","Thêm interactive code editor vào bài học Nhập xuất dữ liệu trong Python","Tạo 1 problem mới: Tính tổng S = 1 + 2 + ... + N với input từ bàn phím",
 ];

 return (
 <div className="flex flex-col h-full">
 <div className="flex items-center justify-between px-6 py-4 border-b border-border">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
 <Sparkles className="w-5 h-5 text-primary" />
 </div>
 <div>
 <h1 className="text-lg font-semibold text-foreground">AI Admin</h1>
 <p className="text-sm text-muted-foreground">Tạo và sửa nội dung bằng tiếng Việt</p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setShowHistory(!showHistory)}
 className="text-muted-foreground"
 >
 <Code className="w-4 h-4" />
 Lịch sử
 {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => {
 setResponse(null);
 setError(null);
 setPrompt("");
 }}
 className="text-muted-foreground"
 >
 <Trash2 className="w-4 h-4" />
 Xóa chat
 </Button>
 </div>
 </div>

 <div className="flex-1 overflow-auto">
 {showHistory && (
 <div className="border-b border-border bg-muted p-4">
 <h2 className="text-sm font-semibold mb-2">Lịch sử prompt</h2>
 <div className="space-y-1 max-h-64 overflow-auto">
 {history.map((log) => (
 <div key={log.id} className="border border-border rounded-lg bg-card">
 <Button
 variant="ghost"
 onClick={() => {
 setExpandedLog(expandedLog === log.id ? null : log.id);
 setPrompt(log.prompt);
 }}
 className="w-full text-left px-3 py-2 flex items-center justify-between"
 >
 <span className="text-sm truncate flex-1 mr-2">{log.prompt}</span>
 <Badge variant="secondary" className={`shrink-0 ${log.status ==="success" ?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :"bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
 {log.mode}
 </Badge>
 </Button>
 {expandedLog === log.id && log.code && (
 <div className="px-3 pb-2">
 <SyntaxHighlighter
 language="typescript"
 style={oneDark}
 customStyle={{ borderRadius:"0.375rem", fontSize:"0.7rem", margin: 0, maxHeight:"12rem" }}
 >
 {log.code}
 </SyntaxHighlighter>
 {log.result && (
 <div className="mt-1 text-xs rounded p-2 max-h-32 overflow-auto">
 <code>{log.result}</code>
 </div>
 )}
 </div>
 )}
 </div>
 ))}
 {history.length === 0 && (
 <p className="text-sm text-center py-4">Chưa có lịch sử</p>
 )}
 </div>
 </div>
 )}

 <div className="p-6">
 {!response && !error && (
 <div className="flex flex-col items-center justify-center py-12 text-center">
 <Sparkles className="w-12 h-12 text-primary mb-4" />
 <h2 className="text-lg font-semibold mb-2">Bạn muốn làm gì hôm nay?</h2>
 <p className="text-sm mb-6 max-w-md">
 Nhập prompt bằng tiếng Việt. AI sẽ tạo code để thao tác với database: tạo bài tập, sửa bài học, thêm interactive elements, v.v.
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
 {samplePrompts.map((s, i) => (
 <Button
 key={i}
 variant="outline"
 size="sm"
 onClick={() => setPrompt(s)}
 className="text-left text-xs text-muted-foreground bg-muted hover:bg-primary/10 hover:text-primary border-border h-auto py-2.5 px-3 whitespace-normal leading-relaxed"
 >
 {s}
 </Button>
 ))}
 </div>
 </div>
 )}

 {error && (
 <div className="bg-red-500/10 border border-border rounded-lg p-4 mb-4">
 <p className="text-sm font-medium mb-1">Lỗi</p>
 <p className="text-sm">{error}</p>
 </div>
 )}

 {response && (
 <div className="space-y-4">
 {response.explanation && (
 <div className="prose prose-sm max-w-none whitespace-pre-wrap">
 {response.explanation}
 </div>
 )}

 {response.code && (
 <div>
 <div className="flex items-center gap-2 mb-2">
 <Code className="w-4 h-4 text-muted-foreground" />
 <span className="text-xs font-medium uppercase">TypeScript Code</span>
 </div>
 <div className="relative">
 <SyntaxHighlighter
 language="typescript"
 style={oneDark}
 customStyle={{ borderRadius:"0.5rem", fontSize:"0.8rem", margin: 0, maxHeight:"24rem" }}
 >
 {response.code}
 </SyntaxHighlighter>
 <Button
 variant="ghost"
 size="icon-sm"
 onClick={() => {
 navigator.clipboard.writeText(response.code ||"");
 }}
 className="absolute top-2 right-2 hover:text-white"
 title="Sao chép code"
 >
 <Copy className="w-3.5 h-3.5" />
 </Button>
 </div>
 <div className="flex items-center gap-2 mt-2">
 {response.mode ==="preview" && (
 <Button
 variant="default"
 onClick={() => submitPrompt("execute")}
 disabled={loading}
 >
 <Play className="w-4 h-4" />
 Thực thi ngay
 </Button>
 )}
 </div>
 </div>
 )}

 {response.output !== undefined && (
 <div>
 <div className="flex items-center gap-2 mb-2">
 <span className="text-xs font-medium uppercase">Kết quả thực thi</span>
 <Badge variant="secondary" className={`${response.status ==="success" ?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :"bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
 {response.status ==="success" ?"Thành công" :"Lỗi"}
 </Badge>
 </div>
 <pre className={`rounded-lg p-4 text-sm overflow-auto max-h-64 ${response.status ==="success" ?"bg-muted text-foreground border border-border" :"bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25"}`}>
 <code>{response.output ||"(không có output)"}</code>
 </pre>
 {response.status ==="success" && (
 <p className="text-xs mt-1">Script đã chạy xong. Kiểm tra kết quả trên web (F5 nếu cần).</p>
 )}
 {response.status ==="error" && (
 <div className="bg-amber-500/10 border border-border rounded-lg p-3 mt-2">
 <p className="text-xs">
 <strong>Gợi ý:</strong> Nếu lỗi SQLITE_BUSY, hãy tắt server, chạy lại script, rồi bật server. Nếu lỗi khác, kiểm tra lại code hoặc thử prompt chi tiết hơn.
 </p>
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {loading && (
 <div className="flex items-center gap-3 py-8">
 <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
 <span className="text-sm text-muted-foreground">
 {response ?"Đang thực thi script..." :"AI đang xử lý..."}
 </span>
 </div>
 )}

 <div ref={chatEndRef} />
 </div>
 </div>

 <div className="border-t border-border p-4 bg-card">
 <div className="flex items-end gap-3 max-w-4xl mx-auto">
 <textarea
 ref={inputRef}
 value={prompt}
 onChange={(e) => setPrompt(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder="Mô tả bạn muốn làm gì... (Ctrl+Enter để preview)"
 rows={2}
 disabled={loading}
 className="flex-1 resize-none rounded-lg border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 placeholder:text-muted-foreground"
 />
 <Button
 variant="outline"
 onClick={() => submitPrompt("preview")}
 disabled={loading || !prompt.trim()}
 title="Xem trước code (Ctrl+Enter)"
 className="shrink-0"
 >
 <Eye className="w-4 h-4" />
 Preview
 </Button>
 <Button
 variant="default"
 onClick={() => submitPrompt("execute")}
 disabled={loading || !prompt.trim()}
 title="Thực thi ngay"
 className="shrink-0 bg-primary hover:bg-primary text-white"
 >
 {loading ? (
 <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
 ) : (
 <Send className="w-4 h-4" />
 )}
 Thực thi
 </Button>
 </div>
 <p className="text-xs mt-1.5 text-center">
 Ctrl+Enter để preview | Prompt bằng tiếng Việt | AI sẽ tạo code TypeScript để thao tác database
 </p>
 </div>
 </div>
 );
}
