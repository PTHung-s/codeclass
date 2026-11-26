import React, { useCallback, useEffect, useMemo } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import type { IJsonModel } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';

import { SFUVideoGrid } from './SFUVideoGrid';
import CodeEditor from './CodeEditor';
import CodeTerminal from './CodeTerminal';
import CodeInput from './CodeInput';
import CustomChat from './CustomChat';
import { AssignmentView } from './AssignmentView';
import { QuizRunner } from './QuizRunner';
import { useMeetingStore } from '../store/useMeetingStore';

const getLayout = (hasQuiz: boolean): IJsonModel => ({
  global: {
    tabEnableClose: false,
    tabSetEnableTabStrip: true,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        id: "video_tabset",
        weight: 50,
        children: [
          { type: "tab", id: "video", name: "Cuộc họp", component: "video" }
        ]
      },
      {
        type: "row",
        id: "right_column",
        weight: 50,
        children: [
          {
            type: "tabset",
            weight: 70,
            id: "editor_tabset",
            children: [
              { type: "tab", id: "code", name: "Trình code", component: "code" },
              { type: "tab", id: "assignment", name: "Đề bài", component: "assignment" },
              ...(hasQuiz ? [{ type: "tab", id: "quiz", name: "Trắc nghiệm", component: "quiz" }] : [])
            ]
          },
          {
            type: "tabset",
            weight: 30,
            id: "terminal_tabset",
            children: [
              { type: "tab", id: "terminal", name: "Output", component: "terminal" },
              { type: "tab", id: "input", name: "Input", component: "input" }
            ]
          }
        ]
      }
    ]
  }
});

export const MeetingWorkspace: React.FC<{
  onShowHistory: (socketId: string) => void;
  sfuMode?: boolean;
}> = ({ onShowHistory, sfuMode = false }) => {
  const { activeQuiz, activeAdaptive } = useMeetingStore();

  const hasQuiz = !!activeQuiz || !!activeAdaptive;

  // Tạo model MỘT LẦN — giữ nguyên layout & không unmount Video/Monaco khi mở/đóng Quiz
  const model = useMemo(() => Model.fromJson(getLayout(false)), []);

  // Thêm / xóa tab "quiz" động khi có bài trắc nghiệm
  useEffect(() => {
    try {
      const existing = model.getNodeById('quiz');
      if (hasQuiz && !existing) {
        const target = model.getNodeById('editor_tabset') || model.getFirstTabSet();
        if (target) {
          model.doAction(
            Actions.addNode(
              { type: 'tab', id: 'quiz', name: 'Trắc nghiệm', component: 'quiz' },
              target.getId(),
              DockLocation.CENTER,
              -1,
              true,
            ),
          );
        }
      } else if (hasQuiz && existing) {
        model.doAction(Actions.selectTab('quiz'));
      } else if (!hasQuiz && existing) {
        model.doAction(Actions.deleteTab('quiz'));
      }
    } catch { /* noop */ }
  }, [hasQuiz, model]);

  // Lắng nghe yêu cầu chuyển tab (vd: host bấm "Xem code" → tự mở tab Trình code)
  useEffect(() => {
    const onSelect = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab;
      if (!tab) return;
      try { model.doAction(Actions.selectTab(tab)); } catch { /* tab chưa tồn tại */ }
    };
    const onPreset = (e: Event) => {
      const preset = (e as CustomEvent).detail as 'balanced' | 'code' | 'video' | undefined;
      if (!preset) return;
      const weights =
        preset === 'code'
          ? { video: 30, right: 70 }
          : preset === 'video'
            ? { video: 70, right: 30 }
            : { video: 50, right: 50 };
      try {
        if (model.getNodeById('video_tabset')) {
          model.doAction(Actions.updateNodeAttributes('video_tabset', { weight: weights.video }));
        }
        if (model.getNodeById('right_column')) {
          model.doAction(Actions.updateNodeAttributes('right_column', { weight: weights.right }));
        }
      } catch { /* noop */ }
    };
    window.addEventListener('meet:selectTab', onSelect);
    window.addEventListener('meet:layoutPreset', onPreset);
    return () => {
      window.removeEventListener('meet:selectTab', onSelect);
      window.removeEventListener('meet:layoutPreset', onPreset);
    };
  }, [model]);

  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent();

    switch (component) {
      case "video":
        return <SFUVideoGrid onShowHistory={onShowHistory} />;
      case "code":
        return <CodeEditor />;
      case "terminal":
        return <CodeTerminal />;
      case "input":
        return <CodeInput />;
      case "assignment":
        return <AssignmentView />;
      case "quiz":
        return <QuizRunner />;
      case "chat":
        return <CustomChat />;
      default:
        return <div>Component not found</div>;
    }
  }, [onShowHistory, sfuMode]);

  return (
    <div className="flex-1 relative h-full bg-base">
      <Layout model={model} factory={factory} />
    </div>
  );
};
