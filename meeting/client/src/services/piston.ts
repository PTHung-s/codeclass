import axios from 'axios';
// Không import apiUrl: máy chấm CodeClass nằm ở GỐC tên miền, không dưới /meet.

const PISTON_API_URL = 'https://emkc.org/api/v2/piston';
const RUNNER_BASE = (import.meta.env.VITE_RUNNER_URL || '').replace(/\/$/, '');

export interface PistonLanguage {
  name: string;
  version: string;
  aliases: string[];
  runtime: string;
}

export interface PistonExecuteRequest {
  language: string;
  version: string;
  files: Array<{
    name: string;
    content: string;
  }>;
  stdin?: string;
  args?: string[];
  compile_timeout?: number;
  run_timeout?: number;
}

export interface PistonExecuteResponse {
  run: {
    stdout: string;
    stderr: string;
    code: number;
    signal: string | null;
    output: string;
    message?: string;
  };
  language: string;
  version: string;
}

export const pistonService = {
  async getLanguages(): Promise<PistonLanguage[]> {
    try {
      const response = await axios.get(`${PISTON_API_URL}/runtimes`);
      return response.data;
    } catch (error) {
      console.error('Error fetching languages:', error);
      throw error;
    }
  },

  async executeCode(request: PistonExecuteRequest): Promise<PistonExecuteResponse> {
    // ─── Máy chấm CodeClass (Python/C/C++) — Piston công khai đã 401 ───
    const L = (request.language || '').toLowerCase();
    const SRC = request.files && request.files[0] ? request.files[0].content : '';
    if (L === 'python' || L === 'c' || L === 'cpp') {
      const ep = L === 'python' ? 'python' : 'cpp';
      const tk = localStorage.getItem('token');
      let st = 0;
      let js: any = null;
      try {
        // KHÔNG dùng apiUrl() ở đây: apiUrl() gắn APP_BASE '/meet' cho các API
        // của CHÍNH video-call. Còn máy chấm là backend CodeClass ở GỐC tên miền
        // (/api/run/...). Dùng apiUrl() sẽ thành '/meet/api/run/...' → 404, và
        // mọi ngôn ngữ Python/C/C++ đều không chạy được.
        const rs = await fetch(`${RUNNER_BASE}/api/run/${ep}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tk ? { Authorization: 'Bearer ' + tk } : {}),
          },
          body: JSON.stringify({ code: SRC, stdin: request.stdin || '' }),
        });
        st = rs.status;
        js = await rs.json().catch(() => null);
      } catch (err2: any) {
        throw new Error('Không gọi được máy chấm CodeClass: ' + (err2?.message || err2));
      }
      if (st === 401) throw new Error('Bạn chưa đăng nhập CodeClass — hãy đăng nhập vào codeclass.vnotemate.com rồi chạy lại.');
      if (!js) throw new Error(`Máy chấm trả về dữ liệu không hợp lệ (HTTP ${st})`);
      if (js.error) throw new Error(js.error);
      return {
        run: {
          stdout: js.stdout || '',
          stderr: js.stderr || '',
          code: typeof js.exitCode === 'number' ? js.exitCode : js.status === 'success' ? 0 : 1,
          signal: null,
          output: js.output || js.stdout || '',
        },
        language: L,
        version: 'codeclass',
      };
    }
    // Ngôn ngữ khác: giữ nguyên luồng Piston cũ
    try {
      const response = await axios.post(`${PISTON_API_URL}/execute`, request);
      return response.data;
    } catch (error) {
      console.error('Error executing code:', error);
      throw error;
    }
  }
};

// Predefined common languages for quick access
export const commonLanguages = [
  { name: 'python', version: '3.10.0' },
  { name: 'javascript', version: '18.15.0' },
  { name: 'typescript', version: '5.0.3' },
  { name: 'java', version: '17.0.0' },
  { name: 'c', version: '10.2.1' },
  { name: 'cpp', version: '10.2.0' },
  { name: 'csharp', version: '6.12.0' },
  { name: 'go', version: '1.19.5' },
  { name: 'rust', version: '1.68.2' },
  { name: 'php', version: '8.2.3' },
  { name: 'ruby', version: '3.2.1' },
];
