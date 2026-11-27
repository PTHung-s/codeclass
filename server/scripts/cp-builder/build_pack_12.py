"""
Builder & automated verifier for CodeClass CP Pack 12:
Tầng 2–3: Tổ hợp Modulo, Bao hàm–Loại trừ & Nhân ma trận

Generates and verifies 10 original Vietnamese competitive programming problems
(3 easy, 4 medium, 3 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import itertools
import math
import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Tổ hợp & Ma trận\n"
MOD = 1_000_000_007
SAFE_MAX_BYTES = 148_000


def fmt_pairs_queries(pairs: List[Tuple[int, int]]) -> str:
    lines = [str(len(pairs))]
    lines.extend(f"{a} {b}" for a, b in pairs)
    return "\n".join(lines)


def fmt_triples_queries(triples: List[Tuple[int, int, int]]) -> str:
    lines = [str(len(triples))]
    lines.extend(f"{a} {b} {c}" for a, b, c in triples)
    return "\n".join(lines)


def fmt_int_queries(nums: List[int]) -> str:
    lines = [str(len(nums))]
    lines.extend(str(x) for x in nums)
    return "\n".join(lines)


# ============================================================================
# 1. cp12-ncr-mod-queries
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    q = toks[0]
    out = []
    idx = 1
    for _ in range(q):
        n, k = toks[idx], toks[idx + 1]
        idx += 2
        if k < 0 or k > n:
            out.append("0")
        else:
            out.append(str(math.comb(n, k) % MOD))
    return "\n".join(out)


def build_p01() -> dict:
    rng = random.Random(1201)

    tests = [
        # 3 public samples
        {
            "input": fmt_pairs_queries([(5, 2), (0, 0), (3, 5), (10, 5)]),
            "hidden": False,
            "expected": "10\n1\n0\n252",
            "checkBrute": True,
        },
        {
            "input": fmt_pairs_queries([(6, 0), (6, 6), (100, 3)]),
            "hidden": False,
            "expected": "1\n1\n161700",
            "checkBrute": True,
        },
        {
            "input": fmt_pairs_queries([(1, 1), (2, 1), (20, 10)]),
            "hidden": False,
            "expected": "1\n2\n184756",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_pairs_queries([(0, 0)]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_pairs_queries([(0, 1), (0, 200_000), (1, 0), (1, 2)]),
            "hidden": True,
            "expected": "0\n0\n1\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_pairs_queries([(200_000, 0), (200_000, 200_000), (200_000, 1), (200_000, 199_999)]),
            "hidden": True,
            "expected": "1\n1\n200000\n200000",
            "checkBrute": True,
        },
        {
            "input": fmt_pairs_queries([(200_000, 100_000), (199_999, 200_000)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_pairs_queries([(i, j) for i in range(12) for j in range(13)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    tests.append({
        "input": fmt_pairs_queries([(rng.randint(0, 500), rng.randint(0, 500)) for _ in range(500)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_pairs_queries([(rng.randint(100, 2000), rng.randint(0, 2200)) for _ in range(2000)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_pairs_queries([(rng.randint(1000, 50_000), rng.randint(0, 50_000)) for _ in range(5000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_pairs_queries([(200_000, rng.randint(0, 200_000)) for _ in range(9000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_pairs_queries([(rng.randint(100_000, 200_000), rng.randint(50_000, 200_000)) for _ in range(9500)]),
        "hidden": True,
    })
    # Test 14: max Q = 25,000 with compact (n, k) <= 99 (fits cleanly under 148 KB)
    tests.append({
        "input": fmt_pairs_queries([(rng.randint(0, 99), rng.randint(0, 99)) for _ in range(25_000)]),
        "hidden": True,
    })
    # Test 15: boundary mix around n == k and k == n + 1
    q15 = []
    for _ in range(4500):
        n = rng.randint(10_000, 200_000)
        k = rng.choice([0, 1, n - 1, n, n + 1]) if n < 200_000 else n
        q15.append((n, min(k, 200_000)))
    tests.append({"input": fmt_pairs_queries(q15), "hidden": True})
    # Test 16: large n = 150,000..200,000 with Q = 10,000
    q16 = [(rng.randint(150_000, 200_000), rng.randint(10_000, 150_000)) for _ in range(10_000)]
    tests.append({"input": fmt_pairs_queries(q16), "hidden": True})

    extra_stress = []
    for _ in range(30):
        q = rng.randint(1, 25)
        extra_stress.append(fmt_pairs_queries([(rng.randint(0, 40), rng.randint(0, 45)) for _ in range(q)]))

    statement = r"""Trong các bài toán đếm tổ hợp thi đấu lập trình, ta thường xuyên cần tính giá trị hệ số nhị thức $\binom{n}{k}$ (số cách chọn $k$ phần tử không phân biệt thứ tự từ $n$ phần tử) theo modulo $10^9 + 7$.

Cho $Q$ truy vấn, mỗi truy vấn gồm hai số nguyên không âm $n, k$. Với mỗi truy vấn, hãy tính $\binom{n}{k} \bmod (10^9 + 7)$. Quy ước $\binom{n}{k} = 0$ nếu $k > n$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $Q$ ($1 \le Q \le 25\,000$).
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $n, k$ ($0 \le n, k \le 2 \cdot 10^5$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra một số nguyên là giá trị $\binom{n}{k} \bmod (10^9 + 7)$ của truy vấn thứ $i$.

### Ràng buộc
- $1 \le Q \le 25\,000$
- $0 \le n, k \le 2 \cdot 10^5$

### Subtasks
- **Subtask 1 (30% số điểm):** $Q \le 500$, $n, k \le 1000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với $(n, k) = (5, 2)$: $\binom{5}{2} = \frac{5 \times 4}{2} = 10$.
- Với $(n, k) = (0, 0)$: có đúng $1$ cách chọn tập rỗng từ $0$ phần tử, nên $\binom{0}{0} = 1$.
- Với $(n, k) = (3, 5)$: vì $k > n$ nên kết quả là $0$."""

    hints = r"""**Gợi ý 1 (Công thức tổ hợp):**
Theo định nghĩa, với $0 \le k \le n$:
$$\binom{n}{k} = \frac{n!}{k!\,(n-k)!}$$
Tuy nhiên, phép chia không thực hiện trực tiếp được trong số học modulo, ta phải nhân với **nghịch đảo modulo**.

**Gợi ý 2 (Định lý nhỏ Fermat):**
Vì $P = 10^9 + 7$ là số nguyên tố, với mọi số nguyên $a$ không chia hết cho $P$, ta có:
$$a^{-1} \equiv a^{P - 2} \pmod P$$
Ta có thể tính $a^{P - 2} \bmod P$ bằng lũy thừa nhị phân trong $O(\log P)$.

**Gợi ý 3 (Tiền xử lý tuyến tính $O(M)$):**
Đặt $M = 2 \cdot 10^5$. Tiền xử lý mảng giai thừa $\text{fact}[i] = i! \bmod P$ từ $0$ đến $M$.
Sau đó tính $\text{invFact}[M] = (\text{fact}[M])^{P-2} \bmod P$ một lần duy nhất, rồi suy ngược về $0$ bằng:
$$\text{invFact}[i - 1] = \text{invFact}[i] \cdot i \bmod P$$
Khi đó mỗi truy vấn trả lời trong $O(1)$: $\text{fact}[n] \cdot \text{invFact}[k] \bmod P \cdot \text{invFact}[n-k] \bmod P$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;
static const int MAXN = 200000;

long long modPow(long long base, long long exp) {
    long long res = 1;
    base %= MOD;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % MOD;
        base = (base * base) % MOD;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int q;
    if (!(cin >> q)) return 0;

    vector<long long> fact(MAXN + 1), invFact(MAXN + 1);
    fact[0] = 1;
    for (int i = 1; i <= MAXN; ++i) {
        fact[i] = fact[i - 1] * i % MOD;
    }
    invFact[MAXN] = modPow(fact[MAXN], MOD - 2);
    for (int i = MAXN; i >= 1; --i) {
        invFact[i - 1] = invFact[i] * i % MOD;
    }

    while (q--) {
        int n, k;
        cin >> n >> k;
        if (k < 0 || k > n) {
            cout << 0 << '\n';
        } else {
            long long ans = fact[n] * invFact[k] % MOD * invFact[n - k] % MOD;
            cout << ans << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    q = int(data[0])
    queries = []
    max_n = 0
    idx = 1
    for _ in range(q):
        n = int(data[idx])
        k = int(data[idx + 1])
        idx += 2
        queries.append((n, k))
        if n > max_n:
            max_n = n

    fact = [1] * (max_n + 1)
    for i in range(1, max_n + 1):
        fact[i] = fact[i - 1] * i % MOD

    inv_fact = [1] * (max_n + 1)
    inv_fact[max_n] = pow(fact[max_n], MOD - 2, MOD)
    for i in range(max_n, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    out = []
    for n, k in queries:
        if k < 0 or k > n:
            out.append("0")
        else:
            out.append(str(fact[n] * inv_fact[k] % MOD * inv_fact[n - k] % MOD))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-ncr-mod-queries",
        "title": "Tổ hợp Modulo với nhiều truy vấn",
        "shortDescription": "Tiền xử lý giai thừa và nghịch đảo modulo để trả lời nhiều truy vấn C(n, k) mod (10^9 + 7).",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.combinatorics_mod",
        "tags": ["tổ hợp", "modulo", "số học", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(M + Q) với M = max(n).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp12-stars-and-bars-lower
# ============================================================================

def brute_p02(inp: str) -> str:
    """Independent DP oracle for small (K, N, L) test cases."""
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out = []
    for _ in range(t):
        k, n, l = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        rem = n - k * l
        if rem < 0:
            out.append("0")
            continue
        dp = [0] * (rem + 1)
        dp[0] = 1
        for _ in range(k):
            ndp = [0] * (rem + 1)
            pref = 0
            for s in range(rem + 1):
                pref = (pref + dp[s]) % MOD
                ndp[s] = pref
            dp = ndp
        out.append(str(dp[rem]))
    return "\n".join(out)


def build_p02() -> dict:
    rng = random.Random(1202)

    tests = [
        # 3 public samples
        {
            "input": fmt_triples_queries([(3, 7, 1), (3, 5, 2), (4, 8, 2)]),
            "hidden": False,
            "expected": "15\n0\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_triples_queries([(1, 10, 0), (5, 0, 0), (2, 10, 3)]),
            "hidden": False,
            "expected": "1\n1\n5",
            "checkBrute": True,
        },
        {
            "input": fmt_triples_queries([(3, 10, 0), (4, 10, 1)]),
            "hidden": False,
            "expected": "66\n84",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_triples_queries([(1, 0, 0), (1, 0, 1), (1, 100_000, 10_000)]),
            "hidden": True,
            "expected": "1\n0\n1",
        },
        {
            "input": fmt_triples_queries([(100_000, 100_000, 1), (100_000, 99_999, 1), (100_000, 0, 0)]),
            "hidden": True,
            "expected": "1\n0\n1",
        },
        {
            "input": fmt_triples_queries([(100_000, 100_000, 10_000), (100_000, 100_000, 0)]),
            "hidden": True,
        },
        {
            "input": fmt_triples_queries([(10, 35, 3), (10, 29, 3), (10, 30, 3), (12, 24, 2)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_triples_queries([(i, j, l) for i in range(1, 5) for j in range(0, 9) for l in range(0, 3)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (max T = 5000 fits easily in ~105 KB)
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 30), rng.randint(0, 60), rng.randint(0, 5)) for _ in range(100)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 50), rng.randint(0, 100), rng.randint(0, 4)) for _ in range(300)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 1000), rng.randint(0, 5000), rng.randint(0, 10)) for _ in range(1500)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 100_000), rng.randint(0, 100_000), 0) for _ in range(3000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 500), rng.randint(0, 100_000), rng.randint(0, 500)) for _ in range(4000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 100), rng.randint(0, 100_000), rng.randint(0, 2000)) for _ in range(5000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(50_000, 100_000), rng.randint(50_000, 100_000), rng.randint(0, 2)) for _ in range(5000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_triples_queries([(rng.randint(1, 10_000), 100_000, rng.randint(0, 100)) for _ in range(5000)]),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        t = rng.randint(1, 15)
        extra_stress.append(fmt_triples_queries([(rng.randint(1, 12), rng.randint(0, 30), rng.randint(0, 4)) for _ in range(t)]))

    statement = r"""Một giáo viên muốn chia hết $N$ viên kẹo giống nhau cho $K$ học sinh sao cho **mỗi học sinh nhận được ít nhất $L$ viên kẹo**. Hai cách chia được coi là khác nhau nếu tồn tại ít nhất một học sinh nhận số kẹo khác nhau giữa hai cách.

Cụ thể hơn, hãy đếm số bộ nghiệm nguyên $(x_1, x_2, \dots, x_K)$ thỏa mãn:
$$x_1 + x_2 + \dots + x_K = N \quad \text{và} \quad x_i \ge L \; (\forall i = 1, \dots, K)$$

Cho $T$ truy vấn độc lập. Với mỗi truy vấn, in ra số cách chia modulo $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 5000$) — số lượng truy vấn.
- $T$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $K, N, L$ ($1 \le K \le 10^5$, $0 \le N \le 10^5$, $0 \le L \le 10^4$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng in ra kết quả tương ứng theo modulo $10^9 + 7$.

### Ràng buộc
- $1 \le T \le 5000$
- $1 \le K \le 10^5$
- $0 \le N \le 10^5$
- $0 \le L \le 10^4$

### Subtasks
- **Subtask 1 (30% số điểm):** $T \le 50$, $K, N \le 100$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Truy vấn $(3, 7, 1)$: chia $7$ kẹo cho $3$ bạn, mỗi bạn ít nhất $1$ viên. Phát trước cho mỗi bạn $1$ viên còn $4$ viên chia tự do cho $3$ bạn: $\binom{4 + 3 - 1}{3 - 1} = \binom{6}{2} = 15$ cách.
- Truy vấn $(3, 5, 2)$: cần tối thiểu $3 \times 2 = 6 > 5$ viên kẹo nên không có cách nào ($0$).
- Truy vấn $(4, 8, 2)$: cần vừa đủ $4 \times 2 = 8$ viên, có đúng $1$ cách là mỗi bạn $2$ viên."""

    hints = r"""**Gợi ý 1 (Đổi biến để đưa cận dưới về $0$):**
Đặt $y_i = x_i - L$. Khi đó điều kiện $x_i \ge L$ trở thành $y_i \ge 0$, và phương trình tổng trở thành:
$$y_1 + y_2 + \dots + y_K = N - K \cdot L$$

**Gợi ý 2 (Bài toán chia kẹo Euler / Stars and Bars):**
Đặt $R = N - K \cdot L$.
- Nếu $R < 0$, phương trình vô nghiệm, đáp án là $0$.
- Nếu $R \ge 0$, số nghiệm nguyên không âm của $y_1 + \dots + y_K = R$ chính là $\binom{R + K - 1}{K - 1}$.

**Gợi ý 3 (Giới hạn giá trị & kiểu dữ liệu):**
- Chú ý phép nhân $K \cdot L$ có thể lên tới $10^9$ (nên dùng kiểu số nguyên 64-bit `long long` để tránh tràn số khi tổng quát hóa).
- Giá trị $R + K - 1 \le N + K - 1 < 2 \cdot 10^5$, nên chỉ cần tiền xử lý mảng giai thừa và nghịch đảo giai thừa đến $2 \cdot 10^5$ một lần trước khi xử lý $T$ truy vấn."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;
static const int MAXN = 200000;

long long modPow(long long base, long long exp) {
    long long res = 1;
    base %= MOD;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % MOD;
        base = (base * base) % MOD;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t;
    if (!(cin >> t)) return 0;

    vector<long long> fact(MAXN + 1), invFact(MAXN + 1);
    fact[0] = 1;
    for (int i = 1; i <= MAXN; ++i) {
        fact[i] = fact[i - 1] * i % MOD;
    }
    invFact[MAXN] = modPow(fact[MAXN], MOD - 2);
    for (int i = MAXN; i >= 1; --i) {
        invFact[i - 1] = invFact[i] * i % MOD;
    }

    auto nCr = [&](int n, int k) -> long long {
        if (k < 0 || k > n) return 0LL;
        return fact[n] * invFact[k] % MOD * invFact[n - k] % MOD;
    };

    while (t--) {
        long long k, n, l;
        cin >> k >> n >> l;
        long long rem = n - k * l;
        if (rem < 0) {
            cout << 0 << '\n';
        } else {
            cout << nCr((int)(rem + k - 1), (int)(k - 1)) << '\n';
        }
    }
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    queries = []
    max_top = 0
    idx = 1
    for _ in range(t):
        k = int(data[idx])
        n = int(data[idx + 1])
        l = int(data[idx + 2])
        idx += 3
        queries.append((k, n, l))
        rem = n - k * l
        if rem >= 0 and rem + k - 1 > max_top:
            max_top = rem + k - 1

    fact = [1] * (max_top + 1)
    for i in range(1, max_top + 1):
        fact[i] = fact[i - 1] * i % MOD

    inv_fact = [1] * (max_top + 1)
    inv_fact[max_top] = pow(fact[max_top], MOD - 2, MOD)
    for i in range(max_top, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    out = []
    for k, n, l in queries:
        rem = n - k * l
        if rem < 0:
            out.append("0")
        else:
            top = rem + k - 1
            bot = k - 1
            out.append(str(fact[top] * inv_fact[bot] % MOD * inv_fact[top - bot] % MOD))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-stars-and-bars-lower",
        "title": "Chia kẹo có cận dưới (Stars and Bars)",
        "shortDescription": "Đếm số nghiệm nguyên có cận dưới cho trước của phương trình tổng bằng phương pháp Stars and Bars.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.combinatorics_mod",
        "tags": ["tổ hợp", "modulo", "toán học", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(max(N + K) + T).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp12-derangements-and-catalan
# ============================================================================

def brute_p03(inp: str) -> str:
    """Independent oracle for small N <= 9 using literal permutation check & Catalan DP."""
    toks = list(map(int, inp.split()))
    t = toks[0]
    ns = toks[1 : 1 + t]
    max_n = max(ns)

    cat = [0] * (max_n + 1)
    cat[0] = 1
    for n in range(1, max_n + 1):
        s = 0
        for i in range(n):
            s = (s + cat[i] * cat[n - 1 - i]) % MOD
        cat[n] = s

    der_cache: Dict[int, int] = {}
    out = []
    for n in ns:
        if n not in der_cache:
            cnt = 0
            for perm in itertools.permutations(range(n)):
                if all(perm[i] != i for i in range(n)):
                    cnt += 1
            der_cache[n] = cnt % MOD
        out.append(f"{der_cache[n]} {cat[n]}")
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1203)

    tests = [
        # 3 public samples
        {
            "input": fmt_int_queries([1, 2, 3, 4]),
            "hidden": False,
            "expected": "0 1\n1 2\n2 5\n9 14",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([5, 6]),
            "hidden": False,
            "expected": "44 42\n265 132",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([7, 8]),
            "hidden": False,
            "expected": "1854 429\n14833 1430",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_int_queries([1]),
            "hidden": True,
            "expected": "0 1",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([2]),
            "hidden": True,
            "expected": "1 2",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([1, 2, 3, 4, 5, 6, 7, 8, 9]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([200_000]),
            "hidden": True,
        },
        {
            "input": fmt_int_queries([1, 10, 100, 1000, 10_000, 100_000, 199_999, 200_000]),
            "hidden": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_int_queries([rng.randint(1, 8) for _ in range(100)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_int_queries([rng.randint(1, 500) for _ in range(500)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_int_queries([rng.randint(1, 5000) for _ in range(1500)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_int_queries([rng.randint(1, 50_000) for _ in range(3000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_int_queries([rng.randint(1, 200_000) for _ in range(5000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_int_queries([200_000 - i for i in range(5000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_int_queries([rng.randint(150_000, 200_000) for _ in range(5000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_int_queries([i for i in range(1, 5001)]),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(20):
        t = rng.randint(1, 12)
        extra_stress.append(fmt_int_queries([rng.randint(1, 8) for _ in range(t)]))

    statement = r"""Cho $T$ truy vấn, mỗi truy vấn gồm một số nguyên dương $N$. Với mỗi truy vấn, hãy tính hai dãy số tổ hợp kinh điển sau theo modulo $10^9 + 7$:

1. **Số hoán vị mất thứ tự $D_N$ (Derangement):** số hoán vị $(p_1, p_2, \dots, p_N)$ của $\{1, 2, \dots, N\}$ sao cho không có phần tử nào đứng đúng vị trí ban đầu của nó, tức $p_i \ne i$ với mọi $1 \le i \le N$.
2. **Số Catalan thứ $N$ ($C_N$):** được xác định bởi công thức $C_N = \frac{1}{N + 1}\binom{2N}{N}$ (cũng là số dãy ngoặc đúng độ dài $2N$, hoặc số cây nhị phân đầy đủ có $N$ nút trong).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 5000$).
- $T$ dòng tiếp theo, mỗi dòng chứa một số nguyên $N$ ($1 \le N \le 2 \cdot 10^5$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng in ra hai số nguyên $D_N \bmod (10^9+7)$ và $C_N \bmod (10^9+7)$ cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le T \le 5000$
- $1 \le N \le 2 \cdot 10^5$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 1000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với $N = 1$: không có hoán vị mất thứ tự nào ($D_1 = 0$); có $1$ dãy ngoặc đúng `()` ($C_1 = 1$).
- Với $N = 2$: hoán vị mất thứ tự duy nhất là $(2, 1)$ ($D_2 = 1$); có $2$ dãy ngoặc đúng `(())`, `()()` ($C_2 = 2$).
- Với $N = 3$: các hoán vị mất thứ tự là $(2, 3, 1)$ và $(3, 1, 2)$ ($D_3 = 2$); số Catalan $C_3 = 5$."""

    hints = r"""**Gợi ý 1 (Truy hồi cho hoán vị mất thứ tự $D_N$):**
Với phần tử $1$, giả sử nó được đặt vào vị trí $k \ne 1$ (có $N - 1$ cách chọn $k$). Khi đó xét phần tử $k$:
- Nếu $k$ đi vào vị trí $1$: $N - 2$ phần tử còn lại tự mất thứ tự lẫn nhau $\implies D_{N-2}$ cách.
- Nếu $k$ **không** đi vào vị trí $1$: coi vị trí $1$ như "vị trí cấm" của $k$, tức $N - 1$ phần tử còn lại mất thứ tự $\implies D_{N-1}$ cách.
Vậy: $D_0 = 1,\; D_1 = 0,\; D_N = (N - 1)(D_{N-1} + D_{N-2}) \bmod P$.

**Gợi ý 2 (Tính số Catalan $C_N$ bằng giai thừa):**
Thay vì công thức truy hồi $O(N^2)$, ta dùng trực tiếp:
$$C_N = \frac{1}{N + 1}\binom{2N}{N} = \frac{(2N)!}{N!\,(N + 1)!}$$
Chú ý rằng $(2N)!$ đòi hỏi mảng giai thừa và nghịch đảo giai thừa phải tính tới $2 \cdot \max(N) \le 4 \cdot 10^5$.

**Gợi ý 3 (Tổ hợp lại):**
Tiền xử lý mảng `D` tới $2 \cdot 10^5$ và mảng `fact`, `invFact` tới $4 \cdot 10^5$ trong $O(N_{\max})$. Mỗi truy vấn trả lời trong $O(1)$: `D[N]` và `fact[2*N] * invFact[N] % MOD * invFact[N+1] % MOD`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;
static const int MAXN = 200000;
static const int MAXF = 400000;

long long modPow(long long base, long long exp) {
    long long res = 1;
    base %= MOD;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % MOD;
        base = (base * base) % MOD;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t;
    if (!(cin >> t)) return 0;

    vector<long long> D(MAXN + 1);
    D[0] = 1;
    D[1] = 0;
    for (int i = 2; i <= MAXN; ++i) {
        D[i] = (i - 1) * ((D[i - 1] + D[i - 2]) % MOD) % MOD;
    }

    vector<long long> fact(MAXF + 1), invFact(MAXF + 1);
    fact[0] = 1;
    for (int i = 1; i <= MAXF; ++i) {
        fact[i] = fact[i - 1] * i % MOD;
    }
    invFact[MAXF] = modPow(fact[MAXF], MOD - 2);
    for (int i = MAXF; i >= 1; --i) {
        invFact[i - 1] = invFact[i] * i % MOD;
    }

    while (t--) {
        int n;
        cin >> n;
        long long cat = fact[2 * n] * invFact[n] % MOD * invFact[n + 1] % MOD;
        cout << D[n] << ' ' << cat << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    queries = [int(data[i + 1]) for i in range(t)]
    max_n = max(queries) if queries else 1
    max_f = 2 * max_n

    der = [0] * (max_n + 1)
    der[0] = 1
    if max_n >= 1:
        der[1] = 0
    for i in range(2, max_n + 1):
        der[i] = (i - 1) * ((der[i - 1] + der[i - 2]) % MOD) % MOD

    fact = [1] * (max_f + 1)
    for i in range(1, max_f + 1):
        fact[i] = fact[i - 1] * i % MOD

    inv_fact = [1] * (max_f + 1)
    inv_fact[max_f] = pow(fact[max_f], MOD - 2, MOD)
    for i in range(max_f, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    out = []
    for n in queries:
        cat = fact[2 * n] * inv_fact[n] % MOD * inv_fact[n + 1] % MOD
        out.append(f"{der[n]} {cat}")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-derangements-and-catalan",
        "title": "Hoán vị mất thứ tự và Số Catalan",
        "shortDescription": "Tính đồng thời số hoán vị mất thứ tự D_N và số Catalan C_N theo modulo 10^9 + 7.",
        "difficulty": "easy",
        "estimatedTime": 25,
        "skillId": "algo.combinatorics_mod",
        "tags": ["tổ hợp", "quy hoạch động", "modulo", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(max(N) + T).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp12-multinomial-anagrams
# ============================================================================

def brute_p04(inp: str) -> str:
    s = inp.strip()
    return str(len(set(itertools.permutations(s))) % MOD)


def build_p04() -> dict:
    rng = random.Random(1204)
    alpha = "abcdefghijklmnopqrstuvwxyz"

    def rand_str(length: int, alphabet: str = alpha) -> str:
        return "".join(rng.choice(alphabet) for _ in range(length))

    tests = [
        # 3 public samples
        {"input": "aab", "hidden": False, "expected": "3", "checkBrute": True},
        {"input": "codeclass", "hidden": False, "expected": "90720"},
        {"input": "zzzzzz", "hidden": False, "expected": "1", "checkBrute": True},
        # 5 edge cases
        {"input": "a", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "ab", "hidden": True, "expected": "2", "checkBrute": True},
        {"input": "abcdefgh", "hidden": True, "expected": "40320", "checkBrute": True},
        {"input": "aabbccdd", "hidden": True, "checkBrute": True},
        {"input": "z" * 100_000, "hidden": True, "expected": "1"},
    ]

    # 8 medium -> large tests (all <= 100,001 bytes)
    tests.append({"input": rand_str(8, "abc"), "hidden": True, "checkBrute": True})
    tests.append({"input": rand_str(200, "abcde"), "hidden": True})
    tests.append({"input": rand_str(2000), "hidden": True})
    tests.append({"input": "a" * 5000 + "b" * 5000, "hidden": True})
    tests.append({"input": rand_str(30_000, "ab"), "hidden": True})
    tests.append({"input": rand_str(60_000, "abcdefghij"), "hidden": True})
    tests.append({"input": rand_str(100_000), "hidden": True})
    tests.append({
        "input": "".join(alpha[i % 26] for i in range(100_000)),
        "hidden": True,
    })

    extra_stress = [rand_str(rng.randint(1, 8), "abcd") for _ in range(30)]

    statement = r"""Cho một xâu ký tự $S$ có độ dài $N$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'` đến `'z'`).

Hãy đếm số lượng xâu **phân biệt** khác nhau có thể tạo thành bằng cách sắp xếp lại (hoán vị) các ký tự của xâu $S$ (kể cả chính xâu $S$). Vì kết quả có thể rất lớn, hãy in ra phần dư khi chia cho $10^9 + 7$.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ ($1 \le |S| \le 10^5$).

### Kết quả
- In ra một số nguyên duy nhất là số lượng xâu phân biệt modulo $10^9 + 7$.

### Ràng buộc
- $1 \le |S| \le 10^5$
- Mọi ký tự trong $S$ thuộc `'a'..'z'`.

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 10$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với $S = \texttt{"aab"}$: có $3$ xâu phân biệt là `aab`, `aba`, `baa`.
- Với $S = \texttt{"codeclass"}$: có độ dài $9$, trong đó `'c'` xuất hiện $2$ lần, `'s'` xuất hiện $2$ lần, các ký tự `'o', 'd', 'e', 'l', 'a'` mỗi ký tự xuất hiện $1$ lần. Số xâu phân biệt là $\frac{9!}{2!\,2!} = 90\,720$.
- Với $S = \texttt{"zzzzzz"}$: chỉ có $1$ xâu duy nhất."""

    hints = r"""**Gợi ý 1 (Hoán vị lặp / Hệ số đa thức):**
Nếu xem $N$ ký tự của $S$ đều phân biệt, có $N!$ cách xếp. Tuy nhiên, nếu ký tự $c$ xuất hiện $cnt[c]$ lần, việc hoán vị nội bộ $cnt[c]$ vị trí của ký tự $c$ không tạo ra xâu mới.

**Gợi ý 2 (Công thức):**
Số xâu phân biệt là:
$$\frac{N!}{\prod_{c = \text{'a'}}^{\text{'z'}} (cnt[c]!)}$$

**Gợi ý 3 (Thực hiện trong modulo):**
Tính trước mảng giai thừa $\text{fact}[0..N]$ theo modulo $P = 10^9 + 7$. Đếm tần suất $cnt[c]$ của $26$ chữ cái, sau đó nhân $\text{fact}[N]$ với nghịch đảo modulo $(\text{fact}[cnt[c]])^{P-2} \bmod P$ cho từng chữ cái $c$ (hoặc tính mẫu số $D = \prod \text{fact}[cnt[c]] \bmod P$ rồi lấy $\text{fact}[N] \cdot D^{P-2} \bmod P$ một lần duy nhất)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;

long long modPow(long long base, long long exp) {
    long long res = 1;
    base %= MOD;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % MOD;
        base = (base * base) % MOD;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;

    int n = (int)s.size();
    int cnt[26] = {0};
    for (char ch : s) {
        cnt[ch - 'a']++;
    }

    vector<long long> fact(n + 1, 1);
    for (int i = 1; i <= n; ++i) {
        fact[i] = fact[i - 1] * i % MOD;
    }

    long long denom = 1;
    for (int c = 0; c < 26; ++c) {
        if (cnt[c] > 1) {
            denom = denom * fact[cnt[c]] % MOD;
        }
    }

    long long ans = fact[n] * modPow(denom, MOD - 2) % MOD;
    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)

    cnt = [0] * 26
    base = ord("a")
    for ch in s:
        cnt[ord(ch) - base] += 1

    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD

    denom = 1
    for c in cnt:
        if c > 1:
            denom = denom * fact[c] % MOD

    ans = fact[n] * pow(denom, MOD - 2, MOD) % MOD
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-multinomial-anagrams",
        "title": "Đếm hoán vị xâu ký tự (Hệ số đa thức)",
        "shortDescription": "Đếm số xâu phân biệt tạo từ các hoán vị ký tự của xâu S theo công thức hệ số đa thức.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.combinatorics_mod",
        "tags": ["tổ hợp", "xâu", "modulo", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S| + log MOD).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp12-divisible-by-any-ie
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, k = toks[0], toks[1]
    primes = toks[2 : 2 + k]
    cnt = 0
    for x in range(1, n + 1):
        for p in primes:
            if x % p == 0:
                cnt += 1
                break
    return str(cnt)


def build_p05() -> dict:
    rng = random.Random(1205)
    first_25_primes = [
        2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
        31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
        73, 79, 83, 89, 97,
    ]
    big_primes = [
        999_999_937, 999_999_929, 999_999_893, 999_999_883, 999_999_797,
        999_999_761, 999_999_757, 999_999_751, 999_999_739, 999_999_733,
        999_999_677, 999_999_667, 999_999_613, 999_999_607, 999_999_599,
        999_999_587, 999_999_541, 999_999_527,
    ]

    def fmt_p05(n: int, ps: List[int]) -> str:
        return f"{n} {len(ps)}\n" + " ".join(map(str, ps))

    tests = [
        # 3 public samples
        {
            "input": fmt_p05(10, [2, 3]),
            "hidden": False,
            "expected": "7",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(20, [2, 3, 5]),
            "hidden": False,
            "expected": "14",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(15, [17, 19]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_p05(1, [2, 3, 5, 7]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_p05(10**18, [2]),
            "hidden": True,
            "expected": str(5 * 10**17),
        },
        {
            "input": fmt_p05(10**18, [999_999_937]),
            "hidden": True,
            "expected": str(10**18 // 999_999_937),
        },
        {
            "input": fmt_p05(10**18, big_primes),
            "hidden": True,
        },
        {
            "input": fmt_p05(999_999_937, [999_999_937, 999_999_929]),
            "hidden": True,
            "expected": "2",
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p05(500, [2, 3, 5, 7, 11]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p05(2000, [3, 5, 11, 13, 17, 19]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p05(4000, first_25_primes[:12]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p05(10**12, first_25_primes[:15]), "hidden": True})
    tests.append({"input": fmt_p05(10**18, first_25_primes[:18]), "hidden": True})
    tests.append({"input": fmt_p05(10**18, [2, 3, 5] + big_primes[:15]), "hidden": True})
    tests.append({"input": fmt_p05(987_654_321_987_654_321, rng.sample(first_25_primes, 16)), "hidden": True})
    tests.append({"input": fmt_p05(10**18 - 1, [2, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67]), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 500)
        k = rng.randint(1, 8)
        ps = rng.sample(first_25_primes[:12], k)
        extra_stress.append(fmt_p05(n, ps))

    statement = r"""Cho số nguyên dương $N$ và $K$ số nguyên tố phân biệt $p_1, p_2, \dots, p_K$.

Hãy đếm số lượng số nguyên dương $x \in [1, N]$ sao cho $x$ chia hết cho **ít nhất một** trong $K$ số nguyên tố đã cho.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N$ và $K$ ($1 \le N \le 10^{18}$, $1 \le K \le 18$).
- Dòng thứ hai chứa $K$ số nguyên tố **phân biệt** $p_1, p_2, \dots, p_K$ ($2 \le p_i \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là số lượng số nguyên dương thỏa mãn yêu cầu (kết quả nằm trong phạm vi kiểu số nguyên 64-bit có dấu).

### Ràng buộc
- $1 \le N \le 10^{18}$
- $1 \le K \le 18$
- $2 \le p_i \le 10^9$, các $p_i$ đôi một phân biệt và là số nguyên tố.

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 10^5$, $K \le 10$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($N = 10$, $p = [2, 3]$): các số chia hết cho $2$ hoặc $3$ trong $[1, 10]$ gồm $2, 3, 4, 6, 8, 9, 10$ — tổng cộng $7$ số.
- Ví dụ 2 ($N = 20$, $p = [2, 3, 5]$): trong $[1, 20]$ có $6$ số nguyên tố cùng nhau với $30$ là $1, 7, 11, 13, 17, 19$, nên có $20 - 6 = 14$ số chia hết cho ít nhất một số trong $\{2, 3, 5\}$.
- Ví dụ 3 ($N = 15$, $p = [17, 19]$): mọi số nguyên tố đều lớn hơn $15$, đáp án là $0$."""

    hints = r"""**Gợi ý 1 (Nguyên lý Bao hàm – Loại trừ):**
Gọi $A_i$ là tập các số trong $[1, N]$ chia hết cho $p_i$. Ta cần tính $\left|\bigcup_{i=1}^K A_i\right|$.
Vì các $p_i$ là các số nguyên tố phân biệt, số lượng số trong $[1, N]$ chia hết cho tất cả các số trong một tập con khác rỗng $S \subseteq \{1, \dots, K\}$ là $\left\lfloor \frac{N}{\prod_{i \in S} p_i} \right\rfloor$.

**Gợi ý 2 (Công thức tổng quát):**
$$\left|\bigcup_{i=1}^K A_i\right| = \sum_{\emptyset \ne S \subseteq \{1,\dots,K\}} (-1)^{|S| - 1} \left\lfloor \frac{N}{\prod_{i \in S} p_i} \right\rfloor$$

**Gợi ý 3 (Tránh tràn số khi nhân tích):**
Nếu các $p_i \approx 10^9$, tích của $3$ số thôi đã đạt $10^{27}$, vượt xa giới hạn `long long` ($\approx 9.22 \times 10^{18}$)!
Trước khi nhân `prod * p[i]`, luôn kiểm tra `if (prod > N / p[i])` (hoặc dùng đệ quy quay lui cắt nhánh ngay khi `p[i] > N / prod`). Khi đó không bao giờ xảy ra tràn tích và các nhánh vượt quá $N$ bị loại bỏ ngay lập tức."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long n;
    int k;
    if (!(cin >> n >> k)) return 0;

    vector<long long> p(k);
    for (int i = 0; i < k; ++i) {
        cin >> p[i];
    }
    sort(p.rbegin(), p.rend());

    long long ans = 0;
    auto dfs = [&](auto& self, int idx, long long prod, int sign) -> void {
        for (int i = idx; i < k; ++i) {
            if (p[i] > n / prod) continue;
            long long nxt = prod * p[i];
            ans += sign * (n / nxt);
            self(self, i + 1, nxt, -sign);
        }
    };

    dfs(dfs, 0, 1LL, 1);
    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    primes = sorted((int(data[2 + i]) for i in range(k)), reverse=True)

    ans = 0

    def dfs(idx: int, prod: int, sign: int) -> None:
        nonlocal ans
        for i in range(idx, k):
            pi = primes[i]
            if pi > n // prod:
                continue
            nxt = prod * pi
            ans += sign * (n // nxt)
            dfs(i + 1, nxt, -sign)

    dfs(0, 1, 1)
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-divisible-by-any-ie",
        "title": "Đếm bội số bằng Bao hàm–Loại trừ",
        "shortDescription": "Đếm số nguyên dương không vượt quá N chia hết cho ít nhất một trong K số nguyên tố bằng Bao hàm–Loại trừ.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.inclusion_exclusion",
        "tags": ["bao hàm loại trừ", "bitmask", "số học", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(2^K) với cắt tỉa khi tích vượt quá N.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp12-coprime-in-range-ie
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out = []
    for _ in range(t):
        l, r, m = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        cnt = 0
        for x in range(l, r + 1):
            if math.gcd(x, m) == 1:
                cnt += 1
        out.append(str(cnt))
    return "\n".join(out)


def build_p06() -> dict:
    rng = random.Random(1206)

    tests = [
        # 3 public samples
        {
            "input": fmt_triples_queries([(1, 10, 6), (5, 15, 12), (10, 20, 1)]),
            "hidden": False,
            "expected": "3\n4\n11",
            "checkBrute": True,
        },
        {
            "input": fmt_triples_queries([(1, 1, 1), (100, 100, 10)]),
            "hidden": False,
            "expected": "1\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_triples_queries([(7, 7, 13), (12, 24, 30)]),
            "hidden": False,
            "expected": "1\n4",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_triples_queries([(1, 10**15, 1), (10**15, 10**15, 10**12), (10**15, 10**15, 999_999_999_989)]),
            "hidden": True,
        },
        {
            "input": fmt_triples_queries([
                (1, 10**15, 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31),
                (123_456_789, 987_654_321_000_000, 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31),
            ]),
            "hidden": True,
        },
        {
            "input": fmt_triples_queries([(1, 10**12, 999_999_000_001), (1, 10**15, 999_999_999_989)]),
            "hidden": True,
        },
        {
            "input": fmt_triples_queries([(1, 50, 1), (1, 50, 210), (25, 25, 5), (25, 25, 6), (1, 100, 97)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_triples_queries([(1, 200, m) for m in range(1, 31)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (up to T = 200, L, R <= 10^15, M <= 10^12)
    tests.append({
        "input": fmt_triples_queries([
            (a := rng.randint(1, 300), rng.randint(a, 500), rng.randint(1, 500))
            for _ in range(50)
        ]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_triples_queries([
            (a := rng.randint(1, 500), rng.randint(a, 1000), rng.randint(1, 10**6))
            for _ in range(80)
        ]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_triples_queries([
            (a := rng.randint(1, 10**9), rng.randint(a, 10**12), rng.randint(1, 10**9))
            for _ in range(150)
        ]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_triples_queries([
            (a := rng.randint(1, 10**14), rng.randint(a, 10**15), rng.randint(1, 10**12))
            for _ in range(200)
        ]),
        "hidden": True,
    })
    # Test 13: 200 queries with large prime / semiprime M near 10^12
    large_ms = [
        999_999_999_989, 999_999_999_961, 999_999_999_959, 999_999_999_877,
        999_999_999_773, 999_999_000_001, 999_998_000_003, 999_983 * 999_979,
        999_961 * 999_959, 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31,
    ]
    tests.append({
        "input": fmt_triples_queries([
            (a := rng.randint(1, 10**14), rng.randint(a, 10**15), large_ms[i % len(large_ms)])
            for i in range(200)
        ]),
        "hidden": True,
    })
    # Test 14: M with many prime factors and squares/cubes
    tests.append({
        "input": fmt_triples_queries([
            (1, 10**15, (2**rng.randint(1, 6)) * (3**rng.randint(1, 4)) * (5**rng.randint(1, 3)) * rng.randint(1, 10**7))
            for _ in range(200)
        ]),
        "hidden": True,
    })
    # Test 15: tight intervals [L, L+k]
    tests.append({
        "input": fmt_triples_queries([
            (a := rng.randint(10**14, 10**15 - 100), a + rng.randint(0, 100), rng.randint(1, 10**12))
            for _ in range(200)
        ]),
        "hidden": True,
    })
    # Test 16: mix of M=1, prime M, highly composite M
    q16 = []
    for i in range(200):
        l = rng.randint(1, 5 * 10**14)
        r = rng.randint(l, 10**15)
        if i % 5 == 0:
            m = 1
        elif i % 5 == 1:
            m = 999_999_999_989
        elif i % 5 == 2:
            m = 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31
        else:
            m = rng.randint(2, 10**12)
        q16.append((l, r, m))
    tests.append({"input": fmt_triples_queries(q16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        t = rng.randint(1, 15)
        qs = []
        for _ in range(t):
            l = rng.randint(1, 150)
            r = rng.randint(l, 250)
            m = rng.randint(1, 300)
            qs.append((l, r, m))
        extra_stress.append(fmt_triples_queries(qs))

    statement = r"""Cho $T$ truy vấn độc lập. Mỗi truy vấn gồm ba số nguyên dương $L, R, M$.

Hãy đếm số lượng số nguyên $x$ nằm trong đoạn $[L, R]$ sao cho $x$ **nguyên tố cùng nhau** với $M$, tức là $\gcd(x, M) = 1$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 200$).
- $T$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $L, R, M$ ($1 \le L \le R \le 10^{15}$, $1 \le M \le 10^{12}$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng in ra một số nguyên là số lượng số trong $[L, R]$ nguyên tố cùng nhau với $M$.

### Ràng buộc
- $1 \le T \le 200$
- $1 \le L \le R \le 10^{15}$
- $1 \le M \le 10^{12}$

### Subtasks
- **Subtask 1 (30% số điểm):** $R \le 10^5$, $M \le 10^6$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Truy vấn $(1, 10, 6)$: các số nguyên tố cùng nhau với $6$ trong $[1, 10]$ là $1, 5, 7$ ($3$ số).
- Truy vấn $(5, 15, 12)$: các số nguyên tố cùng nhau với $12$ trong $[5, 15]$ là $5, 7, 11, 13$ ($4$ số).
- Truy vấn $(10, 20, 1)$: mọi số nguyên đều có $\gcd(x, 1) = 1$, nên có $20 - 10 + 1 = 11$ số."""

    hints = r"""**Gợi ý 1 (Đưa về tiền tố $[1, X]$):**
Đặt $f(X, M)$ là số lượng số nguyên dương $\le X$ nguyên tố cùng nhau với $M$. Khi đó đáp án cho đoạn $[L, R]$ là:
$$f(R, M) - f(L - 1, M)$$

**Gợi ý 2 (Phân tích thừa số nguyên tố + Bao hàm–Loại trừ):**
Một số $x$ có $\gcd(x, M) = 1$ khi và chỉ khi $x$ **không** chia hết cho bất kỳ ước nguyên tố nào của $M$.
Phân tích $M$ thành các ước nguyên tố phân biệt $p_1, p_2, \dots, p_k$.
Vì $2 \times 3 \times 5 \times 7 \times 11 \times 13 \times 17 \times 19 \times 23 \times 29 \times 31 \times 37 > 10^{12}$, nên $M$ có tối đa $k \le 11$ ước nguyên tố phân biệt!
Ta tính $f(X, M) = \sum_{S \subseteq \{1..k\}} (-1)^{|S|} \left\lfloor \frac{X}{\prod_{i \in S} p_i} \right\rfloor$ bằng Bao hàm–Loại trừ trong $O(2^k)$.

**Gợi ý 3 (Tối ưu phân tích $M$):**
Sàng Eratosthenes các số nguyên tố $\le 10^6$ một lần duy nhất trước khi đọc $T$ truy vấn (chỉ có khoảng $78\,498$ số nguyên tố $\le 10^6$). Khi phân tích $M$, chỉ cần duyệt các số nguyên tố $p$ thỏa $p^2 \le M$; nếu sau vòng lặp $M > 1$ thì phần dư $M$ chính là một ước nguyên tố lớn."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const int LIM = 1000000;
    vector<bool> isPrime(LIM + 1, true);
    vector<int> primes;
    isPrime[0] = isPrime[1] = false;
    for (int i = 2; i <= LIM; ++i) {
        if (isPrime[i]) {
            primes.push_back(i);
            if (1LL * i * i <= LIM) {
                for (int j = i * i; j <= LIM; j += i) {
                    isPrime[j] = false;
                }
            }
        }
    }

    int t;
    if (!(cin >> t)) return 0;

    while (t--) {
        long long l, r, m;
        cin >> l >> r >> m;

        vector<long long> pf;
        long long tmp = m;
        for (int p : primes) {
            if (1LL * p * p > tmp) break;
            if (tmp % p == 0) {
                pf.push_back(p);
                while (tmp % p == 0) tmp /= p;
            }
        }
        if (tmp > 1) pf.push_back(tmp);

        int k = (int)pf.size();
        auto countCoprime = [&](long long x) -> long long {
            if (x <= 0) return 0LL;
            long long res = 0;
            int totalMasks = 1 << k;
            for (int mask = 0; mask < totalMasks; ++mask) {
                long long prod = 1;
                int bits = 0;
                bool ok = true;
                for (int i = 0; i < k; ++i) {
                    if (mask & (1 << i)) {
                        ++bits;
                        if (pf[i] > x / prod) {
                            ok = false;
                            break;
                        }
                        prod *= pf[i];
                    }
                }
                if (!ok) continue;
                if (bits & 1) res -= x / prod;
                else res += x / prod;
            }
            return res;
        };

        cout << countCoprime(r) - countCoprime(l - 1) << '\n';
    }
    return 0;
}"""

    py_sol = r"""import math
import sys


def is_prime(n: int) -> bool:
    if n < 2:
        return False
    for p in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n == p:
            return True
        if n % p == 0:
            return False
    d = n - 1
    s = 0
    while (d & 1) == 0:
        d >>= 1
        s += 1
    for a in (2, 3, 5, 7, 11, 13, 17):
        if a >= n:
            break
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(s - 1):
            x = (x * x) % n
            if x == n - 1:
                break
        else:
            return False
    return True


def pollard_rho(n: int) -> int:
    if n % 2 == 0:
        return 2
    for c in range(1, 20):
        x = 2
        y = 2
        d = 1
        while d == 1:
            x = (x * x + c) % n
            y = (y * y + c) % n
            y = (y * y + c) % n
            d = math.gcd(abs(x - y), n)
        if d < n:
            return d
    i = 3
    while i * i <= n:
        if n % i == 0:
            return i
        i += 2
    return n


def factor_distinct(n: int) -> list[int]:
    if n <= 1:
        return []
    res = set()
    stack = [n]
    while stack:
        cur = stack.pop()
        if cur <= 1:
            continue
        if is_prime(cur):
            res.add(cur)
        else:
            d = pollard_rho(cur)
            stack.append(d)
            stack.append(cur // d)
    return sorted(res)


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    idx = 1
    out = []

    for _ in range(t):
        l = int(data[idx])
        r = int(data[idx + 1])
        m = int(data[idx + 2])
        idx += 3

        pf = factor_distinct(m)
        k = len(pf)

        def count_coprime(x: int) -> int:
            if x <= 0:
                return 0
            ans = 0

            def dfs(pos: int, prod: int, sign: int) -> None:
                nonlocal ans
                ans += sign * (x // prod)
                for i in range(pos, k):
                    pi = pf[i]
                    if pi > x // prod:
                        break
                    dfs(i + 1, prod * pi, -sign)

            dfs(0, 1, 1)
            return ans

        out.append(str(count_coprime(r) - count_coprime(l - 1)))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-coprime-in-range-ie",
        "title": "Đếm số nguyên tố cùng nhau trong đoạn",
        "shortDescription": "Đếm số lượng số trong đoạn [L, R] nguyên tố cùng nhau với M bằng phân tích thừa số nguyên tố và Bao hàm–Loại trừ.",
        "difficulty": "medium",
        "estimatedTime": 35,
        "skillId": "algo.inclusion_exclusion",
        "tags": ["bao hàm loại trừ", "số học", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(sqrt(M) / log(M) + T * 2^w(M)) hoặc phân tích nhanh + 2^w(M).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp12-matrix-fibonacci-sum
# ============================================================================

def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    t = toks[0]
    ns = toks[1 : 1 + t]
    max_n = max(ns)
    f = [0] * (max(2, max_n + 1))
    s = [0] * (max(2, max_n + 1))
    f[0], f[1] = 0, 1
    s[0], s[1] = 0, 1
    for i in range(2, max_n + 1):
        f[i] = (f[i - 1] + f[i - 2]) % MOD
        s[i] = (s[i - 1] + f[i]) % MOD
    return "\n".join(f"{f[n]} {s[n]}" for n in ns)


def build_p07() -> dict:
    rng = random.Random(1207)

    tests = [
        # 3 public samples
        {
            "input": fmt_int_queries([0, 1, 2, 5]),
            "hidden": False,
            "expected": "0 0\n1 1\n1 2\n5 12",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([7, 10]),
            "hidden": False,
            "expected": "13 33\n55 143",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([3, 6]),
            "hidden": False,
            "expected": "2 4\n8 20",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_int_queries([0]),
            "hidden": True,
            "expected": "0 0",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([1]),
            "hidden": True,
            "expected": "1 1",
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([0, 1, 2, 3, 4, 5, 10, 20, 50, 100]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_int_queries([10**18]),
            "hidden": True,
        },
        {
            "input": fmt_int_queries([10**18 - 1, 10**18, (1 << 59) - 1, (1 << 59)]),
            "hidden": True,
        },
    ]

    # 8 medium -> large tests (max T = 2000, N <= 10^18 -> ~42 KB)
    tests.append({"input": fmt_int_queries([rng.randint(0, 500) for _ in range(100)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_int_queries([rng.randint(0, 2000) for _ in range(300)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_int_queries([rng.randint(0, 10**9) for _ in range(800)]), "hidden": True})
    tests.append({"input": fmt_int_queries([rng.randint(0, 10**18) for _ in range(1500)]), "hidden": True})
    tests.append({"input": fmt_int_queries([rng.randint(0, 10**18) for _ in range(2000)]), "hidden": True})
    tests.append({"input": fmt_int_queries([10**18 - i for i in range(2000)]), "hidden": True})
    tests.append({"input": fmt_int_queries([(1 << rng.randint(0, 59)) - rng.randint(0, 3) for _ in range(2000)]), "hidden": True})
    tests.append({"input": fmt_int_queries([rng.randint(10**17, 10**18) for _ in range(2000)]), "hidden": True})

    extra_stress = []
    for _ in range(25):
        t = rng.randint(1, 20)
        extra_stress.append(fmt_int_queries([rng.randint(0, 400) for _ in range(t)]))

    statement = r"""Dãy số Fibonacci được định nghĩa bởi:
$$F_0 = 0, \quad F_1 = 1, \quad F_n = F_{n-1} + F_{n-2} \quad (\forall n \ge 2)$$

Cho $T$ truy vấn độc lập, mỗi truy vấn cho một số nguyên không âm $N$. Hãy tính đồng thời hai giá trị theo modulo $P = 10^9 + 7$:
1. $F_N \bmod P$
2. $S_N = (F_0 + F_1 + \dots + F_N) \bmod P$

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 2000$).
- $T$ dòng tiếp theo, mỗi dòng chứa một số nguyên $N$ ($0 \le N \le 10^{18}$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng in ra hai số nguyên $F_N \bmod (10^9+7)$ và $S_N \bmod (10^9+7)$ cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le T \le 2000$
- $0 \le N \le 10^{18}$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 10^5$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với $N = 0$: $F_0 = 0$, $S_0 = F_0 = 0$.
- Với $N = 2$: $F_0 = 0, F_1 = 1, F_2 = 1 \implies S_2 = 0 + 1 + 1 = 2$.
- Với $N = 5$: $F_0..F_5 = 0, 1, 1, 2, 3, 5 \implies F_5 = 5$ và $S_5 = 12$."""

    hints = r"""**Gợi ý 1 (Biểu diễn bằng ma trận $3 \times 3$):**
Đặt vector trạng thái tại bước $k$ là $v_k = \begin{pmatrix} S_k \\ F_{k+1} \\ F_k \end{pmatrix}$.
Khi tăng $k$ lên $k+1$, ta có $S_{k+1} = S_k + F_{k+1}$, $F_{k+2} = F_{k+1} + F_k$, và $F_{k+1} = F_{k+1}$.
Do đó:
$$\begin{pmatrix} S_{k+1} \\ F_{k+2} \\ F_{k+1} \end{pmatrix} = \begin{pmatrix} 1 & 1 & 0 \\ 0 & 1 & 1 \\ 0 & 1 & 0 \end{pmatrix} \begin{pmatrix} S_k \\ F_{k+1} \\ F_k \end{pmatrix}$$

**Gợi ý 2 (Lũy thừa nhị phân ma trận $O(\log N)$):**
Gọi $M$ là ma trận $3 \times 3$ trên. Từ trạng thái ban đầu $v_0 = \begin{pmatrix} 0 \\ 1 \\ 0 \end{pmatrix}$, ta có $v_N = M^N v_0$.
(Một cách khác tương đương là dùng ma trận $2 \times 2$ tính $(F_N, F_{N+1})$ kết hợp đẳng thức $S_N = F_{N+2} - 1 = F_{N+1} + F_N - 1$.)

**Gợi ý 3 (Tối ưu cho nhiều truy vấn):**
Thay vì nhân ma trận $3 \times 3$ ở mỗi truy vấn, hãy tiền xử lý sẵn các ma trận $P_b = M^{2^b} \bmod (10^9+7)$ với $b = 0, 1, \dots, 60$.
Với mỗi truy vấn $N$, chỉ cần nhân vector $v$ (kích thước $3 \times 1$) với $P_b$ tại các bit $b$ bằng $1$ của $N$ — giảm $27$ phép nhân xuống chỉ còn $9$ phép nhân mỗi bit!"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;

struct Mat3 {
    long long a[3][3]{};
};

Mat3 mulMat(const Mat3& x, const Mat3& y) {
    Mat3 z;
    for (int i = 0; i < 3; ++i) {
        for (int k = 0; k < 3; ++k) {
            if (x.a[i][k] == 0) continue;
            for (int j = 0; j < 3; ++j) {
                z.a[i][j] = (z.a[i][j] + x.a[i][k] * y.a[k][j]) % MOD;
            }
        }
    }
    return z;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    Mat3 powers[61];
    powers[0].a[0][0] = 1; powers[0].a[0][1] = 1; powers[0].a[0][2] = 0;
    powers[0].a[1][0] = 0; powers[0].a[1][1] = 1; powers[0].a[1][2] = 1;
    powers[0].a[2][0] = 0; powers[0].a[2][1] = 1; powers[0].a[2][2] = 0;
    for (int b = 1; b <= 60; ++b) {
        powers[b] = mulMat(powers[b - 1], powers[b - 1]);
    }

    int t;
    if (!(cin >> t)) return 0;

    while (t--) {
        unsigned long long n;
        cin >> n;
        long long v0 = 0, v1 = 1, v2 = 0; // [S_0, F_1, F_0]
        for (int b = 0; b <= 60; ++b) {
            if ((n >> b) & 1ULL) {
                const auto& m = powers[b].a;
                long long nv0 = (m[0][0] * v0 + m[0][1] * v1 + m[0][2] * v2) % MOD;
                long long nv1 = (m[1][0] * v0 + m[1][1] * v1 + m[1][2] * v2) % MOD;
                long long nv2 = (m[2][0] * v0 + m[2][1] * v1 + m[2][2] * v2) % MOD;
                v0 = nv0;
                v1 = nv1;
                v2 = nv2;
            }
        }
        cout << v2 << ' ' << v0 << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def mul_mat(a: list[list[int]], b: list[list[int]]) -> list[list[int]]:
    res = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for i in range(3):
        for k in range(3):
            aik = a[i][k]
            if aik:
                bk = b[k]
                ri = res[i]
                ri[0] = (ri[0] + aik * bk[0]) % MOD
                ri[1] = (ri[1] + aik * bk[1]) % MOD
                ri[2] = (ri[2] + aik * bk[2]) % MOD
    return res


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])

    powers = [None] * 61
    powers[0] = [
        [1, 1, 0],
        [0, 1, 1],
        [0, 1, 0],
    ]
    for b in range(1, 61):
        powers[b] = mul_mat(powers[b - 1], powers[b - 1])

    out = []
    for idx in range(1, t + 1):
        n = int(data[idx])
        v0, v1, v2 = 0, 1, 0  # [S_0, F_1, F_0]
        b = 0
        while n > 0:
            if n & 1:
                m = powers[b]
                m0, m1, m2 = m[0], m[1], m[2]
                v0, v1, v2 = (
                    (m0[0] * v0 + m0[1] * v1 + m0[2] * v2) % MOD,
                    (m1[0] * v0 + m1[1] * v1 + m1[2] * v2) % MOD,
                    (m2[0] * v0 + m2[1] * v1 + m2[2] * v2) % MOD,
                )
            n >>= 1
            b += 1
        out.append(f"{v2} {v0}")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-matrix-fibonacci-sum",
        "title": "Tổng Fibonacci bằng Nhân ma trận",
        "shortDescription": "Tính F_N và tổng F_0 + ... + F_N với N <= 10^18 bằng lũy thừa ma trận 3x3.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.matrix_exponentiation",
        "tags": ["nhân ma trận", "chia để trị", "modulo", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(log(max N) + T * log(max N)).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp12-grid-paths-obstacles-comb
# ============================================================================

def brute_p08(inp: str) -> str:
    """Independent 2D grid DP oracle for small grids H, W <= 30."""
    toks = list(map(int, inp.split()))
    h, w, m = toks[0], toks[1], toks[2]
    blocked = set()
    idx = 3
    for _ in range(m):
        blocked.add((toks[idx], toks[idx + 1]))
        idx += 2
    if (1, 1) in blocked or (h, w) in blocked:
        return "0"
    dp = [[0] * (w + 1) for _ in range(h + 1)]
    dp[1][1] = 1
    for r in range(1, h + 1):
        for c in range(1, w + 1):
            if (r == 1 and c == 1) or (r, c) in blocked:
                continue
            dp[r][c] = (dp[r - 1][c] + dp[r][c - 1]) % MOD
    return str(dp[h][w])


def fmt_grid_obs(h: int, w: int, obs: List[Tuple[int, int]]) -> str:
    lines = [f"{h} {w} {len(obs)}"]
    lines.extend(f"{r} {c}" for r, c in obs)
    return "\n".join(lines)


def build_p08() -> dict:
    rng = random.Random(1208)

    def sample_obs(h: int, w: int, count: int, allow_ends: bool = False) -> List[Tuple[int, int]]:
        chosen = set()
        while len(chosen) < count:
            r = rng.randint(1, h)
            c = rng.randint(1, w)
            if not allow_ends and ((r == 1 and c == 1) or (r == h and c == w)):
                continue
            chosen.add((r, c))
        res = list(chosen)
        rng.shuffle(res)
        return res

    tests = [
        # 3 public samples
        {
            "input": fmt_grid_obs(3, 4, [(2, 2)]),
            "hidden": False,
            "expected": "4",
            "checkBrute": True,
        },
        {
            "input": fmt_grid_obs(3, 3, [(1, 2), (2, 1)]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_grid_obs(1, 5, []),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_grid_obs(1, 1, []),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid_obs(1, 1, [(1, 1)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_grid_obs(5, 5, [(1, 1), (3, 3)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_grid_obs(5, 5, [(5, 5), (2, 4)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_grid_obs(10, 10, [(r, 11 - r) for r in range(1, 11)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_grid_obs(12, 15, sample_obs(12, 15, 20)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_grid_obs(20, 20, sample_obs(20, 20, 40)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_grid_obs(100, 100, sample_obs(100, 100, 80)), "hidden": True})
    tests.append({"input": fmt_grid_obs(1000, 1000, sample_obs(1000, 1000, 150)), "hidden": True})
    tests.append({"input": fmt_grid_obs(100_000, 100_000, []), "hidden": True})
    tests.append({"input": fmt_grid_obs(100_000, 100_000, sample_obs(100_000, 100_000, 250)), "hidden": True})
    # Chain of obstacles along diagonal neighborhood
    diag_obs = [(i * 390 + 10, i * 390 + 11) for i in range(250)]
    rng.shuffle(diag_obs)
    tests.append({"input": fmt_grid_obs(100_000, 100_000, diag_obs), "hidden": True})
    # Dense cluster near start + end
    cluster_obs = sample_obs(30, 30, 125) + [(100_000 - r + 1, 100_000 - c + 1) for r, c in sample_obs(30, 30, 125)]
    tests.append({"input": fmt_grid_obs(100_000, 100_000, cluster_obs), "hidden": True})

    extra_stress = []
    for _ in range(25):
        h = rng.randint(2, 15)
        w = rng.randint(2, 15)
        m = rng.randint(0, min(20, h * w // 2))
        extra_stress.append(fmt_grid_obs(h, w, sample_obs(h, w, m, allow_ends=True)))

    statement = r"""Cho một lưới ô vuông kích thước $H \times W$ gồm $H$ hàng (đánh số từ $1$ đến $H$) và $W$ cột (đánh số từ $1$ đến $W$). Trên lưới có $M$ ô chướng ngại vật phân biệt nằm tại các tọa độ $(r_i, c_i)$.

Một robot xuất phát tại ô $(1, 1)$ và muốn đi tới ô $(H, W)$. Ở mỗi bước, robot chỉ có thể đi **xuống dưới** một ô (từ $(r, c)$ sang $(r + 1, c)$) hoặc đi **sang phải** một ô (từ $(r, c)$ sang $(r, c + 1)$), và không được đi vào bất kỳ ô chướng ngại vật nào.

Hãy đếm số đường đi hợp lệ từ $(1, 1)$ tới $(H, W)$ theo modulo $10^9 + 7$. Nếu ô $(1, 1)$ hoặc ô $(H, W)$ bị chặn bởi chướng ngại vật, đáp án là $0$.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $H, W, M$ ($1 \le H, W \le 10^5$, $0 \le M \le 250$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $r_i, c_i$ ($1 \le r_i \le H$, $1 \le c_i \le W$) là tọa độ của một ô chướng ngại vật.

### Kết quả
- In ra một số nguyên duy nhất là số đường đi hợp lệ modulo $10^9 + 7$.

### Ràng buộc
- $1 \le H, W \le 10^5$
- $0 \le M \le 250$
- $1 \le r_i \le H$, $1 \le c_i \le W$

### Subtasks
- **Subtask 1 (30% số điểm):** $H, W \le 1000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($3 \times 4$, tường tại $(2, 2)$): tổng số đường không có tường là $\binom{(3-1)+(4-1)}{3-1} = \binom{5}{2} = 10$. Số đường đi qua ô $(2, 2)$ là $\binom{2}{1} \times \binom{3}{1} = 6$. Vậy còn $10 - 6 = 4$ đường hợp lệ.
- Ví dụ 2 ($3 \times 3$, tường tại $(1, 2)$ và $(2, 1)$): mọi bước đi đầu tiên từ $(1, 1)$ đều bị chặn nên đáp án là $0$."""

    hints = r"""**Gợi ý 1 (Vì sao DP trên lưới $O(HW)$ bị TLE?):**
Kích thước $H, W$ lên tới $10^5$, nên không thể lập bảng DP kích thước $H \times W$. Tuy nhiên, số lượng chướng ngại vật $M \le 250$ rất nhỏ! Nếu không có vật cản nào giữa $(r_1, c_1)$ và $(r_2, c_2)$ (với $r_1 \le r_2, c_1 \le c_2$), số đường đi là:
$$\text{ways}((r_1, c_1) \to (r_2, c_2)) = \binom{(r_2 - r_1) + (c_2 - c_1)}{r_2 - r_1}$$

**Gợi ý 2 (Quy hoạch động trên tập các chướng ngại vật — tránh đếm trùng):**
Sắp xếp các ô chướng ngại vật theo thứ tự tăng dần của hàng $r$, nếu cùng hàng thì theo cột $c$, rồi thêm đích $(H, W)$ làm điểm thứ $M + 1$.
Gọi $dp[i]$ là số đường đi từ $(1, 1)$ tới điểm thứ $i$ mà **không đi qua bất kỳ chướng ngại vật $j < i$ nào trước đó**.

**Gợi ý 3 (Công thức chuyển trạng thái $O(M^2)$):**
Mọi đường đi từ $(1, 1)$ đến điểm $i$ mà chạm ít nhất một vật cản trước đó đều có **vật cản đầu tiên** chạm phải là một điểm $j < i$ duy nhất! Do đó:
$$dp[i] = \text{ways}((1,1) \to i) - \sum_{j < i,\; r_j \le r_i,\; c_j \le c_i} dp[j] \cdot \text{ways}(j \to i) \pmod{10^9+7}$$
Đáp án chính là $dp[M + 1]$. Tiền xử lý giai thừa tới $H + W \le 2 \cdot 10^5$, tổng độ phức tạp là $O(H + W + M^2)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;

long long modPow(long long base, long long exp) {
    long long res = 1;
    base %= MOD;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % MOD;
        base = (base * base) % MOD;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int h, w, m;
    if (!(cin >> h >> w >> m)) return 0;

    vector<pair<int, int>> obs;
    obs.reserve(m);
    bool blockedEnd = false;
    for (int i = 0; i < m; ++i) {
        int r, c;
        cin >> r >> c;
        if ((r == 1 && c == 1) || (r == h && c == w)) {
            blockedEnd = true;
        }
        obs.emplace_back(r, c);
    }

    if (blockedEnd) {
        cout << 0 << '\n';
        return 0;
    }

    sort(obs.begin(), obs.end());
    obs.erase(unique(obs.begin(), obs.end()), obs.end());
    obs.emplace_back(h, w);
    int nPts = (int)obs.size();

    int maxF = h + w;
    vector<long long> fact(maxF + 1), invFact(maxF + 1);
    fact[0] = 1;
    for (int i = 1; i <= maxF; ++i) {
        fact[i] = fact[i - 1] * i % MOD;
    }
    invFact[maxF] = modPow(fact[maxF], MOD - 2);
    for (int i = maxF; i >= 1; --i) {
        invFact[i - 1] = invFact[i] * i % MOD;
    }

    auto ways = [&](int r1, int c1, int r2, int c2) -> long long {
        int dr = r2 - r1;
        int dc = c2 - c1;
        if (dr < 0 || dc < 0) return 0LL;
        return fact[dr + dc] * invFact[dr] % MOD * invFact[dc] % MOD;
    };

    vector<long long> dp(nPts, 0);
    for (int i = 0; i < nPts; ++i) {
        int ri = obs[i].first, ci = obs[i].second;
        long long cur = ways(1, 1, ri, ci);
        for (int j = 0; j < i; ++j) {
            int rj = obs[j].first, cj = obs[j].second;
            if (rj <= ri && cj <= ci) {
                cur = (cur - dp[j] * ways(rj, cj, ri, ci) % MOD + MOD) % MOD;
            }
        }
        dp[i] = cur;
    }

    cout << dp[nPts - 1] << '\n';
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    h = int(data[0])
    w = int(data[1])
    m = int(data[2])

    obs_set = set()
    idx = 3
    for _ in range(m):
        r = int(data[idx])
        c = int(data[idx + 1])
        idx += 2
        if (r == 1 and c == 1) or (r == h and c == w):
            sys.stdout.write("0\n")
            return
        obs_set.add((r, c))

    pts = sorted(obs_set)
    pts.append((h, w))
    n_pts = len(pts)

    max_f = h + w
    fact = [1] * (max_f + 1)
    for i in range(1, max_f + 1):
        fact[i] = fact[i - 1] * i % MOD

    inv_fact = [1] * (max_f + 1)
    inv_fact[max_f] = pow(fact[max_f], MOD - 2, MOD)
    for i in range(max_f, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    def ways(r1: int, c1: int, r2: int, c2: int) -> int:
        dr = r2 - r1
        dc = c2 - c1
        if dr < 0 or dc < 0:
            return 0
        return fact[dr + dc] * inv_fact[dr] % MOD * inv_fact[dc] % MOD

    dp = [0] * n_pts
    for i, (ri, ci) in enumerate(pts):
        cur = ways(1, 1, ri, ci)
        for j in range(i):
            rj, cj = pts[j]
            if rj <= ri and cj <= ci:
                cur = (cur - dp[j] * ways(rj, cj, ri, ci)) % MOD
        dp[i] = cur

    sys.stdout.write(f"{dp[-1]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-grid-paths-obstacles-comb",
        "title": "Đếm đường đi trên lưới có chướng ngại vật",
        "shortDescription": "Đếm số đường đi từ (1,1) đến (H,W) trên lưới lớn có M ô vật cản bằng Tổ hợp kết hợp DP O(M^2).",
        "difficulty": "hard",
        "estimatedTime": 45,
        "skillId": "algo.combinatorics_mod",
        "tags": ["tổ hợp", "quy hoạch động", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(H + W + M^2).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp12-graph-paths-length-k-matrix
# ============================================================================

def brute_p09(inp: str) -> str:
    """Independent step-by-step DP oracle for small K <= 25."""
    toks = list(map(int, inp.split()))
    n, m, k = toks[0], toks[1], toks[2]
    adj = [[0] * n for _ in range(n)]
    idx = 3
    for _ in range(m):
        u, v = toks[idx] - 1, toks[idx + 1] - 1
        idx += 2
        adj[u][v] += 1
    dp = [0] * n
    dp[0] = 1
    for _ in range(k):
        ndp = [0] * n
        for u in range(n):
            if dp[u] == 0:
                continue
            for v in range(n):
                if adj[u][v]:
                    ndp[v] = (ndp[v] + dp[u] * adj[u][v]) % MOD
        dp = ndp
    return str(dp[n - 1])


def fmt_dir_graph_k(n: int, k: int, edges: List[Tuple[int, int]]) -> str:
    lines = [f"{n} {len(edges)} {k}"]
    lines.extend(f"{u} {v}" for u, v in edges)
    return "\n".join(lines)


def build_p09() -> dict:
    rng = random.Random(1209)

    tests = [
        # 3 public samples
        {
            "input": fmt_dir_graph_k(3, 3, [(1, 2), (2, 3), (1, 3), (3, 1)]),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_dir_graph_k(2, 4, [(1, 1), (1, 2), (2, 2)]),
            "hidden": False,
            "expected": "4",
            "checkBrute": True,
        },
        {
            "input": fmt_dir_graph_k(1, 5, [(1, 1), (1, 1)]),
            "hidden": False,
            "expected": "32",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_dir_graph_k(5, 1, []),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_dir_graph_k(1, 10**18, []),
            "hidden": True,
            "expected": "0",
        },
        {
            "input": fmt_dir_graph_k(1, 10**18, [(1, 1), (1, 1), (1, 1)]),
            "hidden": True,
            "expected": str(pow(3, 10**18, MOD)),
        },
        {
            "input": fmt_dir_graph_k(4, 1, [(1, 4), (1, 4), (1, 2), (2, 4)]),
            "hidden": True,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": fmt_dir_graph_k(4, 3, [(1, 2), (2, 3), (3, 4), (4, 1)]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_dir_graph_k(8, 12, [(rng.randint(1, 8), rng.randint(1, 8)) for _ in range(25)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_dir_graph_k(12, 20, [(rng.randint(1, 12), rng.randint(1, 12)) for _ in range(45)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_dir_graph_k(20, 10**6, [(rng.randint(1, 20), rng.randint(1, 20)) for _ in range(120)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_dir_graph_k(30, 10**18, [(rng.randint(1, 30), rng.randint(1, 30)) for _ in range(500)]),
        "hidden": True,
    })
    # Test 13: complete directed graph K_30 with self loops + multi-edges, K = 10^18 - 1
    e13 = [(u, v) for u in range(1, 31) for v in range(1, 31)][:500]
    tests.append({"input": fmt_dir_graph_k(30, 10**18 - 1, e13), "hidden": True})
    # Test 14: cycle of 30 + shortcuts
    e14 = [(i, (i % 30) + 1) for i in range(1, 31)] + [(i, ((i + 4) % 30) + 1) for i in range(1, 31)] + [(1, 1)] * 5
    tests.append({"input": fmt_dir_graph_k(30, 999_999_999_999_999_999, e14), "hidden": True})
    # Test 15: disconnected 1 and N
    e15 = [(rng.randint(1, 15), rng.randint(1, 15)) for _ in range(250)] + [(rng.randint(16, 30), rng.randint(16, 30)) for _ in range(250)]
    tests.append({"input": fmt_dir_graph_k(30, 10**18, e15), "hidden": True, "expected": "0"})
    # Test 16: N=30 dense random with many multi-edges
    e16 = [(rng.randint(1, 30), rng.randint(1, 30)) for _ in range(500)]
    tests.append({"input": fmt_dir_graph_k(30, (1 << 59) - 1, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 10)
        m = rng.randint(0, 25)
        k = rng.randint(1, 18)
        edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_dir_graph_k(n, k, edges))

    statement = r"""Cho đồ thị có hướng gồm $N$ đỉnh (đánh số từ $1$ đến $N$) và $M$ cung có hướng $(u, v)$. Đồ thị **có thể chứa đa cung** (nhiều cung cùng chiều nối cùng một cặp đỉnh) và **khuyên** (cung nối đỉnh $u$ với chính nó).

Hãy đếm số đường đi có hướng (có thể đi lặp lại đỉnh và cung) xuất phát từ đỉnh $1$, kết thúc tại đỉnh $N$, và đi qua **đúng $K$ cung**, theo modulo $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, M, K$ ($1 \le N \le 30$, $0 \le M \le 500$, $1 \le K \le 10^{18}$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cung có hướng từ $u$ đến $v$.

### Kết quả
- In ra một số nguyên duy nhất là số lượng đường đi thỏa mãn modulo $10^9 + 7$.

### Ràng buộc
- $1 \le N \le 30$
- $0 \le M \le 500$
- $1 \le K \le 10^{18}$
- $1 \le u, v \le N$

### Subtasks
- **Subtask 1 (30% số điểm):** $K \le 10^4$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($N=3, K=3$): đường đi độ dài $3$ duy nhất từ $1$ tới $3$ là $1 \to 3 \to 1 \to 3$.
- Ví dụ 2 ($N=2, K=4$): với các cung $(1,1), (1,2), (2,2)$, ta có thể tự chọn đúng $1$ trong $4$ bước để chuyển từ đỉnh $1$ sang đỉnh $2$ (các bước còn lại đi khuyên), nên có $4$ đường đi.
- Ví dụ 3 ($N=1, K=5$): có $2$ khuyên tại đỉnh $1$, nên ở mỗi bước trong $5$ bước có $2$ lựa chọn $\implies 2^5 = 32$ đường đi."""

    hints = r"""**Gợi ý 1 (Ma trận kề và phép nhân ma trận):**
Xây dựng ma trận kề $A$ kích thước $N \times N$, trong đó $A[u][v]$ là **số lượng cung có hướng** từ $u$ đến $v$ (với đa cung thì cộng thêm $1$ vào $A[u][v]$).
Khi nhân $A$ với chính nó:
$$(A^2)[u][v] = \sum_{x=1}^{N} A[u][x] \cdot A[x][v]$$
Đây chính là số đường đi độ dài đúng $2$ cung từ $u$ đến $v$!

**Gợi ý 2 (Quy nạp lên độ dài $K$):**
Bằng quy nạp, phần tử $(A^K)[u][v]$ chính là số đường đi có hướng độ dài đúng $K$ cung từ $u$ đến $v$.
Như vậy, đáp án cần tìm là $(A^K)[1][N] \bmod (10^9 + 7)$ (hoặc chỉ số `[0][N-1]` nếu đánh số từ $0$).

**Gợi ý 3 (Lũy thừa nhị phân & tràn số):**
Dùng lũy thừa nhị phân để tính $A^K \bmod (10^9+7)$ trong $O(N^3 \log K)$ (khoảng $30^3 \times 60 \approx 1.6 \times 10^6$ phép toán).
Lưu ý trong C++: một tổng tích $N \cdot (10^9)^2 \approx 3 \cdot 10^{19}$ vượt quá giới hạn `long long`, nên hãy lấy `% MOD` sau mỗi phép cộng trong vòng lặp nhân ma trận."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;

using Mat = vector<vector<long long>>;

Mat mulMat(const Mat& a, const Mat& b, int n) {
    Mat c(n, vector<long long>(n, 0));
    for (int i = 0; i < n; ++i) {
        for (int k = 0; k < n; ++k) {
            if (a[i][k] == 0) continue;
            long long aik = a[i][k];
            for (int j = 0; j < n; ++j) {
                c[i][j] = (c[i][j] + aik * b[k][j]) % MOD;
            }
        }
    }
    return c;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    long long k;
    if (!(cin >> n >> m >> k)) return 0;

    Mat base(n, vector<long long>(n, 0));
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        base[u - 1][v - 1] = (base[u - 1][v - 1] + 1) % MOD;
    }

    Mat res(n, vector<long long>(n, 0));
    for (int i = 0; i < n; ++i) res[i][i] = 1;

    while (k > 0) {
        if (k & 1LL) res = mulMat(res, base, n);
        base = mulMat(base, base, n);
        k >>= 1LL;
    }

    cout << res[0][n - 1] << '\n';
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def mul_mat(a: list[list[int]], b: list[list[int]], n: int) -> list[list[int]]:
    c = [[0] * n for _ in range(n)]
    for i in range(n):
        ai = a[i]
        ci = c[i]
        for k in range(n):
            aik = ai[k]
            if aik:
                bk = b[k]
                for j in range(n):
                    ci[j] += aik * bk[j]
        for j in range(n):
            ci[j] %= MOD
    return c


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    k = int(data[2])

    base = [[0] * n for _ in range(n)]
    idx = 3
    for _ in range(m):
        u = int(data[idx]) - 1
        v = int(data[idx + 1]) - 1
        idx += 2
        base[u][v] += 1

    for i in range(n):
        for j in range(n):
            base[i][j] %= MOD

    res = [[0] * n for _ in range(n)]
    for i in range(n):
        res[i][i] = 1

    while k > 0:
        if k & 1:
            res = mul_mat(res, base, n)
        base = mul_mat(base, base, n)
        k >>= 1

    sys.stdout.write(f"{res[0][n - 1]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-graph-paths-length-k-matrix",
        "title": "Đếm đường đi độ dài K trên đồ thị có hướng",
        "shortDescription": "Đếm số đường đi có hướng độ dài đúng K cạnh từ 1 đến N bằng lũy thừa ma trận kề A^K.",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.matrix_exponentiation",
        "tags": ["nhân ma trận", "đồ thị", "modulo", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N^3 log K).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp12-bounded-stars-bars-ie
# ============================================================================

def brute_p10(inp: str) -> str:
    """Independent DP oracle for small K, S."""
    toks = list(map(int, inp.split()))
    k, s = toks[0], toks[1]
    u = toks[2 : 2 + k]
    dp = [0] * (s + 1)
    dp[0] = 1
    for ui in u:
        ndp = [0] * (s + 1)
        pref = [0] * (s + 2)
        for j in range(s + 1):
            pref[j + 1] = (pref[j] + dp[j]) % MOD
        for j in range(s + 1):
            lo = max(0, j - ui)
            ndp[j] = (pref[j + 1] - pref[lo]) % MOD
        dp = ndp
    return str(dp[s])


def fmt_bounded(s: int, u: List[int]) -> str:
    return f"{len(u)} {s}\n" + " ".join(map(str, u))


def build_p10() -> dict:
    rng = random.Random(1210)

    tests = [
        # 3 public samples
        {
            "input": fmt_bounded(5, [2, 2, 2]),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        {
            "input": fmt_bounded(7, [2, 2, 2]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_bounded(4, [3, 5]),
            "hidden": False,
            "expected": "4",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_bounded(0, [0, 0, 0, 0]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_bounded(1, [0, 0, 0]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_bounded(100_000, [100_000]),
            "hidden": True,
            "expected": "1",
        },
        {
            "input": fmt_bounded(100_001, [100_000]),
            "hidden": True,
            "expected": "0",
        },
        {
            "input": fmt_bounded(200_000, [25_000] * 8),
            "hidden": True,
            "expected": "1",
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_bounded(60, [rng.randint(0, 20) for _ in range(8)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_bounded(120, [rng.randint(5, 30) for _ in range(10)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_bounded(300, [rng.randint(0, 60) for _ in range(14)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_bounded(200_000, [100_000] * 16),
        "hidden": True,
    })
    tests.append({
        "input": fmt_bounded(150_000, [rng.randint(5000, 30_000) for _ in range(16)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_bounded(200_000, [rng.randint(10_000, 100_000) for _ in range(16)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_bounded(50_000, [rng.randint(0, 10_000) for _ in range(16)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_bounded(180_000, [rng.randint(1, 50_000) for _ in range(16)]),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        k = rng.randint(1, 10)
        u = [rng.randint(0, 25) for _ in range(k)]
        s = rng.randint(0, sum(u) + 5)
        extra_stress.append(fmt_bounded(s, u))

    statement = r"""Cho $K$ biến nguyên $x_1, x_2, \dots, x_K$ và các giới hạn trên $U_1, U_2, \dots, U_K$ cùng tổng mục tiêu $S$.

Hãy đếm số nghiệm nguyên $(x_1, x_2, \dots, x_K)$ thỏa mãn đồng thời:
$$x_1 + x_2 + \dots + x_K = S \quad \text{và} \quad 0 \le x_i \le U_i \; (\forall i = 1, \dots, K)$$

In ra kết quả theo modulo $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $K$ và $S$ ($1 \le K \le 16$, $0 \le S \le 2 \cdot 10^5$).
- Dòng thứ hai chứa $K$ số nguyên $U_1, U_2, \dots, U_K$ ($0 \le U_i \le 10^5$).

### Kết quả
- In ra một số nguyên duy nhất là số nghiệm thỏa mãn modulo $10^9 + 7$.

### Ràng buộc
- $1 \le K \le 16$
- $0 \le S \le 2 \cdot 10^5$
- $0 \le U_i \le 10^5$

### Subtasks
- **Subtask 1 (30% số điểm):** $K \le 10$, $S \le 500$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($K=3, S=5, U=[2,2,2]$): các nghiệm hợp lệ là $(2,2,1), (2,1,2), (1,2,2)$ — tổng cộng $3$ nghiệm.
- Ví dụ 2 ($K=3, S=7, U=[2,2,2]$): tổng lớn nhất có thể là $2+2+2=6 < 7$, nên có $0$ nghiệm.
- Ví dụ 3 ($K=2, S=4, U=[3,5]$): các nghiệm hợp lệ là $(0,4), (1,3), (2,2), (3,1)$ — tổng cộng $4$ nghiệm."""

    hints = r"""**Gợi ý 1 (Chuyển giới hạn trên thành điều kiện vi phạm):**
Với mỗi $i \in \{1, \dots, K\}$, gọi $B_i$ là tập các nghiệm nguyên không âm ($x_j \ge 0$) của $\sum x_j = S$ mà **vi phạm** điều kiện $x_i \le U_i$, tức là $x_i \ge U_i + 1$.
Số nghiệm hợp lệ chính là tổng số nghiệm không âm trừ đi hợp của các tập vi phạm: $\left|\Omega \setminus \bigcup_{i=1}^K B_i\right|$.

**Gợi ý 2 (Bao hàm – Loại trừ trên các tập con vi phạm $T \subseteq \{1..K\}$):**
Nếu bắt buộc mọi biến $i \in T$ đều phải vi phạm ($x_i \ge U_i + 1$), đặt $W(T) = \sum_{i \in T} (U_i + 1)$ và đổi biến $y_i = x_i - (U_i + 1) \ge 0$ (với $i \in T$), $y_i = x_i \ge 0$ (với $i \notin T$).
Khi đó $\sum y_i = S - W(T)$, nên số nghiệm thỏa tập vi phạm $T$ là:
$$g(T) = \begin{cases} 0 & \text{nếu } S < W(T) \\ \binom{S - W(T) + K - 1}{K - 1} & \text{nếu } S \ge W(T) \end{cases}$$

**Gợi ý 3 (Tổng hợp trong $O(S + K + 2^K)$):**
Theo nguyên lý Bao hàm–Loại trừ:
$$\text{Đáp án} = \sum_{T \subseteq \{1, \dots, K\}} (-1)^{|T|} \, g(T) \pmod{10^9 + 7}$$
Vì $K \le 16$, số tập con chỉ tối đa $2^{16} = 65\,536$. Tiền xử lý giai thừa tới $S + K - 1 \le 200\,015$ để tính $\binom{n}{k}$ trong $O(1)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;

long long modPow(long long base, long long exp) {
    long long res = 1;
    base %= MOD;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % MOD;
        base = (base * base) % MOD;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int k, s;
    if (!(cin >> k >> s)) return 0;

    vector<int> u(k);
    for (int i = 0; i < k; ++i) {
        cin >> u[i];
    }

    int maxF = s + k;
    vector<long long> fact(maxF + 1), invFact(maxF + 1);
    fact[0] = 1;
    for (int i = 1; i <= maxF; ++i) {
        fact[i] = fact[i - 1] * i % MOD;
    }
    invFact[maxF] = modPow(fact[maxF], MOD - 2);
    for (int i = maxF; i >= 1; --i) {
        invFact[i - 1] = invFact[i] * i % MOD;
    }

    auto nCr = [&](int n, int r) -> long long {
        if (r < 0 || r > n) return 0LL;
        return fact[n] * invFact[r] % MOD * invFact[n - r] % MOD;
    };

    long long ans = 0;
    auto dfs = [&](auto& self, int idx, int rem, int sign) -> void {
        if (rem < 0) return;
        if (idx == k) {
            ans = (ans + sign * nCr(rem + k - 1, k - 1) + MOD) % MOD;
            return;
        }
        self(self, idx + 1, rem, sign);
        self(self, idx + 1, rem - (u[idx] + 1), -sign);
    };

    dfs(dfs, 0, s, 1);
    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys

MOD = 1_000_000_007


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    k = int(data[0])
    s = int(data[1])
    u = [int(data[2 + i]) for i in range(k)]

    max_f = s + k
    fact = [1] * (max_f + 1)
    for i in range(1, max_f + 1):
        fact[i] = fact[i - 1] * i % MOD

    inv_fact = [1] * (max_f + 1)
    inv_fact[max_f] = pow(fact[max_f], MOD - 2, MOD)
    for i in range(max_f, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    inv_k_minus_1 = inv_fact[k - 1]
    ans = 0

    def dfs(idx: int, rem: int, sign: int) -> None:
        nonlocal ans
        if rem < 0:
            return
        if idx == k:
            ways = fact[rem + k - 1] * inv_k_minus_1 % MOD * inv_fact[rem] % MOD
            ans = (ans + sign * ways) % MOD
            return
        dfs(idx + 1, rem, sign)
        dfs(idx + 1, rem - (u[idx] + 1), -sign)

    dfs(0, s, 1)
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp12-bounded-stars-bars-ie",
        "title": "Chia kẹo có cận trên (Stars and Bars + Bao hàm–Loại trừ)",
        "shortDescription": "Đếm số nghiệm nguyên không âm có giới hạn trên x_i <= U_i bằng Stars and Bars kết hợp Bao hàm–Loại trừ.",
        "difficulty": "hard",
        "estimatedTime": 45,
        "skillId": "algo.inclusion_exclusion",
        "tags": ["bao hàm loại trừ", "tổ hợp", "bitmask", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(S + K + 2^K).",
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
        pack_id="12-combinatorics-matrix",
        title="Tầng 2–3: Tổ hợp Modulo, Bao hàm–Loại trừ & Nhân ma trận",
        tier="Tầng 2–3 — Toán tổ hợp",
        description=(
            "10 bài Toán tổ hợp & Nhân ma trận chuẩn CSES/VNOI: nCr Modulo, Stars and Bars, "
            "Hoán vị mất thứ tự & Catalan, Bao hàm–Loại trừ, Lũy thừa ma trận và Đếm đường đi lưới có vật cản."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
