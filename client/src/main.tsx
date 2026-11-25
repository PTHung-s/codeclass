import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { MascotProvider } from "./components/mascot";
import { ConfirmProvider } from "./hooks/useConfirm";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache 20s + KHÔNG refetch khi chỉ alt-tab/quay lại tab:
      // - Điều hướng trong 20s hiển thị NGAY từ cache (hết cảnh chậm chạp)
      // - Mọi thao tác tạo/sửa/xóa vẫn invalidateQueries nên dữ liệu luôn mới
      // - Monitor/grade đang dùng refetchInterval riêng -> không bị ảnh hưởng
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MascotProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </BrowserRouter>
      </MascotProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
