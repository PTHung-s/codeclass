"""
Builder & automated verifier for Pack 08: Dynamic Programming (Tầng 3).

Generates and verifies `server/data/cp-packs/08-dynamic-programming.json`
with 10 original Vietnamese CP problems, 16 tests each, dual C++17 + Python 3
solutions, and independent brute-force stress tests on all 10 problems.
"""

from __future__ import annotations

import itertools
import random
from collections import deque
from typing import Dict, List, Tuple

from pack_lib import build_and_verify_pack

MOD = 10**9 + 7
REQ_PREFIX = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Quy hoạch động\n"


def make_tests_check_sizes(slug: str, tests: List[Dict]) -> List[Dict]:
    """Ensure every problem has exactly 16 tests and every input is strictly < 150 KB."""
    if len(tests) != 16:
        raise ValueError(f"[{slug}] expected 16 tests, got {len(tests)}")
    for idx, t in enumerate(tests, 1):
        sz = len(t["input"].encode("utf-8"))
        if sz >= 150_000:
            raise ValueError(f"[{slug}] test #{idx} size {sz} bytes >= 150,000 bytes")
    return tests


# =============================================================================
# 1. cp08-frog-jump-min-cost (easy, algo.dp_linear)
# =============================================================================
def build_p01_frog_jump() -> Dict:
    rng = random.Random(801)

    def fmt(k: int, h: List[int]) -> str:
        return f"{len(h)} {k}\n" + " ".join(map(str, h)) + "\n"

    def brute_frog(inp: str) -> str:
        data = list(map(int, inp.split()))
        n, k = data[0], data[1]
        h = data[2:]
        if n == 1:
            return "0"
        if n <= 16:
            # Independent bitmask enumeration over all subsets of intermediate stones
            best = 10**30
            m = n - 2
            for mask in range(1 << m):
                prev = 0
                cost = 0
                ok = True
                for i in range(m):
                    if (mask >> i) & 1:
                        nxt = i + 1
                        if nxt - prev > k:
                            ok = False
                            break
                        cost += abs(h[nxt] - h[prev])
                        prev = nxt
                if ok and (n - 1) - prev <= k:
                    cost += abs(h[n - 1] - h[prev])
                    if cost < best:
                        best = cost
            return str(best)
        # Independent Dijkstra on DAG for slightly larger stress inputs
        import heapq
        dist = [10**30] * n
        dist[0] = 0
        pq = [(0, 0)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            lim = min(n, u + k + 1)
            hu = h[u]
            for v in range(u + 1, lim):
                nd = d + abs(hu - h[v])
                if nd < dist[v]:
                    dist[v] = nd
                    heapq.heappush(pq, (nd, v))
        return str(dist[n - 1])

    tests = [
        # Public samples (3)
        {
            "input": fmt(3, [10, 30, 40, 50, 20]),
            "hidden": False,
            "expected": "30",
            "checkBrute": True,
        },
        {
            "input": fmt(1, [10, 20, 10]),
            "hidden": False,
            "expected": "20",
            "checkBrute": True,
        },
        {
            "input": fmt(4, [40, 10, 20, 70, 80, 10, 20, 70, 80, 60]),
            "hidden": False,
            "expected": "40",
            "checkBrute": True,
        },
        # Edge / corner / anti-greedy / overflow (5)
        {
            "input": fmt(1, [10**9]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt(100, [0, 10**9]),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            # Anti-greedy: jumping 0 -> 10 (cost 10) traps at cliff 1000, whereas 0 -> 25 -> 26 costs 26
            "input": fmt(2, [0, 10, 25, 1000, 26]),
            "hidden": True,
            "expected": "26",
            "checkBrute": True,
        },
        {
            # Alternating 0 and 10^9 with K=2: jumps only on 0s -> cost 0
            "input": fmt(2, [0 if i % 2 == 0 else 10**9 for i in range(15)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Alternating 0 and 10^9 with K=1: forced full oscillation -> 14 * 10^9 (overflows 32-bit!)
            "input": fmt(1, [0 if i % 2 == 0 else 10**9 for i in range(15)]),
            "hidden": True,
            "expected": str(14 * 10**9),
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt(5, [rng.randint(0, 1000) for _ in range(30)]), "hidden": True, "checkBrute": True},
        {"input": fmt(10, [rng.randint(0, 10**6) for _ in range(120)]), "hidden": True, "checkBrute": True},
        {"input": fmt(20, [500_000_000] * 500), "hidden": True},
        {"input": fmt(50, [rng.randint(0, 10**9) for _ in range(2000)]), "hidden": True},
        {"input": fmt(100, [rng.randint(0, 10**9) for _ in range(6000)]), "hidden": True},
        # Large N with 10^9 values (12000 * 11 ~ 132 KB)
        {"input": fmt(100, [rng.randint(0, 10**9) for _ in range(12000)]), "hidden": True},
        # Large N with K=1 and 10^9 values (huge 64-bit sum)
        {"input": fmt(1, [0 if i % 2 == 0 else 10**9 for i in range(12000)]), "hidden": True},
        # Very large N=22000 with 5-digit values (~132 KB) and K=60
        {"input": fmt(60, [rng.randint(0, 99999) for _ in range(22000)]), "hidden": True},
    ]

    extra_stress = [
        fmt(rng.randint(1, min(10, n)), [rng.randint(0, 1000) for _ in range(n)])
        for n in [2, 3, 5, 7, 9, 10, 11, 12, 13, 14]
    ]

    statement = r"""
Có $N$ bậc đá xếp thẳng hàng đánh số từ $1$ đến $N$. Bậc đá thứ $i$ có độ cao nguyên $h_i$.

Một chú ếch xuất phát tại bậc đá $1$ và muốn nhảy tới bậc đá $N$. Khi đang đứng ở bậc đá $i$, chú ếch có thể nhảy tới bất kỳ bậc đá $j$ nào thỏa mãn $i < j \le \min(N, i + K)$ (tối đa $K$ bậc về phía trước), với chi phí năng lượng cho cú nhảy đó là $|h_i - h_j|$.

Hãy tìm **tổng chi phí năng lượng nhỏ nhất** để chú ếch đi từ bậc đá $1$ đến bậc đá $N$. Nếu $N = 1$, tổng chi phí là $0$.

### Dữ liệu vào
- Dòng 1 chứa hai số nguyên $N, K$ ($1 \le N \le 30\,000$, $1 \le K \le 100$).
- Dòng 2 chứa $N$ số nguyên $h_1, h_2, \dots, h_N$ ($0 \le h_i \le 10^9$).

### Dữ liệu ra
- Một số nguyên duy nhất là tổng chi phí nhỏ nhất cần tìm.

### Lưu ý
- Kết quả có thể vượt quá phạm vi số nguyên 32-bit, cần sử dụng kiểu số nguyên 64-bit (`long long` trong C++).
"""

    hints = """**Gợi ý 1 (Trạng thái DP):** Gọi $dp[i]$ là tổng chi phí nhỏ nhất để đi từ bậc đá $1$ đến bậc đá $i$. Khởi tạo $dp[1] = 0$.

**Gợi ý 2 (Công thức chuyển trạng thái):** Để nhảy đến bậc $i$, bậc liền trước phải là một bậc $j$ thỏa mãn $\\max(1, i - K) \\le j < i$. Khi đó:
$$dp[i] = \\min_{\\max(1, i - K) \\le j < i} \\bigl(dp[j] + |h_i - h_j|\\bigr)$$

**Gợi ý 3 (Độ phức tạp & tràn số):** Tính lần lượt $dp[2], dp[3], \\dots, dp[N]$ trong $O(N \\cdot K)$ với $N \\cdot K \\le 3 \\times 10^6$. Dùng kiểu `long long` (C++) với giá trị vô cực khoảng $10^{18}$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> h(n);
    for (int i = 0; i < n; ++i) cin >> h[i];

    const long long INF = (1LL << 62);
    vector<long long> dp(n, INF);
    dp[0] = 0;

    for (int i = 1; i < n; ++i) {
        int start = max(0, i - k);
        long long best = INF;
        long long hi = h[i];
        for (int j = start; j < i; ++j) {
            long long cand = dp[j] + llabs(hi - h[j]);
            if (cand < best) best = cand;
        }
        dp[i] = best;
    }

    cout << dp[n - 1] << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n, k = data[0], data[1]
    h = data[2:]

    INF = 10**30
    dp = [0] * n
    for i in range(1, n):
        start = i - k if i > k else 0
        hi = h[i]
        best = INF
        for j in range(start, i):
            diff = hi - h[j]
            if diff < 0:
                diff = -diff
            cand = dp[j] + diff
            if cand < best:
                best = cand
        dp[i] = best

    print(dp[n - 1])


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-frog-jump-min-cost",
        "title": "Ếch nhảy vượt bậc đá",
        "shortDescription": "Tìm chi phí nhỏ nhất nhảy từ bậc đá 1 đến bậc đá N với bước nhảy tối đa K.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.dp_linear",
        "tags": ["quy hoạch động", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: DP 1 chiều $O(N \\cdot K)$, kiểu số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-frog-jump-min-cost", tests),
        "brute": brute_frog,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 2. cp08-house-robber-circular (easy, algo.dp_linear)
# =============================================================================
def build_p02_house_robber() -> Dict:
    rng = random.Random(802)

    def fmt(a: List[int]) -> str:
        return f"{len(a)}\n" + " ".join(map(str, a)) + "\n"

    def brute_robber(inp: str) -> str:
        data = list(map(int, inp.split()))
        n = data[0]
        a = data[1:]
        best_lin = 0
        best_cir = 0
        for mask in range(1 << n):
            if mask & (mask >> 1):
                continue
            s = 0
            for i in range(n):
                if (mask >> i) & 1:
                    s += a[i]
            if s > best_lin:
                best_lin = s
            if n == 1 or not ((mask & 1) and ((mask >> (n - 1)) & 1)):
                if s > best_cir:
                    best_cir = s
        return f"{best_lin}\n{best_cir}"

    tests = [
        # Public samples (3)
        {
            "input": fmt([2, 3, 2]),
            "hidden": False,
            "expected": "4\n3",
            "checkBrute": True,
        },
        {
            "input": fmt([1, 2, 3, 1]),
            "hidden": False,
            "expected": "4\n4",
            "checkBrute": True,
        },
        {
            "input": fmt([10, 1, 1, 10]),
            "hidden": False,
            "expected": "20\n11",
            "checkBrute": True,
        },
        # Edge / corner / anti-greedy / overflow (5)
        {
            "input": fmt([10**9]),
            "hidden": True,
            "expected": "1000000000\n1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt([0]),
            "hidden": True,
            "expected": "0\n0",
            "checkBrute": True,
        },
        {
            "input": fmt([7, 15]),
            "hidden": True,
            "expected": "15\n15",
            "checkBrute": True,
        },
        {
            # All zeros
            "input": fmt([0] * 12),
            "hidden": True,
            "expected": "0\n0",
            "checkBrute": True,
        },
        {
            # Anti-greedy: skipping 2 houses in a row is optimal
            "input": fmt([50, 1, 1, 50, 1, 1, 50]),
            "hidden": True,
            "expected": "150\n101",
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt([rng.randint(0, 100) for _ in range(14)]), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(0, 1000) for _ in range(17)]), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(0, 10**6) for _ in range(200)]), "hidden": True},
        {"input": fmt([10**9] * 1001), "hidden": True},
        {"input": fmt([rng.randint(0, 10**9) for _ in range(5000)]), "hidden": True},
        # 64-bit overflow test with large N=12000 and values up to 10^9 (~132 KB)
        {"input": fmt([10**9 if i % 2 == 0 else 10**9 - 1 for i in range(12000)]), "hidden": True},
        {"input": fmt([rng.randint(0, 10**9) for _ in range(12000)]), "hidden": True},
        # Large N=25000 with 5-digit values (~145 KB)
        {"input": fmt([rng.randint(0, 99999) for _ in range(25000)]), "hidden": True},
    ]

    extra_stress = [
        fmt([rng.randint(0, 50) for _ in range(n)])
        for n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    ]

    statement = r"""
Có $N$ ngôi nhà đánh số từ $1$ đến $N$, ngôi nhà thứ $i$ có giá trị nguyên không âm $a_i$.

Bạn cần chọn một tập con các ngôi nhà sao cho **không có hai ngôi nhà nào kề nhau cùng được chọn** và tổng giá trị thu được là **lớn nhất**.

Hãy tính tổng giá trị lớn nhất trong hai kịch bản độc lập:
1. **Đường thẳng:** Các ngôi nhà xếp thành một dãy thẳng $1 - 2 - \dots - N$ (nhà $1$ và nhà $N$ không kề nhau khi $N \ge 3$).
2. **Vòng tròn:** Các ngôi nhà xếp khép kín thành vòng tròn, nghĩa là nhà $1$ cũng kề với nhà $N$ (riêng khi $N = 1$, bạn vẫn được chọn ngôi nhà duy nhất đó).

### Dữ liệu vào
- Dòng 1 chứa số nguyên $N$ ($1 \le N \le 30\,000$).
- Dòng 2 chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$).

### Dữ liệu ra
- Dòng 1: tổng giá trị lớn nhất trên đường thẳng.
- Dòng 2: tổng giá trị lớn nhất trên vòng tròn.
"""

    hints = """**Gợi ý 1 (Bản đường thẳng):** Gọi $dp[i]$ là tổng lớn nhất khi xét $i$ ngôi nhà đầu tiên. Với ngôi nhà $i$, ta hoặc bỏ qua nó ($dp[i-1]$), hoặc chọn nó và cộng với $dp[i-2]$. Do đó $dp[i] = \\max(dp[i-1], dp[i-2] + a_i)$.

**Gợi ý 2 (Khử vòng tròn):** Trên vòng tròn ($N \\ge 2$), nhà $1$ và nhà $N$ không thể cùng được chọn. Vì vậy mọi phương án hợp lệ đều nằm trong ít nhất một trong hai dãy thẳng: bỏ nhà cuối ($a_1 \\dots a_{N-1}$) hoặc bỏ nhà đầu ($a_2 \\dots a_N$).

**Gợi ý 3 (Tối ưu bộ nhớ & trường hợp $N=1$):** Riêng $N = 1$ trả về $a_1$ cho cả hai dòng. Dùng hai biến `prev2`, `prev1` để tính DP đường thẳng trong $O(N)$ thời gian và $O(1)$ bộ nhớ phụ."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

long long solve_linear(const vector<long long>& a, int l, int r) {
    long long prev2 = 0, prev1 = 0;
    for (int i = l; i <= r; ++i) {
        long long cur = max(prev1, prev2 + a[i]);
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    long long ans_linear = solve_linear(a, 0, n - 1);
    long long ans_circular = (n == 1)
        ? a[0]
        : max(solve_linear(a, 0, n - 2), solve_linear(a, 1, n - 1));

    cout << ans_linear << '\n' << ans_circular << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def solve_linear(arr, l: int, r: int) -> int:
    prev2 = 0
    prev1 = 0
    for i in range(l, r + 1):
        cand = prev2 + arr[i]
        cur = cand if cand > prev1 else prev1
        prev2 = prev1
        prev1 = cur
    return prev1


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n = data[0]
    a = data[1:]

    ans_linear = solve_linear(a, 0, n - 1)
    if n == 1:
        ans_circular = a[0]
    else:
        c1 = solve_linear(a, 0, n - 2)
        c2 = solve_linear(a, 1, n - 1)
        ans_circular = c1 if c1 > c2 else c2

    print(ans_linear)
    print(ans_circular)


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-house-robber-circular",
        "title": "Chọn nhà không kề nhau (Thẳng & Vòng tròn)",
        "shortDescription": "Tìm tổng giá trị lớn nhất khi chọn các nhà không kề nhau trên đường thẳng và trên vòng tròn.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.dp_linear",
        "tags": ["quy hoạch động", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: DP 1 chiều $O(N)$, tách bài toán vòng tròn thành 2 bài toán thẳng.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-house-robber-circular", tests),
        "brute": brute_robber,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 3. cp08-grid-max-sum-and-ways (easy, algo.dp_grid)
# =============================================================================
def build_p03_grid_max_ways() -> Dict:
    rng = random.Random(803)

    def fmt(grid: List[List[int]]) -> str:
        n = len(grid)
        m = len(grid[0])
        lines = [f"{n} {m}"]
        lines.extend(" ".join(map(str, row)) for row in grid)
        return "\n".join(lines) + "\n"

    def brute_grid(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n, m = tokens[0], tokens[1]
        grid = [tokens[2 + i * m : 2 + (i + 1) * m] for i in range(n)]
        steps = n + m - 2
        best = -(10**30)
        ways = 0
        for downs in itertools.combinations(range(steps), n - 1):
            down_set = set(downs)
            r = c = 0
            total = grid[0][0]
            for s in range(steps):
                if s in down_set:
                    r += 1
                else:
                    c += 1
                total += grid[r][c]
            if total > best:
                best = total
                ways = 1
            elif total == best:
                ways += 1
        return f"{best} {ways % MOD}"

    tests = [
        # Public samples (3)
        {
            "input": fmt([
                [1, 3, 1],
                [1, 5, 1],
                [4, 2, 1],
            ]),
            "hidden": False,
            "expected": "12 1",
            "checkBrute": True,
        },
        {
            "input": fmt([
                [1, 2],
                [2, 1],
            ]),
            "hidden": False,
            "expected": "4 2",
            "checkBrute": True,
        },
        {
            "input": fmt([
                [-5, -2, -3],
                [-2, -1, -4],
            ]),
            "hidden": False,
            "expected": "-12 2",
            "checkBrute": True,
        },
        # Edge / corner / negative / anti-greedy / modulo (5)
        {
            "input": fmt([[-1000000]]),
            "hidden": True,
            "expected": "-1000000 1",
            "checkBrute": True,
        },
        {
            "input": fmt([[10, -20, 30, -40, 50]]),
            "hidden": True,
            "expected": "30 1",
            "checkBrute": True,
        },
        {
            "input": fmt([[5], [-10], [20], [-3]]),
            "hidden": True,
            "expected": "12 1",
            "checkBrute": True,
        },
        {
            # Anti-greedy: stepping right gives +100 immediately but leads to -1000, down gives -5 then +500
            "input": fmt([
                [0, 100, -1000],
                [-5, -1000, -1000],
                [500, 10, 0],
            ]),
            "hidden": True,
            "expected": "505 1",
            "checkBrute": True,
        },
        {
            # All equal values 7 on 6x6 -> sum = 7*11 = 77, ways = C(10, 5) = 252
            "input": fmt([[7] * 6 for _ in range(6)]),
            "hidden": True,
            "expected": "77 252",
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt([[rng.randint(-5, 5) for _ in range(7)] for _ in range(7)]), "hidden": True, "checkBrute": True},
        {"input": fmt([[rng.randint(-2, 2) for _ in range(8)] for _ in range(6)]), "hidden": True, "checkBrute": True},
        # All equal 40x40 -> C(78, 39) overflows 64-bit, verifies modulo 10^9+7
        {"input": fmt([[1] * 40 for _ in range(40)]), "hidden": True},
        # All negative 80x80 with large magnitudes
        {"input": fmt([[rng.randint(-10**6, -1) for _ in range(80)] for _ in range(80)]), "hidden": True},
        # Asymmetric tall 300x60 (~110 KB)
        {"input": fmt([[rng.randint(-999, 999) for _ in range(60)] for _ in range(300)]), "hidden": True},
        # Asymmetric wide 60x300 (~110 KB)
        {"input": fmt([[rng.randint(-999, 999) for _ in range(300)] for _ in range(60)]), "hidden": True},
        # Dense tie-heavy 250x250 with 0/1 values (~125 KB)
        {"input": fmt([[rng.randint(0, 1) for _ in range(250)] for _ in range(250)]), "hidden": True},
        # Full [-10^6, 10^6] 130x130 (~135 KB)
        {"input": fmt([[rng.randint(-10**6, 10**6) for _ in range(130)] for _ in range(130)]), "hidden": True},
    ]

    extra_stress = [
        fmt([[rng.randint(-3, 3) for _ in range(m)] for _ in range(n)])
        for n, m in [(1, 4), (4, 1), (2, 5), (5, 2), (3, 4), (4, 4), (5, 5), (6, 5)]
    ]

    statement = r"""
Cho bảng lưới kích thước $N \times M$ ($N$ hàng, $M$ cột). Ô ở hàng $i$, cột $j$ ($1 \le i \le N$, $1 \le j \le M$) ghi một số nguyên $a_{i,j}$ (có thể âm, bằng $0$ hoặc dương).

Xuất phát từ ô $(1, 1)$, ở mỗi bước bạn chỉ được di chuyển **xuống dưới** sang ô $(i+1, j)$ hoặc **sang phải** sang ô $(i, j+1)$ cho đến khi tới ô $(N, M)$. Tổng điểm của một đường đi là tổng giá trị tất cả các ô mà nó đi qua (tính cả $(1, 1)$ và $(N, M)$).

Hãy tìm:
1. Tổng điểm **lớn nhất** có thể đạt được.
2. Số lượng đường đi khác nhau đạt **đúng** tổng điểm lớn nhất đó, lấy phần dư khi chia cho $10^9 + 7$.

### Dữ liệu vào
- Dòng 1 chứa hai số nguyên $N, M$ ($1 \le N, M \le 300$).
- $N$ dòng tiếp theo, mỗi dòng chứa $M$ số nguyên $a_{i,j}$ ($|a_{i,j}| \le 10^6$).

### Dữ liệu ra
- Một dòng gồm hai số nguyên cách nhau bởi dấu cách: tổng điểm lớn nhất và số đường đi đạt tổng điểm lớn nhất đó theo modulo $10^9 + 7$.
"""

    hints = """**Gợi ý 1 (Cặp trạng thái DP trên lưới):** Tại mỗi ô $(i, j)$, lưu đồng thời hai giá trị: $dp[i][j]$ là tổng điểm lớn nhất để đi từ $(1, 1)$ tới $(i, j)$ và $cnt[i][j]$ là số đường đi đạt đúng $dp[i][j]$ (theo modulo $10^9 + 7$).

**Gợi ý 2 (Xử lý rẽ nhánh và hòa nhau):** Với $i > 1$ và $j > 1$, so sánh $dp[i-1][j]$ (từ trên xuống) và $dp[i][j-1]$ (từ trái sang):
- Nếu một hướng lớn hơn hẳn, kế thừa $dp$ và $cnt$ của hướng đó.
- Nếu hai hướng **bằng nhau**, cộng dồn số cách: $cnt[i][j] = (cnt[i-1][j] + cnt[i][j-1]) \\bmod (10^9 + 7)$.

**Gợi ý 3 (Giá trị âm & tối ưu bộ nhớ):** Vì $a_{i,j}$ có thể âm, không khởi tạo $dp$ bằng $0$ mà tính riêng hàng đầu và cột đầu (mỗi ô ở biên có duy nhất $1$ đường đi). Có thể nén bảng DP về mảng 1 chiều $O(M)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    const int MOD = 1000000007;
    vector<long long> dp(m, 0);
    vector<int> cnt(m, 0);

    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < m; ++j) {
            long long val;
            cin >> val;
            if (i == 0 && j == 0) {
                dp[0] = val;
                cnt[0] = 1;
            } else if (i == 0) {
                dp[j] = dp[j - 1] + val;
                cnt[j] = 1;
            } else if (j == 0) {
                dp[0] = dp[0] + val;
                // cnt[0] stays 1
            } else {
                long long top = dp[j];
                long long left = dp[j - 1];
                if (top > left) {
                    dp[j] = top + val;
                } else if (left > top) {
                    dp[j] = left + val;
                    cnt[j] = cnt[j - 1];
                } else {
                    dp[j] = top + val;
                    int s = cnt[j] + cnt[j - 1];
                    if (s >= MOD) s -= MOD;
                    cnt[j] = s;
                }
            }
        }
    }

    cout << dp[m - 1] << ' ' << cnt[m - 1] << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n, m = data[0], data[1]
    MOD = 1000000007

    dp = [0] * m
    cnt = [0] * m

    idx = 2
    # Row 0
    dp[0] = data[idx]
    cnt[0] = 1
    idx += 1
    for j in range(1, m):
        dp[j] = dp[j - 1] + data[idx]
        cnt[j] = 1
        idx += 1

    # Rows 1..n-1
    for _ in range(1, n):
        dp[0] += data[idx]
        idx += 1
        for j in range(1, m):
            val = data[idx]
            idx += 1
            top = dp[j]
            left = dp[j - 1]
            if top > left:
                dp[j] = top + val
            elif left > top:
                dp[j] = left + val
                cnt[j] = cnt[j - 1]
            else:
                dp[j] = top + val
                s = cnt[j] + cnt[j - 1]
                if s >= MOD:
                    s -= MOD
                cnt[j] = s

    print(f"{dp[m - 1]} {cnt[m - 1]}")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-grid-max-sum-and-ways",
        "title": "Đường đi cực đại và đếm cách trên lưới",
        "shortDescription": "Tìm tổng điểm lớn nhất và số đường đi đạt tổng lớn nhất từ (1,1) đến (N,M) trên lưới.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.dp_grid",
        "tags": ["quy hoạch động", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Grid DP 2D nén 1D $O(N \\cdot M)$, đếm số cách theo modulo $10^9+7$.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-grid-max-sum-and-ways", tests),
        "brute": brute_grid,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 4. cp08-knapsack-01 (medium, algo.dp_knapsack)
# =============================================================================
def build_p04_knapsack_01() -> Dict:
    rng = random.Random(804)

    def fmt(w_cap: int, items: List[Tuple[int, int]]) -> str:
        lines = [f"{len(items)} {w_cap}"]
        lines.extend(f"{w} {v}" for w, v in items)
        return "\n".join(lines) + "\n"

    def brute_knapsack(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n, w_cap = tokens[0], tokens[1]
        ws = [tokens[2 + 2 * i] for i in range(n)]
        vs = [tokens[3 + 2 * i] for i in range(n)]
        best = 0
        for mask in range(1 << n):
            tw = 0
            tv = 0
            for i in range(n):
                if (mask >> i) & 1:
                    tw += ws[i]
                    if tw > w_cap:
                        break
                    tv += vs[i]
            else:
                if tv > best:
                    best = tv
        return str(best)

    tests = [
        # Public samples (3)
        {
            "input": fmt(8, [(3, 30), (4, 50), (5, 60)]),
            "hidden": False,
            "expected": "90",
            "checkBrute": True,
        },
        {
            "input": fmt(10, [(6, 36), (5, 29), (5, 29)]),
            "hidden": False,
            "expected": "58",
            "checkBrute": True,
        },
        {
            "input": fmt(10, [(3, 100), (7, 1)]),
            "hidden": False,
            "expected": "101",
            "checkBrute": True,
        },
        # Edge / corner / anti-greedy / overflow (5)
        {
            "input": fmt(1, [(1, 10**9)]),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            # Anti-greedy by largest value
            "input": fmt(10, [(10, 100), (5, 60), (5, 60)]),
            "hidden": True,
            "expected": "120",
            "checkBrute": True,
        },
        {
            # Anti-forward-loop trap (unbounded vs 0/1): total w = 2+5+10 = 17 > 15, best 0/1 picks items 1 & 2
            "input": fmt(15, [(2, 10**9), (5, 10**9 - 1), (10, 10**9 - 2)]),
            "hidden": True,
            "expected": str(2 * 10**9 - 1),
            "checkBrute": True,
        },
        {
            # All items fit -> sum exceeds 32-bit int
            "input": fmt(10000, [(100, 10**9) for _ in range(100)]),
            "hidden": True,
            "expected": str(100 * 10**9),
        },
        {
            # Tight capacity with many small equal-ratio items
            "input": fmt(20, [(6, 60), (7, 70), (8, 80), (9, 90), (11, 110), (13, 125)]),
            "hidden": True,
            "expected": "200",
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt(50, [(rng.randint(1, 25), rng.randint(1, 1000)) for _ in range(15)]), "hidden": True, "checkBrute": True},
        {"input": fmt(80, [(rng.randint(1, 40), rng.randint(1, 10**6)) for _ in range(16)]), "hidden": True, "checkBrute": True},
        {"input": fmt(500, [(rng.randint(1, 200), rng.randint(1, 10**9)) for _ in range(40)]), "hidden": True},
        {"input": fmt(2000, [(rng.randint(1, 500), rng.randint(1, 10**9)) for _ in range(70)]), "hidden": True},
        {"input": fmt(5000, [(rng.randint(1, 1000), rng.randint(1, 10**9)) for _ in range(100)]), "hidden": True},
        # Max N=100, W=10000 random
        {"input": fmt(10000, [(rng.randint(1, 1500), rng.randint(1, 10**9)) for _ in range(100)]), "hidden": True},
        # Strongly correlated v_i = w_i * 10^5 + small noise (hard for branch-and-bound!)
        {
            "input": fmt(
                10000,
                [(w, w * 100000 + rng.randint(1, 500)) for w in (rng.randint(50, 800) for _ in range(100))],
            ),
            "hidden": True,
        },
        # All small weights to stress full range [0..10000]
        {"input": fmt(10000, [(rng.randint(1, 250), rng.randint(10**8, 10**9)) for _ in range(100)]), "hidden": True},
    ]

    extra_stress = []
    for n_items in [1, 2, 4, 6, 8, 10, 12, 13, 14]:
        cap = rng.randint(5, 40)
        extra_stress.append(
            fmt(cap, [(rng.randint(1, min(15, cap)), rng.randint(1, 500)) for _ in range(n_items)])
        )

    statement = r"""
Có $N$ đồ vật được đánh số từ $1$ đến $N$. Đồ vật thứ $i$ có khối lượng $w_i$ và giá trị $v_i$.

Bạn mang theo một chiếc ba lô có sức chứa tối đa là $W$. Với mỗi đồ vật, bạn chỉ có thể **chọn đúng một lần** hoặc **không chọn**.

Hãy tìm **tổng giá trị lớn nhất** của các đồ vật có thể xếp vào ba lô sao cho tổng khối lượng của chúng không vượt quá $W$.

### Dữ liệu vào
- Dòng 1 chứa hai số nguyên $N, W$ ($1 \le N \le 100$, $1 \le W \le 10\,000$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa hai số nguyên $w_i, v_i$ ($1 \le w_i \le W$, $1 \le v_i \le 10^9$).

### Dữ liệu ra
- Một số nguyên duy nhất là tổng giá trị lớn nhất có thể mang theo.
"""

    hints = """**Gợi ý 1 (Trạng thái DP 2D):** Gọi $dp[i][c]$ là tổng giá trị lớn nhất khi xét $i$ đồ vật đầu tiên với tổng khối lượng không quá $c$. Nếu không chọn vật $i$, ta giữ $dp[i-1][c]$; nếu chọn ($c \\ge w_i$), ta được $dp[i-1][c - w_i] + v_i$.

**Gợi ý 2 (Nén xuống mảng 1 chiều):** Vì hàng $i$ chỉ phụ thuộc hàng $i-1$, ta dùng một mảng 1 chiều `dp[0..W]`. Quan trọng: khi duyệt theo từng vật $(w_i, v_i)$, phải duyệt sức chứa $c$ **giảm dần từ $W$ về $w_i$** để đảm bảo mỗi vật chỉ được dùng tối đa một lần.

**Gợi ý 3 (Tràn số):** Giá trị mỗi vật lên tới $10^9$ và có $100$ vật nên tổng có thể lên tới $10^{11}$ — bắt buộc dùng `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, W;
    if (!(cin >> n >> W)) return 0;

    vector<long long> dp(W + 1, 0);
    for (int i = 0; i < n; ++i) {
        int w;
        long long v;
        cin >> w >> v;
        for (int c = W; c >= w; --c) {
            long long cand = dp[c - w] + v;
            if (cand > dp[c]) dp[c] = cand;
        }
    }

    cout << dp[W] << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n, W = data[0], data[1]
    dp = [0] * (W + 1)

    idx = 2
    for _ in range(n):
        w = data[idx]
        v = data[idx + 1]
        idx += 2
        if w > W:
            continue
        for c in range(W, w - 1, -1):
            cand = dp[c - w] + v
            if cand > dp[c]:
                dp[c] = cand

    print(dp[W])


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-knapsack-01",
        "title": "Bài toán cái túi 0/1",
        "shortDescription": "Chọn tập con đồ vật không vượt quá sức chứa ba lô W để tối đa hóa tổng giá trị.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.dp_knapsack",
        "tags": ["quy hoạch động", "ba lô", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Knapsack 0/1 dùng mảng cuộn 1D $O(N \\cdot W)$ thời gian, $O(W)$ bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-knapsack-01", tests),
        "brute": brute_knapsack,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 5. cp08-coin-change-min-and-ways (medium, algo.dp_knapsack)
# =============================================================================
def build_p05_coin_change() -> Dict:
    rng = random.Random(805)

    def fmt(s: int, coins: List[int]) -> str:
        return f"{len(coins)} {s}\n" + " ".join(map(str, coins)) + "\n"

    def brute_coins(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n, target = tokens[0], tokens[1]
        coins = tokens[2:]
        best = [10**9]
        ways = [0]

        def dfs(idx: int, rem: int, used: int) -> None:
            if rem == 0:
                ways[0] += 1
                if used < best[0]:
                    best[0] = used
                return
            if idx == n:
                return
            c = coins[idx]
            max_k = rem // c
            for k in range(max_k + 1):
                dfs(idx + 1, rem - k * c, used + k)

        dfs(0, target, 0)
        min_ans = -1 if best[0] == 10**9 else best[0]
        return f"{min_ans}\n{ways[0] % MOD}"

    tests = [
        # Public samples (3)
        {
            "input": fmt(6, [1, 3, 4]),
            "hidden": False,
            "expected": "2\n4",
            "checkBrute": True,
        },
        {
            "input": fmt(3, [1, 2]),
            "hidden": False,
            "expected": "2\n2",
            "checkBrute": True,
        },
        {
            "input": fmt(7, [2, 4, 6]),
            "hidden": False,
            "expected": "-1\n0",
            "checkBrute": True,
        },
        # Edge / corner / anti-greedy / unordered trap (5)
        {
            # Coins larger than S
            "input": fmt(3, [5, 10, 100]),
            "hidden": True,
            "expected": "-1\n0",
            "checkBrute": True,
        },
        {
            # Single coin divides S
            "input": fmt(10000, [1]),
            "hidden": True,
            "expected": "10000\n1",
        },
        {
            # Single coin equals S
            "input": fmt(9999, [9999]),
            "hidden": True,
            "expected": "1\n1",
            "checkBrute": True,
        },
        {
            # Anti-greedy classic: coins [1, 6, 10], S=12 -> 6+6 (2 coins), greedy gives 10+1+1 (3 coins)
            "input": fmt(12, [1, 6, 10]),
            "hidden": True,
            "expected": "2\n4",
            "checkBrute": True,
        },
        {
            # Unsorted distinct coins with impossible remainder
            "input": fmt(11, [9, 6, 3]),
            "hidden": True,
            "expected": "-1\n0",
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt(25, [2, 3, 5, 7]), "hidden": True, "checkBrute": True},
        {"input": fmt(30, [1, 4, 7, 11, 13]), "hidden": True, "checkBrute": True},
        {"input": fmt(200, rng.sample(range(1, 60), 15)), "hidden": True},
        {"input": fmt(1000, rng.sample(range(1, 300), 40)), "hidden": True},
        # Impossible large S (all multiples of 3, S=9998)
        {"input": fmt(9998, [3 * i for i in range(1, 101)]), "hidden": True},
        # Partition-like huge combinations mod 10^9+7: coins 1..100, S=10000
        {"input": fmt(10000, list(range(1, 101))), "hidden": True},
        # Max N=100 random distinct coins, S=10000
        {"input": fmt(10000, rng.sample(range(1, 10001), 100)), "hidden": True},
        # Dense small + medium coins, S=9973 (prime)
        {"input": fmt(9973, rng.sample(range(1, 500), 100)), "hidden": True},
    ]

    extra_stress = []
    for _ in range(10):
        n_c = rng.randint(1, 5)
        s_val = rng.randint(1, 22)
        cs = rng.sample(range(1, 18), n_c)
        extra_stress.append(fmt(s_val, cs))

    statement = r"""
Có $N$ loại đồng xu với các mệnh giá nguyên dương **đôi một phân biệt** $c_1, c_2, \dots, c_N$. Mỗi loại đồng xu đều có sẵn số lượng không giới hạn.

Cho số tiền nguyên dương $S$. Hãy xác định hai đại lượng:
1. Số đồng xu **ít nhất** cần dùng để có tổng đúng bằng $S$. Nếu không tồn tại cách đổi nào, in `-1`.
2. Số **tổ hợp** đồng xu khác nhau (không phân biệt thứ tự, tức `1 + 2` và `2 + 1` chỉ tính là `1` cách) có tổng đúng bằng $S$, lấy phần dư khi chia cho $10^9 + 7$. Nếu không thể đổi được, số cách là `0`.

### Dữ liệu vào
- Dòng 1 chứa hai số nguyên $N, S$ ($1 \le N \le 100$, $1 \le S \le 10\,000$).
- Dòng 2 chứa $N$ số nguyên đôi một phân biệt $c_1, c_2, \dots, c_N$ ($1 \le c_i \le 10^4$).

### Dữ liệu ra
- Dòng 1: số đồng xu ít nhất (hoặc `-1` nếu không thể đổi).
- Dòng 2: số tổ hợp đồng xu tạo thành tổng $S$ theo modulo $10^9 + 7$.
"""

    hints = """**Gợi ý 1 (Cẩn thận tham lam & thứ tự vòng lặp):** Thuật toán tham lam chọn mệnh giá lớn nhất có thể sai (ví dụ mệnh giá `{1, 3, 4}` với $S = 6$: tối ưu là `3 + 3` chỉ tốn 2 xu). Ngoài ra, để đếm **tổ hợp** (không tính thứ tự) chứ không phải hoán vị, thứ tự hai vòng lặp cực kỳ quan trọng!

**Gợi ý 2 (Công thức DP không giới hạn — Unbounded Knapsack):** Duyệt **vòng ngoài** theo từng mệnh giá $c$, và **vòng trong** theo tổng $x$ **tăng dần** từ $c$ đến $S$:
- `minCoins[x] = min(minCoins[x], minCoins[x - c] + 1)`
- `ways[x] = (ways[x] + ways[x - c]) % (10^9 + 7)`

**Gợi ý 3 (Khởi tạo cơ sở):** Đặt `minCoins[0] = 0`, các vị trí khác bằng `INF` (ví dụ $10^9$); đặt `ways[0] = 1`, các vị trí khác bằng $0$. Cuối cùng nếu `minCoins[S] >= INF` thì in `-1` ở dòng 1."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, S;
    if (!(cin >> n >> S)) return 0;
    vector<int> coins(n);
    for (int i = 0; i < n; ++i) cin >> coins[i];

    const int INF = 1e9;
    const int MOD = 1000000007;
    vector<int> min_coins(S + 1, INF);
    vector<int> ways(S + 1, 0);
    min_coins[0] = 0;
    ways[0] = 1;

    for (int c : coins) {
        if (c > S) continue;
        for (int x = c; x <= S; ++x) {
            if (min_coins[x - c] + 1 < min_coins[x]) {
                min_coins[x] = min_coins[x - c] + 1;
            }
            int w = ways[x] + ways[x - c];
            if (w >= MOD) w -= MOD;
            ways[x] = w;
        }
    }

    cout << (min_coins[S] >= INF ? -1 : min_coins[S]) << '\n';
    cout << ways[S] << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n, S = data[0], data[1]
    coins = data[2:]

    INF = 10**9
    MOD = 1000000007
    min_coins = [INF] * (S + 1)
    ways = [0] * (S + 1)
    min_coins[0] = 0
    ways[0] = 1

    for c in coins:
        if c > S:
            continue
        for x in range(c, S + 1):
            cand = min_coins[x - c] + 1
            if cand < min_coins[x]:
                min_coins[x] = cand
            w = ways[x] + ways[x - c]
            if w >= MOD:
                w -= MOD
            ways[x] = w

    print(-1 if min_coins[S] >= INF else min_coins[S])
    print(ways[S])


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-coin-change-min-and-ways",
        "title": "Đổi tiền tối thiểu và đếm tổ hợp",
        "shortDescription": "Tìm số đồng xu ít nhất và số tổ hợp đồng xu không tính thứ tự để tạo tổng S.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.dp_knapsack",
        "tags": ["quy hoạch động", "ba lô", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Unbounded Knapsack $O(N \\cdot S)$, phân biệt tổ hợp vs hoán vị.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-coin-change-min-and-ways", tests),
        "brute": brute_coins,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 6. cp08-lis-nlogn (medium, algo.dp_lis_lcs)
# =============================================================================
def build_p06_lis_nlogn() -> Dict:
    rng = random.Random(806)

    def fmt(a: List[int]) -> str:
        return f"{len(a)}\n" + " ".join(map(str, a)) + "\n"

    def brute_lis(inp: str) -> str:
        data = list(map(int, inp.split()))
        n = data[0]
        a = data[1:]
        # Textbook O(N^2) DP — completely independent from O(N log N) patience-sorting tails
        dp_s = [1] * n
        dp_n = [1] * n
        for i in range(n):
            for j in range(i):
                if a[j] < a[i] and dp_s[j] + 1 > dp_s[i]:
                    dp_s[i] = dp_s[j] + 1
                if a[j] <= a[i] and dp_n[j] + 1 > dp_n[i]:
                    dp_n[i] = dp_n[j] + 1
        return f"{max(dp_s)}\n{max(dp_n)}"

    tests = [
        # Public samples (3)
        {
            "input": fmt([10, 9, 2, 5, 3, 7, 101, 18]),
            "hidden": False,
            "expected": "4\n4",
            "checkBrute": True,
        },
        {
            "input": fmt([3, 1, 2, 2, 4, 2, 5]),
            "hidden": False,
            "expected": "4\n5",
            "checkBrute": True,
        },
        {
            "input": fmt([5, 5, 5, 5, 5]),
            "hidden": False,
            "expected": "1\n5",
            "checkBrute": True,
        },
        # Edge / corner / negative / monotonicity (5)
        {
            "input": fmt([-10**9]),
            "hidden": True,
            "expected": "1\n1",
            "checkBrute": True,
        },
        {
            "input": fmt([10, 8, 6, 4, 2, 0, -2, -10**9]),
            "hidden": True,
            "expected": "1\n1",
            "checkBrute": True,
        },
        {
            "input": fmt([-10**9, -500, -500, 0, 100, 100, 10**9]),
            "hidden": True,
            "expected": "5\n7",
            "checkBrute": True,
        },
        {
            # Strictly increasing
            "input": fmt(list(range(-50, 50))),
            "hidden": True,
            "expected": "100\n100",
            "checkBrute": True,
        },
        {
            # Sawtooth pattern where greedy fails
            "input": fmt([4, 5, 6, 1, 2, 3, 4, 2, 3, 5, 6, 7]),
            "hidden": True,
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt([rng.randint(-10, 10) for _ in range(150)]), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(-10**9, 10**9) for _ in range(250)]), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(-50, 50) for _ in range(3000)]), "hidden": True},
        {"input": fmt([rng.randint(-10**9, 10**9) for _ in range(11000)]), "hidden": True},
        # Full N=30000 with values in [-999, 999] (~135 KB) -> defeats O(N^2)!
        {"input": fmt([rng.randint(-999, 999) for _ in range(30000)]), "hidden": True},
        # Full N=30000 with many duplicates in [0, 30] (~90 KB)
        {"input": fmt([rng.randint(0, 30) for _ in range(30000)]), "hidden": True},
        # Full N=30000 strictly decreasing blocks (worst case for naive updates) (~140 KB)
        {"input": fmt([(i // 200) * 5 + (199 - (i % 200)) for i in range(30000)]), "hidden": True},
        # Full N=30000 all equal (~60 KB)
        {"input": fmt([42] * 30000), "hidden": True},
    ]

    extra_stress = [
        fmt([rng.randint(-5, 5) for _ in range(n)])
        for n in [1, 2, 3, 5, 8, 15, 30, 60, 100]
    ]

    statement = r"""
Cho dãy gồm $N$ số nguyên $a_1, a_2, \dots, a_N$.

Một **dãy con** của $a$ được tạo ra bằng cách xóa bỏ một số phần tử (có thể không xóa phần tử nào) và giữ nguyên thứ tự xuất hiện ban đầu của các phần tử còn lại.

Hãy tính:
1. Độ dài dãy con **tăng nghiêm ngặt** dài nhất (*LIS*): $a_{i_1} < a_{i_2} < \dots < a_{i_k}$.
2. Độ dài dãy con **không giảm** dài nhất (*LNDS*): $a_{i_1} \le a_{i_2} \le \dots \le a_{i_k}$.

### Dữ liệu vào
- Dòng 1 chứa số nguyên $N$ ($1 \le N \le 30\,000$).
- Dòng 2 chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Dữ liệu ra
- Dòng 1: độ dài dãy con tăng nghiêm ngặt dài nhất.
- Dòng 2: độ dài dãy con không giảm dài nhất.
"""

    hints = r"""**Gợi ý 1 (Vượt qua $O(N^2)$):** DP cổ điển $dp[i] = 1 + \max_{j < i} dp[j]$ tốn $O(N^2)$, quá chậm với $N = 30\,000$. Thay vào đó, hãy duy trì mảng `tails`, trong đó `tails[len - 1]` lưu **giá trị phần tử kết thúc nhỏ nhất có thể** của một dãy con hợp lệ có độ dài `len`.

**Gợi ý 2 (Tính chất đơn điệu & Tìm kiếm nhị phân):** Mảng `tails` luôn tăng (hoặc không giảm). Khi xét phần tử $x$:
- Với **tăng nghiêm ngặt (LIS):** tìm vị trí đầu tiên `pos` có `tails[pos] >= x` (`lower_bound` trong C++, `bisect_left` trong Python).
- Với **không giảm (LNDS):** tìm vị trí đầu tiên `pos` có `tails[pos] > x` (`upper_bound` trong C++, `bisect_right` trong Python).

**Gợi ý 3 (Cập nhật):** Nếu `pos == len(tails)`, nối thêm $x$ vào cuối `tails`; ngược lại gán `tails[pos] = x`. Kết quả chính là kích thước cuối cùng của `tails`, độ phức tạp $O(N \log N)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<int> tails_strict;
    vector<int> tails_nondec;
    tails_strict.reserve(n);
    tails_nondec.reserve(n);

    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;

        auto it1 = lower_bound(tails_strict.begin(), tails_strict.end(), x);
        if (it1 == tails_strict.end()) tails_strict.push_back(x);
        else *it1 = x;

        auto it2 = upper_bound(tails_nondec.begin(), tails_nondec.end(), x);
        if (it2 == tails_nondec.end()) tails_nondec.push_back(x);
        else *it2 = x;
    }

    cout << tails_strict.size() << '\n' << tails_nondec.size() << '\n';
    return 0;
}
"""

    py_sol = r"""import sys
from bisect import bisect_left, bisect_right


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    a = data[1:]

    tails_strict = []
    tails_nondec = []

    for x in a:
        pos1 = bisect_left(tails_strict, x)
        if pos1 == len(tails_strict):
            tails_strict.append(x)
        else:
            tails_strict[pos1] = x

        pos2 = bisect_right(tails_nondec, x)
        if pos2 == len(tails_nondec):
            tails_nondec.append(x)
        else:
            tails_nondec[pos2] = x

    print(len(tails_strict))
    print(len(tails_nondec))


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-lis-nlogn",
        "title": "Dãy con tăng dài nhất (LIS & LNDS)",
        "shortDescription": "Tính độ dài dãy con tăng nghiêm ngặt dài nhất và không giảm dài nhất trong O(N log N).",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.dp_lis_lcs",
        "tags": ["quy hoạch động", "tìm kiếm nhị phân", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Patience Sorting / DP + Tìm kiếm nhị phân $O(N \\log N)$.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-lis-nlogn", tests),
        "brute": brute_lis,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 7. cp08-edit-distance (medium, algo.dp_lis_lcs)
# =============================================================================
def build_p07_edit_distance() -> Dict:
    rng = random.Random(807)

    def fmt(a: str, b: str) -> str:
        return f"{a}\n{b}\n"

    def rand_str(length: int, alphabet: str) -> str:
        return "".join(rng.choice(alphabet) for _ in range(length))

    def brute_edit(inp: str) -> str:
        # Independent 0-1 BFS on the edit graph from (0, 0) to (n, m)
        lines = inp.strip().splitlines()
        a, b = lines[0].strip(), lines[1].strip()
        n, m = len(a), len(b)
        INF = 10**9
        dist = [[INF] * (m + 1) for _ in range(n + 1)]
        dist[0][0] = 0
        dq = deque([(0, 0)])
        while dq:
            i, j = dq.popleft()
            d = dist[i][j]
            if i == n and j == m:
                return str(d)
            if i < n and j < m:
                cost = 0 if a[i] == b[j] else 1
                if d + cost < dist[i + 1][j + 1]:
                    dist[i + 1][j + 1] = d + cost
                    if cost == 0:
                        dq.appendleft((i + 1, j + 1))
                    else:
                        dq.append((i + 1, j + 1))
            if i < n and d + 1 < dist[i + 1][j]:
                dist[i + 1][j] = d + 1
                dq.append((i + 1, j))
            if j < m and d + 1 < dist[i][j + 1]:
                dist[i][j + 1] = d + 1
                dq.append((i, j + 1))
        return str(dist[n][m])

    s_shift = rand_str(1000, "abcde")
    s_mut = list(rand_str(1000, "abcdefghijklmnopqrstuvwxyz"))
    s_mut2 = s_mut[:]
    for pos in rng.sample(range(1000), 120):
        s_mut2[pos] = rng.choice("abcdefghijklmnopqrstuvwxyz")

    tests = [
        # Public samples (3)
        {"input": fmt("kitten", "sitting"), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt("sunday", "saturday"), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt("abc", "abc"), "hidden": False, "expected": "0", "checkBrute": True},
        # Edge / corner / shifts / disjoint (5)
        {"input": fmt("a", "a"), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt("a", "z"), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt("aaaaa", "bbbbb"), "hidden": True, "expected": "5", "checkBrute": True},
        {"input": fmt("a", "abcdefghij"), "hidden": True, "expected": "9", "checkBrute": True},
        # Cyclic shift of 100 chars: delete 1 + insert 1 = 2 (catches naive char-by-char diff!)
        {
            "input": fmt("abcdefghij" * 10, ("abcdefghij" * 10)[1:] + "a"),
            "hidden": True,
            "expected": "2",
            "checkBrute": True,
        },
        # Medium -> Large tests (8)
        {"input": fmt(rand_str(25, "abc"), rand_str(28, "abc")), "hidden": True, "checkBrute": True},
        {"input": fmt(rand_str(60, "abcd"), rand_str(55, "abcd")), "hidden": True, "checkBrute": True},
        {"input": fmt(rand_str(200, "ab"), rand_str(200, "ab")), "hidden": True},
        {"input": fmt(rand_str(400, "abcdefgh"), rand_str(350, "abcdefgh")), "hidden": True},
        {"input": fmt(s_shift, s_shift[1:] + s_shift[0]), "hidden": True, "expected": "2"},
        {"input": fmt("".join(s_mut), "".join(s_mut2)), "hidden": True},
        {"input": fmt(rand_str(1000, "abc"), rand_str(1000, "abc")), "hidden": True},
        {"input": fmt(rand_str(1000, "abcdefghijklmnopqrstuvwxyz"), rand_str(1000, "abcdefghijklmnopqrstuvwxyz")), "hidden": True},
    ]

    extra_stress = [
        fmt(rand_str(rng.randint(1, 15), "abcd"), rand_str(rng.randint(1, 15), "abcd"))
        for _ in range(10)
    ]

    statement = r"""
Cho hai xâu ký tự $A$ và $B$ chỉ gồm các chữ cái tiếng Anh in thường (`'a'` đến `'z'`).

Trong mỗi bước, bạn được thực hiện **một trong ba thao tác** sau lên xâu $A$:
- **Chèn** một ký tự bất kỳ vào một vị trí bất kỳ.
- **Xóa** một ký tự tại một vị trí bất kỳ.
- **Thay thế** một ký tự tại một vị trí bất kỳ bằng một ký tự khác.

Hãy tìm **số bước ít nhất** để biến đổi hoàn toàn xâu $A$ thành xâu $B$ (còn gọi là *khoảng cách chỉnh sửa* — Edit Distance / Levenshtein Distance).

### Dữ liệu vào
- Dòng 1 chứa xâu $A$ ($1 \le |A| \le 1\,000$).
- Dòng 2 chứa xâu $B$ ($1 \le |B| \le 1\,000$).

### Dữ liệu ra
- Một số nguyên duy nhất là số thao tác ít nhất cần thực hiện.
"""

    hints = r"""**Gợi ý 1 (Trạng thái DP):** Gọi $dp[i][j]$ là số thao tác ít nhất để biến đổi tiền tố độ dài $i$ của $A$ ($A[1..i]$) thành tiền tố độ dài $j$ của $B$ ($B[1..j]$). Cơ sở: $dp[i][0] = i$ (xóa $i$ ký tự) và $dp[0][j] = j$ (chèn $j$ ký tự).

**Gợi ý 2 (Công thức chuyển trạng thái):**
- Nếu $A[i] = B[j]$: không tốn thao tác ở ký tự cuối, nên $dp[i][j] = dp[i-1][j-1]$.
- Nếu $A[i] \ne B[j]$: lấy $1 + \min\bigl(dp[i-1][j],\; dp[i][j-1],\; dp[i-1][j-1]\bigr)$, tương ứng với xóa $A[i]$, chèn $B[j]$, hoặc thay thế $A[i]$ thành $B[j]$.

**Gợi ý 3 (Tối ưu bộ nhớ $O(|B|)$):** Vì hàng $i$ chỉ đọc hàng $i-1$, ta chỉ cần lưu hai mảng 1 chiều `prev` và `cur` độ dài $|B| + 1$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string a, b;
    if (!(cin >> a >> b)) return 0;

    int n = (int)a.size();
    int m = (int)b.size();
    if (n < m) {
        swap(a, b);
        swap(n, m);
    }

    vector<int> prev(m + 1), cur(m + 1);
    iota(prev.begin(), prev.end(), 0);

    for (int i = 1; i <= n; ++i) {
        cur[0] = i;
        char ca = a[i - 1];
        for (int j = 1; j <= m; ++j) {
            if (ca == b[j - 1]) {
                cur[j] = prev[j - 1];
            } else {
                cur[j] = 1 + min({prev[j], cur[j - 1], prev[j - 1]});
            }
        }
        swap(prev, cur);
    }

    cout << prev[m] << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    tokens = sys.stdin.read().split()
    if len(tokens) < 2:
        return
    a, b = tokens[0], tokens[1]
    if len(a) < len(b):
        a, b = b, a

    m = len(b)
    prev = list(range(m + 1))

    for i, ca in enumerate(a, 1):
        cur = [0] * (m + 1)
        cur[0] = i
        p_diag = prev[0]
        c_left = i
        for j in range(1, m + 1):
            p_up = prev[j]
            if ca == b[j - 1]:
                val = p_diag
            else:
                val = p_diag
                if p_up < val:
                    val = p_up
                if c_left < val:
                    val = c_left
                val += 1
            cur[j] = val
            p_diag = p_up
            c_left = val
        prev = cur

    print(prev[m])


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-edit-distance",
        "title": "Khoảng cách chỉnh sửa hai xâu (Edit Distance)",
        "shortDescription": "Tìm số thao tác chèn, xóa, thay thế ít nhất để biến đổi xâu A thành xâu B.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.dp_lis_lcs",
        "tags": ["quy hoạch động", "xâu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: DP 2 xâu (Levenshtein) tối ưu bộ nhớ 2 hàng $O(|A| \\cdot |B|)$.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-edit-distance", tests),
        "brute": brute_edit,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 8. cp08-stone-merging-interval-dp (hard, algo.dp_interval_bitmask)
# =============================================================================
def build_p08_stone_merging() -> Dict:
    rng = random.Random(808)

    def fmt(a: List[int]) -> str:
        return f"{len(a)}\n" + " ".join(map(str, a)) + "\n"

    def brute_stones(inp: str) -> str:
        data = list(map(int, inp.split()))
        n = data[0]
        a = data[1:]
        if n <= 1:
            return "0"
        if n <= 7:
            # Independent direct simulation of merging any adjacent pair
            memo: Dict[Tuple[int, ...], int] = {}

            def solve(arr: Tuple[int, ...]) -> int:
                if len(arr) == 1:
                    return 0
                if arr in memo:
                    return memo[arr]
                best = 10**30
                for i in range(len(arr) - 1):
                    merged = arr[i] + arr[i + 1]
                    nxt = arr[:i] + (merged,) + arr[i + 2 :]
                    cand = merged + solve(nxt)
                    if cand < best:
                        best = cand
                memo[arr] = best
                return best

            return str(solve(tuple(a)))
        # Independent plain O(N^3) Interval DP (verifies Knuth optimization!)
        pref = [0] * (n + 1)
        for i in range(n):
            pref[i + 1] = pref[i] + a[i]
        dp = [[0] * n for _ in range(n)]
        for length in range(2, n + 1):
            for l in range(n - length + 1):
                r = l + length - 1
                best = 10**30
                for k in range(l, r):
                    cand = dp[l][k] + dp[k + 1][r]
                    if cand < best:
                        best = cand
                dp[l][r] = best + pref[r + 1] - pref[l]
        return str(dp[0][n - 1])

    tests = [
        # Public samples (3)
        {
            "input": fmt([10, 20, 30, 40]),
            "hidden": False,
            "expected": "190",
            "checkBrute": True,
        },
        {
            # Anti-greedy: greedy merges (4,4)->8 giving 42; optimal merges (6,4) & (4,6) giving 40
            "input": fmt([6, 4, 4, 6]),
            "hidden": False,
            "expected": "40",
            "checkBrute": True,
        },
        {
            # Anti-Huffman: cannot merge non-adjacent 1s!
            "input": fmt([1, 100, 1]),
            "hidden": False,
            "expected": "203",
            "checkBrute": True,
        },
        # Edge / corner / anti-greedy (5)
        {
            "input": fmt([1000000]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt([500000, 1000000]),
            "hidden": True,
            "expected": "1500000",
            "checkBrute": True,
        },
        {
            "input": fmt([4, 2, 3, 4]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([10, 1, 1, 1, 1, 10]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([100, 1, 100, 1, 100, 1, 100]),
            "hidden": True,
            "checkBrute": True,
        },
        # Medium -> Large tests (8), keeping max N <= 180
        {"input": fmt([rng.randint(1, 1000) for _ in range(15)]), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(1, 10**6) for _ in range(35)]), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(1, 10**6) for _ in range(60)]), "hidden": True, "checkBrute": True},
        {"input": fmt([10**6] * 100), "hidden": True},
        {"input": fmt([rng.randint(1, 10**6) for _ in range(120)]), "hidden": True},
        {"input": fmt(list(range(1, 151))), "hidden": True},
        {"input": fmt([rng.randint(1, 10**6) for _ in range(180)]), "hidden": True},
        {"input": fmt([10**6 if i % 2 == 0 else 1 for i in range(180)]), "hidden": True},
    ]

    extra_stress = [
        fmt([rng.randint(1, 50) for _ in range(n)])
        for n in [1, 2, 3, 4, 5, 6, 7, 10, 18, 30]
    ]

    statement = r"""
Có $N$ đống đá xếp thành một hàng ngang, đống đá thứ $i$ có khối lượng nguyên dương $a_i$.

Trong mỗi thao tác, bạn được chọn **hai đống đá đứng kề nhau** và gộp chúng thành một đống đá duy nhất có khối lượng bằng tổng khối lượng của hai đống đó. Chi phí của thao tác này bằng đúng tổng khối lượng của hai đống vừa gộp.

Sau đúng $N - 1$ thao tác, toàn bộ sẽ gộp lại thành một đống duy nhất. Hãy tìm **tổng chi phí nhỏ nhất** để hoàn thành việc gộp đá. (Nếu $N = 1$, chi phí là $0$).

### Dữ liệu vào
- Dòng 1 chứa số nguyên $N$ ($1 \le N \le 250$).
- Dòng 2 chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^6$).

### Dữ liệu ra
- Một số nguyên duy nhất là tổng chi phí nhỏ nhất.
"""

    hints = """**Gợi ý 1 (Tư duy ngược từ lần gộp cuối):** Dù gộp theo thứ tự nào, ở bước cuối cùng của đoạn $[l, r]$, ta luôn gộp hai đống đại diện cho hai đoạn con kề nhau $[l, k]$ và $[k+1, r]$ với chi phí bước cuối luôn cố định bằng tổng khối lượng $S(l, r) = \\sum_{i=l}^{r} a_i$.

**Gợi ý 2 (Công thức Interval DP $O(N^3)$):** Gọi $dp[l][r]$ là chi phí nhỏ nhất để gộp đoạn $[l, r]$ thành $1$ đống, với $dp[i][i] = 0$. Tính $S(l, r)$ trong $O(1)$ nhờ mảng tổng tiền tố `pref`:
$$dp[l][r] = \\min_{l \\le k < r} \\bigl(dp[l][k] + dp[k+1][r]\\bigr) + S(l, r)$$
Duyệt theo **độ dài đoạn** tăng dần từ $2$ đến $N$.

**Gợi ý 3 (Tối ưu Knuth $O(N^2)$):** Gọi `opt[l][r]` là điểm chia $k$ tối ưu của đoạn $[l, r]$. Vì hàm chi phí $S(l, r)$ thỏa mãn bất đẳng thức tứ giác, ta có tính đơn điệu `opt[l][r-1] <= opt[l][r] <= opt[l+1][r]`, giúp giảm tổng thời gian từ $O(N^3)$ xuống $O(N^2)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> pref(n + 1, 0);
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        pref[i + 1] = pref[i] + x;
    }

    const long long INF = (1LL << 62);
    vector<vector<long long>> dp(n, vector<long long>(n, 0));
    vector<vector<int>> opt(n, vector<int>(n, 0));
    for (int i = 0; i < n; ++i) opt[i][i] = i;

    for (int len = 2; len <= n; ++len) {
        for (int l = 0; l + len - 1 < n; ++l) {
            int r = l + len - 1;
            long long seg_sum = pref[r + 1] - pref[l];
            int lo = opt[l][r - 1];
            int hi = min(opt[l + 1][r], r - 1);
            long long best = INF;
            int best_k = lo;
            for (int k = lo; k <= hi; ++k) {
                long long cand = dp[l][k] + dp[k + 1][r] + seg_sum;
                if (cand < best) {
                    best = cand;
                    best_k = k;
                }
            }
            dp[l][r] = best;
            opt[l][r] = best_k;
        }
    }

    cout << dp[0][n - 1] << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n = data[0]
    a = data[1:]
    if n <= 1:
        print(0)
        return

    pref = [0] * (n + 1)
    for i in range(n):
        pref[i + 1] = pref[i] + a[i]

    INF = 10**30
    dp = [[0] * n for _ in range(n)]
    opt = [[0] * n for _ in range(n)]
    for i in range(n):
        opt[i][i] = i

    for length in range(2, n + 1):
        for l in range(n - length + 1):
            r = l + length - 1
            seg_sum = pref[r + 1] - pref[l]
            lo = opt[l][r - 1]
            hi = opt[l + 1][r]
            if hi > r - 1:
                hi = r - 1
            best = INF
            best_k = lo
            dp_l = dp[l]
            for k in range(lo, hi + 1):
                cand = dp_l[k] + dp[k + 1][r] + seg_sum
                if cand < best:
                    best = cand
                    best_k = k
            dp_l[r] = best
            opt[l][r] = best_k

    print(dp[0][n - 1])


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-stone-merging-interval-dp",
        "title": "Gộp đống đá (Interval DP)",
        "shortDescription": "Tìm tổng chi phí nhỏ nhất để gộp N đống đá kề nhau thành một đống duy nhất.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.dp_interval_bitmask",
        "tags": ["quy hoạch động", "dp đoạn", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Interval DP $O(N^3)$, tối ưu Knuth xuống $O(N^2)$.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-stone-merging-interval-dp", tests),
        "brute": brute_stones,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 9. cp08-tsp-bitmask-dp (hard, algo.dp_interval_bitmask)
# =============================================================================
def build_p09_tsp_bitmask() -> Dict:
    rng = random.Random(809)

    def fmt(mat: List[List[int]]) -> str:
        lines = [str(len(mat))]
        lines.extend(" ".join(map(str, row)) for row in mat)
        return "\n".join(lines) + "\n"

    def rand_mat(n: int, lo: int, hi: int) -> List[List[int]]:
        mat = [[0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i != j:
                    mat[i][j] = rng.randint(lo, hi)
        return mat

    def hidden_cycle_mat(n: int, max_noise: int) -> List[List[int]]:
        mat = rand_mat(n, max_noise // 2, max_noise)
        perm = list(range(1, n))
        rng.shuffle(perm)
        cycle = [0] + perm + [0]
        for i in range(n):
            mat[cycle[i]][cycle[i + 1]] = rng.randint(1, 50)
        return mat

    def brute_tsp(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        mat = [tokens[1 + i * n : 1 + (i + 1) * n] for i in range(n)]
        best = 10**30
        for perm in itertools.permutations(range(1, n)):
            cost = mat[0][perm[0]]
            for i in range(len(perm) - 1):
                cost += mat[perm[i]][perm[i + 1]]
            cost += mat[perm[-1]][0]
            if cost < best:
                best = cost
        return str(best)

    tests = [
        # Public samples (3)
        {
            "input": fmt([
                [0, 10, 15, 20],
                [5, 0, 9, 10],
                [6, 13, 0, 12],
                [8, 8, 9, 0],
            ]),
            "hidden": False,
            "expected": "35",
            "checkBrute": True,
        },
        {
            "input": fmt([
                [0, 5, 100],
                [100, 0, 5],
                [5, 100, 0],
            ]),
            "hidden": False,
            "expected": "15",
            "checkBrute": True,
        },
        {
            # Anti-nearest-neighbor greedy: 0->1 (1) forces huge edge 1->2 (1000) or 2->0 (1000)
            "input": fmt([
                [0, 1, 5, 100],
                [100, 0, 1000, 2],
                [100, 2, 0, 1000],
                [2, 100, 100, 0],
            ]),
            "hidden": False,
            "expected": "11",
            "checkBrute": True,
        },
        # Edge / corner / asymmetric / zero-cost / large-cost (5)
        {
            "input": fmt([[0, 10**7], [3, 0]]),
            "hidden": True,
            "expected": "10000003",
            "checkBrute": True,
        },
        {
            "input": fmt([[0] * 5 for _ in range(5)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Reversed directed cycle is cheap, forward is 10^7
            "input": fmt([
                [0, 10**7, 10**7, 1],
                [1, 0, 10**7, 10**7],
                [10**7, 1, 0, 10**7],
                [10**7, 10**7, 1, 0],
            ]),
            "hidden": True,
            "expected": "4",
            "checkBrute": True,
        },
        {
            "input": fmt(rand_mat(6, 0, 10**7)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt(hidden_cycle_mat(7, 10**7)),
            "hidden": True,
            "checkBrute": True,
        },
        # Medium -> Large tests (8), keeping max N <= 14 for fast Python 3 execution
        {"input": fmt(rand_mat(8, 1, 1000)), "hidden": True, "checkBrute": True},
        {"input": fmt(rand_mat(9, 0, 10**7)), "hidden": True, "checkBrute": True},
        {"input": fmt(rand_mat(10, 1, 10**6)), "hidden": True},
        {"input": fmt(hidden_cycle_mat(11, 10**7)), "hidden": True},
        {"input": fmt(rand_mat(12, 0, 10**7)), "hidden": True},
        {"input": fmt(rand_mat(13, 1, 10**7)), "hidden": True},
        {"input": fmt(hidden_cycle_mat(14, 10**7)), "hidden": True},
        {"input": fmt(rand_mat(14, 0, 10**7)), "hidden": True},
    ]

    extra_stress = [
        fmt(rand_mat(n, 0, 500)) for n in [2, 3, 4, 5, 6, 7, 7, 8]
    ]

    statement = r"""
Cho đồ thị có hướng đầy đủ gồm $N$ thành phố đánh số từ $1$ đến $N$ và ma trận khoảng cách nguyên không âm $C$ kích thước $N \times N$. Trong đó $C[i][j]$ là chi phí đi trực tiếp từ thành phố $i$ đến thành phố $j$ ($C[i][i] = 0$; lưu ý $C[i][j]$ không nhất thiết bằng $C[j][i]$ và không nhất thiết thỏa mãn bất đẳng thức tam giác).

Xuất phát từ thành phố $1$, một người du lịch muốn đi qua **mỗi thành phố còn lại đúng một lần** rồi quay trở về thành phố $1$.

Hãy tìm **tổng chi phí nhỏ nhất** của một hành trình hợp lệ (bài toán *Traveling Salesman Problem — TSP*).

### Dữ liệu vào
- Dòng 1 chứa số nguyên $N$ ($2 \le N \le 15$).
- $N$ dòng tiếp theo, mỗi dòng chứa $N$ số nguyên $C[i][j]$ ($0 \le C[i][j] \le 10^7$, $C[i][i] = 0$).

### Dữ liệu ra
- Một số nguyên duy nhất là tổng chi phí nhỏ nhất của chu trình.
"""

    hints = r"""**Gợi ý 1 (Mã hóa tập đỉnh bằng Bitmask):** Vì $N \le 15$, ta dùng một số nguyên `mask` gồm $N$ bit (hoặc tối ưu hơn: chỉ $N - 1$ bit cho các thành phố $2 \dots N$) để biểu diễn tập các thành phố đã đi qua.

**Gợi ý 2 (Trạng thái & Chuyển trạng thái):** Gọi $dp[\text{mask}][u]$ là chi phí nhỏ nhất xuất phát từ thành phố $1$, đã thăm đúng tập thành phố trong `mask` và đang dừng ở thành phố $u$. Từ trạng thái `(mask, u)`, thử đi tới mọi thành phố $v$ chưa thuộc `mask`:
$$dp[\text{mask} \mid (1 \ll v)][v] = \min\bigl(dp[\text{mask} \mid (1 \ll v)][v],\; dp[\text{mask}][u] + C[u][v]\bigr)$$

**Gợi ý 3 (Cố định đỉnh đầu & Kết quả):** Cố định xuất phát tại đỉnh $1$ giúp chỉ cần $2^{N-1}$ mặt nạ bit. Khi đã thăm đủ tất cả các thành phố (`full`), kết quả là $\min_u (dp[\text{full}][u] + C[u][1])$. Độ phức tạp $O(N^2 \cdot 2^{N-1})$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<vector<long long>> c(n, vector<long long>(n));
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < n; ++j)
            cin >> c[i][j];

    int m = n - 1;
    int full = (1 << m) - 1;
    const long long INF = (1LL << 60);

    vector<vector<long long>> dp(1 << m, vector<long long>(m, INF));
    for (int u = 0; u < m; ++u) {
        dp[1 << u][u] = c[0][u + 1];
    }

    for (int mask = 1; mask <= full; ++mask) {
        int unvis = full ^ mask;
        if (unvis == 0) continue;
        for (int u = 0; u < m; ++u) {
            if (!((mask >> u) & 1)) continue;
            long long cur = dp[mask][u];
            if (cur >= INF) continue;
            int rem = unvis;
            while (rem) {
                int lb = rem & -rem;
                int v = __builtin_ctz(lb);
                long long cand = cur + c[u + 1][v + 1];
                if (cand < dp[mask | lb][v]) {
                    dp[mask | lb][v] = cand;
                }
                rem ^= lb;
            }
        }
    }

    long long ans = INF;
    for (int u = 0; u < m; ++u) {
        ans = min(ans, dp[full][u] + c[u + 1][0]);
    }
    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n = data[0]
    c = [data[1 + i * n : 1 + (i + 1) * n] for i in range(n)]

    m = n - 1
    full = (1 << m) - 1
    INF = 10**30

    dp = [[INF] * m for _ in range(1 << m)]
    for u in range(m):
        dp[1 << u][u] = c[0][u + 1]

    # Precompute bit index for single-bit masks
    bit_idx = {1 << i: i for i in range(m)}

    for mask in range(1, full):
        dp_mask = dp[mask]
        unvis = full ^ mask
        rem_u = mask
        while rem_u:
            lb_u = rem_u & -rem_u
            rem_u ^= lb_u
            u = bit_idx[lb_u]
            cur = dp_mask[u]
            if cur >= INF:
                continue
            row_u = c[u + 1]
            rem_v = unvis
            while rem_v:
                lb_v = rem_v & -rem_v
                rem_v ^= lb_v
                v = bit_idx[lb_v]
                nxt_row = dp[mask | lb_v]
                cand = cur + row_u[v + 1]
                if cand < nxt_row[v]:
                    nxt_row[v] = cand

    dp_full = dp[full]
    ans = INF
    for u in range(m):
        cand = dp_full[u] + c[u + 1][0]
        if cand < ans:
            ans = cand
    print(ans)


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-tsp-bitmask-dp",
        "title": "Hành trình người du lịch (Bitmask TSP)",
        "shortDescription": "Tìm chu trình Hamilton ngắn nhất xuất phát và kết thúc tại thành phố 1 bằng Bitmask DP.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.dp_interval_bitmask",
        "tags": ["quy hoạch động", "bitmask", "đồ thị", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Bitmask DP (Held-Karp) $O(N^2 \\cdot 2^{N-1})$.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-tsp-bitmask-dp", tests),
        "brute": brute_tsp,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 10. cp08-tree-max-independent-set (hard, algo.dp_interval_bitmask)
# =============================================================================
def build_p10_tree_mis() -> Dict:
    rng = random.Random(810)

    def fmt(w: List[int], edges: List[Tuple[int, int]]) -> str:
        lines = [str(len(w)), " ".join(map(str, w))]
        lines.extend(f"{u} {v}" for u, v in edges)
        return "\n".join(lines) + "\n"

    def gen_random_tree(n: int) -> List[Tuple[int, int]]:
        perm = list(range(1, n + 1))
        rng.shuffle(perm)
        edges = []
        for i in range(1, n):
            p = rng.randint(0, i - 1)
            u, v = perm[p], perm[i]
            if rng.random() < 0.5:
                u, v = v, u
            edges.append((u, v))
        rng.shuffle(edges)
        return edges

    def gen_path_tree(n: int) -> List[Tuple[int, int]]:
        return [(i, i + 1) for i in range(1, n)]

    def gen_star_tree(n: int, center: int = 1) -> List[Tuple[int, int]]:
        return [(center, i) for i in range(1, n + 1) if i != center]

    def gen_binary_tree(n: int) -> List[Tuple[int, int]]:
        return [(i // 2, i) for i in range(2, n + 1)]

    def brute_tree_mis(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        w = tokens[1 : n + 1]
        adj_mask = [0] * n
        idx = n + 1
        for _ in range(n - 1):
            u = tokens[idx] - 1
            v = tokens[idx + 1] - 1
            idx += 2
            adj_mask[u] |= 1 << v
            adj_mask[v] |= 1 << u

        best = 0
        for mask in range(1 << n):
            ok = True
            total = 0
            for i in range(n):
                if (mask >> i) & 1:
                    if mask & adj_mask[i]:
                        ok = False
                        break
                    total += w[i]
            if ok and total > best:
                best = total
        return str(best)

    tests = [
        # Public samples (3)
        {
            # Anti-bipartite 2-coloring trap: path 1-2-3-4 with [100, 1, 1, 100] -> pick {1, 4} = 200
            "input": fmt([100, 1, 1, 100], [(1, 2), (2, 3), (3, 4)]),
            "hidden": False,
            "expected": "200",
            "checkBrute": True,
        },
        {
            # Star: leaves beat center (3+4+5 = 12 > 10)
            "input": fmt([10, 3, 4, 5], [(1, 2), (1, 3), (1, 4)]),
            "hidden": False,
            "expected": "12",
            "checkBrute": True,
        },
        {
            # Star: center beats leaves (15 > 3+4+5)
            "input": fmt([15, 3, 4, 5], [(1, 2), (1, 3), (1, 4)]),
            "hidden": False,
            "expected": "15",
            "checkBrute": True,
        },
        # Edge / corner / anti-bipartite / 64-bit overflow (5)
        {
            "input": fmt([10**9], []),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt([777, 999], [(1, 2)]),
            "hidden": True,
            "expected": "999",
            "checkBrute": True,
        },
        {
            # Small random tree verified against bitmask brute
            "input": fmt([rng.randint(1, 100) for _ in range(14)], gen_random_tree(14)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Anti-bipartite on multi-branch tree
            "input": fmt(
                [1, 100, 1, 100, 100, 1, 1, 100],
                [(1, 2), (1, 3), (3, 4), (3, 5), (2, 6), (6, 7), (7, 8)],
            ),
            "hidden": True,
            "expected": "400",
            "checkBrute": True,
        },
        {
            # Star of 1000 leaves with weight 10^9 -> 999 * 10^9 (overflows 32-bit int!)
            "input": fmt([10**9] * 1000, gen_star_tree(1000, center=500)),
            "hidden": True,
            "expected": str(999 * 10**9),
        },
        # Medium -> Large tests (8), keeping every test < 150 KB
        {"input": fmt([rng.randint(1, 500) for _ in range(16)], gen_random_tree(16)), "hidden": True, "checkBrute": True},
        {"input": fmt([rng.randint(1, 10**6) for _ in range(500)], gen_random_tree(500)), "hidden": True},
        {"input": fmt([rng.randint(1, 10**9) for _ in range(2500)], gen_binary_tree(2500)), "hidden": True},
        # Deep path of 10,000 nodes (small weights -> ~130 KB) — defeats naive recursive Python!
        {"input": fmt([rng.randint(1, 999) for _ in range(10000)], gen_path_tree(10000)), "hidden": True},
        # Deep path of 7,000 nodes with 10^9 weights (~135 KB) — recursion + 64-bit overflow!
        {"input": fmt([rng.randint(10**8, 10**9) for _ in range(7000)], gen_path_tree(7000)), "hidden": True},
        # Star of 10,000 nodes (~130 KB)
        {"input": fmt([rng.randint(1, 999) for _ in range(10000)], gen_star_tree(10000, center=1)), "hidden": True},
        # Random tree of 7,000 nodes with 10^9 weights (~135 KB)
        {"input": fmt([rng.randint(1, 10**9) for _ in range(7000)], gen_random_tree(7000)), "hidden": True},
        # Random tree of 10,000 nodes (~132 KB)
        {"input": fmt([rng.randint(1, 999) for _ in range(10000)], gen_random_tree(10000)), "hidden": True},
    ]

    extra_stress = [
        fmt([rng.randint(1, 100) for _ in range(n)], gen_random_tree(n))
        for n in [1, 2, 3, 4, 5, 7, 9, 11, 13, 15]
    ]

    statement = r"""
Cho một cây gồm $N$ đỉnh đánh số từ $1$ đến $N$ và $N - 1$ cạnh vô hướng. Đỉnh thứ $i$ có trọng số nguyên dương $w_i$.

Một **tập độc lập** (*Independent Set*) là một tập con các đỉnh sao cho không có hai đỉnh nào trong tập được nối trực tiếp với nhau bởi một cạnh của cây.

Hãy tìm **tổng trọng số lớn nhất** có thể của một tập độc lập trên cây đã cho.

### Dữ liệu vào
- Dòng 1 chứa số nguyên $N$ ($1 \le N \le 25\,000$).
- Dòng 2 chứa $N$ số nguyên $w_1, w_2, \dots, w_N$ ($1 \le w_i \le 10^9$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) mô tả một cạnh nối giữa đỉnh $u$ và đỉnh $v$.

### Dữ liệu ra
- Một số nguyên duy nhất là tổng trọng số lớn nhất tìm được.

### Lưu ý
- Cây có thể có dạng đường thẳng rất sâu (chiều sâu lên đến $N$). Khi cài đặt bằng Python, nên duyệt cây **không đệ quy** (BFS/DFS lặp để lấy thứ tự topo ngược từ lá lên gốc) nhằm tránh lỗi tràn ngăn xếp (`RecursionError`).
"""

    hints = r"""**Gợi ý 1 (Sai lầm tô 2 màu):** Cây là đồ thị hai phía nhưng lấy tổng lớn hơn giữa hai màu không phải lúc nào cũng tối ưu (ví dụ đường thẳng 4 đỉnh có trọng số `100, 1, 1, 100`: tối ưu là chọn đỉnh 1 và 4 với tổng `200`, khác màu nhau!).

**Gợi ý 2 (Trạng thái Tree DP):** Chọn đỉnh $1$ làm gốc. Với mỗi đỉnh $u$, tính hai giá trị cho cây con gốc $u$:
- $dp[u][0]$: tổng lớn nhất khi **không chọn** $u$ $\implies dp[u][0] = \sum_{v \in \text{con}(u)} \max(dp[v][0], dp[v][1])$.
- $dp[u][1]$: tổng lớn nhất khi **chọn** $u$ $\implies dp[u][1] = w_u + \sum_{v \in \text{con}(u)} dp[v][0]$.

**Gợi ý 3 (Khử đệ quy bằng thứ tự BFS ngược):** Duyệt BFS từ gốc $1$ để lưu mảng `parent` và danh sách thứ tự thăm `order`. Sau đó duyệt ngược `order` từ cuối về đầu: mọi con $u$ luôn được tính xong trước khi cộng dồn vào cha `parent[u]`. Độ phức tạp $O(N)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> w(n + 1, 0);
    for (int i = 1; i <= n; ++i) cin >> w[i];

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> parent(n + 1, 0);
    vector<int> order;
    order.reserve(n);
    order.push_back(1);
    for (int idx = 0; idx < (int)order.size(); ++idx) {
        int u = order[idx];
        for (int v : adj[u]) {
            if (v != parent[u]) {
                parent[v] = u;
                order.push_back(v);
            }
        }
    }

    vector<long long> dp0(n + 1, 0), dp1(n + 1, 0);
    for (int i = 1; i <= n; ++i) dp1[i] = w[i];

    for (int idx = n - 1; idx >= 1; --idx) {
        int u = order[idx];
        int p = parent[u];
        dp0[p] += max(dp0[u], dp1[u]);
        dp1[p] += dp0[u];
    }

    cout << max(dp0[1], dp1[1]) << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = list(map(int, sys.stdin.read().split()))
    if not data:
        return
    n = data[0]
    w = data[1 : n + 1]

    adj = [[] for _ in range(n + 1)]
    idx = n + 1
    for _ in range(n - 1):
        u = data[idx]
        v = data[idx + 1]
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [0] * (n + 1)
    order = [1]
    for u in order:
        p = parent[u]
        for v in adj[u]:
            if v != p:
                parent[v] = u
                order.append(v)

    dp0 = [0] * (n + 1)
    dp1 = [0] + w

    for u in reversed(order):
        p = parent[u]
        if p:
            best_u = dp1[u] if dp1[u] > dp0[u] else dp0[u]
            dp0[p] += best_u
            dp1[p] += dp0[u]

    print(dp1[1] if dp1[1] > dp0[1] else dp0[1])


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp08-tree-max-independent-set",
        "title": "Tập độc lập trọng số lớn nhất trên cây (Tree DP)",
        "shortDescription": "Chọn tập đỉnh không có 2 đỉnh kề nhau trên cây sao cho tổng trọng số lớn nhất.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.dp_interval_bitmask",
        "tags": ["quy hoạch động", "cây", "đồ thị", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_PREFIX + "Kỹ thuật: Tree DP $O(N)$ không đệ quy theo thứ tự BFS ngược.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": make_tests_check_sizes("cp08-tree-max-independent-set", tests),
        "brute": brute_tree_mis,
        "extraStressInputs": extra_stress,
    }


def main() -> None:
    problems = [
        build_p01_frog_jump(),
        build_p02_house_robber(),
        build_p03_grid_max_ways(),
        build_p04_knapsack_01(),
        build_p05_coin_change(),
        build_p06_lis_nlogn(),
        build_p07_edit_distance(),
        build_p08_stone_merging(),
        build_p09_tsp_bitmask(),
        build_p10_tree_mis(),
    ]

    build_and_verify_pack(
        pack_id="08-dynamic-programming",
        title="Tầng 3: Quy hoạch động toàn diện (DP)",
        tier="Tầng 3 — Quy hoạch động & Đồ thị",
        description=(
            "10 bài Quy hoạch động chuẩn thi HSG: DP 1D, House Robber, Grid DP, "
            "Ba lô 0/1, Đổi tiền, LIS O(N log N), Edit Distance, Interval DP, Bitmask TSP và Tree DP."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
