/**
 * Helper quản lý token phiên & áp đồng bộ đầy đủ state từ ack `room:join`
 * cho cả LobbyPage (lần đầu / F5), MeetingPage (socket auto-reconnect), và switchRoom (breakout).
 */
import { socket } from '../services/socket';
import { useMeetingStore } from '../store/useMeetingStore';

const SESSION_TOKEN_KEY = 'meet:sessionToken';
const HOST_SECRET_PREFIX = 'meet:hostSecret:';

export function getSessionToken(): string {
  try {
    let tok = localStorage.getItem(SESSION_TOKEN_KEY) || '';
    if (tok.length < 16) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      tok = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(SESSION_TOKEN_KEY, tok);
    }
    return tok;
  } catch {
    return '';
  }
}

export function saveSessionToken(tok?: string | null): void {
  if (!tok || tok.length < 16) return;
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, tok);
  } catch { /* noop */ }
}

export function getHostSecret(roomId?: string | null): string {
  if (!roomId) return '';
  try {
    return localStorage.getItem(`${HOST_SECRET_PREFIX}${roomId}`) || '';
  } catch {
    return '';
  }
}

export function saveHostSecret(roomId?: string | null, secret?: string | null): void {
  if (!roomId || !secret) return;
  try {
    localStorage.setItem(`${HOST_SECRET_PREFIX}${roomId}`, secret);
  } catch { /* noop */ }
}

export function removeHostSecret(roomId?: string | null): void {
  if (!roomId) return;
  try {
    localStorage.removeItem(`${HOST_SECRET_PREFIX}${roomId}`);
  } catch { /* noop */ }
}

export const isDefaultCodeSnippet = (c?: string | null): boolean =>
  !c || !c.trim() || c === '// Write your code here\n' || c === '# Write your code here\n';

export function applyRoomJoinState(
  res: any,
  targetRoomId: string,
  fallbackRoomName: string,
  effectiveUserName: string,
): void {
  const store = useMeetingStore.getState();

  if (res.sessionToken) saveSessionToken(res.sessionToken);
  store.setMySocketId(socket.id || null);
  store.setIsHost(!!res.host);
  store.setHostId(res.hostId || null);
  store.setSfuToken(res.sfuToken || null);
  store.setIsBreakout(!!res.isBreakout, res.parentId || null);
  store.setBreakoutEndsAt(res.breakoutEndsAt ?? null);
  store.setAudioState({
    mode: res.audioMode || 'all',
    allowed: res.hearHost || [],
    hostFocus: !!res.hostFocus,
    groups: res.audioGroups || [],
  });
  store.setBreakoutSummary(res.breakoutSummary ?? null);
  store.setBreakoutClosing(null);
  store.clearBreakoutHelpAlert(targetRoomId);

  if (res.exam) {
    store.setExamMonitoring(!!res.exam.monitoring);
    store.setExamRequireShare(!!res.exam.requireShare);
    store.setExamPinnedScreenId(res.exam.pinnedScreenId || null);
    if (res.exam.shareStatus && typeof res.exam.shareStatus === 'object') {
      store.hydrateExamShareStatus(res.exam.shareStatus);
    }
  } else {
    store.resetExam();
  }

  store.setPeers(res.peers || []);
  store.setMessages(Array.isArray(res.messages) ? res.messages : []);
  store.setAssignments(Array.isArray(res.assignments) ? res.assignments : []);
  store.setCurrentAssignmentIndex(
    typeof res.currentAssignmentIndex === 'number' ? res.currentAssignmentIndex : 0,
  );

  // Restore own code/language/LP
  if (res.ownState) {
    if (typeof res.ownState.points === 'number') {
      store.setMyPoints(res.ownState.points);
    }
    if (res.ownState.code) {
      if (isDefaultCodeSnippet(store.code)) {
        store.setCode(res.ownState.code);
        if (res.ownState.language) {
          store.setSelectedLanguage(res.ownState.language);
        }
      }
      setTimeout(() => {
        const cur = useMeetingStore.getState();
        if (cur.roomId === targetRoomId && !isDefaultCodeSnippet(cur.code)) {
          socket.emit('code:sync', {
            roomId: targetRoomId,
            code: cur.code,
            language: cur.selectedLanguage,
          });
        }
      }, 400);
    }
  }

  // Restore Normal Quiz
  if (res.activeQuiz) {
    store.setActiveQuiz(res.activeQuiz);
    if (res.quizResponses) store.setQuizResponses(res.quizResponses);
    store.setMyQuizSubmission(res.myQuizSubmission || null);
  } else {
    store.setActiveQuiz(null);
    store.setMyQuizSubmission(null);
  }

  // Restore Adaptive Quiz
  if (res.activeAdaptive) {
    store.setActiveAdaptive({
      id: res.activeAdaptive.id,
      title: res.activeAdaptive.title,
      status: res.activeAdaptive.status,
      createdAt: res.activeAdaptive.createdAt,
    });
    if (res.activeAdaptive.currentQuestion) {
      store.setAdaptiveCurrentQuestion(
        res.activeAdaptive.currentQuestion,
        res.activeAdaptive.questionIndex,
        res.activeAdaptive.questionEndsAt ?? null,
      );
    }
    if (res.activeAdaptive.questionHistory) {
      store.setAdaptiveQuestionResults(res.activeAdaptive.questionHistory);
    }
    if (res.activeAdaptive.scores) {
      store.setAdaptiveScores(res.activeAdaptive.scores);
    }
  } else {
    store.resetAdaptive();
  }

  if (res.pinned) {
    const [identity, source] = String(res.pinned).split(':');
    const finalSource = isNaN(Number(source)) ? source : Number(source);
    store.setSyncedPin({ identity, source: finalSource });
  } else {
    store.setSyncedPin(null);
  }

  if (Array.isArray(res.aiHistory)) {
    store.setAiMessages(res.aiHistory);
  }

  try {
    localStorage.setItem('meet:lastRoom', targetRoomId);
    if (res.isBreakout && res.parentId) {
      localStorage.setItem('meet:lastParentRoom', res.parentId);
    } else {
      localStorage.removeItem('meet:lastParentRoom');
    }
  } catch { /* noop */ }

  store.setRoom(
    targetRoomId,
    res.roomName || fallbackRoomName || 'Cuộc họp',
    effectiveUserName || store.userName || '',
  );
}
