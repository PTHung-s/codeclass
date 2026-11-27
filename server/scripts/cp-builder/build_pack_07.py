"""
Builder & automated verifier for CodeClass CP Pack 07:
  07-recursion-backtracking — Tầng 2: Đệ quy, Quay lui & Nhánh cận
"""

from __future__ import annotations

import itertools
import math
import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_lib import build_and_verify_pack  # noqa: E402

REQ_HEADER = (
    "Time: 1s\n"
    "Memory: 256MB\n"
    "Nguồn: CodeClass CP Pack — Đệ quy & Quay lui\n"
)


# ============================================================================
# Problem 1: cp07-hanoi-kth-move
# ============================================================================
def build_p1() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

void solve(int n, long long k, int src, int aux, int dst) {
    long long mid = 1LL << (n - 1);
    if (k == mid) {
        cout << n << ' ' << src << ' ' << dst << '\n';
        return;
    }
    if (k < mid) {
        solve(n - 1, k, src, dst, aux);
    } else {
        solve(n - 1, k - mid, aux, src, dst);
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long k;
    if (cin >> n >> k) {
        solve(n, k, 1, 2, 3);
    }
    return 0;
}
"""

    py = r"""import sys


def solve(n, k, src, aux, dst):
    while True:
        mid = 1 << (n - 1)
        if k == mid:
            return n, src, dst
        if k < mid:
            n -= 1
            aux, dst = dst, aux
        else:
            n -= 1
            k -= mid
            src, aux = aux, src


def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    disk, frm, to = solve(n, k, 1, 2, 3)
    print(f"{disk} {frm} {to}")


if __name__ == "__main__":
    main()
"""

    def brute_hanoi(inp: str) -> str:
        n, k = map(int, inp.split())
        moves: List[Tuple[int, int, int]] = []

        def rec(d: int, s: int, a: int, t: int) -> None:
            if d == 0:
                return
            rec(d - 1, s, t, a)
            moves.append((d, s, t))
            rec(d - 1, a, s, t)

        rec(n, 1, 2, 3)
        disk, frm, to = moves[k - 1]
        return f"{disk} {frm} {to}"

    tests = [
        {"input": "3 4", "hidden": False, "expected": "3 1 3", "checkBrute": True},
        {"input": "3 6", "hidden": False, "expected": "2 2 3", "checkBrute": True},
        {"input": "2 1", "hidden": False, "expected": "1 1 2", "checkBrute": True},
        # Edge / corner cases
        {"input": "1 1", "hidden": True, "expected": "1 1 3", "checkBrute": True},
        {"input": "4 1", "hidden": True, "checkBrute": True},
        {"input": "5 31", "hidden": True, "checkBrute": True},
        {"input": "10 512", "hidden": True, "checkBrute": True},
        {"input": "12 4095", "hidden": True, "checkBrute": True},
        # Medium -> Large
        {"input": "14 9999", "hidden": True, "checkBrute": True},
        {"input": f"20 {(1 << 19) - 1}", "hidden": True},
        {"input": "30 700000000", "hidden": True},
        {"input": f"40 {1 << 39}", "hidden": True},
        {"input": "50 987654321012345", "hidden": True},
        {"input": "60 1", "hidden": True},
        {"input": f"60 {1 << 59}", "hidden": True},
        {"input": f"60 {(1 << 60) - 1}", "hidden": True},
    ]

    rng = random.Random(701)
    stress = []
    for _ in range(25):
        n = rng.randint(1, 13)
        k = rng.randint(1, (1 << n) - 1)
        stress.append(f"{n} {k}")

    return {
        "slug": "cp07-hanoi-kth-move",
        "title": "Bước thứ K trong Tháp Hà Nội",
        "shortDescription": "Tìm đĩa được di chuyển cùng cột xuất phát và cột đích ở bước thứ K trong bài toán Tháp Hà Nội N đĩa.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.recursion_classic",
        "tags": ["đệ quy", "chia để trị", "tầng 2"],
        "statement": r"""Trong bài toán **Tháp Hà Nội** kinh điển, có $3$ cột được đánh số `1`, `2`, `3` và $N$ chiếc đĩa có kích thước đôi một khác nhau được đánh số từ $1$ (đĩa nhỏ nhất) đến $N$ (đĩa lớn nhất). Ban đầu, cả $N$ đĩa được xếp chồng trên cột `1` theo thứ tự nhỏ dần từ dưới lên trên (đĩa $1$ ở trên cùng, đĩa $N$ ở dưới cùng).

Ta cần chuyển toàn bộ $N$ đĩa sang cột `3` (dùng cột `2` làm cột trung gian) theo hai quy tắc:
1. Mỗi bước chỉ được di chuyển duy nhất $1$ đĩa ở trên cùng của một cột sang trên cùng của một cột khác.
2. Không bao giờ được đặt đĩa có số hiệu lớn hơn lên trên đĩa có số hiệu nhỏ hơn.

Chiến lược tối ưu duy nhất sử dụng đúng $2^N - 1$ bước di chuyển. Cho hai số nguyên dương $N$ và $K$, hãy xác định **bước di chuyển thứ $K$** (đánh số từ $1$): đĩa nào được di chuyển, từ cột nào sang cột nào.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $N$ và $K$.

### Dữ liệu ra
- In ra ba số nguyên `disk from to` cách nhau bởi một dấu cách, lần lượt là số hiệu đĩa được di chuyển, cột xuất phát và cột đích ở bước thứ $K$.

### Ràng buộc
- $1 \le N \le 60$
- $1 \le K \le 2^N - 1$""",
        "requirementsText": REQ_HEADER + "Lưu ý: Với $N \\le 60$, $K$ có thể lên tới $2^{60} - 1 \\approx 1.15 \\times 10^{18}$, cần dùng kiểu số nguyên 64-bit (`long long` trong C++).",
        "hints": r"""### Gợi ý 1
Không thể mô phỏng toàn bộ $2^N - 1$ bước khi $N = 60$. Hãy nhìn vào cấu trúc đệ quy của lời giải tối ưu cho $N$ đĩa chuyển từ `src` sang `dst` qua `aux`.

### Gợi ý 2
Lời giải tối ưu gồm đúng $3$ giai đoạn:
- $2^{N-1} - 1$ bước đầu tiên: chuyển $N - 1$ đĩa nhỏ hơn từ `src` sang `aux` (dùng `dst` làm trung gian).
- Bước chính giữa $M = 2^{N-1}$: chuyển đĩa lớn nhất $N$ từ `src` sang `dst`.
- $2^{N-1} - 1$ bước cuối cùng: chuyển $N - 1$ đĩa từ `aux` sang `dst` (dùng `src` làm trung gian).

### Gợi ý 3
So sánh $K$ với $M = 2^{N-1}$:
- Nếu $K = M$: đáp án chính là `(N, src, dst)`.
- Nếu $K < M$: gọi đệ quy cho `(N - 1, K, src, dst, aux)`.
- Nếu $K > M$: gọi đệ quy cho `(N - 1, K - M, aux, src, dst)`.

Độ phức tạp chỉ là $O(N)$.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_hanoi,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 2: cp07-binary-no-adjacent-ones
# ============================================================================
def build_p2() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int n;
long long k, cnt = 0;
string cur, ans = "-1";

void dfs(int pos, bool prevOne) {
    if (pos == n) {
        ++cnt;
        if (cnt == k) ans = cur;
        return;
    }
    cur[pos] = '0';
    dfs(pos + 1, false);
    if (!prevOne) {
        cur[pos] = '1';
        dfs(pos + 1, true);
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    if (cin >> n >> k) {
        cur.assign(n, '0');
        dfs(0, false);
        cout << cnt << '\n' << ans << '\n';
    }
    return 0;
}
"""

    py = r"""import sys


def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])

    cur = ["0"] * n
    cnt = 0
    ans = "-1"

    def dfs(pos, prev_one):
        nonlocal cnt, ans
        if pos == n:
            cnt += 1
            if cnt == k:
                ans = "".join(cur)
            return
        cur[pos] = "0"
        dfs(pos + 1, False)
        if not prev_one:
            cur[pos] = "1"
            dfs(pos + 1, True)

    dfs(0, False)
    print(cnt)
    print(ans)


if __name__ == "__main__":
    main()
"""

    def brute_bin(inp: str) -> str:
        n, k = map(int, inp.split())
        valid = []
        for mask in range(1 << n):
            s = format(mask, f"0{n}b")
            if "11" not in s:
                valid.append(s)
        ans = valid[k - 1] if k <= len(valid) else "-1"
        return f"{len(valid)}\n{ans}"

    tests = [
        {"input": "3 4", "hidden": False, "expected": "5\n100", "checkBrute": True},
        {"input": "2 5", "hidden": False, "expected": "3\n-1", "checkBrute": True},
        {"input": "4 1", "hidden": False, "expected": "8\n0000", "checkBrute": True},
        # Edge / corner cases
        {"input": "1 1", "hidden": True, "expected": "2\n0", "checkBrute": True},
        {"input": "1 2", "hidden": True, "expected": "2\n1", "checkBrute": True},
        {"input": "1 3", "hidden": True, "expected": "2\n-1", "checkBrute": True},
        {"input": "4 8", "hidden": True, "expected": "8\n1010", "checkBrute": True},
        {"input": "5 13", "hidden": True, "expected": "13\n10101", "checkBrute": True},
        # Medium -> Large
        {"input": "8 35", "hidden": True, "checkBrute": True},
        {"input": "10 144", "hidden": True, "checkBrute": True},
        {"input": "10 145", "hidden": True, "checkBrute": True},
        {"input": "12 200", "hidden": True, "checkBrute": True},
        {"input": "15 1000", "hidden": True},
        {"input": "18 3383", "hidden": True},
        {"input": "18 6765", "hidden": True},
        {"input": "18 100000", "hidden": True},
    ]

    rng = random.Random(702)
    stress = []
    for _ in range(20):
        n = rng.randint(1, 13)
        k = rng.randint(1, 700)
        stress.append(f"{n} {k}")

    return {
        "slug": "cp07-binary-no-adjacent-ones",
        "title": "Xâu nhị phân không có hai số 1 kề nhau",
        "shortDescription": "Đếm số xâu nhị phân độ dài N không chứa hai chữ số 1 đứng cạnh nhau và tìm xâu thứ K theo thứ tự từ điển.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.backtracking_generation",
        "tags": ["quay lui", "đệ quy", "tầng 2"],
        "statement": r"""Xét tất cả các xâu nhị phân có độ dài đúng bằng $N$ (chỉ gồm hai ký tự `'0'` và `'1'`) sao cho **không tồn tại hai ký tự `'1'` đứng kề nhau** (tức là không chứa xâu con `"11"`).

Sắp xếp toàn bộ các xâu hợp lệ theo **thứ tự từ điển tăng dần** (với quy ước `'0' < '1'`). Cho hai số nguyên dương $N$ và $K$, hãy cho biết:
1. Tổng số xâu hợp lệ độ dài $N$.
2. Xâu hợp lệ đứng ở vị trí thứ $K$ (đánh số từ $1$). Nếu $K$ lớn hơn tổng số xâu hợp lệ thì in `-1`.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $N$ và $K$.

### Dữ liệu ra
- Dòng 1: một số nguyên là tổng số xâu nhị phân hợp lệ.
- Dòng 2: xâu hợp lệ thứ $K$, hoặc `-1` nếu không tồn tại.

### Ràng buộc
- $1 \le N \le 18$
- $1 \le K \le 10^5$""",
        "requirementsText": REQ_HEADER + "Số lượng xâu hợp lệ độ dài $N$ là số Fibonacci $F_{N+2}$ (với $N = 18$, chỉ có đúng $6765$ xâu hợp lệ).",
        "hints": r"""### Gợi ý 1
Hãy dùng thuật toán **quay lui** để điền từng vị trí `pos` từ `0` đến `N - 1`. Tại mỗi vị trí, ta chỉ cần biết ký tự ngay trước đó có phải là `'1'` hay không.

### Gợi ý 2
Để các xâu sinh ra tự động theo đúng **thứ tự từ điển tăng dần**, tại mỗi vị trí hãy luôn thử điền `'0'` trước, rồi mới thử điền `'1'` (chỉ khi ký tự trước đó khác `'1'`).

### Gợi ý 3
Mỗi khi điền đủ `pos == N`, tăng biến đếm `cnt` lên $1$; nếu `cnt == K` thì lưu lại xâu hiện tại. Cuối cùng in `cnt` và xâu đã lưu (hoặc `-1` nếu `cnt < K`).""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_bin,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 3: cp07-kth-combination
# ============================================================================
def build_p3() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, k;
    long long m;
    if (!(cin >> n >> k >> m)) return 0;

    long long C[30][30] = {};
    for (int i = 0; i <= n; ++i) {
        C[i][0] = C[i][i] = 1;
        for (int j = 1; j < i; ++j) {
            C[i][j] = C[i - 1][j - 1] + C[i - 1][j];
        }
    }

    vector<int> ans;
    ans.reserve(k);
    int rem = k;
    for (int x = 1; x <= n && rem > 0; ++x) {
        long long cnt = C[n - x][rem - 1];
        if (m <= cnt) {
            ans.push_back(x);
            --rem;
        } else {
            m -= cnt;
        }
    }

    for (int i = 0; i < k; ++i) {
        if (i) cout << ' ';
        cout << ans[i];
    }
    cout << '\n';
    return 0;
}
"""

    py = r"""import sys


def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    m = int(data[2])

    C = [[0] * (n + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        C[i][0] = C[i][i] = 1
        for j in range(1, i):
            C[i][j] = C[i - 1][j - 1] + C[i - 1][j]

    ans = []
    rem = k

    def build(x, rem_left, m_left):
        if rem_left == 0:
            return
        cnt = C[n - x][rem_left - 1]
        if m_left <= cnt:
            ans.append(x)
            build(x + 1, rem_left - 1, m_left)
        else:
            build(x + 1, rem_left, m_left - cnt)

    build(1, rem, m)
    print(" ".join(map(str, ans)))


if __name__ == "__main__":
    main()
"""

    def brute_comb(inp: str) -> str:
        n, k, m = map(int, inp.split())
        for idx, comb in enumerate(itertools.combinations(range(1, n + 1), k), 1):
            if idx == m:
                return " ".join(map(str, comb))
        raise RuntimeError("M out of range")

    c25_12 = math.comb(25, 12)  # 5,200,300
    tests = [
        {"input": "4 2 5", "hidden": False, "expected": "2 4", "checkBrute": True},
        {"input": "5 3 1", "hidden": False, "expected": "1 2 3", "checkBrute": True},
        {"input": "5 3 10", "hidden": False, "expected": "3 4 5", "checkBrute": True},
        # Edge / corner cases
        {"input": "1 1 1", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "25 1 25", "hidden": True, "expected": "25", "checkBrute": True},
        {"input": "25 25 1", "hidden": True, "expected": " ".join(map(str, range(1, 26))), "checkBrute": True},
        {"input": "10 1 7", "hidden": True, "expected": "7", "checkBrute": True},
        {"input": "10 9 10", "hidden": True, "expected": "2 3 4 5 6 7 8 9 10", "checkBrute": True},
        # Medium -> Large
        {"input": "8 4 35", "hidden": True, "checkBrute": True},
        {"input": "12 5 500", "hidden": True, "checkBrute": True},
        {"input": "15 7 3217", "hidden": True, "checkBrute": True},
        {"input": f"20 10 {math.comb(20, 10) // 2}", "hidden": True},
        {"input": "25 12 1", "hidden": True},
        {"input": f"25 12 {c25_12 // 2}", "hidden": True},
        {"input": f"25 12 {c25_12}", "hidden": True},
        {"input": "25 13 4123456", "hidden": True},
    ]

    rng = random.Random(703)
    stress = []
    for _ in range(25):
        n = rng.randint(1, 14)
        k = rng.randint(1, n)
        m = rng.randint(1, math.comb(n, k))
        stress.append(f"{n} {k} {m}")

    return {
        "slug": "cp07-kth-combination",
        "title": "Tổ hợp chập K thứ M",
        "shortDescription": "Tìm tổ hợp chập K thứ M theo thứ tự từ điển tăng dần từ tập {1, 2, ..., N}.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.backtracking_generation",
        "tags": ["quay lui", "tổ hợp", "tầng 2"],
        "statement": r"""Xét tất cả các tổ hợp chập $K$ của tập hợp $\{1, 2, \dots, N\}$. Mỗi tổ hợp được viết dưới dạng dãy gồm $K$ số nguyên tăng dần $c_1 < c_2 < \dots < c_K$.

Sắp xếp toàn bộ $\binom{N}{K}$ tổ hợp này theo **thứ tự từ điển tăng dần**. Cho ba số nguyên dương $N, K, M$, hãy tìm và in ra tổ hợp đứng ở vị trí thứ $M$ (đánh số từ $1$).

### Dữ liệu vào
- Một dòng duy nhất chứa ba số nguyên dương $N, K, M$.

### Dữ liệu ra
- In ra $K$ số nguyên tăng dần cách nhau bởi một dấu cách là tổ hợp thứ $M$.

### Ràng buộc
- $1 \le K \le N \le 25$
- $1 \le M \le \binom{N}{K}$""",
        "requirementsText": REQ_HEADER + "Lưu ý: Với $N = 25, K = 12$, có tới $\\binom{25}{12} = 5\\,200\\,300$ tổ hợp. Nên kết hợp đệ quy với công thức đếm tổ hợp $\\binom{n}{k}$ để đạt độ phức tạp $O(N)$.",
        "hints": r"""### Gợi ý 1
Nếu quay lui sinh lần lượt tất cả các tổ hợp, khi $N = 25, K = 12$ số nhánh lên tới hơn $5.2 \times 10^6$, có thể chạy chậm trên ngôn ngữ chậm như Python. Hãy nghĩ cách **nhảy cóc** qua cả một nhánh lớn của cây quay lui.

### Gợi ý 2
Giả sử ta đang xét phần tử $x$ (từ $1$ đến $N$) và vẫn cần chọn thêm `rem` phần tử nữa. Nếu chọn $x$, ta cần chọn tiếp `rem - 1` phần tử từ tập $\{x + 1, \dots, N\}$, tức là có đúng $c = \binom{N - x}{\text{rem} - 1}$ tổ hợp bắt đầu bằng $x$ ở nhánh này.

### Gợi ý 3
Tính trước bảng tam giác Pascal `C[i][j]` trong $O(N^2)$. Khi xét $x$:
- Nếu $M \le c$: chắc chắn $x$ thuộc tổ hợp cần tìm $\rightarrow$ thêm $x$ vào kết quả và giảm `rem` đi $1$.
- Nếu $M > c$: bỏ qua toàn bộ nhánh chọn $x$, cập nhật $M \leftarrow M - c$ rồi xét tiếp $x + 1$.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_comb,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 4: cp07-generate-parentheses-kth
# ============================================================================
def build_p4() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int n;
long long k, cnt = 0;
string cur, ans;

void dfs(int pos, int opened, int closed) {
    if (pos == 2 * n) {
        ++cnt;
        if (cnt == k) ans = cur;
        return;
    }
    if (opened < n) {
        cur[pos] = '(';
        dfs(pos + 1, opened + 1, closed);
    }
    if (closed < opened) {
        cur[pos] = ')';
        dfs(pos + 1, opened, closed + 1);
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    if (cin >> n >> k) {
        cur.assign(2 * n, '(');
        dfs(0, 0, 0);
        cout << cnt << '\n' << ans << '\n';
    }
    return 0;
}
"""

    py = r"""import sys


def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])

    cur = ["("] * (2 * n)
    cnt = 0
    ans = ""

    def dfs(pos, opened, closed):
        nonlocal cnt, ans
        if pos == 2 * n:
            cnt += 1
            if cnt == k:
                ans = "".join(cur)
            return
        if opened < n:
            cur[pos] = "("
            dfs(pos + 1, opened + 1, closed)
        if closed < opened:
            cur[pos] = ")"
            dfs(pos + 1, opened, closed + 1)

    dfs(0, 0, 0)
    print(cnt)
    print(ans)


if __name__ == "__main__":
    main()
"""

    def catalan(n: int) -> int:
        return math.comb(2 * n, n) // (n + 1)

    def brute_paren(inp: str) -> str:
        n, k = map(int, inp.split())
        valid = []
        total_len = 2 * n
        for mask in range(1 << total_len):
            bal = 0
            ok = True
            chars = []
            for bit in range(total_len - 1, -1, -1):
                if (mask >> bit) & 1:
                    bal -= 1
                    chars.append(")")
                else:
                    bal += 1
                    chars.append("(")
                if bal < 0:
                    ok = False
                    break
            if ok and bal == 0:
                valid.append("".join(chars))
        valid.sort()
        return f"{len(valid)}\n{valid[k - 1]}"

    tests = [
        {"input": "3 3", "hidden": False, "expected": "5\n(())()", "checkBrute": True},
        {"input": "2 1", "hidden": False, "expected": "2\n(())", "checkBrute": True},
        {"input": "3 5", "hidden": False, "expected": "5\n()()()", "checkBrute": True},
        # Edge / corner cases
        {"input": "1 1", "hidden": True, "expected": "1\n()", "checkBrute": True},
        {"input": "2 2", "hidden": True, "expected": "2\n()()", "checkBrute": True},
        {"input": "4 1", "hidden": True, "expected": "14\n(((())))", "checkBrute": True},
        {"input": "4 14", "hidden": True, "expected": "14\n()()()()", "checkBrute": True},
        {"input": "5 21", "hidden": True, "checkBrute": True},
        # Medium -> Large
        {"input": "6 77", "hidden": True, "checkBrute": True},
        {"input": "7 200", "hidden": True, "checkBrute": True},
        {"input": f"8 {catalan(8)}", "hidden": True},
        {"input": f"9 {catalan(9) // 2}", "hidden": True},
        {"input": "10 10000", "hidden": True},
        {"input": "11 1", "hidden": True},
        {"input": f"11 {catalan(11) // 2}", "hidden": True},
        {"input": f"11 {catalan(11)}", "hidden": True},
    ]

    rng = random.Random(704)
    stress = []
    for _ in range(18):
        n = rng.randint(1, 6)
        k = rng.randint(1, catalan(n))
        stress.append(f"{n} {k}")

    return {
        "slug": "cp07-generate-parentheses-kth",
        "title": "Dãy ngoặc hợp lệ thứ K",
        "shortDescription": "Đếm số dãy ngoặc tròn hợp lệ độ dài 2N và tìm dãy ngoặc đứng thứ K theo thứ tự từ điển.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.backtracking_generation",
        "tags": ["quay lui", "đệ quy", "xâu", "tầng 2"],
        "statement": r"""Một dãy ngoặc tròn gồm $N$ dấu `'('` và $N$ dấu `')'` được gọi là **hợp lệ** nếu tại mọi tiền tố của dãy, số lượng dấu `'('` luôn lớn hơn hoặc bằng số lượng dấu `')'`.

Xét tất cả các dãy ngoặc hợp lệ độ dài $2N$ được sắp xếp theo **thứ tự từ điển tăng dần** với quy ước `'(' < ')'`. Cho hai số nguyên dương $N$ và $K$, hãy tìm:
1. Tổng số dãy ngoặc hợp lệ độ dài $2N$ (chính là số Catalan $C_N$).
2. Dãy ngoặc hợp lệ thứ $K$ (đánh số từ $1$).

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $N$ và $K$.

### Dữ liệu ra
- Dòng 1: số nguyên $C_N$ là tổng số dãy ngoặc hợp lệ.
- Dòng 2: dãy ngoặc hợp lệ thứ $K$ có độ dài $2N$.

### Ràng buộc
- $1 \le N \le 11$
- $1 \le K \le C_N$ (với $N = 11$, $C_{11} = 58\,786$)""",
        "requirementsText": REQ_HEADER + "Với $N \\le 11$, số lượng cấu hình hợp lệ tối đa là $C_{11} = 58\\,786$, đủ nhỏ để sinh trực tiếp bằng quay lui theo đúng thứ tự từ điển.",
        "hints": r"""### Gợi ý 1
Khi xây dựng dãy ngoặc từ trái sang phải, hãy theo dõi hai biến: `opened` (số dấu `'('` đã đặt) và `closed` (số dấu `')'` đã đặt).

### Gợi ý 2
Tại mỗi bước, ta có thể đặt `'('` nếu `opened < N`, và có thể đặt `')'` nếu `closed < opened`. Quy tắc này đảm bảo mọi dãy sinh ra đều hợp lệ và không bỏ sót dãy nào.

### Gợi ý 3
Vì `'(' < ')'`, chỉ cần thử đặt `'('` trước rồi mới đặt `')'` trong hàm quay lui thì các dãy hoàn chỉnh (`pos == 2 * N`) sẽ được sinh ra theo đúng thứ tự từ điển tăng dần. Tăng biến đếm mỗi khi hoàn thành một dãy và lưu lại dãy thứ $K$.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_paren,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 5: cp07-combination-sum-count
# ============================================================================
def build_p5() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int n, s;
int a[25];
long long memo[25][65];

long long solve(int idx, int rem) {
    if (rem == 0) return 1;
    if (idx == n || a[idx] > rem) return 0;
    long long &res = memo[idx][rem];
    if (res != -1) return res;
    res = solve(idx, rem - a[idx]) + solve(idx + 1, rem);
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    if (!(cin >> n >> s)) return 0;
    for (int i = 0; i < n; ++i) cin >> a[i];
    sort(a, a + n);
    memset(memo, -1, sizeof(memo));
    cout << solve(0, s) << '\n';
    return 0;
}
"""

    py = r"""import sys


def main():
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n, s = data[0], data[1]
    a = sorted(data[2 : 2 + n])

    memo = [[-1] * (s + 1) for _ in range(n + 1)]

    def solve(idx, rem):
        if rem == 0:
            return 1
        if idx == n or a[idx] > rem:
            return 0
        if memo[idx][rem] != -1:
            return memo[idx][rem]
        res = solve(idx, rem - a[idx]) + solve(idx + 1, rem)
        memo[idx][rem] = res
        return res

    print(solve(0, s))


if __name__ == "__main__":
    main()
"""

    def brute_comb_sum(inp: str) -> str:
        vals = list(map(int, inp.split()))
        n, s = vals[0], vals[1]
        a = vals[2 : 2 + n]
        dp = [0] * (s + 1)
        dp[0] = 1
        for x in a:
            for total in range(x, s + 1):
                dp[total] += dp[total - x]
        return str(dp[s])

    rng = random.Random(705)
    t12_a = sorted(rng.sample(range(1, 31), 10))
    rng.shuffle(t12_a)
    t13_a = sorted(rng.sample(range(1, 45), 15))
    rng.shuffle(t13_a)

    tests = [
        {"input": "3 7\n2 3 6", "hidden": False, "expected": "1", "checkBrute": True},
        {"input": "3 8\n2 3 5", "hidden": False, "expected": "3", "checkBrute": True},
        {"input": "2 5\n2 4", "hidden": False, "expected": "0", "checkBrute": True},
        # Edge / corner cases
        {"input": "1 1\n1", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "1 60\n7", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "1 60\n6", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "3 1\n2 3 5", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "5 10\n50 40 30 20 10", "hidden": True, "expected": "1", "checkBrute": True},
        # Medium -> Large
        {"input": "5 20\n1 2 3 5 7", "hidden": True, "checkBrute": True},
        {"input": "6 25\n2 3 5 7 11 13", "hidden": True, "checkBrute": True},
        {"input": "8 30\n15 1 12 3 9 4 8 6", "hidden": True, "checkBrute": True},
        {"input": f"10 45\n{' '.join(map(str, t12_a))}", "hidden": True, "checkBrute": True},
        {"input": f"15 55\n{' '.join(map(str, t13_a))}", "hidden": True, "checkBrute": True},
        {"input": f"20 60\n{' '.join(map(str, range(1, 21)))}", "hidden": True, "checkBrute": True},
        {"input": f"20 60\n{' '.join(map(str, range(2, 42, 2)))}", "hidden": True, "checkBrute": True},
        {"input": f"20 59\n{' '.join(map(str, range(2, 42, 2)))}", "hidden": True, "checkBrute": True},
    ]

    stress = []
    for _ in range(25):
        n = rng.randint(1, 15)
        s = rng.randint(1, 50)
        arr = rng.sample(range(1, 51), n)
        stress.append(f"{n} {s}\n" + " ".join(map(str, arr)))

    return {
        "slug": "cp07-combination-sum-count",
        "title": "Đếm số cách chọn tổ hợp có tổng bằng S",
        "shortDescription": "Đếm số đa tập gồm các phần tử từ dãy N số đôi một phân biệt (chọn không giới hạn số lần) có tổng đúng bằng S.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.backtracking_generation",
        "tags": ["quay lui", "đệ quy", "tầng 2"],
        "statement": r"""Cho một tập gồm $N$ số nguyên dương đôi một phân biệt $a_1, a_2, \dots, a_N$ và một số nguyên dương $S$.

Mỗi phần tử $a_i$ có thể được chọn **nhiều lần không giới hạn** (hoặc không chọn lần nào). Hãy đếm số cách chọn ra một đa tập các phần tử sao cho tổng giá trị của chúng bằng đúng $S$. Hai cách chọn chỉ khác nhau về thứ tự các phần tử được xem là **một cách duy nhất** (ví dụ `2 + 3 + 2` và `2 + 2 + 3` chỉ tính là $1$ cách).

### Dữ liệu vào
- Dòng 1: hai số nguyên dương $N$ và $S$.
- Dòng 2: $N$ số nguyên dương đôi một phân biệt $a_1, a_2, \dots, a_N$.

### Dữ liệu ra
- Một số nguyên duy nhất là số cách chọn thoả mãn.

### Ràng buộc
- $1 \le N \le 20$
- $1 \le a_i \le 50$ ($a_i \ne a_j$ với mọi $i \ne j$)
- $1 \le S \le 60$
- Đảm bảo đáp án không vượt quá $10^9$.""",
        "requirementsText": REQ_HEADER + "Lưu ý: Thứ tự chọn không quan trọng (đếm tổ hợp có lặp). Nên sắp xếp dãy tăng dần để cắt nhánh và kết hợp nhớ trạng thái (memoization) để tránh lặp lại lời gọi đệ quy.",
        "hints": r"""### Gợi ý 1
Để không đếm trùng các cách chỉ khác thứ tự, hãy duy trì chỉ số `idx` của phần tử đang xét: từ `idx` trở đi ta chỉ được chọn các phần tử có chỉ số $\ge \text{idx}$.

### Gợi ý 2
Sắp xếp mảng $a$ tăng dần. Tại trạng thái `(idx, rem)` (đang xét từ phần tử `idx`, tổng còn thiếu là `rem`):
- Nếu `rem == 0`: tìm được $1$ cách hợp lệ.
- Nếu `idx == N` hoặc `a[idx] > rem`: không thể ghép thêm bất kỳ phần tử nào nữa $\rightarrow$ trả về $0$ (cắt nhánh ngay lập tức!).
- Ngược lại, có đúng $2$ nhánh: chọn thêm một lần `a[idx]` $\rightarrow$ `(idx, rem - a[idx])`, hoặc bỏ hẳn `a[idx]` $\rightarrow$ `(idx + 1, rem)`.

### Gợi ý 3
Khi `a = [1, 2, ..., 20]` và `S = 60`, cây quay lui có nhiều trạng thái `(idx, rem)` bị gọi lặp lại. Lưu kết quả vào bảng `memo[idx][rem]` sẽ giảm độ phức tạp xuống còn $O(N \cdot S) \le 1200$ phép tính.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_comb_sum,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 6: cp07-n-queens-count
# ============================================================================
def build_p6() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int n, full_mask;
int blocked[15];

long long dfs(int row, int cols, int d1, int d2) {
    if (row == n) return 1;
    int avail = full_mask & ~(cols | d1 | d2 | blocked[row]);
    long long ans = 0;
    while (avail) {
        int bit = avail & -avail;
        avail ^= bit;
        ans += dfs(row + 1, cols | bit, ((d1 | bit) << 1) & full_mask, (d2 | bit) >> 1);
    }
    return ans;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    if (!(cin >> n)) return 0;
    full_mask = (1 << n) - 1;
    for (int i = 0; i < n; ++i) {
        string row;
        cin >> row;
        int mask = 0;
        for (int j = 0; j < n; ++j) {
            if (row[j] == '*') mask |= (1 << j);
        }
        blocked[i] = mask;
    }
    cout << dfs(0, 0, 0, 0) << '\n';
    return 0;
}
"""

    py = r"""import sys


def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    full_mask = (1 << n) - 1
    blocked = [0] * n
    for i in range(n):
        row = data[1 + i]
        mask = 0
        for j, ch in enumerate(row):
            if ch == "*":
                mask |= 1 << j
        blocked[i] = mask

    def dfs(row, cols, d1, d2):
        if row == n:
            return 1
        avail = full_mask & ~(cols | d1 | d2 | blocked[row])
        ans = 0
        while avail:
            bit = avail & -avail
            avail ^= bit
            ans += dfs(row + 1, cols | bit, ((d1 | bit) << 1) & full_mask, (d2 | bit) >> 1)
        return ans

    print(dfs(0, 0, 0, 0))


if __name__ == "__main__":
    main()
"""

    def brute_queens(inp: str) -> str:
        tokens = inp.split()
        n = int(tokens[0])
        grid = tokens[1 : 1 + n]
        ans = 0
        for perm in itertools.permutations(range(n)):
            ok = True
            d1 = set()
            d2 = set()
            for r, c in enumerate(perm):
                if grid[r][c] == "*" or (r - c) in d1 or (r + c) in d2:
                    ok = False
                    break
                d1.add(r - c)
                d2.add(r + c)
            if ok:
                ans += 1
        return str(ans)

    def make_board(n: int, blocked_cells: List[Tuple[int, int]]) -> str:
        b = [["."] * n for _ in range(n)]
        for r, c in blocked_cells:
            b[r][c] = "*"
        return f"{n}\n" + "\n".join("".join(row) for row in b)

    rng = random.Random(706)

    def rand_board(n: int, num_blocked: int) -> str:
        cells = [(r, c) for r in range(n) for c in range(n)]
        chosen = rng.sample(cells, num_blocked)
        return make_board(n, chosen)

    tests = [
        {"input": make_board(4, []), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": make_board(4, [(0, 1)]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": make_board(8, []), "hidden": False, "expected": "92", "checkBrute": True},
        # Edge / corner cases
        {"input": make_board(1, []), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": make_board(1, [(0, 0)]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": make_board(2, []), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": make_board(3, []), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": make_board(8, [(3, c) for c in range(8)]), "hidden": True, "expected": "0", "checkBrute": True},
        # Medium -> Large
        {"input": rand_board(6, 5), "hidden": True, "checkBrute": True},
        {"input": make_board(7, [(i, i) for i in range(7)]), "hidden": True, "checkBrute": True},
        {"input": rand_board(8, 10), "hidden": True, "checkBrute": True},
        {"input": make_board(9, []), "hidden": True, "expected": "352"},
        {"input": rand_board(10, 12), "hidden": True},
        {"input": rand_board(11, 14), "hidden": True},
        {"input": rand_board(12, 16), "hidden": True},
        {"input": make_board(12, []), "hidden": True, "expected": "14200"},
    ]

    stress = []
    for _ in range(18):
        n = rng.randint(1, 7)
        nb = rng.randint(0, min(n * n, n + 3))
        stress.append(rand_board(n, nb))

    return {
        "slug": "cp07-n-queens-count",
        "title": "Xếp N quân hậu có ô bị chặn",
        "shortDescription": "Đếm số cách đặt N quân hậu lên bàn cờ N×N có ô bị chặn sao cho không có hai quân hậu nào ăn nhau.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.backtracking_pruning",
        "tags": ["quay lui", "cắt nhánh", "tầng 2"],
        "statement": r"""Cho một bàn cờ vuông kích thước $N \times N$. Mỗi ô trên bàn cờ thuộc một trong hai loại:
- `.`: ô trống, có thể đặt quân hậu.
- `*`: ô bị chặn, **không** được đặt quân hậu lên ô này.

Lưu ý rằng ô bị chặn `*` chỉ ngăn không cho đặt quân hậu tại đúng ô đó, chứ **không cản đường tấn công** của các quân hậu khác.

Hãy đếm số cách đặt đúng $N$ quân hậu lên bàn cờ sao cho:
1. Không có quân hậu nào đặt trên ô `*`.
2. Không có hai quân hậu nào cùng hàng, cùng cột, hoặc cùng đường chéo (chính hay phụ).

### Dữ liệu vào
- Dòng 1: một số nguyên dương $N$.
- $N$ dòng tiếp theo: mỗi dòng là một xâu độ dài $N$ chỉ gồm các ký tự `.` và `*`.

### Dữ liệu ra
- Một số nguyên duy nhất là số cách đặt $N$ quân hậu thoả mãn.

### Ràng buộc
- $1 \le N \le 12$""",
        "requirementsText": REQ_HEADER + "Sử dụng quay lui theo từng hàng kết hợp bitmask quản lý cột và hai đường chéo giúp chạy cực nhanh ngay cả khi $N = 12$ không có ô bị chặn.",
        "hints": r"""### Gợi ý 1
Vì mỗi hàng phải chứa đúng $1$ quân hậu, ta quay lui theo chỉ số hàng `row` từ $0$ đến $N - 1$ và chọn cột `col` chưa bị khống chế để đặt quân hậu.

### Gợi ý 2
Hai ô $(r_1, c_1)$ và $(r_2, c_2)$ cùng đường chéo chính khi $r_1 - c_1 = r_2 - c_2$, cùng đường chéo phụ khi $r_1 + c_1 = r_2 + c_2$. Ta có thể đánh dấu cột và hai loại đường chéo bằng mảng boolean hoặc bằng $3$ mặt nạ bit (bitmask).

### Gợi ý 3
Với bitmask: tại hàng `row`, tập cột hợp lệ là `avail = full_mask & ~(cols | d1 | d2 | blocked[row])`. Khi chọn cột `bit = avail & -avail` và sang hàng `row + 1`:
- `cols` trở thành `cols | bit`
- đường chéo dịch trái trở thành `((d1 | bit) << 1) & full_mask`
- đường chéo dịch phải trở thành `(d2 | bit) >> 1`.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_queens,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 7: cp07-grid-hamiltonian-paths
# ============================================================================
def build_p7() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int total_cells, start_id, end_id;
vector<int> adj[30];
int deg[30];
bool vis[30];

long long dfs(int u, int visited_cnt) {
    if (visited_cnt == total_cells - 1) {
        for (int v : adj[u]) {
            if (v == end_id) return 1;
        }
        return 0;
    }
    if (deg[end_id] == 0) return 0;

    int forced = -1;
    for (int v : adj[u]) {
        if (vis[v] || v == end_id) continue;
        if (deg[v] == 0) return 0;
        if (deg[v] == 1) {
            if (forced != -1) return 0;
            forced = v;
        }
    }

    long long ans = 0;
    auto go = [&](int v) {
        vis[v] = true;
        for (int w : adj[v]) {
            if (!vis[w]) --deg[w];
        }
        ans += dfs(v, visited_cnt + 1);
        for (int w : adj[v]) {
            if (!vis[w]) ++deg[w];
        }
        vis[v] = false;
    };

    if (forced != -1) {
        go(forced);
    } else {
        for (int v : adj[u]) {
            if (!vis[v] && v != end_id) {
                go(v);
            }
        }
    }
    return ans;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int R, C;
    if (!(cin >> R >> C)) return 0;
    vector<string> g(R);
    for (int i = 0; i < R; ++i) cin >> g[i];

    int id[7][7];
    memset(id, -1, sizeof(id));
    total_cells = 0;
    int sr = -1, sc = -1, er = -1, ec = -1;
    int parity_cnt[2] = {0, 0};

    for (int r = 0; r < R; ++r) {
        for (int c = 0; c < C; ++c) {
            if (g[r][c] == '#') continue;
            id[r][c] = total_cells;
            parity_cnt[(r + c) & 1]++;
            if (g[r][c] == 'S') { start_id = total_cells; sr = r; sc = c; }
            if (g[r][c] == 'E') { end_id = total_cells; er = r; ec = c; }
            ++total_cells;
        }
    }

    int sp = (sr + sc) & 1;
    int ep = (er + ec) & 1;
    if (total_cells % 2 == 1) {
        if (ep != sp || parity_cnt[sp] != parity_cnt[1 - sp] + 1) {
            cout << 0 << '\n';
            return 0;
        }
    } else {
        if (ep == sp || parity_cnt[0] != parity_cnt[1]) {
            cout << 0 << '\n';
            return 0;
        }
    }

    const int dr[4] = {-1, 1, 0, 0};
    const int dc[4] = {0, 0, -1, 1};
    for (int r = 0; r < R; ++r) {
        for (int c = 0; c < C; ++c) {
            int u = id[r][c];
            if (u == -1) continue;
            for (int d = 0; d < 4; ++d) {
                int nr = r + dr[d], nc = c + dc[d];
                if (nr >= 0 && nr < R && nc >= 0 && nc < C && id[nr][nc] != -1) {
                    adj[u].push_back(id[nr][nc]);
                }
            }
            deg[u] = (int)adj[u].size();
        }
    }

    for (int u = 0; u < total_cells; ++u) {
        int need = (u == start_id || u == end_id) ? 1 : 2;
        if (deg[u] < need) {
            cout << 0 << '\n';
            return 0;
        }
    }

    // Connectivity check via BFS
    vector<bool> seen(total_cells, false);
    queue<int> q;
    q.push(start_id);
    seen[start_id] = true;
    int reached = 0;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        ++reached;
        for (int v : adj[u]) {
            if (!seen[v]) {
                seen[v] = true;
                q.push(v);
            }
        }
    }
    if (reached != total_cells) {
        cout << 0 << '\n';
        return 0;
    }

    vis[start_id] = true;
    for (int w : adj[start_id]) --deg[w];
    cout << dfs(start_id, 1) << '\n';
    return 0;
}
"""

    py = r"""import sys
from collections import deque


def main():
    data = sys.stdin.read().split()
    if not data:
        return
    R, C = int(data[0]), int(data[1])
    grid = data[2 : 2 + R]

    cell_id = [[-1] * C for _ in range(R)]
    total = 0
    start_id = end_id = -1
    sr = sc = er = ec = 0
    parity_cnt = [0, 0]

    for r in range(R):
        for c in range(C):
            ch = grid[r][c]
            if ch == "#":
                continue
            cell_id[r][c] = total
            parity_cnt[(r + c) & 1] += 1
            if ch == "S":
                start_id, sr, sc = total, r, c
            elif ch == "E":
                end_id, er, ec = total, r, c
            total += 1

    sp = (sr + sc) & 1
    ep = (er + ec) & 1
    if total & 1:
        if ep != sp or parity_cnt[sp] != parity_cnt[1 - sp] + 1:
            print(0)
            return
    else:
        if ep == sp or parity_cnt[0] != parity_cnt[1]:
            print(0)
            return

    adj = [[] for _ in range(total)]
    for r in range(R):
        for c in range(C):
            u = cell_id[r][c]
            if u == -1:
                continue
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < R and 0 <= nc < C and cell_id[nr][nc] != -1:
                    adj[u].append(cell_id[nr][nc])

    deg = [len(adj[u]) for u in range(total)]
    for u in range(total):
        need = 1 if (u == start_id or u == end_id) else 2
        if deg[u] < need:
            print(0)
            return

    # Connectivity check
    seen = [False] * total
    seen[start_id] = True
    q = deque([start_id])
    reached = 0
    while q:
        u = q.popleft()
        reached += 1
        for v in adj[u]:
            if not seen[v]:
                seen[v] = True
                q.append(v)
    if reached != total:
        print(0)
        return

    vis = [False] * total
    vis[start_id] = True
    for w in adj[start_id]:
        deg[w] -= 1

    end_adj = set(adj[end_id])
    target_cnt = total - 1

    def dfs(u, visited_cnt):
        if visited_cnt == target_cnt:
            return 1 if u in end_adj else 0
        if deg[end_id] == 0:
            return 0

        forced = -1
        for v in adj[u]:
            if vis[v] or v == end_id:
                continue
            dv = deg[v]
            if dv == 0:
                return 0
            if dv == 1:
                if forced != -1:
                    return 0
                forced = v

        ans = 0
        if forced != -1:
            v = forced
            vis[v] = True
            for w in adj[v]:
                if not vis[w]:
                    deg[w] -= 1
            ans += dfs(v, visited_cnt + 1)
            for w in adj[v]:
                if not vis[w]:
                    deg[w] += 1
            vis[v] = False
        else:
            for v in adj[u]:
                if vis[v] or v == end_id:
                    continue
                vis[v] = True
                for w in adj[v]:
                    if not vis[w]:
                        deg[w] -= 1
                ans += dfs(v, visited_cnt + 1)
                for w in adj[v]:
                    if not vis[w]:
                        deg[w] += 1
                vis[v] = False
        return ans

    print(dfs(start_id, 1))


if __name__ == "__main__":
    main()
"""

    def brute_hamiltonian(inp: str) -> str:
        # Independent Held-Karp bitmask DP over walkable cells (for V <= 16)
        tokens = inp.split()
        R, C = int(tokens[0]), int(tokens[1])
        grid = tokens[2 : 2 + R]
        cell_id = [[-1] * C for _ in range(R)]
        total = 0
        s_id = e_id = -1
        for r in range(R):
            for c in range(C):
                if grid[r][c] == "#":
                    continue
                cell_id[r][c] = total
                if grid[r][c] == "S":
                    s_id = total
                elif grid[r][c] == "E":
                    e_id = total
                total += 1
        adj = [[] for _ in range(total)]
        for r in range(R):
            for c in range(C):
                u = cell_id[r][c]
                if u == -1:
                    continue
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < R and 0 <= nc < C and cell_id[nr][nc] != -1:
                        adj[u].append(cell_id[nr][nc])

        full = (1 << total) - 1
        dp = [[0] * total for _ in range(1 << total)]
        dp[1 << s_id][s_id] = 1
        for mask in range(1, full):
            row = dp[mask]
            for u in range(total):
                ways = row[u]
                if not ways:
                    continue
                for v in adj[u]:
                    if not (mask & (1 << v)):
                        dp[mask | (1 << v)][v] += ways
        return str(dp[full][e_id])

    tests = [
        {
            "input": "3 4\nS...\n....\n..E#",
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": "3 4\nS...\n....\n...E",
            "hidden": False,
            "expected": "4",
            "checkBrute": True,
        },
        {
            "input": "2 2\nS.\n.E",
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # Edge / corner cases
        {
            "input": "1 2\nSE",
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": "1 5\nS...E",
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": "2 3\nS#E\n...",
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": "2 3\nS.E\n...",
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": "3 3\nSE.\n.#.\n...",
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        # Medium -> Large
        {
            "input": "3 5\nS..#.\n.....\n.#..E",
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": "4 4\nS...\n....\n....\n..E.",
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": "4 4\nS...\n.#..\n..#.\n...E",
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": "4 5\nS..#.\n.#...\n...#.\n.#..E",
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": "4 5\nS....\n.....\n.....\n...E.",
            "hidden": True,
        },
        {
            "input": "5 5\nS....\n..#..\n.....\n.#.#.\n....E",
            "hidden": True,
        },
        {
            "input": "4 6\nS.....\n..#...\n...#..\n.....E",
            "hidden": True,
        },
        {
            "input": "5 5\nS....\n.....\n.....\n.....\n....E",
            "hidden": True,
        },
    ]

    rng = random.Random(707)
    stress = []
    for _ in range(22):
        R = rng.randint(2, 4)
        C = rng.randint(2, 4)
        cells = [(r, c) for r in range(R) for c in range(C)]
        s_pos, e_pos = rng.sample(cells, 2)
        g = [["."] * C for _ in range(R)]
        g[s_pos[0]][s_pos[1]] = "S"
        g[e_pos[0]][e_pos[1]] = "E"
        others = [p for p in cells if p != s_pos and p != e_pos]
        k_obs = rng.randint(0, min(4, len(others)))
        for r, c in rng.sample(others, k_obs):
            g[r][c] = "#"
        stress.append(f"{R} {C}\n" + "\n".join("".join(row) for row in g))

    return {
        "slug": "cp07-grid-hamiltonian-paths",
        "title": "Đường đi Hamilton trên lưới",
        "shortDescription": "Đếm số đường đi 4 hướng từ S đến E đi qua mọi ô không phải vật cản trên lưới đúng một lần.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.backtracking_pruning",
        "tags": ["quay lui", "cắt nhánh", "lưới", "tầng 2"],
        "statement": r"""Cho một lưới ô vuông kích thước $R \times C$, mỗi ô là một trong bốn ký tự:
- `S`: ô xuất phát (xuất hiện đúng $1$ lần).
- `E`: ô đích (xuất hiện đúng $1$ lần).
- `.`: ô trống có thể đi qua.
- `#`: vật cản không thể đi vào.

Tại mỗi bước, bạn có thể di chuyển sang một trong $4$ ô kề cạnh (lên, xuống, trái, phải) nằm trong lưới và không phải vật cản `#`. Hãy đếm số đường đi bắt đầu từ `S`, kết thúc tại `E` sao cho **đi qua mọi ô không phải `#` (gồm `S`, tất cả các ô `.`, và `E`) đúng một lần**.

### Dữ liệu vào
- Dòng 1: hai số nguyên dương $R$ và $C$.
- $R$ dòng tiếp theo: mỗi dòng là một xâu độ dài $C$ gồm các ký tự `S`, `E`, `.`, `#`.

### Dữ liệu ra
- Một số nguyên duy nhất là số đường đi Hamilton thoả mãn.

### Ràng buộc
- $1 \le R, C \le 6$
- $2 \le R \cdot C \le 25$
- Đảm bảo có đúng $1$ ô `S` và $1$ ô `E`.""",
        "requirementsText": REQ_HEADER + "Với $R \\cdot C \\le 25$, quay lui thuần có thể chậm trên lưới trống $5 \\times 5$; cần cắt nhánh theo tính chẵn lẻ (tô màu bàn cờ) và bậc các ô kề chưa thăm (ngõ cụt / bước bắt buộc).",
        "hints": r"""### Gợi ý 1
Không bao giờ được đi vào `E` trước khi đã đi qua toàn bộ `total - 1` ô còn lại. Ngoài ra, vì mỗi bước đi đổi tính chẵn lẻ của $(r + c)$, ta có thể kiểm tra ngay số lượng ô chẵn/lẻ so với tính chẵn lẻ của `S` và `E` (kiểm tra tô màu bàn cờ).

### Gợi ý 2
Duy trì `deg[u]` là số ô **chưa thăm** kề với ô `u`. Mọi ô `v` chưa thăm khác `E` đều phải được đi vào từ $1$ hướng rồi đi ra theo $1$ hướng khác trong phần đường đi còn lại.

### Gợi ý 3
Khi đang đứng tại `u` (đã đánh dấu thăm `u` và giảm `deg` các ô kề):
- Nếu `deg[E] == 0` khi chưa đến bước cuối $\rightarrow$ cắt nhánh ngay!
- Xét mọi ô kề chưa thăm `v != E` của `u`:
  - Nếu `deg[v] == 0`: dù đi sang `v` cũng không có lối ra $\rightarrow$ cắt nhánh!
  - Nếu `deg[v] == 1`: ta **bắt buộc** phải đi ngay sang `v` (nếu bỏ qua, sau này vào `v` sẽ không thể thoát ra). Nếu có từ $2$ ô như vậy $\rightarrow$ cắt nhánh!""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_hamiltonian,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 8: cp07-partition-k-equal-subsets
# ============================================================================
def build_p8() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int n, k, target, full_mask;
vector<int> a;
vector<char> bad;

bool dfs(int mask, int cur) {
    if (mask == full_mask) return true;
    if (bad[mask]) return false;

    if (cur == 0) {
        for (int i = 0; i < n; ++i) {
            if (!(mask & (1 << i))) {
                int ncur = (a[i] == target) ? 0 : a[i];
                if (dfs(mask | (1 << i), ncur)) return true;
                break;
            }
        }
        bad[mask] = 1;
        return false;
    }

    int prev = -1;
    for (int i = 0; i < n; ++i) {
        if (mask & (1 << i)) continue;
        if (a[i] == prev) continue;
        if (cur + a[i] > target) continue;
        prev = a[i];
        int ncur = cur + a[i];
        if (ncur == target) ncur = 0;
        if (dfs(mask | (1 << i), ncur)) return true;
    }

    bad[mask] = 1;
    return false;
}

bool solve_case() {
    cin >> n >> k;
    a.resize(n);
    int total = 0;
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
        total += a[i];
    }
    if (total % k != 0) return false;
    target = total / k;
    sort(a.begin(), a.end(), greater<int>());
    if (a[0] > target) return false;
    if (k == 1) return true;

    full_mask = (1 << n) - 1;
    bad.assign(1 << n, 0);
    return dfs(0, 0);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        cout << (solve_case() ? "YES\n" : "NO\n");
    }
    return 0;
}
"""

    py = r"""import sys


def solve_case(n, k, a):
    total = sum(a)
    if total % k != 0:
        return False
    target = total // k
    a.sort(reverse=True)
    if a[0] > target:
        return False
    if k == 1:
        return True

    full_mask = (1 << n) - 1
    bad = bytearray(1 << n)

    def dfs(mask, cur):
        if mask == full_mask:
            return True
        if bad[mask]:
            return False

        if cur == 0:
            for i in range(n):
                if not (mask & (1 << i)):
                    ncur = 0 if a[i] == target else a[i]
                    if dfs(mask | (1 << i), ncur):
                        return True
                    break
            bad[mask] = 1
            return False

        prev = -1
        for i in range(n):
            if mask & (1 << i):
                continue
            v = a[i]
            if v == prev or cur + v > target:
                continue
            prev = v
            ncur = cur + v
            if ncur == target:
                ncur = 0
            if dfs(mask | (1 << i), ncur):
                return True

        bad[mask] = 1
        return False

    return dfs(0, 0)


def main():
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    t = data[0]
    pos = 1
    out = []
    for _ in range(t):
        n = data[pos]
        k = data[pos + 1]
        a = data[pos + 2 : pos + 2 + n]
        pos += 2 + n
        out.append("YES" if solve_case(n, k, a) else "NO")
    print("\n".join(out))


if __name__ == "__main__":
    main()
"""

    def brute_partition(inp: str) -> str:
        # Independent bottom-up bitmask DP over subsets
        vals = list(map(int, inp.split()))
        t = vals[0]
        pos = 1
        out = []
        for _ in range(t):
            n, k = vals[pos], vals[pos + 1]
            a = vals[pos + 2 : pos + 2 + n]
            pos += 2 + n
            total = sum(a)
            if total % k != 0 or max(a) > total // k:
                out.append("NO")
                continue
            target = total // k
            size = 1 << n
            dp = [-1] * size
            dp[0] = 0
            for mask in range(size):
                cur = dp[mask]
                if cur == -1:
                    continue
                for i in range(n):
                    if not (mask & (1 << i)) and cur + a[i] <= target:
                        nxt = cur + a[i]
                        if nxt == target:
                            nxt = 0
                        dp[mask | (1 << i)] = nxt
            out.append("YES" if dp[size - 1] == 0 else "NO")
        return "\n".join(out)

    def fmt_cases(cases: List[Tuple[int, int, List[int]]]) -> str:
        lines = [str(len(cases))]
        for n, k, arr in cases:
            lines.append(f"{n} {k}")
            lines.append(" ".join(map(str, arr)))
        return "\n".join(lines)

    rng = random.Random(708)

    def make_yes_case(n: int, k: int, max_v: int = 10000) -> Tuple[int, int, List[int]]:
        # Partition n items into k non-empty buckets of equal sum
        sizes = [1] * k
        for _ in range(n - k):
            sizes[rng.randrange(k)] += 1
        max_sz = max(sizes)
        # Ensure bucket sum fits comfortably so every item is in [1, max_v]
        bucket_sum = rng.randint(max_sz * 5, min(max_v, max_sz * 500))
        arr: List[int] = []
        for sz in sizes:
            if sz == 1:
                arr.append(bucket_sum)
            else:
                cuts = sorted(rng.sample(range(1, bucket_sum), sz - 1))
                prev = 0
                for c in cuts:
                    arr.append(c - prev)
                    prev = c
                arr.append(bucket_sum - prev)
        rng.shuffle(arr)
        return (n, k, arr)

    def make_tricky_no_case(n: int, k: int, max_v: int = 4000) -> Tuple[int, int, List[int]]:
        # Start from YES case and perturb 2 elements slightly while preserving sum % k == 0
        _, _, arr = make_yes_case(n, k, max_v)
        target = sum(arr) // k
        # Tweak two elements by +1 and -1 (or +d, -d)
        for _ in range(5):
            i, j = rng.sample(range(n), 2)
            d = rng.randint(1, min(17, max(1, arr[j] - 1)))
            if arr[i] + d <= target and arr[j] - d >= 1:
                arr[i] += d
                arr[j] -= d
                break
        return (n, k, arr)

    # Classic adversarial NO cases for naive bucket backtracking
    adversarial_cases = [
        (16, 5, [3522, 181, 521, 515, 304, 123, 2512, 312, 922, 407, 146, 1932, 4037, 2646, 3871, 269]),
        (16, 4, [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 8]),
        (16, 4, [10, 10, 10, 7, 7, 7, 7, 7, 7, 6, 6, 6, 5, 5, 5, 5]),
        (16, 3, [2, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
        (16, 5, [4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 1]),
    ]
    while len(adversarial_cases) < 20:
        adversarial_cases.append(make_tricky_no_case(16, rng.randint(3, 6), 5000))

    tests = [
        {
            "input": fmt_cases([
                (7, 4, [4, 3, 2, 3, 5, 2, 1]),
                (4, 3, [1, 2, 3, 4]),
            ]),
            "hidden": False,
            "expected": "YES\nNO",
            "checkBrute": True,
        },
        {
            "input": fmt_cases([
                (6, 3, [2, 2, 2, 2, 3, 4]),
                (4, 2, [5, 5, 5, 5]),
                (5, 5, [7, 7, 7, 7, 7]),
            ]),
            "hidden": False,
            "expected": "NO\nYES\nYES",
            "checkBrute": True,
        },
        {
            "input": fmt_cases([
                (6, 2, [1, 5, 11, 5, 2, 2]),
                (5, 2, [1, 2, 3, 4, 6]),
            ]),
            "hidden": False,
            "expected": "YES\nYES",
            "checkBrute": True,
        },
        # Edge / corner cases
        {
            "input": fmt_cases([
                (1, 1, [42]),
                (5, 1, [100, 200, 300, 400, 500]),
                (4, 4, [9, 9, 9, 9]),
                (4, 4, [9, 9, 8, 10]),
                (3, 2, [10, 1, 1]),
            ]),
            "hidden": True,
            "expected": "YES\nYES\nYES\nNO\nNO",
            "checkBrute": True,
        },
        {
            "input": fmt_cases([
                (7, 4, [2, 2, 2, 2, 3, 4, 5]),
                (5, 3, [1, 2, 3, 4, 5]),
                (6, 3, [1, 2, 3, 4, 5, 6]),
                (5, 2, [2, 2, 2, 2, 3]),
            ]),
            "hidden": True,
            "expected": "NO\nYES\nYES\nNO",
            "checkBrute": True,
        },
        {
            # Greedy traps (largest-first greedy fails, backtracking succeeds)
            "input": fmt_cases([
                (10, 3, [5, 4, 4, 3, 3, 3, 2, 2, 2, 2]),
                (12, 3, [10, 10, 10, 7, 7, 7, 7, 7, 7, 6, 6, 6]),
                (5, 2, [4, 3, 2, 2, 1]),
            ]),
            "hidden": True,
            "expected": "YES\nYES\nYES",
            "checkBrute": True,
        },
        {
            "input": fmt_cases([make_yes_case(8, 3, 10000), make_tricky_no_case(9, 3, 10000), make_yes_case(10, 4, 10000)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([
                (10, 5, [10000] * 10),
                (10, 2, [9999, 9999, 10000, 10000, 1, 1, 2, 2, 3, 3]),
                (8, 4, [5000, 5000, 4999, 5001, 4998, 5002, 1, 9999]),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        # Medium -> Large
        {
            "input": fmt_cases([make_yes_case(11, rng.randint(2, 5), 2000) if i % 2 == 0 else make_tricky_no_case(11, rng.randint(2, 5), 2000) for i in range(10)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([make_yes_case(13, rng.randint(2, 6), 3000) if i % 2 == 0 else make_tricky_no_case(13, rng.randint(2, 6), 3000) for i in range(10)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([make_yes_case(15, rng.randint(2, 6), 4000) if i % 2 == 0 else make_tricky_no_case(15, rng.randint(2, 6), 4000) for i in range(15)]),
            "hidden": True,
        },
        {
            "input": fmt_cases([make_yes_case(16, 4, 6000) for _ in range(20)]),
            "hidden": True,
        },
        {
            "input": fmt_cases(adversarial_cases),
            "hidden": True,
        },
        {
            "input": fmt_cases([make_yes_case(16, rng.randint(5, 8), 5000) if i % 2 == 0 else make_tricky_no_case(16, rng.randint(5, 8), 5000) for i in range(20)]),
            "hidden": True,
        },
        {
            "input": fmt_cases([(16, rng.randint(2, 6), [rng.randint(1, 20) for _ in range(16)]) for _ in range(20)]),
            "hidden": True,
        },
        {
            "input": fmt_cases([make_yes_case(16, rng.randint(2, 16), 10000) if i % 3 != 0 else make_tricky_no_case(16, rng.randint(2, 8), 10000) for i in range(20)]),
            "hidden": True,
        },
    ]

    stress = []
    for _ in range(18):
        tc = []
        for _ in range(5):
            n = rng.randint(1, 11)
            k = rng.randint(1, n)
            if rng.random() < 0.5:
                tc.append(make_yes_case(n, k, 200))
            else:
                tc.append((n, k, [rng.randint(1, 30) for _ in range(n)]))
        stress.append(fmt_cases(tc))

    return {
        "slug": "cp07-partition-k-equal-subsets",
        "title": "Chia mảng thành K tập con có tổng bằng nhau",
        "shortDescription": "Kiểm tra xem có thể chia N số nguyên dương vào đúng K tập con rời nhau không rỗng có tổng bằng nhau hay không.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.backtracking_pruning",
        "tags": ["quay lui", "cắt nhánh", "tối ưu", "tầng 2"],
        "statement": r"""Cho $T$ bộ test độc lập. Mỗi bộ test gồm một dãy $N$ số nguyên dương $a_1, a_2, \dots, a_N$ và một số nguyên dương $K$.

Hãy kiểm tra xem có tồn tại cách phân hoạch toàn bộ $N$ phần tử vào đúng $K$ tập con rời nhau, không rỗng sao cho tổng các phần tử trong mỗi tập con đều bằng nhau hay không.

### Dữ liệu vào
- Dòng 1: số nguyên dương $T$ là số lượng bộ test.
- Với mỗi bộ test gồm $2$ dòng:
  - Dòng 1: hai số nguyên dương $N$ và $K$.
  - Dòng 2: $N$ số nguyên dương $a_1, a_2, \dots, a_N$.

### Dữ liệu ra
- Gồm $T$ dòng, mỗi dòng in `YES` nếu có thể phân hoạch, ngược lại in `NO`.

### Ràng buộc
- $1 \le T \le 20$
- $1 \le K \le N \le 16$
- $1 \le a_i \le 10^4$""",
        "requirementsText": REQ_HEADER + "Cần kết hợp nhiều kỹ thuật cắt nhánh mạnh (sắp giảm dần, bỏ qua phần tử trùng giá trị, cố định phần tử đầu cho nhóm mới và đánh dấu trạng thái thất bại bằng bitmask) để xử lý cả các bộ test `NO` khó với $N = 16, T = 20$.",
        "hints": r"""### Gợi ý 1
Trước khi quay lui, kiểm tra điều kiện cần: tổng $S = \sum a_i$ phải chia hết cho $K$, đặt $\text{target} = S / K$, và mọi $a_i \le \text{target}$. Sắp xếp mảng $a$ **giảm dần** để các số lớn nhanh chóng lấp đầy nhóm và phát hiện nhánh sai sớm nhất.

### Gợi ý 2
Lấp đầy từng nhóm một theo tổng hiện tại `cur` (từ $0$ lên `target`):
- Khi `cur == 0` (bắt đầu một nhóm mới): mọi nhóm rỗng còn lại đều bình đẳng nhau, nên ta chỉ cần cố định đưa **phần tử chưa dùng lớn nhất** vào nhóm mới này mà không cần thử các phần tử khác.
- Khi `cur > 0`: bỏ qua các phần tử trùng giá trị vừa thử thất bại ở cùng mức đệ quy.

### Gợi ý 3
Tập các phần tử đã chọn được biểu diễn bằng một bitmask `mask` ($0 \le \text{mask} < 2^N \le 65\,536$). Vì `cur` được xác định duy nhất bởi `sum(mask) % target`, nếu một `mask` đã được chứng minh không thể hoàn thiện lời giải thì đánh dấu `bad[mask] = true` để không bao giờ duyệt lại.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_partition,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 9: cp07-sudoku-solver
# ============================================================================
def _sudoku_count_solutions(board: List[List[int]], limit: int = 2) -> Tuple[int, List[List[int]]]:
    """Independent MRV bitmask solution counter (stops at `limit`) to guarantee puzzle uniqueness."""
    g = [row[:] for row in board]
    rmask = [0] * 9
    cmask = [0] * 9
    bmask = [0] * 9
    empties: List[Tuple[int, int]] = []
    for r in range(9):
        for c in range(9):
            v = g[r][c]
            if v:
                bit = 1 << (v - 1)
                b = (r // 3) * 3 + (c // 3)
                if (rmask[r] & bit) or (cmask[c] & bit) or (bmask[b] & bit):
                    return 0, []
                rmask[r] |= bit
                cmask[c] |= bit
                bmask[b] |= bit
            else:
                empties.append((r, c))

    n_emp = len(empties)
    found = 0
    first_sol: List[List[int]] = []

    def dfs(k: int) -> None:
        nonlocal found, first_sol
        if found >= limit:
            return
        if k == n_emp:
            found += 1
            if found == 1:
                first_sol = [row[:] for row in g]
            return
        best_i = -1
        best_cnt = 10
        best_avail = 0
        for i in range(k, n_emp):
            r, c = empties[i]
            b = (r // 3) * 3 + (c // 3)
            avail = 0x1FF & ~(rmask[r] | cmask[c] | bmask[b])
            if avail == 0:
                return
            cnt = avail.bit_count()
            if cnt < best_cnt:
                best_cnt = cnt
                best_i = i
                best_avail = avail
                if cnt == 1:
                    break
        empties[k], empties[best_i] = empties[best_i], empties[k]
        r, c = empties[k]
        b = (r // 3) * 3 + (c // 3)
        avail = best_avail
        while avail and found < limit:
            bit = avail & -avail
            avail ^= bit
            d = bit.bit_length()
            g[r][c] = d
            rmask[r] |= bit
            cmask[c] |= bit
            bmask[b] |= bit
            dfs(k + 1)
            rmask[r] ^= bit
            cmask[c] ^= bit
            bmask[b] ^= bit
            g[r][c] = 0
        empties[k], empties[best_i] = empties[best_i], empties[k]

    dfs(0)
    return found, first_sol


def _generate_full_sudoku(rng: random.Random) -> List[List[int]]:
    base = [[(3 * (r % 3) + r // 3 + c) % 9 + 1 for c in range(9)] for r in range(9)]
    # Random digit permutation
    digits = list(range(1, 10))
    rng.shuffle(digits)
    # Random row permutation (shuffle bands & rows within bands)
    bands = [0, 1, 2]
    rng.shuffle(bands)
    rows = []
    for b in bands:
        sub = [3 * b, 3 * b + 1, 3 * b + 2]
        rng.shuffle(sub)
        rows.extend(sub)
    # Random col permutation
    stacks = [0, 1, 2]
    rng.shuffle(stacks)
    cols = []
    for s in stacks:
        sub = [3 * s, 3 * s + 1, 3 * s + 2]
        rng.shuffle(sub)
        cols.extend(sub)
    grid = [[digits[base[r][c] - 1] for c in cols] for r in rows]
    if rng.random() < 0.5:
        grid = [[grid[c][r] for c in range(9)] for r in range(9)]
    return grid


def _dig_unique_puzzle(rng: random.Random, target_clues: int) -> List[List[int]]:
    board = _generate_full_sudoku(rng)
    cells = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(cells)
    clues = 81
    for r, c in cells:
        if clues <= target_clues:
            break
        backup = board[r][c]
        board[r][c] = 0
        cnt, _ = _sudoku_count_solutions(board, limit=2)
        if cnt == 1:
            clues -= 1
        else:
            board[r][c] = backup
    return board


def _parse_compact_sudoku(s: str) -> List[List[int]]:
    digits = [int(ch) for ch in s if ch.isdigit()]
    assert len(digits) == 81
    return [digits[i * 9 : (i + 1) * 9] for i in range(9)]


def _fmt_sudoku(board: List[List[int]]) -> str:
    return "\n".join(" ".join(map(str, row)) for row in board)


def build_p9() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

int g[9][9];
int rmask[9], cmask[9], bmask[9];
vector<pair<int, int>> empties;

bool dfs(int k) {
    if (k == (int)empties.size()) return true;

    int best_i = -1, best_cnt = 10, best_avail = 0;
    for (int i = k; i < (int)empties.size(); ++i) {
        int r = empties[i].first, c = empties[i].second;
        int b = (r / 3) * 3 + (c / 3);
        int avail = 0x1FF & ~(rmask[r] | cmask[c] | bmask[b]);
        if (avail == 0) return false;
        int cnt = __builtin_popcount(avail);
        if (cnt < best_cnt) {
            best_cnt = cnt;
            best_i = i;
            best_avail = avail;
            if (cnt == 1) break;
        }
    }

    swap(empties[k], empties[best_i]);
    int r = empties[k].first, c = empties[k].second;
    int b = (r / 3) * 3 + (c / 3);
    int avail = best_avail;

    while (avail) {
        int bit = avail & -avail;
        avail ^= bit;
        int d = __builtin_ctz(bit) + 1;
        g[r][c] = d;
        rmask[r] |= bit;
        cmask[c] |= bit;
        bmask[b] |= bit;
        if (dfs(k + 1)) return true;
        rmask[r] ^= bit;
        cmask[c] ^= bit;
        bmask[b] ^= bit;
        g[r][c] = 0;
    }

    swap(empties[k], empties[best_i]);
    return false;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    for (int r = 0; r < 9; ++r) {
        for (int c = 0; c < 9; ++c) {
            if (!(cin >> g[r][c])) return 0;
            if (g[r][c] == 0) {
                empties.push_back({r, c});
            } else {
                int bit = 1 << (g[r][c] - 1);
                int b = (r / 3) * 3 + (c / 3);
                rmask[r] |= bit;
                cmask[c] |= bit;
                bmask[b] |= bit;
            }
        }
    }
    dfs(0);
    for (int r = 0; r < 9; ++r) {
        for (int c = 0; c < 9; ++c) {
            if (c) cout << ' ';
            cout << g[r][c];
        }
        cout << '\n';
    }
    return 0;
}
"""

    py = r"""import sys


def main():
    vals = list(map(int, sys.stdin.read().split()))
    if len(vals) < 81:
        return
    g = [vals[i * 9 : (i + 1) * 9] for i in range(9)]
    rmask = [0] * 9
    cmask = [0] * 9
    bmask = [0] * 9
    empties = []

    for r in range(9):
        for c in range(9):
            v = g[r][c]
            if v == 0:
                empties.append((r, c))
            else:
                bit = 1 << (v - 1)
                b = (r // 3) * 3 + (c // 3)
                rmask[r] |= bit
                cmask[c] |= bit
                bmask[b] |= bit

    n_emp = len(empties)

    def dfs(k):
        if k == n_emp:
            return True
        best_i = -1
        best_cnt = 10
        best_avail = 0
        for i in range(k, n_emp):
            r, c = empties[i]
            b = (r // 3) * 3 + (c // 3)
            avail = 0x1FF & ~(rmask[r] | cmask[c] | bmask[b])
            if avail == 0:
                return False
            cnt = avail.bit_count()
            if cnt < best_cnt:
                best_cnt = cnt
                best_i = i
                best_avail = avail
                if cnt == 1:
                    break

        empties[k], empties[best_i] = empties[best_i], empties[k]
        r, c = empties[k]
        b = (r // 3) * 3 + (c // 3)
        avail = best_avail

        while avail:
            bit = avail & -avail
            avail ^= bit
            g[r][c] = bit.bit_length()
            rmask[r] |= bit
            cmask[c] |= bit
            bmask[b] |= bit
            if dfs(k + 1):
                return True
            rmask[r] ^= bit
            cmask[c] ^= bit
            bmask[b] ^= bit
            g[r][c] = 0

        empties[k], empties[best_i] = empties[best_i], empties[k]
        return False

    dfs(0)
    print("\n".join(" ".join(map(str, row)) for row in g))


if __name__ == "__main__":
    main()
"""

    def brute_sudoku(inp: str) -> str:
        # Independent plain row-major recursive solver (no MRV, no bitmask) + full validity check
        vals = list(map(int, inp.split()))
        g = [vals[i * 9 : (i + 1) * 9] for i in range(9)]
        rows = [set() for _ in range(9)]
        cols = [set() for _ in range(9)]
        boxes = [set() for _ in range(9)]
        empties = []
        for r in range(9):
            for c in range(9):
                v = g[r][c]
                if v:
                    rows[r].add(v)
                    cols[c].add(v)
                    boxes[(r // 3) * 3 + (c // 3)].add(v)
                else:
                    empties.append((r, c))

        def rec(idx: int) -> bool:
            if idx == len(empties):
                return True
            r, c = empties[idx]
            b = (r // 3) * 3 + (c // 3)
            for d in range(1, 10):
                if d not in rows[r] and d not in cols[c] and d not in boxes[b]:
                    g[r][c] = d
                    rows[r].add(d)
                    cols[c].add(d)
                    boxes[b].add(d)
                    if rec(idx + 1):
                        return True
                    g[r][c] = 0
                    rows[r].remove(d)
                    cols[c].remove(d)
                    boxes[b].remove(d)
            return False

        assert rec(0), "Sudoku unsolvable"
        # Verify Sudoku rules
        full_set = set(range(1, 10))
        for i in range(9):
            assert set(g[i]) == full_set
            assert {g[r][i] for r in range(9)} == full_set
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                assert {g[br + dr][bc + dc] for dr in range(3) for dc in range(3)} == full_set
        return _fmt_sudoku(g)

    rng = random.Random(709)

    # Classic famous verified-unique puzzles
    p_sample1 = _parse_compact_sudoku(
        "530070000"
        "600195000"
        "098000060"
        "800060003"
        "400803001"
        "700020006"
        "060000280"
        "000419005"
        "000080079"
    )
    p_sample2 = _parse_compact_sudoku(
        "003020600"
        "900305001"
        "001806400"
        "008102900"
        "700000008"
        "006708200"
        "002609500"
        "800203009"
        "005010300"
    )
    p_17_clue = _parse_compact_sudoku(
        "000000010"
        "400000000"
        "020000000"
        "000050407"
        "008000300"
        "001090000"
        "300400200"
        "050100000"
        "000806000"
    )
    p_escargot = _parse_compact_sudoku(
        "100007090"
        "030020008"
        "009600500"
        "005300900"
        "010080002"
        "600004000"
        "300000010"
        "040000007"
        "007000300"
    )
    p_inkala_2012 = _parse_compact_sudoku(
        "800000000"
        "003600000"
        "070090200"
        "050007000"
        "000045700"
        "000100030"
        "001000068"
        "008500010"
        "090000400"
    )
    # Anti-naive puzzle (17+ clues concentrated toward bottom rows, punishes plain row-major)
    p_anti_naive = _parse_compact_sudoku(
        "000000000"
        "000003085"
        "001020000"
        "000507000"
        "004000100"
        "090000000"
        "500000073"
        "002010000"
        "000040009"
    )

    # Edge cases: already solved, 1 zero, 1 empty row, 1 empty 3x3 box
    full_board = _generate_full_sudoku(rng)
    one_zero = [row[:] for row in full_board]
    one_zero[4][4] = 0
    empty_row_board = _generate_full_sudoku(rng)
    for c in range(9):
        empty_row_board[0][c] = 0
    empty_box_board = _generate_full_sudoku(rng)
    for r in range(3, 6):
        for c in range(3, 6):
            empty_box_board[r][c] = 0

    puzzles: List[Tuple[List[List[int]], bool, bool]] = [
        # (board, hidden, checkBrute)
        (p_sample1, False, True),
        (p_sample2, False, True),
        (_dig_unique_puzzle(rng, 36), False, True),
        # Edge / corner cases
        (full_board, True, True),
        (one_zero, True, True),
        (empty_row_board, True, True),
        (empty_box_board, True, True),
        (p_17_clue, True, False),
        # Medium -> Hard
        (_dig_unique_puzzle(rng, 32), True, True),
        (_dig_unique_puzzle(rng, 28), True, True),
        (_dig_unique_puzzle(rng, 26), True, True),
        (_dig_unique_puzzle(rng, 25), True, True),
        (p_escargot, True, False),
        (p_inkala_2012, True, False),
        (p_anti_naive, True, False),
        (_dig_unique_puzzle(rng, 20), True, False),
    ]

    tests = []
    for idx, (board, hidden, chk_brute) in enumerate(puzzles, 1):
        cnt, sol = _sudoku_count_solutions(board, limit=2)
        assert cnt == 1, f"Sudoku test #{idx} is not unique (found {cnt} solutions)!"
        tc = {
            "input": _fmt_sudoku(board),
            "hidden": hidden,
            "checkBrute": chk_brute,
        }
        if not hidden:
            tc["expected"] = _fmt_sudoku(sol)
        tests.append(tc)

    stress = []
    for _ in range(8):
        p = _dig_unique_puzzle(rng, rng.randint(32, 48))
        cnt, _ = _sudoku_count_solutions(p, limit=2)
        assert cnt == 1
        stress.append(_fmt_sudoku(p))

    return {
        "slug": "cp07-sudoku-solver",
        "title": "Giải Sudoku 9×9",
        "shortDescription": "Giải bảng Sudoku 9×9 hợp lệ (có duy nhất một nghiệm) bằng quay lui kết hợp bitmask và chiến lược chọn ô ít khả năng nhất (MRV).",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.backtracking_pruning",
        "tags": ["quay lui", "cắt nhánh", "cài đặt", "tầng 2"],
        "statement": r"""Cho một bảng **Sudoku** kích thước $9 \times 9$ gồm các chữ số từ `0` đến `9`, trong đó `0` biểu thị ô trống cần điền và các chữ số từ `1` đến `9` là các ô đã cho sẵn.

Hãy điền vào tất cả các ô trống một chữ số từ `1` đến `9` sao cho:
1. Mỗi hàng chứa đủ $9$ chữ số từ `1` đến `9` đúng một lần.
2. Mỗi cột chứa đủ $9$ chữ số từ `1` đến `9` đúng một lần.
3. Mỗi khối con $3 \times 3$ (trong $9$ khối không giao nhau chia đều bảng $9 \times 9$) chứa đủ $9$ chữ số từ `1` đến `9` đúng một lần.

Dữ liệu vào đảm bảo bảng Sudoku luôn hợp lệ và có **duy nhất một nghiệm**.

### Dữ liệu vào
- Gồm $9$ dòng, mỗi dòng chứa $9$ số nguyên trong đoạn $[0, 9]$ cách nhau bởi một dấu cách.

### Dữ liệu ra
- Gồm $9$ dòng, mỗi dòng in $9$ số nguyên trong đoạn $[1, 9]$ cách nhau bởi một dấu cách là bảng Sudoku đã giải hoàn chỉnh.

### Ràng buộc
- Kích thước bảng cố định $9 \times 9$.
- Luôn tồn tại duy nhất một nghiệm hợp lệ (kể cả với các bảng Sudoku siêu khó ít gợi ý).""",
        "requirementsText": REQ_HEADER + "Lưu ý: Bộ test bao gồm cả các bảng Sudoku rất khó (như bảng 17 gợi ý hoặc bảng của Arto Inkala), nên quay lui thuần theo thứ tự từ trên xuống dưới có thể bị TLE nếu không kết hợp chiến lược chọn ô ít khả năng nhất (MRV).",
        "hints": r"""### Gợi ý 1
Quản lý tập chữ số đã xuất hiện trên từng hàng `rmask[9]`, từng cột `cmask[9]` và từng khối `bmask[9]` (chỉ số khối của ô $(r, c)$ là `(r / 3) * 3 + (c / 3)`) bằng $3$ mảng bitmask $9$-bit.

### Gợi ý 2
Khi đó, tập các chữ số có thể điền vào ô trống $(r, c)$ chỉ cần đúng một phép toán bit:
`avail = 0x1FF & ~(rmask[r] | cmask[c] | bmask[b])`.
Nếu tồn tại bất kỳ ô trống nào có `avail == 0`, lập tức quay lui (cắt nhánh ngay!).

### Gợi ý 3
Áp dụng heuristic **MRV (Minimum Remaining Values)**: tại mỗi bước, chọn ô trống có **số bit $1$ trong `avail` nhỏ nhất** (đặc biệt dừng tìm ngay nếu gặp ô có đúng $1$ lựa chọn). Kỹ thuật này giúp giải cả những bảng Sudoku khó nhất thế giới trong vài mili-giây.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_sudoku,
        "extraStressInputs": stress,
    }


# ============================================================================
# Problem 10: cp07-meet-in-the-middle-subset-sum
# ============================================================================
def build_p10() -> Dict:
    cpp = r"""#include <bits/stdc++.h>
using namespace std;

void gen(int idx, int end_idx, long long cur, long long limit, const vector<long long>& a, vector<long long>& out) {
    if (cur > limit) return;
    if (idx == end_idx) {
        out.push_back(cur);
        return;
    }
    gen(idx + 1, end_idx, cur, limit, a, out);
    gen(idx + 1, end_idx, cur + a[idx], limit, a, out);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long s;
    if (!(cin >> n >> s)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    int mid = n / 2;
    vector<long long> L, R;
    L.reserve(1 << mid);
    R.reserve(1 << (n - mid));
    gen(0, mid, 0, s, a, L);
    gen(mid, n, 0, s, a, R);

    sort(L.begin(), L.end());
    sort(R.begin(), R.end());

    long long ans = 0;
    int i = 0, j = (int)R.size() - 1;
    while (i < (int)L.size() && j >= 0) {
        long long sum = L[i] + R[j];
        if (sum < s) {
            ++i;
        } else if (sum > s) {
            --j;
        } else {
            long long valL = L[i], valR = R[j];
            long long cntL = 0, cntR = 0;
            while (i < (int)L.size() && L[i] == valL) {
                ++cntL;
                ++i;
            }
            while (j >= 0 && R[j] == valR) {
                ++cntR;
                --j;
            }
            ans += cntL * cntR;
        }
    }

    cout << ans << '\n';
    return 0;
}
"""

    py = r"""import sys
from collections import Counter


def gen_sums(arr, limit):
    sums = [0]
    for x in arr:
        if x <= limit:
            sums += [v + x for v in sums if v + x <= limit]
    return sums


def main():
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n, s = data[0], data[1]
    a = data[2 : 2 + n]

    mid = n // 2
    left = gen_sums(a[:mid], s)
    right = gen_sums(a[mid:], s)

    cnt = Counter(left)
    ans = 0
    for v in right:
        need = s - v
        if need in cnt:
            ans += cnt[need]
    print(ans)


if __name__ == "__main__":
    main()
"""

    def brute_mitm(inp: str) -> str:
        vals = list(map(int, inp.split()))
        n, s = vals[0], vals[1]
        a = vals[2 : 2 + n]
        ans = 0
        for mask in range(1 << n):
            cur = 0
            for i in range(n):
                if (mask >> i) & 1:
                    cur += a[i]
            if cur == s:
                ans += 1
        return str(ans)

    rng = random.Random(710)

    def rand_case(n: int, lo: int, hi: int, force_hit: bool = True) -> str:
        arr = [rng.randint(lo, hi) for _ in range(n)]
        if force_hit:
            k = rng.randint(max(1, n // 3), max(1, (2 * n) // 3))
            chosen = rng.sample(range(n), k)
            s = sum(arr[i] for i in chosen)
        else:
            s = rng.randint(lo, hi * min(n, 10))
        return f"{n} {s}\n" + " ".join(map(str, arr))

    # Build N=34 worst-case distinct sums (all 2^17 sums distinct on each half)
    arr34_distinct = [rng.randint(10**7, 10**9) for _ in range(34)]
    chosen34 = rng.sample(range(34), 17)
    s34_distinct = sum(arr34_distinct[i] for i in chosen34)

    # Build N=34 medium values with many collisions
    arr34_coll = [rng.randint(1, 5000) for _ in range(34)]
    s34_coll = sum(arr34_coll) // 2

    tests = [
        {"input": "4 5\n1 2 3 2", "hidden": False, "expected": "3", "checkBrute": True},
        {"input": "3 0\n5 10 15", "hidden": False, "expected": "1", "checkBrute": True},
        {"input": "5 10\n2 4 6 8 10", "hidden": False, "expected": "3", "checkBrute": True},
        # Edge / corner cases
        {"input": "1 7\n7", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "1 7\n8", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "1 0\n1000000000", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "6 100000000000\n" + " ".join(["1000000000"] * 6), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "10 5\n" + " ".join(["1"] * 10), "hidden": True, "expected": "252", "checkBrute": True},
        # Medium -> Large
        {"input": rand_case(14, 1, 20, True), "hidden": True, "checkBrute": True},
        {"input": rand_case(16, 1, 40, True), "hidden": True, "checkBrute": True},
        {"input": rand_case(17, 500_000_000, 1_000_000_000, True), "hidden": True, "checkBrute": True},
        {"input": rand_case(24, 1_000_000, 20_000_000, True), "hidden": True},
        {"input": rand_case(30, 500_000_000, 1_000_000_000, True), "hidden": True},
        {
            # Answer = C(34, 17) = 2,333,606,220 > INT_MAX (tests 64-bit count & 64-bit sum!)
            "input": "34 17000000000\n" + " ".join(["1000000000"] * 34),
            "hidden": True,
            "expected": str(math.comb(34, 17)),
        },
        {"input": f"34 {s34_distinct}\n" + " ".join(map(str, arr34_distinct)), "hidden": True},
        {"input": f"34 {s34_coll}\n" + " ".join(map(str, arr34_coll)), "hidden": True},
    ]

    stress = []
    for _ in range(20):
        n = rng.randint(1, 13)
        stress.append(rand_case(n, 1, 50, rng.random() < 0.7))

    return {
        "slug": "cp07-meet-in-the-middle-subset-sum",
        "title": "Đếm tập con có tổng bằng S (Meet-in-the-Middle)",
        "shortDescription": "Đếm số tập con trong 2^N tập con của dãy N ≤ 34 số nguyên dương có tổng đúng bằng S bằng kỹ thuật Meet-in-the-Middle.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.backtracking_pruning",
        "tags": ["quay lui", "meet in the middle", "tìm kiếm nhị phân", "tối ưu", "tầng 2"],
        "statement": r"""Cho một dãy gồm $N$ số nguyên dương $a_1, a_2, \dots, a_N$ và một số nguyên không âm $S$.

Trong tổng số $2^N$ tập con các chỉ số của $\{1, 2, \dots, N\}$ (bao gồm cả tập rỗng có tổng bằng $0$), hãy đếm xem có bao nhiêu tập con có tổng các phần tử đúng bằng $S$.

Lưu ý: Hai tập con khác nhau về tập chỉ số được tính là **khác nhau**, ngay cả khi các phần tử được chọn có giá trị giống nhau.

### Dữ liệu vào
- Dòng 1: hai số nguyên $N$ và $S$.
- Dòng 2: $N$ số nguyên dương $a_1, a_2, \dots, a_N$.

### Dữ liệu ra
- Một số nguyên duy nhất là số tập con có tổng đúng bằng $S$.

### Ràng buộc
- $1 \le N \le 34$
- $1 \le a_i \le 10^9$
- $0 \le S \le 10^{11}$""",
        "requirementsText": REQ_HEADER + "Lưu ý: Cả tổng phần tử lẫn đáp án đều có thể vượt quá $2^{31} - 1$ (ví dụ $\\binom{34}{17} = 2\\,333\\,606\\,220$), cần dùng kiểu số nguyên 64-bit (`long long`).",
        "hints": r"""### Gợi ý 1
Duyệt toàn bộ $2^N$ tập con tốn tới $2^{34} \approx 1.7 \times 10^{10}$ phép tính (quá chậm), còn quy hoạch động theo tổng $S \le 10^{11}$ lại bất khả thi về bộ nhớ. Hãy áp dụng kỹ thuật **Meet-in-the-Middle (Chia đôi tập)**.

### Gợi ý 2
Chia mảng thành $2$ nửa gần bằng nhau: nửa trái $L$ gồm $\lfloor N/2 \rfloor \le 17$ phần tử và nửa phải $R$ gồm $\lceil N/2 \rceil \le 17$ phần tử. Dùng quay lui sinh toàn bộ tổng tập con không vượt quá $S$ của mỗi nửa — mỗi nửa chỉ có tối đa $2^{17} = 131\,072$ tổng!

### Gợi ý 3
Với mỗi tổng $x$ ở nửa trái, ta cần đếm số lần xuất hiện của $S - x$ ở nửa phải. Có thể dùng bảng băm (trong Python dùng `Counter`) hoặc sắp xếp cả $2$ danh sách rồi dùng **hai con trỏ / tìm kiếm nhị phân** (`equal_range`) trong $O(2^{N/2} \cdot N)$.""",
        "cppSolution": cpp,
        "pythonSolution": py,
        "tests": tests,
        "brute": brute_mitm,
        "extraStressInputs": stress,
    }


def main() -> None:
    problems = [
        build_p1(),
        build_p2(),
        build_p3(),
        build_p4(),
        build_p5(),
        build_p6(),
        build_p7(),
        build_p8(),
        build_p9(),
        build_p10(),
    ]
    build_and_verify_pack(
        pack_id="07-recursion-backtracking",
        title="Tầng 2: Đệ quy, Quay lui & Nhánh cận",
        tier="Tầng 2 — Kỹ thuật lõi",
        description=(
            "10 bài đệ quy, quay lui sinh cấu hình, cắt nhánh "
            "(N-Queens, Sudoku, chia K tập bằng nhau) và kỹ thuật Meet-in-the-Middle."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
