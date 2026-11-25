import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileVideo, Info, Play, RotateCcw, StopCircle } from "lucide-react";

import { MascotWithSpeech } from "../../components/mascot/mascot-with-speech";
import { useMascot } from "../../components/mascot/mascot-provider";
import {
  MASCOT_STATE_LIST,
  MASCOT_STATES,
  type MascotState,
} from "../../components/mascot/mascot-config";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";

const DEMO_SEQ: MascotState[] = ["cheer", "celebrate", "sad", "scared", "hype"];

export default function MascotDemoPage() {
  const { state, trigger, say, toIdle } = useMascot();
  const [demo, setDemo] = useState(false);
  const [speech, setSpeech] = useState("Xin chào! Mình là trợ lý học tập của em 👋");
  const def = MASCOT_STATES[state];

  function runDemo() {
    if (demo) return;
    setDemo(true);
    let i = 0;
    trigger(DEMO_SEQ[0]);
    const id = setInterval(() => {
      i += 1;
      if (i >= DEMO_SEQ.length) {
        clearInterval(id);
        toIdle();
        setDemo(false);
        return;
      }
      trigger(DEMO_SEQ[i]);
    }, 2500);
  }

  return (
    <div className="min-h-svh flex flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <Link
            to="/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Về Dashboard"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="leading-tight">
            <p className="font-semibold">Mascot demo</p>
            <p className="text-xs text-muted-foreground">
              7 trạng thái · speech bubble · cảm xúc học tập
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6">
        {/* Sân khấu mascot */}
        <section className="flex flex-col items-center justify-center gap-4 rounded-2xl border bg-background py-12">
          <MascotWithSpeech size={280} speech={speech} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge variant="outline" className="text-sm">
              {def.emoji} {def.label}
            </Badge>
            <span className="text-xs text-muted-foreground">/mascot/{state}.gif</span>
          </div>
          <p className="max-w-md text-center text-xs text-muted-foreground">{def.useCase}</p>

          {/* Điều khiển speech bubble */}
          <div className="flex w-full max-w-md flex-col gap-2">
            <label className="text-sm font-medium">Thông điệp (speech bubble):</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={speech}
                onChange={(e) => setSpeech(e.target.value)}
                placeholder="Nhập text để mascot nói..."
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm bg-background"
              />
              <Button variant="ghost" size="sm" onClick={() => setSpeech("")}>
                Xóa
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={runDemo} disabled={demo}>
              {demo ? <RotateCcw className="animate-spin" /> : <Play />}
              {demo ? "Đang chạy demo…" : "Chạy demo tự động"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toIdle()}>
              <StopCircle /> Về idle
            </Button>
          </div>
        </section>

        {/* Lưu ý chaining sad */}
        <Card className="border-blue-500/30 bg-blue-50/50 shadow-none">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <div className="text-sm">
              <p>
                <strong>Sad gồm 2 clip nối nhau:</strong> gọi{" "}
                <code className="font-mono">say(&quot;sad&quot;, ...)</code> sẽ tự chơi{" "}
                <code className="font-mono">sad_enter</code> trước rồi vào loop{" "}
                <code className="font-mono">sad</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Scale sizes demo */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Scale sizes demo</h2>
          <div className="flex flex-wrap items-end justify-center gap-8 rounded-2xl border bg-background p-8">
            <div className="flex flex-col items-center gap-2">
              <MascotWithSpeech size={120} speech="Nhỏ 120px" />
              <span className="text-xs text-muted-foreground">size=120</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <MascotWithSpeech size={180} speech="Vừa 180px" />
              <span className="text-xs text-muted-foreground">size=180</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <MascotWithSpeech size={240} speech="Chuẩn 240px (mặc định)" />
              <span className="text-xs text-muted-foreground">size=240</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <MascotWithSpeech size={320} speech="Lớn 320px — text dài hơn để thấy xuống dòng" />
              <span className="text-xs text-muted-foreground">size=320</span>
            </div>
          </div>
        </section>

        {/* Điều khiển 7 trạng thái */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Kích hoạt trạng thái</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MASCOT_STATE_LIST.map((s) => (
              <Card key={s.id} className={`shadow-none ${state === s.id ? "border-primary" : ""}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="text-2xl">{s.emoji}</span>
                    {s.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{s.useCase}</p>
                  <div className="flex flex-wrap gap-1">
                    {s.loop ? (
                      <Badge variant="secondary" className="text-[10px]">lặp</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        hết clip → {s.next ?? "idle"}
                      </Badge>
                    )}
                    {s.enter ? (
                      <Badge className="border-transparent bg-blue-100 text-[10px] text-blue-700">
                        {s.enter} trước
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={state === s.id ? "default" : "outline"}
                      onClick={() => trigger(s.id)}
                    >
                      <Play /> Phát
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => say(s.id, speech || def.label)}>
                      Nói
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Hướng dẫn media */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileVideo className="size-4" /> Media mascot
              </CardTitle>
              <CardDescription>
                Component tự nhận file theo tên trạng thái. Đang dùng 7 file .gif trong{" "}
                <code className="font-mono text-xs">client/public/mascot/</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1.5 pr-3 font-medium">Trạng thái</th>
                      <th className="py-1.5 font-medium">File .gif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MASCOT_STATE_LIST.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">{s.emoji} {s.label}</td>
                        <td className="py-1.5 font-mono">{s.id}.gif</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Ưu tiên <strong>.gif</strong> (qua <code className="font-mono">&lt;img&gt;</code>, nền
                trong suốt). Không có .gif → fallback <strong>.webm</strong> rồi <strong>.mp4</strong>.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
