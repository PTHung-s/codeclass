import React from 'react';
import LobbyPage from './pages/LobbyPage';
import MeetingPage from './pages/MeetingPage';
import UiFeedbackHost from './components/UiFeedbackHost';
import { useMeetingStore } from './store/useMeetingStore';

const App: React.FC = () => {
  const { roomId } = useMeetingStore();

  return (
    <div className="h-screen w-screen bg-base text-white overflow-hidden">
      {/* Lobby cần cuộn (danh sách phòng dài) — meeting tự quản layout cố định */}
      {!roomId ? (
        <div className="h-full overflow-y-auto">
          <LobbyPage />
        </div>
      ) : (
        <MeetingPage />
      )}
      <UiFeedbackHost />
    </div>
  );
};

export default App;
