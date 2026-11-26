import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Loader2, Trash2, Download, Eye, EyeOff, Bot, Lock, Headphones } from 'lucide-react';
import SaveCodeBar from './SaveCodeBar';
import { useMeetingStore } from '../store/useMeetingStore';
import { pistonService, commonLanguages } from '../services/piston';
import { socket } from '../services/socket';
import { toggleSoloPeer } from '../lib/audioActions';
import { playSoundCue } from '../lib/soundCue';

const CURSOR_COLORS = [
  '#FF5252', '#448AFF', '#4CAF50', '#FFD740', '#E040FB', '#18FFFF', 
  '#FF4081', '#7C4DFF', '#EEFF41', '#FFAB40'
];

const CodeEditor: React.FC = () => {
  const {
    code,
    setCode,
    selectedLanguage,
    setSelectedLanguage,
    setOutput,
    isRunning,
    setIsRunning,
    roomId,
    isHost,
    hostId,
    peers,
    peerCodes,
    peerCursors,
    viewingPeerCode,
    setViewingPeerCode,
    updatePeerCode,
    updatePeerCursor,
    removePeerCursor,
    stdin,
    attachToAi,
    activeQuiz,
    activeAdaptive,
    audioMode,
    hearHost,
  } = useMeetingStore();

  const [isEditorReady, setIsEditorReady] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const modelContentChangeRef = useRef<any>(null);
  const isApplyingRemoteChange = useRef(false);
  const decorationsRef = useRef<Record<string, string[]>>({});
  const viewingPeerCodeRef = useRef<string | null>(viewingPeerCode);
  const selectedLanguageRef = useRef(selectedLanguage);
  const handleRunCodeRef = useRef<() => void>(() => {});
  
  // Tracking activity stats
  const activityRef = useRef({ added: 0, deleted: 0 });

  // Đồng bộ refs cho các Monaco listeners
  useEffect(() => {
    viewingPeerCodeRef.current = viewingPeerCode;
  }, [viewingPeerCode]);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsEditorReady(true);

    // Listen for paste event directly in Monaco to ensure it's captured
    editor.onDidPaste((e: any) => {
      const state = useMeetingStore.getState();
      if (state.isHost) return;

      const now = Date.now();
      const lastPaste = (window as any)._lastPasteTime || 0;
      if (now - lastPaste < 200) return; 
      (window as any)._lastPasteTime = now;

      const pastedText = (editor.getModel().getValueInRange(e.range) || "");
      const internalCopy = ((window as any)._lastInternalCopy || "");
      
      const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

      if (pastedText.trim() && normalize(pastedText) !== normalize(internalCopy)) {
        socket.emit('user:violation', { roomId, type: 'external-paste', text: pastedText.slice(0, 300) });
        console.warn("Monaco: External content paste detected");
      }
    });

    // Capture internal copy & cut in Monaco reliably
    const recordInternalSelection = () => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (!selection || !model) return;
      const text = model.getValueInRange(selection);
      if (text) {
        (window as any)._lastInternalCopy = text;
      }
    };
    editor.getDomNode()?.addEventListener('copy', recordInternalSelection);
    editor.getDomNode()?.addEventListener('cut', recordInternalSelection);

    // Level 1: Listen for cursor position changes
    editor.onDidChangeCursorPosition((e: any) => {
      if (isApplyingRemoteChange.current) return;
      
      const position = {
        lineNumber: e.position.lineNumber,
        column: e.position.column
      };

      const state = useMeetingStore.getState();
      if (state.isHost) {
        const targetId = viewingPeerCodeRef.current;
        if (!targetId) return;
        socket.emit('cursor:sync', { roomId, targetSocketId: targetId, cursor: position });
      } else {
        socket.emit('cursor:sync', { roomId, cursor: position });
      }
    });

    // Level 1: Listen for selection changes
    editor.onDidChangeCursorSelection((e: any) => {
      if (isApplyingRemoteChange.current) return;

      const state = useMeetingStore.getState();
      const payloadCursor = {
        lineNumber: e.selection.positionLineNumber,
        column: e.selection.positionColumn,
        selection: e.selection,
      };
      if (state.isHost) {
        const targetId = viewingPeerCodeRef.current;
        if (!targetId) return;
        socket.emit('cursor:sync', { roomId, targetSocketId: targetId, cursor: payloadCursor });
      } else {
        socket.emit('cursor:sync', { roomId, cursor: payloadCursor });
      }
    });

    // Level 2: Listen for model content changes (Deltas)
    modelContentChangeRef.current = editor.onDidChangeModelContent((e: any) => {
      if (isApplyingRemoteChange.current) return;

      const state = useMeetingStore.getState();
      if (state.isHost && viewingPeerCodeRef.current) {
        socket.emit('code:delta', {
          roomId,
          targetSocketId: viewingPeerCodeRef.current,
          changes: e.changes,
          language: selectedLanguageRef.current,
        });
      } else if (!state.isHost) {
        socket.emit('code:delta', {
          roomId,
          changes: e.changes,
          language: selectedLanguageRef.current,
        });

        let added = 0;
        let deleted = 0;
        e.changes.forEach((change: any) => {
          added += change.text.length;
          deleted += change.rangeLength;
        });
        activityRef.current.added += added;
        activityRef.current.deleted += deleted;
      }
    });

    // Keyboard shortcuts inside Monaco: Ctrl/Cmd+Enter -> Run, Ctrl/Cmd+S -> Save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunCodeRef.current();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      window.dispatchEvent(new CustomEvent('meet:saveCode'));
    });
  };

  // Interval to send activity stats to server every 2 minutes
  useEffect(() => {
    if (isHost || !roomId) return;

    const interval = setInterval(() => {
      const stats = activityRef.current;
      if (stats.added === 0 && stats.deleted === 0) return;

      socket.emit('user:activity-stats', {
        roomId,
        added: stats.added,
        deleted: stats.deleted,
        timestamp: Date.now()
      });

      // Reset local counters after sending
      activityRef.current = { added: 0, deleted: 0 };
    }, 60 * 1000); // Gửi mỗi 1 phút để Host theo dõi nhanh hơn

    return () => clearInterval(interval);
  }, [roomId, isHost]);

  // Handle incoming socket events
  useEffect(() => {
    if (!roomId) return;

    const handleCodeDelta = ({ socketId, changes, language, isTargeted }: any) => {
      const vPeerCode = viewingPeerCodeRef.current;
      const hostStatus = useMeetingStore.getState().isHost;

      // Chỉ áp dụng Delta vào Editor nếu:
      // 1. Tôi đang trực tiếp xem người đó (Host xem Học viên)
      // 2. Hoặc đó là thay đổi đích danh gửi cho tôi (Host sửa bài cho Tôi)
      const isRelevant = vPeerCode === socketId || (isTargeted && !hostStatus);

      if (isRelevant && editorRef.current && Array.isArray(changes)) {
        const editor = editorRef.current;
        const model = editor.getModel();
        if (!model) return;

        isApplyingRemoteChange.current = true;
        try {
          model.pushEditOperations(
            editor.getSelections(),
            changes.map(change => ({
              range: change.range,
              text: change.text,
              forceMoveMarkers: true
            })),
            () => null
          );
        } finally {
          isApplyingRemoteChange.current = false;
        }
        
        // Sync Store AFTER applying to editor to ensure consistent state
        const updatedVal = model.getValue();
        if (vPeerCode === socketId) {
          updatePeerCode(socketId, updatedVal, language);
        } else {
          setCode(updatedVal);
        }
      }
    };

    const handleFullSync = ({ socketId, code: remoteCode, language, isTargeted }: any) => {
      const vPeerCode = viewingPeerCodeRef.current;
      const hostStatus = useMeetingStore.getState().isHost;

      const isRelevant = vPeerCode === socketId || (isTargeted && !hostStatus);
      
      if (isRelevant && editorRef.current) {
        const editor = editorRef.current;
        const model = editor.getModel();
        if (!model || model.getValue() === remoteCode) return;

        isApplyingRemoteChange.current = true;
        try {
          model.pushEditOperations(
            editor.getSelections(),
            [{
              range: model.getFullModelRange(),
              text: remoteCode,
              forceMoveMarkers: true
            }],
            () => null
          );
        } finally {
          isApplyingRemoteChange.current = false;
        }

        if (vPeerCode === socketId) {
          updatePeerCode(socketId, remoteCode, language);
        } else {
          setCode(remoteCode);
        }
      }
    };

    const handleCursorSync = ({ socketId, cursor }: { socketId: string, cursor: any }) => {
      updatePeerCursor(socketId, cursor);
    };

    socket.on('code:delta', handleCodeDelta);
    socket.on('code:sync', handleFullSync);
    socket.on('cursor:sync', handleCursorSync);
    const handlePeerLeft = ({ socketId }: { socketId: string }) => removePeerCursor(socketId);
    socket.on('peer:left', handlePeerLeft);

    return () => {
      socket.off('code:delta', handleCodeDelta);
      socket.off('code:sync', handleFullSync);
      socket.off('cursor:sync', handleCursorSync);
      socket.off('peer:left', handlePeerLeft); // chỉ gỡ handler của mình
    };
  }, [roomId, viewingPeerCode, isHost, setCode, updatePeerCode, updatePeerCursor, removePeerCursor]);

  // Update Decorations (Cursors/Selections) for peers
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // For each peer that has a cursor
    if (peerCursors && typeof peerCursors.forEach === 'function') {
      peerCursors.forEach((cursor, socketId) => {
        // Luồng hiển thị cursor:
        // 1. Host chỉ thấy cursor của người mình đang xem (viewingPeerCode)
        // 2. Client chỉ thấy cursor của Host (socketId === hostId)
        const isPeerRelevant = isHost 
          ? (viewingPeerCode === socketId) 
          : (socketId === hostId);

        if (!isPeerRelevant) return;

        const peer = peers.find(p => p.socketId === socketId);
        const peerName = peer?.name || (socketId === hostId ? 'Giảng viên' : 'Học viên');
        const safePeerName = peerName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
        const hash = socketId.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
        const color = CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];

        // Create unique CSS classes for this peer
        const className = `peer-cursor-${socketId.replace(/[^a-zA-Z0-9]/g, '')}`;
        const styleId = `peer-style-${socketId.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.innerHTML = `
            .${className} {
              background-color: ${color};
              width: 2px !important;
              cursor: help; /* Kích hoạt nhận diện chuột */
              pointer-events: auto !important;
            }
            .${className}::after {
              content: "${safePeerName}";
              position: absolute;
              top: -16px;
              left: 0;
              background-color: ${color};
              color: white;
              font-size: 10px;
              font-weight: bold;
              padding: 1px 6px;
              border-radius: 4px;
              white-space: nowrap;
              z-index: 20;
              pointer-events: none;
              opacity: 0;
              transform: translateY(4px);
              transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .${className}:hover::after {
              opacity: 1;
              transform: translateY(0);
            }
            /* Thêm một vùng chạm rộng hơn để dễ hover */
            .${className}::before {
              content: "";
              position: absolute;
              top: 0;
              left: -5px;
              width: 12px;
              height: 100%;
              background: transparent;
            }
            .peer-selection-${socketId.replace(/[^a-zA-Z0-9]/g, '')} {
              background-color: ${color}44;
            }
          `;
          document.head.appendChild(style);
        }

        const decorations: any[] = [
          {
            range: new monaco.Range(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column + 1),
            options: {
              className: className,
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
          }
        ];

        if (cursor.selection) {
          decorations.push({
            range: new monaco.Range(
              cursor.selection.startLineNumber,
              cursor.selection.startColumn,
              cursor.selection.endLineNumber,
              cursor.selection.endColumn
            ),
            options: {
              className: `peer-selection-${socketId.replace(/[^a-zA-Z0-9]/g, '')}`,
            }
          });
        }

        const oldPeerDecorations = decorationsRef.current[socketId] || [];
        decorationsRef.current[socketId] = editor.deltaDecorations(oldPeerDecorations, decorations);
      });
    }

    // Cleanup decorations:
    // 1. Peer không còn nữa (peerCursors.has(id) === false)
    // 2. Hoặc Peer không còn liên quan (Host không xem người đó nữa / Client không xem Host nữa)
    Object.keys(decorationsRef.current).forEach(id => {
      const isStillRelevant = isHost 
        ? (viewingPeerCode === id) 
        : (id === hostId);

      if (!peerCursors.has(id) || !isStillRelevant) {
        editor.deltaDecorations(decorationsRef.current[id], []);
        delete decorationsRef.current[id];
        // Also remove the style element from DOM
        const styleId = `peer-style-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const styleEl = document.getElementById(styleId);
        if (styleEl) styleEl.remove();
      }
    });

  }, [peerCursors, peers, viewingPeerCode, isHost, hostId]);

  // Sync LOCAL code periodically (lưu lên server cho CHÍNH mình — không bao giờ gửi targetSocketId=hostId)
  useEffect(() => {
    if (!isEditorReady || !roomId || viewingPeerCode) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    syncTimeoutRef.current = setTimeout(() => {
      if (socket.connected) {
        socket.emit('code:sync', {
          roomId,
          code,
          language: selectedLanguage,
        });
      }
    }, 500);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      if (socket.connected && roomId && !viewingPeerCode) {
        socket.emit('code:sync', {
          roomId,
          code,
          language: selectedLanguage,
        });
      }
    };
  }, [code, selectedLanguage, roomId, isEditorReady, viewingPeerCode]);

  // Get current code and language to display
  const viewingPeer = peers.find(p => p.socketId === viewingPeerCode);
  const currentCode = viewingPeerCode && peerCodes.has(viewingPeerCode)
    ? peerCodes.get(viewingPeerCode)!.code
    : code;
  const currentLanguage = viewingPeerCode && peerCodes.has(viewingPeerCode)
    ? peerCodes.get(viewingPeerCode)!.language
    : selectedLanguage;

  // Đồng bộ model Monaco một cách an toàn khi chuyển người xem / mở bài đã lưu (tránh khóa render phase)
  useEffect(() => {
    if (!isEditorReady || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model || model.getValue() === currentCode) return;
    isApplyingRemoteChange.current = true;
    try {
      model.setValue(currentCode);
    } finally {
      isApplyingRemoteChange.current = false;
    }
  }, [viewingPeerCode, currentCode, isEditorReady]);

  // Admin can edit student's code. Others can only view.
  // Lock editor for students during active quiz
  const isQuizLocked = !isHost && (!!activeQuiz || !!activeAdaptive);
  const isReadOnly = (viewingPeerCode !== null && !isHost) || isQuizLocked;

  const handleEditorChange = (value: string | undefined) => {
    if (isApplyingRemoteChange.current) return;
    
    const vPeerCode = viewingPeerCodeRef.current;
    const newCode = value || '';
    const state = useMeetingStore.getState();
    
    if (vPeerCode && isHost) {
      const peerData = state.peerCodes.get(vPeerCode);
      // Tránh loop và ghi đè dữ liệu giống hệt
      if (peerData?.code === newCode) return;
      
      updatePeerCode(vPeerCode, newCode, currentLanguage);
    } else if (!vPeerCode) {
      // Tương tự, tránh ghi đè code của host nếu kết quả không đổi
      if (state.code === newCode) return;
      setCode(newCode);
    }
  };

  const handleRunCode = async () => {
    if (isReadOnly) return; // Can't run code when viewing someone else's code

    const startedAt = performance.now();
    setIsRunning(true);
    useMeetingStore.getState().setLastRunMeta(null);
    setOutput('Đang chạy chương trình...');

    const savedId = !viewingPeerCode ? useMeetingStore.getState().currentSavedId : null;
    if (savedId && roomId && socket.connected) {
      socket.emit('code:ranSaved', { roomId, id: savedId });
    }

    try {
      // Determine file extension based on language
      const extensionMap: Record<string, string> = {
        'python': 'py',
        'javascript': 'js',
        'typescript': 'ts',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'csharp': 'cs',
        'go': 'go',
        'rust': 'rs',
        'php': 'php',
        'ruby': 'rb',
      };
      
      const ext = extensionMap[currentLanguage.name] || currentLanguage.name;
      const filename = `main.${ext}`;

      // Build request with compile args for C++
      const executeRequest: any = {
        language: currentLanguage.name,
        version: currentLanguage.version,
        files: [
          {
            name: filename,
            content: currentCode,
          },
        ],
        stdin: stdin || '',
        compile_timeout: 10000,
      };
      
      // Add C++ specific args
      if (currentLanguage.name === 'cpp') {
        executeRequest.args = ['-std=c++17', '-O2'];
      }

      const result = await pistonService.executeCode(executeRequest);
      const durationMs = Math.max(1, Math.round(performance.now() - startedAt));

      const { stdout, stderr, code: exitCode } = result.run;

      if (exitCode === 0) {
        setOutput(stdout || 'Chương trình chạy thành công (không có đầu ra).');
        useMeetingStore.getState().setLastRunMeta({ status: 'ok', durationMs, at: Date.now() });
        playSoundCue('runOk');
      } else {
        setOutput(`Error (Exit Code: ${exitCode}):\n${stderr || stdout}`);
        useMeetingStore.getState().setLastRunMeta({ status: 'error', durationMs, at: Date.now() });
        playSoundCue('runErr');
      }
    } catch (error) {
      const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
      setOutput(`Error executing code: ${error instanceof Error ? error.message : 'Unknown error'}`);
      useMeetingStore.getState().setLastRunMeta({ status: 'error', durationMs, at: Date.now() });
      playSoundCue('runErr');
    } finally {
      setIsRunning(false);
    }
  };
  handleRunCodeRef.current = handleRunCode;

  // Global Ctrl+S fallback when focus is inside the page (prevents browser Save Page dialog)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('meet:saveCode'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleClearOutput = () => {
    setOutput('');
  };

  const handleDownloadCode = () => {
    const extensions: Record<string, string> = {
      python: 'py',
      javascript: 'js',
      typescript: 'ts',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      csharp: 'cs',
      go: 'go',
      rust: 'rs',
      php: 'php',
      ruby: 'rb',
    };

    const extension = extensions[currentLanguage.name] || 'txt';
    const blob = new Blob([currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getMonacoLanguage = (langName: string): string => {
    const langMap: Record<string, string> = {
      python: 'python',
      javascript: 'javascript',
      typescript: 'typescript',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      csharp: 'csharp',
      go: 'go',
      rust: 'rust',
      php: 'php',
      ruby: 'ruby',
    };
    return langMap[langName] || 'plaintext';
  };

  return (
    <div className="flex flex-col h-full bg-raised">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-raised border-b border-line">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {viewingPeerCode && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${
              isHost ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-accent/15 text-accent border-accent/30'
            }`}>
              <Eye size={14} className="shrink-0" />
              <span className="font-medium truncate max-w-[160px]">
                {isHost ? `Đang sửa: ${viewingPeer?.name || 'Học viên'}` : `Đang xem: ${viewingPeer?.name || 'Học viên'}`}
              </span>
              {isHost && (() => {
                const isSolo = audioMode === 'selected' && hearHost.length === 1 && hearHost[0] === viewingPeerCode;
                return (
                  <button
                    onClick={() => toggleSoloPeer(roomId, viewingPeerCode, viewingPeer?.name)}
                    className={`ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors shrink-0 ${
                      isSolo ? 'bg-accent text-accent-ink' : 'bg-elevated text-white/85 hover:bg-accent/25 hover:text-accent'
                    }`}
                    title={isSolo ? 'Đang nói riêng 1-1 — bấm để trả về cả lớp' : 'Nói riêng 1-1 với học viên này khi đang sửa code'}
                  >
                    <Headphones size={11} />
                    <span>{isSolo ? 'Đang 1-1' : 'Nói riêng'}</span>
                  </button>
                );
              })()}
              <button
                onClick={() => setViewingPeerCode(null)}
                className="ml-1 hover:opacity-80 transition-opacity shrink-0"
                title="Quay lại code của tôi"
              >
                <EyeOff size={14} />
              </button>
            </div>
          )}
          <select
            value={`${currentLanguage.name}:${currentLanguage.version}`}
            onChange={(e) => {
              if (isReadOnly) return;
              const [name, version] = e.target.value.split(':');
              const lang = commonLanguages.find(l => l.name === name && l.version === version) || currentLanguage;
              
              if (viewingPeerCode && isHost) {
                updatePeerCode(viewingPeerCode, currentCode, lang);
                socket.emit('code:sync', { 
                  roomId, 
                  targetSocketId: viewingPeerCode, 
                  code: currentCode, 
                  language: lang 
                });
              } else {
                setSelectedLanguage(lang);
              }
            }}
            disabled={isReadOnly}
            className={`shrink-0 bg-elevated text-white px-2.5 py-1.5 rounded border border-line-strong focus:outline-none focus:border-accent text-xs ${
              isReadOnly ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {commonLanguages.map((lang) => (
              <option key={`${lang.name}:${lang.version}`} value={`${lang.name}:${lang.version}`}>
                {lang.name.charAt(0).toUpperCase() + lang.name.slice(1)} {lang.version}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <SaveCodeBar />
          <button
            onClick={() => attachToAi(currentCode, `đoạn code ${currentLanguage.name}`, 'code')}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 px-2.5 py-1.5 rounded transition-all text-xs group"
            title="Thảo luận code với AI"
          >
            <Bot size={14} className="group-hover:animate-bounce" />
            <span className="font-bold">AI</span>
          </button>
          <button
            onClick={handleDownloadCode}
            className="shrink-0 p-1.5 text-muted hover:text-white hover:bg-elevated rounded transition-colors"
            title="Tải code về máy"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleClearOutput}
            className="shrink-0 p-1.5 text-muted hover:text-white hover:bg-elevated rounded transition-colors"
            title="Xóa Output"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={handleRunCode}
            disabled={isRunning || !isEditorReady || isReadOnly}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/60 disabled:text-white/50 disabled:cursor-not-allowed px-3 py-1.5 rounded text-xs font-bold text-white transition-colors"
            title="Chạy code (Ctrl+Enter)"
          >
            {isRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Đang chạy...</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span>Run</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Area: Editor Only */}
      <div className="flex-1 flex overflow-hidden relative">
        {isQuizLocked && (
          <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center pointer-events-none">
            <div className="bg-overlay border border-warn/30 rounded-lg px-6 py-4 text-center">
              <Lock size={24} className="text-warn mx-auto mb-2" />
              <p className="text-warn font-medium text-sm">Code Editor đang bị khóa</p>
              <p className="text-gray-400 text-xs mt-1">Vui lòng hoàn thành bài trắc nghiệm</p>
            </div>
          </div>
        )}
        <Editor
          height="100%"
          language={getMonacoLanguage(currentLanguage.name)}
          defaultValue={currentCode}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
            readOnly: isReadOnly,
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
