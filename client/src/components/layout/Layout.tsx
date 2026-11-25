import { useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
// AIChatWidget tạm ẩn toàn bộ — học sinh exploit để nhờ AI giải bài.
// import AIChatWidget from "../chat/AIChatWidget";
import PeerChatWidget from "../chat/PeerChatWidget";
import MascotDock from "../mascot/MascotDock";
import TeacherPresenceWidget from "../monitor/TeacherPresenceWidget";
import RecordingIndicator from "../monitor/RecordingIndicator";
import ToastContainer from "../ui/ToastContainer";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import FloatingRewardContainer from "../ui/FloatingRewardContainer";
import PerfOverlay from "../ui/PerfOverlay";
import HonourOverlay from "../honour/HonourOverlay";
import ShieldFixAnnouncement from "../announcements/ShieldFixAnnouncement";
import useBalanceRewards from "../../hooks/useBalanceRewards";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useTimeTracker } from "../../hooks/useTimeTracker";
import { usePresenceReporter } from "../../hooks/usePresenceReporter";
import { useSessionRecorder } from "../../hooks/useSessionRecorder";

export default function Layout() {
  useTimeTracker();
  usePresenceReporter();
  useBalanceRewards(); // float "+N EXP"/"+N vàng" on any balance change (universal backbone)
  const isRecording = useSessionRecorder();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Show labels on first visit; users can still collapse the rail when they know the app.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  useKeyboardShortcuts(); // Enable keyboard shortcuts

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <>
      <RecordingIndicator active={isRecording} />
      <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors">
        {/* Mobile backdrop overlay */}
        {mobileSidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
        )}

        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={closeMobileSidebar}
          onToggleDesktop={toggleSidebarCollapse}
          collapsed={sidebarCollapsed}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar onToggleMobileSidebar={toggleMobileSidebar} />
          <main
            data-app-scroll-main
            className="min-h-0 flex-1 overflow-auto bg-background p-4 transition-colors md:p-6 lg:p-8"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <ErrorBoundary key={location.pathname}>
                  <Outlet />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* AIChatWidget đã ẩn — học sinh exploit */}
        <PeerChatWidget />
        <MascotDock />
        <TeacherPresenceWidget />
        <ToastContainer />
        <FloatingRewardContainer />
        <PerfOverlay />
        <HonourOverlay />
        {/* Thông báo một lần về sửa lỗi Khiên bảo vệ chuỗi */}
        <ShieldFixAnnouncement />
      </div>
    </>
  );
}
