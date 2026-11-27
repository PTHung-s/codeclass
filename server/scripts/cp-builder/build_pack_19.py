"""
Builder & automated verifier for CodeClass CP Pack 19:
Tầng 2–4: Đề thực chiến HSG & Đa kỹ thuật (Hybrid)

Generates and verifies 10 original Vietnamese competitive programming problems
(2 easy, 4 medium, 4 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import heapq
import itertools
import random
import sys
from collections import deque
from pathlib import Path
from typing import Dict, List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Thực chiến HSG & Hybrid\n"
MOD = 1_000_000_007
SAFE_MAX_BYTES = 148_000


def assert_size(slug: str, idx: int, inp: str) -> str:
    b = len(inp.encode("utf-8"))
    if b > SAFE_MAX_BYTES:
        raise ValueError(f"[{slug}] test #{idx} size {b} > {SAFE_MAX_BYTES}")
    return inp


# ============================================================================
# 1. cp19-hsg-prime-digit-sum-queries
# ============================================================================

def _is_prime_trial(x: int) -> bool:
    if x < 2:
        return False
    if x < 4:
        return True
    if x % 2 == 0 or x % 3 == 0:
        return False
    d = 5
    while d * d <= x:
        if x % d == 0 or x % (d + 2) == 0:
            return False
        d += 6
    return True


def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    q = toks[0]
    out = []
    idx = 1
    for _ in range(q):
        l, r = toks[idx], toks[idx + 1]
        idx += 2
        cnt = 0
        for x in range(l, r + 1):
            if _is_prime_trial(x):
                s = 0
                t = x
                while t:
                    s += t % 10
                    t //= 10
                if _is_prime_trial(s):
                    cnt += 1
        out.append(str(cnt))
    return "\n".join(out)


def fmt_p01(queries: List[Tuple[int, int]]) -> str:
    lines = [str(len(queries))]
    lines.extend(f"{l} {r}" for l, r in queries)
    return "\n".join(lines)


def build_p01() -> dict:
    rng = random.Random(1901)

    tests = [
        # 3 public samples
        {
            "input": fmt_p01([(1, 10), (10, 30), (1, 1)]),
            "hidden": False,
            "expected": "4\n3\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_p01([(100, 120), (20, 25)]),
            "hidden": False,
            "expected": "2\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_p01([(2, 2), (11, 11), (13, 19)]),
            "hidden": False,
            "expected": "1\n1\n0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p01([(1, 1), (4, 4), (9, 10), (13, 13)]),
            "hidden": True,
            "expected": "0\n0\n0\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_p01([(2, 2), (3, 3), (5, 5), (7, 7)]),
            "hidden": True,
            "expected": "1\n1\n1\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_p01([(999980, 1000000), (999983, 999983), (1000000, 1000000)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_p01([(1, 100), (101, 200), (201, 300), (301, 500)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_p01([(i, i) for i in range(1, 51)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    q9 = [(rng.randint(1, 3000), rng.randint(1, 3000)) for _ in range(120)]
    q9 = [(min(a, b), max(a, b)) for a, b in q9]
    tests.append({"input": fmt_p01(q9), "hidden": True, "checkBrute": True})

    q10 = [(rng.randint(1, 5000), rng.randint(1, 5000)) for _ in range(200)]
    q10 = [(min(a, b), max(a, b)) for a, b in q10]
    tests.append({"input": fmt_p01(q10), "hidden": True, "checkBrute": True})

    q11 = [(rng.randint(1, 50_000), rng.randint(1, 50_000)) for _ in range(2_000)]
    q11 = [(min(a, b), max(a, b)) for a, b in q11]
    tests.append({"input": fmt_p01(q11), "hidden": True})

    q12 = [(rng.randint(1, 200_000), rng.randint(1, 200_000)) for _ in range(5_000)]
    q12 = [(min(a, b), max(a, b)) for a, b in q12]
    tests.append({"input": fmt_p01(q12), "hidden": True})

    q13 = [(i * 100 + 1, min(1_000_000, i * 100 + 100)) for i in range(9_999)]
    tests.append({"input": fmt_p01(q13), "hidden": True})

    q14 = [(1, 1_000_000) if i % 2 == 0 else (500_000, 1_000_000) for i in range(8_000)]
    tests.append({"input": fmt_p01(q14), "hidden": True})

    q15 = [(rng.randint(1, 1_000_000), rng.randint(1, 1_000_000)) for _ in range(9_500)]
    q15 = [(min(a, b), max(a, b)) for a, b in q15]
    tests.append({"input": fmt_p01(q15), "hidden": True})

    q16 = []
    for _ in range(10_000):
        a = rng.randint(1, 1_000_000)
        b = rng.randint(a, min(1_000_000, a + rng.randint(0, 500_000)))
        q16.append((a, b))
    tests.append({"input": fmt_p01(q16), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-prime-digit-sum-queries", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        qs = []
        for _ in range(rng.randint(1, 15)):
            a = rng.randint(1, 400)
            b = rng.randint(a, 400)
            qs.append((a, b))
        extra_stress.append(fmt_p01(qs))

    statement = r"""Một số nguyên dương $p$ được gọi là **số nguyên tố song sinh chữ số** nếu thỏa mãn đồng thời hai điều kiện:
1. $p$ là số nguyên tố.
2. Tổng các chữ số trong biểu diễn thập phân của $p$ cũng là một số nguyên tố.

Ví dụ: $23$ là số nguyên tố song sinh chữ số vì $23$ là số nguyên tố và $2 + 3 = 5$ cũng là số nguyên tố. Trong khi đó, $13$ không thỏa mãn vì $1 + 3 = 4$ không phải số nguyên tố.

Cho $Q$ truy vấn, mỗi truy vấn gồm một đoạn $[L, R]$. Hãy đếm số lượng số nguyên tố song sinh chữ số thuộc đoạn $[L, R]$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $Q$ ($1 \le Q \le 10^4$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $L, R$ ($1 \le L \le R \le 10^6$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra một số nguyên duy nhất là kết quả của truy vấn thứ $i$.

### Ràng buộc
- $1 \le Q \le 10^4$
- $1 \le L \le R \le 10^6$

### Subtasks
- **Subtask 1 (30%):** $Q \le 100$, $R \le 5\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Trong đoạn $[1, 10]$ có các số nguyên tố là $2, 3, 5, 7$; tổng chữ số của chúng lần lượt là $2, 3, 5, 7$ đều là số nguyên tố nên có $4$ số. Trong đoạn $[10, 30]$ các số nguyên tố là $11, 13, 17, 19, 23, 29$; chỉ có $11$ (tổng $2$), $23$ (tổng $5$), $29$ (tổng $11$) thỏa mãn nên đáp án là $3$. Đoạn $[1, 1]$ không có số nguyên tố nào nên đáp án là $0$.
- **Ví dụ 2:** Đoạn $[100, 120]$ có các số nguyên tố $101$ (tổng $2$), $103$ ($4$), $107$ ($8$), $109$ ($10$), $113$ ($5$), nên có $2$ số thỏa mãn là $101$ và $113$."""

    hints = r"""**Gợi ý 1:**
Nếu xử lý từng truy vấn bằng cách duyệt từ $L$ đến $R$ rồi kiểm tra nguyên tố thì độ phức tạp sẽ là $O(Q \cdot R \sqrt{R})$, quá chậm khi $Q = 10^4$ và $R = 10^6$. Ta cần tiền xử lý trước khi trả lời truy vấn.

**Gợi ý 2:**
Dùng **Sàng Eratosthenes** để đánh dấu toàn bộ các số nguyên tố trong phạm vi $[1, 10^6]$. Với mỗi số nguyên tố $p \le 10^6$, tổng chữ số $S(p)$ tối đa là $54$ (khi $p = 999\,999$), nên chỉ cần tra bảng nguyên tố cho cả $p$ lẫn $S(p)$.

**Gợi ý 3:**
Xây dựng mảng cộng dồn `pref[x]` đếm số lượng số nguyên tố song sinh chữ số trong đoạn $[1, x]$. Khi đó, mỗi truy vấn $[L, R]$ được trả lời trong $O(1)$ bằng công thức `pref[R] - pref[L - 1]`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const int MAXN = 1000000;
    vector<char> isPrime(MAXN + 1, 1);
    isPrime[0] = isPrime[1] = 0;
    for (int i = 2; 1LL * i * i <= MAXN; ++i) {
        if (isPrime[i]) {
            for (int j = i * i; j <= MAXN; j += i) {
                isPrime[j] = 0;
            }
        }
    }

    vector<int> digitSum(MAXN + 1, 0);
    vector<int> pref(MAXN + 1, 0);
    for (int i = 1; i <= MAXN; ++i) {
        digitSum[i] = digitSum[i / 10] + (i % 10);
        int ok = (isPrime[i] && isPrime[digitSum[i]]) ? 1 : 0;
        pref[i] = pref[i - 1] + ok;
    }

    int q;
    if (!(cin >> q)) return 0;
    while (q--) {
        int l, r;
        cin >> l >> r;
        cout << pref[r] - pref[l - 1] << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    q = int(data[0])

    maxn = 1_000_000
    is_prime = bytearray([1]) * (maxn + 1)
    is_prime[0] = 0
    is_prime[1] = 0
    for i in range(2, int(maxn ** 0.5) + 1):
        if is_prime[i]:
            start = i * i
            step = i
            is_prime[start : maxn + 1 : step] = bytearray(len(range(start, maxn + 1, step)))

    d1000 = [0] * 1000
    for i in range(1, 1000):
        d1000[i] = d1000[i // 10] + (i % 10)

    pref = [0] * (maxn + 1)
    acc = 0
    for i in range(2, maxn + 1):
        if is_prime[i]:
            s = d1000[i // 1000] + d1000[i % 1000]
            if is_prime[s]:
                acc += 1
        pref[i] = acc

    out = []
    idx = 1
    for _ in range(q):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        out.append(str(pref[r] - pref[l - 1]))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-prime-digit-sum-queries",
        "title": "Số nguyên tố song sinh chữ số",
        "shortDescription": "Kết hợp Sàng Eratosthenes và mảng cộng dồn để đếm số nguyên tố có tổng chữ số cũng là nguyên tố trên nhiều truy vấn.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.sieve_eratosthenes",
        "tags": ["hsg", "sàng nguyên tố", "prefix sum", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp19-hsg-subarray-avg-geq-k
# ============================================================================

def brute_p02(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, k = toks[0], toks[1]
    a = toks[2 : 2 + n]
    ans = 0
    for l in range(n):
        s = 0
        for r in range(l, n):
            s += a[r]
            if s >= k * (r - l + 1):
                ans += 1
    return str(ans)


def fmt_p02(k: int, a: List[int]) -> str:
    return f"{len(a)} {k}\n" + " ".join(map(str, a))


def build_p02() -> dict:
    rng = random.Random(1902)

    tests = [
        # 3 public samples
        {
            "input": fmt_p02(2, [1, 3, 2]),
            "hidden": False,
            "expected": "5",
            "checkBrute": True,
        },
        {
            "input": fmt_p02(5, [2, 4, 3]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p02(-2, [-3, -1, -2, 0]),
            "hidden": False,
            "expected": "9",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p02(10, [10]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_p02(10, [9]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p02(0, [0, 0, 0, 0, 0]),
            "hidden": True,
            "expected": "15",
            "checkBrute": True,
        },
        {
            "input": fmt_p02(1_000_000_000, [1_000_000_000, -1_000_000_000, 1_000_000_000, 1_000_000_000]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_p02(-1_000_000_000, [-1_000_000_000, -999_999_999, -1_000_000_000]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p02(50, [rng.randint(-100, 200) for _ in range(150)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p02(-300, [rng.randint(-1000, 1000) for _ in range(300)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p02(0, [rng.randint(-1_000_000_000, 1_000_000_000) for _ in range(5_000)]), "hidden": True})
    tests.append({"input": fmt_p02(500_000_000, [rng.randint(-1_000_000_000, 1_000_000_000) for _ in range(10_000)]), "hidden": True})
    tests.append({"input": fmt_p02(10, [10] * 20_000), "hidden": True})
    tests.append({"input": fmt_p02(11, [10] * 20_000), "hidden": True})
    tests.append({"input": fmt_p02(500, [rng.randint(-5000, 5000) for _ in range(20_000)]), "hidden": True})
    tests.append({"input": fmt_p02(-1234, [rng.randint(-99999, 99999) for _ in range(20_000)]), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-subarray-avg-geq-k", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        k = rng.randint(-50, 50)
        arr = [rng.randint(-100, 100) for _ in range(n)]
        extra_stress.append(fmt_p02(k, arr))

    statement = r"""Cho dãy số nguyên gồm $N$ phần tử $a_1, a_2, \dots, a_N$ và một ngưỡng số nguyên $K$.

Hãy đếm số lượng đoạn con liên tiếp $[l, r]$ ($1 \le l \le r \le N$) sao cho trung bình cộng các phần tử trong đoạn lớn hơn hoặc bằng $K$, tức là:
$$\frac{a_l + a_{l+1} + \dots + a_r}{r - l + 1} \ge K$$

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, K$ ($1 \le N \le 20\,000$, $|K| \le 10^9$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là số đoạn con liên tiếp thỏa mãn điều kiện (lưu ý kết quả có thể vượt quá phạm vi số nguyên 32-bit).

### Ràng buộc
- $1 \le N \le 20\,000$
- $|a_i|, |K| \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Với mảng $[1, 3, 2]$ và $K = 2$, có $6$ đoạn con tất cả: $[1]$ (TB $= 1$), $[3]$ ($3$), $[2]$ ($2$), $[1, 3]$ ($2$), $[3, 2]$ ($2.5$), $[1, 3, 2]$ ($2$). Có $5$ đoạn có trung bình cộng $\ge 2$.
- **Ví dụ 2:** Tất cả các phần tử đều nhỏ hơn $5$, nên mọi đoạn con đều có trung bình cộng $< 5$."""

    hints = r"""**Gợi ý 1:**
Điều kiện $\frac{a_l + \dots + a_r}{r - l + 1} \ge K$ tương đương với $\sum_{i=l}^{r} (a_i - K) \ge 0$. Đặt $b_i = a_i - K$, bài toán quy về đếm số đoạn con có tổng không âm.

**Gợi ý 2:**
Gọi $P_0 = 0$ và $P_i = b_1 + b_2 + \dots + b_i$ với $1 \le i \le N$. Đoạn $[l, r]$ có tổng $\ge 0$ khi và chỉ khi $P_r - P_{l-1} \ge 0 \iff P_{l-1} \le P_r$ (với $0 \le l - 1 < r \le N$).

**Gợi ý 3:**
Để đếm số cặp $(i, j)$ với $0 \le i < j \le N$ thỏa mãn $P_i \le P_j$ trong $O(N \log N)$, ta có thể dùng **Chia để trị (Merge Sort)** hoặc **Nén tọa độ kết hợp Fenwick Tree (BIT)**. Chú ý dùng kiểu 64-bit (`long long`) cho $P_i$ và đáp án."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long k;
    if (!(cin >> n >> k)) return 0;

    vector<long long> pref(n + 1, 0);
    for (int i = 1; i <= n; ++i) {
        long long x;
        cin >> x;
        pref[i] = pref[i - 1] + (x - k);
    }

    vector<long long> vals = pref;
    sort(vals.begin(), vals.end());
    vals.erase(unique(vals.begin(), vals.end()), vals.end());

    int m = (int)vals.size();
    vector<int> bit(m + 1, 0);
    auto add = [&](int idx, int delta) {
        for (; idx <= m; idx += idx & -idx) bit[idx] += delta;
    };
    auto query = [&](int idx) {
        int s = 0;
        for (; idx > 0; idx -= idx & -idx) s += bit[idx];
        return s;
    };

    long long ans = 0;
    for (int i = 0; i <= n; ++i) {
        int id = (int)(lower_bound(vals.begin(), vals.end(), pref[i]) - vals.begin()) + 1;
        ans += query(id);
        add(id, 1);
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
    k = int(data[1])

    pref = [0] * (n + 1)
    s = 0
    for i in range(n):
        s += int(data[2 + i]) - k
        pref[i + 1] = s

    vals = sorted(set(pref))
    m = len(vals)
    bit = [0] * (m + 1)

    ans = 0
    for p in pref:
        idx = bisect.bisect_left(vals, p) + 1
        j = idx
        while j > 0:
            ans += bit[j]
            j -= j & -j
        j = idx
        while j <= m:
            bit[j] += 1
            j += j & -j

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-subarray-avg-geq-k",
        "title": "Đoạn con có trung bình đạt ngưỡng",
        "shortDescription": "Biến đổi trừ K để đưa bài toán trung bình cộng về đếm cặp tiền tố thuận bằng BIT hoặc Merge Sort.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.prefix_sum",
        "tags": ["hsg", "prefix sum", "chia để trị", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp19-hsg-grid-min-effort-bs-bfs
# ============================================================================

def brute_p03(inp: str) -> str:
    # Independent oracle: Dijkstra min-max path
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    h = toks[2 : 2 + n * m]
    if n == 1 and m == 1:
        return "0"
    inf = 10**18
    dist = [inf] * (n * m)
    dist[0] = 0
    pq = [(0, 0)]
    target = n * m - 1
    while pq:
        d, u = heapq.heappop(pq)
        if d != dist[u]:
            continue
        if u == target:
            return str(d)
        r, c = divmod(u, m)
        hu = h[u]
        if r > 0:
            v = u - m
            nd = max(d, abs(hu - h[v]))
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
        if r + 1 < n:
            v = u + m
            nd = max(d, abs(hu - h[v]))
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
        if c > 0:
            v = u - 1
            nd = max(d, abs(hu - h[v]))
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
        if c + 1 < m:
            v = u + 1
            nd = max(d, abs(hu - h[v]))
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return str(dist[target])


def fmt_p03(grid: List[List[int]]) -> str:
    n = len(grid)
    m = len(grid[0])
    lines = [f"{n} {m}"]
    lines.extend(" ".join(map(str, row)) for row in grid)
    return "\n".join(lines)


def build_p03() -> dict:
    rng = random.Random(1903)

    tests = [
        # 3 public samples
        {
            "input": fmt_p03([[1, 2, 2], [3, 8, 2], [5, 3, 5]]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": fmt_p03([[1, 2, 3], [3, 8, 4], [5, 3, 5]]),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_p03([[1, 2, 1, 1, 1], [1, 2, 1, 2, 1], [1, 2, 1, 2, 1], [1, 2, 1, 2, 1], [1, 1, 1, 2, 1]]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p03([[42]]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p03([[0, 1_000_000_000]]),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_p03([[5], [12], [7], [20]]),
            "hidden": True,
            "expected": "13",
            "checkBrute": True,
        },
        {
            "input": fmt_p03([[7, 7, 7], [7, 7, 7]]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p03([[1, 100, 100], [1, 100, 100], [1, 1, 1]]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p03([[rng.randint(0, 500) for _ in range(25)] for _ in range(25)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p03([[rng.randint(0, 10**6) for _ in range(50)] for _ in range(50)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p03([[rng.randint(0, 10**9) for _ in range(110)] for _ in range(110)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p03([[rng.randint(0, 100) for _ in range(180)] for _ in range(180)]), "hidden": True})

    # Snake corridor with large walls
    g13 = [[10**8] * 120 for _ in range(120)]
    for r in range(120):
        if r % 2 == 0:
            for c in range(120):
                g13[r][c] = r * 10 + c
        else:
            g13[r][119 if (r // 2) % 2 == 0 else 0] = r * 10
    tests.append({"input": fmt_p03(g13), "hidden": True})

    tests.append({"input": fmt_p03([[rng.randint(0, 999) for _ in range(180)] for _ in range(180)]), "hidden": True})
    tests.append({"input": fmt_p03([[(i * 13 + j * 7) % 500 for j in range(180)] for i in range(180)]), "hidden": True})

    g16 = [[rng.randint(0, 999) for _ in range(180)] for _ in range(180)]
    g16[0][0] = 0
    g16[179][179] = 999
    tests.append({"input": fmt_p03(g16), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-grid-min-effort-bs-bfs", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 12)
        m = rng.randint(1, 12)
        g = [[rng.randint(0, 100) for _ in range(m)] for _ in range(n)]
        extra_stress.append(fmt_p03(g))

    statement = r"""Một robot địa hình di chuyển trên bản đồ lưới chữ nhật kích thước $N \times M$ ($1 \le N, M \le 180$). Ô ở hàng $i$, cột $j$ có độ cao là $h_{i,j}$ ($0 \le h_{i,j} \le 10^9$).

Robot xuất phát từ ô $(1, 1)$ và cần đi tới ô $(N, M)$. Tại mỗi bước, robot có thể di chuyển sang một trong $4$ ô kề cạnh (lên, xuống, trái, phải) nằm trong lưới.

**Chi phí** của một đường đi được định nghĩa là giá trị lớn nhất của chênh lệch độ cao $|h(u) - h(v)|$ giữa hai ô kề nhau liên tiếp trên đường đi đó (nếu $N = M = 1$, chi phí là $0$).

Hãy tìm chi phí nhỏ nhất có thể để robot đi từ $(1, 1)$ đến $(N, M)$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N, M \le 180$).
- $N$ dòng tiếp theo, mỗi dòng gồm $M$ số nguyên $h_{i,j}$ ($0 \le h_{i,j} \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là chi phí nhỏ nhất tìm được.

### Ràng buộc
- $1 \le N, M \le 180$
- $0 \le h_{i,j} \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N, M \le 20$, $h_{i,j} \le 100$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đường đi $(1,1) \to (2,1) \to (3,1) \to (3,2) \to (3,3)$ qua các độ cao $1 \to 3 \to 5 \to 3 \to 5$ có độ lệch giữa hai ô kề nhau tối đa là $|3 - 1| = 2$. Không có đường đi nào tốt hơn.
- **Ví dụ 2:** Đường đi $1 \to 2 \to 3 \to 4 \to 5$ dọc theo hàng $1$ và cột $3$ có mọi bước chênh lệch đều là $1$.
- **Ví dụ 3:** Có đường đi toàn các ô độ cao $1$ nên chi phí là $0$."""

    hints = r"""**Gợi ý 1:**
Bài toán yêu cầu **cực tiểu hóa giá trị lớn nhất** trên đường đi. Đây là dấu hiệu kinh điển của kỹ thuật **Tìm kiếm nhị phân trên đáp án**.

**Gợi ý 2:**
Nếu ta cố định một ngưỡng chênh lệch $X$, bài toán kiểm tra trở thành: *"Có tồn tại đường đi từ $(1, 1)$ tới $(N, M)$ mà mọi bước chuyển giữa hai ô kề nhau $u, v$ đều thỏa $|h(u) - h(v)| \le X$ hay không?"*.

**Gợi ý 3:**
Hàm kiểm tra `can(X)` có tính đơn điệu (nếu đi được với $X$ thì cũng đi được với mọi $X' > X$) và có thể thực hiện bằng **BFS** hoặc **DFS** trong $O(N \cdot M)$. Tìm kiếm nhị phân trên đoạn $[0, \max |h(u) - h(v)|]$ mất $O(\log(\max h))$ bước, tổng độ phức tạp $O(N \cdot M \cdot \log(\max h))$ (hoặc có thể dùng thuật toán Dijkstra minimax)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;
    int nm = n * m;
    vector<int> h(nm);
    int minH = INT_MAX, maxH = INT_MIN;
    for (int i = 0; i < nm; ++i) {
        cin >> h[i];
        minH = min(minH, h[i]);
        maxH = max(maxH, h[i]);
    }
    if (nm == 1) {
        cout << 0 << '\n';
        return 0;
    }

    vector<char> vis(nm);
    vector<int> q(nm);
    auto can = [&](int limit) -> bool {
        fill(vis.begin(), vis.end(), 0);
        int head = 0, tail = 0;
        vis[0] = 1;
        q[tail++] = 0;
        while (head < tail) {
            int u = q[head++];
            if (u == nm - 1) return true;
            int r = u / m, c = u % m;
            int hu = h[u];
            if (r > 0) {
                int v = u - m;
                if (!vis[v] && abs(hu - h[v]) <= limit) {
                    vis[v] = 1;
                    q[tail++] = v;
                }
            }
            if (r + 1 < n) {
                int v = u + m;
                if (!vis[v] && abs(hu - h[v]) <= limit) {
                    vis[v] = 1;
                    q[tail++] = v;
                }
            }
            if (c > 0) {
                int v = u - 1;
                if (!vis[v] && abs(hu - h[v]) <= limit) {
                    vis[v] = 1;
                    q[tail++] = v;
                }
            }
            if (c + 1 < m) {
                int v = u + 1;
                if (!vis[v] && abs(hu - h[v]) <= limit) {
                    vis[v] = 1;
                    q[tail++] = v;
                }
            }
        }
        return false;
    };

    int lo = 0, hi = maxH - minH, ans = hi;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (can(mid)) {
            ans = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys
from collections import deque


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    nm = n * m
    if nm == 1:
        sys.stdout.write("0\n")
        return

    h = list(map(int, data[2 : 2 + nm]))
    target = nm - 1

    def can(limit: int) -> bool:
        vis = bytearray(nm)
        vis[0] = 1
        dq = deque([0])
        while dq:
            u = dq.popleft()
            hu = h[u]
            r, c = divmod(u, m)
            if r > 0:
                v = u - m
                if not vis[v] and abs(hu - h[v]) <= limit:
                    if v == target:
                        return True
                    vis[v] = 1
                    dq.append(v)
            if r + 1 < n:
                v = u + m
                if not vis[v] and abs(hu - h[v]) <= limit:
                    if v == target:
                        return True
                    vis[v] = 1
                    dq.append(v)
            if c > 0:
                v = u - 1
                if not vis[v] and abs(hu - h[v]) <= limit:
                    if v == target:
                        return True
                    vis[v] = 1
                    dq.append(v)
            if c + 1 < m:
                v = u + 1
                if not vis[v] and abs(hu - h[v]) <= limit:
                    if v == target:
                        return True
                    vis[v] = 1
                    dq.append(v)
        return False

    lo = 0
    hi = max(h) - min(h)
    ans = hi
    while lo <= hi:
        mid = (lo + hi) >> 1
        if can(mid):
            ans = mid
            hi = mid - 1
        else:
            lo = mid + 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-grid-min-effort-bs-bfs",
        "title": "Vượt địa hình chi phí nhỏ nhất",
        "shortDescription": "Kết hợp tìm kiếm nhị phân trên đáp án và BFS trên lưới để cực tiểu hóa độ lệch độ cao lớn nhất.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.binary_search_answer",
        "tags": ["hsg", "tìm kiếm nhị phân", "bfs-dfs", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp19-hsg-lis-count-bit
# ============================================================================

def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    dp_len = [1] * n
    dp_cnt = [1] * n
    for i in range(n):
        ai = a[i]
        for j in range(i):
            if a[j] < ai:
                if dp_len[j] + 1 > dp_len[i]:
                    dp_len[i] = dp_len[j] + 1
                    dp_cnt[i] = dp_cnt[j]
                elif dp_len[j] + 1 == dp_len[i]:
                    dp_cnt[i] = (dp_cnt[i] + dp_cnt[j]) % MOD
    best = max(dp_len)
    total = sum(dp_cnt[i] for i in range(n) if dp_len[i] == best) % MOD
    return f"{best} {total}"


def fmt_p04(a: List[int]) -> str:
    return f"{len(a)}\n" + " ".join(map(str, a))


def build_p04() -> dict:
    rng = random.Random(1904)

    tests = [
        # 3 public samples
        {
            "input": fmt_p04([1, 3, 5, 4, 7]),
            "hidden": False,
            "expected": "4 2",
            "checkBrute": True,
        },
        {
            "input": fmt_p04([2, 2, 2, 2, 2]),
            "hidden": False,
            "expected": "1 5",
            "checkBrute": True,
        },
        {
            "input": fmt_p04([1, 2, 2, 3, 3, 4]),
            "hidden": False,
            "expected": "4 4",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p04([42]),
            "hidden": True,
            "expected": "1 1",
            "checkBrute": True,
        },
        {
            "input": fmt_p04([5, 4, 3, 2, 1]),
            "hidden": True,
            "expected": "1 5",
            "checkBrute": True,
        },
        {
            "input": fmt_p04([-1_000_000_000, 0, 1_000_000_000]),
            "hidden": True,
            "expected": "3 1",
            "checkBrute": True,
        },
        {
            "input": fmt_p04([1, 2, 1, 2, 1, 2, 1, 2]),
            "hidden": True,
            "expected": "2 10",
            "checkBrute": True,
        },
        {
            "input": fmt_p04([10, 20, 10, 30, 20, 50, 40, 60]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p04([rng.randint(-50, 50) for _ in range(150)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p04([rng.randint(-1000, 1000) for _ in range(400)]), "hidden": True, "checkBrute": True})

    # Exponential count mod 10^9+7: pairs of equal elements (2^100 mod MOD)
    a11 = []
    for k in range(1, 201):
        a11.extend([k, k])
    tests.append({"input": fmt_p04(a11), "hidden": True, "checkBrute": True})

    tests.append({"input": fmt_p04([rng.randint(-1_000_000_000, 1_000_000_000) for _ in range(10_000)]), "hidden": True})
    tests.append({"input": fmt_p04(list(range(1, 15_001))), "hidden": True})
    tests.append({"input": fmt_p04(list(range(15_000, 0, -1))), "hidden": True})

    # Blocks of duplicates for massive MOD testing
    a15 = []
    for k in range(1, 3_001):
        a15.extend([k] * 5)
    tests.append({"input": fmt_p04(a15), "hidden": True})

    tests.append({"input": fmt_p04([rng.randint(-10_000_000, 10_000_000) for _ in range(15_000)]), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-lis-count-bit", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 30)
        arr = [rng.randint(-10, 10) for _ in range(n)]
        extra_stress.append(fmt_p04(arr))

    statement = r"""Cho một dãy gồm $N$ số nguyên $a_1, a_2, \dots, a_N$.

Một dãy con tăng **nghiêm ngặt** là dãy $a_{i_1}, a_{i_2}, \dots, a_{i_L}$ sao cho $1 \le i_1 < i_2 < \dots < i_L \le N$ và $a_{i_1} < a_{i_2} < \dots < a_{i_L}$. Hai dãy con được coi là khác nhau nếu tập hợp chỉ số $\{i_1, i_2, \dots, i_L\}$ của chúng khác nhau.

Hãy tìm:
1. Độ dài $L_{\max}$ của dãy con tăng nghiêm ngặt dài nhất.
2. Số lượng dãy con tăng nghiêm ngặt khác nhau có độ dài đúng bằng $L_{\max}$, lấy phần dư khi chia cho $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($1 \le N \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một dòng duy nhất gồm hai số nguyên cách nhau bởi một dấu cách: $L_{\max}$ và số lượng dãy con đạt độ dài $L_{\max}$ modulo $10^9 + 7$.

### Ràng buộc
- $1 \le N \le 15\,000$
- $|a_i| \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Các dãy con tăng dài nhất có độ dài $4$ là $[1, 3, 5, 7]$ và $[1, 3, 4, 7]$. Vậy đáp án là `4 2`.
- **Ví dụ 2:** Mọi phần tử đều bằng $2$ nên độ dài tăng nghiêm ngặt tối đa là $1$, có $5$ cách chọn chỉ số khác nhau (`1 5`).
- **Ví dụ 3:** Chọn $1$, một trong hai số $2$, một trong hai số $3$, và $4$, tạo được $1 \times 2 \times 2 \times 1 = 4$ dãy con có độ dài $4$."""

    hints = r"""**Gợi ý 1:**
Quy hoạch động $O(N^2)$ thông thường giữ `len[i]` là độ dài LIS kết thúc tại $i$ và `cnt[i]` là số cách đạt được `len[i]`. Để tăng tốc lên $O(N \log N)$, ta cần truy vấn nhanh trên các giá trị nhỏ hơn $a_i$.

**Gợi ý 2:**
Dùng **Nén tọa độ (Coordinate Compression)** để ánh xạ các giá trị $a_i$ vào tập $\{1, 2, \dots, M\}$ ($M \le N$). Xây dựng **Fenwick Tree (BIT)** sao cho mỗi nút lưu một cặp `(max_len, count)` — độ dài lớn nhất và tổng số cách đạt độ dài đó trong đoạn tiền tố.

**Gợi ý 3:**
Định nghĩa phép gộp hai cặp `(l1, c1)` và `(l2, c2)`: lấy cặp có độ dài lớn hơn; nếu `l1 == l2` thì giữ nguyên độ dài và cộng `c1 + c2` modulo $10^9 + 7$. Khi duyệt tới $a_i$, truy vấn tiền tố `[1 .. rank(a_i) - 1]` trên BIT để lấy `(best_len, best_cnt)`, từ đó cập nhật lại tại `rank(a_i)`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const int MOD = 1000000007;

struct Node {
    int len;
    int cnt;
};

Node combine(const Node& a, const Node& b) {
    if (a.len > b.len) return a;
    if (b.len > a.len) return b;
    if (a.len == 0) return {0, 0};
    int c = a.cnt + b.cnt;
    if (c >= MOD) c -= MOD;
    return {a.len, c};
}

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

    vector<Node> bit(m + 1, {0, 0});
    auto update = [&](int idx, const Node& val) {
        for (; idx <= m; idx += idx & -idx) {
            bit[idx] = combine(bit[idx], val);
        }
    };
    auto query = [&](int idx) {
        Node res{0, 0};
        for (; idx > 0; idx -= idx & -idx) {
            res = combine(res, bit[idx]);
        }
        return res;
    };

    Node ans{0, 0};
    for (int i = 0; i < n; ++i) {
        int r = (int)(lower_bound(vals.begin(), vals.end(), a[i]) - vals.begin()) + 1;
        Node prev = query(r - 1);
        Node cur = (prev.len == 0) ? Node{1, 1} : Node{prev.len + 1, prev.cnt};
        update(r, cur);
        ans = combine(ans, cur);
    }

    cout << ans.len << ' ' << ans.cnt << '\n';
    return 0;
}"""

    py_sol = r"""import bisect
import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = list(map(int, data[1 : 1 + n]))

    vals = sorted(set(a))
    m = len(vals)
    bit_len = [0] * (m + 1)
    bit_cnt = [0] * (m + 1)

    ans_len = 0
    ans_cnt = 0

    for x in a:
        idx = bisect.bisect_left(vals, x) + 1
        bl = 0
        bc = 0
        j = idx - 1
        while j > 0:
            lj = bit_len[j]
            if lj > bl:
                bl = lj
                bc = bit_cnt[j]
            elif lj == bl and lj > 0:
                bc = (bc + bit_cnt[j]) % MOD
            j -= j & -j

        cur_len = bl + 1
        cur_cnt = bc if bl > 0 else 1

        j = idx
        while j <= m:
            lj = bit_len[j]
            if cur_len > lj:
                bit_len[j] = cur_len
                bit_cnt[j] = cur_cnt
            elif cur_len == lj:
                bit_cnt[j] = (bit_cnt[j] + cur_cnt) % MOD
            j += j & -j

        if cur_len > ans_len:
            ans_len = cur_len
            ans_cnt = cur_cnt
        elif cur_len == ans_len:
            ans_cnt = (ans_cnt + cur_cnt) % MOD

    sys.stdout.write(f"{ans_len} {ans_cnt}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-lis-count-bit",
        "title": "Độ dài và số lượng dãy con tăng dài nhất",
        "shortDescription": "Kết hợp nén tọa độ và Fenwick Tree lưu cặp (độ dài, số cách) để đếm số lượng LIS.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.dp_lis_lcs",
        "tags": ["hsg", "quy hoạch động", "bit-fenwick", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp19-hsg-k-free-edges-dijkstra
# ============================================================================

def brute_p05(inp: str) -> str:
    # Independent oracle: Bellman-Ford layered DP
    toks = list(map(int, inp.split()))
    n, m, k = toks[0], toks[1], toks[2]
    edges = []
    idx = 3
    for _ in range(m):
        edges.append((toks[idx], toks[idx + 1], toks[idx + 2]))
        idx += 3

    inf = 10**20
    dp = [[inf] * (n + 1) for _ in range(k + 1)]
    dp[0][1] = 0
    for u_layer in range(k + 1):
        # Relax within layer u_layer (n - 1 rounds)
        row = dp[u_layer]
        for _ in range(n - 1):
            changed = False
            for u, v, w in edges:
                if row[u] + w < row[v]:
                    row[v] = row[u] + w
                    changed = True
                if row[v] + w < row[u]:
                    row[u] = row[v] + w
                    changed = True
            if not changed:
                break
        # Transition to u_layer + 1 using 1 free edge
        if u_layer < k:
            nxt = dp[u_layer + 1]
            for u, v, _ in edges:
                if row[u] < nxt[v]:
                    nxt[v] = row[u]
                if row[v] < nxt[u]:
                    nxt[u] = row[v]

    ans = min(dp[used][n] for used in range(k + 1))
    return "-1" if ans >= inf // 2 else str(ans)


def fmt_p05(n: int, k: int, edges: List[Tuple[int, int, int]]) -> str:
    lines = [f"{n} {len(edges)} {k}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    return "\n".join(lines)


def build_p05() -> dict:
    rng = random.Random(1905)

    tests = [
        # 3 public samples
        {
            "input": fmt_p05(4, 1, [(1, 2, 10), (2, 3, 20), (3, 4, 30), (1, 4, 100)]),
            "hidden": False,
            "expected": "30",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(5, 2, [(1, 2, 5), (2, 3, 100), (3, 4, 5), (4, 5, 200)]),
            "hidden": False,
            "expected": "10",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(4, 2, [(1, 2, 10), (3, 4, 10)]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p05(1, 3, []),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(4, 0, [(1, 2, 7), (2, 3, 8), (3, 4, 9), (1, 4, 25)]),
            "hidden": True,
            "expected": "24",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(3, 5, [(1, 2, 1_000_000_000), (2, 3, 1_000_000_000)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(3, 1, [(1, 2, 100), (1, 2, 5), (2, 3, 1_000_000_000)]),
            "hidden": True,
            "expected": "5",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(5, 1, [(1, 2, 1_000_000_000), (2, 3, 1_000_000_000), (3, 4, 1_000_000_000), (4, 5, 1_000_000_000)]),
            "hidden": True,
            "expected": "3000000000",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    e9 = [(rng.randint(1, 40), rng.randint(1, 40), rng.randint(1, 1000)) for _ in range(90)]
    tests.append({"input": fmt_p05(40, 2, e9), "hidden": True, "checkBrute": True})

    e10 = [(rng.randint(1, 60), rng.randint(1, 60), rng.randint(1, 10**6)) for _ in range(150)]
    tests.append({"input": fmt_p05(60, 4, e10), "hidden": True, "checkBrute": True})

    # Long chain N=4000, K=5
    e11 = [(i, i + 1, rng.randint(1, 1000)) for i in range(1, 4000)]
    tests.append({"input": fmt_p05(4000, 5, e11), "hidden": True})

    # Sparse random connected + 64-bit weights
    e12 = [(i, i + 1, rng.randint(1, 1_000_000_000)) for i in range(1, 2500)]
    for _ in range(3500):
        e12.append((rng.randint(1, 2500), rng.randint(1, 2500), rng.randint(1, 1_000_000_000)))
    tests.append({"input": fmt_p05(2500, 5, e12), "hidden": True})

    # Disconnected large
    e13 = [(rng.randint(1, 2000), rng.randint(1, 2000), rng.randint(1, 5000)) for _ in range(4000)]
    e13.extend((rng.randint(2001, 4000), rng.randint(2001, 4000), rng.randint(1, 5000)) for _ in range(4000))
    tests.append({"input": fmt_p05(4000, 5, e13), "hidden": True})

    # Max N=4000, compact weights
    e14 = [(i, i + 1, rng.randint(1, 99)) for i in range(1, 4000)]
    for _ in range(7_000):
        e14.append((rng.randint(1, 4000), rng.randint(1, 4000), rng.randint(1, 99)))
    tests.append({"input": fmt_p05(4000, 5, e14), "hidden": True})

    # K=0 large
    e15 = [(i, i + 1, rng.randint(1, 99)) for i in range(1, 4000)]
    for _ in range(6_500):
        e15.append((rng.randint(1, 4000), rng.randint(1, 4000), rng.randint(1, 99)))
    tests.append({"input": fmt_p05(4000, 0, e15), "hidden": True})

    # Layered shortcut trap
    e16 = [(i, i + 1, 50) for i in range(1, 4000)]
    for _ in range(6_500):
        u = rng.randint(1, 3999)
        v = min(4000, u + rng.randint(1, 400))
        e16.append((u, v, rng.randint(1, 99)))
    tests.append({"input": fmt_p05(4000, 5, e16), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-k-free-edges-dijkstra", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 14)
        m = rng.randint(0, 28)
        k = rng.randint(0, 5)
        edges = [(rng.randint(1, n), rng.randint(1, n), rng.randint(1, 100)) for _ in range(m)]
        extra_stress.append(fmt_p05(n, k, edges))

    tests[0] = {
        "input": fmt_p05(4, 1, [(1, 2, 10), (2, 3, 20), (3, 4, 30), (1, 3, 35)]),
        "hidden": False,
        "expected": "30",
        "checkBrute": True,
    }
    statement = r"""Một mạng giao thông gồm $N$ nút giao thông đánh số từ $1$ đến $N$ và $M$ tuyến đường hai chiều. Tuyến đường thứ $i$ nối hai nút $u_i, v_i$ và có phí đi qua là $w_i$ ($1 \le w_i \le 10^9$).

Bạn cần đi từ nút $1$ đến nút $N$. Đặc biệt, bạn được cấp tối đa $K$ phiếu ưu đãi ($0 \le K \le 5$): mỗi phiếu cho phép bạn đi qua **một** tuyến đường bất kỳ trên hành trình với chi phí bằng $0$. Không bắt buộc phải dùng hết tất cả $K$ phiếu.

Hãy tìm tổng chi phí nhỏ nhất để đi từ $1$ đến $N$, hoặc in ra `-1` nếu không tồn tại đường đi.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, M, K$ ($1 \le N \le 4\,000$, $0 \le M \le 12\,000$, $0 \le K \le 5$).
- $M$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $1 \le w_i \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là chi phí nhỏ nhất tìm được, hoặc `-1` nếu không thể đến $N$.

### Ràng buộc
- $1 \le N \le 4\,000$
- $0 \le M \le 12\,000$
- $0 \le K \le 5$
- $1 \le w_i \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $K = 0$.
- **Subtask 2 (70%):** $0 \le K \le 5$.

### Giải thích ví dụ
- **Ví dụ 1:** Đường đi $1 \to 2 \to 3 \to 4$ gồm các cạnh có chi phí $10, 20, 30$. Dùng $1$ phiếu miễn phí cho cạnh $(3, 4)$ còn lại $10 + 20 = 30$. Đường đi $1 \to 3 \to 4$ gồm các cạnh $35, 30$, miễn phí cạnh $(1, 3)$ vẫn tốn $30$.
- **Ví dụ 2:** Đường đi $1 \to 2 \to 3 \to 4 \to 5$ có $4$ cạnh với chi phí $5, 100, 5, 200$. Dùng $2$ phiếu miễn phí cho hai cạnh đắt nhất ($100$ và $200$), tổng còn $5 + 5 = 10$.
- **Ví dụ 3:** Nút $1$ và nút $4$ không liên thông nên in ra `-1`."""

    hints = r"""**Gợi ý 1:**
Chiến lược tham lam "tìm đường ngắn nhất trước rồi mới bỏ $K$ cạnh lớn nhất" là **sai**, vì đường đi dài hơn ban đầu nhưng có ít cạnh đắt tiền hơn có thể rẻ hơn sau khi miễn phí.

**Gợi ý 2:**
Mở rộng khái niệm đỉnh thành trạng thái $(u, j)$ với $1 \le u \le N$ và $0 \le j \le K$, biểu diễn việc đứng tại nút $u$ và đã dùng $j$ phiếu miễn phí. Khi đó đồ thị có $(K + 1)$ tầng.

**Gợi ý 3:**
Chạy **Dijkstra** từ trạng thái $(1, 0)$. Từ $(u, j)$ qua cạnh $(u, v, w)$ có hai chuyển tiếp:
- Không dùng phiếu: sang $(v, j)$ với chi phí cộng thêm $w$.
- Dùng phiếu (nếu $j < K$): sang $(v, j + 1)$ với chi phí cộng thêm $0$.
Kết quả là $\min_{0 \le j \le K} \text{dist}[N][j]$. Nhớ dùng kiểu 64-bit (`long long`)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, k;
    if (!(cin >> n >> m >> k)) return 0;

    vector<vector<pair<int, int>>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v, w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    const long long INF = (long long)4e18;
    int stride = k + 1;
    vector<long long> dist((n + 1) * stride, INF);
    using State = pair<long long, int>;
    priority_queue<State, vector<State>, greater<State>> pq;

    dist[1 * stride + 0] = 0;
    pq.push({0, 1 * stride + 0});

    while (!pq.empty()) {
        auto [d, st] = pq.top();
        pq.pop();
        if (d != dist[st]) continue;
        int u = st / stride;
        int used = st % stride;
        if (u == n) {
            cout << d << '\n';
            return 0;
        }
        for (auto [v, w] : adj[u]) {
            int nxt1 = v * stride + used;
            if (d + w < dist[nxt1]) {
                dist[nxt1] = d + w;
                pq.push({d + w, nxt1});
            }
            if (used < k) {
                int nxt2 = v * stride + (used + 1);
                if (d < dist[nxt2]) {
                    dist[nxt2] = d;
                    pq.push({d, nxt2});
                }
            }
        }
    }

    cout << -1 << '\n';
    return 0;
}"""

    py_sol = r"""import heapq
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    k = int(data[2])

    adj = [[] for _ in range(n + 1)]
    idx = 3
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    inf = 10**18
    stride = k + 1
    dist = [inf] * ((n + 1) * stride)
    start = 1 * stride
    dist[start] = 0
    pq = [(0, start)]

    while pq:
        d, st = heapq.heappop(pq)
        if d != dist[st]:
            continue
        u = st // stride
        if u == n:
            sys.stdout.write(f"{d}\n")
            return
        used = st % stride
        for v, w in adj[u]:
            nxt1 = v * stride + used
            nd1 = d + w
            if nd1 < dist[nxt1]:
                dist[nxt1] = nd1
                heapq.heappush(pq, (nd1, nxt1))
            if used < k:
                nxt2 = nxt1 + 1
                if d < dist[nxt2]:
                    dist[nxt2] = d
                    heapq.heappush(pq, (d, nxt2))

    sys.stdout.write("-1\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-k-free-edges-dijkstra",
        "title": "Hành trình miễn phí K tuyến đường",
        "shortDescription": "Dijkstra phân tầng (Layered Dijkstra) trên K + 1 trạng thái số lần sử dụng phiếu miễn phí cạnh.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.graph_shortest_path",
        "tags": ["hsg", "dijkstra", "quy hoạch động", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp19-hsg-weighted-interval-projects
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    projs = []
    idx = 1
    for _ in range(n):
        projs.append((toks[idx], toks[idx + 1], toks[idx + 2]))
        idx += 3
    if n <= 16:
        projs.sort(key=lambda x: x[1])
        best = 0
        for mask in range(1 << n):
            last_b = -1
            cur = 0
            ok = True
            for i in range(n):
                if (mask >> i) & 1:
                    if projs[i][0] <= last_b:
                        ok = False
                        break
                    last_b = projs[i][1]
                    cur += projs[i][2]
            if ok and cur > best:
                best = cur
        return str(best)

    # O(N^2) DP independent oracle
    projs.sort(key=lambda x: x[1])
    dp = [0] * n
    for i in range(n):
        ai, _, pi = projs[i]
        best = pi
        for j in range(i):
            if projs[j][1] < ai and dp[j] + pi > best:
                best = dp[j] + pi
        dp[i] = max(best, dp[i - 1] if i > 0 else 0)
    return str(dp[-1])


def fmt_p06(projs: List[Tuple[int, int, int]]) -> str:
    lines = [str(len(projs))]
    lines.extend(f"{a} {b} {p}" for a, b, p in projs)
    return "\n".join(lines)


def build_p06() -> dict:
    rng = random.Random(1906)

    tests = [
        # 3 public samples
        {
            "input": fmt_p06([(2, 4, 4), (3, 6, 6), (6, 8, 2), (5, 7, 3)]),
            "hidden": False,
            "expected": "7",
            "checkBrute": True,
        },
        {
            "input": fmt_p06([(1, 3, 5), (3, 5, 6), (4, 6, 4)]),
            "hidden": False,
            "expected": "9",
            "checkBrute": True,
        },
        {
            "input": fmt_p06([(1, 10, 100), (2, 3, 40), (4, 5, 45), (6, 9, 30)]),
            "hidden": False,
            "expected": "115",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p06([(5, 5, 1_000_000_000)]),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_p06([(1, 1, 10), (1, 1, 25), (1, 1, 15)]),
            "hidden": True,
            "expected": "25",
            "checkBrute": True,
        },
        {
            "input": fmt_p06([(1, 2, 10), (2, 3, 20), (3, 4, 15), (4, 5, 25)]),
            "hidden": True,
            "expected": "45",
            "checkBrute": True,
        },
        {
            "input": fmt_p06([(1, 5, 1_000_000_000), (6, 10, 1_000_000_000), (11, 15, 1_000_000_000)]),
            "hidden": True,
            "expected": "3000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_p06([(1, 1_000_000_000, 100), (2, 999_999_999, 50), (1, 1, 60), (1_000_000_000, 1_000_000_000, 60)]),
            "hidden": True,
            "expected": "170",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    p9 = []
    for _ in range(120):
        a = rng.randint(1, 200)
        b = rng.randint(a, a + rng.randint(0, 40))
        p9.append((a, b, rng.randint(1, 500)))
    tests.append({"input": fmt_p06(p9), "hidden": True, "checkBrute": True})

    p10 = []
    for _ in range(300):
        a = rng.randint(1, 1000)
        b = rng.randint(a, a + rng.randint(0, 150))
        p10.append((a, b, rng.randint(1, 10**6)))
    tests.append({"input": fmt_p06(p10), "hidden": True, "checkBrute": True})

    # Large 64-bit values
    p11 = []
    for _ in range(4_500):
        a = rng.randint(1, 1_000_000_000)
        b = min(1_000_000_000, a + rng.randint(0, 100_000_000))
        p11.append((a, b, rng.randint(1, 1_000_000_000)))
    tests.append({"input": fmt_p06(p11), "hidden": True})

    p12 = []
    for _ in range(6_500):
        a = rng.randint(1, 999_999)
        b = min(999_999, a + rng.randint(0, 5000))
        p12.append((a, b, rng.randint(1, 999_999)))
    tests.append({"input": fmt_p06(p12), "hidden": True})

    # Boundary-touching stress N=10000
    p13 = [(i, i + 1, rng.randint(1, 99)) for i in range(1, 10_001)]
    rng.shuffle(p13)
    tests.append({"input": fmt_p06(p13), "hidden": True})

    # N=20000 compact
    p14 = []
    for _ in range(20_000):
        a = rng.randint(1, 9)
        b = rng.randint(a, 9)
        p14.append((a, b, rng.randint(1, 9)))
    tests.append({"input": fmt_p06(p14), "hidden": True})

    # N=9500 medium coords
    p15 = []
    for _ in range(9_500):
        a = rng.randint(1, 9999)
        b = min(9999, a + rng.randint(0, 500))
        p15.append((a, b, rng.randint(1, 9999)))
    tests.append({"input": fmt_p06(p15), "hidden": True})

    # N=8000 with nested & disjoint intervals
    p16 = []
    for i in range(8_000):
        a = rng.randint(1, 99999)
        b = min(99999, a + rng.randint(0, 200))
        p16.append((a, b, rng.randint(1, 99999)))
    tests.append({"input": fmt_p06(p16), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-weighted-interval-projects", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 14)
        ps = []
        for _ in range(n):
            a = rng.randint(1, 20)
            b = rng.randint(a, 20)
            ps.append((a, b, rng.randint(1, 50)))
        extra_stress.append(fmt_p06(ps))

    statement = r"""Có $N$ dự án mà bạn có thể đăng ký tham gia. Dự án thứ $i$ diễn ra liên tục từ ngày $a_i$ đến hết ngày $b_i$ (đoạn đóng $[a_i, b_i]$) và đem lại tiền thưởng là $p_i$.

Mỗi ngày bạn chỉ có thể tham gia tối đa một dự án. Nói cách khác, nếu bạn chọn cả hai dự án $i$ và $j$ (giả sử $b_i \le b_j$) thì phải thỏa mãn $b_i < a_j$ (không được trùng nhau ngay cả ở ngày biên).

Hãy tìm tổng tiền thưởng lớn nhất mà bạn có thể nhận được.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($1 \le N \le 20\,000$).
- $N$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $a_i, b_i, p_i$ ($1 \le a_i \le b_i \le 10^9$, $1 \le p_i \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng tiền thưởng lớn nhất có thể đạt được (lưu ý dùng kiểu số nguyên 64-bit).

### Ràng buộc
- $1 \le N \le 20\,000$
- $1 \le a_i \le b_i \le 10^9$
- $1 \le p_i \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Chọn dự án $(2, 4, 4)$ và $(5, 7, 3)$ (vì $4 < 5$) để đạt tổng thưởng $4 + 3 = 7$. Lưu ý không thể chọn $(3, 6, 6)$ cùng $(6, 8, 2)$ vì chúng trùng ngày $6$.
- **Ví dụ 2:** Chọn $(1, 3, 5)$ và $(4, 6, 4)$ đạt tổng $9$. Hai dự án $(1, 3)$ và $(3, 5)$ trùng ngày $3$ nên không thể chọn cùng nhau.
- **Ví dụ 3:** Chọn ba dự án $(2, 3, 40)$, $(4, 5, 45)$ và $(6, 9, 30)$ cho tổng $115 > 100$."""

    hints = r"""**Gợi ý 1:**
Khác với bài toán chọn số lượng đoạn rời nhau nhiều nhất, ở đây mỗi đoạn có trọng số $p_i$ khác nhau nên tham lam theo $b_i$ nhỏ nhất không còn đúng nữa. Ta cần **Quy hoạch động**.

**Gợi ý 2:**
Sắp xếp các dự án tăng dần theo ngày kết thúc $b_i$. Gọi `dp[i]` là tổng tiền thưởng lớn nhất khi chỉ xét trong $i$ dự án đầu tiên. Với dự án thứ $i$ có khoảng $[a_i, b_i]$, hoặc là không chọn nó (`dp[i - 1]`), hoặc là chọn nó cùng với phương án tốt nhất từ những dự án kết thúc **trước hẳn** ngày $a_i$ (tức $b_j < a_i$).

**Gợi ý 3:**
Vì mảng $b$ đã được sắp xếp tăng dần, ta có thể dùng **Tìm kiếm nhị phân** (`lower_bound` / `bisect_left`) để tìm vị trí $j$ lớn nhất sao cho $b_j < a_i$ trong $O(\log N)$. Tổng độ phức tạp là $O(N \log N)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Project {
    int a, b;
    long long p;
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<Project> projs(n);
    for (int i = 0; i < n; ++i) {
        cin >> projs[i].a >> projs[i].b >> projs[i].p;
    }

    sort(projs.begin(), projs.end(), [](const Project& x, const Project& y) {
        return x.b < y.b;
    });

    vector<int> ends(n);
    for (int i = 0; i < n; ++i) ends[i] = projs[i].b;

    vector<long long> dp(n + 1, 0);
    for (int i = 0; i < n; ++i) {
        int j = (int)(lower_bound(ends.begin(), ends.begin() + i, projs[i].a) - ends.begin());
        dp[i + 1] = max(dp[i], dp[j] + projs[i].p);
    }

    cout << dp[n] << '\n';
    return 0;
}"""

    py_sol = r"""import bisect
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])

    projs = []
    idx = 1
    for _ in range(n):
        a = int(data[idx])
        b = int(data[idx + 1])
        p = int(data[idx + 2])
        idx += 3
        projs.append((b, a, p))

    projs.sort()
    ends = [b for b, _, _ in projs]
    dp = [0] * (n + 1)

    for i, (b, a, p) in enumerate(projs):
        j = bisect.bisect_left(ends, a, 0, i)
        cand = dp[j] + p
        dp[i + 1] = cand if cand > dp[i] else dp[i]

    sys.stdout.write(f"{dp[n]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-weighted-interval-projects",
        "title": "Lịch trình dự án có thưởng",
        "shortDescription": "Quy hoạch động kết hợp sắp xếp và tìm kiếm nhị phân để chọn tập các đoạn đóng rời nhau có tổng trọng số lớn nhất.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.dp_advanced",
        "tags": ["hsg", "quy hoạch động", "tìm kiếm nhị phân", "tham lam", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp19-hsg-max-subarray-len-ab
# ============================================================================

def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, a_len, b_len = toks[0], toks[1], toks[2]
    arr = toks[3 : 3 + n]
    best = -(10**20)
    for l in range(n):
        s = 0
        for r in range(l, min(n, l + b_len)):
            s += arr[r]
            if r - l + 1 >= a_len and s > best:
                best = s
    return str(best)


def fmt_p07(a_len: int, b_len: int, arr: List[int]) -> str:
    return f"{len(arr)} {a_len} {b_len}\n" + " ".join(map(str, arr))


def build_p07() -> dict:
    rng = random.Random(1907)

    tests = [
        # 3 public samples
        {
            "input": fmt_p07(1, 2, [-1, 3, -2, 5, 3, -5, 2, 2]),
            "hidden": False,
            "expected": "8",
            "checkBrute": True,
        },
        {
            "input": fmt_p07(2, 4, [-5, -1, -3, -2, -4]),
            "hidden": False,
            "expected": "-4",
            "checkBrute": True,
        },
        {
            "input": fmt_p07(3, 3, [4, -1, 2, 1, -5, 4]),
            "hidden": False,
            "expected": "5",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p07(1, 1, [-1_000_000_000]),
            "hidden": True,
            "expected": "-1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_p07(4, 4, [1_000_000_000, 1_000_000_000, 1_000_000_000, 1_000_000_000]),
            "hidden": True,
            "expected": "4000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_p07(1, 5, [-10, -20, -3, -40, -5]),
            "hidden": True,
            "expected": "-3",
            "checkBrute": True,
        },
        {
            "input": fmt_p07(3, 5, [-10, -20, -3, -40, -5]),
            "hidden": True,
            "expected": "-33",
            "checkBrute": True,
        },
        {
            "input": fmt_p07(2, 5, [10, -1, -1, -1, 10]),
            "hidden": True,
            "expected": "17",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p07(5, 25, [rng.randint(-500, 500) for _ in range(150)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p07(10, 80, [rng.randint(-10_000, 10_000) for _ in range(400)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p07(100, 500, [rng.randint(-1_000_000_000, 1_000_000_000) for _ in range(10_000)]), "hidden": True})
    tests.append({"input": fmt_p07(500, 5000, [rng.randint(-1_000_000_000, -1) for _ in range(10_000)]), "hidden": True})
    tests.append({"input": fmt_p07(1, 20_000, [rng.randint(-99_999, 99_999) for _ in range(20_000)]), "hidden": True})
    tests.append({"input": fmt_p07(5000, 10_000, [rng.randint(-99_999, 99_999) for _ in range(20_000)]), "hidden": True})
    tests.append({"input": fmt_p07(20_000, 20_000, [rng.randint(-99_999, 99_999) for _ in range(20_000)]), "hidden": True})
    tests.append({"input": fmt_p07(321, 4567, [(-1 if i % 3 == 0 else 1) * rng.randint(1, 99_999) for i in range(20_000)]), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-max-subarray-len-ab", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 30)
        a_len = rng.randint(1, n)
        b_len = rng.randint(a_len, n)
        arr = [rng.randint(-50, 50) for _ in range(n)]
        extra_stress.append(fmt_p07(a_len, b_len, arr))

    statement = r"""Cho dãy gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ và hai số nguyên $A, B$ ($1 \le A \le B \le N$).

Hãy tìm tổng lớn nhất có thể của một đoạn con liên tiếp $a_l, a_{l+1}, \dots, a_r$ có độ dài nằm trong đoạn $[A, B]$, tức là $A \le r - l + 1 \le B$.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, A, B$ ($1 \le A \le B \le N \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng lớn nhất tìm được (lưu ý kết quả có thể âm và có thể vượt quá phạm vi số nguyên 32-bit).

### Ràng buộc
- $1 \le A \le B \le N \le 20\,000$
- $|a_i| \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 1\,000$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đoạn $[5, 3]$ có độ dài $2 \in [1, 2]$ và tổng $5 + 3 = 8$ là lớn nhất.
- **Ví dụ 2:** Mọi phần tử đều âm; đoạn $[-1, -3]$ có độ dài $2 \in [2, 4]$ cho tổng $-4$ lớn nhất.
- **Ví dụ 3:** Với $A = B = 3$, các đoạn độ dài $3$ có tổng lần lượt là $5, 2, -2, 1$, nên tổng lớn nhất là $5$."""

    hints = r"""**Gợi ý 1:**
Gọi $P_0 = 0$ và $P_i = a_1 + a_2 + \dots + a_i$. Với mỗi vị trí kết thúc $r$ ($A \le r \le N$), ta cần chọn điểm bắt đầu tiền tố $l$ sao cho $0 \le r - B \le l \le r - A$ và tối đa hóa $P_r - P_l$.

**Gợi ý 2:**
Với $r$ cố định, $P_r$ là hằng số, nên tối đa hóa $P_r - P_l$ tương đương với tìm $\min P_l$ trên cửa sổ trượt $l \in [\max(0, r - B),\, r - A]$.

**Gợi ý 3:**
Khi $r$ tăng dần từ $A$ đến $N$, cửa sổ các chỉ số $l$ trượt sang phải $1$ bước mỗi lần. Dùng **hàng đợi hai đầu đơn điệu (Monotonic Deque)** lưu các chỉ số $l$ có $P_l$ tăng dần để lấy giá trị nhỏ nhất trong $O(1)$ khấu hao, đạt tổng độ phức tạp $O(N)$. Đừng quên khởi tạo đáp án bằng $-\infty$ (ví dụ $-10^{18}$) thay vì $0$ vì tổng có thể âm."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, aLen, bLen;
    if (!(cin >> n >> aLen >> bLen)) return 0;

    vector<long long> pref(n + 1, 0);
    for (int i = 1; i <= n; ++i) {
        long long x;
        cin >> x;
        pref[i] = pref[i - 1] + x;
    }

    deque<int> dq;
    long long ans = LLONG_MIN;

    for (int r = aLen; r <= n; ++r) {
        int addIdx = r - aLen;
        while (!dq.empty() && pref[dq.back()] >= pref[addIdx]) {
            dq.pop_back();
        }
        dq.push_back(addIdx);

        int minIdx = r - bLen;
        while (!dq.empty() && dq.front() < minIdx) {
            dq.pop_front();
        }

        ans = max(ans, pref[r] - pref[dq.front()]);
    }

    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys
from collections import deque


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a_len = int(data[1])
    b_len = int(data[2])

    pref = [0] * (n + 1)
    s = 0
    for i in range(n):
        s += int(data[3 + i])
        pref[i + 1] = s

    dq = deque()
    ans = -(10**18)

    for r in range(a_len, n + 1):
        add_idx = r - a_len
        p_add = pref[add_idx]
        while dq and pref[dq[-1]] >= p_add:
            dq.pop()
        dq.append(add_idx)

        min_idx = r - b_len
        while dq and dq[0] < min_idx:
            dq.popleft()

        cand = pref[r] - pref[dq[0]]
        if cand > ans:
            ans = cand

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-max-subarray-len-ab",
        "title": "Đoạn con tổng lớn nhất độ dài [A, B]",
        "shortDescription": "Kết hợp mảng cộng dồn và hàng đợi hai đầu đơn điệu (Monotonic Deque) tìm tổng đoạn con cực đại.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.monotonic_stack_deque",
        "tags": ["hsg", "prefix sum", "deque", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp19-hsg-flood-escape-bfs
# ============================================================================

def brute_p08(inp: str) -> str:
    # Independent oracle: step-by-step simultaneous wavefront simulation
    lines = inp.strip().splitlines()
    n, m = map(int, lines[0].split())
    grid = [list(line.strip()) for line in lines[1 : 1 + n]]

    flooded = [[False] * m for _ in range(n)]
    flood_q = []
    player_vis = [[False] * m for _ in range(n)]
    player_q = []

    for r in range(n):
        for c in range(m):
            if grid[r][c] == "F":
                flooded[r][c] = True
                flood_q.append((r, c))
            elif grid[r][c] == "A":
                player_vis[r][c] = True
                player_q.append((r, c))

    # At t = 0, if A is already on boundary, escape in 0 steps
    for r, c in player_q:
        if r == 0 or r == n - 1 or c == 0 or c == m - 1:
            return "0"

    t = 0
    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    while player_q:
        t += 1
        # Flood expands first for time t
        nxt_flood = []
        for r, c in flood_q:
            for dr, dc in dirs:
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < m and not flooded[nr][nc] and grid[nr][nc] != "#":
                    flooded[nr][nc] = True
                    nxt_flood.append((nr, nc))
        flood_q = nxt_flood

        # Player steps to cells not flooded at time t
        nxt_player = []
        for r, c in player_q:
            for dr, dc in dirs:
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < m and not player_vis[nr][nc] and grid[nr][nc] != "#" and not flooded[nr][nc]:
                    if nr == 0 or nr == n - 1 or nc == 0 or nc == m - 1:
                        return str(t)
                    player_vis[nr][nc] = True
                    nxt_player.append((nr, nc))
        player_q = nxt_player

    return "-1"


def fmt_p08(rows: List[str]) -> str:
    return f"{len(rows)} {len(rows[0])}\n" + "\n".join(rows)


def build_p08() -> dict:
    rng = random.Random(1908)

    tests = [
        # 3 public samples
        {
            "input": fmt_p08([
                "########",
                "#F..A..#",
                "#.#.##.#",
                "#.#.....",
                "#.######",
                "#....F.#",
                "########",
            ]),
            "hidden": False,
            "expected": "5",
            "checkBrute": True,
        },
        {
            "input": fmt_p08([
                "########",
                "#F..A..#",
                "#.#.##.#",
                "#.#....#",
                "#.######",
                "#.#....#",
                "#.######",
            ]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_p08([
                "#######",
                "#F.A..#",
                "#.#.#.#",
                "#.#.#..",
                "#######",
            ]),
            "hidden": False,
            "expected": "5",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # A already on boundary (corner)
            "input": fmt_p08([
                "A.F",
                "...",
                "###",
            ]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # 1x1 grid with A
            "input": fmt_p08(["A"]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Zero flood cells (0 F)
            "input": fmt_p08([
                "#####",
                "#...#",
                "#.A.#",
                "#.#.#",
                "#.#.#",
            ]),
            "hidden": True,
            "expected": "3",
            "checkBrute": True,
        },
        {
            # Quick escape before flood arrives
            "input": fmt_p08([
                "###.#",
                "#F.A#",
                "#####",
            ]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            # Tie at boundary: flood and A arrive at (0,3) at t=2 -> blocked
            "input": fmt_p08([
                "#F..#",
                "#...#",
                "###A#",
                "#####",
            ]),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
    ]

    # Helper to generate random mazes
    def gen_maze(n: int, m: int, wall_p: float, num_f: int, open_border: bool = True) -> List[str]:
        g = [["." for _ in range(m)] for _ in range(n)]
        for r in range(n):
            for c in range(m):
                if (r == 0 or r == n - 1 or c == 0 or c == m - 1) and not open_border:
                    g[r][c] = "#"
                elif rng.random() < wall_p:
                    g[r][c] = "#"
        ar, ac = rng.randint(1, max(1, n - 2)), rng.randint(1, max(1, m - 2))
        g[ar][ac] = "A"
        placed = 0
        tries = 0
        while placed < num_f and tries < num_f * 10 + 50:
            tries += 1
            fr, fc = rng.randint(0, n - 1), rng.randint(0, m - 1)
            if g[fr][fc] == ".":
                g[fr][fc] = "F"
                placed += 1
        return ["".join(row) for row in g]

    # 8 medium -> large tests
    tests.append({"input": fmt_p08(gen_maze(35, 35, 0.25, 4)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p08(gen_maze(60, 60, 0.28, 8)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p08(gen_maze(120, 120, 0.25, 15)), "hidden": True})
    tests.append({"input": fmt_p08(gen_maze(220, 220, 0.22, 0)), "hidden": True})
    tests.append({"input": fmt_p08(gen_maze(220, 220, 0.25, 30)), "hidden": True})
    tests.append({"input": fmt_p08(gen_maze(220, 220, 0.30, 80, open_border=False)), "hidden": True})

    # Spiral corridor 220x220
    g15 = [["#" for _ in range(220)] for _ in range(220)]
    for r in range(1, 219):
        if r % 2 == 1:
            for c in range(1, 219):
                g15[r][c] = "."
        else:
            g15[r][218 if (r // 2) % 2 == 1 else 1] = "."
    g15[1][1] = "A"
    g15[2][1] = "F"
    g15[217][219] = "."
    tests.append({"input": fmt_p08(["".join(row) for row in g15]), "hidden": True})

    tests.append({"input": fmt_p08(gen_maze(220, 220, 0.20, 25)), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-flood-escape-bfs", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(2, 12)
        m = rng.randint(2, 12)
        extra_stress.append(fmt_p08(gen_maze(n, m, 0.25, rng.randint(0, 3))))

    statement = r"""Một người thám hiểm đang bị mắc kẹt trong mê cung lưới kích thước $N \times M$ ($1 \le N, M \le 220$). Mỗi ô của mê cung thuộc một trong các loại sau:
- `.`: Ô trống có thể đi qua.
- `#`: Tường đá không thể đi qua.
- `A`: Vị trí xuất phát của người chơi (xuất hiện đúng $1$ lần trong lưới).
- `F`: Nguồn nước lũ (có thể có $0$, $1$ hoặc nhiều ô `F`).

Tại mỗi giây:
- Nước lũ đồng thời lan từ các ô đang ngập sang các ô kề $4$ hướng (lên, xuống, trái, phải) không phải là `#`.
- Người chơi có thể di chuyển $1$ bước sang ô kề $4$ hướng không phải là `#`.

Người chơi được coi là thoát khỏi mê cung nếu đặt chân tới bất kỳ ô nào nằm trên **biên lưới** (hàng $1$, hàng $N$, cột $1$ hoặc cột $M$, không phải `#` và không phải `F`) tại thời điểm **nghiêm ngặt nhỏ hơn** thời điểm nước lũ tràn tới ô đó ($\text{time}_A < \text{time}_{\text{flood}}$; nếu nước lũ không bao giờ tới được ô đó thì xem như $\text{time}_{\text{flood}} = +\infty$). Đặc biệt, nếu `A` đã nằm sẵn trên biên lưới ở giây thứ $0$, đáp án là `0`.

Hãy tìm số bước đi ít nhất để thoát ra ngoài an toàn, hoặc in ra `-1` nếu không thể thoát.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N, M \le 220$).
- $N$ dòng tiếp theo, mỗi dòng gồm $M$ ký tự trong tập `{'.', '#', 'A', 'F'}`.

### Kết quả
- In ra một số nguyên duy nhất là số bước ít nhất để thoát tới ô biên an toàn, hoặc `-1` nếu không thể thoát.

### Ràng buộc
- $1 \le N, M \le 220$
- Có đúng một ký tự `A` trong mê cung.

### Subtasks
- **Subtask 1 (30%):** $N, M \le 50$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** `A` ở $(2, 5)$ đi sang phải $2$ bước tới $(2, 7)$, xuống dưới $2$ bước tới $(4, 7)$, rồi sang phải $1$ bước tới ô biên $(4, 8)$ mất tổng cộng $5$ giây, trước khi nước lũ lan tới đây.
- **Ví dụ 2:** Mọi ô biên đều bị tường `#` chặn kín nên không thể thoát (`-1`).
- **Ví dụ 3:** `A` đi sang phải $2$ bước, xuống dưới $2$ bước, sang phải $1$ bước tới ô biên hàng $4$, cột $7$ trong $5$ bước."""

    hints = r"""**Gợi ý 1:**
Thời điểm nước lũ tới từng ô hoàn toàn độc lập với đường đi của người chơi. Vì vậy, ta có thể tính trước thời gian nước lũ tràn đến mọi ô trên lưới.

**Gợi ý 2:**
Dùng **BFS đa nguồn (Multi-source BFS)** xuất phát đồng thời từ tất cả các ô `F` (khởi tạo `flood[r][c] = 0`, các ô khác là $+\infty$) để tính `flood[r][c]` — giây sớm nhất nước lũ chạm tới ô $(r, c)$. Lưu ý không đi qua tường `#`.

**Gợi ý 3:**
Chạy lượt **BFS thứ hai** từ vị trí `A` (`dist[A] = 0`). Nếu ô hiện tại nằm trên biên lưới, trả về ngay `dist`. Khi mở rộng sang ô kề $(nr, nc)$ ở bước `next_t = dist + 1`, chỉ cho phép đi nếu ô đó không phải `#` và `next_t < flood[nr][nc]`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;
    vector<string> grid(n);
    for (int i = 0; i < n; ++i) cin >> grid[i];

    const int INF = 1e9;
    int nm = n * m;
    vector<int> flood(nm, INF);
    vector<int> q;
    q.reserve(nm);
    int start = -1;

    for (int r = 0; r < n; ++r) {
        for (int c = 0; c < m; ++c) {
            int id = r * m + c;
            if (grid[r][c] == 'F') {
                flood[id] = 0;
                q.push_back(id);
            } else if (grid[r][c] == 'A') {
                start = id;
            }
        }
    }

    int dr[4] = {-1, 1, 0, 0};
    int dc[4] = {0, 0, -1, 1};

    for (size_t head = 0; head < q.size(); ++head) {
        int u = q[head];
        int r = u / m, c = u % m;
        for (int d = 0; d < 4; ++d) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nr >= n || nc < 0 || nc >= m) continue;
            if (grid[nr][nc] == '#') continue;
            int v = nr * m + nc;
            if (flood[v] > flood[u] + 1) {
                flood[v] = flood[u] + 1;
                q.push_back(v);
            }
        }
    }

    int sr = start / m, sc = start % m;
    if (sr == 0 || sr == n - 1 || sc == 0 || sc == m - 1) {
        cout << 0 << '\n';
        return 0;
    }

    vector<int> dist(nm, -1);
    q.clear();
    dist[start] = 0;
    q.push_back(start);

    for (size_t head = 0; head < q.size(); ++head) {
        int u = q[head];
        int r = u / m, c = u % m;
        int nt = dist[u] + 1;
        for (int d = 0; d < 4; ++d) {
            int nr = r + dr[d], nc = c + dc[d];
            if (nr < 0 || nr >= n || nc < 0 || nc >= m) continue;
            if (grid[nr][nc] == '#') continue;
            int v = nr * m + nc;
            if (dist[v] == -1 && nt < flood[v]) {
                if (nr == 0 || nr == n - 1 || nc == 0 || nc == m - 1) {
                    cout << nt << '\n';
                    return 0;
                }
                dist[v] = nt;
                q.push_back(v);
            }
        }
    }

    cout << -1 << '\n';
    return 0;
}"""

    py_sol = r"""import sys
from collections import deque


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    rows = data[2 : 2 + n]

    nm = n * m
    grid = "".join(rows)
    inf = 10**9
    flood = [inf] * nm
    dq = deque()
    start = -1

    for idx, ch in enumerate(grid):
        if ch == "F":
            flood[idx] = 0
            dq.append(idx)
        elif ch == "A":
            start = idx

    while dq:
        u = dq.popleft()
        nt = flood[u] + 1
        r, c = divmod(u, m)
        if r > 0:
            v = u - m
            if grid[v] != "#" and flood[v] > nt:
                flood[v] = nt
                dq.append(v)
        if r + 1 < n:
            v = u + m
            if grid[v] != "#" and flood[v] > nt:
                flood[v] = nt
                dq.append(v)
        if c > 0:
            v = u - 1
            if grid[v] != "#" and flood[v] > nt:
                flood[v] = nt
                dq.append(v)
        if c + 1 < m:
            v = u + 1
            if grid[v] != "#" and flood[v] > nt:
                flood[v] = nt
                dq.append(v)

    sr, sc = divmod(start, m)
    if sr == 0 or sr == n - 1 or sc == 0 or sc == m - 1:
        sys.stdout.write("0\n")
        return

    dist = [-1] * nm
    dist[start] = 0
    dq = deque([start])

    while dq:
        u = dq.popleft()
        nt = dist[u] + 1
        r, c = divmod(u, m)
        if r > 0:
            v = u - m
            if grid[v] != "#" and dist[v] == -1 and nt < flood[v]:
                if r - 1 == 0 or c == 0 or c == m - 1:
                    sys.stdout.write(f"{nt}\n")
                    return
                dist[v] = nt
                dq.append(v)
        if r + 1 < n:
            v = u + m
            if grid[v] != "#" and dist[v] == -1 and nt < flood[v]:
                if r + 1 == n - 1 or c == 0 or c == m - 1:
                    sys.stdout.write(f"{nt}\n")
                    return
                dist[v] = nt
                dq.append(v)
        if c > 0:
            v = u - 1
            if grid[v] != "#" and dist[v] == -1 and nt < flood[v]:
                if c - 1 == 0 or r == 0 or r == n - 1:
                    sys.stdout.write(f"{nt}\n")
                    return
                dist[v] = nt
                dq.append(v)
        if c + 1 < m:
            v = u + 1
            if grid[v] != "#" and dist[v] == -1 and nt < flood[v]:
                if c + 1 == m - 1 or r == 0 or r == n - 1:
                    sys.stdout.write(f"{nt}\n")
                    return
                dist[v] = nt
                dq.append(v)

    sys.stdout.write("-1\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-flood-escape-bfs",
        "title": "Chạy lũ trong mê cung",
        "shortDescription": "BFS đa nguồn cho nước lũ kết hợp BFS tìm đường thoát biên cho người chơi với điều kiện thời gian nghiêm ngặt.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.graph_grid_bipartite",
        "tags": ["hsg", "bfs-dfs", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp19-hsg-mst-forced-edge-queries
# ============================================================================

def brute_p09(inp: str) -> str:
    # Independent oracle: force edge e_i first in DSU, then run Kruskal
    toks = list(map(int, inp.split()))
    n, m, q = toks[0], toks[1], toks[2]
    edges = []
    idx = 3
    for i in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        edges.append((w, u, v, i))
    sorted_edges = sorted(edges)
    queries = toks[idx : idx + q]

    out = []
    for e_id in queries:
        w0, u0, v0, _ = edges[e_id - 1]
        parent = list(range(n + 1))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        parent[find(u0)] = find(v0)
        total = w0
        taken = 1
        for w, u, v, _ in sorted_edges:
            ru, rv = find(u), find(v)
            if ru != rv:
                parent[rv] = ru
                total += w
                taken += 1
                if taken == n - 1:
                    break
        out.append(str(total))
    return "\n".join(out)


def fmt_p09(n: int, edges: List[Tuple[int, int, int]], queries: List[int]) -> str:
    lines = [f"{n} {len(edges)} {len(queries)}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    lines.extend(str(q) for q in queries)
    return "\n".join(lines)


def _gen_simple_connected_graph(
    rng: random.Random, n: int, m: int, w_lo: int, w_hi: int
) -> List[Tuple[int, int, int]]:
    assert m >= n - 1
    edges = []
    seen = set()
    # Random spanning tree first
    perm = list(range(1, n + 1))
    rng.shuffle(perm)
    for i in range(1, n):
        p = perm[rng.randint(0, i - 1)]
        u = perm[i]
        a, b = (u, p) if u < p else (p, u)
        seen.add((a, b))
        edges.append((u, p, rng.randint(w_lo, w_hi)))

    while len(edges) < m:
        u = rng.randint(1, n)
        v = rng.randint(1, n)
        if u == v:
            continue
        a, b = (u, v) if u < v else (v, u)
        if (a, b) in seen:
            continue
        seen.add((a, b))
        edges.append((u, v, rng.randint(w_lo, w_hi)))
    rng.shuffle(edges)
    return edges


def build_p09() -> dict:
    rng = random.Random(1909)

    tests = [
        # 3 public samples
        {
            "input": fmt_p09(
                5,
                [(1, 2, 3), (1, 3, 1), (1, 4, 5), (2, 3, 2), (2, 5, 3), (3, 4, 2), (4, 5, 4)],
                [1, 2, 3, 4, 5, 6, 7],
            ),
            "hidden": False,
            "expected": "9\n8\n11\n8\n8\n8\n9",
            "checkBrute": True,
        },
        {
            "input": fmt_p09(
                4,
                [(1, 2, 10), (2, 3, 20), (3, 4, 30), (1, 4, 100)],
                [1, 4],
            ),
            "hidden": False,
            "expected": "60\n130",
            "checkBrute": True,
        },
        {
            "input": fmt_p09(
                4,
                [(1, 2, 5), (2, 3, 5), (3, 4, 5), (1, 3, 5), (2, 4, 5)],
                [1, 4, 5],
            ),
            "hidden": False,
            "expected": "15\n15\n15",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # N=2, M=1 (already a tree)
            "input": fmt_p09(2, [(1, 2, 1_000_000_000)], [1, 1]),
            "hidden": True,
            "expected": "1000000000\n1000000000",
            "checkBrute": True,
        },
        {
            # Graph IS a tree (M = N - 1)
            "input": fmt_p09(5, [(1, 2, 10), (2, 3, 20), (3, 4, 30), (4, 5, 40)], [1, 2, 3, 4]),
            "hidden": True,
            "expected": "100\n100\n100\n100",
            "checkBrute": True,
        },
        {
            # 64-bit MST weights
            "input": fmt_p09(
                4,
                [(1, 2, 1_000_000_000), (2, 3, 1_000_000_000), (3, 4, 1_000_000_000), (1, 4, 1_000_000_000)],
                [1, 4],
            ),
            "hidden": True,
            "expected": "3000000000\n3000000000",
            "checkBrute": True,
        },
        {
            # Complete graph K5
            "input": fmt_p09(
                5,
                [(i, j, i * 10 + j) for i in range(1, 6) for j in range(i + 1, 6)],
                list(range(1, 11)),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Deep chain tree + 1 heavy chord
            "input": fmt_p09(
                10,
                [(i, i + 1, i * 5) for i in range(1, 10)] + [(1, 10, 1000)],
                list(range(1, 11)),
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    e9 = _gen_simple_connected_graph(rng, 40, 120, 1, 1000)
    tests.append({"input": fmt_p09(40, e9, [rng.randint(1, 120) for _ in range(100)]), "hidden": True, "checkBrute": True})

    e10 = _gen_simple_connected_graph(rng, 80, 250, 1, 10**6)
    tests.append({"input": fmt_p09(80, e10, [rng.randint(1, 250) for _ in range(150)]), "hidden": True, "checkBrute": True})

    # Large 64-bit weights
    e11 = _gen_simple_connected_graph(rng, 4000, 6000, 1, 1_000_000_000)
    tests.append({"input": fmt_p09(4000, e11, [rng.randint(1, 6000) for _ in range(2500)]), "hidden": True})

    # Deep chain MST N=10000 (kills recursive DFS!)
    e12 = [(i, i + 1, rng.randint(1, 9)) for i in range(1, 10000)]
    e12.append((1, 10000, 99999))
    tests.append({"input": fmt_p09(10000, e12, [rng.randint(1, len(e12)) for _ in range(2000)]), "hidden": True})

    # Max Q=8000 on N=5000, M=7000
    e13 = _gen_simple_connected_graph(rng, 5000, 7000, 1, 99)
    tests.append({"input": fmt_p09(5000, e13, [rng.randint(1, 7000) for _ in range(8000)]), "hidden": True})

    # Max N=12000, M=11999 (tree)
    e14 = _gen_simple_connected_graph(rng, 12000, 11999, 1, 9)
    tests.append({"input": fmt_p09(12000, e14, [rng.randint(1, 11999) for _ in range(200)]), "hidden": True})

    # Dense-ish N=4000, M=10000
    e15 = _gen_simple_connected_graph(rng, 4000, 10000, 1, 99)
    tests.append({"input": fmt_p09(4000, e15, [rng.randint(1, 10000) for _ in range(1500)]), "hidden": True})

    # Random N=8000, M=9500, Q=1500
    e16 = _gen_simple_connected_graph(rng, 8000, 9500, 1, 99)
    tests.append({"input": fmt_p09(8000, e16, [rng.randint(1, 9500) for _ in range(1500)]), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-mst-forced-edge-queries", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(2, 15)
        max_m = n * (n - 1) // 2
        m = rng.randint(n - 1, min(max_m, 35))
        edges = _gen_simple_connected_graph(rng, n, m, 1, 50)
        qs = [rng.randint(1, m) for _ in range(rng.randint(1, 10))]
        extra_stress.append(fmt_p09(n, edges, qs))

    statement = r"""Cho đồ thị vô hướng liên thông đơn giản gồm $N$ đỉnh (đánh số từ $1$ đến $N$) và $M$ cạnh (đánh số từ $1$ đến $M$). Cạnh thứ $i$ nối hai đỉnh $u_i, v_i$ và có trọng số là $w_i$ ($1 \le w_i \le 10^9$).

Cho $Q$ truy vấn độc lập. Mỗi truy vấn đưa ra chỉ số của một cạnh $e_i$ ($1 \le e_i \le M$). Hãy tìm tổng trọng số nhỏ nhất của một **cây khung** của đồ thị mà chứa **bắt buộc** cạnh $e_i$.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, M, Q$ ($2 \le N \le 12\,000$, $N - 1 \le M \le 20\,000$, $1 \le Q \le 8\,000$).
- $M$ dòng tiếp theo, dòng thứ $i$ chứa ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $u_i \neq v_i$, $1 \le w_i \le 10^9$). Đảm bảo đồ thị liên thông và không có đa cạnh hay khuyên.
- $Q$ dòng tiếp theo, mỗi dòng chứa một số nguyên $e_i$ ($1 \le e_i \le M$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra tổng trọng số nhỏ nhất của cây khung chứa cạnh $e_i$ (dùng số nguyên 64-bit).

### Ràng buộc
- $2 \le N \le 12\,000$
- $N - 1 \le M \le 20\,000$
- $1 \le Q \le 8\,000$
- $1 \le w_i \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 200$, $Q \le 200$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Cây khung nhỏ nhất (MST) có trọng số $8$ gồm các cạnh $(1,3,1), (2,3,2), (3,4,2), (2,5,3)$. Với truy vấn cạnh $3$ là $(1, 4, 5)$ không nằm trong MST, thêm nó vào tạo chu trình với đường đi $1 - 3 - 4$ trên MST (trọng số lớn nhất trên đường đi là $2$), bỏ cạnh $2$ để được $8 - 2 + 5 = 11$.
- **Ví dụ 2:** MST có trọng số $10 + 20 + 30 = 60$. Nếu bắt buộc dùng cạnh $4$ trọng số $100$, phải bỏ cạnh nặng nhất trên đường $1 - 4$ trong MST (là cạnh $30$), thu được $60 - 30 + 100 = 130$."""

    hints = r"""**Gợi ý 1:**
Trước hết, dùng thuật toán **Kruskal** để tìm một cây khung nhỏ nhất (MST) bất kỳ và tổng trọng số `MST_cost` của nó. Nếu cạnh truy vấn $e = (u, v, w)$ đã nằm trong MST thì đáp án chính là `MST_cost`.

**Gợi ý 2:**
Nếu cạnh $e = (u, v, w)$ không nằm trong MST, khi thêm $e$ vào MST sẽ tạo ra đúng một chu trình đơn gồm cạnh $e$ và đường đi duy nhất từ $u$ đến $v$ trên cây MST. Để thu được cây khung nhỏ nhất chứa $e$, ta phải xóa đi cạnh có trọng số lớn nhất trên đường đi từ $u$ đến $v$ trong MST. Đáp án là `MST_cost - max_edge(u, v) + w`. (Lưu ý công thức này đúng cả khi $e$ đã nằm trong MST vì khi đó `max_edge(u, v) == w`).

**Gợi ý 3:**
Để trả lời `max_edge(u, v)` trong $O(\log N)$ cho mỗi truy vấn, ta chọn đỉnh $1$ làm gốc cây MST, dùng **BFS** (tránh đệ quy sâu) để tính `depth[u]` và dùng **Binary Lifting (LCA)** lưu mảng `up[k][u]` và `mx[k][u]` (cạnh lớn nhất từ $u$ lên tổ tiên thứ $2^k$)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Edge {
    int u, v, w, id;
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, q;
    if (!(cin >> n >> m >> q)) return 0;

    vector<Edge> edges(m);
    for (int i = 0; i < m; ++i) {
        cin >> edges[i].u >> edges[i].v >> edges[i].w;
        edges[i].id = i;
    }

    vector<Edge> sortedEdges = edges;
    sort(sortedEdges.begin(), sortedEdges.end(), [](const Edge& a, const Edge& b) {
        return a.w < b.w;
    });

    vector<int> parent(n + 1);
    iota(parent.begin(), parent.end(), 0);
    auto findSet = [&](int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };

    vector<vector<pair<int, int>>> adj(n + 1);
    long long mstCost = 0;
    int taken = 0;
    for (const auto& e : sortedEdges) {
        int ru = findSet(e.u);
        int rv = findSet(e.v);
        if (ru != rv) {
            parent[rv] = ru;
            mstCost += e.w;
            adj[e.u].push_back({e.v, e.w});
            adj[e.v].push_back({e.u, e.w});
            if (++taken == n - 1) break;
        }
    }

    const int LOG = 14;
    vector<int> depth(n + 1, -1);
    vector<vector<int>> up(LOG, vector<int>(n + 1, 1));
    vector<vector<int>> mx(LOG, vector<int>(n + 1, 0));

    vector<int> bfs;
    bfs.reserve(n);
    depth[1] = 0;
    up[0][1] = 1;
    mx[0][1] = 0;
    bfs.push_back(1);

    for (size_t head = 0; head < bfs.size(); ++head) {
        int u = bfs[head];
        for (auto [v, w] : adj[u]) {
            if (depth[v] == -1) {
                depth[v] = depth[u] + 1;
                up[0][v] = u;
                mx[0][v] = w;
                bfs.push_back(v);
            }
        }
    }

    for (int k = 1; k < LOG; ++k) {
        for (int u = 1; u <= n; ++u) {
            int p = up[k - 1][u];
            up[k][u] = up[k - 1][p];
            mx[k][u] = max(mx[k - 1][u], mx[k - 1][p]);
        }
    }

    auto maxOnPath = [&](int u, int v) {
        int res = 0;
        if (depth[u] < depth[v]) swap(u, v);
        int diff = depth[u] - depth[v];
        for (int k = 0; k < LOG; ++k) {
            if ((diff >> k) & 1) {
                res = max(res, mx[k][u]);
                u = up[k][u];
            }
        }
        if (u == v) return res;
        for (int k = LOG - 1; k >= 0; --k) {
            if (up[k][u] != up[k][v]) {
                res = max(res, max(mx[k][u], mx[k][v]));
                u = up[k][u];
                v = up[k][v];
            }
        }
        res = max(res, max(mx[0][u], mx[0][v]));
        return res;
    };

    while (q--) {
        int eid;
        cin >> eid;
        const auto& e = edges[eid - 1];
        int maxW = maxOnPath(e.u, e.v);
        cout << (mstCost - maxW + e.w) << '\n';
    }

    return 0;
}"""

    py_sol = r"""import sys
from collections import deque


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    q = int(data[2])

    eu = [0] * m
    ev = [0] * m
    ew = [0] * m
    idx = 3
    for i in range(m):
        eu[i] = int(data[idx])
        ev[i] = int(data[idx + 1])
        ew[i] = int(data[idx + 2])
        idx += 3

    order = sorted(range(m), key=lambda i: ew[i])
    parent = list(range(n + 1))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    adj = [[] for _ in range(n + 1)]
    mst_cost = 0
    taken = 0
    for i in order:
        u = eu[i]
        v = ev[i]
        ru = find(u)
        rv = find(v)
        if ru != rv:
            parent[rv] = ru
            w = ew[i]
            mst_cost += w
            adj[u].append((v, w))
            adj[v].append((u, w))
            taken += 1
            if taken == n - 1:
                break

    logn = n.bit_length()
    depth = [-1] * (n + 1)
    up = [[1] * (n + 1) for _ in range(logn)]
    mx = [[0] * (n + 1) for _ in range(logn)]

    depth[1] = 0
    dq = deque([1])
    while dq:
        u = dq.popleft()
        du = depth[u] + 1
        for v, w in adj[u]:
            if depth[v] == -1:
                depth[v] = du
                up[0][v] = u
                mx[0][v] = w
                dq.append(v)

    for k in range(1, logn):
        up_prev = up[k - 1]
        mx_prev = mx[k - 1]
        up_cur = up[k]
        mx_cur = mx[k]
        for u in range(1, n + 1):
            p = up_prev[u]
            up_cur[u] = up_prev[p]
            a = mx_prev[u]
            b = mx_prev[p]
            mx_cur[u] = a if a > b else b

    out = []
    for qi in range(q):
        eid = int(data[idx + qi]) - 1
        u = eu[eid]
        v = ev[eid]
        res = 0
        if depth[u] < depth[v]:
            u, v = v, u
        diff = depth[u] - depth[v]
        k = 0
        while diff:
            if diff & 1:
                val = mx[k][u]
                if val > res:
                    res = val
                u = up[k][u]
            diff >>= 1
            k += 1
        if u != v:
            for k in range(logn - 1, -1, -1):
                if up[k][u] != up[k][v]:
                    a = mx[k][u]
                    b = mx[k][v]
                    if a > res:
                        res = a
                    if b > res:
                        res = b
                    u = up[k][u]
                    v = up[k][v]
            a = mx[0][u]
            b = mx[0][v]
            if a > res:
                res = a
            if b > res:
                res = b
        out.append(str(mst_cost - res + ew[eid]))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-mst-forced-edge-queries",
        "title": "Cây khung nhỏ nhất bắt buộc chứa cạnh",
        "shortDescription": "Kết hợp Kruskal MST và Binary Lifting (LCA) để tìm trọng số cây khung nhỏ nhất bắt buộc chứa từng cạnh truy vấn.",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.tree_lca_euler",
        "tags": ["hsg", "mst", "lca", "binary lifting", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp19-hsg-coloring-trees-k-segments
# ============================================================================

def brute_p10(inp: str) -> str:
    # Independent oracle: O(N * K * M^2) unoptimized DP (plus exhaustive on tiny inputs)
    toks = list(map(int, inp.split()))
    n, m, target_k = toks[0], toks[1], toks[2]
    c = toks[3 : 3 + n]
    idx = 3 + n
    cost = []
    for _ in range(n):
        cost.append([0] + toks[idx : idx + m])
        idx += m

    uncolored = sum(1 for x in c if x == 0)
    if m ** uncolored <= 4096 and n <= 8:
        choices = [[c[i]] if c[i] > 0 else list(range(1, m + 1)) for i in range(n)]
        best = 10**20
        for seq in itertools.product(*choices):
            segs = 1
            for i in range(1, n):
                if seq[i] != seq[i - 1]:
                    segs += 1
            if segs == target_k:
                tot = sum(cost[i][seq[i]] for i in range(n) if c[i] == 0)
                if tot < best:
                    best = tot
        return "-1" if best >= 10**19 else str(best)

    inf = 10**20
    dp = [[inf] * (m + 1) for _ in range(target_k + 1)]
    if c[0] > 0:
        dp[1][c[0]] = 0
    else:
        for col in range(1, m + 1):
            dp[1][col] = cost[0][col]

    for i in range(1, n):
        ndp = [[inf] * (m + 1) for _ in range(target_k + 1)]
        cols = [c[i]] if c[i] > 0 else range(1, m + 1)
        for k in range(1, min(i + 1, target_k) + 1):
            for col in cols:
                w = 0 if c[i] > 0 else cost[i][col]
                best = dp[k][col]
                if k > 1:
                    for pcol in range(1, m + 1):
                        if pcol != col and dp[k - 1][pcol] < best:
                            best = dp[k - 1][pcol]
                if best < inf:
                    ndp[k][col] = best + w
        dp = ndp

    ans = min(dp[target_k][1 : m + 1])
    return "-1" if ans >= inf // 2 else str(ans)


def fmt_p10(n: int, m: int, k: int, c: List[int], p: List[List[int]]) -> str:
    lines = [f"{n} {m} {k}", " ".join(map(str, c))]
    lines.extend(" ".join(map(str, row)) for row in p)
    return "\n".join(lines)


def build_p10() -> dict:
    rng = random.Random(1910)

    tests = [
        # 3 public samples
        {
            "input": fmt_p10(
                3, 2, 2,
                [0, 0, 0],
                [[1, 2], [3, 4], [5, 6]],
            ),
            "hidden": False,
            "expected": "10",
            "checkBrute": True,
        },
        {
            "input": fmt_p10(
                3, 2, 2,
                [2, 1, 2],
                [[1, 3], [2, 4], [3, 5]],
            ),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_p10(
                3, 2, 2,
                [2, 0, 0],
                [[1, 3], [2, 4], [3, 5]],
            ),
            "hidden": False,
            "expected": "5",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # N=1, M=1, K=1, uncolored
            "input": fmt_p10(1, 1, 1, [0], [[1_000_000_000]]),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            # M=1, K=2 -> impossible
            "input": fmt_p10(4, 1, 2, [0, 0, 0, 0], [[5], [6], [7], [8]]),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            # All colored, already matches K
            "input": fmt_p10(5, 3, 3, [1, 1, 2, 3, 3], [[9, 9, 9]] * 5),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Force alternating [2, 1, 2, 1] to reach K=4
            "input": fmt_p10(4, 2, 4, [0, 1, 0, 1], [[10, 20]] * 4),
            "hidden": True,
            "expected": "40",
            "checkBrute": True,
        },
        {
            # Large 64-bit total cost
            "input": fmt_p10(
                5, 2, 1,
                [0, 0, 0, 0, 0],
                [[1_000_000_000, 999_999_999]] * 5,
            ),
            "hidden": True,
            "expected": "4999999995",
            "checkBrute": True,
        },
    ]

    def gen_p10(n: int, m: int, k: int, fixed_prob: float, max_p: int) -> str:
        c = [rng.randint(1, m) if rng.random() < fixed_prob else 0 for _ in range(n)]
        p = [[rng.randint(1, max_p) for _ in range(m)] for _ in range(n)]
        return fmt_p10(n, m, k, c, p)

    # 8 medium -> large tests
    tests.append({"input": gen_p10(12, 5, 6, 0.25, 100), "hidden": True, "checkBrute": True})
    tests.append({"input": gen_p10(25, 10, 12, 0.30, 10**6), "hidden": True, "checkBrute": True})
    tests.append({"input": gen_p10(70, 35, 35, 0.20, 1_000_000_000), "hidden": True})
    tests.append({"input": gen_p10(70, 35, 70, 0.15, 1_000_000_000), "hidden": True})
    tests.append({"input": gen_p10(70, 35, 1, 0.0, 1_000_000_000), "hidden": True})
    tests.append({"input": gen_p10(70, 35, 18, 0.45, 1_000_000_000), "hidden": True})
    tests.append({"input": gen_p10(70, 2, 69, 0.10, 1_000_000_000), "hidden": True})
    tests.append({"input": gen_p10(70, 35, 42, 0.0, 1_000_000_000), "hidden": True})

    for i, tc in enumerate(tests, 1):
        assert_size("cp19-hsg-coloring-trees-k-segments", i, tc["input"])

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 7)
        m = rng.randint(1, 3)
        k = rng.randint(1, n)
        extra_stress.append(gen_p10(n, m, k, 0.3, 20))

    statement = r"""Trong công viên có một hàng gồm $N$ cây được đánh số từ $1$ đến $N$ và có $M$ loại màu sơn (đánh số từ $1$ đến $M$).

Mỗi cây $i$ có trạng thái màu ban đầu $c_i \in \{0, 1, \dots, M\}$:
- Nếu $c_i > 0$: cây $i$ đã có sẵn màu $c_i$ và **không thể tô lại** (chi phí giữ nguyên là $0$).
- Nếu $c_i = 0$: cây $i$ chưa được tô màu; bạn bắt buộc phải tô cho nó một màu $j$ ($1 \le j \le M$) với chi phí là $p_{i,j}$.

**Độ đẹp** của hàng cây sau khi tô xong được định nghĩa là số lượng đoạn liên tiếp cực đại gồm các cây có cùng màu (ví dụ, dãy màu `[2, 2, 1, 1, 1, 2]` gồm $3$ đoạn: `[2, 2]`, `[1, 1, 1]` và `[2]`).

Hãy tìm tổng chi phí nhỏ nhất để tô màu tất cả các cây chưa có màu sao cho hàng cây cuối cùng có độ đẹp đúng bằng $K$, hoặc in ra `-1` nếu không thể thực hiện.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, M, K$ ($1 \le N \le 70$, $1 \le M \le 35$, $1 \le K \le N$).
- Dòng thứ hai chứa $N$ số nguyên $c_1, c_2, \dots, c_N$ ($0 \le c_i \le M$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa $M$ số nguyên $p_{i,1}, p_{i,2}, \dots, p_{i,M}$ ($1 \le p_{i,j} \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng chi phí nhỏ nhất, hoặc `-1` nếu không tồn tại cách tô hợp lệ.

### Ràng buộc
- $1 \le N \le 70$
- $1 \le M \le 35$
- $1 \le K \le N$
- $0 \le c_i \le M$
- $1 \le p_{i,j} \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 20$, $M \le 10$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Tô dãy màu `[1, 1, 2]` (gồm $2$ đoạn) mất $p_{1,1} + p_{2,1} + p_{3,2} = 1 + 3 + 6 = 10$, hoặc `[1, 2, 2]` mất $1 + 4 + 6 = 11$. Nhỏ nhất là $10$.
- **Ví dụ 2:** Tất cả các cây đã có màu sẵn `[2, 1, 2]` với $3$ đoạn, không thể đạt độ đẹp $K = 2$ nên đáp án là `-1`.
- **Ví dụ 3:** Cây $1$ có sẵn màu $2$; tô cây $2$ màu $1$ (giá $2$) và cây $3$ màu $1$ (giá $3$) để được `[2, 1, 1]` gồm $2$ đoạn với tổng chi phí $5$."""

    hints = r"""**Gợi ý 1:**
Gọi `dp[i][k][m]` là tổng chi phí nhỏ nhất để tô $i$ cây đầu tiên sao cho tạo thành $k$ đoạn liên tiếp cùng màu và cây thứ $i$ có màu $m$.

**Gợi ý 2:**
Khi chuyển sang cây thứ $i$ với màu $m$:
- Nếu cây $i - 1$ cũng có màu $m$ thì số đoạn không đổi (`dp[i-1][k][m]`).
- Nếu cây $i - 1$ có màu $m' \neq m$ thì số đoạn tăng thêm $1$, tức lấy $\min_{m' \neq m} \text{dp}[i-1][k-1][m']$.
Cách cài đặt trực tiếp này có độ phức tạp $O(N \cdot K \cdot M^2)$.

**Gợi ý 3:**
Để tối ưu từ $O(N \cdot K \cdot M^2)$ xuống $O(N \cdot K \cdot M)$ (và dùng mảng lăn theo $i$), với mỗi tầng $k - 1$ của bước trước, ta chỉ cần tìm trước **hai giá trị nhỏ nhất** `min1` (tại màu `col1`) và `min2` (tại màu khác `col1`). Khi đó:
$$\min_{m' \neq m} \text{dp}[k-1][m'] = \begin{cases} \text{min2} & \text{nếu } m = \text{col1} \\ \text{min1} & \text{nếu } m \neq \text{col1} \end{cases}$$"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, targetK;
    if (!(cin >> n >> m >> targetK)) return 0;

    vector<int> c(n);
    for (int i = 0; i < n; ++i) cin >> c[i];

    vector<vector<long long>> p(n, vector<long long>(m + 1, 0));
    for (int i = 0; i < n; ++i) {
        for (int j = 1; j <= m; ++j) {
            cin >> p[i][j];
        }
    }

    const long long INF = (long long)4e18;
    vector<vector<long long>> dp(targetK + 1, vector<long long>(m + 1, INF));

    if (c[0] > 0) {
        dp[1][c[0]] = 0;
    } else {
        for (int j = 1; j <= m; ++j) dp[1][j] = p[0][j];
    }

    for (int i = 1; i < n; ++i) {
        vector<vector<long long>> ndp(targetK + 1, vector<long long>(m + 1, INF));
        int limK = min(i + 1, targetK);

        for (int k = 1; k <= limK; ++k) {
            long long min1 = INF, min2 = INF;
            int col1 = -1;
            if (k > 1) {
                for (int j = 1; j <= m; ++j) {
                    long long val = dp[k - 1][j];
                    if (val < min1) {
                        min2 = min1;
                        min1 = val;
                        col1 = j;
                    } else if (val < min2) {
                        min2 = val;
                    }
                }
            }

            int startJ = (c[i] > 0) ? c[i] : 1;
            int endJ = (c[i] > 0) ? c[i] : m;
            for (int j = startJ; j <= endJ; ++j) {
                long long bestPrev = dp[k][j];
                if (k > 1) {
                    long long diffSeg = (j == col1) ? min2 : min1;
                    bestPrev = min(bestPrev, diffSeg);
                }
                if (bestPrev < INF) {
                    long long addCost = (c[i] > 0) ? 0LL : p[i][j];
                    ndp[k][j] = bestPrev + addCost;
                }
            }
        }
        dp.swap(ndp);
    }

    long long ans = INF;
    for (int j = 1; j <= m; ++j) ans = min(ans, dp[targetK][j]);
    cout << (ans >= INF ? -1 : ans) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    target_k = int(data[2])

    c = [int(x) for x in data[3 : 3 + n]]
    idx = 3 + n
    p = []
    for _ in range(n):
        p.append([0] + [int(x) for x in data[idx : idx + m]])
        idx += m

    inf = 10**18
    dp = [[inf] * (m + 1) for _ in range(target_k + 1)]
    if c[0] > 0:
        dp[1][c[0]] = 0
    else:
        for j in range(1, m + 1):
            dp[1][j] = p[0][j]

    for i in range(1, n):
        ndp = [[inf] * (m + 1) for _ in range(target_k + 1)]
        lim_k = i + 1 if i + 1 < target_k else target_k
        ci = c[i]
        pi = p[i]

        for k in range(1, lim_k + 1):
            min1 = inf
            min2 = inf
            col1 = -1
            if k > 1:
                prev_row = dp[k - 1]
                for j in range(1, m + 1):
                    val = prev_row[j]
                    if val < min1:
                        min2 = min1
                        min1 = val
                        col1 = j
                    elif val < min2:
                        min2 = val

            cur_row = dp[k]
            out_row = ndp[k]
            if ci > 0:
                best_prev = cur_row[ci]
                if k > 1:
                    diff_seg = min2 if ci == col1 else min1
                    if diff_seg < best_prev:
                        best_prev = diff_seg
                if best_prev < inf:
                    out_row[ci] = best_prev
            else:
                for j in range(1, m + 1):
                    best_prev = cur_row[j]
                    if k > 1:
                        diff_seg = min2 if j == col1 else min1
                        if diff_seg < best_prev:
                            best_prev = diff_seg
                    if best_prev < inf:
                        out_row[j] = best_prev + pi[j]
        dp = ndp

    ans = min(dp[target_k][1:])
    sys.stdout.write(f"{-1 if ans >= inf else ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp19-hsg-coloring-trees-k-segments",
        "title": "Tô màu hàng cây đạt K đoạn",
        "shortDescription": "Quy hoạch động 3 chiều tối ưu hai giá trị nhỏ nhất (min1, min2) mỗi tầng để chia hàng cây thành đúng K đoạn cùng màu.",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.dp_advanced",
        "tags": ["hsg", "quy hoạch động", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER,
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

    build_and_verify_pack(
        pack_id="19-vietnam-hsg-hybrid",
        title="Tầng 2–4: Đề thực chiến HSG & Đa kỹ thuật (Hybrid)",
        tier="Tầng 2–4 — Thực chiến HSG",
        description=(
            "10 bài phong cách đề HSG Tỉnh/QG, Tin học trẻ & Olympic 30/4 kết hợp 2–3 kỹ thuật: "
            "Sàng + Tổng chữ số, Prefix + Nghịch thế, Nhị phân + BFS, LIS Count + BIT, "
            "Layered Dijkstra, DP có trọng số + BS, Prefix + Deque, Đuổi lũ Multi-BFS, "
            "Cây khung + LCA và Coloring DP."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
