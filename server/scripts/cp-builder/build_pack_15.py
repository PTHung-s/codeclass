"""
Builder & automated verifier for CodeClass CP Pack 15:
Tầng 4: Truy vấn đoạn (BIT, Sparse Table & Segment Tree)

Generates and verifies 10 original Vietnamese competitive programming problems
(2 easy, 4 medium, 4 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Truy vấn đoạn BIT & Segment Tree\n"
SAFE_MAX_BYTES = 148_000


def fmt_arr_queries_nq(arr: List[int], queries: List[Tuple[int, ...]]) -> str:
    lines = [f"{len(arr)} {len(queries)}", " ".join(map(str, arr))]
    lines.extend(" ".join(map(str, q)) for q in queries)
    return "\n".join(lines)


def fmt_arr_only(arr: List[int]) -> str:
    return f"{len(arr)}\n" + " ".join(map(str, arr))


def fmt_hotel(hotels: List[int], groups: List[int]) -> str:
    return f"{len(hotels)} {len(groups)}\n" + " ".join(map(str, hotels)) + "\n" + " ".join(map(str, groups))


# ============================================================================
# 1. cp15-bit-point-update-sum (easy, algo.fenwick_bit)
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            pos, val = toks[idx + 1], toks[idx + 2]
            a[pos] = val
            idx += 3
        else:
            l, r = toks[idx + 1], toks[idx + 2]
            out.append(str(sum(a[l:r + 1])))
            idx += 3
    return "\n".join(out)


def build_p01() -> dict:
    rng = random.Random(1501)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [3, 2, 4, 5, 1, 1, 5, 3],
                [(2, 1, 4), (2, 5, 6), (1, 3, 10), (2, 1, 4), (2, 3, 8)],
            ),
            "hidden": False,
            "expected": "14\n2\n20\n25",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-5, 10, -3, 7],
                [(2, 1, 4), (1, 2, -10), (2, 1, 2), (2, 2, 4)],
            ),
            "hidden": False,
            "expected": "9\n-15\n-6",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1000000000, 1000000000, -1000000000],
                [(2, 1, 2), (1, 3, 1000000000), (2, 1, 3)],
            ),
            "hidden": False,
            "expected": "2000000000\n3000000000",
            "checkBrute": True,
        },
        # 5 corner / overflow tests
        {
            "input": fmt_arr_queries_nq(
                [42],
                [(2, 1, 1), (1, 1, -1000000000), (2, 1, 1), (1, 1, 0), (2, 1, 1)],
            ),
            "hidden": True,
            "expected": "42\n-1000000000\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [0, 0, 0, 0, 0],
                [(2, 1, 5), (1, 1, 1000000000), (1, 5, -1000000000), (2, 1, 5), (2, 1, 1), (2, 5, 5)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10**9] * 10,
                [(2, 1, 10), (1, 5, -10**9), (2, 1, 10), (1, 5, 10**9), (2, 3, 8)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-10**9] * 8,
                [(2, 1, 8), (2, 4, 4), (1, 4, 10**9), (2, 1, 8)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-100, 100) for _ in range(50)],
                [
                    (1, rng.randint(1, 50), rng.randint(-1000, 1000))
                    if i % 2 == 0 else
                    (2, *(lambda a, b: (min(a, b), max(a, b)))(rng.randint(1, 50), rng.randint(1, 50)))
                    for i in range(60)
                ] + [(2, 1, 50)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148KB input & output)
    # Test 9: Medium N=500, Q=800 (brute checked)
    q9 = []
    for i in range(800):
        if i % 3 == 0:
            q9.append((1, rng.randint(1, 500), rng.randint(-10**9, 10**9)))
        else:
            l, r = sorted((rng.randint(1, 500), rng.randint(1, 500)))
            q9.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(500)], q9),
        "hidden": True,
        "checkBrute": True,
    })

    # Test 10: N=2000, Q=3000
    q10 = []
    for i in range(3000):
        if i % 2 == 0:
            q10.append((1, rng.randint(1, 2000), rng.randint(-10**6, 10**6)))
        else:
            l, r = sorted((rng.randint(1, 2000), rng.randint(1, 2000)))
            q10.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**6, 10**6) for _ in range(2000)], q10),
        "hidden": True,
    })

    # Test 11: Overflow stress N=5000, Q=6000 with 10^9 values
    q11 = []
    for i in range(6000):
        if i % 3 == 0:
            q11.append((1, rng.randint(1, 5000), rng.choice([-10**9, 10**9, 0])))
        else:
            l, r = sorted((rng.randint(1, 5000), rng.randint(1, 5000)))
            q11.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.choice([-10**9, 10**9]) for _ in range(5000)], q11),
        "hidden": True,
    })

    # Test 12: N=10000, Q=7000 alternating updates and full-range queries
    q12 = []
    for i in range(7000):
        if i % 2 == 0:
            q12.append((1, rng.randint(1, 10000), rng.randint(-999, 999)))
        else:
            q12.append((2, 1, 10000) if i % 4 == 1 else (2, rng.randint(1, 3000), rng.randint(7000, 10000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-999, 999) for _ in range(10000)], q12),
        "hidden": True,
    })

    # Test 13: N=15000, Q=5500 moderate values
    q13 = []
    for i in range(5500):
        if i % 3 != 0:
            q13.append((1, rng.randint(1, 15000), rng.randint(-99, 99)))
        else:
            l, r = sorted((rng.randint(1, 15000), rng.randint(1, 15000)))
            q13.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(15000)], q13),
        "hidden": True,
    })

    # Test 14: Max N=20000, Q=5000 small values
    q14 = []
    for i in range(5000):
        if i % 2 == 0:
            q14.append((1, rng.randint(1, 20000), rng.randint(-99, 99)))
        else:
            l, r = sorted((rng.randint(1, 20000), rng.randint(1, 20000)))
            q14.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(20000)], q14),
        "hidden": True,
    })

    # Test 15: Heavy prefix/suffix queries N=8000, Q=8000
    q15 = []
    for i in range(8000):
        if i % 3 == 0:
            q15.append((1, (i % 8000) + 1, rng.randint(-10**5, 10**5)))
        elif i % 3 == 1:
            q15.append((2, 1, rng.randint(1, 8000)))
        else:
            q15.append((2, rng.randint(1, 8000), 8000))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**5, 10**5) for _ in range(8000)], q15),
        "hidden": True,
    })

    # Test 16: Max N=20000, Q=5500 mixed updates and long queries
    q16 = []
    for i in range(5500):
        if i % 3 == 0:
            q16.append((1, rng.randint(1, 20000), rng.randint(1, 99)))
        else:
            l = rng.randint(1, 5000)
            r = rng.randint(15000, 20000)
            q16.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(0, 99) for _ in range(20000)], q16),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 40)
        arr = [rng.randint(-1000, 1000) for _ in range(n)]
        qs = []
        for k in range(qcnt - 1):
            if rng.random() < 0.45:
                qs.append((1, rng.randint(1, n), rng.randint(-1000, 1000)))
            else:
                l, r = sorted((rng.randint(1, n), rng.randint(1, n)))
                qs.append((2, l, r))
        qs.append((2, 1, n))
        extra_stress.append(fmt_arr_queries_nq(arr, qs))

    statement = r"""Hệ thống quản lý điện mặt trời theo dõi công suất phát (có thể âm nếu trạm đang tiêu thụ bù lưới) tại $N$ trạm biến áp đánh số từ $1$ đến $N$. Ban đầu, trạm thứ $i$ có giá trị công suất $a_i$.

Trong ngày, trung tâm nhận được $Q$ yêu cầu thuộc một trong hai loại:
- `1 pos val`: cập nhật lại giá trị công suất của trạm `pos` thành `val` (gán $a_{\text{pos}} \leftarrow \text{val}$).
- `2 l r`: tính tổng công suất của các trạm liên tiếp từ chỉ số $l$ đến $r$ ($\sum_{i=l}^{r} a_i$).

Hãy xử lý tuần tự các yêu cầu và in ra kết quả cho mọi truy vấn loại `2`.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng mô tả một truy vấn theo một trong hai dạng:
  - `1 pos val` ($1 \le \text{pos} \le N$, $|\text{val}| \le 10^9$)
  - `2 l r` ($1 \le l \le r \le N$)

### Kết quả
- Với mỗi truy vấn loại `2`, in ra một số nguyên trên một dòng là tổng đoạn $[l, r]$.

### Ràng buộc
- $1 \le N, Q \le 20\,000$
- $|a_i|, |\text{val}| \le 10^9$
- Đảm bảo có ít nhất một truy vấn loại `2`.

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với ví dụ đầu tiên, mảng ban đầu là $[3, 2, 4, 5, 1, 1, 5, 3]$:
1. Truy vấn `2 1 4`: $3 + 2 + 4 + 5 = 14$.
2. Truy vấn `2 5 6`: $1 + 1 = 2$.
3. Truy vấn `1 3 10`: gán $a_3 \leftarrow 10$, mảng trở thành $[3, 2, 10, 5, 1, 1, 5, 3]$.
4. Truy vấn `2 1 4`: $3 + 2 + 10 + 5 = 20$.
5. Truy vấn `2 3 8`: $10 + 5 + 1 + 1 + 5 + 3 = 25$."""

    hints = r"""**Gợi ý 1:**
Nếu dùng mảng cộng dồn (Prefix Sum), mỗi lần gán `a[pos] = val` sẽ phải cập nhật lại toàn bộ phần còn lại mất $O(N)$, dẫn đến $O(NQ)$ không đủ nhanh khi $N, Q$ lớn. Bạn cần một cấu trúc dữ liệu hỗ trợ cả cập nhật điểm và tính tổng tiền tố trong $O(\log N)$.

**Gợi ý 2:**
Dùng **Cây chỉ số nhị phân (Fenwick Tree / BIT)** lưu tổng các phần tử theo từng khối có độ dài $i \& (-i)$. Tổng đoạn $[l, r]$ được tính bằng hiệu hai tổng tiền tố: $\text{prefix}(r) - \text{prefix}(l - 1)$.

**Gợi ý 3:**
- Thao tác `1 pos val` là **gán** giá trị mới chứ không phải cộng thêm. Do đó bạn cần lưu mảng `a[]` hiện tại để tính độ chênh lệch `delta = val - a[pos]`, cập nhật `a[pos] = val`, rồi gọi `bit.add(pos, delta)`.
- Tổng trên đoạn dài tối đa $20\,000$ phần tử cỡ $10^9$ có thể lên tới $2 \times 10^{13}$, vượt giới hạn kiểu `int` 32-bit. Hãy dùng `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<long long> a(n + 1, 0), bit(n + 1, 0);
    for (int i = 1; i <= n; ++i) {
        cin >> a[i];
        bit[i] += a[i];
        int p = i + (i & -i);
        if (p <= n) bit[p] += bit[i];
    }

    auto add = [&](int idx, long long delta) {
        for (; idx <= n; idx += idx & -idx) {
            bit[idx] += delta;
        }
    };

    auto prefix = [&](int idx) -> long long {
        long long res = 0;
        for (; idx > 0; idx -= idx & -idx) {
            res += bit[idx];
        }
        return res;
    };

    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int pos;
            long long val;
            cin >> pos >> val;
            long long delta = val - a[pos];
            a[pos] = val;
            add(pos, delta);
        } else {
            int l, r;
            cin >> l >> r;
            cout << (prefix(r) - prefix(l - 1)) << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    a = [0] * (n + 1)
    bit = [0] * (n + 1)
    for i in range(1, n + 1):
        v = int(next(it))
        a[i] = v
        bit[i] += v
        p = i + (i & -i)
        if p <= n:
            bit[p] += bit[i]

    out = []
    for _ in range(q):
        t = int(next(it))
        if t == 1:
            pos = int(next(it))
            val = int(next(it))
            delta = val - a[pos]
            a[pos] = val
            i = pos
            while i <= n:
                bit[i] += delta
                i += i & -i
        else:
            l = int(next(it))
            r = int(next(it))
            sr = 0
            i = r
            while i > 0:
                sr += bit[i]
                i -= i & -i
            sl = 0
            i = l - 1
            while i > 0:
                sl += bit[i]
                i -= i & -i
            out.append(str(sr - sl))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-bit-point-update-sum",
        "title": "Cập nhật điểm và tổng đoạn (Fenwick Tree)",
        "shortDescription": "Sử dụng Fenwick Tree (BIT) xử lý truy vấn gán giá trị tại một vị trí và tính tổng đoạn [l, r].",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.fenwick_bit",
        "tags": ["bit-fenwick", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) bằng Fenwick Tree (BIT).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp15-sparse-table-min-max (easy, algo.sparse_table_rmq)
# ============================================================================

def brute_p02(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        l, r = toks[idx], toks[idx + 1]
        idx += 2
        seg = a[l:r + 1]
        out.append(f"{min(seg)} {max(seg)}")
    return "\n".join(out)


def build_p02() -> dict:
    rng = random.Random(1502)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [4, -2, 7, 1, 9, -5, 3],
                [(1, 3), (2, 6), (4, 4), (1, 7)],
            ),
            "hidden": False,
            "expected": "-2 7\n-5 9\n1 1\n-5 9",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10, 10, 10, 10],
                [(1, 4), (2, 3), (3, 3)],
            ),
            "hidden": False,
            "expected": "10 10\n10 10\n10 10",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-1000000000, 0, 1000000000],
                [(1, 1), (1, 2), (2, 3), (1, 3)],
            ),
            "hidden": False,
            "expected": "-1000000000 -1000000000\n-1000000000 0\n0 1000000000\n-1000000000 1000000000",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_arr_queries_nq([-999999999], [(1, 1), (1, 1)]),
            "hidden": True,
            "expected": "-999999999 -999999999\n-999999999 -999999999",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [5, 4, 3, 2, 1, 0, -1, -2],
                [(i, j) for i in range(1, 9) for j in range(i, 9)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-10**9, 10**9] * 8,
                [(1, 16), (2, 15), (1, 2), (15, 16), (3, 14)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [100, -50, 200, -100, 300, -200, 400],
                [(i, i) for i in range(1, 8)] + [(1, 7)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-1000, 1000) for _ in range(40)],
                [tuple(sorted((rng.randint(1, 40), rng.randint(1, 40)))) for _ in range(80)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (keep output < 148KB!)
    # Test 9: N=400, Q=600 (brute checked)
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-10**9, 10**9) for _ in range(400)],
            [tuple(sorted((rng.randint(1, 400), rng.randint(1, 400)))) for _ in range(600)],
        ),
        "hidden": True,
        "checkBrute": True,
    })

    # Test 10: N=2000, Q=4000
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-10**6, 10**6) for _ in range(2000)],
            [tuple(sorted((rng.randint(1, 2000), rng.randint(1, 2000)))) for _ in range(4000)],
        ),
        "hidden": True,
    })

    # Test 11: N=5000, Q=5000 full 10^9 range (output ~110KB)
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-10**9, 10**9) for _ in range(5000)],
            [tuple(sorted((rng.randint(1, 5000), rng.randint(1, 5000)))) for _ in range(5000)],
        ),
        "hidden": True,
    })

    # Test 12: Strictly increasing N=12000, Q=6500
    tests.append({
        "input": fmt_arr_queries_nq(
            [i - 6000 for i in range(12000)],
            [tuple(sorted((rng.randint(1, 12000), rng.randint(1, 12000)))) for _ in range(6500)],
        ),
        "hidden": True,
    })

    # Test 13: Strictly decreasing N=15000, Q=5500
    tests.append({
        "input": fmt_arr_queries_nq(
            [15000 - i for i in range(15000)],
            [tuple(sorted((rng.randint(1, 15000), rng.randint(1, 15000)))) for _ in range(5500)],
        ),
        "hidden": True,
    })

    # Test 14: Power-of-2 boundary queries N=16384, Q=5000
    q14 = []
    for k in range(5000):
        if k < 500:
            l = rng.randint(1, 8192)
            q14.append((l, min(16384, l + (1 << (k % 14)) - 1)))
        else:
            q14.append(tuple(sorted((rng.randint(1, 16384), rng.randint(1, 16384)))))
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-99, 99) for _ in range(16384)],
            q14,
        ),
        "hidden": True,
    })

    # Test 15: Max N=20000, Q=5000 random small values
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-99, 99) for _ in range(20000)],
            [tuple(sorted((rng.randint(1, 20000), rng.randint(1, 20000)))) for _ in range(5000)],
        ),
        "hidden": True,
    })

    # Test 16: Max N=20000, Q=6000 (2-digit values so input & output < 140KB)
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(0, 99) for _ in range(20000)],
            [tuple(sorted((rng.randint(1, 20000), rng.randint(1, 20000)))) for _ in range(6000)],
        ),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 45)
        arr = [rng.randint(-10**9, 10**9) for _ in range(n)]
        qs = [tuple(sorted((rng.randint(1, n), rng.randint(1, n)))) for _ in range(qcnt)]
        extra_stress.append(fmt_arr_queries_nq(arr, qs))

    statement = r"""Trạm khí tượng ghi nhận chuỗi nhiệt độ tĩnh gồm $N$ chỉ số $a_1, a_2, \dots, a_N$ (mảng không thay đổi trong suốt quá trình xử lý).

Bạn cần trả lời $Q$ truy vấn độc lập. Mỗi truy vấn cho một cặp chỉ số $(l, r)$ với $1 \le l \le r \le N$, yêu cầu xác định đồng thời **giá trị nhỏ nhất** và **giá trị lớn nhất** trong đoạn $[l, r]$:
$$\min_{l \le i \le r} a_i \quad \text{và} \quad \max_{l \le i \le r} a_i$$

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $l, r$ ($1 \le l \le r \le N$).

### Kết quả
- Với mỗi truy vấn, in ra một dòng gồm hai số nguyên cách nhau bởi một dấu cách: giá trị nhỏ nhất và giá trị lớn nhất trên đoạn $[l, r]$.

### Ràng buộc
- $1 \le N, Q \le 20\,000$
- $|a_i| \le 10^9$
- $1 \le l \le r \le N$

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với ví dụ đầu tiên, mảng là $[4, -2, 7, 1, 9, -5, 3]$:
1. Đoạn $[1, 3]$ gồm $[4, -2, 7]$ có $\min = -2, \max = 7$.
2. Đoạn $[2, 6]$ gồm $[-2, 7, 1, 9, -5]$ có $\min = -5, \max = 9$.
3. Đoạn $[4, 4]$ chỉ có $[1]$ nên $\min = 1, \max = 1$.
4. Toàn bộ đoạn $[1, 7]$ có $\min = -5, \max = 9$."""

    hints = r"""**Gợi ý 1:**
Vì mảng là **tĩnh** (không có thao tác cập nhật) và phép toán $\min, \max$ có tính **lũy đẳng** ($\min(x, x) = x$, $\max(x, x) = x$), hai đoạn con giao nhau vẫn cho kết quả chính xác khi gộp lại.

**Gợi ý 2:**
Dùng **Bảng thưa (Sparse Table)**. Tiền xử lý $\text{stMin}[k][i]$ và $\text{stMax}[k][i]$ lần lượt là giá trị nhỏ nhất và lớn nhất trên đoạn độ dài $2^k$ bắt đầu tại $i$ (tức đoạn $[i, i + 2^k - 1]$) với $0 \le k \le \lfloor \log_2 N \rfloor$.

**Gợi ý 3:**
- Tiền xử lý mảng `lg[len] = floor(log2(len))` bằng công thức `lg[i] = lg[i >> 1] + 1` cho $i \ge 2$.
- Với truy vấn $[l, r]$, đặt $k = \text{lg}[r - l + 1]$. Kết quả là:
  - $\min(\text{stMin}[k][l], \text{stMin}[k][r - 2^k + 1])$
  - $\max(\text{stMax}[k][l], \text{stMax}[k][r - 2^k + 1])$
- Độ phức tạp đạt $O(N \log N)$ tiền xử lý và $O(1)$ cho mỗi truy vấn."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    int maxLog = 1;
    while ((1 << maxLog) <= n) ++maxLog;

    vector<int> lg(n + 1, 0);
    for (int i = 2; i <= n; ++i) {
        lg[i] = lg[i >> 1] + 1;
    }

    vector<vector<int>> stMin(maxLog, vector<int>(n + 1));
    vector<vector<int>> stMax(maxLog, vector<int>(n + 1));
    for (int i = 1; i <= n; ++i) {
        int v;
        cin >> v;
        stMin[0][i] = v;
        stMax[0][i] = v;
    }

    for (int k = 1; k < maxLog; ++k) {
        int half = 1 << (k - 1);
        int limit = n - (1 << k) + 1;
        for (int i = 1; i <= limit; ++i) {
            stMin[k][i] = min(stMin[k - 1][i], stMin[k - 1][i + half]);
            stMax[k][i] = max(stMax[k - 1][i], stMax[k - 1][i + half]);
        }
    }

    while (q--) {
        int l, r;
        cin >> l >> r;
        int k = lg[r - l + 1];
        int rStart = r - (1 << k) + 1;
        int mn = min(stMin[k][l], stMin[k][rStart]);
        int mx = max(stMax[k][l], stMax[k][rStart]);
        cout << mn << ' ' << mx << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    a = [int(next(it)) for _ in range(n)]

    lg = [0] * (n + 1)
    for i in range(2, n + 1):
        lg[i] = lg[i >> 1] + 1

    max_k = lg[n] + 1
    st_min = [a]
    st_max = [a[:]]
    for k in range(1, max_k):
        half = 1 << (k - 1)
        prev_min = st_min[k - 1]
        prev_max = st_max[k - 1]
        st_min.append(list(map(min, prev_min[:-half], prev_min[half:])))
        st_max.append(list(map(max, prev_max[:-half], prev_max[half:])))

    out = []
    for _ in range(q):
        l = int(next(it)) - 1
        r = int(next(it)) - 1
        k = lg[r - l + 1]
        r_start = r - (1 << k) + 1
        row_min = st_min[k]
        row_max = st_max[k]
        mn = row_min[l] if row_min[l] <= row_min[r_start] else row_min[r_start]
        mx = row_max[l] if row_max[l] >= row_max[r_start] else row_max[r_start]
        out.append(f"{mn} {mx}")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-sparse-table-min-max",
        "title": "Truy vấn Min/Max tĩnh bằng Sparse Table O(1)",
        "shortDescription": "Tiền xử lý Sparse Table để trả lời truy vấn giá trị nhỏ nhất và lớn nhất trên đoạn tĩnh trong O(1).",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.sparse_table_rmq",
        "tags": ["sparse table", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N + Q) bằng Sparse Table.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp15-bit-range-add-point-query (medium, algo.fenwick_bit)
# ============================================================================

def brute_p03(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            l, r, v = toks[idx + 1], toks[idx + 2], toks[idx + 3]
            for i in range(l, r + 1):
                a[i] += v
            idx += 4
        else:
            pos = toks[idx + 1]
            out.append(str(a[pos]))
            idx += 2
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1503)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [3, 2, 4, 5, 1, 1, 5, 3],
                [(2, 4), (1, 2, 5, 1), (2, 4), (1, 3, 6, -2), (2, 4), (2, 6)],
            ),
            "hidden": False,
            "expected": "5\n6\n4\n-1",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [0, -10, 20, -30],
                [(1, 1, 4, 15), (2, 1), (2, 2), (1, 2, 3, -5), (2, 2), (2, 3)],
            ),
            "hidden": False,
            "expected": "15\n5\n0\n30",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1000000000, -1000000000],
                [(1, 1, 2, 1000000000), (1, 1, 1, 1000000000), (2, 1), (2, 2)],
            ),
            "hidden": False,
            "expected": "3000000000\n0",
            "checkBrute": True,
        },
        # 5 corner / overflow tests
        {
            "input": fmt_arr_queries_nq(
                [-10**9],
                [(2, 1), (1, 1, 1, -10**9), (2, 1), (1, 1, 1, 0), (2, 1)],
            ),
            "hidden": True,
            "expected": "-1000000000\n-2000000000\n-2000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [0] * 10,
                [(1, 1, 10, 10**9), (1, 1, 10, 10**9), (1, 1, 10, 10**9), (1, 1, 10, 10**9), (2, 1), (2, 10)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1, 2, 3, 4, 5, 6],
                [(1, 1, 1, 10), (1, 6, 6, -10), (1, 2, 5, 0), (2, 1), (2, 3), (2, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10**9] * 5,
                [(1, 1, 5, 10**9) for _ in range(10)] + [(2, i) for i in range(1, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-1000, 1000) for _ in range(45)],
                [
                    (1, *sorted((rng.randint(1, 45), rng.randint(1, 45))), rng.randint(-1000, 1000))
                    if i % 2 == 0 else
                    (2, rng.randint(1, 45))
                    for i in range(70)
                ],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    # Test 9: N=400, Q=700 (brute checked)
    q9 = []
    for i in range(700):
        if i % 2 == 0:
            l, r = sorted((rng.randint(1, 400), rng.randint(1, 400)))
            q9.append((1, l, r, rng.randint(-10**9, 10**9)))
        else:
            q9.append((2, rng.randint(1, 400)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(400)], q9),
        "hidden": True,
        "checkBrute": True,
    })

    # Test 10: N=2000, Q=3000
    q10 = []
    for i in range(3000):
        if i % 2 == 0:
            l, r = sorted((rng.randint(1, 2000), rng.randint(1, 2000)))
            q10.append((1, l, r, rng.randint(-10**6, 10**6)))
        else:
            q10.append((2, rng.randint(1, 2000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**6, 10**6) for _ in range(2000)], q10),
        "hidden": True,
    })

    # Test 11: Overflow stress N=5000, Q=5000 with 10^9 values
    q11 = []
    for i in range(5000):
        if i % 3 != 0:
            l, r = sorted((rng.randint(1, 5000), rng.randint(1, 5000)))
            q11.append((1, l, r, rng.choice([10**9, -10**9, 500000000])))
        else:
            q11.append((2, rng.randint(1, 5000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.choice([10**9, -10**9]) for _ in range(5000)], q11),
        "hidden": True,
    })

    # Test 12: Full-range adds N=10000, Q=6500
    q12 = []
    for i in range(6500):
        if i < 3200:
            q12.append((1, 1, 10000, 100000 if i % 2 == 0 else -99999))
        else:
            q12.append((2, rng.randint(1, 10000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-999, 999) for _ in range(10000)], q12),
        "hidden": True,
    })

    # Test 13: N=15000, Q=5000
    q13 = []
    for i in range(5000):
        if i % 2 == 0:
            l, r = sorted((rng.randint(1, 15000), rng.randint(1, 15000)))
            q13.append((1, l, r, rng.randint(-99, 99)))
        else:
            q13.append((2, rng.randint(1, 15000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(15000)], q13),
        "hidden": True,
    })

    # Test 14: Boundary r=N heavy updates N=12000, Q=5500
    q14 = []
    for i in range(5500):
        if i % 3 != 2:
            q14.append((1, rng.randint(1, 6000), 12000, rng.randint(-99, 99)))
        else:
            q14.append((2, rng.randint(1, 12000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(12000)], q14),
        "hidden": True,
    })

    # Test 15: Max N=20000, Q=4500 small values
    q15 = []
    for i in range(4500):
        if i % 2 == 0:
            l, r = sorted((rng.randint(1, 20000), rng.randint(1, 20000)))
            q15.append((1, l, r, rng.randint(-99, 99)))
        else:
            q15.append((2, rng.randint(1, 20000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(20000)], q15),
        "hidden": True,
    })

    # Test 16: Max N=20000, Q=6000 mixed
    q16 = []
    for i in range(6000):
        if i % 3 == 0:
            l, r = sorted((rng.randint(1, 20000), rng.randint(1, 20000)))
            q16.append((1, l, r, rng.randint(1, 999)))
        else:
            q16.append((2, rng.randint(1, 20000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(0, 999) for _ in range(20000)], q16),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 40)
        arr = [rng.randint(-1000, 1000) for _ in range(n)]
        qs = []
        for _ in range(qcnt - 1):
            if rng.random() < 0.5:
                l, r = sorted((rng.randint(1, n), rng.randint(1, n)))
                qs.append((1, l, r, rng.randint(-1000, 1000)))
            else:
                qs.append((2, rng.randint(1, n)))
        qs.append((2, rng.randint(1, n)))
        extra_stress.append(fmt_arr_queries_nq(arr, qs))

    statement = r"""Một dãy $N$ tài khoản điểm thưởng ban đầu có số dư lần lượt là $a_1, a_2, \dots, a_N$. Bạn cần xử lý tuần tự $Q$ thao tác thuộc hai loại:
- `1 l r v`: cộng thêm $v$ điểm vào **tất cả** các tài khoản có chỉ số thuộc đoạn $[l, r]$ ($l \le i \le r$). Giá trị $v$ có thể âm, bằng $0$, hoặc dương.
- `2 pos`: hỏi số dư hiện tại của tài khoản tại vị trí `pos`.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng là một truy vấn dạng:
  - `1 l r v` ($1 \le l \le r \le N$, $|v| \le 10^9$)
  - `2 pos` ($1 \le \text{pos} \le N$)

### Kết quả
- Với mỗi truy vấn loại `2`, in ra giá trị hiện tại $a_{\text{pos}}$ trên một dòng.

### Ràng buộc
- $1 \le N, Q \le 20\,000$
- $|a_i|, |v| \le 10^9$
- Đảm bảo có ít nhất một truy vấn loại `2`.

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Mảng ban đầu: $[3, 2, 4, 5, 1, 1, 5, 3]$.
1. `2 4`: giá trị tại vị trí $4$ là $5$.
2. `1 2 5 1`: cộng $1$ vào đoạn $[2, 5]$, mảng thành $[3, 3, 5, 6, 2, 1, 5, 3]$.
3. `2 4`: vị trí $4$ giờ là $6$.
4. `1 3 6 -2`: cộng $-2$ vào đoạn $[3, 6]$, mảng thành $[3, 3, 3, 4, 0, -1, 5, 3]$.
5. `2 4` và `2 6` lần lượt cho kết quả $4$ và $-1$."""

    hints = r"""**Gợi ý 1:**
Nếu duyệt `for i = l..r: a[i] += v`, độ phức tạp sẽ là $O(NQ)$. Hãy nghĩ đến kỹ thuật **mảng hiệu (Difference Array)**: tăng cả đoạn $[l, r]$ thêm $v$ tương đương chỉ sửa 2 điểm trên mảng hiệu!

**Gợi ý 2:**
Gọi `delta[i]` là tổng lượng thay đổi cộng dồn tại vị trí $i$ so với mảng ban đầu `a[i]`, và lưu mảng hiệu $D$ sao cho $\text{delta}[pos] = \sum_{i=1}^{pos} D[i]$. Khi cộng $v$ vào $[l, r]$, ta chỉ cần:
- $D[l] \mathrel{+}= v$
- $D[r + 1] \mathrel{-}= v$ (nếu $r + 1 \le N$)

**Gợi ý 3:**
- Dùng **Fenwick Tree (BIT)** quản lý mảng hiệu $D$ (khởi tạo toàn $0$).
- Khi gặp `1 l r v`: gọi `bit.add(l, v)` và nếu `r + 1 <= n` thì gọi `bit.add(r + 1, -v)`.
- Khi gặp `2 pos`: giá trị hiện tại chính là `a[pos] + bit.prefix(pos)`. Đừng quên dùng `long long` vì sau nhiều lần cộng, giá trị có thể vượt $2^{31} - 1$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<long long> a(n + 1, 0), bit(n + 1, 0);
    for (int i = 1; i <= n; ++i) {
        cin >> a[i];
    }

    auto add = [&](int idx, long long val) {
        for (; idx <= n; idx += idx & -idx) {
            bit[idx] += val;
        }
    };

    auto prefix = [&](int idx) -> long long {
        long long res = 0;
        for (; idx > 0; idx -= idx & -idx) {
            res += bit[idx];
        }
        return res;
    };

    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int l, r;
            long long v;
            cin >> l >> r >> v;
            add(l, v);
            if (r + 1 <= n) add(r + 1, -v);
        } else {
            int pos;
            cin >> pos;
            cout << (a[pos] + prefix(pos)) << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    a = [0] + [int(next(it)) for _ in range(n)]
    bit = [0] * (n + 1)

    out = []
    for _ in range(q):
        t = int(next(it))
        if t == 1:
            l = int(next(it))
            r = int(next(it))
            v = int(next(it))
            i = l
            while i <= n:
                bit[i] += v
                i += i & -i
            if r + 1 <= n:
                i = r + 1
                while i <= n:
                    bit[i] -= v
                    i += i & -i
        else:
            pos = int(next(it))
            s = 0
            i = pos
            while i > 0:
                s += bit[i]
                i -= i & -i
            out.append(str(a[pos] + s))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-bit-range-add-point-query",
        "title": "Cộng đoạn và truy vấn điểm (BIT + Mảng hiệu)",
        "shortDescription": "Kết hợp mảng hiệu và Fenwick Tree (BIT) để cộng thêm giá trị trên đoạn [l, r] và truy vấn giá trị tại một điểm.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.fenwick_bit",
        "tags": ["bit-fenwick", "mảng hiệu", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + Q log N) bằng BIT trên mảng hiệu.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp15-segtree-point-update-min (medium, algo.segment_tree)
# ============================================================================

def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            pos, val = toks[idx + 1], toks[idx + 2]
            a[pos] = val
            idx += 3
        else:
            l, r = toks[idx + 1], toks[idx + 2]
            out.append(str(min(a[l:r + 1])))
            idx += 3
    return "\n".join(out)


def build_p04() -> dict:
    rng = random.Random(1504)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [3, 2, 4, 5, 1, 1, 5, 3],
                [(2, 1, 4), (2, 5, 6), (1, 2, -3), (2, 1, 4), (1, 5, 10), (2, 4, 7)],
            ),
            "hidden": False,
            "expected": "2\n1\n-3\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1000000000, 999999999, -1000000000],
                [(2, 1, 2), (2, 1, 3), (1, 3, 500), (2, 1, 3)],
            ),
            "hidden": False,
            "expected": "999999999\n-1000000000\n500",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [5, 5, 5, 5],
                [(2, 1, 4), (1, 4, 2), (2, 1, 3), (2, 1, 4)],
            ),
            "hidden": False,
            "expected": "5\n5\n2",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_arr_queries_nq(
                [-10**9],
                [(2, 1, 1), (1, 1, 10**9), (2, 1, 1), (1, 1, 0), (2, 1, 1)],
            ),
            "hidden": True,
            "expected": "-1000000000\n1000000000\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10, 20, 30, 40, 50, 60, 70],
                [(2, i, i) for i in range(1, 8)] + [(1, 1, 100), (1, 7, -5), (2, 1, 6), (2, 1, 7)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-100, -200, -300, -400],
                [(2, 1, 4), (1, 4, -50), (2, 1, 4), (1, 3, 0), (2, 1, 4)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [0] * 16,
                [(1, 1, -1), (1, 16, -2), (2, 2, 15), (2, 1, 15), (2, 2, 16), (2, 1, 16)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-1000, 1000) for _ in range(45)],
                [
                    (1, rng.randint(1, 45), rng.randint(-1000, 1000))
                    if i % 2 == 0 else
                    (2, *sorted((rng.randint(1, 45), rng.randint(1, 45))))
                    for i in range(70)
                ],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    q9 = []
    for i in range(700):
        if i % 3 == 0:
            q9.append((1, rng.randint(1, 400), rng.randint(-10**9, 10**9)))
        else:
            l, r = sorted((rng.randint(1, 400), rng.randint(1, 400)))
            q9.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(400)], q9),
        "hidden": True,
        "checkBrute": True,
    })

    q10 = []
    for i in range(3000):
        if i % 2 == 0:
            q10.append((1, rng.randint(1, 2000), rng.randint(-10**6, 10**6)))
        else:
            l, r = sorted((rng.randint(1, 2000), rng.randint(1, 2000)))
            q10.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**6, 10**6) for _ in range(2000)], q10),
        "hidden": True,
    })

    # Test 11: Full 10^9 values N=5000, Q=6000
    q11 = []
    for i in range(6000):
        if i % 2 == 0:
            q11.append((1, rng.randint(1, 5000), rng.randint(-10**9, 10**9)))
        else:
            l, r = sorted((rng.randint(1, 5000), rng.randint(1, 5000)))
            q11.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(5000)], q11),
        "hidden": True,
    })

    # Test 12: Increasing -> decreasing updates N=10000, Q=7000
    q12 = []
    for i in range(7000):
        if i % 2 == 0:
            q12.append((1, (i % 10000) + 1, -10000 - i))
        else:
            q12.append((2, 1, 10000) if i % 4 == 1 else (2, *sorted((rng.randint(1, 10000), rng.randint(1, 10000)))))
    tests.append({
        "input": fmt_arr_queries_nq([i for i in range(10000)], q12),
        "hidden": True,
    })

    # Test 13: N=15000, Q=5500
    q13 = []
    for i in range(5500):
        if i % 3 == 0:
            q13.append((1, rng.randint(1, 15000), rng.randint(-99, 99)))
        else:
            l, r = sorted((rng.randint(1, 15000), rng.randint(1, 15000)))
            q13.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(15000)], q13),
        "hidden": True,
    })

    # Test 14: Power-of-2 N=16384, Q=5000
    q14 = []
    for i in range(5000):
        if i % 3 == 0:
            q14.append((1, rng.randint(1, 16384), rng.randint(-99, 99)))
        else:
            l, r = sorted((rng.randint(1, 16384), rng.randint(1, 16384)))
            q14.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(16384)], q14),
        "hidden": True,
    })

    # Test 15: Max N=20000, Q=5000
    q15 = []
    for i in range(5000):
        if i % 2 == 0:
            q15.append((1, rng.randint(1, 20000), rng.randint(-99, 99)))
        else:
            l, r = sorted((rng.randint(1, 20000), rng.randint(1, 20000)))
            q15.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(20000)], q15),
        "hidden": True,
    })

    # Test 16: Max N=20000, Q=5500 long ranges
    q16 = []
    for i in range(5500):
        if i % 3 == 0:
            q16.append((1, rng.randint(1, 20000), rng.randint(0, 99)))
        else:
            q16.append((2, rng.randint(1, 4000), rng.randint(16000, 20000)))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(0, 99) for _ in range(20000)], q16),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 40)
        arr = [rng.randint(-10**9, 10**9) for _ in range(n)]
        qs = []
        for _ in range(qcnt - 1):
            if rng.random() < 0.45:
                qs.append((1, rng.randint(1, n), rng.randint(-10**9, 10**9)))
            else:
                l, r = sorted((rng.randint(1, n), rng.randint(1, n)))
                qs.append((2, l, r))
        qs.append((2, 1, n))
        extra_stress.append(fmt_arr_queries_nq(arr, qs))

    statement = r"""Cho một dãy số nguyên gồm $N$ phần tử $a_1, a_2, \dots, a_N$. Bạn cần thực hiện tuần tự $Q$ truy vấn thuộc một trong hai loại:
- `1 pos val`: gán giá trị mới cho phần tử tại vị trí `pos` ($a_{\text{pos}} \leftarrow \text{val}$).
- `2 l r`: tìm giá trị nhỏ nhất trong đoạn $[l, r]$ ($\min_{l \le i \le r} a_i$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng là một truy vấn dạng:
  - `1 pos val` ($1 \le \text{pos} \le N$, $|\text{val}| \le 10^9$)
  - `2 l r` ($1 \le l \le r \le N$)

### Kết quả
- Với mỗi truy vấn loại `2`, in ra giá trị nhỏ nhất tìm được trên một dòng.

### Ràng buộc
- $1 \le N, Q \le 20\,000$
- $|a_i|, |\text{val}| \le 10^9$
- Đảm bảo có ít nhất một truy vấn loại `2`.

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Mảng ban đầu là $[3, 2, 4, 5, 1, 1, 5, 3]$:
1. `2 1 4`: $\min(3, 2, 4, 5) = 2$.
2. `2 5 6`: $\min(1, 1) = 1$.
3. `1 2 -3`: gán $a_2 \leftarrow -3$, mảng trở thành $[3, -3, 4, 5, 1, 1, 5, 3]$.
4. `2 1 4`: $\min(3, -3, 4, 5) = -3$.
5. `1 5 10`: gán $a_5 \leftarrow 10$.
6. `2 4 7`: đoạn $[4, 7]$ gồm $[5, 10, 1, 5]$ có $\min = 1$."""

    hints = r"""**Gợi ý 1:**
Khác với tổng đoạn (có phép trừ nghịch đảo nên dùng được Fenwick Tree), phép toán $\min$ không có phép nghịch đảo và mảng lại có cập nhật thay đổi giá trị. Do đó Sparse Table hay BIT thông thường không phù hợp; cấu trúc tiêu chuẩn ở đây là **Cây phân đoạn (Segment Tree)**.

**Gợi ý 2:**
Xây dựng cây nhị phân lưu $\min$ của từng đoạn:
- Nút lá ứng với phần tử $a_i$.
- Mỗi nút cha lưu `tree[id] = min(tree[2*id], tree[2*id + 1])`.
- Khi cập nhật một điểm, chỉ cần đi từ lá lên gốc (tối đa $O(\log N)$ nút) và tính lại `min` tại mỗi nút tổ tiên.

**Gợi ý 3:**
- Có thể dùng Segment Tree dạng mảng $4N$ (đệ quy) hoặc **Iterative Segment Tree** (mảng kích thước $2N$, chỉ số từ $0$).
- Phần tử trung hòa của phép $\min$ phải lớn hơn mọi $a_i$ có thể ($10^9$), ví dụ $4 \times 10^{18}$ hoặc $2 \times 10^9 + 7$. Tuyệt đối không khởi tạo `ans = 0` vì toàn mảng có thể mang giá trị âm."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    const long long INF = (long long)4e18;
    vector<long long> tree(2 * n, INF);
    for (int i = 0; i < n; ++i) {
        cin >> tree[n + i];
    }
    for (int i = n - 1; i >= 1; --i) {
        tree[i] = min(tree[i << 1], tree[i << 1 | 1]);
    }

    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int pos;
            long long val;
            cin >> pos >> val;
            int p = (pos - 1) + n;
            tree[p] = val;
            for (p >>= 1; p >= 1; p >>= 1) {
                tree[p] = min(tree[p << 1], tree[p << 1 | 1]);
            }
        } else {
            int l, r;
            cin >> l >> r;
            l = (l - 1) + n;
            r = r + n;
            long long res = INF;
            while (l < r) {
                if (l & 1) res = min(res, tree[l++]);
                if (r & 1) res = min(res, tree[--r]);
                l >>= 1;
                r >>= 1;
            }
            cout << res << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    INF = 4 * 10**18
    tree = [INF] * (2 * n)
    for i in range(n):
        tree[n + i] = int(next(it))
    for i in range(n - 1, 0, -1):
        lv = tree[i << 1]
        rv = tree[i << 1 | 1]
        tree[i] = lv if lv <= rv else rv

    out = []
    for _ in range(q):
        t = int(next(it))
        if t == 1:
            p = int(next(it)) - 1 + n
            tree[p] = int(next(it))
            p >>= 1
            while p:
                lv = tree[p << 1]
                rv = tree[p << 1 | 1]
                tree[p] = lv if lv <= rv else rv
                p >>= 1
        else:
            l = int(next(it)) - 1 + n
            r = int(next(it)) + n
            res = INF
            while l < r:
                if l & 1:
                    if tree[l] < res:
                        res = tree[l]
                    l += 1
                if r & 1:
                    r -= 1
                    if tree[r] < res:
                        res = tree[r]
                l >>= 1
                r >>= 1
            out.append(str(res))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-segtree-point-update-min",
        "title": "Cập nhật điểm và Min đoạn (Segment Tree)",
        "shortDescription": "Cài đặt Segment Tree để cập nhật giá trị tại một vị trí và tìm phần tử nhỏ nhất trong đoạn [l, r].",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.segment_tree",
        "tags": ["segment tree", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + Q log N) bằng Segment Tree.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp15-bit-increasing-triplets (medium, algo.fenwick_bit)
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1:1 + n]
    ans = 0
    for j in range(1, n - 1):
        aj = a[j]
        left_less = sum(1 for i in range(j) if a[i] < aj)
        right_greater = sum(1 for k in range(j + 1, n) if a[k] > aj)
        ans += left_less * right_greater
    return str(ans)


def build_p05() -> dict:
    rng = random.Random(1505)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_only([1, 2, 3, 4]),
            "hidden": False,
            "expected": "4",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_only([5, 1, 4, 2, 3]),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_only([4, 4, 4, 4]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_arr_only([10]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_only([-10**9, 10**9]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_only([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_only([-10**9, -5, -5, 0, 0, 10**9]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_only([rng.randint(-10, 10) for _ in range(50)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_arr_only([rng.randint(-10**9, 10**9) for _ in range(300)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_arr_only([rng.randint(-100, 100) for _ in range(800)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_arr_only([i for i in range(1, 5001)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_arr_only([rng.randint(-10**9, 10**9) for _ in range(10000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_arr_only([i % 500 for i in range(15000)]),
        "hidden": True,
    })
    # Strictly increasing N=20000 -> C(20000, 3) ~ 1.33e12 (tests 64-bit overflow!)
    tests.append({
        "input": fmt_arr_only([i - 10000 for i in range(20000)]),
        "hidden": True,
    })
    # Strictly decreasing N=20000 -> 0
    tests.append({
        "input": fmt_arr_only([20000 - i for i in range(20000)]),
        "hidden": True,
    })
    # Random max N=20000 with negative and positive values
    tests.append({
        "input": fmt_arr_only([rng.randint(-99999, 99999) for _ in range(20000)]),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 40)
        extra_stress.append(fmt_arr_only([rng.randint(-15, 15) for _ in range(n)]))

    statement = r"""Cho một dãy số nguyên $a_1, a_2, \dots, a_N$. Một bộ ba chỉ số $(i, j, k)$ được gọi là **bộ ba tăng nghiêm ngặt** nếu thỏa mãn đồng thời:
$$1 \le i < j < k \le N \quad \text{và} \quad a_i < a_j < a_k$$

Hãy đếm tổng số bộ ba chỉ số tăng nghiêm ngặt trong dãy đã cho.

### Dữ liệu vào
- Dòng đầu tiên chứa một số nguyên $N$ ($1 \le N \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là số lượng bộ ba $(i, j, k)$ thỏa mãn điều kiện.

### Ràng buộc
- $1 \le N \le 20\,000$
- $|a_i| \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 300$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1 (`[1, 2, 3, 4]`): Có $\binom{4}{3} = 4$ bộ ba là $(1,2,3), (1,2,4), (1,3,4), (2,3,4)$.
- Với ví dụ 2 (`[5, 1, 4, 2, 3]`): Bộ ba duy nhất là $(2, 4, 5)$ tương ứng với giá trị $1 < 2 < 3$.
- Với ví dụ 3 (`[4, 4, 4, 4]`): Vì yêu cầu bất đẳng thức nghiêm ngặt $a_i < a_j < a_k$ nên kết quả là $0$."""

    hints = r"""**Gợi ý 1:**
Thay vì duyệt 3 vòng lặp $O(N^3)$, hãy cố định phần tử đứng giữa $j$ ($1 \le j \le N$). Khi cố định $j$, số bộ ba nhận $a_j$ làm phần tử giữa chính là:
$$\text{leftLess}[j] \times \text{rightGreater}[j]$$
trong đó $\text{leftLess}[j]$ là số chỉ số $i < j$ có $a_i < a_j$, và $\text{rightGreater}[j]$ là số chỉ số $k > j$ có $a_k > a_j$.

**Gợi ý 2:**
Vì $|a_i| \le 10^9$, không thể dùng giá trị $a_i$ làm chỉ số mảng trực tiếp. Hãy **nén tọa độ (Coordinate Compression)**: sắp xếp bản sao các giá trị duy nhất của mảng rồi ánh xạ mỗi $a_i$ về thứ hạng $c_i \in [1, M]$ ($M \le N$).

**Gợi ý 3:**
- Dùng **BIT thứ nhất** quét từ trái sang phải ($j = 1 \dots N$): trước khi thêm $c_j$ vào BIT, truy vấn `leftLess[j] = bitL.prefix(c[j] - 1)`, sau đó gọi `bitL.add(c[j], 1)`.
- Dùng **BIT thứ hai** quét từ phải sang trái ($j = N \dots 1$): đếm số phần tử bên phải có thứ hạng lớn hơn $c_j$ bằng `(N - j) - bitR.prefix(c[j])`, sau đó gọi `bitR.add(c[j], 1)`.
- Với $N = 20\,000$, đáp án tối đa là $\binom{20\,000}{3} \approx 1.33 \times 10^{12}$, cần dùng `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<int> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    vector<int> vals = a;
    sort(vals.begin(), vals.end());
    vals.erase(unique(vals.begin(), vals.end()), vals.end());
    int m = (int)vals.size();

    vector<int> c(n);
    for (int i = 0; i < n; ++i) {
        c[i] = (int)(lower_bound(vals.begin(), vals.end(), a[i]) - vals.begin()) + 1;
    }

    vector<int> bitL(m + 1, 0), bitR(m + 1, 0);
    auto add = [&](vector<int>& bit, int idx, int delta) {
        for (; idx <= m; idx += idx & -idx) bit[idx] += delta;
    };
    auto prefix = [&](const vector<int>& bit, int idx) -> int {
        int s = 0;
        for (; idx > 0; idx -= idx & -idx) s += bit[idx];
        return s;
    };

    vector<long long> leftLess(n, 0);
    for (int j = 0; j < n; ++j) {
        leftLess[j] = prefix(bitL, c[j] - 1);
        add(bitL, c[j], 1);
    }

    long long ans = 0;
    for (int j = n - 1; j >= 0; --j) {
        long long rightCount = (n - 1 - j);
        long long rightGreater = rightCount - prefix(bitR, c[j]);
        ans += leftLess[j] * rightGreater;
        add(bitR, c[j], 1);
    }

    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import bisect
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]

    vals = sorted(set(a))
    m = len(vals)
    c = [bisect.bisect_left(vals, x) + 1 for x in a]

    bit_l = [0] * (m + 1)
    left_less = [0] * n
    for j in range(n):
        cj = c[j]
        s = 0
        i = cj - 1
        while i > 0:
            s += bit_l[i]
            i -= i & -i
        left_less[j] = s
        i = cj
        while i <= m:
            bit_l[i] += 1
            i += i & -i

    bit_r = [0] * (m + 1)
    ans = 0
    for j in range(n - 1, -1, -1):
        cj = c[j]
        s = 0
        i = cj
        while i > 0:
            s += bit_r[i]
            i -= i & -i
        right_greater = (n - 1 - j) - s
        ans += left_less[j] * right_greater
        i = cj
        while i <= m:
            bit_r[i] += 1
            i += i & -i

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-bit-increasing-triplets",
        "title": "Đếm bộ ba tăng nghiêm ngặt (Nén tọa độ + 2 BIT)",
        "shortDescription": "Kết hợp nén tọa độ và hai cây Fenwick (BIT) để đếm số bộ ba chỉ số tăng nghiêm ngặt i < j < k với a[i] < a[j] < a[k].",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.fenwick_bit",
        "tags": ["bit-fenwick", "nén tọa độ", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N) bằng Nén tọa độ + 2 Fenwick Tree.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp15-segtree-hotel-first-geq (medium, algo.segment_tree)
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    h = toks[2:2 + n]
    reqs = toks[2 + n:2 + n + q]
    out = []
    for r in reqs:
        found = 0
        for i in range(n):
            if h[i] >= r:
                h[i] -= r
                found = i + 1
                break
        out.append(str(found))
    return " ".join(out)


def build_p06() -> dict:
    rng = random.Random(1506)

    tests = [
        # 3 public samples
        {
            "input": fmt_hotel([3, 2, 4, 1, 5, 5, 2, 6], [4, 4, 7, 1, 1]),
            "hidden": False,
            "expected": "3 5 0 1 1",
            "checkBrute": True,
        },
        {
            "input": fmt_hotel([5, 5, 5], [5, 5, 5, 1]),
            "hidden": False,
            "expected": "1 2 3 0",
            "checkBrute": True,
        },
        {
            "input": fmt_hotel([0, 1000000000, 500000000], [600000000, 500000000, 400000000, 1]),
            "hidden": False,
            "expected": "2 3 2 0",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_hotel([0], [1, 10**9]),
            "hidden": True,
            "expected": "0 0",
            "checkBrute": True,
        },
        {
            "input": fmt_hotel([10], [3, 4, 3, 1]),
            "hidden": True,
            "expected": "1 1 1 0",
            "checkBrute": True,
        },
        {
            "input": fmt_hotel([1, 2, 3, 4, 5], [6, 5, 4, 3, 2, 1, 1]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_hotel([10**9] * 4, [10**9, 10**9, 10**9, 10**9, 1]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_hotel(
                [rng.randint(0, 50) for _ in range(30)],
                [rng.randint(1, 30) for _ in range(60)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (note output is space-separated hotel indices, <= 120KB)
    tests.append({
        "input": fmt_hotel(
            [rng.randint(0, 10**9) for _ in range(500)],
            [rng.randint(1, 5 * 10**8) for _ in range(800)],
        ),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_hotel(
            [rng.randint(10, 1000) for _ in range(2000)],
            [rng.randint(1, 400) for _ in range(4000)],
        ),
        "hidden": True,
    })
    # Test 11: Large capacity hotels, many small hits at early hotels
    tests.append({
        "input": fmt_hotel(
            [10**9] * 5000,
            [rng.randint(10**8, 5 * 10**8) for _ in range(6000)],
        ),
        "hidden": True,
    })
    # Test 12: Increasing capacities N=12000, Q=12000
    tests.append({
        "input": fmt_hotel(
            [i * 2 for i in range(1, 12001)],
            [rng.randint(1, 24000) for _ in range(12000)],
        ),
        "hidden": True,
    })
    # Test 13: All hotels start with 1 room, Q=15000 requests of 1 room -> hits 1..15000
    tests.append({
        "input": fmt_hotel([1] * 15000, [1] * 15000),
        "hidden": True,
    })
    # Test 14: Power-of-2 N=16384, Q=12000
    tests.append({
        "input": fmt_hotel(
            [rng.randint(0, 9999) for _ in range(16384)],
            [rng.randint(1, 5000) for _ in range(12000)],
        ),
        "hidden": True,
    })
    # Test 15: Max N=20000, Q=15000
    tests.append({
        "input": fmt_hotel(
            [rng.randint(0, 999) for _ in range(20000)],
            [rng.randint(1, 700) for _ in range(15000)],
        ),
        "hidden": True,
    })
    # Test 16: Max N=20000, Q=16000 with many misses (`0`) and exact hits
    tests.append({
        "input": fmt_hotel(
            [rng.randint(0, 500) for _ in range(20000)],
            [rng.randint(1, 650) for _ in range(16000)],
        ),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 45)
        extra_stress.append(fmt_hotel(
            [rng.randint(0, 100) for _ in range(n)],
            [rng.randint(1, 60) for _ in range(qcnt)],
        ))

    statement = r"""Trên tuyến phố du lịch có $N$ khách sạn đánh số từ $1$ đến $N$. Khách sạn thứ $i$ hiện còn trống $h_i$ phòng ($0 \le h_i \le 10^9$).

Có $Q$ đoàn khách du lịch lần lượt đến đặt phòng; đoàn thứ $j$ cần thuê một khách sạn có ít nhất $r_j$ phòng trống. Theo quy định ưu tiên vị trí gần trung tâm:
- Mỗi đoàn luôn chọn **khách sạn có chỉ số nhỏ nhất** mà vẫn đủ số phòng trống ($h_i \ge r_j$).
- Sau khi nhận phòng, số phòng trống của khách sạn được chọn giảm đi $r_j$ ($h_i \leftarrow h_i - r_j$).
- Nếu không có khách sạn nào đủ $r_j$ phòng trống, đoàn khách không được phục vụ và ghi kết quả là `0`.

Hãy xác định chỉ số khách sạn phục vụ từng đoàn khách.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $h_1, h_2, \dots, h_N$ ($0 \le h_i \le 10^9$).
- Dòng thứ ba chứa $Q$ số nguyên $r_1, r_2, \dots, r_Q$ ($1 \le r_j \le 10^9$).

### Kết quả
- In ra trên **một dòng duy nhất** $Q$ số nguyên cách nhau bởi dấu cách: chỉ số khách sạn phục vụ từng đoàn ($1 \dots N$), hoặc `0` nếu không phục vụ được.

### Ràng buộc
- $1 \le N, Q \le 20\,000$
- $0 \le h_i \le 10^9$
- $1 \le r_j \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với ví dụ đầu tiên, số phòng ban đầu là $[3, 2, 4, 1, 5, 5, 2, 6]$ và các đoàn khách cần $[4, 4, 7, 1, 1]$:
1. Đoàn cần $4$ phòng $\rightarrow$ khách sạn đầu tiên đủ $\ge 4$ là số $3$ (còn $4 - 4 = 0$).
2. Đoàn cần $4$ phòng $\rightarrow$ khách sạn đầu tiên đủ $\ge 4$ là số $5$ (còn $5 - 4 = 1$).
3. Đoàn cần $7$ phòng $\rightarrow$ lớn nhất hiện tại chỉ là $6$ nên ghi `0`.
4. Đoàn cần $1$ phòng $\rightarrow$ khách sạn số $1$ có $3 \ge 1$ (còn $2$).
5. Đoàn cần $1$ phòng $\rightarrow$ khách sạn số $1$ có $2 \ge 1$ (còn $1$)."""

    hints = r"""**Gợi ý 1:**
Ta cần tìm **chỉ số nhỏ nhất** $i$ thỏa mãn $h_i \ge r$, rồi giảm $h_i$ đi $r$. Nếu tìm kiếm tuyến tính sẽ mất $O(NQ)$.

**Gợi ý 2:**
Dùng **Segment Tree** quản lý giá trị **lớn nhất ($\max$)** trên từng đoạn:
- Trước hết kiểm tra giá trị ở gốc (`tree[1]`). Nếu `tree[1] < r`, chắc chắn không có khách sạn nào đủ phòng $\rightarrow$ trả về `0`.
- Ngược lại, ta đi xuống từ gốc (**Segment Tree Walk**): tại mỗi nút, ưu tiên rẽ sang **con trái** nếu `tree[left] >= r`, ngược lại mới rẽ sang **con phải**.

**Gợi ý 3:**
- Khi xuống đến lá tương ứng với khách sạn `idx`, in ra `idx`, trừ `r` trực tiếp tại lá đó rồi cập nhật lại giá trị `max` trên đường đi lên gốc.
- Mỗi truy vấn chỉ rẽ một nhánh từ gốc xuống lá nên độ phức tạp đúng $O(\log N)$ — hoàn toàn không cần lồng thêm tìm kiếm nhị phân bên ngoài ($O(\log^2 N)$)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    int sz = 1;
    while (sz < n) sz <<= 1;

    vector<long long> tree(2 * sz, -1);
    for (int i = 0; i < n; ++i) {
        cin >> tree[sz + i];
    }
    for (int i = sz - 1; i >= 1; --i) {
        tree[i] = max(tree[i << 1], tree[i << 1 | 1]);
    }

    for (int qi = 0; qi < q; ++qi) {
        long long req;
        cin >> req;
        if (qi > 0) cout << ' ';
        if (tree[1] < req) {
            cout << 0;
            continue;
        }
        int idx = 1;
        while (idx < sz) {
            int left = idx << 1;
            idx = (tree[left] >= req) ? left : (left | 1);
        }
        cout << (idx - sz + 1);
        tree[idx] -= req;
        for (idx >>= 1; idx >= 1; idx >>= 1) {
            tree[idx] = max(tree[idx << 1], tree[idx << 1 | 1]);
        }
    }
    cout << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    sz = 1
    while sz < n:
        sz <<= 1

    tree = [-1] * (2 * sz)
    for i in range(n):
        tree[sz + i] = int(next(it))
    for i in range(sz - 1, 0, -1):
        lv = tree[i << 1]
        rv = tree[i << 1 | 1]
        tree[i] = lv if lv >= rv else rv

    out = []
    for _ in range(q):
        req = int(next(it))
        if tree[1] < req:
            out.append("0")
            continue
        idx = 1
        while idx < sz:
            left = idx << 1
            idx = left if tree[left] >= req else (left | 1)
        out.append(str(idx - sz + 1))
        tree[idx] -= req
        idx >>= 1
        while idx:
            lv = tree[idx << 1]
            rv = tree[idx << 1 | 1]
            tree[idx] = lv if lv >= rv else rv
            idx >>= 1

    sys.stdout.write(" ".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-segtree-hotel-first-geq",
        "title": "Phân bổ phòng khách sạn (Segment Tree Walk)",
        "shortDescription": "Dùng kỹ thuật đi trên cây phân đoạn (Segment Tree Walk) để tìm chỉ số nhỏ nhất có giá trị >= r và trừ trực tiếp trong O(log N).",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.segment_tree",
        "tags": ["segment tree", "tìm kiếm nhị phân", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + Q log N) bằng Segment Tree Walk.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp15-segtree-lazy-add-sum (hard, algo.segment_tree)
# ============================================================================

def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            l, r, v = toks[idx + 1], toks[idx + 2], toks[idx + 3]
            for i in range(l, r + 1):
                a[i] += v
            idx += 4
        else:
            l, r = toks[idx + 1], toks[idx + 2]
            out.append(str(sum(a[l:r + 1])))
            idx += 3
    return "\n".join(out)


def build_p07() -> dict:
    rng = random.Random(1507)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [1, 2, 3, 4, 5],
                [(2, 1, 5), (1, 2, 4, 3), (2, 1, 5), (1, 1, 3, -2), (2, 2, 4)],
            ),
            "hidden": False,
            "expected": "15\n24\n14",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-10, 0, 10, -20],
                [(1, 1, 4, 5), (2, 1, 2), (1, 2, 3, -10), (2, 1, 4)],
            ),
            "hidden": False,
            "expected": "0\n-20",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1000000000, 1000000000, 1000000000],
                [(1, 1, 3, 1000000000), (2, 1, 3), (1, 2, 2, -2000000000), (2, 1, 3)],
            ),
            "hidden": False,
            "expected": "6000000000\n4000000000",
            "checkBrute": True,
        },
        # 5 corner / overflow tests
        {
            "input": fmt_arr_queries_nq(
                [0],
                [(1, 1, 1, 10**9), (2, 1, 1), (1, 1, 1, -10**9), (2, 1, 1), (1, 1, 1, -10**9), (2, 1, 1)],
            ),
            "hidden": True,
            "expected": "1000000000\n0\n-1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10**9] * 10,
                [(1, 1, 10, 10**9) for _ in range(5)] + [(2, 1, 10), (1, 3, 7, -10**9), (2, 1, 10)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1, 2, 3, 4, 5, 6, 7],
                [(1, 1, 7, 0), (1, 2, 6, 5), (1, 3, 5, -5), (2, 1, 7), (2, 3, 5), (2, 2, 2)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-10**9] * 8,
                [(1, 1, 4, 10**9), (1, 5, 8, -10**9), (2, 1, 4), (2, 5, 8), (2, 1, 8)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-500, 500) for _ in range(40)],
                [
                    (1, *sorted((rng.randint(1, 40), rng.randint(1, 40))), rng.randint(-500, 500))
                    if i % 2 == 0 else
                    (2, *sorted((rng.randint(1, 40), rng.randint(1, 40))))
                    for i in range(60)
                ] + [(2, 1, 40)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    q9 = []
    for i in range(600):
        l, r = sorted((rng.randint(1, 400), rng.randint(1, 400)))
        if i % 2 == 0:
            q9.append((1, l, r, rng.randint(-10**9, 10**9)))
        else:
            q9.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(400)], q9),
        "hidden": True,
        "checkBrute": True,
    })

    q10 = []
    for i in range(2500):
        l, r = sorted((rng.randint(1, 2000), rng.randint(1, 2000)))
        if i % 2 == 0:
            q10.append((1, l, r, rng.randint(-10**6, 10**6)))
        else:
            q10.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**6, 10**6) for _ in range(2000)], q10),
        "hidden": True,
    })

    # Test 11: Overflow stress N=5000, Q=5000 with 10^9 values
    q11 = []
    for i in range(5000):
        l, r = sorted((rng.randint(1, 5000), rng.randint(1, 5000)))
        if i % 2 == 0:
            q11.append((1, l, r, rng.choice([10**9, -10**9])))
        else:
            q11.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.choice([10**9, -10**9]) for _ in range(5000)], q11),
        "hidden": True,
    })

    # Test 12: Full-range add + full-range sum N=10000, Q=6000
    q12 = []
    for i in range(6000):
        if i % 2 == 0:
            q12.append((1, 1, 10000, 100000 if i % 4 == 0 else -50000))
        else:
            q12.append((2, 1, 10000))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10000, 10000) for _ in range(10000)], q12),
        "hidden": True,
    })

    # Test 13: Power-of-2 boundary N=8192, Q=6000
    q13 = []
    for i in range(6000):
        l, r = sorted((rng.randint(1, 8192), rng.randint(1, 8192)))
        if i % 2 == 0:
            q13.append((1, l, r, rng.randint(-9999, 9999)))
        else:
            q13.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-9999, 9999) for _ in range(8192)], q13),
        "hidden": True,
    })

    # Test 14: N=12000, Q=6000
    q14 = []
    for i in range(6000):
        l, r = sorted((rng.randint(1, 12000), rng.randint(1, 12000)))
        if i % 3 != 0:
            q14.append((1, l, r, rng.randint(-999, 999)))
        else:
            q14.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-999, 999) for _ in range(12000)], q14),
        "hidden": True,
    })

    # Test 15: Max N=15000, Q=5000
    q15 = []
    for i in range(5000):
        l, r = sorted((rng.randint(1, 15000), rng.randint(1, 15000)))
        if i % 2 == 0:
            q15.append((1, l, r, rng.randint(-99, 99)))
        else:
            q15.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(15000)], q15),
        "hidden": True,
    })

    # Test 16: Max N=15000, Q=5500 alternating wide updates & queries
    q16 = []
    for i in range(5500):
        l = rng.randint(1, 3000)
        r = rng.randint(12000, 15000)
        if i % 2 == 0:
            q16.append((1, l, r, rng.randint(-99, 99)))
        else:
            q16.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(15000)], q16),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 40)
        arr = [rng.randint(-1000, 1000) for _ in range(n)]
        qs = []
        for _ in range(qcnt - 1):
            l, r = sorted((rng.randint(1, n), rng.randint(1, n)))
            if rng.random() < 0.5:
                qs.append((1, l, r, rng.randint(-1000, 1000)))
            else:
                qs.append((2, l, r))
        qs.append((2, 1, n))
        extra_stress.append(fmt_arr_queries_nq(arr, qs))

    statement = r"""Cho một mảng số nguyên gồm $N$ phần tử $a_1, a_2, \dots, a_N$. Bạn cần thực hiện tuần tự $Q$ truy vấn thuộc hai loại:
- `1 l r v`: cộng thêm giá trị $v$ vào **mọi** phần tử trong đoạn $[l, r]$ ($a_i \leftarrow a_i + v$ với mọi $l \le i \le r$).
- `2 l r`: tính tổng các phần tử trong đoạn $[l, r]$ ($\sum_{i=l}^{r} a_i$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng mô tả một truy vấn:
  - `1 l r v` ($1 \le l \le r \le N$, $|v| \le 10^9$)
  - `2 l r` ($1 \le l \le r \le N$)

### Kết quả
- Với mỗi truy vấn loại `2`, in ra một số nguyên trên một dòng là tổng đoạn $[l, r]$.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $|a_i|, |v| \le 10^9$
- Đảm bảo có ít nhất một truy vấn loại `2`.

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Mảng ban đầu $[1, 2, 3, 4, 5]$:
1. `2 1 5`: tổng bằng $1 + 2 + 3 + 4 + 5 = 15$.
2. `1 2 4 3`: cộng $3$ vào đoạn $[2, 4]$, mảng thành $[1, 5, 6, 7, 5]$.
3. `2 1 5`: tổng bằng $1 + 5 + 6 + 7 + 5 = 24$.
4. `1 1 3 -2`: cộng $-2$ vào đoạn $[1, 3]$, mảng thành $[-1, 3, 4, 7, 5]$.
5. `2 2 4`: tổng đoạn $[2, 4]$ là $3 + 4 + 7 = 14$."""

    hints = r"""**Gợi ý 1:**
Cả hai thao tác cập nhật và truy vấn đều tác động lên **đoạn** $[l, r]$. Nếu đi xuống tận từng lá khi cộng đoạn, mỗi thao tác vẫn mất $O(N)$. Ta cần kỹ thuật **Cập nhật lười (Lazy Propagation)** trên Segment Tree.

**Gợi ý 2:**
Mỗi nút quản lý đoạn $[L, R]$ lưu hai giá trị:
- `sum[id]`: tổng hiện tại của đoạn $[L, R]$.
- `lazy[id]`: lượng cộng thêm đang được "giữ lại" ở nút `id` chưa đẩy xuống hai nút con.

Khi cả đoạn $[L, R]$ nằm gọn trong $[l, r]$ cần cộng thêm $v$, ta chỉ cập nhật `sum[id] += v * (R - L + 1)` và `lazy[id] += v` rồi dừng lại.

**Gợi ý 3:**
- Trước khi đi xuống hai con của nút `id` (cả khi cập nhật lẫn khi truy vấn), hãy viết hàm `push(id, L, R)` đẩy `lazy[id]` xuống `2*id` và `2*id + 1`, đồng thời đặt lại `lazy[id] = 0`.
- Tổng có thể lên đến $15\,000 \times 15\,000 \times 10^9 \approx 2.25 \times 10^{17}$, vẫn nằm gọn trong `long long` 64-bit có dấu (tối đa $\approx 9.22 \times 10^{18}$), nhưng chắc chắn tràn `int` 32-bit."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<long long> a(n + 1);
    for (int i = 1; i <= n; ++i) cin >> a[i];

    vector<long long> tree(4 * n + 4, 0), lazy(4 * n + 4, 0);

    function<void(int, int, int)> build = [&](int id, int l, int r) {
        if (l == r) {
            tree[id] = a[l];
            return;
        }
        int mid = (l + r) >> 1;
        build(id << 1, l, mid);
        build(id << 1 | 1, mid + 1, r);
        tree[id] = tree[id << 1] + tree[id << 1 | 1];
    };

    auto push = [&](int id, int l, int r) {
        if (lazy[id] == 0) return;
        int mid = (l + r) >> 1;
        long long v = lazy[id];
        tree[id << 1] += v * (mid - l + 1);
        lazy[id << 1] += v;
        tree[id << 1 | 1] += v * (r - mid);
        lazy[id << 1 | 1] += v;
        lazy[id] = 0;
    };

    function<void(int, int, int, int, int, long long)> update =
        [&](int id, int l, int r, int ql, int qr, long long val) {
            if (ql <= l && r <= qr) {
                tree[id] += val * (r - l + 1);
                lazy[id] += val;
                return;
            }
            push(id, l, r);
            int mid = (l + r) >> 1;
            if (ql <= mid) update(id << 1, l, mid, ql, qr, val);
            if (qr > mid) update(id << 1 | 1, mid + 1, r, ql, qr, val);
            tree[id] = tree[id << 1] + tree[id << 1 | 1];
        };

    function<long long(int, int, int, int, int)> query =
        [&](int id, int l, int r, int ql, int qr) -> long long {
            if (ql <= l && r <= qr) return tree[id];
            push(id, l, r);
            int mid = (l + r) >> 1;
            long long res = 0;
            if (ql <= mid) res += query(id << 1, l, mid, ql, qr);
            if (qr > mid) res += query(id << 1 | 1, mid + 1, r, ql, qr);
            return res;
        };

    build(1, 1, n);
    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int l, r;
            long long v;
            cin >> l >> r >> v;
            update(1, 1, n, l, r, v);
        } else {
            int l, r;
            cin >> l >> r;
            cout << query(1, 1, n, l, r) << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    sz = 1
    while sz < n:
        sz <<= 1
    h = sz.bit_length() - 1

    tree = [0] * (2 * sz)
    lazy = [0] * sz
    seg_len = [0] * (2 * sz)
    for p in range(1, 2 * sz):
        seg_len[p] = sz >> (p.bit_length() - 1)

    for i in range(n):
        tree[sz + i] = int(next(it))
    for i in range(sz - 1, 0, -1):
        tree[i] = tree[i << 1] + tree[i << 1 | 1]

    def push_path(p: int) -> None:
        for s in range(h, 0, -1):
            i = p >> s
            v = lazy[i]
            if v:
                lazy[i] = 0
                lc = i << 1
                rc = lc | 1
                clen = seg_len[lc]
                add_val = v * clen
                tree[lc] += add_val
                tree[rc] += add_val
                if lc < sz:
                    lazy[lc] += v
                    lazy[rc] += v

    def pull_path(p: int) -> None:
        p >>= 1
        while p:
            tree[p] = tree[p << 1] + tree[p << 1 | 1] + lazy[p] * seg_len[p]
            p >>= 1

    out = []
    for _ in range(q):
        t = int(next(it))
        if t == 1:
            l0 = int(next(it)) - 1 + sz
            r0 = int(next(it)) + sz
            v = int(next(it))
            push_path(l0)
            push_path(r0 - 1)
            l, r = l0, r0
            while l < r:
                if l & 1:
                    tree[l] += v * seg_len[l]
                    if l < sz:
                        lazy[l] += v
                    l += 1
                if r & 1:
                    r -= 1
                    tree[r] += v * seg_len[r]
                    if r < sz:
                        lazy[r] += v
                l >>= 1
                r >>= 1
            pull_path(l0)
            pull_path(r0 - 1)
        else:
            l = int(next(it)) - 1 + sz
            r = int(next(it)) + sz
            push_path(l)
            push_path(r - 1)
            res = 0
            while l < r:
                if l & 1:
                    res += tree[l]
                    l += 1
                if r & 1:
                    r -= 1
                    res += tree[r]
                l >>= 1
                r >>= 1
            out.append(str(res))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-segtree-lazy-add-sum",
        "title": "Cộng đoạn và tổng đoạn (Lazy Segment Tree)",
        "shortDescription": "Áp dụng Lazy Propagation trên Segment Tree để cộng thêm v vào đoạn [l, r] và tính tổng đoạn [l, r] trong O(log N).",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.segment_tree",
        "tags": ["segment tree", "lazy propagation", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + Q log N) bằng Lazy Segment Tree.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp15-segtree-lazy-assign-max (hard, algo.segment_tree)
# ============================================================================

def brute_p08(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            l, r, v = toks[idx + 1], toks[idx + 2], toks[idx + 3]
            for i in range(l, r + 1):
                a[i] = v
            idx += 4
        else:
            l, r = toks[idx + 1], toks[idx + 2]
            out.append(str(max(a[l:r + 1])))
            idx += 3
    return "\n".join(out)


def build_p08() -> dict:
    rng = random.Random(1508)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [-5, 3, -2, 8, -1],
                [(2, 1, 5), (1, 2, 4, 0), (2, 1, 5), (1, 1, 5, -10), (2, 1, 5), (1, 3, 3, -4), (2, 2, 4)],
            ),
            "hidden": False,
            "expected": "8\n0\n-10\n-4",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10, 20, 30, 40],
                [(1, 1, 3, -5), (2, 1, 3), (2, 1, 4), (1, 2, 4, 0), (2, 1, 4)],
            ),
            "hidden": False,
            "expected": "-5\n40\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-1000000000, -1000000000],
                [(2, 1, 2), (1, 1, 2, 1000000000), (2, 1, 2), (1, 1, 1, 0), (2, 1, 1)],
            ),
            "hidden": False,
            "expected": "-1000000000\n1000000000\n0",
            "checkBrute": True,
        },
        # 5 corner cases specifically testing assign 0 & negative overwrite
        {
            "input": fmt_arr_queries_nq(
                [100],
                [(1, 1, 1, 0), (2, 1, 1), (1, 1, 1, -10**9), (2, 1, 1)],
            ),
            "hidden": True,
            "expected": "0\n-1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [5, 6, 7, 8, 9, 10],
                [(1, 1, 6, -1), (2, 1, 6), (1, 2, 5, 0), (2, 1, 6), (1, 2, 5, -2), (2, 1, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-50, -40, -30, -20, -10],
                [(1, 1, 5, 100), (1, 1, 4, -5), (1, 5, 5, -6), (2, 1, 5), (2, 4, 5)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [0] * 12,
                [(1, 1, 12, -100), (1, 4, 8, 0), (2, 1, 3), (2, 1, 12), (1, 1, 12, -200), (2, 5, 9)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-100, 100) for _ in range(40)],
                [
                    (1, *sorted((rng.randint(1, 40), rng.randint(1, 40))), rng.choice([0, -50, rng.randint(-100, 100)]))
                    if i % 2 == 0 else
                    (2, *sorted((rng.randint(1, 40), rng.randint(1, 40))))
                    for i in range(65)
                ] + [(2, 1, 40)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    q9 = []
    for i in range(600):
        l, r = sorted((rng.randint(1, 400), rng.randint(1, 400)))
        if i % 2 == 0:
            q9.append((1, l, r, rng.choice([0, rng.randint(-10**9, 10**9)])))
        else:
            q9.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(400)], q9),
        "hidden": True,
        "checkBrute": True,
    })

    q10 = []
    for i in range(2500):
        l, r = sorted((rng.randint(1, 2000), rng.randint(1, 2000)))
        if i % 2 == 0:
            q10.append((1, l, r, rng.randint(-10**6, 10**6)))
        else:
            q10.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**6, 10**6) for _ in range(2000)], q10),
        "hidden": True,
    })

    # Test 11: Full 10^9 negative and zero assignments N=5000, Q=5000
    q11 = []
    for i in range(5000):
        l, r = sorted((rng.randint(1, 5000), rng.randint(1, 5000)))
        if i % 2 == 0:
            q11.append((1, l, r, rng.choice([0, -10**9, 10**9, -1])))
        else:
            q11.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10**9, 10**9) for _ in range(5000)], q11),
        "hidden": True,
    })

    # Test 12: Nested overwrites on N=10000, Q=6000
    q12 = []
    for i in range(6000):
        if i % 2 == 0:
            l = 1 + (i % 4000)
            r = 10000 - (i % 4000)
            if l > r:
                l, r = r, l
            q12.append((1, l, r, 0 if i % 6 == 0 else -rng.randint(1, 10000)))
        else:
            q12.append((2, *sorted((rng.randint(1, 10000), rng.randint(1, 10000)))))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-10000, 10000) for _ in range(10000)], q12),
        "hidden": True,
    })

    # Test 13: Power-of-2 boundary N=8192, Q=6000
    q13 = []
    for i in range(6000):
        l, r = sorted((rng.randint(1, 8192), rng.randint(1, 8192)))
        if i % 2 == 0:
            q13.append((1, l, r, rng.randint(-9999, 9999)))
        else:
            q13.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-9999, 9999) for _ in range(8192)], q13),
        "hidden": True,
    })

    # Test 14: N=12000, Q=6000
    q14 = []
    for i in range(6000):
        l, r = sorted((rng.randint(1, 12000), rng.randint(1, 12000)))
        if i % 3 != 0:
            q14.append((1, l, r, rng.randint(-999, 999)))
        else:
            q14.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-999, 999) for _ in range(12000)], q14),
        "hidden": True,
    })

    # Test 15: Max N=15000, Q=5000
    q15 = []
    for i in range(5000):
        l, r = sorted((rng.randint(1, 15000), rng.randint(1, 15000)))
        if i % 2 == 0:
            q15.append((1, l, r, rng.randint(-99, 99)))
        else:
            q15.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, 99) for _ in range(15000)], q15),
        "hidden": True,
    })

    # Test 16: Max N=15000, Q=5500 all negative overwrites
    q16 = []
    for i in range(5500):
        l, r = sorted((rng.randint(1, 15000), rng.randint(1, 15000)))
        if i % 2 == 0:
            q16.append((1, l, r, rng.randint(-99, 0)))
        else:
            q16.append((2, l, r))
    tests.append({
        "input": fmt_arr_queries_nq([rng.randint(-99, -1) for _ in range(15000)], q16),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 40)
        arr = [rng.randint(-50, 50) for _ in range(n)]
        qs = []
        for _ in range(qcnt - 1):
            l, r = sorted((rng.randint(1, n), rng.randint(1, n)))
            if rng.random() < 0.5:
                qs.append((1, l, r, rng.choice([0, rng.randint(-50, 50)])))
            else:
                qs.append((2, l, r))
        qs.append((2, 1, n))
        extra_stress.append(fmt_arr_queries_nq(arr, qs))

    statement = r"""Cho một dãy số nguyên gồm $N$ phần tử $a_1, a_2, \dots, a_N$. Bạn cần thực hiện tuần tự $Q$ truy vấn thuộc hai loại:
- `1 l r v`: **gán** toàn bộ các phần tử trong đoạn $[l, r]$ bằng giá trị $v$ ($a_i \leftarrow v$ với mọi $l \le i \le r$). Giá trị $v$ có thể âm, bằng $0$, hoặc dương.
- `2 l r`: tìm giá trị **lớn nhất** trên đoạn $[l, r]$ ($\max_{l \le i \le r} a_i$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng mô tả một truy vấn:
  - `1 l r v` ($1 \le l \le r \le N$, $|v| \le 10^9$)
  - `2 l r` ($1 \le l \le r \le N$)

### Kết quả
- Với mỗi truy vấn loại `2`, in ra một số nguyên trên một dòng là giá trị lớn nhất trên đoạn $[l, r]$.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $|a_i|, |v| \le 10^9$
- Đảm bảo có ít nhất một truy vấn loại `2`.

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với ví dụ đầu tiên, mảng ban đầu là $[-5, 3, -2, 8, -1]$:
1. `2 1 5`: giá trị lớn nhất là $8$.
2. `1 2 4 0`: gán đoạn $[2, 4]$ thành $0$, mảng thành $[-5, 0, 0, 0, -1]$.
3. `2 1 5`: giá trị lớn nhất lúc này là $0$.
4. `1 1 5 -10`: toàn bộ mảng thành $[-10, -10, -10, -10, -10]$, nên `2 1 5` trả về $-10$.
5. `1 3 3 -4`: mảng thành $[-10, -10, -4, -10, -10]$, nên `2 2 4` trả về $-4$."""

    hints = r"""**Gợi ý 1:**
Đây là bài toán **gán đoạn + tìm Max đoạn**, dùng Segment Tree với **Lazy Propagation**. Khi gán toàn bộ một đoạn bằng $v$, giá trị lớn nhất của đoạn đó lập tức bằng $v$, và nhãn lười cũ ở nút đó (nếu có) bị **ghi đè** hoàn toàn bởi $v$.

**Gợi ý 2:**
Bẫy cực kỳ phổ biến: Nếu bạn kiểm tra `if (lazy[id] != 0)` để biết nút có nhãn lười hay không, trường hợp gán `1 l r 0` (gán cả đoạn thành $0$) sẽ **không bao giờ được đẩy xuống**!

**Gợi ý 3:**
- Hãy dùng thêm một mảng cờ boolean riêng biệt `hasLazy[id]` (hoặc giá trị `None` trong Python): khi gán, đặt `hasLazy[id] = true`, `lazy[id] = v`, `tree[id] = v`. Khi `push`, chỉ đẩy nếu `hasLazy[id] == true`, sau đó đặt `hasLazy[id] = false`.
- Khi truy vấn `max`, giá trị trung hòa khởi tạo phải là $-\infty$ (nhỏ hơn $-10^9$, ví dụ `-4e18`), tuyệt đối không dùng `0` vì kết quả có thể âm."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<long long> a(n + 1);
    for (int i = 1; i <= n; ++i) cin >> a[i];

    const long long NEG_INF = -(long long)4e18;
    vector<long long> tree(4 * n + 4, NEG_INF), lazy(4 * n + 4, 0);
    vector<char> hasLazy(4 * n + 4, 0);

    function<void(int, int, int)> build = [&](int id, int l, int r) {
        if (l == r) {
            tree[id] = a[l];
            return;
        }
        int mid = (l + r) >> 1;
        build(id << 1, l, mid);
        build(id << 1 | 1, mid + 1, r);
        tree[id] = max(tree[id << 1], tree[id << 1 | 1]);
    };

    auto push = [&](int id) {
        if (!hasLazy[id]) return;
        long long v = lazy[id];
        tree[id << 1] = v;
        lazy[id << 1] = v;
        hasLazy[id << 1] = 1;
        tree[id << 1 | 1] = v;
        lazy[id << 1 | 1] = v;
        hasLazy[id << 1 | 1] = 1;
        hasLazy[id] = 0;
    };

    function<void(int, int, int, int, int, long long)> update =
        [&](int id, int l, int r, int ql, int qr, long long val) {
            if (ql <= l && r <= qr) {
                tree[id] = val;
                lazy[id] = val;
                hasLazy[id] = 1;
                return;
            }
            push(id);
            int mid = (l + r) >> 1;
            if (ql <= mid) update(id << 1, l, mid, ql, qr, val);
            if (qr > mid) update(id << 1 | 1, mid + 1, r, ql, qr, val);
            tree[id] = max(tree[id << 1], tree[id << 1 | 1]);
        };

    function<long long(int, int, int, int, int)> query =
        [&](int id, int l, int r, int ql, int qr) -> long long {
            if (ql <= l && r <= qr) return tree[id];
            push(id);
            int mid = (l + r) >> 1;
            long long res = NEG_INF;
            if (ql <= mid) res = max(res, query(id << 1, l, mid, ql, qr));
            if (qr > mid) res = max(res, query(id << 1 | 1, mid + 1, r, ql, qr));
            return res;
        };

    build(1, 1, n);
    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int l, r;
            long long v;
            cin >> l >> r >> v;
            update(1, 1, n, l, r, v);
        } else {
            int l, r;
            cin >> l >> r;
            cout << query(1, 1, n, l, r) << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    sz = 1
    while sz < n:
        sz <<= 1
    h = sz.bit_length() - 1

    NEG_INF = -4 * 10**18
    tree = [NEG_INF] * (2 * sz)
    lazy = [0] * sz
    has_lazy = bytearray(sz)

    for i in range(n):
        tree[sz + i] = int(next(it))
    for i in range(sz - 1, 0, -1):
        lv = tree[i << 1]
        rv = tree[i << 1 | 1]
        tree[i] = lv if lv >= rv else rv

    def push_path(p: int) -> None:
        for s in range(h, 0, -1):
            i = p >> s
            if has_lazy[i]:
                has_lazy[i] = 0
                v = lazy[i]
                lc = i << 1
                rc = lc | 1
                tree[lc] = v
                tree[rc] = v
                if lc < sz:
                    has_lazy[lc] = 1
                    has_lazy[rc] = 1
                    lazy[lc] = v
                    lazy[rc] = v

    def pull_path(p: int) -> None:
        p >>= 1
        while p:
            if has_lazy[p]:
                tree[p] = lazy[p]
            else:
                lv = tree[p << 1]
                rv = tree[p << 1 | 1]
                tree[p] = lv if lv >= rv else rv
            p >>= 1

    out = []
    for _ in range(q):
        t = int(next(it))
        if t == 1:
            l0 = int(next(it)) - 1 + sz
            r0 = int(next(it)) + sz
            v = int(next(it))
            push_path(l0)
            push_path(r0 - 1)
            l, r = l0, r0
            while l < r:
                if l & 1:
                    tree[l] = v
                    if l < sz:
                        has_lazy[l] = 1
                        lazy[l] = v
                    l += 1
                if r & 1:
                    r -= 1
                    tree[r] = v
                    if r < sz:
                        has_lazy[r] = 1
                        lazy[r] = v
                l >>= 1
                r >>= 1
            pull_path(l0)
            pull_path(r0 - 1)
        else:
            l = int(next(it)) - 1 + sz
            r = int(next(it)) + sz
            push_path(l)
            push_path(r - 1)
            res = NEG_INF
            while l < r:
                if l & 1:
                    if tree[l] > res:
                        res = tree[l]
                    l += 1
                if r & 1:
                    r -= 1
                    if tree[r] > res:
                        res = tree[r]
                l >>= 1
                r >>= 1
            out.append(str(res))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-segtree-lazy-assign-max",
        "title": "Gán đoạn và Max đoạn (Lazy Segment Tree)",
        "shortDescription": "Cài đặt Lazy Segment Tree hỗ trợ gán cả đoạn [l, r] thành v (kể cả 0 và số âm) và tìm giá trị lớn nhất trên đoạn.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.segment_tree",
        "tags": ["segment tree", "lazy propagation", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + Q log N) bằng Lazy Segment Tree với cờ has_lazy riêng biệt.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp15-segtree-max-subarray-updates (hard, algo.segment_tree)
# ============================================================================

def brute_p09(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        pos, val = toks[idx], toks[idx + 1]
        idx += 2
        a[pos] = val
        best = 0
        cur = 0
        for i in range(1, n + 1):
            cur = max(0, cur + a[i])
            if cur > best:
                best = cur
        out.append(str(best))
    return "\n".join(out)


def build_p09() -> dict:
    rng = random.Random(1509)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [1, 2, -3, 5, -1],
                [(4, -3), (3, 4), (2, -10)],
            ),
            "hidden": False,
            "expected": "3\n7\n5",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-5, -2, -8],
                [(2, 0), (2, 10), (2, -1)],
            ),
            "hidden": False,
            "expected": "0\n10\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1000000000, -1, 1000000000],
                [(2, 1000000000), (2, -2000000000), (1, -1000000000)],
            ),
            "hidden": False,
            "expected": "3000000000\n1000000000\n1000000000",
            "checkBrute": True,
        },
        # 5 corner / overflow tests
        {
            "input": fmt_arr_queries_nq(
                [-100],
                [(1, -1), (1, 0), (1, 50), (1, -10**9)],
            ),
            "hidden": True,
            "expected": "0\n0\n50\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10**9, 10**9, -10**9, 10**9, 10**9],
                [(3, 10**9), (3, -10**9), (3, 0), (1, -10**9), (5, -10**9)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [5, -3, 5, -3, 5, -3, 5],
                [(2, -10), (4, -10), (6, -10), (4, 10)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-1] * 16,
                [(1, 10), (16, 10), (8, 5), (2, 20), (1, -100)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-50, 50) for _ in range(40)],
                [(rng.randint(1, 40), rng.randint(-50, 50)) for _ in range(70)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-10**9, 10**9) for _ in range(400)],
            [(rng.randint(1, 400), rng.randint(-10**9, 10**9)) for _ in range(600)],
        ),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-10**6, 10**6) for _ in range(2000)],
            [(rng.randint(1, 2000), rng.randint(-10**6, 10**6)) for _ in range(3000)],
        ),
        "hidden": True,
    })
    # Test 11: 64-bit sum overflow stress N=5000, Q=5000
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.choice([10**9, -10**9, 5 * 10**8]) for _ in range(5000)],
            [(rng.randint(1, 5000), rng.choice([10**9, -10**9])) for _ in range(5000)],
        ),
        "hidden": True,
    })
    # Test 12: Bridge toggling on N=10000, Q=8000
    tests.append({
        "input": fmt_arr_queries_nq(
            [1000 if i % 2 == 0 else -1500 for i in range(10000)],
            [(rng.randint(1, 10000), rng.choice([2000, -3000])) for _ in range(8000)],
        ),
        "hidden": True,
    })
    # Test 13: Power-of-2 N=8192, Q=8000
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-9999, 9999) for _ in range(8192)],
            [(rng.randint(1, 8192), rng.randint(-9999, 9999)) for _ in range(8000)],
        ),
        "hidden": True,
    })
    # Test 14: N=12000, Q=8000
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-999, 999) for _ in range(12000)],
            [(rng.randint(1, 12000), rng.randint(-999, 999)) for _ in range(8000)],
        ),
        "hidden": True,
    })
    # Test 15: Max N=15000, Q=8000
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-999, 999) for _ in range(15000)],
            [(rng.randint(1, 15000), rng.randint(-999, 999)) for _ in range(8000)],
        ),
        "hidden": True,
    })
    # Test 16: Max N=15000, Q=7000 mostly negative toggling positive
    tests.append({
        "input": fmt_arr_queries_nq(
            [-rng.randint(1, 99) for _ in range(15000)],
            [(rng.randint(1, 15000), rng.randint(-99, 99)) for _ in range(7000)],
        ),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 40)
        extra_stress.append(fmt_arr_queries_nq(
            [rng.randint(-50, 50) for _ in range(n)],
            [(rng.randint(1, n), rng.randint(-50, 50)) for _ in range(qcnt)],
        ))

    tests[0]["expected"] = "3\n7\n4"

    statement = r"""Cho một dãy số nguyên gồm $N$ phần tử $a_1, a_2, \dots, a_N$. Có $Q$ lượt cập nhật xảy ra tuần tự; mỗi lượt cho hai số `pos val` yêu cầu gán $a_{\text{pos}} \leftarrow \text{val}$.

Ngay sau **mỗi** lần cập nhật, hãy tìm **tổng lớn nhất của một đoạn con liên tiếp** trên toàn bộ mảng (được phép chọn đoạn con rỗng có tổng bằng $0$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên `pos val` ($1 \le \text{pos} \le N$, $|\text{val}| \le 10^9$).

### Kết quả
- Gồm $Q$ dòng: dòng thứ $j$ in ra tổng đoạn con liên tiếp lớn nhất của toàn mảng sau lần cập nhật thứ $j$.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $|a_i|, |\text{val}| \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với ví dụ đầu tiên, mảng ban đầu là $[1, 2, -3, 5, -1]$:
1. Cập nhật `4 -3` $\rightarrow$ $[1, 2, -3, -3, -1]$: đoạn con tốt nhất là $[1, 2]$ có tổng $3$.
2. Cập nhật `3 4` $\rightarrow$ $[1, 2, 4, -3, -1]$: đoạn con tốt nhất là $[1, 2, 4]$ có tổng $7$.
3. Cập nhật `2 -10` $\rightarrow$ $[1, -10, 4, -3, -1]$: đoạn con tốt nhất là $[4]$ có tổng $4$.
Với ví dụ thứ hai, khi toàn mảng toàn số âm hoặc không dương, ta chọn đoạn con rỗng nên kết quả là $0$."""

    hints = r"""**Gợi ý 1:**
Thuật toán Kadane tính tổng đoạn con lớn nhất trong $O(N)$, nhưng nếu chạy lại Kadane sau mỗi lần cập nhật sẽ mất $O(QN)$. Hãy áp dụng tư tưởng **Chia để trị trên Segment Tree**: để hợp nhất hai đoạn con trái `L` và phải `R`, ta cần lưu thêm thông tin gì ở mỗi nút?

**Gợi ý 2:**
Mỗi nút trên Segment Tree lưu 4 thông số (tất cả `pref`, `suff`, `best` đều cho phép đoạn rỗng nên $\ge 0$):
- `tot`: tổng toàn bộ đoạn của nút.
- `pref`: tổng tiền tố lớn nhất của đoạn.
- `suff`: tổng hậu tố lớn nhất của đoạn.
- `best`: tổng đoạn con liên tiếp lớn nhất nằm hoàn toàn trong đoạn.

**Gợi ý 3:**
- Công thức gộp hai nút con `L` và `R`:
  - `tot = L.tot + R.tot`
  - `pref = max(L.pref, L.tot + R.pref)`
  - `suff = max(R.suff, R.tot + L.suff)`
  - `best = max({L.best, R.best, L.suff + R.pref})`
- Tại nút lá giá trị $x$: `tot = x`, `pref = suff = best = max(0LL, x)`. Sau mỗi lần cập nhật, kết quả toàn mảng chính là `best[1]` ở nút gốc."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Node {
    long long tot = 0, pref = 0, suff = 0, best = 0;
};

static inline Node mergeNode(const Node& L, const Node& R) {
    Node res;
    res.tot = L.tot + R.tot;
    res.pref = max(L.pref, L.tot + R.pref);
    res.suff = max(R.suff, R.tot + L.suff);
    res.best = max({L.best, R.best, L.suff + R.pref});
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    int sz = 1;
    while (sz < n) sz <<= 1;

    vector<Node> tree(2 * sz);
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        long long p = max(0LL, x);
        tree[sz + i] = {x, p, p, p};
    }
    for (int i = sz - 1; i >= 1; --i) {
        tree[i] = mergeNode(tree[i << 1], tree[i << 1 | 1]);
    }

    while (q--) {
        int pos;
        long long val;
        cin >> pos >> val;
        int idx = (pos - 1) + sz;
        long long p = max(0LL, val);
        tree[idx] = {val, p, p, p};
        for (idx >>= 1; idx >= 1; idx >>= 1) {
            tree[idx] = mergeNode(tree[idx << 1], tree[idx << 1 | 1]);
        }
        cout << tree[1].best << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    sz = 1
    while sz < n:
        sz <<= 1

    tot = [0] * (2 * sz)
    pref = [0] * (2 * sz)
    suff = [0] * (2 * sz)
    best = [0] * (2 * sz)

    for i in range(n):
        x = int(next(it))
        p = sz + i
        tot[p] = x
        px = x if x > 0 else 0
        pref[p] = px
        suff[p] = px
        best[p] = px

    for p in range(sz - 1, 0, -1):
        lc = p << 1
        rc = lc | 1
        lt = tot[lc]
        rt = tot[rc]
        lp = pref[lc]
        rp = pref[rc]
        ls = suff[lc]
        rs = suff[rc]
        lb = best[lc]
        rb = best[rc]
        tot[p] = lt + rt
        c1 = lt + rp
        pref[p] = lp if lp >= c1 else c1
        c2 = rt + ls
        suff[p] = rs if rs >= c2 else c2
        mid_b = ls + rp
        b = lb if lb >= rb else rb
        best[p] = b if b >= mid_b else mid_b

    out = []
    for _ in range(q):
        p = int(next(it)) - 1 + sz
        x = int(next(it))
        tot[p] = x
        px = x if x > 0 else 0
        pref[p] = px
        suff[p] = px
        best[p] = px
        p >>= 1
        while p:
            lc = p << 1
            rc = lc | 1
            lt = tot[lc]
            rt = tot[rc]
            lp = pref[lc]
            rp = pref[rc]
            ls = suff[lc]
            rs = suff[rc]
            lb = best[lc]
            rb = best[rc]
            tot[p] = lt + rt
            c1 = lt + rp
            pref[p] = lp if lp >= c1 else c1
            c2 = rt + ls
            suff[p] = rs if rs >= c2 else c2
            mid_b = ls + rp
            b = lb if lb >= rb else rb
            best[p] = b if b >= mid_b else mid_b
            p >>= 1
        out.append(str(best[1]))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-segtree-max-subarray-updates",
        "title": "Tổng đoạn con lớn nhất khi cập nhật điểm",
        "shortDescription": "Dùng Segment Tree lưu 4 thông số (tổng, tiền tố max, hậu tố max, đoạn con max) để cập nhật điểm và lấy tổng đoạn con lớn nhất toàn mảng.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.segment_tree",
        "tags": ["segment tree", "chia để trị", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + Q log N) bằng Segment Tree chia để trị.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp15-bit-offline-distinct-range (hard, algo.fenwick_bit)
# ============================================================================

def brute_p10(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2:2 + n]
    idx = 2 + n
    out = []
    for _ in range(q):
        l, r = toks[idx], toks[idx + 1]
        idx += 2
        out.append(str(len(set(a[l:r + 1]))))
    return "\n".join(out)


def build_p10() -> dict:
    rng = random.Random(1510)

    tests = [
        # 3 public samples
        {
            "input": fmt_arr_queries_nq(
                [3, 2, 3, 1, 2],
                [(1, 3), (2, 4), (1, 5), (3, 3)],
            ),
            "hidden": False,
            "expected": "2\n3\n3\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [7, 7, 7, 7, 7],
                [(1, 5), (2, 4), (3, 3)],
            ),
            "hidden": False,
            "expected": "1\n1\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-1000000000, 0, 1000000000, -1000000000, 0],
                [(1, 3), (2, 4), (1, 5), (4, 5)],
            ),
            "hidden": False,
            "expected": "3\n3\n3\n2",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_arr_queries_nq([-999999999], [(1, 1)]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [1, 2, 3, 4, 5, 6],
                [(i, j) for i in range(1, 7) for j in range(i, 7)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [10, 20, 10, 20, 10, 20],
                [(1, 2), (1, 6), (2, 5), (3, 4), (1, 1), (6, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [-10**9, 10**9, -10**9, 0, 10**9, 0],
                [(1, 4), (2, 5), (3, 6), (1, 6), (2, 3)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_arr_queries_nq(
                [rng.randint(-12, 12) for _ in range(45)],
                [tuple(sorted((rng.randint(1, 45), rng.randint(1, 45)))) for _ in range(80)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-50, 50) for _ in range(400)],
            [tuple(sorted((rng.randint(1, 400), rng.randint(1, 400)))) for _ in range(700)],
        ),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-10**9, 10**9) for _ in range(2000)],
            [tuple(sorted((rng.randint(1, 2000), rng.randint(1, 2000)))) for _ in range(3000)],
        ),
        "hidden": True,
    })
    # Test 11: Few distinct values on N=8000, Q=10000
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-20, 20) for _ in range(8000)],
            [tuple(sorted((rng.randint(1, 8000), rng.randint(1, 8000)))) for _ in range(10000)],
        ),
        "hidden": True,
    })
    # Test 12: All distinct values N=10000, Q=7000
    perm = list(range(-5000, 5000))
    rng.shuffle(perm)
    tests.append({
        "input": fmt_arr_queries_nq(
            perm,
            [tuple(sorted((rng.randint(1, 10000), rng.randint(1, 10000)))) for _ in range(7000)],
        ),
        "hidden": True,
    })
    # Test 13: Heavy nested queries on same r endpoints N=12000, Q=7000
    q13 = [(rng.randint(1, 12000), 12000) if i % 3 == 0 else tuple(sorted((rng.randint(1, 12000), rng.randint(1, 12000)))) for i in range(7000)]
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(1, 99) for _ in range(12000)],
            q13,
        ),
        "hidden": True,
    })
    # Test 14: Max N=15000, Q=7000 moderate distinct count
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(-99, 99) for _ in range(15000)],
            [tuple(sorted((rng.randint(1, 15000), rng.randint(1, 15000)))) for _ in range(7000)],
        ),
        "hidden": True,
    })
    # Test 15: Max N=15000, Q=7000 alternating blocks
    arr15 = [(i * 37) % 199 - 99 for i in range(15000)]
    tests.append({
        "input": fmt_arr_queries_nq(
            arr15,
            [tuple(sorted((rng.randint(1, 15000), rng.randint(1, 15000)))) for _ in range(7000)],
        ),
        "hidden": True,
    })
    # Test 16: Max N=15000, Q=7500
    tests.append({
        "input": fmt_arr_queries_nq(
            [rng.randint(1, 99) for _ in range(15000)],
            [tuple(sorted((rng.randint(1, 15000), rng.randint(1, 15000)))) for _ in range(7500)],
        ),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        qcnt = rng.randint(1, 45)
        extra_stress.append(fmt_arr_queries_nq(
            [rng.randint(-12, 12) for _ in range(n)],
            [tuple(sorted((rng.randint(1, n), rng.randint(1, n)))) for _ in range(qcnt)],
        ))

    statement = r"""Cho một dãy số nguyên gồm $N$ phần tử $a_1, a_2, \dots, a_N$ và $Q$ truy vấn. Mỗi truy vấn cho một cặp $(l, r)$ với $1 \le l \le r \le N$, yêu cầu đếm số lượng **giá trị phân biệt** xuất hiện trong đoạn con $a_l, a_{l+1}, \dots, a_r$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $l, r$ ($1 \le l \le r \le N$).

### Kết quả
- Gồm $Q$ dòng: dòng thứ $j$ in ra số lượng giá trị phân biệt trong đoạn $[l, r]$ của truy vấn thứ $j$.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $|a_i| \le 10^9$
- $1 \le l \le r \le N$

### Subtasks
- **Subtask 1 (30%):** $N, Q \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với ví dụ đầu tiên, dãy là $[3, 2, 3, 1, 2]$:
1. Đoạn $[1, 3]$ gồm $[3, 2, 3]$ có $2$ giá trị phân biệt là $\{2, 3\}$.
2. Đoạn $[2, 4]$ gồm $[2, 3, 1]$ có $3$ giá trị phân biệt là $\{1, 2, 3\}$.
3. Đoạn $[1, 5]$ gồm $[3, 2, 3, 1, 2]$ có $3$ giá trị phân biệt là $\{1, 2, 3\}$.
4. Đoạn $[3, 3]$ chỉ gồm $[3]$ nên có $1$ giá trị phân biệt."""

    hints = r"""**Gợi ý 1:**
Các truy vấn không làm thay đổi mảng, vì vậy ta không bắt buộc phải trả lời ngay theo thứ tự đầu vào — ta có thể xử lý **ngoại tuyến (Offline)**. Ý tưởng cốt lõi: nếu cố định đầu phải $r$, mỗi giá trị xuất hiện trong $[1, r]$ chỉ cần được tính **đúng một lần tại vị trí xuất hiện cuối cùng** của nó!

**Gợi ý 2:**
Gom tất cả truy vấn $(l, r, \text{id})$ theo đầu phải $r$ (dùng mảng danh sách `buckets[r]` hoặc sắp xếp theo $r$ tăng dần). Duyệt $i$ từ $1$ đến $N$ và duy trì một cây **Fenwick (BIT)** đánh dấu `1` tại vị trí xuất hiện gần nhất của mỗi giá trị trong $[1, i]$, các vị trí cũ hơn của cùng giá trị đó đặt bằng `0`.

**Gợi ý 3:**
- Nén tọa độ các giá trị $a_i$ về $0 \dots M-1$ (hoặc dùng bảng băm `last_pos`).
- Tại bước $i$:
  - Nếu `last_pos[a[i]] != 0`, xóa đánh dấu cũ bằng `bit.add(last_pos[a[i]], -1)`.
  - Cập nhật `last_pos[a[i]] = i` và gọi `bit.add(i, 1)`.
  - Với mọi truy vấn $(l, \text{id})$ kết thúc tại $r = i$, đáp án chính là `bit.prefix(i) - bit.prefix(l - 1)`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<int> a(n + 1);
    vector<int> vals(n);
    for (int i = 1; i <= n; ++i) {
        cin >> a[i];
        vals[i - 1] = a[i];
    }

    sort(vals.begin(), vals.end());
    vals.erase(unique(vals.begin(), vals.end()), vals.end());
    for (int i = 1; i <= n; ++i) {
        a[i] = (int)(lower_bound(vals.begin(), vals.end(), a[i]) - vals.begin());
    }

    vector<vector<pair<int, int>>> buckets(n + 1);
    for (int qi = 0; qi < q; ++qi) {
        int l, r;
        cin >> l >> r;
        buckets[r].push_back({l, qi});
    }

    vector<int> bit(n + 1, 0);
    auto add = [&](int idx, int delta) {
        for (; idx <= n; idx += idx & -idx) bit[idx] += delta;
    };
    auto prefix = [&](int idx) -> int {
        int s = 0;
        for (; idx > 0; idx -= idx & -idx) s += bit[idx];
        return s;
    };

    vector<int> lastPos(vals.size(), 0);
    vector<int> ans(q, 0);

    for (int i = 1; i <= n; ++i) {
        int v = a[i];
        if (lastPos[v] != 0) {
            add(lastPos[v], -1);
        }
        lastPos[v] = i;
        add(i, 1);

        int prefI = prefix(i);
        for (const auto& qr : buckets[i]) {
            int l = qr.first;
            int qi = qr.second;
            ans[qi] = prefI - prefix(l - 1);
        }
    }

    for (int qi = 0; qi < q; ++qi) {
        cout << ans[qi] << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))

    a = [0] + [int(next(it)) for _ in range(n)]
    buckets = [[] for _ in range(n + 1)]
    for qi in range(q):
        l = int(next(it))
        r = int(next(it))
        buckets[r].append((l, qi))

    bit = [0] * (n + 1)
    last_pos = {}
    ans = [0] * q

    for i in range(1, n + 1):
        v = a[i]
        prev = last_pos.get(v, 0)
        if prev:
            j = prev
            while j <= n:
                bit[j] -= 1
                j += j & -j
        last_pos[v] = i
        j = i
        while j <= n:
            bit[j] += 1
            j += j & -j

        if buckets[i]:
            pref_i = 0
            j = i
            while j > 0:
                pref_i += bit[j]
                j -= j & -j
            for l, qi in buckets[i]:
                pref_l = 0
                j = l - 1
                while j > 0:
                    pref_l += bit[j]
                    j -= j & -j
                ans[qi] = pref_i - pref_l

    sys.stdout.write("\n".join(map(str, ans)) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp15-bit-offline-distinct-range",
        "title": "Đếm số giá trị phân biệt trong đoạn (Offline + BIT)",
        "shortDescription": "Xử lý ngoại tuyến các truy vấn theo đầu phải r kết hợp Fenwick Tree theo vị trí xuất hiện cuối cùng để đếm giá trị phân biệt.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.fenwick_bit",
        "tags": ["bit-fenwick", "offline", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) bằng Offline Queries + Fenwick Tree.",
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
        assert p.get("brute") is not None, f"{p['slug']} missing brute oracle"
        assert p.get("extraStressInputs"), f"{p['slug']} missing extraStressInputs"
        for ti, tc in enumerate(p["tests"], 1):
            b = len(tc["input"].encode("utf-8"))
            assert b < SAFE_MAX_BYTES, (
                f"{p['slug']} test #{ti} input is {b} bytes (limit < {SAFE_MAX_BYTES})"
            )

    out_path = build_and_verify_pack(
        pack_id="15-range-queries-bit-segtree",
        title="Tầng 4: Truy vấn đoạn (BIT, Sparse Table & Segment Tree)",
        tier="Tầng 4 — Cấu trúc dữ liệu nâng cao",
        description=(
            "10 bài Cấu trúc dữ liệu truy vấn đoạn chuẩn CSES Range Queries & CF EDU: "
            "Fenwick Tree, Sparse Table O(1), Segment Tree Walk, Lazy Propagation, "
            "Max Subarray Sum động và Offline Distinct Query."
        ),
        problems=problems,
    )

    with open(out_path, "r", encoding="utf-8") as f:
        pack_data = json.load(f)
    for prob in pack_data["problems"]:
        for ti, tc in enumerate(prob["testCases"], 1):
            in_b = len(tc["input"].encode("utf-8"))
            out_b = len(tc["output"].encode("utf-8"))
            assert in_b < 150_000, f"{prob['slug']} test #{ti} input {in_b} >= 150KB"
            assert out_b < 150_000, f"{prob['slug']} test #{ti} output {out_b} >= 150KB"


if __name__ == "__main__":
    main()
