"""
Builder & automated verifier for CodeClass CP Pack 10:
  10-simulation-bitmask — "Tầng 1–2: Cài đặt, Mô phỏng & Thao tác Bit"

Run from workspace root:
  py -3 -W error::SyntaxWarning server\\scripts\\cp-builder\\build_pack_10.py
"""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any, Dict, List, Tuple

from pack_lib import build_and_verify_pack

PACK_ID = "10-simulation-bitmask"
PACK_TITLE = "Tầng 1–2: Cài đặt, Mô phỏng & Thao tác Bit"
PACK_TIER = "Tầng 1–2 — Nền tảng & Lõi"
PACK_DESC = (
    "10 bài mô phỏng thực tế, ma trận xoắn ốc, biến đổi đối xứng D4 "
    "và thao tác Bit/XOR chuẩn USACO Bronze & AtCoder."
)

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Mô phỏng & Bitmask\n"


# ============================================================================
# Problem 1: cp10-shell-game-sim (easy, algo.problem_analysis)
# ============================================================================
def build_p01() -> Dict[str, Any]:
    rng = random.Random(1001)

    def make_inp(steps: List[Tuple[int, int, int]]) -> str:
        lines = [str(len(steps))]
        lines.extend(f"{a} {b} {g}" for a, b, g in steps)
        return "\n".join(lines) + "\n"

    def brute_p01(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        steps = []
        idx = 1
        for _ in range(n):
            steps.append((int(toks[idx]), int(toks[idx + 1]), int(toks[idx + 2])))
            idx += 3
        best = 0
        for start in (1, 2, 3):
            pebble = start
            pts = 0
            for a, b, g in steps:
                if pebble == a:
                    pebble = b
                elif pebble == b:
                    pebble = a
                if pebble == g:
                    pts += 1
            if pts > best:
                best = pts
        return str(best)

    def gen_steps(n: int, mode: str = "rand") -> List[Tuple[int, int, int]]:
        res: List[Tuple[int, int, int]] = []
        for i in range(n):
            if mode == "same_swap":
                a = rng.randint(1, 3)
                b = a
                g = rng.randint(1, 3)
            elif mode == "always_12":
                a, b = 1, 2
                g = 1 if i % 2 == 0 else 2
            elif mode == "cycle":
                a, b = (1, 2) if i % 2 == 0 else (2, 3)
                g = (i % 3) + 1
            else:
                a, b = rng.sample([1, 2, 3], 2)
                g = rng.randint(1, 3)
            res.append((a, b, g))
        return res

    tests = [
        # 3 public samples
        {
            "input": make_inp([(1, 2, 1), (3, 2, 1), (1, 3, 1)]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": make_inp([(1, 2, 3), (2, 3, 1), (1, 3, 2), (1, 2, 3)]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": make_inp([(2, 3, 2), (1, 2, 3), (1, 3, 1), (2, 3, 2), (1, 2, 2)]),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp([(1, 2, 3)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(1, 1, 1), (2, 2, 1), (3, 3, 1)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(50, "same_swap")), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(100, "always_12")), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(120, "cycle")), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (up to N = 10^4)
        {"input": make_inp(gen_steps(200)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(500)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(1000)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(2500)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(5000)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(7500, "cycle")), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(10000, "always_12")), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_steps(10000)), "hidden": True, "checkBrute": True},
    ]

    extra_stress = [make_inp(gen_steps(rng.randint(1, 60))) for _ in range(10)]

    statement = r"""
Trong trò chơi tráo cốc kinh điển, có $3$ chiếc cốc úp ngược đặt tại các vị trí $1, 2, 3$ từ trái sang phải. Trước khi bắt đầu, người điều khiển giấu một viên sỏi dưới đúng một chiếc cốc (nhưng bạn không biết là cốc nào).

Trò chơi kéo dài $N$ lượt. Ở lượt thứ $i$:
1. Người điều khiển tráo đổi vị trí hai chiếc cốc đang ở vị trí $a_i$ và $b_i$ (nếu $a_i = b_i$ thì giữ nguyên).
2. Bạn đoán viên sỏi đang nằm dưới chiếc cốc ở vị trí $g_i$. Nếu đúng, bạn được cộng $1$ điểm.

Hãy xác định số điểm **tối đa** bạn có thể đạt được bằng cách thử tất cả $3$ khả năng đặt sỏi ban đầu (dưới cốc ban đầu ở vị trí $1$, $2$, hoặc $3$).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 10^4$) — số lượt chơi.
- $N$ dòng tiếp theo, dòng thứ $i$ chứa ba số nguyên $a_i, b_i, g_i$ ($1 \le a_i, b_i, g_i \le 3$).

### Kết quả
- In ra một số nguyên duy nhất là số điểm lớn nhất có thể đạt được.

### Ràng buộc
- $1 \le N \le 10^4$
- $1 \le a_i, b_i, g_i \le 3$

### Subtasks
- **Subtask 1 (50% số điểm):** $N \le 100$.
- **Subtask 2 (50% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: Nếu sỏi ban đầu ở vị trí `1`:
  - Lượt 1: tráo `1` và `2` $\rightarrow$ sỏi sang `2`; đoán `1` (sai).
  - Lượt 2: tráo `3` và `2` $\rightarrow$ sỏi sang `3`; đoán `1` (sai).
  - Lượt 3: tráo `1` và `3` $\rightarrow$ sỏi sang `1`; đoán `1` (đúng, $1$ điểm).
  Nếu sỏi ban đầu ở vị trí `2`: sau lượt 1 ở `1` (đoán `1`: đúng), lượt 2 giữ ở `1` (đoán `1`: đúng), lượt 3 sang `3` (đoán `1`: sai) $\rightarrow$ được $2$ điểm. Với vị trí `3` ban đầu chỉ được $1$ điểm. Vậy kết quả là $2$.
"""

    hints = r"""
**Gợi ý 1:**
Chỉ có $3$ vị trí đặt sỏi ban đầu khả dĩ ($1, 2, 3$). Bạn có thể mô phỏng riêng từng trường hợp rồi lấy giá trị lớn nhất.

**Gợi ý 2:**
Thậm chí ta có thể mô phỏng cả $3$ trường hợp trong cùng một vòng lặp: duy trì mảng `cup[1..3]` với `cup[p]` là nhãn ban đầu của chiếc cốc đang nằm ở vị trí `p` (khởi tạo `cup[p] = p`), và mảng `score[1..3]`.

**Gợi ý 3:**
Ở mỗi lượt `(a, b, g)`, chỉ cần `swap(cup[a], cup[b])` rồi tăng `score[cup[g]] += 1`. Đáp án là `max(score[1], score[2], score[3])`, độ phức tạp $O(N)$ thời gian và $O(1)$ bộ nhớ.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    int cup[4] = {0, 1, 2, 3};
    long long score[4] = {0, 0, 0, 0};

    for (int i = 0; i < n; ++i) {
        int a, b, g;
        cin >> a >> b >> g;
        swap(cup[a], cup[b]);
        ++score[cup[g]];
    }

    cout << max({score[1], score[2], score[3]}) << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    cup = [0, 1, 2, 3]
    score = [0, 0, 0, 0]

    idx = 1
    for _ in range(n):
        a = int(data[idx])
        b = int(data[idx + 1])
        g = int(data[idx + 2])
        idx += 3
        cup[a], cup[b] = cup[b], cup[a]
        score[cup[g]] += 1

    sys.stdout.write(f"{max(score[1], score[2], score[3])}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-shell-game-sim",
        "title": "Trò chơi tráo cốc tìm sỏi",
        "shortDescription": "Mô phỏng N lượt tráo 3 cốc và tìm điểm đoán đúng tối đa trên cả 3 vị trí xuất phát.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.problem_analysis",
        "tags": ["mô phỏng", "cài đặt", "usaco", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 10^4",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 2: cp10-spiral-matrix-coords (easy, algo.array_scan)
# ============================================================================
def build_p02() -> Dict[str, Any]:
    rng = random.Random(1002)

    def make_inp(n: int, queries: List[Tuple[int, int]]) -> str:
        lines = [f"{n} {len(queries)}"]
        lines.extend(f"{r} {c}" for r, c in queries)
        return "\n".join(lines) + "\n"

    def brute_p02(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        q = int(toks[1])
        grid = [[0] * n for _ in range(n)]
        dr = (0, 1, 0, -1)
        dc = (1, 0, -1, 0)
        r = c = d = 0
        for val in range(1, n * n + 1):
            grid[r][c] = val
            nr = r + dr[d]
            nc = c + dc[d]
            if not (0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 0):
                d = (d + 1) & 3
                nr = r + dr[d]
                nc = c + dc[d]
            r, c = nr, nc
        out = []
        idx = 2
        for _ in range(q):
            qr = int(toks[idx]) - 1
            qc = int(toks[idx + 1]) - 1
            idx += 2
            out.append(str(grid[qr][qc]))
        return "\n".join(out)

    def rand_queries(n: int, q: int) -> List[Tuple[int, int]]:
        res = [
            (1, 1),
            (1, n),
            (n, n),
            (n, 1),
            ((n + 1) // 2, (n + 1) // 2),
        ][:q]
        while len(res) < q:
            if rng.random() < 0.25:
                k = rng.randint(0, (n - 1) // 2)
                side = rng.randint(0, 3)
                if side == 0:
                    res.append((k + 1, rng.randint(k + 1, n - k)))
                elif side == 1:
                    res.append((rng.randint(k + 1, n - k), n - k))
                elif side == 2:
                    res.append((n - k, rng.randint(k + 1, n - k)))
                else:
                    res.append((rng.randint(k + 1, n - k), k + 1))
            else:
                res.append((rng.randint(1, n), rng.randint(1, n)))
        return res

    tests = [
        # 3 public samples
        {
            "input": make_inp(3, [(1, 1), (2, 3), (2, 2), (2, 1)]),
            "hidden": False,
            "expected": "1\n4\n9\n8",
            "checkBrute": True,
        },
        {
            "input": make_inp(4, [(1, 4), (3, 4), (2, 2), (3, 2)]),
            "hidden": False,
            "expected": "4\n6\n13\n16",
            "checkBrute": True,
        },
        {
            "input": make_inp(1000000000, [(1, 1), (1000000000, 1), (2, 1), (500000000, 500000000)]),
            "hidden": False,
            "expected": "1\n2999999998\n3999999996\n999999999999999997",
            "checkBrute": False,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp(1, [(1, 1)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(2, [(1, 1), (1, 2), (2, 2), (2, 1)]), "hidden": True, "checkBrute": True},
        {
            "input": make_inp(5, [(r, c) for r in range(1, 6) for c in range(1, 6)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(999_999_999, [(500_000_000, 500_000_000), (1, 999_999_999), (500_000_000, 499_999_999)]),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_inp(1_000_000_000, [(500_000_000, 500_000_000), (500_000_000, 500_000_001), (500_000_001, 500_000_001), (500_000_001, 500_000_000)]),
            "hidden": True,
            "checkBrute": False,
        },
        # 8 medium -> large tests (kept strictly < 150KB input & output)
        {"input": make_inp(25, rand_queries(25, 100)), "hidden": True, "checkBrute": True},
        {"input": make_inp(60, rand_queries(60, 300)), "hidden": True, "checkBrute": True},
        {"input": make_inp(100, rand_queries(100, 500)), "hidden": True, "checkBrute": True},
        {"input": make_inp(1000, rand_queries(1000, 3000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(100_000, rand_queries(100_000, 5000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(999_983, rand_queries(999_983, 8500)), "hidden": True, "checkBrute": False},
        {"input": make_inp(999_999_937, rand_queries(999_999_937, 6000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(1_000_000_000, rand_queries(1_000_000_000, 6200)), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp(n, rand_queries(n, 40)) for n in (1, 2, 3, 4, 7, 12, 19, 30, 45)
    ]

    statement = r"""
Xét bảng vuông kích thước $N \times N$ (các hàng đánh số $1 \dots N$ từ trên xuống dưới, các cột đánh số $1 \dots N$ từ trái sang phải). Ta điền lần lượt các số nguyên từ $1$ đến $N^2$ theo chiều xoắn ốc **theo chiều kim đồng hồ**, xuất phát từ góc trên-trái $(1, 1)$ và đi sang phải trước.

Ví dụ với $N = 4$, bảng xoắn ốc thu được là:
$$
\begin{pmatrix}
1 & 2 & 3 & 4 \\
12 & 13 & 14 & 5 \\
11 & 16 & 15 & 6 \\
10 & 9 & 8 & 7
\end{pmatrix}
$$

Cho $Q$ truy vấn, mỗi truy vấn gồm tọa độ $(r, c)$. Hãy xác định giá trị được điền tại ô $(r, c)$ trong $O(1)$ cho mỗi truy vấn.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N$ và $Q$ ($1 \le N \le 10^9,\; 1 \le Q \le 10^4$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $r$ và $c$ ($1 \le r, c \le N$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra giá trị tại ô $(r, c)$ của truy vấn tương ứng.

### Ràng buộc
- $1 \le N \le 10^9$
- $1 \le Q \le 10^4$
- $1 \le r, c \le N$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 500$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1 ($N = 3$): Bảng gồm hàng 1 là `1 2 3`, hàng 2 là `8 9 4`, hàng 3 là `7 6 5`. Các ô `(1,1)=1`, `(2,3)=4`, `(2,2)=9`, `(2,1)=8`.
- Ví dụ 2 ($N = 4$): Như ma trận minh họa ở đề bài.
- Ví dụ 3 ($N = 10^9$): Giá trị tối đa lên tới $10^{18}$, vượt quá kiểu số nguyên 32-bit.
"""

    hints = r"""
**Gợi ý 1:**
Các ô trong bảng được chia thành các vòng biên đồng tâm lồng vào nhau. Với ô $(r, c)$, khoảng cách gần nhất tới $4$ cạnh bảng là:
$$k = \min(r - 1,\; c - 1,\; N - r,\; N - c)$$
Ô $(r, c)$ nằm đúng trên vòng biên thứ $k$ (tính từ ngoài vào, $k = 0$ là vòng ngoài cùng).

**Gợi ý 2:**
Các vòng $0, 1, \dots, k-1$ bao quanh một hình vuông bên trong cạnh $s = N - 2k$. Do đó số lượng ô đã điền trước khi vào vòng $k$ bằng:
$$\text{base} = N^2 - (N - 2k)^2 = 4k(N - k)$$

**Gợi ý 3:**
Trên vòng $k$ (góc trên-trái tại $(k+1, k+1)$, góc dưới-phải tại $(N-k, N-k)$, độ dài cạnh $s = N - 2k$):
- Nếu $s = 1$: giá trị là $\text{base} + 1$.
- Ngược lại, xét lần lượt $4$ cạnh theo đúng thứ tự điền: cạnh trên ($r = k+1$), cạnh phải ($c = N-k$), cạnh dưới ($r = N-k$), cạnh trái ($c = k+1$) để cộng thêm độ lệch. Dùng kiểu `long long` vì kết quả lên tới $10^{18}$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long n;
    int q;
    if (!(cin >> n >> q)) return 0;

    while (q--) {
        long long r, c;
        cin >> r >> c;

        long long k = min({r - 1, c - 1, n - r, n - c});
        long long s = n - 2 * k;
        long long base = 4LL * k * (n - k);
        long long top = k + 1;
        long long bot = n - k;
        long long left = k + 1;
        long long right = n - k;

        long long ans;
        if (s == 1) {
            ans = base + 1;
        } else if (r == top) {
            ans = base + 1 + (c - left);
        } else if (c == right) {
            ans = base + s + (r - top);
        } else if (r == bot) {
            ans = base + 2 * s - 1 + (right - c);
        } else {
            ans = base + 3 * s - 2 + (bot - r);
        }
        cout << ans << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    q = int(data[1])
    out = []
    idx = 2
    for _ in range(q):
        r = int(data[idx])
        c = int(data[idx + 1])
        idx += 2

        k = min(r - 1, c - 1, n - r, n - c)
        s = n - 2 * k
        base = 4 * k * (n - k)
        top = k + 1
        bot = n - k
        left = k + 1
        right = n - k

        if s == 1:
            ans = base + 1
        elif r == top:
            ans = base + 1 + (c - left)
        elif c == right:
            ans = base + s + (r - top)
        elif r == bot:
            ans = base + 2 * s - 1 + (right - c)
        else:
            ans = base + 3 * s - 2 + (bot - r)
        out.append(str(ans))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-spiral-matrix-coords",
        "title": "Truy vấn ma trận xoắn ốc",
        "shortDescription": "Tìm giá trị ô (r, c) trong bảng xoắn ốc N x N kích thước tới 10^9 trong O(1) mỗi truy vấn.",
        "difficulty": "easy",
        "estimatedTime": 18,
        "skillId": "algo.array_scan",
        "tags": ["toán học", "ma trận", "cài đặt", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 10^9, 1 <= Q <= 10^4",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 3: cp10-range-xor-prefix (easy, algo.bit_manipulation)
# ============================================================================
def build_p03() -> Dict[str, Any]:
    rng = random.Random(1003)

    def make_inp(queries: List[Tuple[int, int]]) -> str:
        lines = [str(len(queries))]
        lines.extend(f"{l} {r}" for l, r in queries)
        return "\n".join(lines) + "\n"

    def brute_p03(inp: str) -> str:
        toks = inp.split()
        q = int(toks[0])
        out = []
        idx = 1
        for _ in range(q):
            l = int(toks[idx])
            r = int(toks[idx + 1])
            idx += 2
            cur = 0
            for x in range(l, r + 1):
                cur ^= x
            out.append(str(cur))
        return "\n".join(out)

    def rand_pairs(q: int, max_v: int) -> List[Tuple[int, int]]:
        res = []
        for _ in range(q):
            a = rng.randint(0, max_v)
            b = rng.randint(0, max_v)
            if a > b:
                a, b = b, a
            res.append((a, b))
        return res

    edge_pairs_1e18 = [
        (0, 0),
        (0, 1),
        (0, 2),
        (0, 3),
        (0, 4),
        (1, 1),
        (1, 10**18),
        (0, 10**18),
        (10**18 - 5, 10**18),
        (10**18, 10**18),
        ((1 << 59) - 2, (1 << 59) + 3),
    ]

    tests = [
        # 3 public samples
        {
            "input": make_inp([(2, 4), (0, 3), (5, 5)]),
            "hidden": False,
            "expected": "5\n0\n5",
            "checkBrute": True,
        },
        {
            "input": make_inp([(1, 10), (3, 9), (0, 0)]),
            "hidden": False,
            "expected": "11\n2\n0",
            "checkBrute": True,
        },
        {
            "input": make_inp([(0, 1000000000000000000), (999999999999999997, 1000000000000000000)]),
            "hidden": False,
            "expected": "1000000000000000000\n524284",
            "checkBrute": False,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp([(i, j) for i in range(12) for j in range(i, 12)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(edge_pairs_1e18), "hidden": True, "checkBrute": False},
        {"input": make_inp([(x, x + 3) for x in range(0, 40)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(0, (1 << k) - 1) for k in range(1, 60)] + [(0, 1 << k) for k in range(60)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(10**18 - 100, 10**18 - k) for k in range(50)]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests (input & output < 150KB)
        {"input": make_inp(rand_pairs(200, 300)), "hidden": True, "checkBrute": True},
        {"input": make_inp(rand_pairs(500, 1000)), "hidden": True, "checkBrute": True},
        {"input": make_inp(rand_pairs(2000, 10**6)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(6000, 10**9)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(12000, 9999)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(20000, 99)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(3400, 10**18)), "hidden": True, "checkBrute": False},
        {"input": make_inp([(a, b) for a, b in rand_pairs(3400, 10**18)]), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [make_inp(rand_pairs(40, 200)) for _ in range(10)]

    statement = r"""
Cho $Q$ truy vấn độc lập. Mỗi truy vấn gồm hai số nguyên không âm $L$ và $R$ ($0 \le L \le R \le 10^{18}$).

Hãy tính tổng XOR của tất cả các số nguyên trong đoạn $[L, R]$:
$$S(L, R) = L \oplus (L+1) \oplus (L+2) \oplus \dots \oplus R$$
trong đó $\oplus$ là phép toán Bitwise XOR.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $Q$ ($1 \le Q \le 20\,000$) — số lượng truy vấn.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $L$ và $R$ ($0 \le L \le R \le 10^{18}$).

### Kết quả
- Gồm $Q$ dòng, mỗi dòng in ra kết quả $S(L, R)$ của truy vấn tương ứng.

### Ràng buộc
- $1 \le Q \le 20\,000$
- $0 \le L \le R \le 10^{18}$

### Subtasks
- **Subtask 1 (40% số điểm):** $Q \le 200,\; R \le 10^3$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: $2 \oplus 3 \oplus 4 = 5$, $0 \oplus 1 \oplus 2 \oplus 3 = 0$, $5 = 5$.
- Ví dụ 3: Với $[0, 10^{18}]$, vì $10^{18} \equiv 0 \pmod 4$ nên kết quả là $10^{18}$. Với $[10^{18}-3, 10^{18}]$, kết quả là $f(10^{18}) \oplus f(10^{18}-4) = 10^{18} \oplus (10^{18}-4) = 524\,284$.
"""

    hints = r"""
**Gợi ý 1:**
Đặt $f(x) = 0 \oplus 1 \oplus \dots \oplus x$ (quy ước $f(-1) = 0$). Do tính chất $a \oplus a = 0$, ta luôn có:
$$L \oplus (L+1) \oplus \dots \oplus R = f(R) \oplus f(L - 1)$$

**Gợi ý 2:**
Tính thử một vài giá trị đầu của $f(x)$:
$f(0)=0,\; f(1)=1,\; f(2)=3,\; f(3)=0,\; f(4)=4,\; f(5)=1,\; f(6)=7,\; f(7)=0 \dots$
Nhận thấy $f(x)$ lặp theo chu kỳ $4$ do mọi cặp $(2k) \oplus (2k+1) = 1$!

**Gợi ý 3:**
Công thức $O(1)$ cho $f(x)$ với $x \ge 0$:
- $x \bmod 4 = 0 \implies f(x) = x$
- $x \bmod 4 = 1 \implies f(x) = 1$
- $x \bmod 4 = 2 \implies f(x) = x + 1$
- $x \bmod 4 = 3 \implies f(x) = 0$
Nhớ dùng kiểu `long long` trong C++ để chứa được $10^{18}$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

long long prefix_xor(long long x) {
    if (x < 0) return 0;
    long long r = x & 3LL;
    if (r == 0) return x;
    if (r == 1) return 1;
    if (r == 2) return x + 1;
    return 0;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int q;
    if (!(cin >> q)) return 0;
    while (q--) {
        long long l, r;
        cin >> l >> r;
        cout << (prefix_xor(r) ^ prefix_xor(l - 1)) << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import sys


def prefix_xor(x: int) -> int:
    if x < 0:
        return 0
    r = x & 3
    if r == 0:
        return x
    if r == 1:
        return 1
    if r == 2:
        return x + 1
    return 0


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    q = int(data[0])
    out = []
    idx = 1
    for _ in range(q):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        out.append(str(prefix_xor(r) ^ prefix_xor(l - 1)))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-range-xor-prefix",
        "title": "Tổng XOR trên đoạn [L, R]",
        "shortDescription": "Tính L XOR (L+1) XOR ... XOR R cho Q truy vấn lên tới 10^18 trong O(1) mỗi truy vấn.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.bit_manipulation",
        "tags": ["thao tác bit", "toán học", "truy vấn", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= Q <= 20000, 0 <= L <= R <= 10^18",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 4: cp10-grid-dihedral-transforms (medium, algo.problem_analysis)
# ============================================================================
def build_p04() -> Dict[str, Any]:
    rng = random.Random(1004)
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

    def make_grid(n: int) -> List[str]:
        return ["".join(rng.choice(chars) for _ in range(n)) for _ in range(n)]

    def make_inp(grid: List[str], ops: str) -> str:
        n = len(grid)
        q = len(ops)
        return f"{n} {q}\n" + "\n".join(grid) + "\n" + ops + "\n"

    def brute_p04(inp: str) -> str:
        lines = inp.splitlines()
        n, _ = map(int, lines[0].split())
        g = [list(lines[i + 1].strip()) for i in range(n)]
        ops = lines[n + 1].strip()
        for op in ops:
            if op == "R":
                g = [[g[n - 1 - c][r] for c in range(n)] for r in range(n)]
            elif op == "L":
                g = [[g[c][n - 1 - r] for c in range(n)] for r in range(n)]
            elif op == "H":
                g = [row[::-1] for row in g]
            elif op == "V":
                g = g[::-1]
        return "\n".join("".join(row) for row in g)

    def rand_ops(q: int, alphabet: str = "RLHV") -> str:
        return "".join(rng.choice(alphabet) for _ in range(q))

    g3 = ["abc", "def", "ghi"]
    g4 = ["ABCD", "EFGH", "IJKL", "MNOP"]
    g2 = ["ab", "cd"]

    tests = [
        # 3 public samples
        {
            "input": make_inp(g3, "RH"),
            "hidden": False,
            "expected": "adg\nbeh\ncfi",
            "checkBrute": True,
        },
        {
            "input": make_inp(g3, "LVVR"),
            "hidden": False,
            "expected": "abc\ndef\nghi",
            "checkBrute": True,
        },
        {
            "input": make_inp(g4, "RLHV"),
            "hidden": False,
            "expected": "PONM\nLKJI\nHGFE\nDCBA",
            "checkBrute": True,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp(["Z"], "RLHVRLHV"), "hidden": True, "checkBrute": True},
        {"input": make_inp(g2, "RRRRLLLLHHHHVVVV"), "hidden": True, "checkBrute": True},
        {"input": make_inp(g4, "R"), "hidden": True, "checkBrute": True},
        {"input": make_inp(g4, "HV"), "hidden": True, "checkBrute": True},
        {"input": make_inp(make_grid(6), "LHRV" * 100), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (up to N = 80, Q = 10^5)
        {"input": make_inp(make_grid(10), rand_ops(200)), "hidden": True, "checkBrute": True},
        {"input": make_inp(make_grid(15), rand_ops(400)), "hidden": True, "checkBrute": True},
        {"input": make_inp(make_grid(25), rand_ops(2000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(make_grid(40), rand_ops(10000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(make_grid(60), rand_ops(30000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(make_grid(80), rand_ops(60000, "RH")), "hidden": True, "checkBrute": False},
        {"input": make_inp(make_grid(80), rand_ops(99999, "LV")), "hidden": True, "checkBrute": False},
        {"input": make_inp(make_grid(80), rand_ops(100000)), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp(make_grid(rng.randint(1, 8)), rand_ops(rng.randint(1, 60)))
        for _ in range(12)
    ]

    statement = r"""
Cho một ma trận ký tự kích thước $N \times N$ gồm các chữ cái tiếng Anh và một chuỗi gồm $Q$ phép biến đổi liên tiếp. Mỗi phép biến đổi thuộc một trong $4$ loại sau:
- `R`: Xoay ma trận theo chiều kim đồng hồ $90^\circ$.
- `L`: Xoay ma trận ngược chiều kim đồng hồ $90^\circ$.
- `H`: Lật ngang (đối xứng trái – phải, đảo ngược từng hàng).
- `V`: Lật dọc (đối xứng trên – dưới, đảo ngược thứ tự các hàng).

Hãy in ra ma trận kết quả sau khi thực hiện tuần tự toàn bộ $Q$ phép biến đổi.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N$ và $Q$ ($1 \le N \le 80,\; 1 \le Q \le 10^5$).
- $N$ dòng tiếp theo, mỗi dòng là một xâu gồm đúng $N$ chữ cái mô tả ma trận ban đầu.
- Dòng cuối cùng chứa xâu $S$ có độ dài đúng $Q$ chỉ gồm các ký tự `R`, `L`, `H`, `V`.

### Kết quả
- In ra $N$ dòng, mỗi dòng gồm $N$ ký tự mô tả ma trận sau khi biến đổi.

### Ràng buộc
- $1 \le N \le 80$
- $1 \le Q \le 10^5$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 20,\; Q \le 500$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1 (`RH`): Xoay phải $90^\circ$ biến `abc/def/ghi` thành `gda/heb/ifc`, sau đó lật ngang thành `adg/beh/cfi`.
- Ví dụ 2 (`LVVR`): Hai phép lật dọc `VV` triệt tiêu nhau, sau đó xoay trái `L` và xoay phải `R` cũng triệt tiêu nhau nên ma trận giữ nguyên.
"""

    hints = r"""
**Gợi ý 1:**
Nếu mô phỏng trực tiếp $Q \le 10^5$ lần trên ma trận $80 \times 80$, số thao tác lên tới $6{,}4 \cdot 10^8$ và sẽ quá thời gian. Tuy nhiên mọi tổ hợp xoay và lật hình vuông chỉ tạo ra đúng $8$ trạng thái của nhóm đối xứng nhị diện $D_4$!

**Gợi ý 2:**
Mọi phần tử trong $D_4$ đều viết được duy nhất dưới dạng $R^{\text{rot}} \circ H^{\text{flip}}$, tức là **lật ngang `flip` lần** ($\text{flip} \in \{0, 1\}$) trước, rồi **xoay phải $90^\circ$ đúng `rot` lần** ($\text{rot} \in \{0, 1, 2, 3\}$).

**Gợi ý 3:**
Sử dụng các đồng nhất thức $H \circ R = R^3 \circ H$ và $V = R^2 \circ H$, khi đọc thêm một lệnh ở bước tiếp theo ta cập nhật cặp $(\text{rot}, \text{flip})$ trong $O(1)$:
- `R`: $\text{rot} \leftarrow (\text{rot} + 1) \bmod 4$
- `L`: $\text{rot} \leftarrow (\text{rot} + 3) \bmod 4$
- `H`: $\text{rot} \leftarrow (4 - \text{rot}) \bmod 4,\; \text{flip} \leftarrow \text{flip} \oplus 1$
- `V`: $\text{rot} \leftarrow (6 - \text{rot}) \bmod 4,\; \text{flip} \leftarrow \text{flip} \oplus 1$
Cuối cùng chỉ cần áp dụng đúng $1$ phép lật (nếu $\text{flip} = 1$) và tối đa $3$ phép xoay lên ma trận. Độ phức tạp $O(Q + N^2)$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<string> g(n);
    for (int i = 0; i < n; ++i) {
        cin >> g[i];
    }
    string ops;
    cin >> ops;

    int rot = 0;
    int flip = 0;
    for (char ch : ops) {
        if (ch == 'R') {
            rot = (rot + 1) & 3;
        } else if (ch == 'L') {
            rot = (rot + 3) & 3;
        } else if (ch == 'H') {
            rot = (4 - rot) & 3;
            flip ^= 1;
        } else if (ch == 'V') {
            rot = (6 - rot) & 3;
            flip ^= 1;
        }
    }

    if (flip) {
        for (int i = 0; i < n; ++i) {
            reverse(g[i].begin(), g[i].end());
        }
    }
    for (int r = 0; r < rot; ++r) {
        vector<string> ng(n, string(n, ' '));
        for (int i = 0; i < n; ++i) {
            for (int j = 0; j < n; ++j) {
                ng[j][n - 1 - i] = g[i][j];
            }
        }
        g.swap(ng);
    }

    for (int i = 0; i < n; ++i) {
        cout << g[i] << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    # data[1] is q
    g = [list(data[2 + i]) for i in range(n)]
    ops = data[2 + n]

    rot = 0
    flip = 0
    for ch in ops:
        if ch == "R":
            rot = (rot + 1) & 3
        elif ch == "L":
            rot = (rot + 3) & 3
        elif ch == "H":
            rot = (4 - rot) & 3
            flip ^= 1
        elif ch == "V":
            rot = (6 - rot) & 3
            flip ^= 1

    if flip:
        g = [row[::-1] for row in g]
    for _ in range(rot):
        g = [[g[n - 1 - c][r] for c in range(n)] for r in range(n)]

    sys.stdout.write("\n".join("".join(row) for row in g) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-grid-dihedral-transforms",
        "title": "Nén phép xoay và lật ma trận (D4)",
        "shortDescription": "Nén chuỗi Q <= 10^5 lệnh xoay/lật ma trận vuông N x N về nhóm đối xứng D4 rồi áp dụng một lần.",
        "difficulty": "medium",
        "estimatedTime": 22,
        "skillId": "algo.problem_analysis",
        "tags": ["mô phỏng", "ma trận", "cài đặt", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 80, 1 <= Q <= 10^5",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 5: cp10-max-pair-bitwise-and (medium, algo.bit_manipulation)
# ============================================================================
def build_p05() -> Dict[str, Any]:
    rng = random.Random(1005)

    def make_inp(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(str(x) for x in arr) + "\n"

    def brute_p05(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        a = [int(toks[i + 1]) for i in range(n)]
        best = 0
        for i in range(n):
            for j in range(i + 1, n):
                v = a[i] & a[j]
                if v > best:
                    best = v
        return str(best)

    lim30 = (1 << 30) - 1
    t13 = [rng.randint(0, 10**6) for _ in range(15000)]
    t14 = [rng.randint(0, lim30) for _ in range(13000)]
    t15 = [rng.randint(0, 999) for _ in range(30000)]
    # Adversarial test where highest bit appears once and many numbers share lower bits
    t16 = [1 << 29] + [(1 << 28) | rng.randint(0, (1 << 28) - 1) for _ in range(12500)]

    tests = [
        # 3 public samples
        {"input": make_inp([4, 8, 12, 16]), "hidden": False, "expected": "8", "checkBrute": True},
        {"input": make_inp([4, 8, 16, 2]), "hidden": False, "expected": "0", "checkBrute": True},
        {"input": make_inp([1073741823, 536870912, 1073741822]), "hidden": False, "expected": "1073741822", "checkBrute": True},
        # 5 corner / edge / trap cases
        {"input": make_inp([0, 0]), "hidden": True, "checkBrute": True},
        {"input": make_inp([lim30, 0]), "hidden": True, "checkBrute": True},
        {"input": make_inp([1 << b for b in range(30)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([1 << 29, (1 << 29) - 1, (1 << 29) - 1]), "hidden": True, "checkBrute": True},
        {"input": make_inp([7, 7, 15, 31, 63]), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (kept strictly < 150KB)
        {"input": make_inp([rng.randint(0, 500) for _ in range(150)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(0, lim30) for _ in range(300)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(0, 10000) for _ in range(2000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([rng.randint(0, lim30) for _ in range(6000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t13), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp([rng.randint(0, lim30) for _ in range(rng.randint(2, 60))])
        for _ in range(10)
    ]

    statement = r"""
Cho mảng gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

Hãy tìm giá trị lớn nhất của biểu thức $(a_i \mathbin{\&} a_j)$ trên tất cả các cặp chỉ số thỏa mãn $1 \le i < j \le N$, trong đó $\mathbin{\&}$ là phép toán Bitwise AND.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($2 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

### Kết quả
- In ra một số nguyên duy nhất là giá trị lớn nhất của $(a_i \mathbin{\&} a_j)$.

### Ràng buộc
- $2 \le N \le 30\,000$
- $0 \le a_i < 2^{30}$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 500$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: Cặp $(8, 12)$ cho $8 \mathbin{\&} 12 = 8$, là giá trị lớn nhất.
- Ví dụ 2: Các số đều là lũy thừa khác nhau của $2$ nên hai số bất kỳ không có bit chung nào, kết quả bằng $0$.
- Ví dụ 3: $(2^{30}-1) \mathbin{\&} (2^{30}-2) = 2^{30}-2 = 1\,073\,741\,822$.
"""

    hints = r"""
**Gợi ý 1:**
Các bit cao luôn có trọng số lớn hơn tổng toàn bộ các bit thấp hơn nó ($2^b > \sum_{k=0}^{b-1} 2^k$). Do đó ta có thể tham lam xác định từng bit của đáp án từ bit cao nhất (`29`) xuống bit thấp nhất (`0`).

**Gợi ý 2:**
Giả sử các bit cao hơn $b$ của đáp án đã cố định thành giá trị `ans`. Để bit thứ $b$ cũng bằng `1`, ta kiểm tra ứng viên `cand = ans | (1 << b)`: liệu trong mảng có tồn tại ít nhất $2$ phần tử $a_i$ chứa đầy đủ tất cả các bit của `cand` hay không?

**Gợi ý 3:**
Điều kiện "$a_i$ chứa đầy đủ các bit của `cand`" chính là `(a[i] & cand) == cand`. Nếu đếm được $\ge 2$ phần tử thỏa mãn thì gán `ans = cand`, ngược lại giữ nguyên `ans` và chuyển sang bit $b - 1$. Độ phức tạp $O(30 N)$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
    }

    long long ans = 0;
    for (int b = 29; b >= 0; --b) {
        long long cand = ans | (1LL << b);
        int cnt = 0;
        for (long long x : a) {
            if ((x & cand) == cand) {
                ++cnt;
                if (cnt >= 2) {
                    ans = cand;
                    break;
                }
            }
        }
    }

    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(data[i + 1]) for i in range(n)]

    ans = 0
    for b in range(29, -1, -1):
        cand = ans | (1 << b)
        cnt = 0
        for x in a:
            if (x & cand) == cand:
                cnt += 1
                if cnt >= 2:
                    ans = cand
                    break

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-max-pair-bitwise-and",
        "title": "Cặp có Bitwise AND lớn nhất",
        "shortDescription": "Tìm giá trị lớn nhất của (a_i & a_j) trên N <= 30000 phần tử trong O(30 N).",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.bit_manipulation",
        "tags": ["thao tác bit", "tham lam", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 2 <= N <= 30000, 0 <= a_i < 2^30",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 6: cp10-sum-xor-all-pairs (medium, algo.bit_manipulation)
# ============================================================================
def build_p06() -> Dict[str, Any]:
    rng = random.Random(1006)
    MOD = 1_000_000_007

    def make_inp(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(str(x) for x in arr) + "\n"

    def brute_p06(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        a = [int(toks[i + 1]) for i in range(n)]
        ans = 0
        for i in range(n):
            for j in range(i + 1, n):
                ans = (ans + (a[i] ^ a[j])) % MOD
        return str(ans)

    lim30 = (1 << 30) - 1
    t14 = [rng.randint(0, lim30) for _ in range(13000)]
    t15 = [rng.randint(0, 999) for _ in range(30000)]
    t16 = [lim30 if i % 2 == 0 else 0 for i in range(13000)]

    tests = [
        # 3 public samples
        {"input": make_inp([1, 2, 3]), "hidden": False, "expected": "6", "checkBrute": True},
        {"input": make_inp([5, 9, 7, 6]), "hidden": False, "expected": "47", "checkBrute": True},
        {"input": make_inp([1073741823, 0, 1073741823]), "hidden": False, "expected": "147483632", "checkBrute": True},
        # 5 corner / edge / trap cases
        {"input": make_inp([42]), "hidden": True, "checkBrute": True},
        {"input": make_inp([0, 0, 0, 0]), "hidden": True, "checkBrute": True},
        {"input": make_inp([lim30, lim30, lim30]), "hidden": True, "checkBrute": True},
        {"input": make_inp([1 << b for b in range(30)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([0, lim30]), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (kept strictly < 150KB)
        {"input": make_inp([rng.randint(0, 1000) for _ in range(120)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(0, lim30) for _ in range(300)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(0, 10000) for _ in range(2500)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([rng.randint(0, lim30) for _ in range(6000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([rng.randint(0, 10**6) for _ in range(15000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp([rng.randint(0, lim30) for _ in range(rng.randint(1, 50))])
        for _ in range(10)
    ]

    statement = r"""
Cho mảng gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

Hãy tính tổng giá trị XOR của tất cả các cặp phần tử $(a_i, a_j)$ với $1 \le i < j \le N$, lấy phần dư khi chia cho $10^9 + 7$:
$$\left(\sum_{1 \le i < j \le N} (a_i \oplus a_j)\right) \bmod (10^9 + 7)$$

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

### Kết quả
- In ra một số nguyên duy nhất là kết quả bài toán theo modulo $10^9 + 7$.

### Ràng buộc
- $1 \le N \le 30\,000$
- $0 \le a_i < 2^{30}$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 500$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: $(1 \oplus 2) + (1 \oplus 3) + (2 \oplus 3) = 3 + 2 + 1 = 6$.
- Ví dụ 2: $(5\oplus 9) + (5\oplus 7) + (5\oplus 6) + (9\oplus 7) + (9\oplus 6) + (7\oplus 6) = 12 + 2 + 3 + 14 + 15 + 1 = 47$.
- Ví dụ 3: Tổng là $2 \cdot (2^{30}-1) = 2\,147\,483\,646 \equiv 147\,483\,632 \pmod{10^9+7}$.
"""

    hints = r"""
**Gợi ý 1:**
Các bit tại những vị trí khác nhau đóng góp hoàn toàn độc lập vào phép cộng tổng XOR. Vì vậy ta có thể tách bài toán theo từng vị trí bit $b \in \{0, 1, \dots, 29\}$.

**Gợi ý 2:**
Ở vị trí bit thứ $b$, một cặp $(a_i, a_j)$ cho bit kết quả bằng $1$ khi và chỉ khi một số có bit $b$ bằng $1$ và số còn lại có bit $b$ bằng $0$.

**Gợi ý 3:**
Đếm số phần tử có bit $b$ bằng $1$ là $c_1$, suy ra số phần tử có bit $b$ bằng $0$ là $c_0 = N - c_1$. Số cặp khác bit tại vị trí $b$ là $c_1 \cdot c_0$, nên đóng góp của bit $b$ là:
$$\left((c_1 \cdot c_0) \bmod M\right) \cdot (2^b \bmod M) \bmod M$$
với $M = 10^9 + 7$. Độ phức tạp $O(30 N)$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const long long MOD = 1000000007LL;
    int n;
    if (!(cin >> n)) return 0;

    vector<long long> a(n);
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
    }

    long long ans = 0;
    for (int b = 0; b < 30; ++b) {
        long long c1 = 0;
        for (long long x : a) {
            if ((x >> b) & 1LL) ++c1;
        }
        long long c0 = n - c1;
        long long pairs = (c1 * c0) % MOD;
        long long weight = (1LL << b) % MOD;
        ans = (ans + pairs * weight) % MOD;
    }

    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    MOD = 1_000_000_007
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(data[i + 1]) for i in range(n)]

    ans = 0
    for b in range(30):
        mask = 1 << b
        c1 = 0
        for x in a:
            if x & mask:
                c1 += 1
        c0 = n - c1
        ans = (ans + (c1 * c0 % MOD) * (mask % MOD)) % MOD

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-sum-xor-all-pairs",
        "title": "Tổng XOR mọi cặp phần tử",
        "shortDescription": "Tính tổng (a_i XOR a_j) mod (10^9 + 7) cho mọi cặp i < j bằng tách bit O(30 N).",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.bit_manipulation",
        "tags": ["thao tác bit", "toán học", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 30000, 0 <= a_i < 2^30",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 7: cp10-robot-obstacles-sim (medium, algo.set_basics)
# ============================================================================
def build_p07() -> Dict[str, Any]:
    rng = random.Random(1007)

    def make_inp(obs: List[Tuple[int, int]], cmds: List[str]) -> str:
        lines = [f"{len(obs)} {len(cmds)}"]
        lines.extend(f"{ox} {oy}" for ox, oy in obs)
        lines.extend(cmds)
        return "\n".join(lines) + "\n"

    def brute_p07(inp: str) -> str:
        toks = inp.split()
        m = int(toks[0])
        k = int(toks[1])
        obs_list = []
        idx = 2
        for _ in range(m):
            obs_list.append((int(toks[idx]), int(toks[idx + 1])))
            idx += 2
        dx = (0, 1, 0, -1)
        dy = (1, 0, -1, 0)
        x = y = d = 0
        best = 0
        for _ in range(k):
            op = toks[idx]
            idx += 1
            if op == "L":
                d = (d + 3) & 3
            elif op == "R":
                d = (d + 1) & 3
            else:
                steps = int(toks[idx])
                idx += 1
                for _ in range(steps):
                    nx = x + dx[d]
                    ny = y + dy[d]
                    blocked = False
                    for ox, oy in obs_list:
                        if ox == nx and oy == ny:
                            blocked = True
                            break
                    if blocked:
                        break
                    x, y = nx, ny
                    dist2 = x * x + y * y
                    if dist2 > best:
                        best = dist2
        return str(best)

    def gen_case(m: int, k: int, coord_lim: int, force_long_run: bool = False) -> str:
        obs_set = set()
        while len(obs_set) < m:
            ox = rng.randint(-coord_lim, coord_lim)
            oy = rng.randint(-coord_lim, coord_lim)
            if ox == 0 and oy == 0:
                continue
            obs_set.add((ox, oy))
        cmds = []
        for _ in range(k):
            if force_long_run:
                cmds.append("F 10")
            else:
                r = rng.random()
                if r < 0.2:
                    cmds.append("L")
                elif r < 0.4:
                    cmds.append("R")
                else:
                    cmds.append(f"F {rng.randint(1, 10)}")
        return make_inp(list(obs_set), cmds)

    tests = [
        # 3 public samples
        {
            "input": make_inp([(2, 4)], ["F 4", "R", "F 2", "L", "F 4"]),
            "hidden": False,
            "expected": "20",
            "checkBrute": True,
        },
        {
            "input": make_inp([(0, 1), (1, 0), (-1, 0), (0, -1)], ["F 5", "R", "F 5", "R", "F 5", "R", "F 5"]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": make_inp([(3, 2), (3, 2)], ["R", "F 3", "L", "F 5", "L", "F 2"]),
            "hidden": False,
            "expected": "10",
            "checkBrute": True,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp([], ["L", "R", "L", "L"]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(0, 3)], ["F 10", "R", "F 10"]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(0, 100000), (100000, 0)], ["F 10"] * 10 + ["R"] + ["F 10"] * 10), "hidden": True, "checkBrute": True},
        {"input": make_inp([(0, 10)], ["F 5", "F 10", "L", "F 2"]), "hidden": True, "checkBrute": True},
        # Tests overflow of 32-bit int (> 2^31 - 1) when robot marches 60000+ steps straight
        {"input": gen_case(50, 6000, 200, force_long_run=True), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests (kept strictly < 150KB)
        {"input": gen_case(20, 80, 15), "hidden": True, "checkBrute": True},
        {"input": gen_case(80, 150, 20), "hidden": True, "checkBrute": True},
        {"input": gen_case(200, 300, 30), "hidden": True, "checkBrute": True},
        {"input": gen_case(1000, 1500, 100), "hidden": True, "checkBrute": False},
        {"input": gen_case(3000, 4000, 200), "hidden": True, "checkBrute": False},
        {"input": gen_case(6000, 7000, 500), "hidden": True, "checkBrute": False},
        {"input": gen_case(10000, 8000, 999), "hidden": True, "checkBrute": False},
        {"input": gen_case(10000, 10000, 5000), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [gen_case(rng.randint(0, 30), rng.randint(1, 50), 8) for _ in range(10)]

    statement = r"""
Một robot bắt đầu tại gốc tọa độ $(0, 0)$ trên mặt phẳng tọa độ nguyên vô hạn, hướng mặt về phía **Bắc** (vector hướng $(0, +1)$). Trên mặt phẳng có $M$ vật cản đặt tại các tọa độ $(ox_i, oy_i)$ (đảm bảo tại $(0, 0)$ không có vật cản).

Robot thực hiện tuần tự $K$ lệnh, mỗi lệnh có một trong $3$ dạng sau:
- `L`: Quay trái $90^\circ$ tại chỗ.
- `R`: Quay phải $90^\circ$ tại chỗ.
- `F d`: Tiến thẳng về phía trước tối đa $d$ bước ($1 \le d \le 10$), **từng bước một**. Nếu ô tiếp theo chứa vật cản thì robot dừng lại ở ô hiện tại (bỏ qua các bước còn lại của lệnh `F d` này) và chuyển sang lệnh tiếp theo.

Tìm giá trị lớn nhất của $x^2 + y^2$ (bình phương khoảng cách Euclid tới gốc tọa độ) mà robot từng đứng tới trong suốt hành trình (tính cả điểm xuất phát $(0, 0)$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $M$ và $K$ ($0 \le M \le 10\,000,\; 1 \le K \le 10\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $ox_i, oy_i$ ($-10^5 \le ox_i, oy_i \le 10^5$) mô tả tọa độ một vật cản (có thể trùng lặp).
- $K$ dòng cuối cùng, mỗi dòng chứa một lệnh (`L`, `R`, hoặc `F d` với $1 \le d \le 10$).

### Kết quả
- In ra một số nguyên duy nhất là giá trị lớn nhất của $x^2 + y^2$.

### Ràng buộc
- $0 \le M \le 10\,000$
- $1 \le K \le 10\,000$
- $1 \le d \le 10$

### Subtasks
- **Subtask 1 (40% số điểm):** $M, K \le 200$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: Robot đi từ `(0,0)` lên `(0,4)`, rẽ phải sang `(2,4)` nhưng gặp vật cản tại `(2,4)` nên dừng ở `(1,4)` ($1^2 + 4^2 = 17$), rồi rẽ trái đi lên `(1,8)` hay dừng? Ở `(1,4)` hướng Bắc đi tiếp `F 4` tới `(1,8)` ($1^2 + 8^2 = 65$)? Khoan: `(0,4)` rẽ phải sang hướng Đông: bước 1 tới `(1,4)`, bước 2 muốn vào `(2,4)` bị chặn nên dừng ở `(1,4)`. Sau đó `L` quay Bắc và `F 4` tới `(1,8)`? Khoan, kiểm tra lại!
"""
    # Wait! Let's fix Sample 1 explanation and expected value carefully!
    # In Sample 1: obs = [(2, 4)], cmds = ["F 4", "R", "F 2", "L", "F 4"]
    # (0,0) North -> F 4 -> (0,4) [d2=16] -> R (East) -> F 2 -> step1 (1,4) [d2=17], step2 (2,4) blocked! -> L (North) -> F 4 -> (1,8) [d2=65]!
    # Good thing we traced it in the explanation! Let's update Sample 1's expected to "65" (or change cmd to ["F 4", "R", "F 2"] -> 17, or trace ["F 4", "R", "F 2", "L", "F 4"] -> 65)!
    # Let's also check Sample 3: obs = [(3,2),(3,2)], cmds = ["R", "F 3", "L", "F 5", "L", "F 2"]
    # (0,0) R -> East -> F 3 -> (3,0) [9] -> L (North) -> F 5 -> step1 (3,1) [10], step2 (3,2) blocked! -> L (West) -> F 2 -> (1,1) [2]. Max = 10!
    tests[0]["expected"] = "65"
    statement = r"""
Một robot bắt đầu tại gốc tọa độ $(0, 0)$ trên mặt phẳng tọa độ nguyên vô hạn, hướng mặt về phía **Bắc** (vector hướng $(0, +1)$). Trên mặt phẳng có $M$ vật cản đặt tại các tọa độ $(ox_i, oy_i)$ (đảm bảo tại $(0, 0)$ không có vật cản).

Robot thực hiện tuần tự $K$ lệnh, mỗi lệnh có một trong $3$ dạng sau:
- `L`: Quay trái $90^\circ$ tại chỗ.
- `R`: Quay phải $90^\circ$ tại chỗ.
- `F d`: Tiến thẳng về phía trước tối đa $d$ bước ($1 \le d \le 10$), **từng bước một**. Nếu ô tiếp theo chứa vật cản thì robot dừng lại ở ô hiện tại (bỏ qua các bước còn lại của lệnh `F d` này) và chuyển sang lệnh tiếp theo.

Tìm giá trị lớn nhất của $x^2 + y^2$ (bình phương khoảng cách Euclid tới gốc tọa độ) mà robot từng đứng tới trong suốt hành trình (tính cả điểm xuất phát $(0, 0)$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $M$ và $K$ ($0 \le M \le 10\,000,\; 1 \le K \le 10\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $ox_i, oy_i$ ($-10^5 \le ox_i, oy_i \le 10^5$) mô tả tọa độ một vật cản (có thể trùng lặp).
- $K$ dòng cuối cùng, mỗi dòng chứa một lệnh (`L`, `R`, hoặc `F d` với $1 \le d \le 10$).

### Kết quả
- In ra một số nguyên duy nhất là giá trị lớn nhất của $x^2 + y^2$.

### Ràng buộc
- $0 \le M \le 10\,000$
- $1 \le K \le 10\,000$
- $1 \le d \le 10$

### Subtasks
- **Subtask 1 (40% số điểm):** $M, K \le 200$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: Robot đi từ `(0,0)` lên `(0,4)`, quay phải sang hướng Đông rồi bước 1 sang `(1,4)`, bước 2 gặp vật cản `(2,4)` nên dừng tại `(1,4)`. Sau đó quay trái về hướng Bắc và tiến `4` bước lên `(1,8)`, đạt $1^2 + 8^2 = 65$.
- Ví dụ 2: Gốc `(0,0)` bị chặn kín cả 4 hướng kề cạnh nên robot chỉ quay tại chỗ và kết quả là $0$.
- Ví dụ 3: Robot đi sang `(3,0)` ($3^2+0^2=9$), tiến lên `(3,1)` ($10$) thì vướng vật cản `(3,2)`, sau đó rẽ trái đi về `(1,1)` ($2$). Giá trị lớn nhất là $10$.
"""

    hints = r"""
**Gợi ý 1:**
Dùng mảng hướng cố định theo chiều kim đồng hồ: Bắc `(0, 1)`, Đông `(1, 0)`, Nam `(0, -1)`, Tây `(-1, 0)`. Khi gặp lệnh `R` thì `dir = (dir + 1) % 4`, gặp `L` thì `dir = (dir + 3) % 4`.

**Gợi ý 2:**
Với $K \le 10\,000$ và $d \le 10$, tổng số bước robot thử di chuyển không vượt quá $10^5$. Nếu lưu vật cản vào `set<pair<long long, long long>>` (trong C++) hoặc `set` (trong Python), mỗi bước kiểm tra vật cản chỉ tốn $O(\log M)$ hoặc $O(1)$ trung bình.

**Gợi ý 3:**
Lưu ý tọa độ của robot có thể đạt tới $\pm 10^5$, nên $x^2 + y^2$ có thể lên tới $2 \cdot 10^{10}$ — **bắt buộc dùng kiểu 64-bit (`long long`)** để tránh tràn số nguyên 32-bit.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int m, k;
    if (!(cin >> m >> k)) return 0;

    set<pair<long long, long long>> obs;
    for (int i = 0; i < m; ++i) {
        long long ox, oy;
        cin >> ox >> oy;
        obs.emplace(ox, oy);
    }

    const long long dx[4] = {0, 1, 0, -1};
    const long long dy[4] = {1, 0, -1, 0};

    long long x = 0, y = 0, best = 0;
    int dir = 0;

    for (int i = 0; i < k; ++i) {
        string cmd;
        cin >> cmd;
        if (cmd == "L") {
            dir = (dir + 3) & 3;
        } else if (cmd == "R") {
            dir = (dir + 1) & 3;
        } else {
            int d;
            cin >> d;
            for (int s = 0; s < d; ++s) {
                long long nx = x + dx[dir];
                long long ny = y + dy[dir];
                if (obs.count({nx, ny})) break;
                x = nx;
                y = ny;
                best = max(best, x * x + y * y);
            }
        }
    }

    cout << best << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    m = int(data[0])
    k = int(data[1])
    obs = set()
    idx = 2
    for _ in range(m):
        ox = int(data[idx])
        oy = int(data[idx + 1])
        idx += 2
        obs.add((ox, oy))

    dx = (0, 1, 0, -1)
    dy = (1, 0, -1, 0)
    x = y = d = 0
    best = 0

    for _ in range(k):
        op = data[idx]
        idx += 1
        if op == "L":
            d = (d + 3) & 3
        elif op == "R":
            d = (d + 1) & 3
        else:
            steps = int(data[idx])
            idx += 1
            vx = dx[d]
            vy = dy[d]
            for _ in range(steps):
                nx = x + vx
                ny = y + vy
                if (nx, ny) in obs:
                    break
                x, y = nx, ny
                dist2 = x * x + y * y
                if dist2 > best:
                    best = dist2

    sys.stdout.write(f"{best}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-robot-obstacles-sim",
        "title": "Robot né vật cản trên lưới",
        "shortDescription": "Mô phỏng robot thực hiện K lệnh di chuyển/xoay trên lưới vô hạn có M vật cản bằng tập hợp (Set).",
        "difficulty": "medium",
        "estimatedTime": 22,
        "skillId": "algo.set_basics",
        "tags": ["mô phỏng", "map-set", "cài đặt", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 0 <= M, K <= 10000, 1 <= d <= 10",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 8: cp10-range-bitwise-and-or (hard, algo.bit_manipulation)
# ============================================================================
def build_p08() -> Dict[str, Any]:
    rng = random.Random(1008)

    def make_inp(queries: List[Tuple[int, int]]) -> str:
        lines = [str(len(queries))]
        lines.extend(f"{l} {r}" for l, r in queries)
        return "\n".join(lines) + "\n"

    def brute_p08(inp: str) -> str:
        toks = inp.split()
        q = int(toks[0])
        out = []
        idx = 1
        for _ in range(q):
            l = int(toks[idx])
            r = int(toks[idx + 1])
            idx += 2
            cur_and = l
            cur_or = l
            for x in range(l + 1, r + 1):
                cur_and &= x
                cur_or |= x
            out.append(f"{cur_and} {cur_or}")
        return "\n".join(out)

    def rand_pairs(q: int, max_v: int) -> List[Tuple[int, int]]:
        res = []
        for _ in range(q):
            a = rng.randint(0, max_v)
            b = rng.randint(0, max_v)
            if a > b:
                a, b = b, a
            res.append((a, b))
        return res

    def rand_close_pairs(q: int, max_v: int, max_span: int) -> List[Tuple[int, int]]:
        res = []
        for _ in range(q):
            a = rng.randint(0, max_v)
            b = min(max_v, a + rng.randint(0, max_span))
            res.append((a, b))
        return res

    edge_pairs = [
        (0, 0),
        (1, 1),
        (0, 1),
        (10**18, 10**18),
        (0, 10**18),
        ((1 << 59) - 1, 1 << 59),
        ((1 << 59) + 5, (1 << 59) + 12),
        (10**18 - 1023, 10**18),
    ]

    tests = [
        # 3 public samples
        {
            "input": make_inp([(10, 12), (5, 7), (0, 0)]),
            "hidden": False,
            "expected": "8 15\n4 7\n0 0",
            "checkBrute": True,
        },
        {
            "input": make_inp([(1, 2), (8, 15), (12, 12)]),
            "hidden": False,
            "expected": "0 3\n8 15\n12 12",
            "checkBrute": True,
        },
        {
            "input": make_inp([(1000000000000000000, 1000000000000000000), (999999999999999992, 999999999999999995)]),
            "hidden": False,
            "expected": "1000000000000000000 1000000000000000000\n999999999999999992 999999999999999995",
            "checkBrute": False,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp([(i, j) for i in range(16) for j in range(i, 16)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(edge_pairs), "hidden": True, "checkBrute": False},
        {"input": make_inp([(1 << k, (1 << k) + 7) for k in range(4, 59)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([((1 << k) - 1, (1 << k)) for k in range(1, 60)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(10**18 - 100, 10**18 - i) for i in range(60)]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests (both input & output < 150KB)
        {"input": make_inp(rand_pairs(200, 200)), "hidden": True, "checkBrute": True},
        {"input": make_inp(rand_pairs(400, 600)), "hidden": True, "checkBrute": True},
        {"input": make_inp(rand_pairs(2000, 10**6)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(5000, 10**9)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(10000, 999)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(20000, 199)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_pairs(3000, 10**18)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_close_pairs(3000, 10**18, 10**12)), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [make_inp(rand_pairs(40, 150)) for _ in range(10)]

    statement = r"""
Cho $Q$ truy vấn độc lập. Ở mỗi truy vấn, bạn được cho hai số nguyên không âm $L$ và $R$ ($0 \le L \le R \le 10^{18}$).

Hãy tính hai giá trị sau cho toàn bộ đoạn các số nguyên liên tiếp $[L, R]$:
1. Bitwise AND của cả đoạn: $L \mathbin{\&} (L+1) \mathbin{\&} \dots \mathbin{\&} R$.
2. Bitwise OR của cả đoạn: $L \mathbin{|} (L+1) \mathbin{|} \dots \mathbin{|} R$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $Q$ ($1 \le Q \le 20\,000$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $L$ và $R$ ($0 \le L \le R \le 10^{18}$).

### Kết quả
- Gồm $Q$ dòng, mỗi dòng in ra hai số nguyên cách nhau bởi dấu cách là kết quả Bitwise AND và Bitwise OR của đoạn $[L, R]$.

### Ràng buộc
- $1 \le Q \le 20\,000$
- $0 \le L \le R \le 10^{18}$

### Subtasks
- **Subtask 1 (40% số điểm):** $Q \le 200,\; R \le 500$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: Với $[10, 12] = \{10, 11, 12\} = \{(1010)_2, (1011)_2, (1100)_2\}$, ta có AND bằng $(1000)_2 = 8$ và OR bằng $(1111)_2 = 15$.
- Ví dụ 2: Với $[8, 15]$, biểu diễn nhị phân chạy từ $(1000)_2$ đến $(1111)_2$, nên các bit thấp $0, 1, 2$ đều có đủ cả `0` và `1`, chỉ giữ lại bit cao nhất $8$.
"""

    hints = r"""
**Gợi ý 1:**
Viết $L$ và $R$ dưới dạng nhị phân $60$ bit. Xét vị trí bit cao nhất mà $L$ và $R$ khác nhau (gọi vị trí đó là $k$, nên ở bit $k$ thì $L$ có `0` còn $R$ có `1`).

**Gợi ý 2:**
Mọi số trong đoạn $[L, R]$ đều có phần **tiền tố chung** (các bit $> k$) giống hệt $L$ và $R$. Riêng tại các bit $\le k$, vì $[L, R]$ chứa cặp số liên tiếp chuyển giao $(M-1, M)$ với $M$ giữ nguyên tiền tố chung, đặt bit $k$ bằng `1` và toàn bộ bit $< k$ bằng `0`, nên mọi bit $\le k$ đều xuất hiện ít nhất một lần là `0` và ít nhất một lần là `1` trong $[L, R]$!

**Gợi ý 3:**
Gọi $s$ là độ dài hậu tố tính từ bit khác nhau cao nhất trở xuống (nghĩa là $L \gg s = R \gg s$, cụ thể $s = \text{bit\_length}(L \oplus R)$ khi $L \neq R$, và $s = 0$ khi $L = R$). Khi đó:
- $\text{AND}[L, R] = (L \gg s) \ll s$
- $\text{OR}[L, R] = \text{AND}[L, R] \mathbin{|} ((1 \ll s) - 1)$
Dùng kiểu `unsigned long long` (hoặc `long long` với $1\text{ULL} \ll s$) để dịch bit an toàn tới $60$ bit.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int q;
    if (!(cin >> q)) return 0;

    while (q--) {
        unsigned long long l, r;
        cin >> l >> r;

        int shift = 0;
        unsigned long long a = l, b = r;
        while (a != b) {
            a >>= 1;
            b >>= 1;
            ++shift;
        }
        unsigned long long ans_and = a << shift;
        unsigned long long ans_or = ans_and | ((1ULL << shift) - 1ULL);
        cout << ans_and << ' ' << ans_or << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    q = int(data[0])
    out = []
    idx = 1
    for _ in range(q):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        if l == r:
            out.append(f"{l} {r}")
        else:
            shift = (l ^ r).bit_length()
            mask = (1 << shift) - 1
            ans_and = l & ~mask
            ans_or = ans_and | mask
            out.append(f"{ans_and} {ans_or}")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-range-bitwise-and-or",
        "title": "Bitwise AND và OR trên đoạn [L, R]",
        "shortDescription": "Tính đồng thời Bitwise AND và Bitwise OR của toàn bộ đoạn [L, R] lên tới 10^18 bằng tiền tố nhị phân chung.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.bit_manipulation",
        "tags": ["thao tác bit", "toán học", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= Q <= 20000, 0 <= L <= R <= 10^18",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 9: cp10-subarray-xor-equals-k (hard, algo.bit_manipulation)
# ============================================================================
def build_p09() -> Dict[str, Any]:
    rng = random.Random(1009)

    def make_inp(k: int, arr: List[int]) -> str:
        return f"{len(arr)} {k}\n" + " ".join(str(x) for x in arr) + "\n"

    def brute_p09(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        k = int(toks[1])
        a = [int(toks[i + 2]) for i in range(n)]
        ans = 0
        for l in range(n):
            cur = 0
            for r in range(l, n):
                cur ^= a[r]
                if cur == k:
                    ans += 1
        return str(ans)

    lim30 = (1 << 30) - 1
    t13 = [rng.randint(0, 15) for _ in range(25000)]
    t14 = [rng.randint(0, lim30) for _ in range(13000)]
    t15 = [0 for _ in range(30000)]  # max answer: 30000 * 30001 / 2 = 450,015,000
    t16_k = rng.randint(1, lim30)
    t16 = [t16_k if i % 3 == 0 else 0 for i in range(13000)]

    tests = [
        # 3 public samples
        {"input": make_inp(6, [4, 2, 2, 6, 4]), "hidden": False, "expected": "4", "checkBrute": True},
        {"input": make_inp(5, [5, 6, 7, 8, 9]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": make_inp(0, [0, 0, 0]), "hidden": False, "expected": "6", "checkBrute": True},
        # 5 corner / edge / trap cases
        {"input": make_inp(7, [7]), "hidden": True, "checkBrute": True},
        {"input": make_inp(7, [8]), "hidden": True, "checkBrute": True},
        {"input": make_inp(0, [1, 2, 3, 1, 2, 3]), "hidden": True, "checkBrute": True},
        {"input": make_inp(lim30, [lim30, 0, lim30, 0, lim30]), "hidden": True, "checkBrute": True},
        {"input": make_inp(3, [1, 2, 1, 2, 1, 2, 1, 2]), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (kept strictly < 150KB)
        {"input": make_inp(4, [rng.randint(0, 15) for _ in range(150)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(10, [rng.randint(0, 31) for _ in range(300)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(7, [rng.randint(0, 15) for _ in range(2500)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(42, [rng.randint(0, 127) for _ in range(8000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(9, t13), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14[0] ^ t14[1], t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(0, t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16_k, t16), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp(rng.randint(0, 15), [rng.randint(0, 15) for _ in range(rng.randint(1, 50))])
        for _ in range(10)
    ]

    statement = r"""
Cho mảng gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ và một số nguyên không âm $K$ ($0 \le a_i, K < 2^{30}$).

Hãy đếm số lượng đoạn con liên tiếp $(l, r)$ ($1 \le l \le r \le N$) có tổng XOR bằng đúng $K$:
$$a_l \oplus a_{l+1} \oplus \dots \oplus a_r = K$$

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N$ và $K$ ($1 \le N \le 30\,000,\; 0 \le K < 2^{30}$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

### Kết quả
- In ra một số nguyên duy nhất là số đoạn con thỏa mãn.

### Ràng buộc
- $1 \le N \le 30\,000$
- $0 \le a_i, K < 2^{30}$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 500$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1 ($K = 6$, mảng `[4, 2, 2, 6, 4]`): Có $4$ đoạn con cho XOR bằng $6$ là `[4, 2]`, `[4, 2, 2, 6, 4]`, `[2, 2, 6]` và `[6]`.
- Ví dụ 2 ($K = 5$, mảng `[5, 6, 7, 8, 9]`): Hai đoạn thỏa mãn là `[5]` và `[5, 6, 7, 8, 9]` (vì $6 \oplus 7 \oplus 8 \oplus 9 = 0$).
- Ví dụ 3 ($K = 0$, mảng `[0, 0, 0]`): Tất cả $6$ đoạn con khác rỗng đều có XOR bằng $0$.
"""

    hints = r"""
**Gợi ý 1:**
Đặt mảng tiền tố XOR: $P_0 = 0$, và $P_i = a_1 \oplus a_2 \oplus \dots \oplus a_i$. Do $x \oplus x = 0$, tổng XOR của đoạn $[l, r]$ chính là $P_r \oplus P_{l-1}$.

**Gợi ý 2:**
Điều kiện $P_r \oplus P_{l-1} = K$ tương đương với:
$$P_{l-1} = P_r \oplus K$$
Khi duyệt $r$ từ $1$ đến $N$, ta chỉ cần đếm xem trước $r$ có bao nhiêu chỉ số $l - 1 \in \{0, \dots, r - 1\}$ có giá trị tiền tố đúng bằng $P_r \oplus K$.

**Gợi ý 3:**
Sử dụng bảng băm (`unordered_map` trong C++, `dict` trong Python) lưu số lần xuất hiện của mỗi giá trị $P$, khởi tạo `freq[0] = 1`. Chú ý cập nhật đáp án **trước** khi tăng `freq[P_r]` (đặc biệt quan trọng khi $K = 0$ để không đếm đoạn rỗng). Đáp án tối đa là $\frac{N(N+1)}{2}$, nên dùng `long long`.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct CustomHash {
    size_t operator()(uint64_t x) const noexcept {
        x += 0x9e3779b97f4a7c15ULL;
        x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
        x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
        return static_cast<size_t>(x ^ (x >> 31));
    }
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long k;
    if (!(cin >> n >> k)) return 0;

    unordered_map<long long, long long, CustomHash> freq;
    freq.reserve(static_cast<size_t>(n) * 2 + 16);
    freq[0] = 1;

    long long pref = 0;
    long long ans = 0;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        pref ^= x;
        auto it = freq.find(pref ^ k);
        if (it != freq.end()) {
            ans += it->second;
        }
        ++freq[pref];
    }

    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])

    freq = {0: 1}
    pref = 0
    ans = 0
    for i in range(n):
        pref ^= int(data[i + 2])
        ans += freq.get(pref ^ k, 0)
        freq[pref] = freq.get(pref, 0) + 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-subarray-xor-equals-k",
        "title": "Đếm đoạn con có tổng XOR bằng K",
        "shortDescription": "Đếm số đoạn con liên tiếp có XOR bằng K trên mảng N <= 30000 phần tử bằng Prefix XOR và Hash Map.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.bit_manipulation",
        "tags": ["thao tác bit", "prefix xor", "map-set", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 30000, 0 <= a_i, K < 2^30",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 10: cp10-lights-out-min-flips (hard, algo.bit_manipulation)
# ============================================================================
def build_p10() -> Dict[str, Any]:
    rng = random.Random(1010)

    def make_inp(rows: List[str]) -> str:
        r = len(rows)
        c = len(rows[0])
        return f"{r} {c}\n" + "\n".join(rows) + "\n"

    def brute_p10(inp: str) -> str:
        lines = inp.splitlines()
        R, C = map(int, lines[0].split())
        init = [[int(ch) for ch in lines[1 + i].strip()] for i in range(R)]
        total = R * C
        best = total + 1
        for mask in range(1 << total):
            g = [row[:] for row in init]
            flips = 0
            for idx in range(total):
                if (mask >> idx) & 1:
                    flips += 1
                    if flips >= best:
                        break
                    r, c = divmod(idx, C)
                    g[r][c] ^= 1
                    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < R and 0 <= nc < C:
                            g[nr][nc] ^= 1
            else:
                if all(v == 0 for row in g for v in row):
                    best = flips
        return str(-1 if best > total else best)

    def gen_solvable_grid(R: int, C: int, k_presses: int) -> List[str]:
        g = [[0] * C for _ in range(R)]
        cells = [(r, c) for r in range(R) for c in range(C)]
        for r, c in rng.sample(cells, min(k_presses, len(cells))):
            g[r][c] ^= 1
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < R and 0 <= nc < C:
                    g[nr][nc] ^= 1
        return ["".join(str(x) for x in row) for row in g]

    def gen_rand_grid(R: int, C: int) -> List[str]:
        return ["".join(rng.choice("01") for _ in range(C)) for _ in range(R)]

    tests = [
        # 3 public samples
        {
            "input": make_inp(["110", "100", "000"]),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": make_inp(["111", "010", "111"]),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        {
            "input": make_inp(["10"]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        # 5 corner / edge / trap cases
        {"input": make_inp(["0"]), "hidden": True, "checkBrute": True},
        {"input": make_inp(["1"]), "hidden": True, "checkBrute": True},
        {"input": make_inp(["1111"]), "hidden": True, "checkBrute": True},
        {"input": make_inp(["1", "0", "1", "1", "0", "1"]), "hidden": True, "checkBrute": True},
        {"input": make_inp(["0000", "0000", "0000", "0000"]), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (up to 14 x 14)
        {"input": make_inp(gen_rand_grid(3, 5)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_solvable_grid(4, 4, 6)), "hidden": True, "checkBrute": True},
        {"input": make_inp(gen_rand_grid(6, 8)), "hidden": True, "checkBrute": False},
        {"input": make_inp(gen_solvable_grid(8, 12, 35)), "hidden": True, "checkBrute": False},
        {"input": make_inp(gen_solvable_grid(10, 14, 50)), "hidden": True, "checkBrute": False},
        {"input": make_inp(gen_solvable_grid(14, 10, 60)), "hidden": True, "checkBrute": False},
        {"input": make_inp(["1" * 14 for _ in range(14)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(gen_solvable_grid(14, 14, 90)), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp(gen_rand_grid(rng.randint(1, 4), rng.randint(1, 4)))
        for _ in range(10)
    ]

    statement = r"""
Cho một bảng lưới đèn gồm $R$ hàng và $C$ cột ($1 \le R, C \le 14$). Mỗi ô có trạng thái ban đầu là `1` (đèn đang bật) hoặc `0` (đèn đang tắt).

Trong mỗi bước, bạn có thể chọn một ô bất kỳ $(r, c)$ và bấm công tắc tại ô đó; thao tác này sẽ **đảo trạng thái** (`0` thành `1`, `1` thành `0`) của chính ô $(r, c)$ cùng tối đa $4$ ô kề cạnh chung với nó (trên, dưới, trái, phải nếu tồn tại trong bảng).

Hãy tìm số lần bấm công tắc **ít nhất** để tắt toàn bộ đèn trên bảng (mọi ô đều có giá trị `0`), hoặc in ra `-1` nếu không thể tắt hết toàn bộ đèn.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $R$ và $C$ ($1 \le R, C \le 14$).
- $R$ dòng tiếp theo, mỗi dòng là một xâu nhị phân độ dài $C$ gồm các ký tự `0` và `1` mô tả trạng thái ban đầu của lưới đèn.

### Kết quả
- In ra một số nguyên duy nhất là số lần bấm ít nhất, hoặc `-1` nếu vô nghiệm.

### Ràng buộc
- $1 \le R, C \le 14$

### Subtasks
- **Subtask 1 (40% số điểm):** $R \cdot C \le 16$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ví dụ 1: Chỉ cần bấm đúng $1$ lần tại ô góc trên-trái `(1, 1)`, cả $3$ ô bật `(1,1)`, `(1,2)`, `(2,1)` đều tắt.
- Ví dụ 2: Bấm tại `(2, 1)`, `(2, 2)` và `(2, 3)` (hàng giữa) sẽ đảo trạng thái toàn bộ bảng về `0`.
- Ví dụ 3: Bảng $1 \times 2$ có trạng thái `10` không thể tắt hết được vì bấm bất kỳ ô nào trong $2$ ô đều làm cả $2$ ô cùng đảo trạng thái, nên hai ô luôn khác trạng thái nhau.
"""

    hints = r"""
**Gợi ý 1:**
Thứ tự các lần bấm không quan trọng, và bấm một ô $2$ lần tương đương không bấm lần nào. Do đó mỗi ô chỉ có $2$ lựa chọn: bấm ($1$) hoặc không bấm ($0$).

**Gợi ý 2:**
Nếu ta đã chọn xong cấu hình các ô cần bấm trên **hàng đầu tiên** (hàng $0$), thì mọi đèn còn sáng trên hàng $0$ chỉ còn đúng một cách duy nhất để tắt: bấm vào ô ngay bên dưới nó ở hàng $1$! Tương tự, cấu hình bấm hàng $r$ hoàn toàn bị ép xác định duy nhất bởi trạng thái hàng $r - 1$ trước đó.

**Gợi ý 3:**
- Nếu $R < C$, hãy chuyển vị bảng thành $C \times R$ để luôn có $C = \min(R, C) \le 14$.
- Dùng bitmask cho từng hàng (mỗi hàng là một số nguyên $C$-bit). Duyệt tất cả $2^C \le 16\,384$ cấu hình bấm ở hàng $0$, mô phỏng nhanh phép XOR dịch bit qua từng hàng $0 \dots R-1$ rồi kiểm tra xem hàng cuối cùng có bằng $0$ hay không. Độ phức tạp $O(2^{\min(R,C)} \cdot \max(R,C))$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int R, C;
    if (!(cin >> R >> C)) return 0;

    vector<string> raw(R);
    for (int i = 0; i < R; ++i) {
        cin >> raw[i];
    }

    if (R < C) {
        vector<string> trans(C, string(R, '0'));
        for (int i = 0; i < R; ++i) {
            for (int j = 0; j < C; ++j) {
                trans[j][i] = raw[i][j];
            }
        }
        raw.swap(trans);
        swap(R, C);
    }

    vector<int> grid(R, 0);
    for (int i = 0; i < R; ++i) {
        int mask = 0;
        for (int j = 0; j < C; ++j) {
            if (raw[i][j] == '1') {
                mask |= (1 << j);
            }
        }
        grid[i] = mask;
    }

    int limit = 1 << C;
    int mask_all = limit - 1;
    vector<int> popcnt(limit, 0);
    for (int m = 1; m < limit; ++m) {
        popcnt[m] = popcnt[m >> 1] + (m & 1);
    }

    int best = R * C + 1;
    for (int first_press = 0; first_press < limit; ++first_press) {
        int prev_press = 0;
        int press = first_press;
        int flips = popcnt[press];
        bool ok = true;

        for (int r = 0; r < R; ++r) {
            if (flips >= best) {
                ok = false;
                break;
            }
            int cur = grid[r] ^ prev_press ^ press ^ ((press << 1) & mask_all) ^ (press >> 1);
            if (r == R - 1) {
                if (cur != 0) ok = false;
            } else {
                prev_press = press;
                press = cur;
                flips += popcnt[press];
            }
        }

        if (ok) {
            best = flips;
        }
    }

    cout << (best > R * C ? -1 : best) << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    R = int(data[0])
    C = int(data[1])
    raw = data[2 : 2 + R]

    if R < C:
        raw = ["".join(raw[r][c] for r in range(R)) for c in range(C)]
        R, C = C, R

    grid = []
    for row in raw:
        mask = 0
        for j, ch in enumerate(row):
            if ch == "1":
                mask |= 1 << j
        grid.append(mask)

    limit = 1 << C
    mask_all = limit - 1
    popcnt = [0] * limit
    for m in range(1, limit):
        popcnt[m] = popcnt[m >> 1] + (m & 1)

    best = R * C + 1
    last_r = R - 1
    for first_press in range(limit):
        prev_press = 0
        press = first_press
        flips = popcnt[press]
        ok = True
        for r in range(R):
            if flips >= best:
                ok = False
                break
            cur = grid[r] ^ prev_press ^ press ^ ((press << 1) & mask_all) ^ (press >> 1)
            if r == last_r:
                if cur != 0:
                    ok = False
            else:
                prev_press = press
                press = cur
                flips += popcnt[press]
        if ok:
            best = flips

    sys.stdout.write(f"{-1 if best > R * C else best}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp10-lights-out-min-flips",
        "title": "Tắt đèn tối thiểu (Lights Out)",
        "shortDescription": "Tìm số lần bấm ít nhất để tắt toàn bộ lưới đèn R x C (<= 14) bằng duyệt bitmask cạnh ngắn nhất.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.bit_manipulation",
        "tags": ["thao tác bit", "bitmask", "quay lui", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= R, C <= 14",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p10,
        "extraStressInputs": extra_stress,
    }


def main() -> None:
    problems = [
        build_p01(),
        build_p02(),
        build_p03(),
        build_p04(),
        build_p05(),
        build_p06(),
        build_p07(),
        build_p08(),
        build_p09(),
        build_p10(),
    ]

    for p in problems:
        slug = p["slug"]
        assert len(p["tests"]) == 16, f"[{slug}] expected 16 tests, got {len(p['tests'])}"
        for ti, tc in enumerate(p["tests"], 1):
            sz = len(tc["input"].encode("utf-8"))
            assert sz < 150_000, f"[{slug}] test #{ti} input is {sz} bytes (>= 150KB)"

    out_path: Path = build_and_verify_pack(
        pack_id=PACK_ID,
        title=PACK_TITLE,
        tier=PACK_TIER,
        description=PACK_DESC,
        problems=problems,
    )
    assert out_path.exists()

    # Verify generated output sizes are also < 150KB per test case
    import json
    with open(out_path, "r", encoding="utf-8") as f:
        pack_data = json.load(f)
    for prob in pack_data["problems"]:
        for ti, tc in enumerate(prob["testCases"], 1):
            out_sz = len(tc["output"].encode("utf-8"))
            assert out_sz < 150_000, f"[{prob['slug']}] test #{ti} output is {out_sz} bytes (>= 150KB)"


if __name__ == "__main__":
    main()
