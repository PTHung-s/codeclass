"""
Builder & automated verifier for Pack 02: Prefix Sum, Difference Array, Map/Set & Sweep Line.
Generates `server/data/cp-packs/02-prefix-sum-arrays.json`.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path
from typing import List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_lib import build_and_verify_pack  # noqa: E402

REQ_HEADER = (
    "Time: 1s\n"
    "Memory: 256MB\n"
    "Nguồn: CodeClass CP Pack — Mảng cộng dồn & Map/Set\n"
)

STRICT_MAX_BYTES = 148_000  # Strictly < 150KB per test


def assert_test_sizes(slug: str, tests: list) -> None:
    for idx, tc in enumerate(tests, 1):
        b = len(tc["input"].encode("utf-8"))
        if b >= STRICT_MAX_BYTES:
            raise ValueError(f"[{slug}] test #{idx} input is {b} bytes (limit {STRICT_MAX_BYTES})")


# =============================================================================
# Problem 1: cp02-range-sum-1d
# =============================================================================
def build_p1() -> dict:
    rng = random.Random(20260201)

    def make_inp(arr: List[int], queries: List[Tuple[int, int]]) -> str:
        lines = [f"{len(arr)} {len(queries)}", " ".join(map(str, arr))]
        lines.extend(f"{l} {r}" for l, r in queries)
        return "\n".join(lines)

    def brute(inp: str) -> str:
        toks = inp.split()
        n, q = int(toks[0]), int(toks[1])
        a = [int(toks[2 + i]) for i in range(n)]
        out = []
        idx = 2 + n
        for _ in range(q):
            l, r = int(toks[idx]), int(toks[idx + 1])
            idx += 2
            out.append(str(sum(a[l - 1 : r])))
        return "\n".join(out)

    def rand_queries(n: int, q: int, wide_ratio: float = 0.0) -> List[Tuple[int, int]]:
        qs = []
        for i in range(q):
            if i == 0:
                qs.append((1, n))
            elif i == 1:
                qs.append((1, 1))
            elif i == 2:
                qs.append((n, n))
            elif wide_ratio > 0 and rng.random() < wide_ratio:
                l = rng.randint(1, max(1, n // 10))
                r = rng.randint(min(n, n - n // 10 + 1), n)
                if l > r:
                    l, r = r, l
                qs.append((l, r))
            else:
                l = rng.randint(1, n)
                r = rng.randint(1, n)
                if l > r:
                    l, r = r, l
                qs.append((l, r))
        return qs

    tests = [
        # 3 Public samples
        {
            "input": make_inp([3, -2, 5, 1, -4], [(1, 3), (2, 5), (4, 4)]),
            "hidden": False,
            "expected": "6\n0\n1",
            "checkBrute": True,
        },
        {
            "input": make_inp([10**9, 10**9, 10**9, -5 * 10**8], [(1, 4), (1, 3)]),
            "hidden": False,
            "expected": "2500000000\n3000000000",
            "checkBrute": True,
        },
        {
            "input": make_inp([-7], [(1, 1)]),
            "hidden": False,
            "expected": "-7",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([0] * 20, [(1, 20), (5, 15), (1, 1), (20, 20), (7, 7)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([-(10**9)] * 30, [(1, 30), (1, 15), (16, 30), (2, 29), (10, 10)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [10**9 if i % 2 == 0 else -(10**9) for i in range(60)],
                [(1, 60), (1, 59), (2, 60), (2, 59), (1, 1), (60, 60), (13, 48)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [rng.randint(-10**9, 10**9) for _ in range(100)],
                [(1, 1), (100, 100), (1, 100), (2, 99), (1, 50), (51, 100)]
                + rand_queries(100, 44),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests (strictly < 148KB)
        {
            "input": make_inp([rng.randint(-10**6, 10**6) for _ in range(400)], rand_queries(400, 400)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-10**9, 10**9) for _ in range(1000)], rand_queries(1000, 1000)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-10**9, 10**9) for _ in range(3000)], rand_queries(3000, 3000, 0.5)),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(9 * 10**8, 10**9) for _ in range(8000)], rand_queries(8000, 4000, 0.7)),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-(10**9), -9 * 10**8) for _ in range(8000)], rand_queries(8000, 4000, 0.7)),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-99, 99) for _ in range(15000)], rand_queries(15000, 7000, 0.8)),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-9, 9) for _ in range(20000)], rand_queries(20000, 6500, 0.8)),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-9, 9) for _ in range(30000)], rand_queries(30000, 4500, 0.85)),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-9, 9) for _ in range(5000)], rand_queries(5000, 11000, 0.7)),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-range-sum-1d", tests)

    stress = []
    for _ in range(15):
        nn = rng.randint(1, 40)
        qq = rng.randint(1, 40)
        stress.append(make_inp([rng.randint(-10**9, 10**9) for _ in range(nn)], rand_queries(nn, qq)))

    return {
        "slug": "cp02-range-sum-1d",
        "title": "Tổng đoạn trên mảng 1 chiều",
        "shortDescription": "Trả lời nhanh Q truy vấn tính tổng các phần tử trên đoạn [l, r] bằng mảng cộng dồn 1D.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.prefix_sum",
        "tags": ["mảng", "prefix sum", "truy vấn", "tầng 1"],
        "statement": r"""Một cảm biến năng lượng ghi nhận $N$ chỉ số biến thiên công suất (có thể dương, âm hoặc bằng $0$) trong $N$ phút liên tiếp: $a_1, a_2, \dots, a_N$.

Hệ thống gửi đến $Q$ truy vấn độc lập. Mỗi truy vấn gồm hai chỉ số $l$ và $r$ ($1 \le l \le r \le N$), yêu cầu tính tổng công suất tích lũy từ phút $l$ đến phút $r$:
$$S(l, r) = \sum_{i=l}^{r} a_i$$

Hãy viết chương trình trả lời toàn bộ $Q$ truy vấn trong giới hạn thời gian cho phép.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên dương $N$ và $Q$ ($1 \le N, Q \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $l, r$ ($1 \le l \le r \le N$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $j$ in ra một số nguyên duy nhất là tổng đoạn $[l_j, r_j]$ của truy vấn thứ $j$.

### Ràng buộc
- $1 \le N, Q \le 30\,000$
- $-10^9 \le a_i \le 10^9$
- $1 \le l \le r \le N$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (40%):** $N, Q \le 1\,000$.
- **Subtask 2 (60%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với mảng $[3, -2, 5, 1, -4]$:
  - Đoạn $[1, 3]$ có tổng $3 + (-2) + 5 = 6$.
  - Đoạn $[2, 5]$ có tổng $(-2) + 5 + 1 + (-4) = 0$.
  - Đoạn $[4, 4]$ chỉ gồm một phần tử $a_4 = 1$.
- Ở ví dụ 2, tổng các phần tử vượt quá giới hạn kiểu số nguyên 32-bit có dấu ($2^{31} - 1 \approx 2.14 \times 10^9$), do đó cần sử dụng kiểu số nguyên 64-bit (`long long` trong C++).
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Tổng đoạn có thể vượt quá kiểu 32-bit, cần dùng kiểu 64-bit (long long trong C++) và nhập xuất nhanh.",
        "hints": r"""**Gợi ý 1:** Nếu mỗi truy vấn đều duyệt lại từ $l$ đến $r$, độ phức tạp xấu nhất là $O(N \cdot Q) \approx 9 \times 10^8$ phép toán, có thể bị quá thời gian (TLE). Hãy tiền xử lý mảng một lần trước khi trả lời truy vấn.

**Gợi ý 2:** Xây dựng mảng cộng dồn $P$ có $N + 1$ phần tử với $P[0] = 0$ và $P[i] = a_1 + a_2 + \dots + a_i = P[i-1] + a_i$ cho mọi $1 \le i \le N$.

**Gợi ý 3:** Tổng đoạn $[l, r]$ được tính trực tiếp trong $O(1)$ bằng công thức $P[r] - P[l - 1]$. Tổng độ phức tạp là $O(N + Q)$ với kiểu dữ liệu `long long` để tránh tràn số.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;
    vector<long long> pref(n + 1, 0);
    for (int i = 1; i <= n; ++i) {
        long long x;
        cin >> x;
        pref[i] = pref[i - 1] + x;
    }
    for (int j = 0; j < q; ++j) {
        int l, r;
        cin >> l >> r;
        cout << (pref[r] - pref[l - 1]) << "\n";
    }
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))
    pref = [0] * (n + 1)
    acc = 0
    for i in range(1, n + 1):
        acc += int(next(it))
        pref[i] = acc
    out = []
    for _ in range(q):
        l = int(next(it))
        r = int(next(it))
        out.append(str(pref[r] - pref[l - 1]))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 2: cp02-most-frequent-value
# =============================================================================
def build_p2() -> dict:
    rng = random.Random(20260202)

    def make_inp(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    def brute(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        a = sorted(int(toks[1 + i]) for i in range(n))
        best_val = a[0]
        best_cnt = 0
        i = 0
        while i < n:
            j = i
            while j < n and a[j] == a[i]:
                j += 1
            c = j - i
            if c > best_cnt:
                best_cnt = c
                best_val = a[i]
            i = j
        return f"{best_val} {best_cnt}"

    # Tie-heavy large test
    tie_vals = [rng.randint(-10**9, 10**9) for _ in range(400)]
    tie_arr = tie_vals * 30
    rng.shuffle(tie_arr)

    # Adversarial late-winner test
    adv_vals = [rng.randint(10**8, 10**9) for _ in range(50)]
    adv_arr = []
    for v in adv_vals:
        adv_arr.extend([v] * 200)
    adv_arr.extend([-(10**9)] * 199)
    rng.shuffle(adv_arr)
    adv_arr.append(-(10**9))  # Reaches 200 on the very last element and is smallest!

    dom_arr = [rng.randint(-999, 999) for _ in range(24000)] + [-42] * 1000
    rng.shuffle(dom_arr)

    distinct_20k = list(range(-10000, 10000))
    rng.shuffle(distinct_20k)

    tests = [
        # 3 Public samples
        {
            "input": make_inp([4, 2, 4, -1, 2, 4, 2]),
            "hidden": False,
            "expected": "2 3",
            "checkBrute": True,
        },
        {
            "input": make_inp([-(10**9), 5, -(10**9), 10**9, 5]),
            "hidden": False,
            "expected": "-1000000000 2",
            "checkBrute": True,
        },
        {
            "input": make_inp([10, 20, 30, 40]),
            "hidden": False,
            "expected": "10 1",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([0]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([-999999999] * 50),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([5, 5, 5, 1, 1, -3, -3, 1, -3]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([10**9, -(10**9), 0] * 33 + [0]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp([rng.randint(-20, 20) for _ in range(500)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                ([10**9, -777777777, 123456789, -987654321, 0] * 100)
                + [rng.randint(-10**9, 10**9) for _ in range(500)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-10**9, 10**9) for _ in range(3000)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.choice([-(10**9), -(10**9) + 1, 10**9 - 1, 10**9]) for _ in range(11000)]),
            "hidden": True,
        },
        {
            "input": make_inp(tie_arr),
            "hidden": True,
        },
        {
            "input": make_inp(dom_arr),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-99, 99) for _ in range(30000)]),
            "hidden": True,
        },
        {
            "input": make_inp(distinct_20k),
            "hidden": True,
        },
        {
            "input": make_inp(adv_arr),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-most-frequent-value", tests)

    stress = []
    for _ in range(20):
        nn = rng.randint(1, 60)
        pool = [rng.randint(-10**9, 10**9) for _ in range(rng.randint(1, 12))]
        stress.append(make_inp([rng.choice(pool) for _ in range(nn)]))

    return {
        "slug": "cp02-most-frequent-value",
        "title": "Giá trị xuất hiện nhiều nhất",
        "shortDescription": "Đếm tần suất trên miền giá trị lớn [-10^9, 10^9] bằng Map/Dictionary và chọn giá trị nhỏ nhất khi hòa.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.marking_arrays",
        "tags": ["mảng", "map-set", "tầng 1"],
        "statement": r"""Một máy chủ ghi log thu thập được $N$ mã sự kiện biểu diễn bởi các số nguyên $a_1, a_2, \dots, a_N$. Các mã sự kiện có thể là số âm, số $0$ hoặc số dương lên tới $10^9$.

Hãy tìm mã sự kiện xuất hiện **nhiều lần nhất** trong danh sách và số lần xuất hiện của nó. Nếu có nhiều mã sự kiện cùng đạt số lần xuất hiện lớn nhất, hãy chọn mã có **giá trị nhỏ nhất**.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra hai số nguyên cách nhau bởi một dấu cách: giá trị xuất hiện nhiều nhất (nhỏ nhất nếu hòa) và số lần xuất hiện của nó.

### Ràng buộc
- $1 \le N \le 30\,000$
- $-10^9 \le a_i \le 10^9$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (40%):** $N \le 2\,000$ và $0 \le a_i \le 10^5$.
- **Subtask 2 (60%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với mảng $[4, 2, 4, -1, 2, 4, 2]$: cả giá trị $2$ và $4$ đều xuất hiện $3$ lần (nhiều nhất). Vì $2 < 4$, ta chọn $2$ với tần suất $3$.
- Ở ví dụ 2: hai giá trị $-10^9$ và $5$ cùng xuất hiện $2$ lần; chọn giá trị nhỏ hơn là $-10^9$.
- Ở ví dụ 3: mọi phần tử đều xuất hiện $1$ lần, giá trị nhỏ nhất là $10$.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Miền giá trị lên tới ±10^9 nên không thể dùng mảng đếm trực tiếp theo chỉ số.",
        "hints": r"""**Gợi ý 1:** Vì $|a_i| \le 10^9$, bạn không thể khai báo mảng đếm `cnt[2e9]`. Hãy thay mảng đánh dấu bằng cấu trúc ánh xạ khóa–giá trị (`std::map` trong C++ hoặc `dict` / `Counter` trong Python).

**Gợi ý 2:** Duyệt toàn bộ $N$ phần tử để tăng `freq[a[i]]` lên $1$. Khi đó mỗi khóa trong `freq` lưu đúng tần suất xuất hiện của giá trị đó.

**Gợi ý 3:** Duyệt qua các cặp `(val, cnt)` trong bảng tần suất: cập nhật đáp án nếu `cnt > best_cnt`, hoặc `cnt == best_cnt` và `val < best_val`. Riêng với `std::map` trong C++, khóa đã tự động tăng dần nên chỉ cần kiểm tra `cnt > best_cnt`.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    map<long long, int> freq;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        ++freq[x];
    }

    long long best_val = 0;
    int best_cnt = -1;
    for (const auto& kv : freq) {
        if (kv.second > best_cnt) {
            best_cnt = kv.second;
            best_val = kv.first;
        }
    }
    cout << best_val << " " << best_cnt << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys
from collections import Counter


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    cnt = Counter(int(data[i]) for i in range(1, n + 1))
    best_val = 0
    best_cnt = -1
    for val, c in cnt.items():
        if c > best_cnt or (c == best_cnt and val < best_val):
            best_cnt = c
            best_val = val
    sys.stdout.write(f"{best_val} {best_cnt}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 3: cp02-set-intersection-diff
# =============================================================================
def build_p3() -> dict:
    rng = random.Random(20260203)

    def make_inp(a: List[int], b: List[int]) -> str:
        return f"{len(a)} {len(b)}\n" + " ".join(map(str, a)) + "\n" + " ".join(map(str, b))

    def brute(inp: str) -> str:
        toks = inp.split()
        n, m = int(toks[0]), int(toks[1])
        a = sorted(int(x) for x in toks[2 : 2 + n])
        b = sorted(int(x) for x in toks[2 + n : 2 + n + m])
        ua = []
        for x in a:
            if not ua or ua[-1] != x:
                ua.append(x)
        ub = []
        for x in b:
            if not ub or ub[-1] != x:
                ub.append(x)
        i = j = 0
        inter = 0
        while i < len(ua) and j < len(ub):
            if ua[i] == ub[j]:
                inter += 1
                i += 1
                j += 1
            elif ua[i] < ub[j]:
                i += 1
            else:
                j += 1
        uni = len(ua) + len(ub) - inter
        diff = len(ua) - inter
        return f"{inter} {uni} {diff}"

    base12k = [rng.randint(0, 9999) for _ in range(12000)]
    shuf12k = base12k[:]
    rng.shuffle(shuf12k)

    sparse_shared = [rng.randint(-10**9, 10**9) for _ in range(300)]
    sparse_a = sparse_shared + [rng.randint(-10**9, -1) for _ in range(5700)]
    sparse_b = sparse_shared + [rng.randint(1, 10**9) for _ in range(5700)]
    rng.shuffle(sparse_a)
    rng.shuffle(sparse_b)

    tests = [
        # 3 Public samples
        {
            "input": make_inp([1, 2, 2, 3, 5], [2, 3, 3, 4]),
            "hidden": False,
            "expected": "2 5 2",
            "checkBrute": True,
        },
        {
            "input": make_inp([-5, -5, 0], [1, 2, 10**9]),
            "hidden": False,
            "expected": "0 5 2",
            "checkBrute": True,
        },
        {
            "input": make_inp([7, 7, 7], [7]),
            "hidden": False,
            "expected": "1 1 0",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([-(10**9)], [-(10**9)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([-(10**9)], [10**9]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([10, 20, 10, 30], [5, 10, 15, 20, 25, 30, 35]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([-10, -5, 0, 5, 10, 15], [0, 5, 0]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp([rng.randint(-200, 200) for _ in range(500)], [rng.randint(-200, 200) for _ in range(500)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-10**9, 10**9) for _ in range(1000)], [rng.randint(-10**9, 10**9) for _ in range(1000)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-50, 50) for _ in range(50)], [rng.randint(-100, 100) for _ in range(5000)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-100, 100) for _ in range(5000)], [rng.randint(-50, 50) for _ in range(50)]),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-10**9, -1) for _ in range(6000)], [rng.randint(1, 10**9) for _ in range(6000)]),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-5000, 5000) for _ in range(10000)], [rng.randint(-5000, 5000) for _ in range(10000)]),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-9, 9) for _ in range(25000)], [rng.randint(-9, 9) for _ in range(25000)]),
            "hidden": True,
        },
        {
            "input": make_inp(base12k, shuf12k),
            "hidden": True,
        },
        {
            "input": make_inp(sparse_a, sparse_b),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-set-intersection-diff", tests)

    stress = []
    for _ in range(20):
        na = rng.randint(1, 50)
        nb = rng.randint(1, 50)
        pool = [rng.randint(-10**9, 10**9) for _ in range(rng.randint(1, 25))]
        stress.append(make_inp([rng.choice(pool) for _ in range(na)], [rng.choice(pool) for _ in range(nb)]))

    return {
        "slug": "cp02-set-intersection-diff",
        "title": "Giao, Hợp và Hiệu của hai tập hợp",
        "shortDescription": "Loại bỏ trùng lặp bằng Set và tính kích thước tập giao, tập hợp và tập hiệu của hai mảng số nguyên.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.set_basics",
        "tags": ["mảng", "map-set", "sắp xếp", "tầng 1"],
        "statement": r"""Một câu lạc bộ lập trình tổ chức hai chuyên đề song song và thu về hai danh sách mã định danh học viên: danh sách $A$ gồm $N$ lượt đăng ký và danh sách $B$ gồm $M$ lượt đăng ký. Do một học viên có thể bấm đăng ký nhiều lần, ta xem $S_A$ là tập hợp các mã khác nhau trong $A$ và $S_B$ là tập hợp các mã khác nhau trong $B$.

Hãy tính và in ra lần lượt ba số nguyên:
1. Kích thước tập giao $|S_A \cap S_B|$ (số học viên đăng ký cả hai chuyên đề).
2. Kích thước tập hợp $|S_A \cup S_B|$ (số học viên đăng ký ít nhất một chuyên đề).
3. Kích thước tập hiệu $|S_A \setminus S_B|$ (số học viên chỉ đăng ký chuyên đề $A$ mà không đăng ký chuyên đề $B$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên dương $N$ và $M$ ($1 \le N, M \le 25\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- Dòng thứ ba chứa $M$ số nguyên $b_1, b_2, \dots, b_M$ ($|b_j| \le 10^9$).

### Kết quả
- In ra một dòng duy nhất gồm 3 số nguyên $|S_A \cap S_B|$, $|S_A \cup S_B|$ và $|S_A \setminus S_B|$, cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le N, M \le 25\,000$
- $-10^9 \le a_i, b_j \le 10^9$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (40%):** $N, M \le 1\,000$.
- **Subtask 2 (60%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1: $S_A = \{1, 2, 3, 5\}$ và $S_B = \{2, 3, 4\}$. Khi đó $S_A \cap S_B = \{2, 3\}$ (kích thước $2$), $S_A \cup S_B = \{1, 2, 3, 4, 5\}$ (kích thước $5$) và $S_A \setminus S_B = \{1, 5\}$ (kích thước $2$).
- Ở ví dụ 2: $S_A = \{-5, 0\}$ và $S_B = \{1, 2, 10^9\}$ rời nhau hoàn toàn nên $|S_A \cap S_B| = 0$, $|S_A \cup S_B| = 5$, $|S_A \setminus S_B| = 2$.
- Ở ví dụ 3: $S_A = S_B = \{7\}$ nên kết quả là `1 1 0`.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Mỗi mảng có thể chứa phần tử trùng lặp và số âm tới ±10^9.",
        "hints": r"""**Gợi ý 1:** Đưa tất cả phần tử của mảng $A$ vào tập hợp `SA` và mảng $B$ vào tập hợp `SB` (`std::set` / `std::unordered_set` trong C++, `set` trong Python) để tự động loại bỏ các phần tử trùng lặp.

**Gợi ý 2:** Duyệt từng phần tử `x` trong `SA`, kiểm tra xem `x` có tồn tại trong `SB` hay không để đếm kích thước tập giao $I = |S_A \cap S_B|$.

**Gợi ý 3:** Áp dụng công thức tập hợp: $|S_A \cup S_B| = |S_A| + |S_B| - I$ và $|S_A \setminus S_B| = |S_A| - I$. Trong Python bạn cũng có thể dùng trực tiếp `len(sa & sb)`, `len(sa | sb)`, `len(sa - sb)`.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;
    set<long long> sa, sb;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        sa.insert(x);
    }
    for (int j = 0; j < m; ++j) {
        long long x;
        cin >> x;
        sb.insert(x);
    }

    int inter = 0;
    for (long long x : sa) {
        if (sb.count(x)) ++inter;
    }
    int uni = (int)sa.size() + (int)sb.size() - inter;
    int diff = (int)sa.size() - inter;
    cout << inter << " " << uni << " " << diff << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    sa = {int(x) for x in data[2 : 2 + n]}
    sb = {int(x) for x in data[2 + n : 2 + n + m]}
    inter = len(sa & sb)
    uni = len(sa | sb)
    diff = len(sa - sb)
    sys.stdout.write(f"{inter} {uni} {diff}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 4: cp02-range-add-diff-1d
# =============================================================================
def build_p4() -> dict:
    rng = random.Random(20260204)

    def make_inp(n: int, ops: List[Tuple[int, int, int]]) -> str:
        lines = [f"{n} {len(ops)}"]
        lines.extend(f"{l} {r} {v}" for l, r, v in ops)
        return "\n".join(lines)

    def brute(inp: str) -> str:
        toks = inp.split()
        n, q = int(toks[0]), int(toks[1])
        a = [0] * (n + 1)
        idx = 2
        for _ in range(q):
            l, r, v = int(toks[idx]), int(toks[idx + 1]), int(toks[idx + 2])
            idx += 3
            for i in range(l, r + 1):
                a[i] += v
        vals = a[1:]
        return f"{max(vals)} {min(vals)} {sum(vals)}"

    def rand_ops(n: int, q: int, lo: int, hi: int, wide: bool = False) -> List[Tuple[int, int, int]]:
        ops = []
        for _ in range(q):
            if wide:
                l = rng.randint(1, max(1, n // 4))
                r = rng.randint(min(n, n - n // 4 + 1), n)
                if l > r:
                    l, r = r, l
            else:
                l = rng.randint(1, n)
                r = rng.randint(1, n)
                if l > r:
                    l, r = r, l
            ops.append((l, r, rng.randint(lo, hi)))
        return ops

    pyramid_ops = []
    for i in range(1, 5501):
        l = min(i, 15000)
        r = 30001 - l
        pyramid_ops.append((l, r, 1000 if i % 3 != 0 else -500))

    cancel_spike = []
    for i in range(2500):
        l = rng.randint(1, 20000)
        r = rng.randint(l, 20000)
        v = rng.randint(-10**9, 10**9)
        cancel_spike.append((l, r, v))
        cancel_spike.append((l, r, -v))
    for _ in range(500):
        l = rng.randint(1, 20000)
        r = rng.randint(l, 20000)
        cancel_spike.append((l, r, rng.randint(-10**9, 10**9)))
    rng.shuffle(cancel_spike)

    tests = [
        # 3 Public samples
        {
            "input": make_inp(5, [(1, 3, 4), (2, 5, -2), (4, 4, 7)]),
            "hidden": False,
            "expected": "5 -2 11",
            "checkBrute": True,
        },
        {
            "input": make_inp(4, [(1, 4, 10**9), (2, 3, 10**9)]),
            "hidden": False,
            "expected": "2000000000 1000000000 6000000000",
            "checkBrute": True,
        },
        {
            "input": make_inp(3, [(1, 2, -5), (2, 3, -5)]),
            "hidden": False,
            "expected": "-5 -10 -20",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp(1, [(1, 1, 5), (1, 1, -12), (1, 1, 2)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(10, [(1, 10, 10**9), (3, 7, -500), (1, 10, -(10**9)), (3, 7, 500)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(20, [(2, 19, 100), (5, 15, -300), (1, 20, 0)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(50, [(1, 1, 10**9), (50, 50, -(10**9)), (1, 50, 10**9), (1, 1, 10**9)]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp(300, rand_ops(300, 300, -10**6, 10**6)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(500, [(1, 500, 10**7)] + rand_ops(500, 499, 1, 10**5)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(500, [(1, 500, -(10**7))] + rand_ops(500, 499, -10**5, -1)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(30000, rand_ops(30000, 5000, 9 * 10**8, 10**9, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(30000, rand_ops(30000, 5000, -(10**9), -9 * 10**8, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(10000, rand_ops(10000, 8500, -99, 99, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(30000, pyramid_ops),
            "hidden": True,
        },
        {
            "input": make_inp(20000, cancel_spike),
            "hidden": True,
        },
        {
            "input": make_inp(30000, rand_ops(30000, 5200, -(10**9), 10**9)),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-range-add-diff-1d", tests)

    stress = []
    for _ in range(20):
        nn = rng.randint(1, 50)
        qq = rng.randint(1, 50)
        stress.append(make_inp(nn, rand_ops(nn, qq, -10**9, 10**9)))

    return {
        "slug": "cp02-range-add-diff-1d",
        "title": "Cập nhật đoạn bằng Mảng hiệu 1 chiều",
        "shortDescription": "Thực hiện Q thao tác cộng đoạn bằng Mảng hiệu 1D rồi tìm giá trị lớn nhất, nhỏ nhất và tổng toàn mảng.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.prefix_sum",
        "tags": ["mảng", "mảng hiệu", "truy vấn", "tầng 1"],
        "statement": r"""Cho một dãy gồm $N$ phần tử $A_1, A_2, \dots, A_N$ ban đầu đều bằng $0$.

Bạn cần thực hiện lần lượt $Q$ thao tác cập nhật. Thao tác thứ $j$ cho bởi ba số nguyên $(l_j, r_j, v_j)$, yêu cầu cộng thêm $v_j$ vào mọi phần tử $A_i$ thỏa mãn $l_j \le i \le r_j$ (nếu $v_j < 0$ tức là giảm đi $|v_j|$).

Sau khi hoàn thành **tất cả** $Q$ thao tác, hãy in ra ba chỉ số thống kê của mảng kết quả:
1. Giá trị lớn nhất: $\max_{1 \le i \le N} A_i$.
2. Giá trị nhỏ nhất: $\min_{1 \le i \le N} A_i$.
3. Tổng toàn bộ phần tử: $\sum_{i=1}^{N} A_i$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên dương $N$ và $Q$ ($1 \le N, Q \le 30\,000$).
- $Q$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $l, r, v$ ($1 \le l \le r \le N$, $|v| \le 10^9$).

### Kết quả
- In ra một dòng duy nhất gồm 3 số nguyên: giá trị lớn nhất, giá trị nhỏ nhất và tổng toàn mảng, cách nhau bởi dấu cách.

### Ràng buộc
- $1 \le N, Q \le 30\,000$
- $1 \le l \le r \le N$
- $-10^9 \le v \le 10^9$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (40%):** $N, Q \le 1\,000$.
- **Subtask 2 (60%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với $N = 5$:
  - Sau `(1, 3, 4)`: $[4, 4, 4, 0, 0]$.
  - Sau `(2, 5, -2)`: $[4, 2, 2, -2, -2]$.
  - Sau `(4, 4, 7)`: $[4, 2, 2, 5, -2]$.
  - Giá trị lớn nhất là $5$, nhỏ nhất là $-2$, tổng là $4 + 2 + 2 + 5 + (-2) = 11$.
- Ở ví dụ 3: toàn bộ mảng cuối cùng đều âm ($[-5, -10, -5]$), nên giá trị lớn nhất là $-5$ (lưu ý không khởi tạo biến `max` bằng $0$).
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Tổng toàn mảng có thể lên tới ~9×10^17, vừa khít kiểu số nguyên 64-bit có dấu (long long).",
        "hints": r"""**Gợi ý 1:** Nếu cộng trực tiếp từng phần tử từ $l$ đến $r$ cho mỗi thao tác, độ phức tạp là $O(N \cdot Q)$, sẽ quá thời gian khi $N, Q = 30\,000$. Vì chỉ cần đọc mảng **sau khi xong hết mọi thao tác**, ta có thể dùng kỹ thuật **Mảng hiệu (Difference Array)**.

**Gợi ý 2:** Khởi tạo mảng hiệu $D[1..N+1]$ toàn số $0$. Với mỗi thao tác cộng $v$ lên đoạn $[l, r]$, chỉ cần thực hiện đúng 2 phép toán $O(1)$: `D[l] += v` và `D[r + 1] -= v`.

**Gợi ý 3:** Cộng dồn mảng $D$ từ $1$ đến $N$ để khôi phục giá trị cuối cùng $A_i = A_{i-1} + D_i$, đồng thời cập nhật `max_val` (khởi tạo từ `LLONG_MIN` hoặc $A_1$), `min_val` (khởi tạo từ `LLONG_MAX` hoặc $A_1$) và `total_sum` bằng kiểu `long long`. Độ phức tạp $O(N + Q)$.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;
    vector<long long> diff(n + 2, 0);
    for (int j = 0; j < q; ++j) {
        int l, r;
        long long v;
        cin >> l >> r >> v;
        diff[l] += v;
        diff[r + 1] -= v;
    }

    long long cur = 0;
    long long mx = LLONG_MIN, mn = LLONG_MAX, total = 0;
    for (int i = 1; i <= n; ++i) {
        cur += diff[i];
        if (cur > mx) mx = cur;
        if (cur < mn) mn = cur;
        total += cur;
    }
    cout << mx << " " << mn << " " << total << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    q = int(next(it))
    diff = [0] * (n + 2)
    for _ in range(q):
        l = int(next(it))
        r = int(next(it))
        v = int(next(it))
        diff[l] += v
        diff[r + 1] -= v

    cur = 0
    mx = None
    mn = None
    total = 0
    for i in range(1, n + 1):
        cur += diff[i]
        if mx is None or cur > mx:
            mx = cur
        if mn is None or cur < mn:
            mn = cur
        total += cur
    sys.stdout.write(f"{mx} {mn} {total}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 5: cp02-subarray-sum-equals-k
# =============================================================================
def build_p5() -> dict:
    rng = random.Random(20260205)

    def make_inp(arr: List[int], k: int) -> str:
        return f"{len(arr)} {k}\n" + " ".join(map(str, arr))

    def brute(inp: str) -> str:
        toks = inp.split()
        n, k = int(toks[0]), int(toks[1])
        a = [int(toks[2 + i]) for i in range(n)]
        ans = 0
        for l in range(n):
            s = 0
            for r in range(l, n):
                s += a[r]
                if s == k:
                    ans += 1
        return str(ans)

    # Large test with crafted negative target -10^11
    neg_big_arr = []
    for i in range(12000):
        neg_big_arr.append(-(10**9) if i % 3 != 0 else 5 * 10**8)

    tests = [
        # 3 Public samples
        {
            "input": make_inp([1, 2, -1, 1, 2], 3),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        {
            "input": make_inp([0, 0, 0, 0], 0),
            "hidden": False,
            "expected": "10",
            "checkBrute": True,
        },
        {
            "input": make_inp([-1, -2, 3, -3], -3),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([5], 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([5], 0),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([2, 4, -6, 8, -2, 0, 10, -4], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([10**9] * 50, 3 * 10**10),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp([rng.randint(-5, 5) for _ in range(300)], 0),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-10, 10) for _ in range(400)], -7),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([1 if i % 2 == 0 else -1 for i in range(600)], 0),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([0] * 25000, 0),
            "hidden": True,
        },
        {
            "input": make_inp([1 if i % 2 == 0 else -1 for i in range(25000)], 0),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-10, 10) for _ in range(25000)], 5),
            "hidden": True,
        },
        {
            "input": make_inp([rng.choice([-(10**9), 10**9]) for _ in range(12000)], 5 * 10**9),
            "hidden": True,
        },
        {
            "input": make_inp([10**9] * 12000, 10**12),
            "hidden": True,
        },
        {
            "input": make_inp(neg_big_arr, -(10**11)),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-subarray-sum-equals-k", tests)

    stress = []
    for _ in range(20):
        nn = rng.randint(1, 50)
        arr = [rng.randint(-8, 8) for _ in range(nn)]
        kk = rng.randint(-15, 15)
        stress.append(make_inp(arr, kk))

    return {
        "slug": "cp02-subarray-sum-equals-k",
        "title": "Đếm đoạn con có tổng bằng K",
        "shortDescription": "Đếm số đoạn con liên tiếp có tổng đúng bằng K trên mảng chứa cả số âm và số 0 bằng Prefix Sum + Hash Map.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.frequency_grouping",
        "tags": ["mảng", "prefix sum", "map-set", "tầng 1"],
        "statement": r"""Cho một mảng gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ (có thể chứa số dương, số âm và số $0$) cùng một số nguyên mục tiêu $K$.

Hãy đếm số lượng đoạn con liên tiếp $[l, r]$ ($1 \le l \le r \le N$) có tổng các phần tử đúng bằng $K$:
$$\sum_{i=l}^{r} a_i = K$$

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N$ và $K$ ($1 \le N \le 25\,000$, $|K| \le 10^{14}$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là số đoạn con liên tiếp có tổng bằng $K$.

### Ràng buộc
- $1 \le N \le 25\,000$
- $-10^9 \le a_i \le 10^9$
- $-10^{14} \le K \le 10^{14}$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (35%):** $N \le 2\,000$.
- **Subtask 2 (25%):** $a_i > 0$ với mọi $1 \le i \le N$.
- **Subtask 3 (40%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với $A = [1, 2, -1, 1, 2]$ và $K = 3$, có đúng $3$ đoạn con có tổng bằng $3$: $[1, 2]$ (vị trí $1..2$), $[1, 2, -1, 1]$ (vị trí $1..4$) và $[1, 2]$ (vị trí $4..5$).
- Ở ví dụ 2 với $4$ số $0$ và $K = 0$, mọi đoạn con khác rỗng đều có tổng bằng $0$, tổng cộng $\frac{4 \times 5}{2} = 10$ đoạn.
- Ở ví dụ 3 với $A = [-1, -2, 3, -3]$ và $K = -3$, có $3$ đoạn thỏa mãn: $[-1, -2]$, $[-1, -2, 3, -3]$ và $[-3]$.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Mảng có cả số âm nên kỹ thuật hai con trỏ (Sliding Window) không áp dụng được; cần dùng Prefix Sum kết hợp Hash Map và kiểu 64-bit.",
        "hints": r"""**Gợi ý 1:** Vì mảng có cả số âm và số $0$, tổng đoạn không có tính đơn điệu khi mở rộng hay thu hẹp cửa sổ. Hãy biểu diễn tổng đoạn $[l, r]$ qua mảng cộng dồn: $P[r] - P[l - 1] = K$.

**Gợi ý 2:** Với mỗi vị trí kết thúc $r$ cố định, điều kiện trở thành $P[l - 1] = P[r] - K$ (với $0 \le l - 1 < r$). Như vậy ta chỉ cần biết trước chỉ số $r$ đã có bao nhiêu tiền tố mang giá trị đúng bằng $P[r] - K$.

**Gợi ý 3:** Dùng một Hash Map `freq` lưu số lần xuất hiện của mỗi tổng tiền tố đã gặp. **Đừng quên khởi tạo `freq[0] = 1`** cho tiền tố rỗng $P[0] = 0$! Với mỗi $r$ từ $1$ đến $N$: cập nhật `pref += a[r]`, cộng `freq[pref - K]` vào đáp án, rồi tăng `freq[pref] += 1`. Độ phức tạp trung bình $O(N)$.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long k;
    if (!(cin >> n >> k)) return 0;
    unordered_map<long long, long long> freq;
    freq.reserve((size_t)n * 2 + 16);
    freq.max_load_factor(0.7f);
    freq[0] = 1;

    long long pref = 0;
    long long ans = 0;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        pref += x;
        auto it = freq.find(pref - k);
        if (it != freq.end()) {
            ans += it->second;
        }
        ++freq[pref];
    }
    cout << ans << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    freq = {0: 1}
    pref = 0
    ans = 0
    for i in range(2, 2 + n):
        pref += int(data[i])
        ans += freq.get(pref - k, 0)
        freq[pref] = freq.get(pref, 0) + 1
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 6: cp02-subarray-sum-divisible-k
# =============================================================================
def build_p6() -> dict:
    rng = random.Random(20260206)

    def make_inp(arr: List[int], k: int) -> str:
        return f"{len(arr)} {k}\n" + " ".join(map(str, arr))

    def brute(inp: str) -> str:
        toks = inp.split()
        n, k = int(toks[0]), int(toks[1])
        a = [int(toks[2 + i]) for i in range(n)]
        ans = 0
        for l in range(n):
            s = 0
            for r in range(l, n):
                s += a[r]
                if s % k == 0:
                    ans += 1
        return str(ans)

    tests = [
        # 3 Public samples
        {
            "input": make_inp([4, 5, 0, -2, -3], 5),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        {
            "input": make_inp([-1, -2, -3, 6], 3),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        {
            "input": make_inp([-7, 13, 0], 1),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([-(10**9)], 100000),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([-1], 2),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([1, 1, 1, 1, 1], 10),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([-2, 7, -5, 12, -14, 2, 5, -7, 0, -9, 2], 7),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp([rng.randint(-1000, 1000) for _ in range(300)], 13),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-10**6, 10**6) for _ in range(400)], 99991),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-100, 100) * 17 for _ in range(450)], 17),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([rng.randint(-9, 9) for _ in range(25000)], 1),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-50, 50) for _ in range(25000)], 7),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-(10**9), 10**9) for _ in range(12000)], 100000),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-(10**9), 10**9) for _ in range(12000)], 99991),
            "hidden": True,
        },
        {
            "input": make_inp([-997 if i % 2 == 0 else 997 for i in range(20000)], 997),
            "hidden": True,
        },
        {
            "input": make_inp([rng.randint(-(10**9), -1) for _ in range(12000)], 10007),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-subarray-sum-divisible-k", tests)

    stress = []
    for _ in range(20):
        nn = rng.randint(1, 50)
        kk = rng.randint(1, 20)
        arr = [rng.randint(-100, 100) for _ in range(nn)]
        stress.append(make_inp(arr, kk))

    return {
        "slug": "cp02-subarray-sum-divisible-k",
        "title": "Đếm đoạn con có tổng chia hết cho K",
        "shortDescription": "Đếm số đoạn con liên tiếp có tổng chia hết cho K trên mảng có số âm bằng Prefix Sum và chuẩn hóa số dư modulo.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.frequency_grouping",
        "tags": ["mảng", "prefix sum", "số học", "tầng 1"],
        "statement": r"""Cho mảng $N$ số nguyên $a_1, a_2, \dots, a_N$ (có thể chứa số âm, số $0$ và số dương) cùng một số nguyên dương $K$.

Hãy đếm số đoạn con liên tiếp $[l, r]$ ($1 \le l \le r \le N$) sao cho tổng các phần tử trong đoạn chia hết cho $K$:
$$\left(\sum_{i=l}^{r} a_i\right) \equiv 0 \pmod K$$

Lưu ý: một số nguyên $S$ (kể cả số âm hoặc số $0$) chia hết cho $K > 0$ nếu tồn tại số nguyên $q$ sao cho $S = q \cdot K$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên dương $N$ và $K$ ($1 \le N \le 25\,000$, $1 \le K \le 10^5$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là số đoạn con liên tiếp có tổng chia hết cho $K$.

### Ràng buộc
- $1 \le N \le 25\,000$
- $1 \le K \le 10^5$
- $-10^9 \le a_i \le 10^9$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (35%):** $N \le 2\,000$.
- **Subtask 2 (25%):** $a_i \ge 0$ với mọi $1 \le i \le N$.
- **Subtask 3 (40%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với $A = [4, 5, 0, -2, -3]$ và $K = 5$, có $6$ đoạn con có tổng chia hết cho $5$: $[5]$, $[5, 0]$, $[5, 0, -2, -3]$, $[0]$, $[0, -2, -3]$ và $[-2, -3]$.
- Ở ví dụ 2 với $A = [-1, -2, -3, 6]$ và $K = 3$, các tổng tiền tố theo modulo $3$ là $0, 2, 0, 0, 0$, tạo thành $\binom{4}{2} = 6$ đoạn con chia hết cho $3$.
- Ở ví dụ 3 với $K = 1$, mọi số nguyên đều chia hết cho $1$, nên tất cả $\frac{3 \times 4}{2} = 6$ đoạn con đều thỏa mãn.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Trong C++, phép chia lấy dư (%) trên số âm trả về kết quả âm, cần chuẩn hóa số dư về đoạn [0, K-1].",
        "hints": r"""**Gợi ý 1:** Tổng đoạn $[l, r]$ là $P[r] - P[l - 1]$. Hiệu này chia hết cho $K$ khi và chỉ khi $P[r]$ và $P[l - 1]$ có **cùng số dư** khi chia cho $K$.

**Gợi ý 2:** Cạm bẫy kinh điển trong C++: `(-2) % 5` ra `-2` chứ không phải `3`, khiến hai tiền tố `-2` và `3` bị đếm vào hai nhóm khác nhau dù $3 - (-2) = 5$ chia hết cho $5$! Hãy luôn chuẩn hóa số dư bằng `rem = ((pref % K) + K) % K`.

**Gợi ý 3:** Vì $K \le 10^5$, chỉ cần mảng đếm `cnt[0..K-1]` với `cnt[0] = 1` (cho $P[0] = 0$). Mỗi bước tính `rem`, cộng `cnt[rem]` vào đáp án (`long long`), rồi tăng `cnt[rem]++`. Độ phức tạp $O(N + K)$.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> cnt(k, 0);
    cnt[0] = 1;

    long long pref = 0;
    long long ans = 0;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        pref += x;
        int rem = (int)((pref % k + k) % k);
        ans += cnt[rem];
        ++cnt[rem];
    }
    cout << ans << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    cnt = [0] * k
    cnt[0] = 1
    rem = 0
    ans = 0
    for i in range(2, 2 + n):
        rem = (rem + int(data[i])) % k
        ans += cnt[rem]
        cnt[rem] += 1
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 7: cp02-matrix-prefix-sum-2d
# =============================================================================
def build_p7() -> dict:
    rng = random.Random(20260207)

    def make_inp(mat: List[List[int]], queries: List[Tuple[int, int, int, int]]) -> str:
        n = len(mat)
        m = len(mat[0])
        lines = [f"{n} {m} {len(queries)}"]
        lines.extend(" ".join(map(str, row)) for row in mat)
        lines.extend(f"{r1} {c1} {r2} {c2}" for r1, c1, r2, c2 in queries)
        return "\n".join(lines)

    def brute(inp: str) -> str:
        toks = inp.split()
        n, m, q = int(toks[0]), int(toks[1]), int(toks[2])
        idx = 3
        a = []
        for _ in range(n):
            a.append([int(toks[idx + j]) for j in range(m)])
            idx += m
        out = []
        for _ in range(q):
            r1, c1, r2, c2 = int(toks[idx]), int(toks[idx + 1]), int(toks[idx + 2]), int(toks[idx + 3])
            idx += 4
            s = 0
            for r in range(r1 - 1, r2):
                s += sum(a[r][c1 - 1 : c2])
            out.append(str(s))
        return "\n".join(out)

    def rand_qs(n: int, m: int, q: int, wide_ratio: float = 0.0) -> List[Tuple[int, int, int, int]]:
        qs = [(1, 1, n, m)]
        if q >= 2:
            qs.append((1, 1, 1, 1))
        if q >= 3:
            qs.append((n, m, n, m))
        while len(qs) < q:
            if wide_ratio > 0 and rng.random() < wide_ratio:
                r1 = rng.randint(1, max(1, n // 5))
                r2 = rng.randint(min(n, n - n // 5 + 1), n)
                c1 = rng.randint(1, max(1, m // 5))
                c2 = rng.randint(min(m, m - m // 5 + 1), m)
            else:
                r1, r2 = rng.randint(1, n), rng.randint(1, n)
                c1, c2 = rng.randint(1, m), rng.randint(1, m)
            if r1 > r2:
                r1, r2 = r2, r1
            if c1 > c2:
                c1, c2 = c2, c1
            qs.append((r1, c1, r2, c2))
        return qs[:q]

    tests = [
        # 3 Public samples
        {
            "input": make_inp(
                [[1, 2, -1], [3, -2, 4], [0, 5, -3]],
                [(1, 1, 2, 2), (2, 2, 3, 3), (1, 1, 3, 3)],
            ),
            "hidden": False,
            "expected": "4\n4\n9",
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [[10**6, -10**6, 500000], [10**6, 10**6, -250000]],
                [(1, 1, 2, 3), (1, 2, 2, 3)],
            ),
            "hidden": False,
            "expected": "2250000\n250000",
            "checkBrute": True,
        },
        {
            "input": make_inp([[-42]], [(1, 1, 1, 1)]),
            "hidden": False,
            "expected": "-42",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([[rng.randint(-1000, 1000) for _ in range(50)]], rand_qs(1, 50, 20)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([[rng.randint(-1000, 1000)] for _ in range(50)], rand_qs(50, 1, 20)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([[0] * 20 for _ in range(20)], rand_qs(20, 20, 30)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [[10**6 if (i + j) % 2 == 0 else -(10**6) for j in range(30)] for i in range(30)],
                rand_qs(30, 30, 50),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp(
                [[rng.randint(-10**6, 10**6) for _ in range(40)] for _ in range(30)],
                rand_qs(30, 40, 200),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [[rng.randint(-10**5, 10**5) for _ in range(50)] for _ in range(50)],
                [(1, 1, 1, 50), (50, 1, 50, 50), (1, 1, 50, 1), (1, 50, 50, 50)] + rand_qs(50, 50, 296),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [[rng.randint(-10**6, 10**6) for _ in range(40)] for _ in range(180)],
                rand_qs(180, 40, 2000, 0.5),
            ),
            "hidden": True,
        },
        {
            "input": make_inp(
                [[10**6 for _ in range(100)] for _ in range(100)],
                rand_qs(100, 100, 3000, 0.7),
            ),
            "hidden": True,
        },
        {
            "input": make_inp(
                [[-(10**6) for _ in range(100)] for _ in range(100)],
                rand_qs(100, 100, 3000, 0.7),
            ),
            "hidden": True,
        },
        {
            "input": make_inp(
                [[rng.randint(0, 9) for _ in range(200)] for _ in range(200)],
                rand_qs(200, 200, 3800, 0.8),
            ),
            "hidden": True,
        },
        {
            "input": make_inp(
                [[rng.randint(-9, 9) for _ in range(200)] for _ in range(200)],
                rand_qs(200, 200, 2500, 0.8),
            ),
            "hidden": True,
        },
        {
            "input": make_inp(
                [[rng.randint(-999, 999) for _ in range(50)] for _ in range(50)],
                rand_qs(50, 50, 9000, 0.6),
            ),
            "hidden": True,
        },
        {
            "input": make_inp(
                [[rng.randint(-9999, 9999) for _ in range(200)] for _ in range(40)],
                rand_qs(40, 200, 4500, 0.7),
            ),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-matrix-prefix-sum-2d", tests)

    stress = []
    for _ in range(15):
        nn = rng.randint(1, 15)
        mm = rng.randint(1, 15)
        qq = rng.randint(1, 30)
        mat = [[rng.randint(-10**6, 10**6) for _ in range(mm)] for _ in range(nn)]
        stress.append(make_inp(mat, rand_qs(nn, mm, qq)))

    return {
        "slug": "cp02-matrix-prefix-sum-2d",
        "title": "Tổng hình chữ nhật con trên ma trận 2D",
        "shortDescription": "Trả lời nhanh Q truy vấn tổng hình chữ nhật con (r1, c1, r2, c2) bằng mảng cộng dồn 2 chiều.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.prefix_sum",
        "tags": ["mảng", "prefix sum", "truy vấn", "tầng 1"],
        "statement": r"""Cho một ma trận số nguyên kích thước $N \times M$ gồm $N$ hàng (đánh số từ $1$ đến $N$) và $M$ cột (đánh số từ $1$ đến $M$). Ô ở hàng $i$, cột $j$ chứa giá trị $a_{i,j}$ (có thể âm hoặc dương).

Bạn cần trả lời $Q$ truy vấn độc lập. Mỗi truy vấn gồm bốn số nguyên $(r_1, c_1, r_2, c_2)$ xác định một hình chữ nhật con có góc trên-trái là $(r_1, c_1)$ và góc dưới-phải là $(r_2, c_2)$, yêu cầu tính tổng:
$$\sum_{i=r_1}^{r_2} \sum_{j=c_1}^{c_2} a_{i,j}$$

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên dương $N, M, Q$ ($1 \le N, M \le 200$, $1 \le Q \le 20\,000$).
- $N$ dòng tiếp theo, mỗi dòng chứa $M$ số nguyên $a_{i,1}, a_{i,2}, \dots, a_{i,M}$ ($|a_{i,j}| \le 10^6$).
- $Q$ dòng tiếp theo, mỗi dòng chứa bốn số nguyên $r_1, c_1, r_2, c_2$ ($1 \le r_1 \le r_2 \le N$, $1 \le c_1 \le c_2 \le M$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $k$ in ra tổng các phần tử trong hình chữ nhật con của truy vấn thứ $k$.

### Ràng buộc
- $1 \le N, M \le 200$
- $1 \le Q \le 20\,000$
- $-10^6 \le a_{i,j} \le 10^6$
- $1 \le r_1 \le r_2 \le N$, $1 \le c_1 \le c_2 \le M$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (40%):** $N, M \le 50$, $Q \le 1\,000$.
- **Subtask 2 (60%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với ma trận $3 \times 3$:
  - Hình chữ nhật $(1, 1, 2, 2)$ gồm các ô $1, 2, 3, -2$, có tổng bằng $4$.
  - Hình chữ nhật $(2, 2, 3, 3)$ gồm các ô $-2, 4, 5, -3$, có tổng bằng $4$.
  - Hình chữ nhật $(1, 1, 3, 3)$ là toàn bộ ma trận, có tổng bằng $9$.
- Lưu ý: Tổng hình chữ nhật có thể đạt tới $200 \times 200 \times 10^6 = 4 \times 10^{10}$, vượt giới hạn `int` 32-bit.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Dùng kiểu số nguyên 64-bit (long long) cho mảng cộng dồn 2D vì tổng có thể lên tới ±4×10^10.",
        "hints": r"""**Gợi ý 1:** Tính tổng trực tiếp từng hình chữ nhật tốn $O(N \cdot M)$ cho mỗi truy vấn, dẫn đến $O(Q \cdot N \cdot M) \approx 8 \times 10^8$ phép toán (TLE). Hãy mở rộng mảng cộng dồn lên 2 chiều!

**Gợi ý 2:** Định nghĩa $P[i][j]$ là tổng hình chữ nhật từ $(1, 1)$ đến $(i, j)$ (với $P[0][*] = P[*][0] = 0$). Dùng nguyên lý bù trừ để tính bảng $P$ trong $O(N \cdot M)$:
$$P[i][j] = a_{i,j} + P[i-1][j] + P[i][j-1] - P[i-1][j-1]$$

**Gợi ý 3:** Mỗi truy vấn $(r_1, c_1, r_2, c_2)$ được trả lời trong $O(1)$ bằng công thức bù trừ:
$$P[r_2][c_2] - P[r_1 - 1][c_2] - P[r_2][c_1 - 1] + P[r_1 - 1][c_1 - 1]$$
Tổng độ phức tạp là $O(N \cdot M + Q)$.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, q;
    if (!(cin >> n >> m >> q)) return 0;
    vector<vector<long long>> pref(n + 1, vector<long long>(m + 1, 0));
    for (int i = 1; i <= n; ++i) {
        for (int j = 1; j <= m; ++j) {
            long long x;
            cin >> x;
            pref[i][j] = x + pref[i - 1][j] + pref[i][j - 1] - pref[i - 1][j - 1];
        }
    }
    for (int t = 0; t < q; ++t) {
        int r1, c1, r2, c2;
        cin >> r1 >> c1 >> r2 >> c2;
        long long ans = pref[r2][c2] - pref[r1 - 1][c2] - pref[r2][c1 - 1] + pref[r1 - 1][c1 - 1];
        cout << ans << "\n";
    }
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    m = int(next(it))
    q = int(next(it))
    pref = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        row = pref[i]
        prev = pref[i - 1]
        row_acc = 0
        for j in range(1, m + 1):
            row_acc += int(next(it))
            row[j] = prev[j] + row_acc
    out = []
    for _ in range(q):
        r1 = int(next(it))
        c1 = int(next(it))
        r2 = int(next(it))
        c2 = int(next(it))
        ans = pref[r2][c2] - pref[r1 - 1][c2] - pref[r2][c1 - 1] + pref[r1 - 1][c1 - 1]
        out.append(str(ans))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 8: cp02-longest-balanced-zero-one
# =============================================================================
def build_p8() -> dict:
    rng = random.Random(20260208)

    def make_inp(arr: List[int], k: int) -> str:
        return f"{len(arr)} {k}\n" + " ".join(map(str, arr))

    def brute(inp: str) -> str:
        toks = inp.split()
        n, k = int(toks[0]), int(toks[1])
        a = [int(toks[2 + i]) for i in range(n)]
        ans = 0
        for l in range(n):
            c0 = c1 = 0
            for r in range(l, n):
                if a[r] == 0:
                    c0 += 1
                else:
                    c1 += 1
                if c1 == k * c0:
                    length = r - l + 1
                    if length > ans:
                        ans = length
        return str(ans)

    def tuned_bin(n: int, k: int) -> List[int]:
        p1 = k / (k + 1)
        return [1 if rng.random() < p1 else 0 for _ in range(n)]

    # K=10 exact huge block
    k10_arr = [0] * 2727 + [1] * 27270
    rng.shuffle(k10_arr)
    k10_arr = [1, 1, 1] + k10_arr  # length 30000

    # K=7 optimal segment embedded in middle
    mid_block = [0] * 2500 + [1] * 17500
    rng.shuffle(mid_block)
    k7_tricky = [0] * 5000 + mid_block + [0] * 5000

    tests = [
        # 3 Public samples
        {
            "input": make_inp([1, 0, 1, 1, 0, 1, 1], 2),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        {
            "input": make_inp([0, 0, 1, 0, 1, 1], 1),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        {
            "input": make_inp([0, 1, 0, 1, 0], 3),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([0], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([1], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([0] * 100, 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([1] * 100, 10),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp([0, 0, 0] + [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0] + [0, 0, 0], 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(tuned_bin(400, 1), 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(tuned_bin(400, 3), 3),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(tuned_bin(500, 10), 10),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([i % 2 for i in range(30000)], 1),
            "hidden": True,
        },
        {
            "input": make_inp(tuned_bin(30000, 2), 2),
            "hidden": True,
        },
        {
            "input": make_inp(tuned_bin(30000, 5), 5),
            "hidden": True,
        },
        {
            "input": make_inp(k10_arr, 10),
            "hidden": True,
        },
        {
            "input": make_inp(k7_tricky, 7),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-longest-balanced-zero-one", tests)

    stress = []
    for _ in range(20):
        nn = rng.randint(1, 55)
        kk = rng.randint(1, 10)
        stress.append(make_inp(tuned_bin(nn, kk), kk))

    return {
        "slug": "cp02-longest-balanced-zero-one",
        "title": "Đoạn con cân bằng tỉ lệ 1 : K dài nhất",
        "shortDescription": "Biến đổi mảng nhị phân thành trọng số (+1 / -K) để tìm đoạn con dài nhất có số lượng 1 gấp đúng K lần số lượng 0.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.frequency_grouping",
        "tags": ["mảng", "prefix sum", "map-set", "tối ưu", "tầng 2"],
        "statement": r"""Cho một mảng nhị phân gồm $N$ phần tử $a_1, a_2, \dots, a_N$ ($a_i \in \{0, 1\}$) và một số nguyên dương $K$ ($1 \le K \le 10$).

Một đoạn con liên tiếp $[l, r]$ ($1 \le l \le r \le N$) được gọi là **cân bằng theo tỉ lệ $K$** nếu số lượng số `1` trong đoạn bằng đúng $K$ lần số lượng số `0` trong đoạn:
$$c_1(l, r) = K \cdot c_0(l, r)$$

Hãy tìm **độ dài lớn nhất** của một đoạn con liên tiếp thỏa mãn điều kiện trên. Nếu không có đoạn con nào thỏa mãn, in ra `0`.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên dương $N$ và $K$ ($1 \le N \le 30\,000$, $1 \le K \le 10$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($a_i \in \{0, 1\}$), cách nhau bởi dấu cách.

### Kết quả
- In ra một số nguyên duy nhất là độ dài đoạn con cân bằng dài nhất (hoặc `0` nếu không tồn tại).

### Ràng buộc
- $1 \le N \le 30\,000$
- $1 \le K \le 10$
- $a_i \in \{0, 1\}$ với mọi $1 \le i \le N$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (30%):** $N \le 2\,000$.
- **Subtask 2 (30%):** $K = 1$.
- **Subtask 3 (40%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với $A = [1, 0, 1, 1, 0, 1, 1]$ và $K = 2$: đoạn $[1..6]$ là $[1, 0, 1, 1, 0, 1]$ (hoặc đoạn $[2..7]$) có đúng $2$ số `0` và $4$ số `1` ($4 = 2 \times 2$), độ dài lớn nhất là $6$.
- Ở ví dụ 2 với $K = 1$: toàn bộ mảng $[0, 0, 1, 0, 1, 1]$ có $3$ số `0` và $3$ số `1`, nên độ dài lớn nhất là $6$.
- Ở ví dụ 3 với $K = 3$: cả mảng chỉ có $2$ số `1`, không đủ để tạo bất kỳ đoạn nào có $c_1 = 3 \cdot c_0 \ge 3$, nên kết quả là `0`.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Độ phức tạp mục tiêu là O(N) bằng kỹ thuật biến đổi trọng số + Prefix Sum + Hash Map.",
        "hints": r"""**Gợi ý 1:** Hãy đưa điều kiện $c_1(l, r) = K \cdot c_0(l, r)$ về dạng hiệu bằng $0$:
$$c_1(l, r) - K \cdot c_0(l, r) = 0$$
Điều này gợi ý gán cho mỗi phần tử một trọng số mới!

**Gợi ý 2:** Thay mỗi số `1` bằng $+1$ và mỗi số `0` bằng $-K$. Khi đó tổng trọng số trên đoạn $[l, r]$ bằng đúng $c_1(l, r) - K \cdot c_0(l, r)$. Bài toán trở thành: **tìm đoạn con dài nhất có tổng bằng $0$**, tức tìm hai chỉ số $l - 1 < r$ xa nhau nhất sao cho $P[r] = P[l - 1]$.

**Gợi ý 3:** Dùng một Hash Map `first_pos` chỉ lưu **vị trí xuất hiện đầu tiên** của mỗi giá trị tổng tiền tố `pref` (khởi tạo `first_pos[0] = 0`). Khi duyệt $i$ từ $1$ đến $N$: nếu `pref` đã có trong `first_pos`, cập nhật `ans = max(ans, i - first_pos[pref])`; ngược lại mới gán `first_pos[pref] = i` (không ghi đè để giữ chỉ số nhỏ nhất!).
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    unordered_map<long long, int> first_pos;
    first_pos.reserve((size_t)n * 2 + 16);
    first_pos.max_load_factor(0.7f);
    first_pos[0] = 0;

    long long pref = 0;
    int ans = 0;
    for (int i = 1; i <= n; ++i) {
        int x;
        cin >> x;
        pref += (x == 1 ? 1LL : -(long long)k);
        auto it = first_pos.find(pref);
        if (it != first_pos.end()) {
            ans = max(ans, i - it->second);
        } else {
            first_pos[pref] = i;
        }
    }
    cout << ans << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    first_pos = {0: 0}
    pref = 0
    ans = 0
    for i in range(1, n + 1):
        if data[i + 1] == "1":
            pref += 1
        else:
            pref -= k
        if pref in first_pos:
            length = i - first_pos[pref]
            if length > ans:
                ans = length
        else:
            first_pos[pref] = i
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 9: cp02-max-interval-overlap
# =============================================================================
def build_p9() -> dict:
    rng = random.Random(20260209)

    def make_inp(segs: List[Tuple[int, int]]) -> str:
        lines = [str(len(segs))]
        lines.extend(f"{l} {r}" for l, r in segs)
        return "\n".join(lines)

    def brute(inp: str) -> str:
        toks = inp.split()
        n = int(toks[0])
        segs = [(int(toks[1 + 2 * i]), int(toks[2 + 2 * i])) for i in range(n)]
        cands = sorted({l for l, _ in segs})
        best = 0
        best_t = 0
        for t in cands:
            c = 0
            for l, r in segs:
                if l <= t < r:
                    c += 1
            if c > best:
                best = c
                best_t = t
        return f"{best} {best_t}"

    def rand_segs(n: int, max_coord: int) -> List[Tuple[int, int]]:
        segs = []
        for _ in range(n):
            a = rng.randint(0, max_coord)
            b = rng.randint(0, max_coord)
            while a == b:
                b = rng.randint(0, max_coord)
            if a > b:
                a, b = b, a
            segs.append((a, b))
        return segs

    # Test 12: massive peak near 10^9
    peak_near_1e9 = []
    for _ in range(4000):
        l = rng.randint(999_000_000, 999_500_000)
        r = rng.randint(999_500_001, 1_000_000_000)
        peak_near_1e9.append((l, r))
    for _ in range(2000):
        l = rng.randint(0, 500_000_000)
        r = rng.randint(l + 1, 900_000_000)
        peak_near_1e9.append((l, r))
    rng.shuffle(peak_near_1e9)

    # Test 14: two equal peaks (earliest must win!)
    tie_peaks = []
    for i in range(4000):
        tie_peaks.append((1000 + i % 10, 5000 + i % 10))
        tie_peaks.append((20000 + i % 10, 25000 + i % 10))
    for _ in range(2000):
        l = rng.randint(6000, 18000)
        tie_peaks.append((l, l + rng.randint(1, 500)))
    rng.shuffle(tie_peaks)

    # Test 16: unit intervals + spanning
    unit_plus = [(i, i + 1) for i in range(5000)] + [
        (rng.randint(0, 4998), rng.randint(1, 4999)) for _ in range(5000)
    ]
    unit_plus = [(min(a, b), max(a, b) + (1 if a == b else 0)) for a, b in unit_plus]
    rng.shuffle(unit_plus)

    tests = [
        # 3 Public samples
        {
            "input": make_inp([(1, 5), (2, 6), (5, 8), (3, 5)]),
            "hidden": False,
            "expected": "3 3",
            "checkBrute": True,
        },
        {
            "input": make_inp([(0, 10), (10, 20), (20, 30)]),
            "hidden": False,
            "expected": "1 0",
            "checkBrute": True,
        },
        {
            "input": make_inp([(1, 4), (2, 5), (10, 15), (12, 14)]),
            "hidden": False,
            "expected": "2 2",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp([(0, 10**9)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([(10**9 - 1, 10**9)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([(1, 5), (5, 10), (5, 8)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp([(10**8, 9 * 10**8)] * 50),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp(rand_segs(300, 100)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(rand_segs(300, 10**9)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                [(i * 10, (i + 1) * 10) for i in range(200)]
                + [(500, 550), (520, 560), (1500, 1550), (1520, 1560)]
                + rand_segs(200, 2000)
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(rand_segs(6000, 10**9)),
            "hidden": True,
        },
        {
            "input": make_inp(peak_near_1e9),
            "hidden": True,
        },
        {
            "input": make_inp(rand_segs(11000, 5000)),
            "hidden": True,
        },
        {
            "input": make_inp(tie_peaks),
            "hidden": True,
        },
        {
            "input": make_inp(rand_segs(25000, 99)),
            "hidden": True,
        },
        {
            "input": make_inp(unit_plus),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-max-interval-overlap", tests)

    stress = []
    for _ in range(20):
        nn = rng.randint(1, 50)
        mc = rng.choice([5, 15, 100, 10**9])
        stress.append(make_inp(rand_segs(nn, mc)))

    return {
        "slug": "cp02-max-interval-overlap",
        "title": "Thời điểm đông khách nhất (Sweep Line)",
        "shortDescription": "Tìm số lượng khoảng nửa mở [Li, Ri) chồng lấp tối đa cùng lúc và thời điểm sớm nhất đạt mức đó bằng kỹ thuật Sweep Line.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.prefix_sum",
        "tags": ["mảng", "sắp xếp", "sweep line", "tối ưu", "tầng 2"],
        "statement": r"""Một trung tâm triển lãm ghi nhận thời gian tham quan của $N$ khách hàng trong ngày. Khách hàng thứ $i$ đến vào thời điểm $L_i$ và rời đi vào đúng thời điểm $R_i$ ($0 \le L_i < R_i \le 10^9$).

Khoảng thời gian có mặt của khách hàng thứ $i$ được tính theo **nửa khoảng** $[L_i, R_i)$, nghĩa là người đó có mặt tại mọi thời điểm $t$ thỏa mãn $L_i \le t < R_i$. Đặc biệt, nếu một người rời đi đúng lúc $t$ ($R_i = t$) và một người khác vừa đến đúng lúc $t$ ($L_j = t$), họ **không** được tính là có mặt cùng lúc tại $t$.

Hãy tìm:
1. Số lượng khách hàng tối đa có mặt cùng lúc tại trung tâm.
2. Thời điểm **sớm nhất** đạt được số lượng khách tối đa đó.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 25\,000$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa hai số nguyên $L_i$ và $R_i$ ($0 \le L_i < R_i \le 10^9$).

### Kết quả
- In ra hai số nguyên cách nhau bởi dấu cách: số lượng khách tối đa và thời điểm sớm nhất đạt mức tối đa đó.

### Ràng buộc
- $1 \le N \le 25\,000$
- $0 \le L_i < R_i \le 10^9$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (30%):** $N \le 2\,000$ và $R_i \le 2\,000$.
- **Subtask 2 (30%):** $R_i \le 10^5$.
- **Subtask 3 (40%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với 4 khách $[1, 5), [2, 6), [5, 8), [3, 5)$: tại thời điểm $t = 3$, có $3$ khách đang có mặt ($[1, 5), [2, 6), [3, 5)$). Tại $t = 5$, hai khách $[1, 5)$ và $[3, 5)$ đã rời đi nên chỉ còn $2$ khách. Đáp án là `3 3`.
- Ở ví dụ 2 với $[0, 10), [10, 20), [20, 30)$: các khoảng chỉ chạm nhau ở biên nên không bao giờ có $2$ khách cùng lúc; thời điểm sớm nhất đạt $1$ khách là $t = 0$.
- Ở ví dụ 3: đạt tối đa $2$ khách tại cả $t = 2$ và $t = 12$; ta chọn thời điểm sớm hơn là $t = 2$.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Tọa độ thời gian lên tới 10^9 nên không thể dùng mảng hiệu trực tiếp; cần dùng kỹ thuật Sweep Line (quét sự kiện).",
        "hints": r"""**Gợi ý 1:** Khi tọa độ lên tới $10^9$, ý tưởng mảng hiệu 1D vẫn đúng nhưng ta không lưu cả mảng $10^9$ ô mà chỉ lưu $2N$ **sự kiện thay đổi**: tại $L_i$ có sự kiện $(L_i, +1)$ và tại $R_i$ có sự kiện $(R_i, -1)$.

**Gợi ý 2:** Sắp xếp $2N$ sự kiện tăng dần theo thời điểm. Lưu ý bẫy cực kỳ dễ sai: nếu có nhiều sự kiện xảy ra tại **cùng một thời điểm** $x$ (vừa có người rời đi `-1`, vừa có người mới đến `+1`), bạn phải **gom toàn bộ các sự kiện tại cùng $x$** để tính tổng biến thiên rồi mới cập nhật đáp án!

**Gợi ý 3:** Duyệt từng nhóm tọa độ $x$ phân biệt theo thứ tự tăng dần: cộng dồn tất cả delta tại $x$ vào biến `cur`. Nếu `cur > best` (dấu lớn hơn **nghiêm ngặt** để luôn giữ thời điểm sớm nhất khi hòa), cập nhật `best = cur` và `best_t = x`. Độ phức tạp $O(N \log N)$.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<pair<long long, int>> events;
    events.reserve((size_t)n * 2);
    for (int i = 0; i < n; ++i) {
        long long l, r;
        cin >> l >> r;
        events.emplace_back(l, 1);
        events.emplace_back(r, -1);
    }
    sort(events.begin(), events.end());

    int cur = 0, best = 0;
    long long best_t = 0;
    int m = (int)events.size();
    for (int i = 0; i < m; ) {
        long long x = events[i].first;
        while (i < m && events[i].first == x) {
            cur += events[i].second;
            ++i;
        }
        if (cur > best) {
            best = cur;
            best_t = x;
        }
    }
    cout << best << " " << best_t << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    events = []
    idx = 1
    for _ in range(n):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        events.append((l, 1))
        events.append((r, -1))
    events.sort()

    cur = 0
    best = 0
    best_t = 0
    m = len(events)
    i = 0
    while i < m:
        x = events[i][0]
        while i < m and events[i][0] == x:
            cur += events[i][1]
            i += 1
        if cur > best:
            best = cur
            best_t = x
    sys.stdout.write(f"{best} {best_t}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
        "extraStressInputs": stress,
    }


# =============================================================================
# Problem 10: cp02-max-kxk-submatrix-updates
# =============================================================================
def build_p10() -> dict:
    rng = random.Random(20260210)

    def make_inp(n: int, m: int, k: int, ops: List[Tuple[int, int, int, int, int]]) -> str:
        lines = [f"{n} {m} {len(ops)} {k}"]
        lines.extend(f"{r1} {c1} {r2} {c2} {v}" for r1, c1, r2, c2, v in ops)
        return "\n".join(lines)

    def brute(inp: str) -> str:
        toks = inp.split()
        n, m, u, k = int(toks[0]), int(toks[1]), int(toks[2]), int(toks[3])
        grid = [[0] * m for _ in range(n)]
        idx = 4
        for _ in range(u):
            r1, c1, r2, c2, v = (
                int(toks[idx]),
                int(toks[idx + 1]),
                int(toks[idx + 2]),
                int(toks[idx + 3]),
                int(toks[idx + 4]),
            )
            idx += 5
            for r in range(r1 - 1, r2):
                for c in range(c1 - 1, c2):
                    grid[r][c] += v
        ans = None
        for r in range(n - k + 1):
            for c in range(m - k + 1):
                s = 0
                for dr in range(k):
                    s += sum(grid[r + dr][c : c + k])
                if ans is None or s > ans:
                    ans = s
        return str(ans)

    def rand_ops(n: int, m: int, u: int, lo: int, hi: int, wide: bool = False) -> List[Tuple[int, int, int, int, int]]:
        ops = []
        for _ in range(u):
            if wide:
                r1 = rng.randint(1, max(1, n // 4))
                r2 = rng.randint(min(n, n - n // 4 + 1), n)
                c1 = rng.randint(1, max(1, m // 4))
                c2 = rng.randint(min(m, m - m // 4 + 1), m)
            else:
                r1, r2 = rng.randint(1, n), rng.randint(1, n)
                c1, c2 = rng.randint(1, m), rng.randint(1, m)
            if r1 > r2:
                r1, r2 = r2, r1
            if c1 > c2:
                c1, c2 = c2, c1
            ops.append((r1, c1, r2, c2, rng.randint(lo, hi)))
        return ops

    tests = [
        # 3 Public samples
        {
            "input": make_inp(3, 3, 2, [(1, 1, 2, 2, 3), (2, 2, 3, 3, 4)]),
            "hidden": False,
            "expected": "19",
            "checkBrute": True,
        },
        {
            "input": make_inp(3, 3, 2, [(1, 1, 3, 3, -5), (2, 2, 3, 3, 2)]),
            "hidden": False,
            "expected": "-12",
            "checkBrute": True,
        },
        {
            "input": make_inp(4, 4, 4, [(1, 1, 4, 4, 10), (2, 2, 3, 3, -15)]),
            "hidden": False,
            "expected": "100",
            "checkBrute": True,
        },
        # 4 Edge/corner cases
        {
            "input": make_inp(1, 1, 1, [(1, 1, 1, 1, 5), (1, 1, 1, 1, -12), (1, 1, 1, 1, 3)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                5,
                5,
                1,
                [(1, 1, 1, 5, 10), (5, 1, 5, 5, 20), (1, 5, 5, 5, 30), (1, 1, 5, 1, -5)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(
                10,
                10,
                3,
                [(1, 1, 10, 10, 10**6), (2, 3, 8, 9, -500), (1, 1, 10, 10, -(10**6)), (2, 3, 8, 9, 500)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(4, 10, 4, rand_ops(4, 10, 15, -100, 100)),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 Medium -> Large tests
        {
            "input": make_inp(20, 25, 5, rand_ops(20, 25, 100, -1000, 1000)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(25, 25, 7, [(1, 1, 25, 25, -50000)] + rand_ops(25, 25, 100, -1000, -1)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(30, 30, 1, rand_ops(30, 30, 150, -10**6, 10**6)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_inp(200, 200, 100, rand_ops(200, 200, 5000, 900000, 10**6, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(200, 200, 80, rand_ops(200, 200, 5000, -(10**6), -900000, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(200, 200, 1, rand_ops(200, 200, 5500, -(10**6), 10**6)),
            "hidden": True,
        },
        {
            "input": make_inp(200, 200, 200, rand_ops(200, 200, 5500, -(10**6), 10**6, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(200, 200, 50, rand_ops(200, 200, 8000, -9, 9, wide=True)),
            "hidden": True,
        },
        {
            "input": make_inp(200, 150, 60, rand_ops(200, 150, 5500, -(10**6), 10**6)),
            "hidden": True,
        },
    ]
    assert_test_sizes("cp02-max-kxk-submatrix-updates", tests)

    stress = []
    for _ in range(15):
        nn = rng.randint(1, 14)
        mm = rng.randint(1, 14)
        kk = rng.randint(1, min(nn, mm))
        uu = rng.randint(1, 25)
        stress.append(make_inp(nn, mm, kk, rand_ops(nn, mm, uu, -10**6, 10**6)))

    return {
        "slug": "cp02-max-kxk-submatrix-updates",
        "title": "Hình vuông K × K có tổng lớn nhất sau cập nhật 2D",
        "shortDescription": "Kết hợp Mảng hiệu 2D để xử lý U thao tác cập nhật hình chữ nhật và Mảng cộng dồn 2D để tìm hình vuông K×K có tổng lớn nhất.",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.prefix_sum",
        "tags": ["mảng", "prefix sum", "mảng hiệu", "tối ưu", "tầng 2"],
        "statement": r"""Cho một lưới ô vuông kích thước $N \times M$ ($N$ hàng đánh số $1..N$, $M$ cột đánh số $1..M$), ban đầu tất cả các ô đều có giá trị bằng $0$.

Bạn thực hiện lần lượt $U$ thao tác cập nhật. Mỗi thao tác cho bởi năm số nguyên $(r_1, c_1, r_2, c_2, v)$, thực hiện cộng thêm $v$ (có thể âm hoặc dương) vào mọi ô $(i, j)$ thỏa mãn $r_1 \le i \le r_2$ và $c_1 \le j \le c_2$.

Sau khi hoàn thành toàn bộ $U$ thao tác, hãy tìm **tổng lớn nhất** của một hình vuông con kích thước $K \times K$ nằm hoàn toàn bên trong lưới $N \times M$.

### Dữ liệu vào
- Dòng đầu tiên chứa bốn số nguyên dương $N, M, U, K$ ($1 \le N, M \le 200$, $1 \le U \le 20\,000$, $1 \le K \le \min(N, M)$).
- $U$ dòng tiếp theo, mỗi dòng chứa năm số nguyên $r_1, c_1, r_2, c_2, v$ ($1 \le r_1 \le r_2 \le N$, $1 \le c_1 \le c_2 \le M$, $|v| \le 10^6$).

### Kết quả
- In ra một số nguyên duy nhất là tổng lớn nhất của một hình vuông con kích thước $K \times K$.

### Ràng buộc
- $1 \le N, M \le 200$
- $1 \le U \le 20\,000$
- $1 \le K \le \min(N, M)$
- $-10^6 \le v \le 10^6$

### Phân bổ điểm (Subtasks)
- **Subtask 1 (30%):** $N, M \le 40$, $U \le 500$.
- **Subtask 2 (30%):** $v \ge 0$ với mọi thao tác và $K = 1$.
- **Subtask 3 (40%):** Không có ràng buộc thêm.

### Giải thích ví dụ
- Ở ví dụ 1 với lưới $3 \times 3$, sau hai thao tác cộng $+3$ vào góc trên-trái $2 \times 2$ và $+4$ vào góc dưới-phải $2 \times 2$, lưới thu được là:
  - Hàng 1: `[3, 3, 0]`, hàng 2: `[3, 7, 4]`, hàng 3: `[0, 4, 4]`.
  - Hình vuông $2 \times 2$ ở góc dưới-phải có tổng lớn nhất: $7 + 4 + 4 + 4 = 19$.
- Ở ví dụ 2: mọi ô trong lưới sau cập nhật đều âm, hình vuông $2 \times 2$ tốt nhất có tổng là $-12$ (lưu ý không khởi tạo đáp án bằng $0$).
- Ở ví dụ 3: $K = 4 = N = M$ nên chỉ có duy nhất một hình vuông là toàn bộ lưới, tổng bằng $16 \times 10 - 4 \times 15 = 100$.
""",
        "requirementsText": REQ_HEADER + "Lưu ý: Tổng hình vuông K×K có thể đạt tới ±8×10^14 và có thể hoàn toàn âm; cần dùng kiểu 64-bit và khởi tạo đáp án bằng -∞ (LLONG_MIN).",
        "hints": r"""**Gợi ý 1:** Bài toán gồm hai giai đoạn tách biệt rõ ràng: (1) khôi phục giá trị cuối cùng của toàn bộ lưới sau $U$ thao tác cộng hình chữ nhật, và (2) tìm tổng lớn nhất trên tất cả các hình vuông con $K \times K$.

**Gợi ý 2:** Cho giai đoạn (1), dùng **Mảng hiệu 2D** kích thước $(N+2) \times (M+2)$. Với mỗi thao tác $(r_1, c_1, r_2, c_2, v)$, cập nhật đúng 4 ô trong $O(1)$:
`D[r1][c1] += v`, `D[r1][c2+1] -= v`, `D[r2+1][c1] -= v`, `D[r2+1][c2+1] += v`.
Sau đó lấy tổng cộng dồn 2D của `D` để khôi phục ma trận kết quả $A[1..N][1..M]$ trong $O(N \cdot M)$.

**Gợi ý 3:** Cho giai đoạn (2), tiếp tục xây dựng **Mảng cộng dồn 2D** $P$ trên ma trận $A$. Duyệt mọi góc dưới-phải $(i, j)$ với $K \le i \le N$ và $K \le j \le M$, tính tổng hình vuông $K \times K$ trong $O(1)$ bằng $P[i][j] - P[i-K][j] - P[i][j-K] + P[i-K][j-K]$ và lấy cực đại (khởi tạo từ `LLONG_MIN`). Tổng độ phức tạp $O(U + N \cdot M)$.
""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, u, k;
    if (!(cin >> n >> m >> u >> k)) return 0;
    vector<vector<long long>> diff(n + 2, vector<long long>(m + 2, 0));
    for (int t = 0; t < u; ++t) {
        int r1, c1, r2, c2;
        long long v;
        cin >> r1 >> c1 >> r2 >> c2 >> v;
        diff[r1][c1] += v;
        diff[r1][c2 + 1] -= v;
        diff[r2 + 1][c1] -= v;
        diff[r2 + 1][c2 + 1] += v;
    }

    vector<vector<long long>> a(n + 1, vector<long long>(m + 1, 0));
    vector<vector<long long>> pref(n + 1, vector<long long>(m + 1, 0));
    for (int i = 1; i <= n; ++i) {
        for (int j = 1; j <= m; ++j) {
            a[i][j] = diff[i][j] + a[i - 1][j] + a[i][j - 1] - a[i - 1][j - 1];
            pref[i][j] = a[i][j] + pref[i - 1][j] + pref[i][j - 1] - pref[i - 1][j - 1];
        }
    }

    long long ans = LLONG_MIN;
    for (int i = k; i <= n; ++i) {
        for (int j = k; j <= m; ++j) {
            long long s = pref[i][j] - pref[i - k][j] - pref[i][j - k] + pref[i - k][j - k];
            if (s > ans) ans = s;
        }
    }
    cout << ans << "\n";
    return 0;
}
""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    it = iter(data)
    n = int(next(it))
    m = int(next(it))
    u = int(next(it))
    k = int(next(it))
    diff = [[0] * (m + 2) for _ in range(n + 2)]
    for _ in range(u):
        r1 = int(next(it))
        c1 = int(next(it))
        r2 = int(next(it))
        c2 = int(next(it))
        v = int(next(it))
        diff[r1][c1] += v
        diff[r1][c2 + 1] -= v
        diff[r2 + 1][c1] -= v
        diff[r2 + 1][c2 + 1] += v

    a = [[0] * (m + 1) for _ in range(n + 1)]
    pref = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        drow = diff[i]
        arow = a[i]
        aprev = a[i - 1]
        prow = pref[i]
        pprev = pref[i - 1]
        d_acc = 0
        p_acc = 0
        for j in range(1, m + 1):
            d_acc += drow[j]
            val = aprev[j] + d_acc
            arow[j] = val
            p_acc += val
            prow[j] = pprev[j] + p_acc

    ans = None
    for i in range(k, n + 1):
        prow = pref[i]
        ptop = pref[i - k]
        for j in range(k, m + 1):
            s = prow[j] - ptop[j] - prow[j - k] + ptop[j - k]
            if ans is None or s > ans:
                ans = s
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
""",
        "tests": tests,
        "brute": brute,
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
        pack_id="02-prefix-sum-arrays",
        title="Tầng 1: Mảng cộng dồn, Mảng hiệu & Map/Set",
        tier="Tầng 1 — Nền tảng",
        description="10 bài nền tảng thi đấu về Prefix Sum 1D/2D, Mảng hiệu (Difference Array), Hash Map đếm đoạn con, Set và kỹ thuật Sweep Line.",
        problems=problems,
    )


if __name__ == "__main__":
    main()
