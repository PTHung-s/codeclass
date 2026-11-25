import { useState } from"react";
import { FileText, Code, CheckSquare } from"lucide-react";
import LessonManagerTab from"../../components/content/LessonManagerTab";
import ProblemManagerTab from"../../components/content/ProblemManagerTab";
import QuizManagerTab from"../../components/content/QuizManagerTab";

type Tab ="lessons" |"problems" |"quizzes";

export default function ContentManager() {
 const [activeTab, setActiveTab] = useState<Tab>("lessons");

 return (
 <div className="space-y-6">
 <div>
 <h1 className="text-3xl font-bold dark:text-foreground">Quản lý nội dung</h1>
 <p className="text-sm text-muted-foreground mt-1">Tạo, sửa, xóa bài học, đề code và đề quiz</p>
 </div>

 {/* Tabs */}
 <div className="border-b border-border">
 <nav className="-mb-px flex space-x-8">
 <button
 onClick={() => setActiveTab("lessons")}
 className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
 activeTab ==="lessons"
 ?"border-primary text-primary"
 :"border-transparent text-muted-foreground hover:text-foreground"
 }`}
 >
 <FileText className="h-5 w-5" />
 Bài học
 </button>
 <button
 onClick={() => setActiveTab("problems")}
 className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
 activeTab ==="problems"
 ?"border-primary text-primary"
 :"border-transparent text-muted-foreground hover:text-foreground"
 }`}
 >
 <Code className="h-5 w-5" />
 Đề code
 </button>
 <button
 onClick={() => setActiveTab("quizzes")}
 className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
 activeTab ==="quizzes"
 ?"border-primary text-primary"
 :"border-transparent text-muted-foreground hover:text-foreground"
 }`}
 >
 <CheckSquare className="h-5 w-5" />
 Đề quiz
 </button>
 </nav>
 </div>

 {/* Tab content */}
 <div className="py-6">
 {activeTab ==="lessons" && <LessonManagerTab />}
 {activeTab ==="problems" && <ProblemManagerTab />}
 {activeTab ==="quizzes" && <QuizManagerTab />}
 </div>
 </div>
 );
}
