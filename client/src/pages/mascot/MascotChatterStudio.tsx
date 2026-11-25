import { useState, useEffect } from"react";
import { motion, AnimatePresence } from"framer-motion";
import { MessageSquare, Sparkles, RefreshCw, Minus, Settings, Bot, Activity, Play } from"lucide-react";
import PixelSprite from"../../components/mascot/PixelSprite";

export interface DialogueLine {
 id: string;
 speaker:"fox" |"cat"; // fox = Mèo Pixel (bên trái), cat = Cún Đốm (bên phải)
 text: string;
 expression?:"happy" |"surprised" |"thinking" |"laughing";
}

type ActionState = 1 | 2 | 3 | 4;

const ACTION_MAP: Record<
 ActionState,
 {
 label: string;
 catSprite: string;
 catFrames: number;
 catWidth: number;
 catHeight: number;
 dogSprite: string;
 dogFrames: number;
 dogWidth: number;
 dogHeight: number;
 }
> = {
 1: {
 label:"1. Vẫy đuôi & Thảnh thơi (Tailwag & Idle)",
 catSprite:"/mascots/cat_tailwag-Sheet.png",
 catFrames: 6,
 catWidth: 64,
 catHeight: 64,
 dogSprite:"/mascots/greydog_idle.-Sheet.png",
 dogFrames: 7,
 dogWidth: 64,
 dogHeight: 64,
 },
 2: {
 label:"2. Ăn uống & Sủa mừng (Eat & Bark)",
 catSprite:"/mascots/cat_eat-Sheet.png",
 catFrames: 5,
 catWidth: 64,
 catHeight: 64,
 dogSprite:"/mascots/greydog._bark-Sheet.png",
 dogFrames: 9,
 dogWidth: 64,
 dogHeight: 64,
 },
 3: {
 label:"3. Nháy mắt & Nhảy tưng tưng (Wink & Jump)",
 catSprite:"/mascots/cat_wink-Sheet.png",
 catFrames: 3,
 catWidth: 64,
 catHeight: 64,
 dogSprite:"/mascots/greydog_jump.-Sheet.png",
 dogFrames: 16,
 dogWidth: 64,
 dogHeight: 64,
 },
 4: {
 label:"4. Ngủ gật & Chạy tung tăng (Sleep & Run)",
 catSprite:"/mascots/cat_sleep-Sheet.png",
 catFrames: 8,
 catWidth: 64,
 catHeight: 64,
 dogSprite:"/mascots/greydog_run.-Sheet.png",
 dogFrames: 5,
 dogWidth: 64,
 dogHeight: 64,
 },
};

const SAMPLE_DIALOGUES: DialogueLine[] = [
 { id:"1", speaker:"fox", text:"Hôm nay các bạn học sinh cày C++ chăm chỉ ghê!", expression:"happy" },
 { id:"2", speaker:"cat", text:"Tập trung debug một tí là ra kết quả ngay nè~ 🧋", expression:"happy" },
 { id:"3", speaker:"fox", text:"Nhớ check kỹ dấu `;` ở cuối dòng trong C++ nha, quên là ăn lỗi ngay!", expression:"thinking" },
 { id:"4", speaker:"cat", text:"Bài nào khó quá cứ từ từ suy luận, không phải vội đâu 🐱", expression:"happy" },
 { id:"5", speaker:"fox", text:"Duyệt mảng từ 0 đến N-1 thôi nha, quá N-1 là Out of Bounds đó!", expression:"surprised" },
 { id:"6", speaker:"cat", text:"Xong bài rồi thì nghỉ tay làm hụm nước cho tỉnh táo nha~ 🍵", expression:"laughing" },
 { id:"7", speaker:"fox", text:"Bên kia vừa có bạn pass xong bài Mảng 2 Chiều kìa, đỉnh quá!", expression:"surprised" },
 { id:"8", speaker:"cat", text:"Woww! 100 điểm tuyệt đối! Chúc mừng các coder tài năng ✨", expression:"happy" },
];

export default function MascotChatterStudio() {
 const [widgetPosition, setWidgetPosition] = useState<"bottom-right" |"bottom-left" |"top-right">("bottom-right");
 const [scale, setScale] = useState<number>(1);
 const [autoPlay, setAutoPlay] = useState<boolean>(true);
 const [intervalMs, setIntervalMs] = useState<number>(6000);
 const [activeAction, setActiveAction] = useState<ActionState>(1);
 const [dialogueIndex, setDialogueIndex] = useState(0);
 const [minimized, setMinimized] = useState(false);
 const [customText, setCustomText] = useState("");
 const [customSpeaker, setCustomSpeaker] = useState<"fox" |"cat">("fox");

 const currentLine = SAMPLE_DIALOGUES[dialogueIndex];

 useEffect(() => {
 if (!autoPlay || minimized) return;
 const timer = setInterval(() => {
 setDialogueIndex((prev) => (prev + 1) % SAMPLE_DIALOGUES.length);
 }, intervalMs);
 return () => clearInterval(timer);
 }, [autoPlay, intervalMs, minimized]);

 const handleNext = () => {
 setDialogueIndex((prev) => (prev + 1) % SAMPLE_DIALOGUES.length);
 };

 const handlePrev = () => {
 setDialogueIndex((prev) => (prev - 1 + SAMPLE_DIALOGUES.length) % SAMPLE_DIALOGUES.length);
 };

 const handleSendCustom = () => {
 if (!customText.trim()) return;
 SAMPLE_DIALOGUES.push({
 id: `custom-${Date.now()}`,
 speaker: customSpeaker,
 text: customText.trim(),
 });
 setDialogueIndex(SAMPLE_DIALOGUES.length - 1);
 setCustomText("");
 };

 const posClasses = {"bottom-right":"fixed bottom-6 right-6","bottom-left":"fixed bottom-6 left-6","top-right":"fixed top-20 right-6",
 };

 return (
 <div className="min-h-screen bg-slate-950 p-6">
 {/* Studio Control Header */}
 <div className="mx-auto max-w-5xl space-y-6">
 <div className="flex items-center justify-between border-b pb-4">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl /20">
 <Bot className="h-6 w-6" />
 </div>
 <div>
 <h1 className="text-xl font-bold text-white">Mascot Chatter Studio</h1>
 <p className="text-xs">Xem trước 2 Mascot hiển thị trực tiếp trên Web với Khung Chat trong suốt</p>
 </div>
 </div>
 <span className="rounded-full border /10 px-3 py-1 text-xs font-semibold">
 Chế độ Sandbox / Testing
 </span>
 </div>

 {/* Control Panel Settings */}
 <div className="grid gap-6 md:grid-cols-3">
 {/* Box 1: Cấu hình Vị trí & Kích thước */}
 <div className="rounded-2xl border border-border p-5 space-y-4">
 <h3 className="flex items-center gap-2 text-sm font-bold">
 <Settings className="h-4 w-4" /> Vị trí & Thu phóng
 </h3>

 <div className="space-y-2">
 <label className="text-xs">Vị trí hiển thị:</label>
 <select
 value={widgetPosition}
 onChange={(e) => setWidgetPosition(e.target.value as any)}
 className="w-full rounded-xl border border-border p-2 text-xs text-white focus:outline-none focus:ring-1"
 >
 <option value="bottom-right">Góc dưới bên phải</option>
 <option value="bottom-left">Góc dưới bên trái</option>
 <option value="top-right">Góc trên bên phải</option>
 </select>
 </div>

 <div className="space-y-2">
 <div className="flex justify-between text-xs">
 <span>Tỷ lệ thu phóng (Scale):</span>
 <span className="font-bold text-white">{scale}x</span>
 </div>
 <input
 type="range"
 min="0.7"
 max="1.5"
 step="0.1"
 value={scale}
 onChange={(e) => setScale(parseFloat(e.target.value))}
 className="w-full accent-amber-500"
 />
 </div>
 </div>

 {/* Box 2: Đổi Hành Động */}
 <div className="rounded-2xl border border-border p-5 space-y-4">
 <h3 className="flex items-center gap-2 text-sm font-bold">
 <Activity className="h-4 w-4" /> Đổi Hành Động Mascot (1 2 3 4)
 </h3>

 <div className="grid grid-cols-2 gap-2.5">
 {([1, 2, 3, 4] as const).map((num) => (
 <button
 key={num}
 onClick={() => setActiveAction(num)}
 className={`flex flex-col items-start rounded-xl border border-border p-2.5 text-left transition ${
 activeAction === num
 ?" /20 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
 :" /80"
 }`}
 >
 <span className="text-xs font-bold text-white">Ô #{num}</span>
 <span className="text-[10px] opacity-80">{ACTION_MAP[num].label.split(".")[1]}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Box 3: Tốc độ & Lời thoại */}
 <div className="rounded-2xl border border-border p-5 space-y-4">
 <h3 className="flex items-center gap-2 text-sm font-bold">
 <Play className="h-4 w-4" /> Tự động & Lời thoại Custom
 </h3>

 <div className="flex items-center justify-between">
 <span className="text-xs">Tự động chuyển câu thoại:</span>
 <button
 onClick={() => setAutoPlay(!autoPlay)}
 className={`rounded-full px-3 py-1 text-xs font-bold transition ${
 autoPlay ?"/20 border" :""
 }`}
 >
 {autoPlay ?"ON" :"OFF"}
 </button>
 </div>

 <div className="flex gap-2">
 <button
 onClick={() => setCustomSpeaker("fox")}
 className={`flex-1 rounded-lg py-1 text-xs font-bold transition ${
 customSpeaker ==="fox" ?"text-slate-950" :""
 }`}
 >
 🐱 Mèo (Trái)
 </button>
 <button
 onClick={() => setCustomSpeaker("cat")}
 className={`flex-1 rounded-lg py-1 text-xs font-bold transition ${
 customSpeaker ==="cat" ?"text-white" :""
 }`}
 >
 🐶 Cún (Phải)
 </button>
 </div>

 <div className="flex gap-2">
 <input
 type="text"
 value={customText}
 onChange={(e) => setCustomText(e.target.value)}
 placeholder="Nhập lời thoại..."
 className="flex-1 rounded-xl border border-border px-3 py-1.5 text-xs text-white placeholder: focus:outline-none focus:ring-1"
 />
 <button
 onClick={handleSendCustom}
 className="rounded-xl px-3 py-1.5 text-xs font-bold text-white"
 >
 Nói
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* ════════════════════════════════════════════════════════════════ */}
 {/* ── MASCOT CHATTER WIDGET COMPONENT (NO BOX, DYNAMIC ARROW) ── */}
 {/* ════════════════════════════════════════════════════════════════ */}

 {minimized ? (
 <motion.button
 initial={{ scale: 0.8 }}
 animate={{ scale: 1 }}
 onClick={() => setMinimized(false)}
 className={`${posClasses[widgetPosition]} z-50 flex items-center gap-2 rounded-full border /90 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-2xl backdrop-blur transition hover:scale-105`}
 >
 <Sparkles className="h-4 w-4 animate-spin" />
 <span>Mascot AI (🐱🐶)</span>
 </motion.button>
 ) : (
 <div
 className={`${posClasses[widgetPosition]} z-50 flex flex-col items-center gap-2 pointer-events-none transition-all duration-300`}
 style={{ transform: `scale(${scale})`, transformOrigin: widgetPosition.includes("right") ?"bottom right" :"bottom left" }}
 >
 {/* Transparent Glass Speech Bubble */}
 <AnimatePresence mode="wait">
 {currentLine && (
 <motion.div
 key={currentLine.id}
 initial={{ opacity: 0, y: 12, scale: 0.92 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -8, scale: 0.92 }}
 transition={{ type:"spring", stiffness: 400, damping: 25 }}
 className="pointer-events-auto relative w-72 rounded-2xl border border-white/20 bg-slate-950/75 p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md"
 >
 {/* Dynamic Tail Arrow pointing exactly at speaker's head */}
 <div
 className={`absolute -bottom-2 h-3.5 w-3.5 rotate-45 border-b border-r border-white/20 bg-slate-950/75 backdrop-blur-md transition-all duration-300 ${
 currentLine.speaker ==="fox" ?"left-[52px]" :"right-[52px]"
 }`}
 />

 {/* Header */}
 <div className="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1">
 <div className="flex items-center gap-1.5">
 <span
 className={`inline-block h-2 w-2 rounded-full ${
 currentLine.speaker ==="fox" ?" animate-pulse" :" animate-pulse"
 }`}
 />
 <span
 className={`text-[11px] font-black tracking-wide uppercase ${
 currentLine.speaker ==="fox" ?"" :""
 }`}
 >
 {currentLine.speaker ==="fox" ?"🐱 Mèo Pixel" :"🐶 Cún Đốm"}
 </span>
 </div>
 <div className="flex items-center gap-1">
 <button
 onClick={handleNext}
 title="Câu tiếp"
 className="rounded p-0.5 hover:bg-card/10 hover:text-white transition"
 >
 <RefreshCw className="h-3 w-3" />
 </button>
 <button
 onClick={() => setMinimized(true)}
 title="Thu nhỏ"
 className="rounded p-0.5 hover:bg-card/10 hover:text-white transition"
 >
 <Minus className="h-3 w-3" />
 </button>
 </div>
 </div>

 {/* Text Body */}
 <p className="text-xs font-medium leading-relaxed">
 {currentLine.text}
 </p>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Direct Mascots Rendering without any surrounding Box/Dock */}
 <div className="pointer-events-auto flex items-end justify-center gap-10 px-4 pt-1">
 {/* Mascot 1: 🐱 Mèo Pixel (Bên trái) */}
 <div
 className="group relative flex flex-col items-center cursor-pointer"
 onClick={() => {
 setDialogueIndex((prev) => (prev % 2 === 0 ? prev : (prev + 1) % SAMPLE_DIALOGUES.length));
 }}
 >
 <motion.div
 animate={{ y: [0, -4, 0] }}
 transition={{ repeat: Infinity, duration: 2.2, ease:"easeInOut" }}
 className="relative flex items-center justify-center transition group-hover:scale-110"
 >
 <PixelSprite
 src={ACTION_MAP[activeAction].catSprite}
 frameWidth={ACTION_MAP[activeAction].catWidth}
 frameHeight={ACTION_MAP[activeAction].catHeight}
 totalFrames={ACTION_MAP[activeAction].catFrames}
 fps={7}
 className="drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)]"
 />
 </motion.div>
 </div>

 {/* Mascot 2: 🐶 Cún Pixel (Bên phải) */}
 <div
 className="group relative flex flex-col items-center cursor-pointer"
 onClick={() => {
 setDialogueIndex((prev) => (prev % 2 === 1 ? prev : (prev + 1) % SAMPLE_DIALOGUES.length));
 }}
 >
 <motion.div
 animate={{ y: [0, -4, 0] }}
 transition={{ repeat: Infinity, duration: 2.5, ease:"easeInOut", delay: 0.2 }}
 className="relative flex items-center justify-center transition group-hover:scale-110"
 >
 <PixelSprite
 src={ACTION_MAP[activeAction].dogSprite}
 frameWidth={ACTION_MAP[activeAction].dogWidth}
 frameHeight={ACTION_MAP[activeAction].dogHeight}
 totalFrames={ACTION_MAP[activeAction].dogFrames}
 fps={7}
 className="drop-shadow-[0_4px_12px_rgba(168,85,247,0.5)]"
 />
 </motion.div>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
