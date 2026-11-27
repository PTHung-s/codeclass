"""
Builder & automated verifier for CodeClass CP Pack 11:
Tầng 1–2: Tư duy Ad-hoc, Bất biến & Chẵn lẻ

Generates and verifies 10 original Vietnamese competitive programming problems
(3 easy, 4 medium, 3 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import random
import sys
from collections import Counter, deque
from pathlib import Path
from typing import Dict, List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Tư duy Ad-hoc & Bất biến\n"
SAFE_MAX_BYTES = 148_000


def fmt_array(arr: List[int]) -> str:
    return f"{len(arr)}\n" + " ".join(map(str, arr))


def fmt_multi_arrays(cases: List[List[int]]) -> str:
    lines = [str(len(cases))]
    for arr in cases:
        lines.append(str(len(arr)))
        lines.append(" ".join(map(str, arr)))
    return "\n".join(lines)


# ============================================================================
# 1. cp11-stick-lengths-median
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    p = toks[1 : 1 + n]
    best = None
    for cand in set(p):
        cost = sum(abs(x - cand) for x in p)
        if best is None or cost < best:
            best = cost
    return str(best)


def build_p01() -> dict:
    rng = random.Random(1101)

    tests = [
        # 3 public samples
        {"input": fmt_array([2, 3, 1, 5, 2]), "hidden": False, "expected": "5", "checkBrute": True},
        {"input": fmt_array([10, 10, 10, 10]), "hidden": False, "expected": "0", "checkBrute": True},
        {"input": fmt_array([1, 10, 2, 9]), "hidden": False, "expected": "16", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([1000000000]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_array([1, 1000000000]), "hidden": True, "expected": "999999999", "checkBrute": True},
        {"input": fmt_array([1, 1, 1, 1000000000, 1000000000, 1000000000]), "hidden": True, "checkBrute": True},
        {"input": fmt_array([1000000000, 999999999, 1000000000, 1, 2]), "hidden": True, "checkBrute": True},
        {"input": fmt_array([5] * 25 + [100] * 24), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests (staying strictly < 148 KB)
    tests.append({"input": fmt_array([rng.randint(1, 1000) for _ in range(200)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([rng.randint(1, 10**9) for _ in range(500)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([rng.randint(1, 100) for _ in range(2000)]), "hidden": True})
    tests.append({"input": fmt_array(list(range(1, 5001))), "hidden": True})
    tests.append({"input": fmt_array([1 if i % 2 == 0 else 10**9 for i in range(10000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(1, 10**9) for _ in range(13000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(1, 9999) for _ in range(28000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(1, 999) for _ in range(30000)]), "hidden": True})

    extra_stress = [
        fmt_array([rng.randint(1, 50) for _ in range(rng.randint(1, 25))])
        for _ in range(40)
    ]

    statement = r"""Trong xưởng mộc của thầy An có $N$ thanh gỗ đặt trên bàn, thanh thứ $i$ có độ dài ban đầu là $p_i$. Để làm một khung tranh chuẩn kích thước, thầy An cần chỉnh sửa sao cho **tất cả** $N$ thanh gỗ đều có cùng một độ dài $x$ ($x$ là số nguyên dương tùy ý).

Mỗi lần cắt ngắn hoặc nối dài một thanh gỗ từ độ dài $p_i$ thành $x$ sẽ tiêu tốn chi phí đúng bằng $|p_i - x|$.

Hãy giúp thầy An tìm **tổng chi phí nhỏ nhất** để đưa toàn bộ $N$ thanh gỗ về cùng một độ dài.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên dương $p_1, p_2, \dots, p_N$ ($1 \le p_i \le 10^9$) cách nhau bởi dấu cách.

### Kết quả
- In ra một số nguyên duy nhất là tổng chi phí nhỏ nhất tìm được.

### Ràng buộc
- $1 \le N \le 30\,000$
- $1 \le p_i \le 10^9$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 1\,000$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1:** Với mảng $[2, 3, 1, 5, 2]$, chọn độ dài đích $x = 2$ cho tổng chi phí $|2-2| + |3-2| + |1-2| + |5-2| + |2-2| = 0 + 1 + 1 + 3 + 0 = 5$. Không có giá trị $x$ nào cho chi phí nhỏ hơn $5$.
- **Ví dụ 2:** Mọi thanh đã dài bằng $10$, chọn $x = 10$ cho chi phí $0$.
- **Ví dụ 3:** Sau khi sắp xếp thành $[1, 2, 9, 10]$, bất kỳ $x \in [2, 9]$ nào (chẳng hạn $x = 2$ hoặc $x = 9$) đều cho tổng chi phí tối ưu là $16$."""

    hints = r"""**Gợi ý 1 (Nhận xét hình học):**
Hãy sắp xếp các độ dài tăng dần: $p_1 \le p_2 \le \dots \le p_N$. Xét cặp ngoài cùng $(p_1, p_N)$: với mọi $x$ nằm trong đoạn $[p_1, p_N]$, tổng khoảng cách $|p_1 - x| + |p_N - x| = p_N - p_1$ là **hằng số**. Nếu $x$ ra ngoài đoạn này, tổng khoảng cách đó chỉ có thể tăng lên.

**Gợi ý 2 (Quy nạp vào giữa):**
Áp dụng lập luận tương tự cho các cặp đối xứng $(p_2, p_{N-1}), (p_3, p_{N-2}), \dots$: để tổng mọi cặp đều nhỏ nhất, $x$ phải nằm trong giao của tất cả các đoạn đó — tức là **trung vị (median)** của dãy sau khi sắp xếp ($p_{\lfloor N/2 \rfloor}$ theo chỉ số 0).

**Gợi ý 3 (Cài đặt & tràn số):**
- Sắp xếp mảng $p$ mất $O(N \log N)$, lấy phần tử giữa $m = p[\lfloor N / 2 \rfloor]$ rồi cộng $\sum |p_i - m|$.
- Chú ý tổng chi phí có thể lên tới khoảng $1.5 \times 10^{13}$, vượt quá kiểu `int` 32-bit; trong C++ bắt buộc dùng `long long`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> p(n);
    for (int i = 0; i < n; ++i) {
        cin >> p[i];
    }

    sort(p.begin(), p.end());
    long long median = p[n / 2];
    long long totalCost = 0;
    for (int i = 0; i < n; ++i) {
        totalCost += llabs(p[i] - median);
    }

    cout << totalCost << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    p = [int(x) for x in data[1 : 1 + n]]
    p.sort()
    median = p[n // 2]
    total_cost = sum(abs(x - median) for x in p)
    sys.stdout.write(f"{total_cost}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-stick-lengths-median",
        "title": "Đồng bộ thanh gỗ bằng trung vị",
        "shortDescription": "Tìm tổng chi phí nhỏ nhất để chỉnh mọi thanh gỗ về cùng độ dài.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "sắp xếp", "toán học", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N), dùng kiểu số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp11-missing-coin-sum
# ============================================================================

def brute_p02(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    sums = {0}
    for x in a:
        sums |= {s + x for s in sums}
    ans = 1
    while ans in sums:
        ans += 1
    return str(ans)


def build_p02() -> dict:
    rng = random.Random(1102)

    tests = [
        # 3 public samples
        {"input": fmt_array([2, 9, 1, 2, 7]), "hidden": False, "expected": "6", "checkBrute": True},
        {"input": fmt_array([2, 3, 4]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": fmt_array([1, 2, 4, 8]), "hidden": False, "expected": "16", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([1]), "hidden": True, "expected": "2", "checkBrute": True},
        {"input": fmt_array([2]), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_array([1, 1, 1, 1, 1]), "hidden": True, "expected": "6", "checkBrute": True},
        {"input": fmt_array([1, 2, 4, 7, 15, 1000000000]), "hidden": True, "checkBrute": True},
        {"input": fmt_array([1 << i for i in range(16)]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array([rng.randint(1, 10) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([rng.randint(1, 100) for _ in range(18)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([1 << min(i, 29) for i in range(30)] + [rng.randint(1, 10**9) for _ in range(200)]), "hidden": True})
    tests.append({"input": fmt_array([1] * 1000 + [1002] + [rng.randint(1, 10**6) for _ in range(500)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(1, 50) for _ in range(5000)]), "hidden": True})
    tests.append({"input": fmt_array([1 << i for i in range(30)] * 400 + [rng.randint(1, 10**9) for _ in range(1000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(1, 10**9) for _ in range(13000)]), "hidden": True})
    tests.append({"input": fmt_array([1 if i < 2000 else rng.randint(1, 9999) for i in range(28000)]), "hidden": True})

    extra_stress = [
        fmt_array([rng.randint(1, 15) for _ in range(rng.randint(1, 14))])
        for _ in range(50)
    ]

    statement = r"""Bạn đang sở hữu $N$ đồng xu, đồng xu thứ $i$ có mệnh giá nguyên dương $a_i$. Mỗi đồng xu chỉ được sử dụng tối đa một lần.

Hãy tìm **tổng nguyên dương nhỏ nhất** không thể tạo thành bằng cách chọn một tập con các đồng xu đã cho.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

### Kết quả
- In ra một số nguyên dương duy nhất là tổng nhỏ nhất không thể tạo thành.

### Ràng buộc
- $1 \le N \le 30\,000$
- $1 \le a_i \le 10^9$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 18$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1:** Sắp xếp các đồng xu thành $[1, 2, 2, 7, 9]$. Ta tạo được $1 = 1$, $2 = 2$, $3 = 1 + 2$, $4 = 2 + 2$, $5 = 1 + 2 + 2$. Không có cách nào tạo tổng $6$ vì đồng xu tiếp theo là $7 > 6$.
- **Ví dụ 2:** Không có đồng xu mệnh giá $1$ nên tổng nhỏ nhất không tạo được là $1$.
- **Ví dụ 3:** Các lũy thừa của $2$ ($1, 2, 4, 8$) tạo đủ mọi tổng từ $1$ đến $15$, nên đáp án là $16$."""

    hints = r"""**Gợi ý 1 (Bất biến tiền tố):**
Sắp xếp các đồng xu tăng dần: $a_1 \le a_2 \le \dots \le a_N$. Giả sử sau khi xét $k$ đồng xu đầu tiên, tập các tổng tạo được phủ **liên tiếp** trọn vẹn đoạn $[0, R]$ (mọi số nguyên từ $0$ đến $R$ đều tạo được).

**Gợi ý 2 (Mở rộng đoạn phủ):**
Khi thêm đồng xu tiếp theo có giá trị $x = a_{k+1}$:
- Nếu $x \le R + 1$: bằng cách giữ nguyên các tổng cũ $[0, R]$ hoặc cộng thêm $x$ vào chúng, ta phủ được $[0, R] \cup [x, R + x] = [0, R + x]$. Không có lỗ hổng nào xuất hiện!
- Nếu $x > R + 1$: mọi đồng xu sau $x$ cũng đều $\ge x > R + 1$, nên không thể tạo được $R + 1$. Dừng lại ngay!

**Gợi ý 3 (Cài đặt & tràn số):**
Khởi tạo `reach = 0`. Duyệt mảng đã sắp xếp: nếu `x > reach + 1` thì dừng; ngược lại cộng `reach += x`. Đáp án cuối cùng là `reach + 1`. Trong C++ dùng `long long` vì `reach` có thể vượt $10^{13}$."""

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

    sort(a.begin(), a.end());
    long long reach = 0;
    for (long long x : a) {
        if (x > reach + 1) break;
        reach += x;
    }

    cout << (reach + 1) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1 : 1 + n]]
    a.sort()

    reach = 0
    for x in a:
        if x > reach + 1:
            break
        reach += x

    sys.stdout.write(f"{reach + 1}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-missing-coin-sum",
        "title": "Tổng đồng xu nhỏ nhất còn thiếu",
        "shortDescription": "Tìm tổng nguyên dương nhỏ nhất không thể tạo từ tập con các đồng xu.",
        "difficulty": "easy",
        "estimatedTime": 18,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tham lam", "tư duy", "sắp xếp", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N), dùng kiểu số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp11-adjacent-sign-flip-max
# ============================================================================

def brute_p03(inp: str) -> str:
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out = []
    for _ in range(t):
        n = toks[idx]
        idx += 1
        a = toks[idx : idx + n]
        idx += n
        # Independent BFS over all 2^n sign configurations reachable via adjacent flips
        vis = {0}
        q = deque([0])
        best = sum(a)
        while q:
            mask = q.popleft()
            cur = sum(-a[i] if (mask >> i) & 1 else a[i] for i in range(n))
            if cur > best:
                best = cur
            for i in range(n - 1):
                nmask = mask ^ (1 << i) ^ (1 << (i + 1))
                if nmask not in vis:
                    vis.add(nmask)
                    q.append(nmask)
        out.append(str(best))
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1103)

    tests = [
        # 3 public samples
        {
            "input": fmt_multi_arrays([[-1, 7, -2], [1, -3, 2], [-5, 0, 4]]),
            "hidden": False,
            "expected": "10\n4\n9",
            "checkBrute": True,
        },
        {
            "input": fmt_multi_arrays([[-1, -2, -3], [-10, -20]]),
            "hidden": False,
            "expected": "4\n30",
            "checkBrute": True,
        },
        {
            "input": fmt_multi_arrays([[0, -100, -100, -100], [5, 6]]),
            "hidden": False,
            "expected": "300\n11",
            "checkBrute": True,
        },
        # 5 edge cases
        {"input": fmt_multi_arrays([[-1000000000, 1000000000], [-1000000000, -1000000000]]), "hidden": True, "checkBrute": True},
        {"input": fmt_multi_arrays([[0, 0], [-1, 0, -2, -3], [1000000000, -1]]), "hidden": True, "checkBrute": True},
        {"input": fmt_multi_arrays([[-10**9] * 5, [-10**9] * 6]), "hidden": True, "checkBrute": True},
        {"input": fmt_multi_arrays([[1, -2, 3, -4, 5, -6, 7, -8, 9, -10]]), "hidden": True, "checkBrute": True},
        {"input": fmt_multi_arrays([[rng.randint(-50, 50) for _ in range(9)] for _ in range(10)]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests (all < 148 KB)
    tests.append({"input": fmt_multi_arrays([[rng.randint(-1000, 1000) for _ in range(10)] for _ in range(20)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_multi_arrays([[rng.randint(-10**9, 10**9) for _ in range(100)] for _ in range(5)]), "hidden": True})
    tests.append({"input": fmt_multi_arrays([[rng.randint(-10**9, -1) for _ in range(201)] for _ in range(5)]), "hidden": True})
    tests.append({"input": fmt_multi_arrays([[rng.randint(-10**9, 10**9) for _ in range(500)] for _ in range(10)]), "hidden": True})
    tests.append({"input": fmt_multi_arrays([[rng.randint(-100, 100) for _ in range(200)] for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_multi_arrays([[rng.randint(-10**9, 10**9) for _ in range(2000)] for _ in range(5)]), "hidden": True})
    tests.append({"input": fmt_multi_arrays([[-10**9 + i for i in range(1999)] for _ in range(5)]), "hidden": True})
    tests.append({"input": fmt_multi_arrays([[rng.randint(-999, 999) for _ in range(2000)] for _ in range(12)]), "hidden": True})

    extra_stress = [
        fmt_multi_arrays([[rng.randint(-20, 20) for _ in range(rng.randint(2, 9))] for _ in range(5)])
        for _ in range(25)
    ]

    statement = r"""Cho $T$ bộ dữ liệu thử nghiệm. Mỗi bộ gồm một mảng $A$ gồm $N$ số nguyên $a_1, a_2, \dots, a_N$.

Bạn được phép thực hiện thao tác sau với số lần **tùy ý** (kể cả $0$ lần):
- Chọn một chỉ số $i$ ($1 \le i < N$) và **đổi dấu đồng thời** cả hai phần tử kề nhau $a_i$ và $a_{i+1}$ (tức gán $a_i \leftarrow -a_i$ và $a_{i+1} \leftarrow -a_{i+1}$).

Hãy tìm **tổng lớn nhất** của toàn bộ mảng $A$ mà bạn có thể đạt được.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 100$) — số bộ test.
- Mỗi bộ test gồm hai dòng:
  - Dòng đầu chứa số nguyên $N$ ($2 \le N \le 2\,000$).
  - Dòng sau chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- Với mỗi bộ test, in ra một dòng duy nhất là tổng lớn nhất có thể đạt được.

### Ràng buộc
- $1 \le T \le 100$
- $2 \le N \le 2\,000$
- $|a_i| \le 10^9$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 10$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1:**
  - Bộ 1 (`[-1, 7, -2]`): Đổi dấu cặp $(1, 2)$ được `[1, -7, -2]`, rồi đổi dấu cặp $(2, 3)$ được `[1, 7, 2]`, tổng là $10$.
  - Bộ 2 (`[1, -3, 2]`): Đổi dấu cặp $(1, 2)$ được `[-1, 3, 2]`, tổng là $-1 + 3 + 2 = 4$.
  - Bộ 3 (`[-5, 0, 4]`): Đổi dấu cặp $(1, 2)$ được `[5, 0, 4]` (vì $-0 = 0$), tổng là $9$."""

    hints = r"""**Gợi ý 1 (Di chuyển dấu âm):**
Bằng cách đổi dấu liên tiếp các cặp $(i, i+1), (i+1, i+2), \dots$, ta có thể "đẩy" một dấu âm từ vị trí bất kỳ đến vị trí bất kỳ khác, hoặc gộp hai dấu âm lại để triệt tiêu nhau. Như vậy thực chất ta có thể đổi dấu **hai phần tử ở hai vị trí bất kỳ**, không nhất thiết phải kề nhau!

**Gợi ý 2 (Bất biến tính chẵn lẻ):**
Mỗi thao tác làm thay đổi tính chất âm/dương của $2$ phần tử (nếu không có số $0$), nên **tính chẵn lẻ của số lượng phần tử âm** là một **bất biến**.
- Nếu số phần tử âm ban đầu là **chẵn**, hoặc mảng có ít nhất một **số $0$** (vì $-0 = 0$, ta có thể hấp thụ dấu âm vào số $0$): mọi phần tử đều có thể trở thành không âm, tổng lớn nhất là $\sum |a_i|$.
- Nếu số phần tử âm là **lẻ** và không có số $0$: bắt buộc phải còn lại đúng $1$ phần tử mang dấu âm.

**Gợi ý 3 (Chọn phần tử hy sinh):**
Khi số phần tử âm lẻ và không có $0$, ta đẩy dấu âm duy nhất về phần tử có trị tuyệt đối nhỏ nhất $m = \min |a_i|$. Khi đó tổng đạt được là $\left(\sum_{i=1}^N |a_i|\right) - 2m$. Dùng `long long` trong C++ để tránh tràn số."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t;
    if (!(cin >> t)) return 0;
    while (t--) {
        int n;
        cin >> n;
        long long sumAbs = 0;
        long long minAbs = LLONG_MAX;
        int negCount = 0;
        bool hasZero = false;

        for (int i = 0; i < n; ++i) {
            long long x;
            cin >> x;
            if (x < 0) ++negCount;
            if (x == 0) hasZero = true;
            long long ax = llabs(x);
            sumAbs += ax;
            if (ax < minAbs) minAbs = ax;
        }

        if (hasZero || negCount % 2 == 0) {
            cout << sumAbs << '\n';
        } else {
            cout << (sumAbs - 2 * minAbs) << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    idx = 1
    out = []
    for _ in range(t):
        n = int(data[idx])
        idx += 1
        sum_abs = 0
        min_abs = 10**18
        neg_count = 0
        has_zero = False
        for _ in range(n):
            x = int(data[idx])
            idx += 1
            if x < 0:
                neg_count += 1
            elif x == 0:
                has_zero = True
            ax = -x if x < 0 else x
            sum_abs += ax
            if ax < min_abs:
                min_abs = ax
        if has_zero or (neg_count & 1) == 0:
            out.append(str(sum_abs))
        else:
            out.append(str(sum_abs - 2 * min_abs))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-adjacent-sign-flip-max",
        "title": "Đổi dấu kề nhau tối đa tổng",
        "shortDescription": "Tìm tổng mảng lớn nhất sau số lần đổi dấu hai phần tử kề nhau tùy ý.",
        "difficulty": "easy",
        "estimatedTime": 18,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "bất biến", "tham lam", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N) mỗi bộ test, dùng kiểu số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp11-collecting-numbers-rounds
# ============================================================================

def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    nxt = 1
    rounds = 0
    while nxt <= n:
        rounds += 1
        for x in a:
            if x == nxt:
                nxt += 1
    return str(rounds)


def build_p04() -> dict:
    rng = random.Random(1104)

    def rand_perm(n: int) -> List[int]:
        p = list(range(1, n + 1))
        rng.shuffle(p)
        return p

    tests = [
        # 3 public samples
        {"input": fmt_array([4, 2, 1, 5, 3]), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt_array([1, 2, 3, 4, 5]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": fmt_array([5, 4, 3, 2, 1]), "hidden": False, "expected": "5", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([1]), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_array([2, 1]), "hidden": True, "expected": "2", "checkBrute": True},
        {"input": fmt_array([2, 3, 4, 5, 1]), "hidden": True, "expected": "2", "checkBrute": True},
        {"input": fmt_array([5, 1, 2, 3, 4]), "hidden": True, "expected": "2", "checkBrute": True},
        {"input": fmt_array([2, 1, 4, 3, 6, 5, 8, 7]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array(rand_perm(200)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(rand_perm(1000)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(list(range(1, 5001))), "hidden": True})
    tests.append({"input": fmt_array(list(range(5000, 0, -1))), "hidden": True})
    tests.append({"input": fmt_array([i for i in range(2, 15001, 2)] + [i for i in range(1, 15001, 2)]), "hidden": True})
    tests.append({"input": fmt_array(rand_perm(20000)), "hidden": True})
    tests.append({"input": fmt_array(rand_perm(25000)), "hidden": True})
    tests.append({"input": fmt_array(rand_perm(26000)), "hidden": True})  # ~145 KB

    extra_stress = [
        fmt_array(rand_perm(rng.randint(1, 50)))
        for _ in range(40)
    ]

    statement = r"""Cho một hoán vị gồm $N$ số nguyên từ $1$ đến $N$: $a_1, a_2, \dots, a_N$.

Nhiệm vụ của bạn là thu thập các số theo đúng thứ tự tăng dần từ $1$ đến $N$ thông qua các lượt đi. Ở mỗi lượt, bạn xuất phát từ đầu mảng bên trái, đi một mạch sang cuối mảng bên phải; mỗi khi đi qua phần tử có giá trị bằng đúng số kế tiếp bạn đang cần thu thập (ban đầu là $1$, thu thập xong $x$ thì cần $x+1$), bạn lấy luôn số đó.

Hỏi cần **ít nhất bao nhiêu lượt** đi từ trái sang phải để thu thập hết toàn bộ các số từ $1$ đến $N$?

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên là một hoán vị của $\{1, 2, \dots, N\}$.

### Kết quả
- In ra một số nguyên dương duy nhất là số lượt cần thiết.

### Ràng buộc
- $1 \le N \le 30\,000$
- Dãy đầu vào là một hoán vị hợp lệ của $1..N$.

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 2\,000$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1 (`[4, 2, 1, 5, 3]`):**
  - Lượt 1: gặp $1$, thu thập $\{1\}$.
  - Lượt 2: gặp $2$ rồi gặp $3$, thu thập $\{2, 3\}$.
  - Lượt 3: gặp $4$ rồi gặp $5$, thu thập $\{4, 5\}$.
  Tổng cộng cần $3$ lượt.
- **Ví dụ 2 (`[1, 2, 3, 4, 5]`):** Chỉ cần $1$ lượt duy nhất để lấy trọn từ $1$ đến $5$.
- **Ví dụ 3 (`[5, 4, 3, 2, 1]`):** Mỗi lượt chỉ lấy được đúng $1$ số, nên cần $5$ lượt."""

    hints = r"""**Gợi ý 1 (Quan sát cặp số liên tiếp):**
Giả sử số $x-1$ nằm ở vị trí `pos[x-1]` và số $x$ nằm ở vị trí `pos[x]`. Khi nào bạn có thể thu thập cả $x-1$ và $x$ trong **cùng một lượt** (sau khi đã có $1..x-2$)?

**Gợi ý 2 (Điều kiện bắt đầu lượt mới):**
- Nếu `pos[x] > pos[x-1]`: ngay sau khi lấy $x-1$, bạn đi tiếp sang phải sẽ gặp $x$ và lấy luôn trong cùng lượt đó!
- Nếu `pos[x] < pos[x-1]`: khi lấy xong $x-1$, số $x$ đã nằm lại phía sau (bên trái), nên bạn **bắt buộc** phải bắt đầu một lượt đi mới để quay lại lấy $x$.

**Gợi ý 3 (Công thức $O(N)$):**
Tạo mảng `pos` lưu vị trí của từng giá trị từ $1$ đến $N$. Khởi tạo `rounds = 1` (cho số $1$). Duyệt $x$ từ $2$ đến $N$: mỗi khi `pos[x] < pos[x - 1]`, tăng `rounds` thêm $1$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<int> pos(n + 1);
    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;
        pos[x] = i;
    }

    int rounds = 1;
    for (int x = 2; x <= n; ++x) {
        if (pos[x] < pos[x - 1]) {
            ++rounds;
        }
    }

    cout << rounds << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    pos = [0] * (n + 1)
    for i in range(n):
        pos[int(data[i + 1])] = i

    rounds = 1
    for x in range(2, n + 1):
        if pos[x] < pos[x - 1]:
            rounds += 1

    sys.stdout.write(f"{rounds}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-collecting-numbers-rounds",
        "title": "Thu thập số theo lượt",
        "shortDescription": "Đếm số lượt quét từ trái sang phải ít nhất để thu thập đủ 1..N.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "mảng", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp11-min-swaps-sort-perm
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    # Coordinate-compress to tuple 0..n-1, then BFS over permutations for n <= 7
    sorted_vals = sorted(a)
    rank = {v: i for i, v in enumerate(sorted_vals)}
    start = tuple(rank[x] for x in a)
    goal = tuple(range(n))
    if start == goal:
        return "0"
    if n <= 7:
        vis = {start: 0}
        q = deque([start])
        while q:
            cur = q.popleft()
            d = vis[cur]
            lst = list(cur)
            for i in range(n):
                for j in range(i + 1, n):
                    lst[i], lst[j] = lst[j], lst[i]
                    nxt = tuple(lst)
                    if nxt == goal:
                        return str(d + 1)
                    if nxt not in vis:
                        vis[nxt] = d + 1
                        q.append(nxt)
                    lst[i], lst[j] = lst[j], lst[i]
    # For slightly larger brute checks, simulate greedy swaps using target map
    cur = list(start)
    pos = [0] * n
    for idx, val in enumerate(cur):
        pos[val] = idx
    swaps = 0
    for i in range(n):
        if cur[i] != i:
            j = pos[i]
            vi = cur[i]
            cur[i], cur[j] = cur[j], cur[i]
            pos[vi] = j
            pos[i] = i
            swaps += 1
    return str(swaps)


def build_p05() -> dict:
    rng = random.Random(1105)

    def rand_distinct(n: int, lo: int = -10**9, hi: int = 10**9) -> List[int]:
        vals = rng.sample(range(lo, hi + 1), n)
        return vals

    tests = [
        # 3 public samples
        {"input": fmt_array([4, 3, 2, 1]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_array([10, 50, 20, 40, 30]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_array([-5, 0, 7, 100]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([42]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_array([1000000000, -1000000000]), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_array([2, 3, 4, 5, 6, 1]), "hidden": True, "expected": "5", "checkBrute": True},
        {"input": fmt_array([2, 1, 4, 3, 6, 5]), "hidden": True, "expected": "3", "checkBrute": True},
        {"input": fmt_array([7, 3, 5, 1, 6, 2, 4]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array(rand_distinct(150, -10000, 10000)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(rand_distinct(500, -10**9, 10**9)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(list(range(5000, 0, -1))), "hidden": True})
    tests.append({"input": fmt_array([i + 1 for i in range(1, 10000)] + [1]), "hidden": True})
    tests.append({"input": fmt_array(rand_distinct(12000, -10**9, 10**9)), "hidden": True})
    tests.append({"input": fmt_array(rand_distinct(13000, -10**9, 10**9)), "hidden": True})
    tests.append({"input": fmt_array(rand_distinct(24000, 1, 99999)), "hidden": True})
    tests.append({"input": fmt_array(rand_distinct(26000, 1, 30000)), "hidden": True})

    extra_stress = [
        fmt_array(rand_distinct(rng.randint(1, 7), -100, 100))
        for _ in range(40)
    ]

    statement = r"""Cho một mảng $A$ gồm $N$ số nguyên **đôi một phân biệt** $a_1, a_2, \dots, a_N$.

Trong mỗi bước, bạn được phép chọn hai vị trí bất kỳ $i, j$ ($1 \le i < j \le N$) và **đổi chỗ** (swap) $a_i$ với $a_j$.

Hãy tìm **số bước đổi chỗ ít nhất** để sắp xếp mảng $A$ theo thứ tự tăng dần từ trái sang phải.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên đôi một phân biệt $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là số lần đổi chỗ ít nhất.

### Ràng buộc
- $1 \le N \le 30\,000$
- $|a_i| \le 10^9$ và các $a_i$ đôi một khác nhau.

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1 (`[4, 3, 2, 1]`):** Đổi chỗ $(4, 1)$ và đổi chỗ $(3, 2)$ mất $2$ bước để thành `[1, 2, 3, 4]`.
- **Ví dụ 2 (`[10, 50, 20, 40, 30]`):** Đổi chỗ $50$ với $20$ được `[10, 20, 50, 40, 30]`, rồi đổi chỗ $50$ với $30$ được `[10, 20, 30, 40, 50]`, tổng cộng $2$ bước.
- **Ví dụ 3 (`[-5, 0, 7, 100]`):** Mảng đã được sắp xếp sẵn nên cần $0$ bước."""

    hints = r"""**Gợi ý 1 (Quy về hoán vị vị trí):**
Ghép mỗi phần tử thành cặp `(a[i], i)` rồi sắp xếp tăng dần theo giá trị `a[i]`. Lúc này phần tử đứng ở vị trí `k` sau khi sắp xếp đáng lẽ xuất phát từ vị trí `p[k] = i`. Ta thu được một **hoán vị** `p` trên tập `{0, 1, ..., N - 1}`.

**Gợi ý 2 (Phân tích chu trình hoán vị):**
Biểu diễn hoán vị `p` thành các chu trình rời nhau (nối cạnh $k \to p[k]$).
- Một mảng đã sắp xếp tương ứng với $N$ chu trình có độ dài $1$ (mỗi phần tử đứng đúng chỗ).
- Bất biến quan trọng: nếu đổi chỗ hai phần tử thuộc **cùng một chu trình**, chu trình đó tách thành $2$ chu trình nhỏ hơn (số chu trình tăng $1$); nếu đổi chỗ hai phần tử ở $2$ chu trình khác nhau, chúng gộp thành $1$ (số chu trình giảm $1$).

**Gợi ý 3 (Công thức $N - C$):**
Vì mục tiêu là đạt $N$ chu trình từ $C$ chu trình ban đầu và mỗi bước tăng số chu trình thêm tối đa $1$, số bước ít nhất luôn bằng $N - C$ (tương đương $\sum (L_j - 1)$ với $L_j$ là độ dài từng chu trình). Dùng mảng `vis` duyệt tuyến tính để đếm $C$ trong $O(N)$ sau bước sắp xếp $O(N \log N)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<pair<int, int>> items(n);
    for (int i = 0; i < n; ++i) {
        cin >> items[i].first;
        items[i].second = i;
    }

    sort(items.begin(), items.end());
    vector<char> vis(n, 0);
    int cycles = 0;

    for (int i = 0; i < n; ++i) {
        if (vis[i] || items[i].second == i) {
            if (!vis[i]) {
                vis[i] = 1;
                ++cycles;
            }
            continue;
        }
        int cur = i;
        while (!vis[cur]) {
            vis[cur] = 1;
            cur = items[cur].second;
        }
        ++cycles;
    }

    cout << (n - cycles) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    arr = [int(x) for x in data[1 : 1 + n]]
    order = sorted(range(n), key=arr.__getitem__)

    vis = bytearray(n)
    cycles = 0
    for i in range(n):
        if vis[i]:
            continue
        cycles += 1
        cur = i
        while not vis[cur]:
            vis[cur] = 1
            cur = order[cur]

    sys.stdout.write(f"{n - cycles}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-min-swaps-sort-perm",
        "title": "Đổi chỗ ít nhất để sắp xếp mảng",
        "shortDescription": "Tìm số phép đổi chỗ hai phần tử bất kỳ ít nhất để sắp xếp dãy phân biệt.",
        "difficulty": "medium",
        "estimatedTime": 22,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "đồ thị", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N) do nén tọa độ / sắp xếp.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp11-kadane-circular-max
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    best = a[0]
    for start in range(n):
        s = 0
        for length in range(1, n + 1):
            s += a[(start + length - 1) % n]
            if s > best:
                best = s
    return str(best)


def build_p06() -> dict:
    rng = random.Random(1106)

    tests = [
        # 3 public samples
        {"input": fmt_array([5, -3, 5]), "hidden": False, "expected": "10", "checkBrute": True},
        {"input": fmt_array([1, -2, 3, -2]), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt_array([-3, -2, -3]), "hidden": False, "expected": "-2", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([-1000000000]), "hidden": True, "expected": "-1000000000", "checkBrute": True},
        {"input": fmt_array([1000000000]), "hidden": True, "expected": "1000000000", "checkBrute": True},
        {"input": fmt_array([-100, -50, -1, -200]), "hidden": True, "expected": "-1", "checkBrute": True},
        {"input": fmt_array([100, -1000, 100, 100]), "hidden": True, "expected": "300", "checkBrute": True},
        {"input": fmt_array([0, 0, 0, -5, 0]), "hidden": True, "expected": "0", "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array([rng.randint(-1000, 1000) for _ in range(100)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([rng.randint(-10**9, 10**9) for _ in range(400)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([rng.randint(-10**9, -1) for _ in range(5000)]), "hidden": True})
    tests.append({"input": fmt_array([10**9] + [-1] * 4998 + [10**9]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(-10**9, 10**9) for _ in range(12000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(-10**9, 10**9) for _ in range(13000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(-9999, 9999) for _ in range(25000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(-999, 999) for _ in range(30000)]), "hidden": True})

    extra_stress = [
        fmt_array([rng.randint(-50, 50) for _ in range(rng.randint(1, 40))])
        for _ in range(40)
    ] + [
        fmt_array([rng.randint(-50, -1) for _ in range(rng.randint(1, 30))])
        for _ in range(20)
    ]

    statement = r"""Cho một mảng số nguyên đặt trên **vòng tròn** gồm $N$ phần tử $a_1, a_2, \dots, a_N$ (phần tử $a_N$ được xem là đứng ngay liền trước $a_1$).

Một đoạn con liên tiếp **không rỗng** trên vòng tròn là dãy gồm từ $1$ đến $N$ phần tử kề nhau liên tiếp theo chiều vòng tròn (mỗi vị trí chỉ được lấy tối đa $1$ lần).

Hãy tìm **tổng lớn nhất** của một đoạn con liên tiếp không rỗng trên vòng tròn.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng lớn nhất tìm được.

### Ràng buộc
- $1 \le N \le 30\,000$
- $|a_i| \le 10^9$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1 (`[5, -3, 5]`):** Chọn đoạn vòng qua biên gồm phần tử cuối và phần tử đầu $[5, 5]$ cho tổng $10$.
- **Ví dụ 2 (`[1, -2, 3, -2]`):** Đoạn tốt nhất là $[3]$ cho tổng $3$.
- **Ví dụ 3 (`[-3, -2, -3]`):** Mọi phần tử đều âm; vì đoạn con phải **không rỗng**, ta chọn đoạn $[ -2 ]$ có tổng $-2$."""

    hints = r"""**Gợi ý 1 (Phân chia 2 trường hợp đoạn tối ưu):**
Mọi đoạn con liên tiếp trên vòng tròn chỉ có thể rơi vào đúng một trong hai dạng:
1. **Không cắt ngang biên** giữa $a_N$ và $a_1$: đây chính là bài toán đoạn con tổng lớn nhất cổ điển trên mảng thẳng (thuật toán **Kadane** cho `maxKadane`).
2. **Cắt ngang biên** giữa $a_N$ và $a_1$: khi đó phần **bù** (những phần tử bị bỏ lại ở giữa mảng) lại tạo thành một đoạn con liên tiếp không cắt biên!

**Gợi ý 2 (Chuyển phần bù thành cực tiểu):**
Để tổng phần vòng qua biên lớn nhất, phần bù ở giữa phải có tổng nhỏ nhất (`minKadane`, tìm bằng Kadane đảo ngược tìm min). Do đó ứng viên cho dạng 2 là `total - minKadane`, với `total` là tổng cả mảng.

**Gợi ý 3 (Cái bẫy kinh điển — mảng toàn số âm!):**
Nếu toàn bộ mảng đều âm (`maxKadane < 0`), khi đó `minKadane == total` (phần bù là cả mảng), khiến `total - minKadane = 0` — tương ứng đoạn **rỗng** (không hợp lệ)! Vì thế:
- Nếu `maxKadane < 0`: đáp án bắt buộc là `maxKadane`.
- Ngược lại: đáp án là `max(maxKadane, total - minKadane)`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    long long total = 0;
    long long curMax = 0, maxSum = LLONG_MIN;
    long long curMin = 0, minSum = LLONG_MAX;

    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        total += x;

        curMax = max(x, curMax + x);
        maxSum = max(maxSum, curMax);

        curMin = min(x, curMin + x);
        minSum = min(minSum, curMin);
    }

    if (maxSum < 0) {
        cout << maxSum << '\n';
    } else {
        cout << max(maxSum, total - minSum) << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])

    total = 0
    cur_max = 0
    max_sum = -10**18
    cur_min = 0
    min_sum = 10**18

    for i in range(1, 1 + n):
        x = int(data[i])
        total += x
        cur_max = x if cur_max < 0 else cur_max + x
        if cur_max > max_sum:
            max_sum = cur_max
        cur_min = x if cur_min > 0 else cur_min + x
        if cur_min < min_sum:
            min_sum = cur_min

    ans = max_sum if max_sum < 0 else max(max_sum, total - min_sum)
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-kadane-circular-max",
        "title": "Đoạn con tổng lớn nhất trên vòng tròn",
        "shortDescription": "Tìm tổng lớn nhất của đoạn con liên tiếp không rỗng trên mảng vòng tròn.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "quy hoạch động", "mảng", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N), O(1) bộ nhớ phụ, dùng kiểu 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp11-josephus-survivor
# ============================================================================

def brute_p07(inp: str) -> str:
    n, k = map(int, inp.split())
    circle = list(range(1, n + 1))
    idx = 0
    while len(circle) > 1:
        idx = (idx + k - 1) % len(circle)
        circle.pop(idx)
    return str(circle[0])


def build_p07() -> dict:
    rng = random.Random(1107)

    tests = [
        # 3 public samples
        {"input": "5 2", "hidden": False, "expected": "3", "checkBrute": True},
        {"input": "7 3", "hidden": False, "expected": "4", "checkBrute": True},
        {"input": "6 1", "hidden": False, "expected": "6", "checkBrute": True},
        # 5 edge cases
        {"input": "1 1", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "1 1000000000", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "2 1000000000", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "10 1000000000", "hidden": True, "checkBrute": True},
        {"input": "100 100", "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": "500 37", "hidden": True, "checkBrute": True})
    tests.append({"input": "1500 999999937", "hidden": True, "checkBrute": True})
    tests.append({"input": "10000 2", "hidden": True})
    tests.append({"input": "30000 7", "hidden": True})
    tests.append({"input": "50000 1000000000", "hidden": True})
    tests.append({"input": "99999 99998", "hidden": True})
    tests.append({"input": "100000 1", "hidden": True})
    tests.append({"input": "100000 987654321", "hidden": True})

    extra_stress = [
        f"{rng.randint(1, 200)} {rng.randint(1, 10**9)}"
        for _ in range(40)
    ]

    statement = r"""Có $N$ người chơi đánh số thứ tự từ $1$ đến $N$ ngồi thành một vòng tròn theo chiều kim đồng hồ (người $N$ ngồi cạnh người $1$).

Trò chơi bắt đầu từ người số $1$. Ở mỗi lượt, người quản trò đếm đúng $K$ người còn lại theo chiều kim đồng hồ (tính cả người bắt đầu lượt đếm là số $1$) và loại người thứ $K$ ra khỏi vòng tròn. Lượt đếm tiếp theo bắt đầu từ người đứng ngay sau người vừa bị loại.

Quá trình lặp lại cho đến khi chỉ còn đúng $1$ người duy nhất trên vòng tròn. Hãy tìm **số hiệu của người sống sót cuối cùng**.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $N$ và $K$ ($1 \le N \le 10^5$, $1 \le K \le 10^9$).

### Kết quả
- In ra một số nguyên dương duy nhất là số hiệu (từ $1$ đến $N$) của người sống sót cuối cùng.

### Ràng buộc
- $1 \le N \le 10^5$
- $1 \le K \le 10^9$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 2\,000$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1 (`N = 5, K = 2`):** Thứ tự bị loại là $2, 4, 1, 5$. Người cuối cùng còn lại là $3$.
- **Ví dụ 2 (`N = 7, K = 3`):** Thứ tự bị loại là $3, 6, 2, 7, 5, 1$. Người còn lại là $4$.
- **Ví dụ 3 (`N = 6, K = 1`):** Mỗi lượt loại ngay người đang xét theo thứ tự $1, 2, 3, 4, 5$, nên người sống sót là $6$."""

    hints = r"""**Gợi ý 1 (Giảm kích thước bài toán):**
Đánh số lại các vị trí từ $0$ đến $N - 1$ (đáp án cuối chỉ cần cộng thêm $1$). Với $N$ người, người đầu tiên bị loại nằm ở chỉ số $(K - 1) \bmod N$. Sau khi loại người này, ta còn lại $N - 1$ người và lượt mới bắt đầu từ chỉ số $K \bmod N$.

**Gợi ý 2 (Công thức truy hồi Josephus):**
Gọi $J(i, K)$ là vị trí sống sót (theo chỉ số $0..i-1$) khi có $i$ người. Nếu ta xoay lại hệ tọa độ của $i - 1$ người còn lại sao cho người bắt đầu lượt mới thành $0$, vị trí sống sót trong bài toán con là $J(i - 1, K)$. Khi ánh xạ ngược về hệ tọa độ $i$ người ban đầu (dịch tiến thêm $K$ bước theo vòng tròn):
$$J(1, K) = 0, \qquad J(i, K) = (J(i - 1, K) + K) \bmod i.$$

**Gợi ý 3 (Cài đặt vòng lặp tránh tràn stack):**
Với $N$ lên tới $10^5$, gọi đệ quy sẽ gây lỗi tràn ngăn xếp (đặc biệt trong Python). Hãy dùng một vòng `for` đơn giản từ $i = 2$ đến $N$: `res = (res + k) % i`, sau đó in `res + 1`. Chú ý phép cộng `res + k` cần dùng `long long` trong C++ vì $K \le 10^9$ (hoặc lấy `k % i`)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long n, k;
    if (!(cin >> n >> k)) return 0;

    long long res = 0;
    for (long long i = 2; i <= n; ++i) {
        res = (res + k) % i;
    }

    cout << (res + 1) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])

    res = 0
    for i in range(2, n + 1):
        res = (res + k) % i

    sys.stdout.write(f"{res + 1}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-josephus-survivor",
        "title": "Người sống sót cuối cùng (Josephus)",
        "shortDescription": "Tìm vị trí người còn lại cuối cùng trong vòng tròn N người bước nhảy K.",
        "difficulty": "medium",
        "estimatedTime": 18,
        "skillId": "algo.adhoc_invariant",
        "tags": ["toán học", "tư duy", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N), cài đặt lặp không đệ quy.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp11-trapping-rain-water
# ============================================================================

def brute_p08(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    h = toks[1 : 1 + n]
    water = 0
    for i in range(n):
        lmax = max(h[: i + 1])
        rmax = max(h[i:])
        water += min(lmax, rmax) - h[i]
    return str(water)


def build_p08() -> dict:
    rng = random.Random(1108)

    tests = [
        # 3 public samples
        {"input": fmt_array([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]), "hidden": False, "expected": "6", "checkBrute": True},
        {"input": fmt_array([4, 2, 0, 3, 2, 5]), "hidden": False, "expected": "9", "checkBrute": True},
        {"input": fmt_array([1, 2, 3, 4, 3, 2, 1]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([1000000000]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_array([1000000000, 0, 1000000000]), "hidden": True, "expected": "1000000000", "checkBrute": True},
        {"input": fmt_array([0, 0, 0, 0, 0]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_array([1000000000] + [0] * 100 + [1000000000]), "hidden": True, "expected": "100000000000", "checkBrute": True},
        {"input": fmt_array([5, 4, 3, 2, 1, 2, 3, 4, 5]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array([rng.randint(0, 100) for _ in range(150)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([rng.randint(0, 10**9) for _ in range(400)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([10**9] + [0] * 12000 + [10**9]), "hidden": True})
    tests.append({"input": fmt_array([abs(5000 - i) for i in range(10001)]), "hidden": True})
    tests.append({"input": fmt_array([10**9 if i % 2 == 0 else 0 for i in range(15000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(0, 10**9) for _ in range(13000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(0, 9999) for _ in range(28000)]), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(0, 999) for _ in range(30000)]), "hidden": True})

    extra_stress = [
        fmt_array([rng.randint(0, 30) for _ in range(rng.randint(1, 50))])
        for _ in range(40)
    ]

    statement = r"""Một mặt cắt địa hình gồm $N$ cột đá rộng $1$ đơn vị xếp sát nhau theo hàng ngang, cột thứ $i$ có độ cao là số nguyên không âm $h_i$.

Sau một cơn mưa lớn kéo dài, nước sẽ đọng lại trong các hõm trũng nằm giữa những cột cao hơn (nước ở hai đầu mép ngoài cùng sẽ chảy tràn ra ngoài).

Hãy tính **tổng lượng nước mưa tối đa** có thể đọng lại trên toàn bộ địa hình.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên không âm $h_1, h_2, \dots, h_N$ ($0 \le h_i \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng lượng nước đọng lại.

### Ràng buộc
- $1 \le N \le 30\,000$
- $0 \le h_i \le 10^9$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 2\,000$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1 (`[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]`):** Các hõm chứa lần lượt $1$ (tại cột cao $0$ giữa $1$ và $2$), $1+2+1=4$ (giữa $2$ và $3$), và $1$ (giữa $3$ và $2$), tổng cộng $6$ đơn vị nước.
- **Ví dụ 2 (`[4, 2, 0, 3, 2, 5]`):** Đỉnh trái cao $4$, đỉnh phải cao $5$, mực nước ở giữa dâng tới $\min(4, 5) = 4$, giữ được $(4-2) + (4-0) + (4-3) + (4-2) = 9$ đơn vị nước.
- **Ví dụ 3 (`[1, 2, 3, 4, 3, 2, 1]`):** Địa hình dạng một ngọn núi đơn điệu tăng rồi giảm, không có hõm trũng nào nên đọng $0$ nước."""

    hints = r"""**Gợi ý 1 (Lượng nước tại từng cột):**
Tại vị trí cột $i$, mực nước tối đa có thể dâng lên được chặn bởi bức tường cao nhất bên trái $L_i = \max_{1 \le j \le i} h_j$ và bức tường cao nhất bên phải $R_i = \max_{i \le j \le N} h_j$. Khi đó lượng nước đọng ngay phía trên cột $i$ đúng bằng $\min(L_i, R_i) - h_i$.

**Gợi ý 2 (Tối ưu lên $O(N)$ thời gian, $O(1)$ bộ nhớ bằng Hai con trỏ):**
Dùng hai con trỏ $l = 0, r = N - 1$ cùng hai biến `leftMax = 0, rightMax = 0`.
- Nếu `h[l] <= h[r]`: cập nhật `leftMax = max(leftMax, h[l])`. Vì `h[l] <= h[r]` nên chắc chắn bức tường bên phải của $l$ ít nhất cao bằng `h[r] >= leftMax` (chính xác hơn, khi luôn dịch bên nhỏ hơn thì `leftMax <= rightMax` tại thời điểm xét $l$ hoặc `h[r]` đã đủ lớn hơn mọi giá trị bên trái tới `l`). Do đó mực nước tại $l$ hoàn toàn xác định bởi `leftMax - h[l]`! Tăng `l += 1`.
- Ngược lại (`h[l] > h[r]`): cập nhật `rightMax = max(rightMax, h[r])`, cộng `rightMax - h[r]` vào đáp án và giảm `r -= 1`.

**Gợi ý 3 (Lưu ý tràn số):**
Tổng lượng nước có thể lên tới $\approx 30\,000 \times 10^9 = 3 \times 10^{13}$, bắt buộc dùng kiểu `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> h(n);
    for (int i = 0; i < n; ++i) {
        cin >> h[i];
    }

    int l = 0, r = n - 1;
    long long leftMax = 0, rightMax = 0;
    long long water = 0;

    while (l <= r) {
        if (h[l] <= h[r]) {
            if (h[l] >= leftMax) {
                leftMax = h[l];
            } else {
                water += leftMax - h[l];
            }
            ++l;
        } else {
            if (h[r] >= rightMax) {
                rightMax = h[r];
            } else {
                water += rightMax - h[r];
            }
            --r;
        }
    }

    cout << water << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    h = [int(x) for x in data[1 : 1 + n]]

    l, r = 0, n - 1
    left_max = 0
    right_max = 0
    water = 0

    while l <= r:
        hl = h[l]
        hr = h[r]
        if hl <= hr:
            if hl >= left_max:
                left_max = hl
            else:
                water += left_max - hl
            l += 1
        else:
            if hr >= right_max:
                right_max = hr
            else:
                water += right_max - hr
            r -= 1

    sys.stdout.write(f"{water}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-trapping-rain-water",
        "title": "Tính lượng nước mưa đọng lại",
        "shortDescription": "Tính tổng lượng nước mưa tối đa đọng giữa các cột địa hình trong O(N).",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.adhoc_invariant",
        "tags": ["hai con trỏ", "tư duy", "mảng", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N) thời gian, O(1) bộ nhớ phụ, dùng kiểu 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp11-majority-elements-n3
# ============================================================================

def brute_p09(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    cnt = Counter(a)
    thresh = n // 3
    res = sorted(k for k, v in cnt.items() if v > thresh)
    if not res:
        return "NONE"
    return " ".join(map(str, res))


def build_p09() -> dict:
    rng = random.Random(1109)

    def make_majority_arr(n: int, cands: List[Tuple[int, int]], fill_bound: int = 10**9) -> List[int]:
        arr = []
        for val, count in cands:
            arr.extend([val] * count)
        while len(arr) < n:
            arr.append(rng.randint(-fill_bound, fill_bound))
        rng.shuffle(arr)
        return arr[:n]

    tests = [
        # 3 public samples
        {"input": fmt_array([3, 2, 3]), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt_array([1, 2, 1, 2, 3]), "hidden": False, "expected": "1 2", "checkBrute": True},
        {"input": fmt_array([1, 2, 3, 4]), "hidden": False, "expected": "NONE", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([-1000000000]), "hidden": True, "expected": "-1000000000", "checkBrute": True},
        {"input": fmt_array([5, 5]), "hidden": True, "expected": "5", "checkBrute": True},
        {"input": fmt_array([10, 20]), "hidden": True, "expected": "10 20", "checkBrute": True},
        {"input": fmt_array([1, 1, 2, 2, 3, 3]), "hidden": True, "expected": "NONE", "checkBrute": True},
        {"input": fmt_array([-1000000000, 1000000000, -1000000000, 0, 1000000000, -1000000000, 1000000000]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array(make_majority_arr(200, [(77, 68), (-99, 70)])), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(make_majority_arr(300, [(10**9, 101)])), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(make_majority_arr(500, [(1, 166), (2, 166), (3, 166)])), "hidden": True, "checkBrute": True})  # boundary exactly N/3 -> NONE
    tests.append({"input": fmt_array(make_majority_arr(9000, [(-123456789, 3001), (987654321, 3005)])), "hidden": True})
    tests.append({"input": fmt_array(make_majority_arr(12000, [(42, 4001)])), "hidden": True})
    tests.append({"input": fmt_array([rng.randint(-10**9, 10**9) for _ in range(13000)]), "hidden": True})
    tests.append({"input": fmt_array(make_majority_arr(25000, [(7, 8334), (-3, 8334)], fill_bound=9999)), "hidden": True})
    tests.append({"input": fmt_array(make_majority_arr(28000, [(100, 9334)], fill_bound=9999)), "hidden": True})

    extra_stress = [
        fmt_array([rng.randint(-4, 4) for _ in range(rng.randint(1, 35))])
        for _ in range(60)
    ]

    statement = r"""Cho một mảng $A$ gồm $N$ số nguyên $a_1, a_2, \dots, a_N$.

Hãy tìm **tất cả** các giá trị xuất hiện **nghiêm ngặt nhiều hơn** $\lfloor N / 3 \rfloor$ lần trong mảng $A$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra tất cả các giá trị thỏa mãn theo **thứ tự tăng dần**, cách nhau bởi một dấu cách.
- Nếu không có giá trị nào thỏa mãn, in ra `NONE`.

### Ràng buộc
- $1 \le N \le 30\,000$
- $|a_i| \le 10^9$

### Subtasks
- **Subtask 1 (40% số điểm):** Dùng bộ nhớ phụ $O(N)$ (như sắp xếp hoặc bảng băm).
- **Subtask 2 (60% số điểm):** Độ phức tạp thời gian $O(N)$ và bộ nhớ phụ $O(1)$ ngoài mảng đầu vào (**Boyer-Moore Majority Vote** mở rộng).

### Giải thích ví dụ
- **Ví dụ 1 (`[3, 2, 3]`):** $N = 3$, $\lfloor 3/3 \rfloor = 1$. Số $3$ xuất hiện $2 > 1$ lần nên in `3`.
- **Ví dụ 2 (`[1, 2, 1, 2, 3]`):** $N = 5$, $\lfloor 5/3 \rfloor = 1$. Cả $1$ và $2$ đều xuất hiện $2 > 1$ lần, in tăng dần thành `1 2`.
- **Ví dụ 3 (`[1, 2, 3, 4]`):** $N = 4$, $\lfloor 4/3 \rfloor = 1$. Mỗi số chỉ xuất hiện $1$ lần nên in `NONE`."""

    hints = r"""**Gợi ý 1 (Số lượng tối đa của đáp án):**
Không thể có tới $3$ giá trị khác nhau mà mỗi giá trị xuất hiện $> \lfloor N / 3 \rfloor$ lần (vì $3 \times (\lfloor N/3 \rfloor + 1) > N$). Do đó luôn có **tối đa $2$ ứng viên**.

**Gợi ý 2 (Bất biến hủy bộ ba khác nhau — Boyer-Moore mở rộng):**
Nếu lấy $3$ phần tử **đôi một khác nhau** ra khỏi mảng, thì bất kỳ giá trị nào ban đầu chiếm $> N / 3$ phần tử vẫn sẽ chiếm $> (N - 3) / 3$ trong phần còn lại!
Duy trì $2$ ứng viên `(c1, c2)` và số phiếu `(cnt1, cnt2)`:
- Nếu $x = c_1$ (và $cnt_1 > 0$): tăng `cnt1`.
- Ngược lại nếu $x = c_2$ (và $cnt_2 > 0$): tăng `cnt2`.
- Ngược lại nếu `cnt1 == 0`: gán `c1 = x, cnt1 = 1`.
- Ngược lại nếu `cnt2 == 0`: gán `c2 = x, cnt2 = 1`.
- Ngược lại ($x, c_1, c_2$ đôi một khác nhau): giảm cả `cnt1` và `cnt2` đi $1$.

**Gợi ý 3 (Kiểm chứng lại bắt buộc):**
Thuật toán bỏ phiếu chỉ đảm bảo nếu tồn tại giá trị $> \lfloor N / 3 \rfloor$ thì nó chắc chắn là $c_1$ hoặc $c_2$, nhưng không đảm bảo $c_1, c_2$ luôn hợp lệ. Bắt buộc duyệt mảng thêm $1$ lượt để đếm chính xác số lần xuất hiện của $c_1$ và $c_2$ (lưu ý tránh đếm trùng nếu $c_1 = c_2$), lọc giá trị $> \lfloor N / 3 \rfloor$, sắp xếp tăng dần tối đa $2$ số này rồi in ra (hoặc `NONE`)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<int> a(n);
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
    }

    int c1 = 0, c2 = 0;
    int cnt1 = 0, cnt2 = 0;
    for (int x : a) {
        if (cnt1 > 0 && x == c1) {
            ++cnt1;
        } else if (cnt2 > 0 && x == c2) {
            ++cnt2;
        } else if (cnt1 == 0) {
            c1 = x;
            cnt1 = 1;
        } else if (cnt2 == 0) {
            c2 = x;
            cnt2 = 1;
        } else {
            --cnt1;
            --cnt2;
        }
    }

    int freq1 = 0, freq2 = 0;
    for (int x : a) {
        if (cnt1 > 0 && x == c1) ++freq1;
        else if (cnt2 > 0 && x == c2) ++freq2;
    }

    vector<int> ans;
    if (cnt1 > 0 && freq1 > n / 3) ans.push_back(c1);
    if (cnt2 > 0 && freq2 > n / 3) ans.push_back(c2);
    sort(ans.begin(), ans.end());

    if (ans.empty()) {
        cout << "NONE\n";
    } else {
        for (size_t i = 0; i < ans.size(); ++i) {
            if (i > 0) cout << ' ';
            cout << ans[i];
        }
        cout << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1 : 1 + n]]

    c1 = c2 = 0
    cnt1 = cnt2 = 0
    for x in a:
        if cnt1 > 0 and x == c1:
            cnt1 += 1
        elif cnt2 > 0 and x == c2:
            cnt2 += 1
        elif cnt1 == 0:
            c1, cnt1 = x, 1
        elif cnt2 == 0:
            c2, cnt2 = x, 1
        else:
            cnt1 -= 1
            cnt2 -= 1

    freq1 = freq2 = 0
    for x in a:
        if cnt1 > 0 and x == c1:
            freq1 += 1
        elif cnt2 > 0 and x == c2:
            freq2 += 1

    ans = []
    thresh = n // 3
    if cnt1 > 0 and freq1 > thresh:
        ans.append(c1)
    if cnt2 > 0 and freq2 > thresh:
        ans.append(c2)
    ans.sort()

    if not ans:
        sys.stdout.write("NONE\n")
    else:
        sys.stdout.write(" ".join(map(str, ans)) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-majority-elements-n3",
        "title": "Phần tử đa số bậc N/3 (Boyer-Moore)",
        "shortDescription": "Tìm tất cả phần tử xuất hiện nhiều hơn N/3 lần trong O(N) thời gian và O(1) bộ nhớ.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "bất biến", "mảng", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N) thời gian, O(1) bộ nhớ phụ (Boyer-Moore).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp11-circular-candy-redistribution
# ============================================================================

def brute_p10(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    total = sum(a)
    avg = total // n
    start = tuple(a)
    goal = (avg,) * n
    if start == goal:
        return "0"

    # Independent BFS over candy-passing states for small n & total
    if n <= 6 and total <= 24:
        vis = {start: 0}
        q = deque([start])
        while q:
            cur = q.popleft()
            d = vis[cur]
            lst = list(cur)
            for i in range(n):
                if lst[i] == 0:
                    continue
                for nxt_i in ((i - 1) % n, (i + 1) % n):
                    lst[i] -= 1
                    lst[nxt_i] += 1
                    nxt = tuple(lst)
                    if nxt == goal:
                        return str(d + 1)
                    if nxt not in vis:
                        vis[nxt] = d + 1
                        q.append(nxt)
                    lst[i] += 1
                    lst[nxt_i] -= 1

    # Fallback independent brute over candidate flow values x0 in [min(c), max(c)]
    c = [0] * n
    for i in range(1, n):
        c[i] = c[i - 1] + (a[i - 1] - avg)
    lo, hi = min(c), max(c)
    return str(min(sum(abs(ci - x0) for ci in c) for x0 in range(lo, hi + 1)))


def build_p10() -> dict:
    rng = random.Random(1110)

    def make_divisible(n: int, avg_lo: int, avg_hi: int, spread: int) -> List[int]:
        avg = rng.randint(avg_lo, avg_hi)
        arr = [avg] * n
        for _ in range(n * 2):
            i = rng.randrange(n)
            j = rng.randrange(n)
            if i == j:
                continue
            delta = rng.randint(0, min(arr[i], spread))
            arr[i] -= delta
            arr[j] += delta
        return arr

    tests = [
        # 3 public samples
        {"input": fmt_array([1, 2, 5, 4]), "hidden": False, "expected": "4", "checkBrute": True},
        {"input": fmt_array([10, 0, 0, 0, 0]), "hidden": False, "expected": "12", "checkBrute": True},
        {"input": fmt_array([7, 7, 7]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 edge cases
        {"input": fmt_array([1000000000]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_array([0, 1000000000]), "hidden": True, "expected": "500000000", "checkBrute": False},
        {"input": fmt_array([1000000000, 0, 0, 1000000000]), "hidden": True, "expected": "1000000000", "checkBrute": False},
        {"input": fmt_array([0, 6, 0, 6, 0]), "hidden": True, "checkBrute": True},
        {"input": fmt_array([4, 0, 4, 4, 0, 6]), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_array(make_divisible(40, 10, 50, 20)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array(make_divisible(80, 20, 80, 30)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_array([10**9 if i < 5000 else 0 for i in range(10000)]), "hidden": True})
    tests.append({"input": fmt_array([10**9 if i % 2 == 0 else 0 for i in range(12000)]), "hidden": True})
    tests.append({"input": fmt_array(make_divisible(13000, 10**8, 9 * 10**8, 10**8)), "hidden": True})
    tests.append({"input": fmt_array(make_divisible(20000, 1000, 5000, 2000)), "hidden": True})
    tests.append({"input": fmt_array(make_divisible(26000, 100, 9999, 5000)), "hidden": True})
    tests.append({"input": fmt_array(make_divisible(30000, 50, 500, 300)), "hidden": True})

    extra_stress = [
        fmt_array(make_divisible(rng.randint(2, 6), 1, 4, 4))
        for _ in range(40)
    ]

    statement = r"""Có $N$ em nhỏ ngồi thành một **vòng tròn** đánh số từ $1$ đến $N$ theo chiều kim đồng hồ (em $1$ ngồi cạnh em $N$ và em $2$). Ban đầu, em thứ $i$ có $a_i$ viên kẹo, và dữ liệu luôn đảm bảo tổng số kẹo $\sum_{i=1}^N a_i$ chia hết cho $N$.

Trong mỗi bước thao tác, một em bất kỳ đang có ít nhất $1$ viên kẹo có thể chuyển đúng **$1$ viên kẹo** cho người bạn ngồi ngay kề bên trái hoặc ngay kề bên phải mình.

Hãy tìm **tổng số lần chuyển kẹo ít nhất** để tất cả $N$ em đều có số lượng kẹo bằng nhau.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$), đảm bảo $\sum_{i=1}^N a_i \equiv 0 \pmod N$.

### Kết quả
- In ra một số nguyên duy nhất là tổng số lần chuyển kẹo ít nhất.

### Ràng buộc
- $1 \le N \le 30\,000$
- $0 \le a_i \le 10^9$
- $\sum_{i=1}^N a_i$ chia hết cho $N$.

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc thêm.

### Giải thích ví dụ
- **Ví dụ 1 (`[1, 2, 5, 4]`):** Trung bình mỗi em cần có $3$ viên kẹo. Em $3$ chuyển $1$ viên cho em $2$, rồi chuyển $1$ viên cho em $4$? Nếu chuyển $3 \to 2$ ($1$ lần), $4 \to 1$ ($2$ lần: $4$ đưa $1$ trực tiếp $2$ viên qua cạnh vòng tròn mất $2$ lần, cộng $3 \to 4$ $1$ lần): tổng cộng $4$ lần chuyền là tối ưu (`3->2`: 1, `3->4`: 1, `4->1`: 2).
- **Ví dụ 2 (`[10, 0, 0, 0, 0]`):** Trung bình $2$ viên mỗi em. Em $1$ đưa $2$ viên cho em $2$ ($2$ lần), đưa $2$ viên qua em $2$ đến em $3$ ($4$ lần), đưa $2$ viên cho em $5$ ($2$ lần), đưa $2$ viên qua em $5$ đến em $4$ ($4$ lần); tổng cộng $2 + 4 + 2 + 4 = 12$ lần chuyền.
- **Ví dụ 3 (`[7, 7, 7]`):** Số kẹo đã bằng nhau sẵn nên cần $0$ bước."""

    hints = r"""**Gợi ý 1 (Mô hình hóa lượng kẹo luân chuyển qua từng cạnh):**
Đặt $\bar{a} = \frac{1}{N}\sum_{i=1}^N a_i$. Gọi $x_i$ là số viên kẹo ròng đi từ em $i$ sang em $(i \bmod N) + 1$ (nếu $x_i < 0$ tức là chuyển ngược lại $|x_i|$ viên). Ta cần cực tiểu hóa $\sum_{i=1}^N |x_i|$.

**Gợi ý 2 (Biểu diễn mọi $x_i$ theo một ẩn $x_N$):**
Cân bằng kẹo tại mỗi em $i$ cho ta phương trình: $a_i + x_{i-1} - x_i = \bar{a}$, tức $x_i - x_{i-1} = a_i - \bar{a}$.
Đặt $c_0 = 0$ và $c_i = \sum_{j=1}^i (a_j - \bar{a})$ với $i = 1 \dots N-1$ (chú ý $c_N = 0$). Khi đó:
$$x_i = x_N + c_i \quad \forall i \in \{1, \dots, N\}.$$
Tổng chi phí trở thành $\sum_{i=0}^{N-1} |c_i - (-x_N)|$.

**Gợi ý 3 (Quy về bài toán Trung vị):**
Đặt $t = -x_N$. Ta cần chọn số nguyên $t$ sao cho $\sum_{i=0}^{N-1} |c_i - t|$ đạt giá trị nhỏ nhất — đây chính xác là bài toán chọn **trung vị** của dãy $c_0, c_1, \dots, c_{N-1}$! Sắp xếp mảng $c$ mất $O(N \log N)$, lấy trung vị và cộng các trị tuyệt đối bằng kiểu `long long`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    long long total = 0;
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
        total += a[i];
    }

    long long avg = total / n;
    vector<long long> c(n, 0);
    for (int i = 1; i < n; ++i) {
        c[i] = c[i - 1] + (a[i - 1] - avg);
    }

    sort(c.begin(), c.end());
    long long med = c[n / 2];
    long long ans = 0;
    for (int i = 0; i < n; ++i) {
        ans += llabs(c[i] - med);
    }

    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1 : 1 + n]]

    avg = sum(a) // n
    c = [0] * n
    for i in range(1, n):
        c[i] = c[i - 1] + (a[i - 1] - avg)

    c.sort()
    med = c[n // 2]
    ans = sum(abs(x - med) for x in c)
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp11-circular-candy-redistribution",
        "title": "Chia đều kẹo trên bàn tròn",
        "shortDescription": "Tìm số lần chuyển kẹo giữa các bạn kề nhau ít nhất để tất cả có số kẹo bằng nhau.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.adhoc_invariant",
        "tags": ["tư duy", "toán học", "sắp xếp", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N), dùng kiểu số nguyên 64-bit.",
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
        assert len(p["tests"]) == 16, f"{p['slug']} expected 16 tests, got {len(p['tests'])}"
        for ti, tc in enumerate(p["tests"], 1):
            b = len(tc["input"].encode("utf-8"))
            assert b < SAFE_MAX_BYTES, (
                f"{p['slug']} test #{ti} input is {b} bytes (limit < {SAFE_MAX_BYTES})"
            )

    build_and_verify_pack(
        pack_id="11-adhoc-invariant",
        title="Tầng 1–2: Tư duy Ad-hoc, Bất biến & Chẵn lẻ",
        tier="Tầng 1–2 — Nền tảng & Lõi",
        description=(
            "10 bài tư duy đột phá chuẩn Codeforces & CSES: trung vị, đồng xu nhỏ nhất, "
            "bất biến đổi dấu, đếm chu trình hoán vị, Kadane vòng tròn, Josephus, "
            "nước mưa và Boyer-Moore."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
