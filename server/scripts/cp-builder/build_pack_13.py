"""
Builder & automated verifier for CodeClass CP Pack 13:
Tầng 3: Quy hoạch động nâng cao (AtCoder DP, Digit DP & Deque DP)

Generates and verifies 10 original Vietnamese competitive programming problems
(3 easy, 4 medium, 3 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path
from typing import List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Quy hoạch động nâng cao\n"
MOD = 1_000_000_007
SAFE_MAX_BYTES = 148_000


def assert_safe_size(inp: str, label: str) -> str:
    b = len(inp.encode("utf-8"))
    if b > SAFE_MAX_BYTES:
        raise ValueError(f"{label} exceeds {SAFE_MAX_BYTES} bytes ({b} bytes)")
    return inp


# ============================================================================
# 1. cp13-longest-palindromic-subseq
# ============================================================================

def brute_p01(inp: str) -> str:
    s = inp.strip()
    n = len(s)
    best = 1
    for mask in range(1, 1 << n):
        sub = [s[i] for i in range(n) if (mask >> i) & 1]
        if len(sub) > best and sub == sub[::-1]:
            best = len(sub)
    return str(best)


def build_p01() -> dict:
    rng = random.Random(1301)

    tests = [
        # 3 public samples
        {"input": "bbbab", "hidden": False, "expected": "4", "checkBrute": True},
        {"input": "cbbd", "hidden": False, "expected": "2", "checkBrute": True},
        {"input": "a", "hidden": False, "expected": "1", "checkBrute": True},
        # 5 corner cases
        {"input": "abcdefg", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "zzzzzzzzzz", "hidden": True, "expected": "10", "checkBrute": True},
        {"input": "abacaba", "hidden": True, "expected": "7", "checkBrute": True},
        {"input": "ab", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "racecarxyz", "hidden": True, "expected": "7", "checkBrute": True},
    ]

    # 8 medium -> large tests
    # 9: small random checked by brute
    tests.append({
        "input": "".join(rng.choice("abcd") for _ in range(16)),
        "hidden": True,
        "checkBrute": True,
    })
    # 10: small 2-char random checked by brute
    tests.append({
        "input": "".join(rng.choice("ab") for _ in range(17)),
        "hidden": True,
        "checkBrute": True,
    })
    # 11: N=100 random 4-char
    tests.append({
        "input": "".join(rng.choice("abcd") for _ in range(100)),
        "hidden": True,
    })
    # 12: N=250 random 26-char
    tests.append({
        "input": "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(250)),
        "hidden": True,
    })
    # 13: N=500 periodic palindrome-friendly
    tests.append({
        "input": ("abcde" * 100),
        "hidden": True,
    })
    # 14: N=700 all identical
    tests.append({
        "input": "k" * 700,
        "hidden": True,
        "expected": "700",
    })
    # 15: N=700 random 26-char
    tests.append({
        "input": "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(700)),
        "hidden": True,
    })
    # 16: N=700 random 2-char
    tests.append({
        "input": "".join(rng.choice("xy") for _ in range(700)),
        "hidden": True,
    })

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 15)
        alpha = rng.choice(["ab", "abc", "abcdef"])
        extra_stress.append("".join(rng.choice(alpha) for _ in range(n)))

    statement = r"""Trong phòng thí nghiệm mã hóa cổ điển, các nhà ngôn ngữ học tìm thấy một chuỗi ký tự $S$ gồm $N$ chữ cái Latinh in thường. Một **xâu con không nhất thiết liên tiếp** (subsequence) của $S$ thu được bằng cách xóa đi một số (có thể là $0$) ký tự bất kỳ mà vẫn giữ nguyên thứ tự các ký tự còn lại.

Một xâu được gọi là **đối xứng** (palindrome) nếu đọc từ trái sang phải giống hệt khi đọc từ phải sang trái. Hãy tìm **độ dài lớn nhất** của một xâu con không nhất thiết liên tiếp đối xứng nằm trong $S$.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ chỉ gồm các chữ cái thường (`'a'`–`'z'`), với $1 \le |S| \le 700$.

### Kết quả
- In ra một số nguyên duy nhất là độ dài của xâu con đối xứng dài nhất của $S$.

### Ràng buộc
- $1 \le |S| \le 700$
- $S$ chỉ gồm các ký tự `'a'` đến `'z'`.

### Subtasks
- **Subtask 1 (30% số test):** $|S| \le 18$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với $S = \text{"bbbab"}$, xâu con đối xứng dài nhất là $\text{"bbbb"}$ có độ dài $4$.
- Với $S = \text{"cbbd"}$, xâu con đối xứng dài nhất là $\text{"bb"}$ có độ dài $2$.
- Với $S = \text{"a"}$, xâu có độ dài $1$ luôn tự đối xứng nên đáp án là $1$."""

    hints = r"""**Gợi ý 1 (Nhận diện bài toán con):**
Gọi $dp[l][r]$ là độ dài xâu con đối xứng dài nhất nằm trong đoạn chỉ số $[l, r]$ của xâu $S$. Xâu có độ dài $1$ ($l = r$) luôn có $dp[l][l] = 1$.

**Gợi ý 2 (Công thức chuyển trạng thái):**
Khi xét đoạn $[l, r]$ ($l < r$):
- Nếu $S[l] = S[r]$, ta có thể ghép hai đầu mút này vào hai bên của xâu con đối xứng tốt nhất trong $[l+1, r-1]$: $dp[l][r] = dp[l+1][r-1] + 2$ (với quy ước $dp[l+1][r-1] = 0$ khi $l+1 > r-1$).
- Ngược lại ($S[l] \ne S[r]$), ta bỏ một trong hai đầu mút: $dp[l][r] = \max(dp[l+1][r], dp[l][r-1])$.

**Gợi ý 3 (Tối ưu bộ nhớ $O(N)$):**
Duyệt $l$ giảm dần từ $N-1$ về $0$ và $r$ tăng dần từ $l+1$ đến $N-1$. Vì hàng $l$ chỉ phụ thuộc vào hàng $l$ (bên trái $r-1$) và hàng $l+1$ (tại $r$ và $r-1$), ta chỉ cần một mảng 1 chiều `dp` kích thước $N$ cùng một biến phụ `prev` lưu $dp[l+1][r-1]$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    int n = static_cast<int>(s.size());

    vector<int> dp(n, 0);
    for (int i = n - 1; i >= 0; --i) {
        dp[i] = 1;
        int prev = 0;
        for (int j = i + 1; j < n; ++j) {
            int tmp = dp[j];
            if (s[i] == s[j]) {
                dp[j] = prev + 2;
            } else {
                dp[j] = max(dp[j], dp[j - 1]);
            }
            prev = tmp;
        }
    }

    cout << dp[n - 1] << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)
    dp = [0] * n

    for i in range(n - 1, -1, -1):
        dp[i] = 1
        prev = 0
        si = s[i]
        for j in range(i + 1, n):
            tmp = dp[j]
            if si == s[j]:
                dp[j] = prev + 2
            elif dp[j - 1] > dp[j]:
                dp[j] = dp[j - 1]
            prev = tmp

    print(dp[n - 1])


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-longest-palindromic-subseq",
        "title": "Xâu con đối xứng dài nhất (LPS)",
        "shortDescription": "Tìm độ dài xâu con không nhất thiết liên tiếp đối xứng dài nhất của xâu S bằng quy hoạch động O(N^2).",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.dp_lis_lcs",
        "tags": ["quy hoạch động", "xâu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N^2) thời gian, O(N) hoặc O(N^2) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp13-stock-k-transactions
# ============================================================================

def fmt_p02(k: int, prices: List[int]) -> str:
    return f"{len(prices)} {k}\n" + " ".join(map(str, prices))


def brute_p02(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, k = toks[0], toks[1]
    p = toks[2:]

    memo = {}

    def dfs(day: int, holding: int, tx_left: int) -> int:
        if day == n or (tx_left == 0 and holding == 0):
            return 0
        key = (day, holding, tx_left)
        if key in memo:
            return memo[key]
        res = dfs(day + 1, holding, tx_left)
        if holding:
            cand = p[day] + dfs(day + 1, 0, tx_left)
            if cand > res:
                res = cand
        elif tx_left > 0:
            cand = -p[day] + dfs(day + 1, 1, tx_left - 1)
            if cand > res:
                res = cand
        memo[key] = res
        return res

    return str(dfs(0, 0, k))


def build_p02() -> dict:
    rng = random.Random(1302)

    tests = [
        # 3 public samples
        {"input": fmt_p02(2, [2, 4, 1]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_p02(2, [3, 2, 6, 5, 0, 3]), "hidden": False, "expected": "7", "checkBrute": True},
        {"input": fmt_p02(1, [7, 5, 3, 1]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p02(0, [1, 5, 2, 10]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p02(5, [42]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p02(3, [5, 5, 5, 5, 5]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p02(2, [0, 10**9, 0, 10**9]), "hidden": True, "expected": str(2 * 10**9), "checkBrute": True},
        {"input": fmt_p02(1, [10**9, 1, 10**9, 2]), "hidden": True, "expected": str(10**9 - 1), "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p02(3, [rng.randint(0, 100) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p02(4, [rng.randint(0, 10**9) for _ in range(18)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p02(5, [rng.randint(0, 10**5) for _ in range(200)]), "hidden": True})
    tests.append({"input": fmt_p02(80, [rng.randint(0, 10**9) for _ in range(120)]), "hidden": True})  # 2*K >= N branch
    tests.append({"input": fmt_p02(1, [rng.randint(0, 10**9) for _ in range(4000)]), "hidden": True})
    tests.append({"input": fmt_p02(80, [i * 250_000 for i in range(4000)]), "hidden": True})  # strictly increasing
    tests.append({"input": fmt_p02(80, [10**9 - i * 100_000 for i in range(4000)]), "hidden": True})  # strictly decreasing
    # Max N=4000, K=80 random 10^9 (4000 * 11 ~ 44 KB)
    tests.append({"input": assert_safe_size(fmt_p02(80, [rng.randint(0, 10**9) for _ in range(4000)]), "p02_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 14)
        k = rng.randint(0, 6)
        prices = [rng.randint(0, 1000) for _ in range(n)]
        extra_stress.append(fmt_p02(k, prices))

    statement = r"""Một nhà đầu tư theo dõi giá một mã cổ phiếu trong $N$ ngày liên tiếp. Vào ngày thứ $i$ ($1 \le i \le N$), giá mua hoặc bán một cổ phiếu là $p_i$.

Nhà đầu tư được thực hiện **tối đa $K$ giao dịch** (mỗi giao dịch gồm một lần mua và một lần bán sau đó). Tại bất kỳ thời điểm nào, nhà đầu tư chỉ được giữ **tối đa $1$ cổ phiếu** (tức là phải bán cổ phiếu đang giữ trước khi mua lại lần tiếp theo).

Hãy tính tổng lợi nhuận lớn nhất có thể đạt được. (Nếu không có giao dịch nào có lãi, lợi nhuận bằng $0$.)

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, K$ ($1 \le N \le 4000$, $0 \le K \le 80$).
- Dòng thứ hai chứa $N$ số nguyên $p_1, p_2, \dots, p_N$ ($0 \le p_i \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng lợi nhuận lớn nhất có thể đạt được.

### Ràng buộc
- $1 \le N \le 4000$
- $0 \le K \le 80$
- $0 \le p_i \le 10^9$

### Subtasks
- **Subtask 1 (25% số test):** $N \le 20$.
- **Subtask 2 (75% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($N=3, K=2, p=[2, 4, 1]$): Mua ngày $1$ giá $2$, bán ngày $2$ giá $4$ được lợi nhuận $4 - 2 = 2$.
- Ví dụ 2 ($N=6, K=2, p=[3, 2, 6, 5, 0, 3]$): Mua ngày $2$ giá $2$ bán ngày $3$ giá $6$ (lãi $4$), mua ngày $5$ giá $0$ bán ngày $6$ giá $3$ (lãi $3$). Tổng lãi $4 + 3 = 7$.
- Ví dụ 3 ($N=4, K=1, p=[7, 5, 3, 1]$): Giá giảm dần nên không mua bán gì, lợi nhuận bằng $0$."""

    hints = r"""**Gợi ý 1 (Xác định trạng thái):**
Ở mỗi ngày, trạng thái của nhà đầu tư chỉ phụ thuộc vào hai đại lượng: đã thực hiện bao nhiêu giao dịch $t \in [0, K]$, và hiện tại có đang giữ cổ phiếu hay không (`hold` / `cash`).

**Gợi ý 2 (Chuyển trạng thái $O(NK)$):**
Gọi `cash[t]` là lợi nhuận tối đa khi đang không giữ cổ phiếu sau tối đa $t$ giao dịch hoàn chỉnh, và `hold[t]` là lợi nhuận tối đa khi đang giữ cổ phiếu thuộc giao dịch thứ $t$ ($1 \le t \le K$).
Khi duyệt qua ngày có giá $p$:
- `cash[t] = max(cash[t], hold[t] + p)` (bán cổ phiếu thứ $t$)
- `hold[t] = max(hold[t], cash[t - 1] - p)` (mua cổ phiếu thứ $t$)

**Gợi ý 3 (Lưu ý kiểu số & trường hợp biên):**
- Nếu $K = 0$ hoặc $N \le 1$, đáp án ngay lập tức là $0$.
- Lợi nhuận tối đa có thể lên tới $K \cdot 10^9 \approx 8 \times 10^{10}$, vượt giới hạn 32-bit `int`. Trong C++, nhớ dùng `long long` và khởi tạo `hold` bằng $-\infty$ đủ nhỏ (ví dụ `-4e18`).
- Khi $2K \ge N$, ta có thể thu mọi chênh lệch dương giữa hai ngày liên tiếp: $\sum \max(0, p_i - p_{i-1})$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> p(n);
    for (int i = 0; i < n; ++i) cin >> p[i];

    if (k == 0 || n <= 1) {
        cout << 0 << '\n';
        return 0;
    }

    if (2 * k >= n) {
        long long ans = 0;
        for (int i = 1; i < n; ++i) {
            if (p[i] > p[i - 1]) ans += p[i] - p[i - 1];
        }
        cout << ans << '\n';
        return 0;
    }

    const long long NEG_INF = -(1LL << 60);
    vector<long long> cash(k + 1, 0), hold(k + 1, NEG_INF);

    for (long long price : p) {
        for (int t = k; t >= 1; --t) {
            cash[t] = max(cash[t], hold[t] + price);
            hold[t] = max(hold[t], cash[t - 1] - price);
        }
    }

    cout << *max_element(cash.begin(), cash.end()) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    prices = [int(x) for x in data[2 : 2 + n]]

    if k == 0 or n <= 1:
        print(0)
        return

    if 2 * k >= n:
        ans = 0
        for i in range(1, n):
            diff = prices[i] - prices[i - 1]
            if diff > 0:
                ans += diff
        print(ans)
        return

    neg_inf = -(10**18)
    cash = [0] * (k + 1)
    hold = [neg_inf] * (k + 1)

    for price in prices:
        for t in range(k, 0, -1):
            sell = hold[t] + price
            if sell > cash[t]:
                cash[t] = sell
            buy = cash[t - 1] - price
            if buy > hold[t]:
                hold[t] = buy

    print(max(cash))


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-stock-k-transactions",
        "title": "Giao dịch cổ phiếu tối đa K lần",
        "shortDescription": "Tìm tổng lợi nhuận lớn nhất sau tối đa K lần mua-bán cổ phiếu không chồng lấn.",
        "difficulty": "easy",
        "estimatedTime": 25,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * min(N, K)) thời gian, O(K) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp13-vacation-three-choices
# ============================================================================

def fmt_p03(rows: List[Tuple[int, int, int]]) -> str:
    lines = [str(len(rows))]
    lines.extend(f"{a} {b} {c}" for a, b, c in rows)
    return "\n".join(lines)


def brute_p03(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    rows = [(toks[1 + 3 * i], toks[2 + 3 * i], toks[3 + 3 * i]) for i in range(n)]

    best = 0

    def dfs(day: int, prev_choice: int, cur: int) -> None:
        nonlocal best
        if day == n:
            if cur > best:
                best = cur
            return
        for c in range(3):
            if c != prev_choice:
                dfs(day + 1, c, cur + rows[day][c])

    dfs(0, -1, 0)
    return str(best)


def build_p03() -> dict:
    rng = random.Random(1303)

    tests = [
        # 3 public samples
        {"input": fmt_p03([(10, 40, 70), (20, 50, 80), (30, 60, 90)]), "hidden": False, "expected": "210", "checkBrute": True},
        {"input": fmt_p03([(100, 10, 1)]), "hidden": False, "expected": "100", "checkBrute": True},
        {"input": fmt_p03([(6, 7, 8), (8, 8, 3), (2, 5, 2), (7, 8, 6), (4, 6, 8), (2, 3, 4), (7, 5, 1)]), "hidden": False, "expected": "46", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p03([(0, 0, 0), (0, 0, 0), (0, 0, 0)]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p03([(10**9, 0, 0), (10**9, 1, 2), (10**9, 3, 4)]), "hidden": True, "expected": str(2 * 10**9 + 2), "checkBrute": True},
        {"input": fmt_p03([(5, 5, 5), (5, 5, 5), (5, 5, 5), (5, 5, 5)]), "hidden": True, "expected": "20", "checkBrute": True},
        {"input": fmt_p03([(1, 100, 1), (1, 100, 1), (1, 100, 1)]), "hidden": True, "expected": "201", "checkBrute": True},
        {"input": fmt_p03([(10**9, 10**9, 10**9)]), "hidden": True, "expected": str(10**9), "checkBrute": True},
    ]

    # 8 medium -> large tests (all <= 148 KB)
    tests.append({"input": fmt_p03([(rng.randint(0, 100), rng.randint(0, 100), rng.randint(0, 100)) for _ in range(12)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p03([(rng.randint(0, 10**9), rng.randint(0, 10**9), rng.randint(0, 10**9)) for _ in range(13)]), "hidden": True, "checkBrute": True})
    tests.append({"input": assert_safe_size(fmt_p03([(rng.randint(0, 10**4), rng.randint(0, 10**4), rng.randint(0, 10**4)) for _ in range(1000)]), "p03_t11"), "hidden": True})
    tests.append({"input": assert_safe_size(fmt_p03([(rng.randint(0, 10**9), rng.randint(0, 10**9), rng.randint(0, 10**9)) for _ in range(4200)]), "p03_t12"), "hidden": True})
    tests.append({"input": assert_safe_size(fmt_p03([(9, 8, 7) if i % 2 == 0 else (7, 8, 9) for i in range(20_000)]), "p03_t13"), "hidden": True})
    tests.append({"input": assert_safe_size(fmt_p03([(rng.randint(0, 9), rng.randint(0, 9), rng.randint(0, 9)) for _ in range(24_000)]), "p03_t14"), "hidden": True})
    # Note: N=30000 with 1-digit numbers: "a b c\n" is 6 bytes -> 30000*6 = 180000! Wait, 180000 > 148000, so use N=24000 for 3-digit lines or test 24000 vs 30000?
    # Wait: let's check if N=30000 can fit in 148KB: 30000 * 5 = 150000 > 148000 because each line has at least 3 chars + 2 spaces + 1 newline = 6 bytes!
    # So N=24000 (~144 KB) is the exact max N fitting within 148 KB, and N=4300 tests 10^9 overflow (~142 KB)!
    tests.append({"input": assert_safe_size(fmt_p03([(1, 9, 2) if i % 3 == 0 else ((9, 2, 1) if i % 3 == 1 else (2, 1, 9)) for i in range(24_000)]), "p03_t15"), "hidden": True})
    tests.append({"input": assert_safe_size(fmt_p03([(rng.randint(900_000_000, 1_000_000_000), rng.randint(900_000_000, 1_000_000_000), rng.randint(900_000_000, 1_000_000_000)) for _ in range(4300)]), "p03_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 11)
        rows = [(rng.randint(0, 50), rng.randint(0, 50), rng.randint(0, 50)) for _ in range(n)]
        extra_stress.append(fmt_p03(rows))

    statement = r"""Trong kỳ nghỉ kéo dài $N$ ngày, mỗi ngày thứ $i$ ($1 \le i \le N$) bạn có thể chọn đúng **một trong ba hoạt động**:
- Hoạt động A: nhận được $a_i$ điểm hài lòng.
- Hoạt động B: nhận được $b_i$ điểm hài lòng.
- Hoạt động C: nhận được $c_i$ điểm hài lòng.

Vì không muốn nhàm chán, **hai ngày liên tiếp không được chọn cùng một loại hoạt động** (ví dụ: nếu ngày $i$ chọn B thì ngày $i+1$ chỉ có thể chọn A hoặc C).

Hãy tính tổng điểm hài lòng lớn nhất có thể đạt được sau $N$ ngày.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 30\,000$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa ba số nguyên $a_i, b_i, c_i$ ($0 \le a_i, b_i, c_i \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng điểm hài lòng lớn nhất có thể đạt được.

### Ràng buộc
- $1 \le N \le 30\,000$
- $0 \le a_i, b_i, c_i \le 10^9$

### Subtasks
- **Subtask 1 (30% số test):** $N \le 15$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1: Ngày 1 chọn C ($70$), ngày 2 chọn B ($50$), ngày 3 chọn C ($90$), tổng $70 + 50 + 90 = 210$.
- Ví dụ 2: Chỉ có 1 ngày nên chọn hoạt động A để được $100$ điểm."""

    hints = r"""**Gợi ý 1 (Vì sao tham lam mỗi ngày thất bại?):**
Nếu luôn chọn hoạt động có điểm lớn nhất ở từng ngày, có thể hai ngày liên tiếp có cùng hoạt động tốt nhất, buộc ngày sau phải chọn phương án rất kém. Ta cần lưu kết quả tốt nhất kết thúc ở từng lựa chọn.

**Gợi ý 2 (Trạng thái quy hoạch động):**
Gọi $dp_A, dp_B, dp_C$ lần lượt là tổng điểm lớn nhất tính đến hết ngày hiện tại nếu ngày này chọn hoạt động A, B, hoặc C.
Khi sang ngày mới với $(a, b, c)$:
- $dp'_A = a + \max(dp_B, dp_C)$
- $dp'_B = b + \max(dp_A, dp_C)$
- $dp'_C = c + \max(dp_A, dp_B)$

**Gợi ý 3 (Bộ nhớ & kiểu dữ liệu):**
Chỉ cần 3 biến cho ngày trước và 3 biến cho ngày mới ($O(1)$ bộ nhớ). Tổng điểm có thể lên tới $3 \times 10^{13}$, nên dùng `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    long long dpA = 0, dpB = 0, dpC = 0;
    for (int i = 0; i < n; ++i) {
        long long a, b, c;
        cin >> a >> b >> c;
        long long nA = a + max(dpB, dpC);
        long long nB = b + max(dpA, dpC);
        long long nC = c + max(dpA, dpB);
        dpA = nA;
        dpB = nB;
        dpC = nC;
    }

    cout << max({dpA, dpB, dpC}) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    dp_a = dp_b = dp_c = 0
    idx = 1

    for _ in range(n):
        a = int(data[idx])
        b = int(data[idx + 1])
        c = int(data[idx + 2])
        idx += 3
        na = a + (dp_b if dp_b >= dp_c else dp_c)
        nb = b + (dp_a if dp_a >= dp_c else dp_c)
        nc = c + (dp_a if dp_a >= dp_b else dp_b)
        dp_a, dp_b, dp_c = na, nb, nc

    print(max(dp_a, dp_b, dp_c))


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-vacation-three-choices",
        "title": "Kỳ nghỉ ba lựa chọn",
        "shortDescription": "Chọn hoạt động mỗi ngày để tối đa hóa tổng điểm sao cho không lặp hoạt động hai ngày liên tiếp.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.dp_linear",
        "tags": ["quy hoạch động", "atcoder", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N) thời gian, O(1) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp13-knapsack-large-weight
# ============================================================================

def fmt_p04(W: int, items: List[Tuple[int, int]]) -> str:
    lines = [f"{len(items)} {W}"]
    lines.extend(f"{w} {v}" for w, v in items)
    return "\n".join(lines)


def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, W = toks[0], toks[1]
    items = [(toks[2 + 2 * i], toks[3 + 2 * i]) for i in range(n)]
    best = 0
    for mask in range(1, 1 << n):
        tw = 0
        tv = 0
        for i in range(n):
            if (mask >> i) & 1:
                tw += items[i][0]
                if tw > W:
                    break
                tv += items[i][1]
        else:
            if tv > best:
                best = tv
    return str(best)


def build_p04() -> dict:
    rng = random.Random(1304)

    tests = [
        # 3 public samples
        {"input": fmt_p04(8, [(3, 30), (4, 50), (5, 60)]), "hidden": False, "expected": "90", "checkBrute": True},
        {"input": fmt_p04(15, [(6, 5), (5, 6), (6, 4), (6, 6), (3, 5), (7, 2)]), "hidden": False, "expected": "17", "checkBrute": True},
        {"input": fmt_p04(10**9, [(10**9, 100), (1, 10), (1, 20)]), "hidden": False, "expected": "100", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p04(5, [(5, 0), (1, 0), (3, 0)]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p04(10**9, [(10**9, 150)]), "hidden": True, "expected": "150", "checkBrute": True},
        {"input": fmt_p04(10**9, [(500_000_001, 100), (500_000_001, 100), (999_999_999, 150)]), "hidden": True, "expected": "150", "checkBrute": True},
        {"input": fmt_p04(100, [(20, 40), (20, 40), (20, 40), (20, 40), (20, 40), (99, 150)]), "hidden": True, "expected": "200", "checkBrute": True},
        {"input": fmt_p04(10**9, [(400_000_000, 80), (400_000_000, 80), (300_000_000, 70), (300_000_000, 70)]), "hidden": True, "expected": "220", "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p04(10**7, [(rng.randint(1, 5 * 10**6), rng.randint(1, 150)) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p04(5 * 10**8, [(rng.randint(1, 2 * 10**8), rng.randint(0, 150)) for _ in range(17)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p04(10**9, [(rng.randint(1, 10**8), rng.randint(1, 150)) for _ in range(50)]), "hidden": True})
    tests.append({"input": fmt_p04(10**9, [(rng.randint(10**7, 3 * 10**7), 150) for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_p04(10**9, [(10**7, rng.randint(100, 150)) for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_p04(999_999_999, [(rng.randint(1, 5 * 10**7), rng.randint(0, 150)) for _ in range(100)]), "hidden": True})
    # Tricky: many tiny weights + few huge weights
    t15_items = [(rng.randint(1, 100), rng.randint(1, 5)) for _ in range(80)] + [(rng.randint(10**8, 4 * 10**8), rng.randint(120, 150)) for _ in range(20)]
    rng.shuffle(t15_items)
    tests.append({"input": fmt_p04(10**9, t15_items), "hidden": True})
    # Max N=100, W=10^9, v_i up to 150
    tests.append({"input": assert_safe_size(fmt_p04(10**9, [(rng.randint(1, 10**8), rng.randint(1, 150)) for _ in range(100)]), "p04_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 15)
        W = rng.randint(1, 10**9)
        items = [(rng.randint(1, min(W, 3 * 10**8)), rng.randint(0, 150)) for _ in range(n)]
        extra_stress.append(fmt_p04(W, items))

    statement = r"""Một tàu thám hiểm cần chọn mang theo một số món thiết bị trong tổng số $N$ món đồ có sẵn. Món đồ thứ $i$ ($1 \le i \le N$) có khối lượng $w_i$ và giá trị khoa học $v_i$. Khoang chứa của tàu chịu được tổng khối lượng tối đa là $W$.

Mỗi món đồ chỉ có **đúng $1$ chiếc** (hoặc mang theo, hoặc bỏ lại). Hãy tìm tổng giá trị lớn nhất có thể mang theo sao cho tổng khối lượng không vượt quá $W$.

Điểm đặc biệt của bài toán là $W$ có thể rất lớn (lên tới $10^9$), trong khi giá trị $v_i$ của mỗi món lại khá nhỏ ($v_i \le 150$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, W$ ($1 \le N \le 100$, $1 \le W \le 10^9$).
- $N$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $w_i, v_i$ ($1 \le w_i \le W$, $0 \le v_i \le 150$).

### Kết quả
- In ra một số nguyên duy nhất là tổng giá trị lớn nhất có thể mang theo.

### Ràng buộc
- $1 \le N \le 100$
- $1 \le W \le 10^9$
- $1 \le w_i \le W$, $0 \le v_i \le 150$

### Subtasks
- **Subtask 1 (25% số test):** $N \le 18$.
- **Subtask 2 (75% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1: Với $W = 8$, chọn món $1$ ($w=3, v=30$) và món $3$ ($w=5, v=60$) có tổng khối lượng $8 \le 8$ và tổng giá trị $90$.
- Ví dụ 3: Tổng khối lượng cả ba món vượt $10^9$, nên ta chỉ chọn món $1$ (giá trị $100$) thay vì chọn hai món sau (tổng giá trị $30$)."""

    hints = r"""**Gợi ý 1 (Vì sao DP ba lô thông thường không chạy được?):**
Bảng `dp[w]` theo khối lượng sẽ cần tới $W = 10^9$ phần tử, vượt quá cả thời gian lẫn giới hạn $256\text{MB}$ bộ nhớ.

**Gợi ý 2 (Đổi chiều trạng thái — Giá trị làm chỉ số):**
Tổng giá trị của tất cả $N$ món tối đa chỉ là $V_{\max} = \sum v_i \le 100 \times 150 = 15\,000$.
Hãy định nghĩa `dp[val]` là **tổng khối lượng nhỏ nhất** để đạt được đúng tổng giá trị `val`. Khởi tạo `dp[0] = 0` và `dp[val] = W + 1` (vô cực) với `val > 0`.

**Gợi ý 3 (Cập nhật & lấy đáp án):**
Với từng món đồ $(w_i, v_i)$, duyệt `val` **giảm dần** từ tổng giá trị hiện có về $v_i$:
`dp[val] = min(dp[val], dp[val - v_i] + w_i)`.
Cuối cùng, đáp án là giá trị `val` lớn nhất thỏa mãn `dp[val] <= W`. Nhớ dùng `long long` trong C++ khi cộng `dp[val - v_i] + w_i`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long W;
    if (!(cin >> n >> W)) return 0;

    vector<long long> w(n);
    vector<int> v(n);
    int sumV = 0;
    for (int i = 0; i < n; ++i) {
        cin >> w[i] >> v[i];
        sumV += v[i];
    }

    const long long INF = W + 1;
    vector<long long> dp(sumV + 1, INF);
    dp[0] = 0;

    int curMax = 0;
    for (int i = 0; i < n; ++i) {
        if (v[i] == 0) continue;
        curMax += v[i];
        for (int s = curMax; s >= v[i]; --s) {
            dp[s] = min(dp[s], dp[s - v[i]] + w[i]);
        }
    }

    int ans = 0;
    for (int s = sumV; s >= 0; --s) {
        if (dp[s] <= W) {
            ans = s;
            break;
        }
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
    cap = int(data[1])
    items = []
    sum_v = 0
    idx = 2
    for _ in range(n):
        wi = int(data[idx])
        vi = int(data[idx + 1])
        idx += 2
        items.append((wi, vi))
        sum_v += vi

    inf = cap + 1
    dp = [inf] * (sum_v + 1)
    dp[0] = 0

    cur_max = 0
    for wi, vi in items:
        if vi == 0:
            continue
        cur_max += vi
        for s in range(cur_max, vi - 1, -1):
            nw = dp[s - vi] + wi
            if nw < dp[s]:
                dp[s] = nw

    for s in range(sum_v, -1, -1):
        if dp[s] <= cap:
            print(s)
            return


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-knapsack-large-weight",
        "title": "Ba lô trọng lượng cực lớn",
        "shortDescription": "Giải bài toán ba lô 0/1 khi sức chứa W lên tới 10^9 bằng kỹ thuật đổi chiều trạng thái theo giá trị.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "ba lô", "atcoder", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * sum(v_i)) thời gian, O(sum(v_i)) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp13-bounded-knapsack-binary
# ============================================================================

def fmt_p05(W: int, items: List[Tuple[int, int, int]]) -> str:
    lines = [f"{len(items)} {W}"]
    lines.extend(f"{w} {v} {c}" for w, v, c in items)
    return "\n".join(lines)


def brute_p05(inp: str) -> str:
    # Independent brute: backtracking for tiny instances, naive O(N*W*c) triple loop otherwise
    toks = list(map(int, inp.split()))
    n, W = toks[0], toks[1]
    items = [(toks[2 + 3 * i], toks[3 + 3 * i], toks[4 + 3 * i]) for i in range(n)]

    prod = 1
    for _, _, c in items:
        prod *= (c + 1)
        if prod > 20_000:
            break

    if prod <= 20_000:
        best = 0

        def dfs(i: int, cur_w: int, cur_v: int) -> None:
            nonlocal best
            if i == n:
                if cur_v > best:
                    best = cur_v
                return
            w, v, c = items[i]
            max_k = min(c, (W - cur_w) // w)
            for k in range(max_k + 1):
                dfs(i + 1, cur_w + k * w, cur_v + k * v)

        dfs(0, 0, 0)
        return str(best)

    dp = [0] * (W + 1)
    for w, v, c in items:
        max_k = min(c, W // w)
        for cap in range(W, -1, -1):
            best = dp[cap]
            for k in range(1, max_k + 1):
                if k * w > cap:
                    break
                cand = dp[cap - k * w] + k * v
                if cand > best:
                    best = cand
            dp[cap] = best
    return str(max(dp))


def build_p05() -> dict:
    rng = random.Random(1305)

    tests = [
        # 3 public samples
        {"input": fmt_p05(10, [(3, 4, 2), (4, 5, 3), (2, 3, 2)]), "hidden": False, "expected": "14", "checkBrute": True},
        {"input": fmt_p05(7, [(2, 3, 5), (5, 8, 1)]), "hidden": False, "expected": "11", "checkBrute": True},
        {"input": fmt_p05(13, [(5, 10**9, 2), (3, 400_000_000, 3)]), "hidden": False, "expected": "2400000000", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p05(10, [(1, 100, 0), (5, 10, 1)]), "hidden": True, "expected": "10", "checkBrute": True},
        {"input": fmt_p05(1, [(1, 10**9, 1000)]), "hidden": True, "expected": str(10**9), "checkBrute": True},
        {"input": fmt_p05(50, [(50, 777, 1000), (25, 400, 1)]), "hidden": True, "expected": "777", "checkBrute": True},
        {"input": fmt_p05(15, [(1, 5, 3), (2, 9, 4), (3, 13, 2)]), "hidden": True, "checkBrute": True},
        {"input": fmt_p05(100, [(7, 10, 0), (11, 20, 0)]), "hidden": True, "expected": "0", "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p05(30, [(rng.randint(1, 10), rng.randint(1, 50), rng.randint(0, 6)) for _ in range(7)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p05(120, [(rng.randint(1, 30), rng.randint(1, 10**6), rng.randint(1, 20)) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p05(500, [(rng.randint(1, 100), rng.randint(1, 10**9), rng.randint(1, 100)) for _ in range(40)]), "hidden": True})
    tests.append({"input": fmt_p05(2000, [(rng.randint(1, 200), rng.randint(1, 10**9), rng.randint(1, 500)) for _ in range(80)]), "hidden": True})
    tests.append({"input": fmt_p05(4000, [(1, 10**9, 1000) for _ in range(100)]), "hidden": True, "expected": str(4000 * 10**9)})
    tests.append({"input": fmt_p05(4000, [(rng.randint(1, 50), rng.randint(1, 10**9), 1000) for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_p05(4000, [(rng.randint(1, 4000), rng.randint(0, 10**9), rng.randint(1, 1000)) for _ in range(100)]), "hidden": True})
    tests.append({"input": assert_safe_size(fmt_p05(4000, [(rng.randint(2, 120), rng.randint(1, 10**9), rng.randint(500, 1000)) for _ in range(100)]), "p05_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 6)
        W = rng.randint(1, 25)
        items = [(rng.randint(1, W), rng.randint(0, 100), rng.randint(0, 5)) for _ in range(n)]
        extra_stress.append(fmt_p05(W, items))

    statement = r"""Một kho vật tư có $N$ loại hàng hóa khác nhau. Loại hàng thứ $i$ ($1 \le i \le N$) có khối lượng mỗi đơn vị là $w_i$, giá trị là $v_i$, và trong kho còn tối đa $c_i$ chiếc.

Bạn có một chiếc xe tải sức chứa tối đa là $W$. Hãy chọn số lượng từng loại hàng (không vượt quá $c_i$) để chất lên xe sao cho tổng khối lượng không vượt quá $W$ và tổng giá trị là lớn nhất.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, W$ ($1 \le N \le 100$, $1 \le W \le 4000$).
- $N$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $w_i, v_i, c_i$ ($1 \le w_i \le W$, $0 \le v_i \le 10^9$, $0 \le c_i \le 1000$).

### Kết quả
- In ra một số nguyên duy nhất là tổng giá trị lớn nhất có thể đạt được.

### Ràng buộc
- $1 \le N \le 100$
- $1 \le W \le 4000$
- $1 \le w_i \le W$, $0 \le v_i \le 10^9$, $0 \le c_i \le 1000$

### Subtasks
- **Subtask 1 (30% số test):** $\sum c_i \le 200$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($W = 10$): Chọn $2$ chiếc loại $1$ (nặng $6$, giá trị $8$) và $2$ chiếc loại $3$ (nặng $4$, giá trị $6$). Tổng khối lượng $10 \le 10$, tổng giá trị $14$.
- Ví dụ 2 ($W = 7$): Chọn $1$ chiếc loại $1$ ($w=2, v=3$) và $1$ chiếc loại $2$ ($w=5, v=8$) được tổng giá trị $11$."""

    hints = r"""**Gợi ý 1 (Vì sao lặp từng chiếc bị TLE?):**
Nếu tách $c_i$ chiếc thành $c_i$ món 0/1 riêng biệt, tổng số món có thể lên tới $100 \times 1000 = 10^5$, khiến thuật toán $O(W \sum c_i) \approx 4 \times 10^8$ bị quá thời gian (đặc biệt với Python).

**Gợi ý 2 (Kỹ thuật tách nhị phân — Binary Splitting):**
Mọi số nguyên trong $[0, c_i]$ đều biểu diễn được dưới dạng tổng một tập con của các gói có kích thước lũy thừa của $2$:
$1, 2, 4, \dots, 2^{k-1}, r$ (với $r = c_i - (2^k - 1) \ge 0$ là phần dư còn lại).
Gói kích thước $t$ tương đương một món đồ 0/1 duy nhất nặng $t \cdot w_i$ và có giá trị $t \cdot v_i$.

**Gợi ý 3 (Độ phức tạp & tối ưu nhỏ):**
Số lượng gói của mỗi loại tối đa chỉ khoảng $\lceil \log_2(c_i + 1) \rceil \le 10$, nên tổng số món 0/1 sau khi tách $\le 1000$.
Trước khi tách, ta có thể rút gọn $c_i = \min(c_i, \lfloor W / w_i \rfloor)$ để bỏ qua các gói chắc chắn vượt sức chứa $W$, rồi chạy DP ba lô 0/1 chuẩn trong $O(N \cdot W \cdot \log C)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, W;
    if (!(cin >> n >> W)) return 0;

    vector<pair<int, long long>> items;
    for (int i = 0; i < n; ++i) {
        int w;
        long long v;
        int c;
        cin >> w >> v >> c;
        c = min(c, W / w);
        int k = 1;
        while (c > 0) {
            int take = min(k, c);
            items.emplace_back(w * take, v * take);
            c -= take;
            k <<= 1;
        }
    }

    vector<long long> dp(W + 1, 0);
    int curW = 0;
    for (auto [w, v] : items) {
        curW = min(W, curW + w);
        for (int cap = curW; cap >= w; --cap) {
            dp[cap] = max(dp[cap], dp[cap - w] + v);
        }
    }

    cout << *max_element(dp.begin(), dp.end()) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    cap_max = int(data[1])
    items = []
    idx = 2
    for _ in range(n):
        w = int(data[idx])
        v = int(data[idx + 1])
        c = int(data[idx + 2])
        idx += 3
        limit = cap_max // w
        if c > limit:
            c = limit
        k = 1
        while c > 0:
            take = k if k < c else c
            items.append((w * take, v * take))
            c -= take
            k <<= 1

    dp = [0] * (cap_max + 1)
    cur_w = 0
    for w, v in items:
        cur_w = cap_max if cur_w + w > cap_max else cur_w + w
        for cap in range(cur_w, w - 1, -1):
            cand = dp[cap - w] + v
            if cand > dp[cap]:
                dp[cap] = cand

    print(max(dp))


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-bounded-knapsack-binary",
        "title": "Ba lô hữu hạn tách nhị phân",
        "shortDescription": "Tối ưu bài toán ba lô có số lượng giới hạn bằng kỹ thuật tách nhị phân thành ba lô 0/1.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "ba lô", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * W * log(max c_i)) thời gian, O(W) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp13-min-subset-sum-diff
# ============================================================================

def fmt_p06(arr: List[int]) -> str:
    return f"{len(arr)}\n" + " ".join(map(str, arr))


def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1:]
    total = sum(a)
    best = total
    for mask in range(1 << n):
        s1 = 0
        for i in range(n):
            if (mask >> i) & 1:
                s1 += a[i]
        diff = abs(total - 2 * s1)
        if diff < best:
            best = diff
    return str(best)


def build_p06() -> dict:
    rng = random.Random(1306)

    tests = [
        # 3 public samples
        {"input": fmt_p06([1, 6, 11, 5]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": fmt_p06([3, 1, 4, 2, 2, 1]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": fmt_p06([10, 20, 30]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p06([7]), "hidden": True, "expected": "7", "checkBrute": True},
        {"input": fmt_p06([5, 5]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p06([100, 1, 1, 1, 1]), "hidden": True, "expected": "96", "checkBrute": True},
        {"input": fmt_p06([1, 1, 1, 1, 1]), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_p06([20_000]), "hidden": True, "expected": "20000", "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p06([rng.randint(1, 100) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p06([rng.randint(1, 500) for _ in range(17)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p06([rng.randint(1, 200) for _ in range(50)]), "hidden": True})
    tests.append({"input": fmt_p06([200] * 99 + [199]), "hidden": True, "expected": "1"})
    tests.append({"input": fmt_p06([1] * 99 + [100]), "hidden": True, "expected": "1"})
    tests.append({"input": fmt_p06([200] * 100), "hidden": True, "expected": "0"})
    # Random partition with exact sum 20000
    t15 = [rng.randint(1, 200) for _ in range(99)]
    t15.append(20_000 - sum(t15))
    tests.append({"input": fmt_p06(t15), "hidden": True})
    # Sum = 20000, odd/even mix
    t16 = [199] * 100
    tests.append({"input": assert_safe_size(fmt_p06(t16), "p06_t16"), "hidden": True, "expected": "0"})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 15)
        extra_stress.append(fmt_p06([rng.randint(1, 300) for _ in range(n)]))

    statement = r"""Cho một dãy gồm $N$ số nguyên dương $a_1, a_2, \dots, a_N$ có tổng không vượt quá $20\,000$.

Hãy chia $N$ phần tử này thành hai nhóm rời nhau (mỗi phần tử thuộc đúng một nhóm, được phép có một nhóm rỗng) có tổng các phần tử lần lượt là $S_1$ và $S_2$, sao cho độ chênh lệch $|S_1 - S_2|$ là **nhỏ nhất có thể**.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 100$).
- Dòng thứ hai chứa $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($\sum_{i=1}^{N} a_i \le 20\,000$).

### Kết quả
- In ra một số nguyên duy nhất là giá trị nhỏ nhất của $|S_1 - S_2|$.

### Ràng buộc
- $1 \le N \le 100$
- $a_i \ge 1$ với mọi $i$, và $\sum_{i=1}^{N} a_i \le 20\,000$.

### Subtasks
- **Subtask 1 (30% số test):** $N \le 18$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1: Chia $[1, 6, 11, 5]$ thành $\{1, 6, 5\}$ (tổng $12$) và $\{11\}$ (tổng $11$), chênh lệch $|12 - 11| = 1$.
- Ví dụ 2: Chia $[3, 1, 4, 2, 2, 1]$ thành $\{3, 4\}$ (tổng $7$) và $\{1, 2, 2, 1\}$ (tổng $6$), chênh lệch $1$.
- Ví dụ 3: Chia $[10, 20, 30]$ thành $\{10, 20\}$ và $\{30\}$, chênh lệch $0$."""

    hints = r"""**Gợi ý 1 (Biến đổi biểu thức $|S_1 - S_2|$):**
Đặt $S = \sum_{i=1}^N a_i$. Nếu nhóm 1 có tổng là $S_1$, thì nhóm 2 có tổng là $S_2 = S - S_1$.
Khi đó $|S_1 - S_2| = |S - 2 S_1|$. Không mất tổng quát, giả sử $S_1 \le \lfloor S / 2 \rfloor$. Ta muốn $S_1$ **lớn nhất có thể** mà vẫn không vượt quá $\lfloor S / 2 \rfloor$.

**Gợi ý 2 (Quy hoạch động tổng tập con — Subset Sum):**
Bài toán quy về tìm tất cả các tổng $s \in [0, \lfloor S/2 \rfloor]$ có thể tạo thành từ một tập con của dãy $a$.
Dùng mảng đánh dấu boolean `dp[s]` (khởi tạo `dp[0] = true`), với mỗi $a_i$, duyệt $s$ từ $\lfloor S/2 \rfloor$ về $a_i$: `dp[s] |= dp[s - a_i]`.

**Gợi ý 3 (Tăng tốc bằng Bitset):**
- Trong C++, dùng `std::bitset<10001> bs; bs[0] = 1;` rồi cập nhật chỉ bằng một phép dịch bit `bs |= (bs << x);` ($O(N \cdot S / 64)$).
- Trong Python, số nguyên có độ dài tùy ý hoạt động như một bitset: `bits = (bits | (bits << x)) & mask`, và tổng lớn nhất $\le \lfloor S/2 \rfloor$ chính là `bits.bit_length() - 1`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<int> a(n);
    int total = 0;
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
        total += a[i];
    }

    int half = total / 2;
    bitset<10001> bs;
    bs[0] = 1;
    for (int x : a) {
        if (x <= half) {
            bs |= (bs << x);
        }
    }

    int best = 0;
    for (int s = half; s >= 0; --s) {
        if (bs[s]) {
            best = s;
            break;
        }
    }

    cout << (total - 2 * best) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    arr = [int(x) for x in data[1 : 1 + n]]
    total = sum(arr)
    half = total // 2

    bits = 1
    mask = (1 << (half + 1)) - 1
    for x in arr:
        if x <= half:
            bits = (bits | (bits << x)) & mask

    best = bits.bit_length() - 1
    print(total - 2 * best)


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-min-subset-sum-diff",
        "title": "Chia tập tối thiểu chênh lệch tổng",
        "shortDescription": "Chia N số thành hai nhóm có tổng gần nhau nhất bằng DP tập con / bitset.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.dp_knapsack",
        "tags": ["quy hoạch động", "ba lô", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * sum(a_i) / w) với bitset.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp13-candies-prefix-dp
# ============================================================================

def fmt_p07(k: int, caps: List[int]) -> str:
    return f"{len(caps)} {k}\n" + " ".join(map(str, caps))


def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, k = toks[0], toks[1]
    a = toks[2:]

    def dfs(i: int, rem: int) -> int:
        if i == n:
            return 1 if rem == 0 else 0
        lim = min(a[i], rem)
        ans = 0
        for take in range(lim + 1):
            ans = (ans + dfs(i + 1, rem - take)) % MOD
        return ans

    return str(dfs(0, k))


def build_p07() -> dict:
    rng = random.Random(1307)

    tests = [
        # 3 public samples (AtCoder DP M style)
        {"input": fmt_p07(4, [1, 2, 3]), "hidden": False, "expected": "5", "checkBrute": True},
        {"input": fmt_p07(0, [0, 0]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": fmt_p07(5, [1, 1, 1]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p07(3, [5]), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_p07(5, [2]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p07(6, [2, 2, 2]), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_p07(4, [0, 4, 0, 2]), "hidden": True, "expected": "3", "checkBrute": True},
        {"input": fmt_p07(0, [3, 5, 2, 1]), "hidden": True, "expected": "1", "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p07(10, [rng.randint(0, 10) for _ in range(5)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p07(12, [rng.randint(0, 6) for _ in range(6)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p07(100, [rng.randint(0, 50) for _ in range(30)]), "hidden": True})
    tests.append({"input": fmt_p07(500, [rng.randint(0, 500) for _ in range(50)]), "hidden": True})
    tests.append({"input": fmt_p07(1500, [0] * 100), "hidden": True, "expected": "0"})
    tests.append({"input": fmt_p07(1500, [15] * 100), "hidden": True, "expected": "1"})
    tests.append({"input": fmt_p07(1500, [1500] * 100), "hidden": True})
    tests.append({"input": assert_safe_size(fmt_p07(1500, [rng.randint(0, 1500) for _ in range(100)]), "p07_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 6)
        k = rng.randint(0, 12)
        caps = [rng.randint(0, k) for _ in range(n)]
        extra_stress.append(fmt_p07(k, caps))

    statement = r"""Cô giáo có $K$ viên kẹo giống hệt nhau và muốn chia **hết toàn bộ $K$ viên kẹo** cho $N$ em nhỏ được đánh số từ $1$ đến $N$. Mỗi em có thể nhận $0$ viên hoặc nhiều hơn, nhưng em thứ $i$ chỉ được phép nhận **tối đa $a_i$ viên kẹo** ($0 \le x_i \le a_i$).

Hãy đếm số cách chia kẹo hợp lệ khác nhau. Hai cách chia được xem là khác nhau nếu tồn tại ít nhất một em nhỏ nhận số kẹo khác nhau ở hai cách. Vì kết quả có thể rất lớn, hãy in ra phần dư khi chia cho $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, K$ ($1 \le N \le 100$, $0 \le K \le 1500$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i \le K$).

### Kết quả
- In ra một số nguyên duy nhất là số cách chia kẹo modulo $10^9 + 7$.

### Ràng buộc
- $1 \le N \le 100$
- $0 \le K \le 1500$
- $0 \le a_i \le K$

### Subtasks
- **Subtask 1 (30% số test):** $N \le 6, K \le 12$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($N=3, K=4, a=[1,2,3]$): Có $5$ cách chia $(x_1, x_2, x_3)$ gồm $(0,1,3)$, $(0,2,2)$, $(1,0,3)$, $(1,1,2)$, $(1,2,1)$.
- Ví dụ 2 ($N=2, K=0, a=[0,0]$): Có đúng $1$ cách là không chia viên nào cho cả hai em: $(0,0)$.
- Ví dụ 3 ($N=3, K=5, a=[1,1,1]$): Tổng tối đa có thể chia chỉ là $3 < 5$, nên có $0$ cách."""

    hints = r"""**Gợi ý 1 (Công thức DP cơ bản $O(N K^2)$):**
Gọi $dp[j]$ là số cách chia đúng $j$ viên kẹo cho các em nhỏ đã xét. Ban đầu $dp[0] = 1$ và $dp[j] = 0$ với $j > 0$.
Khi xét thêm em có giới hạn $a_i$, em này có thể nhận $c \in [0, \min(j, a_i)]$ viên kẹo:
$$dp_{\text{mới}}[j] = \sum_{c=0}^{\min(j, a_i)} dp[j - c] = \sum_{p = \max(0, j - a_i)}^{j} dp[p]$$

**Gợi ý 2 (Tối ưu chuyển trạng thái bằng mảng cộng dồn — Prefix Sum):**
Tổng $\sum_{p = L}^{j} dp[p]$ chính là tổng một đoạn liên tiếp trên mảng `dp` cũ!
Hãy dựng mảng cộng dồn `pref[j + 1] = (pref[j] + dp[j]) % MOD` trước khi tính `dp_mới`. Khi đó mỗi $dp_{\text{mới}}[j]$ chỉ cần $O(1)$ để tính:
$$dp_{\text{mới}}[j] = (\text{pref}[j + 1] - \text{pref}[\max(0, j - a_i)]) \bmod (10^9 + 7)$$

**Gợi ý 3 (Lưu ý phép trừ modulo):**
Trong C++, phép trừ `(pref[j + 1] - pref[lo]) % MOD` có thể ra số âm, cần cộng thêm `MOD` trước khi lấy phần dư: `((pref[j + 1] - pref[lo]) % MOD + MOD) % MOD`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const long long MOD = 1000000007LL;
    int n, k;
    if (!(cin >> n >> k)) return 0;

    vector<long long> dp(k + 1, 0), pref(k + 2, 0);
    dp[0] = 1;

    for (int i = 0; i < n; ++i) {
        int a;
        cin >> a;
        pref[0] = 0;
        for (int j = 0; j <= k; ++j) {
            pref[j + 1] = pref[j] + dp[j];
            if (pref[j + 1] >= MOD) pref[j + 1] -= MOD;
        }
        for (int j = 0; j <= k; ++j) {
            int lo = max(0, j - a);
            long long val = pref[j + 1] - pref[lo];
            if (val < 0) val += MOD;
            dp[j] = val;
        }
    }

    cout << dp[k] << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    mod = 1_000_000_007
    n = int(data[0])
    k = int(data[1])
    caps = [int(x) for x in data[2 : 2 + n]]

    dp = [0] * (k + 1)
    dp[0] = 1
    pref = [0] * (k + 2)

    for a in caps:
        s = 0
        for j in range(k + 1):
            s += dp[j]
            if s >= mod:
                s -= mod
            pref[j + 1] = s
        for j in range(k + 1):
            lo = j - a if j > a else 0
            val = pref[j + 1] - pref[lo]
            if val < 0:
                val += mod
            dp[j] = val

    print(dp[k])


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-candies-prefix-dp",
        "title": "Chia kẹo tối ưu bằng mảng cộng dồn",
        "shortDescription": "Đếm số cách chia K viên kẹo cho N em nhỏ với giới hạn từng em, tối ưu chuyển trạng thái DP bằng Prefix Sum.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "prefix sum", "atcoder", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * K) thời gian, O(K) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp13-digit-dp-sum-mod-d
# ============================================================================

def fmt_p08(k_str: str, d: int) -> str:
    return f"{k_str}\n{d}"


def brute_p08(inp: str) -> str:
    toks = inp.split()
    k = int(toks[0])
    d = int(toks[1])
    cnt = 0
    for x in range(1, k + 1):
        s = 0
        t = x
        while t:
            s += t % 10
            t //= 10
        if s % d == 0:
            cnt += 1
    return str(cnt % MOD)


def build_p08() -> dict:
    rng = random.Random(1308)

    tests = [
        # 3 public samples
        {"input": fmt_p08("30", 4), "hidden": False, "expected": "6", "checkBrute": True},
        {"input": fmt_p08("1000000009", 1), "hidden": False, "expected": "2"},
        {"input": fmt_p08("25", 7), "hidden": False, "expected": "3", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p08("1", 1), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_p08("1", 5), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p08("9", 9), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_p08("999", 80), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p08("10000", 27), "hidden": True, "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p08(str(rng.randint(1000, 20_000)), rng.randint(2, 30)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p08(str(rng.randint(10_000, 40_000)), rng.randint(10, 80)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p08("9" * 50, 73), "hidden": True})
    tests.append({"input": fmt_p08("1" + "0" * 100, 17), "hidden": True})
    tests.append({"input": fmt_p08("".join(str(rng.randint(0, 9)) for _ in range(150)).lstrip("0") or "1", 80), "hidden": True})
    tests.append({"input": fmt_p08("9" * 250, 1), "hidden": True})
    tests.append({"input": fmt_p08("9" * 250, 80), "hidden": True})
    t16_k = str(rng.randint(1, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(249))
    tests.append({"input": assert_safe_size(fmt_p08(t16_k, 79), "p08_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        k_val = rng.randint(1, 15_000)
        d_val = rng.randint(1, 50)
        extra_stress.append(fmt_p08(str(k_val), d_val))

    statement = r"""Cho một số nguyên dương rất lớn $K$ (được biểu diễn dưới dạng xâu chữ số, không có số `0` vô nghĩa ở đầu) và một số nguyên dương $D$.

Hãy đếm số lượng số nguyên dương $x$ thỏa mãn $1 \le x \le K$ sao cho **tổng các chữ số của $x$ chia hết cho $D$**. Vì kết quả có thể rất lớn, hãy in ra phần dư khi chia cho $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $K$ ($1 \le K < 10^{250}$, tối đa $250$ chữ số).
- Dòng thứ hai chứa số nguyên dương $D$ ($1 \le D \le 80$).

### Kết quả
- In ra một số nguyên duy nhất là số lượng số $x$ hợp lệ modulo $10^9 + 7$.

### Ràng buộc
- $1 \le K < 10^{250}$
- $1 \le D \le 80$

### Subtasks
- **Subtask 1 (30% số test):** $K \le 50\,000$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($K = 30, D = 4$): Các số trong $[1, 30]$ có tổng chữ số chia hết cho $4$ là $4, 8, 13, 17, 22, 26$ (tổng cộng $6$ số).
- Ví dụ 2 ($K = 10^9 + 9, D = 1$): Mọi số nguyên đều có tổng chữ số chia hết cho $1$, nên đáp án là $(10^9 + 9) \bmod (10^9 + 7) = 2$.
- Ví dụ 3 ($K = 25, D = 7$): Các số thỏa mãn là $7, 16, 25$ ($3$ số)."""

    hints = r"""**Gợi ý 1 (Ý tưởng Quy hoạch động chữ số — Digit DP):**
Ta xây dựng dần các chữ số của $x$ từ trái sang phải (có thể đệm số `0` ở đầu để đủ độ dài $|K|$). Ta không cần biết các chữ số đã chọn là gì, chỉ cần biết **tổng chữ số hiện tại chia dư cho $D$** (`rem`) và việc tiền tố đã chọn có đang **bằng khít** tiền tố tương ứng của $K$ hay chưa (`tight`).

**Gợi ý 2 (Tách trạng thái `tight` để chạy cực nhanh):**
Ở mỗi bước xử lý chữ số $lim = K[i]$:
- Chỉ có **duy nhất $1$** tiền tố đang `tight` (tức bằng đúng $K[0..i-1]$), ta lưu phần dư của nó bằng một biến `tight_rem`.
- Với các tiền tố đã nhỏ hơn hẳn $K[0..i-1]$ (`dp[rem]`), ở vị trí $i$ ta được chọn tự do mọi chữ số $d \in [0, 9]$ để chuyển sang `(rem + d) % D`.
- Từ tiền tố `tight`, ta chọn $d \in [0, lim - 1]$ để chuyển vào `dp_new[(tight_rem + d) % D]`, và cập nhật `tight_rem = (tight_rem + lim) % D`.

**Gợi ý 3 (Đừng quên loại bỏ số $0$):**
Cách xây dựng trên đếm tất cả các số trong đoạn $[0, K]$, trong đó có số $0$ (có tổng chữ số bằng $0$, luôn chia hết cho $D$). Do đề bài yêu cầu $1 \le x \le K$, kết quả cuối cùng là `(dp[0] + (tight_rem == 0 ? 1 : 0) - 1 + MOD) % MOD`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const long long MOD = 1000000007LL;
    string kStr;
    int d;
    if (!(cin >> kStr >> d)) return 0;

    vector<long long> dp(d, 0), ndp(d, 0);
    int tightRem = 0;

    for (char ch : kStr) {
        int lim = ch - '0';
        fill(ndp.begin(), ndp.end(), 0);
        for (int rem = 0; rem < d; ++rem) {
            if (dp[rem] == 0) continue;
            long long val = dp[rem];
            for (int dig = 0; dig <= 9; ++dig) {
                int nr = (rem + dig) % d;
                ndp[nr] += val;
                if (ndp[nr] >= MOD) ndp[nr] -= MOD;
            }
        }
        for (int dig = 0; dig < lim; ++dig) {
            int nr = (tightRem + dig) % d;
            ndp[nr] += 1;
            if (ndp[nr] >= MOD) ndp[nr] -= MOD;
        }
        tightRem = (tightRem + lim) % d;
        dp.swap(ndp);
    }

    long long ans = dp[0] + (tightRem == 0 ? 1 : 0) - 1;
    ans = (ans % MOD + MOD) % MOD;
    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    mod = 1_000_000_007
    k_str = data[0]
    d = int(data[1])

    dp = [0] * d
    tight_rem = 0

    for ch in k_str:
        lim = int(ch)
        ndp = [0] * d
        for rem in range(d):
            val = dp[rem]
            if val:
                for dig in range(10):
                    nr = (rem + dig) % d
                    nv = ndp[nr] + val
                    ndp[nr] = nv - mod if nv >= mod else nv
        for dig in range(lim):
            nr = (tight_rem + dig) % d
            nv = ndp[nr] + 1
            ndp[nr] = nv - mod if nv >= mod else nv
        tight_rem = (tight_rem + lim) % d
        dp = ndp

    ans = (dp[0] + (1 if tight_rem == 0 else 0) - 1) % mod
    print(ans)


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-digit-dp-sum-mod-d",
        "title": "Đếm số có tổng chữ số chia hết cho D",
        "shortDescription": "Dùng Digit DP đếm số nguyên dương trong [1, K] (K lên tới 10^250) có tổng chữ số chia hết cho D.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "digit dp", "modulo", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|K| * D * 10) thời gian, O(D) bộ nhớ.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp13-digit-dp-no-adj-equal
# ============================================================================

def fmt_p09(L: int, R: int) -> str:
    return f"{L} {R}"


def brute_p09(inp: str) -> str:
    toks = inp.split()
    L = int(toks[0])
    R = int(toks[1])
    cnt = 0
    for x in range(L, R + 1):
        s = str(x)
        ok = True
        for i in range(len(s) - 1):
            if s[i] == s[i + 1]:
                ok = False
                break
        if ok:
            cnt += 1
    return str(cnt)


def build_p09() -> dict:
    rng = random.Random(1309)

    tests = [
        # 3 public samples
        {"input": fmt_p09(123, 321), "hidden": False, "expected": "171", "checkBrute": True},
        {"input": fmt_p09(0, 100), "hidden": False, "expected": "91", "checkBrute": True},
        {"input": fmt_p09(11, 22), "hidden": False, "expected": "10", "checkBrute": True},
        # 5 corner cases (leading zero & L=0 & boundaries)
        {"input": fmt_p09(0, 0), "hidden": True, "expected": "1", "checkBrute": True},
        {"input": fmt_p09(0, 9), "hidden": True, "expected": "10", "checkBrute": True},
        {"input": fmt_p09(100, 105), "hidden": True, "expected": "5", "checkBrute": True},
        {"input": fmt_p09(1000, 1009), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_p09(999, 1012), "hidden": True, "expected": "2", "checkBrute": True},
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_p09(98_000, 120_000), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p09(0, 25_000), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p09(10**9, 10**10), "hidden": True})
    tests.append({"input": fmt_p09(123_456_789_012, 987_654_321_098), "hidden": True})
    tests.append({"input": fmt_p09(10**18 - 10**12, 10**18), "hidden": True})
    tests.append({"input": fmt_p09(10**18, 10**18), "hidden": True, "expected": "0"})
    tests.append({"input": fmt_p09(101_010_101_010_101_010, 101_010_101_010_101_010), "hidden": True, "expected": "1"})
    tests.append({"input": fmt_p09(0, 10**18), "hidden": True})

    extra_stress = []
    for _ in range(25):
        a = rng.randint(0, 5000)
        b = a + rng.randint(0, 5000)
        extra_stress.append(fmt_p09(a, b))

    statement = r"""Cho hai số nguyên không âm $L$ và $R$. Hãy đếm số lượng số nguyên $x$ nằm trong đoạn $[L, R]$ sao cho trong biểu diễn thập phân của $x$ (không tính các chữ số `0` vô nghĩa ở đầu), **không có bất kỳ hai chữ số kề nhau nào giống nhau**.

Ví dụ: $7$, $101$, $1203$ là các số hợp lệ; còn $11$, $100$, $4552$ là không hợp lệ.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên $L, R$ ($0 \le L \le R \le 10^{18}$).

### Kết quả
- In ra một số nguyên duy nhất là số lượng số nguyên hợp lệ trong đoạn $[L, R]$.

### Ràng buộc
- $0 \le L \le R \le 10^{18}$

### Subtasks
- **Subtask 1 (30% số test):** $R \le 10^5$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($[123, 321]$): Có $171$ số không chứa hai chữ số kề nhau giống nhau.
- Ví dụ 2 ($[0, 100]$): Trong $101$ số từ $0$ đến $100$, các số vi phạm là $11, 22, 33, 44, 55, 66, 77, 88, 99, 100$ ($10$ số), nên còn lại $91$ số hợp lệ (chú ý $0$ và $10$ đều hợp lệ).
- Ví dụ 3 ($[11, 22]$): Loại $11$ và $22$, còn $12, 13, 14, 15, 16, 17, 18, 19, 20, 21$ ($10$ số)."""

    hints = r"""**Gợi ý 1 (Đưa bài toán đoạn $[L, R]$ về tiền tố $[0, X]$):**
Gọi $F(X)$ là số lượng số nguyên hợp lệ trong đoạn $[0, X]$. Khi đó:
- Nếu $L = 0$: đáp án là $F(R)$.
- Nếu $L > 0$: đáp án là $F(R) - F(L - 1)$.

**Gợi ý 2 (Cạm bẫy `leading zero` trong Digit DP):**
Khi đệm các số `0` vào bên trái để mọi số có cùng số chữ số với $X$ (ví dụ $7 \rightarrow 007$), hai chữ số `0` đệm ở đầu **không phải** là hai chữ số giống nhau thật của số $7$. Tuy nhiên, chữ số `0` xuất hiện **sau khi số đã bắt đầu** (như trong $100$) thì lại phải kiểm tra bình thường.
Vì vậy, trạng thái DP cần thêm cờ `started` (đã có chữ số khác `0` nào trước đó hay chưa): `(pos, last_digit, tight, started)`.

**Gợi ý 3 (Chuyển trạng thái chi tiết):**
- Khi `started == false`:
  - Nếu chọn $d = 0$, ta vẫn ở trạng thái chưa bắt đầu (`started = false`, `last_digit = 10` làm giá trị giả).
  - Nếu chọn $d > 0$, ta chuyển sang `started = true`, `last_digit = d`.
- Khi `started == true`: chỉ được chọn $d \ne \text{last\_digit}$, và giữ `started = true`.
- Khi đi hết tất cả chữ số (`pos == len(X)`), trả về $1$ (trường hợp toàn bộ là `0` tương ứng với số $0$, hoàn toàn hợp lệ trong $F(X)$)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

string s;
long long memo[20][11][2][2];

long long dfs(int pos, int last, int tight, int started) {
    if (pos == static_cast<int>(s.size())) return 1;
    long long &res = memo[pos][last][tight][started];
    if (res != -1) return res;

    int lim = tight ? (s[pos] - '0') : 9;
    long long ans = 0;
    for (int d = 0; d <= lim; ++d) {
        int ntight = (tight && d == lim) ? 1 : 0;
        if (!started) {
            if (d == 0) {
                ans += dfs(pos + 1, 10, ntight, 0);
            } else {
                ans += dfs(pos + 1, d, ntight, 1);
            }
        } else {
            if (d != last) {
                ans += dfs(pos + 1, d, ntight, 1);
            }
        }
    }
    return res = ans;
}

long long countUpTo(long long x) {
    if (x < 0) return 0;
    s = to_string(x);
    memset(memo, -1, sizeof(memo));
    return dfs(0, 10, 1, 0);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long L, R;
    if (!(cin >> L >> R)) return 0;
    long long ans = countUpTo(R) - (L > 0 ? countUpTo(L - 1) : 0);
    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys
from functools import lru_cache


def count_up_to(x: int) -> int:
    if x < 0:
        return 0
    s = str(x)
    n = len(s)
    digits = [int(ch) for ch in s]

    @lru_cache(maxsize=None)
    def dfs(pos: int, last: int, tight: bool, started: bool) -> int:
        if pos == n:
            return 1
        lim = digits[pos] if tight else 9
        ans = 0
        if not started:
            for d in range(lim + 1):
                ntight = tight and (d == lim)
                if d == 0:
                    ans += dfs(pos + 1, 10, ntight, False)
                else:
                    ans += dfs(pos + 1, d, ntight, True)
        else:
            for d in range(lim + 1):
                if d != last:
                    ans += dfs(pos + 1, d, tight and (d == lim), True)
        return ans

    return dfs(0, 10, True, False)


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    left = int(data[0])
    right = int(data[1])
    ans = count_up_to(right) - (count_up_to(left - 1) if left > 0 else 0)
    print(ans)


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-digit-dp-no-adj-equal",
        "title": "Đếm số không có hai chữ số kề nhau giống nhau",
        "shortDescription": "Đếm số nguyên trong đoạn [L, R] (lên tới 10^18) không có hai chữ số kề nhau giống nhau bằng Digit DP.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "digit dp", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(log10(R) * 10 * 10) thời gian.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp13-deque-dp-max-jump
# ============================================================================

def fmt_p10(k: int, arr: List[int]) -> str:
    return f"{len(arr)} {k}\n" + " ".join(map(str, arr))


def brute_p10(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, k = toks[0], toks[1]
    a = toks[2:]
    if n == 1:
        return str(a[0])

    # Independent bitmask enumeration over intermediate visited cells for n <= 16
    if n <= 16:
        mid = n - 2
        best = -(10**30)
        for mask in range(1 << mid):
            prev = 0
            total = a[0]
            ok = True
            for i in range(1, n - 1):
                if (mask >> (i - 1)) & 1:
                    if i - prev > k:
                        ok = False
                        break
                    prev = i
                    total += a[i]
            if ok and (n - 1 - prev) <= k:
                total += a[n - 1]
                if total > best:
                    best = total
        return str(best)

    # Independent O(N*K) DP for medium checkBrute cases
    dp = [-(10**30)] * n
    dp[0] = a[0]
    for i in range(1, n):
        lo = max(0, i - k)
        dp[i] = max(dp[lo:i]) + a[i]
    return str(dp[n - 1])


def build_p10() -> dict:
    rng = random.Random(1310)

    tests = [
        # 3 public samples
        {"input": fmt_p10(2, [1, -1, -2, 4, -7, 3]), "hidden": False, "expected": "7", "checkBrute": True},
        {"input": fmt_p10(3, [10, -5, -2, 4, 0, 3]), "hidden": False, "expected": "17", "checkBrute": True},
        {"input": fmt_p10(2, [1, -5, -20, 4, -1, 3, -6, -3]), "hidden": False, "expected": "0", "checkBrute": True},
        # 5 corner cases
        {"input": fmt_p10(1, [42]), "hidden": True, "expected": "42", "checkBrute": True},
        {"input": fmt_p10(1, [-10, -20, -30, -40]), "hidden": True, "expected": "-100", "checkBrute": True},
        {"input": fmt_p10(4, [-10, -100, -100, -100, -20]), "hidden": True, "expected": "-30", "checkBrute": True},
        {"input": fmt_p10(2, [10**9, -10**9, -1, 10**9]), "hidden": True, "expected": str(2 * 10**9 - 1), "checkBrute": True},
        {"input": fmt_p10(10, [-5, -1, -2, -3, -4, -5]), "hidden": True, "expected": "-10", "checkBrute": True},
    ]

    # 8 medium -> large tests (all <= 148 KB)
    tests.append({"input": fmt_p10(4, [rng.randint(-100, 100) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p10(5, [rng.randint(-10**9, 10**9) for _ in range(16)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p10(35, [rng.randint(-1000, 1000) for _ in range(300)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_p10(200, [rng.randint(-10**9, 10**9) for _ in range(5000)]), "hidden": True})
    # Long negative run forcing jumping across K=1500
    t13 = [rng.randint(1, 50) if i % 500 == 0 else rng.randint(-99, -1) for i in range(30_000)]
    tests.append({"input": assert_safe_size(fmt_p10(1500, t13), "p10_t13"), "hidden": True})
    # All positive N=30000, K=10000
    tests.append({"input": assert_safe_size(fmt_p10(10_000, [9] * 30_000), "p10_t14"), "hidden": True, "expected": str(9 * 30_000)})
    # Large 10^9 overflow test N=10000, K=3000
    tests.append({"input": assert_safe_size(fmt_p10(3000, [rng.randint(-10**9, 10**9) for _ in range(10_000)]), "p10_t15"), "hidden": True})
    # Max N=30000, K=5000 mixed small ints
    tests.append({"input": assert_safe_size(fmt_p10(5000, [rng.randint(-99, 99) for _ in range(30_000)]), "p10_t16"), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 14)
        k = rng.randint(1, n)
        arr = [rng.randint(-50, 50) for _ in range(n)]
        extra_stress.append(fmt_p10(k, arr))

    statement = r"""Một trò chơi gồm $N$ ô xếp thành hàng ngang đánh số từ $1$ đến $N$. Ô thứ $i$ có giá trị điểm nguyên $a_i$ (có thể âm, dương hoặc bằng $0$).

Người chơi xuất phát tại ô $1$ (tính luôn điểm $a_1$). Ở mỗi bước, nếu đang đứng tại ô $i$ ($i < N$), người chơi có thể nhảy tới bất kỳ ô $j$ nào thỏa mãn:
$$i < j \le \min(N, i + K)$$
Trò chơi kết thúc khi người chơi đặt chân tới ô $N$ (tính cả điểm $a_N$). Tổng điểm của một hành trình là tổng giá trị $a_i$ tại tất cả các ô đã đi qua (bao gồm cả ô $1$ và ô $N$).

Hãy tìm **tổng điểm lớn nhất** có thể đạt được khi đi từ ô $1$ tới ô $N$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, K$ ($1 \le K \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Kết quả
- In ra một số nguyên duy nhất là tổng điểm lớn nhất có thể đạt được.

### Ràng buộc
- $1 \le K \le N \le 30\,000$
- $-10^9 \le a_i \le 10^9$

### Subtasks
- **Subtask 1 (30% số test):** $N \le 300$.
- **Subtask 2 (70% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Ví dụ 1 ($N=6, K=2, a=[1, -1, -2, 4, -7, 3]$): Nhảy $1 \rightarrow 2 \rightarrow 4 \rightarrow 6$, tổng điểm $1 + (-1) + 4 + 3 = 7$.
- Ví dụ 2 ($N=6, K=3, a=[10, -5, -2, 4, 0, 3]$): Nhảy $1 \rightarrow 4 \rightarrow 6$, tổng điểm $10 + 4 + 3 = 17$.
- Ví dụ 3 ($N=8, K=2$): Nhảy $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8$, tổng $1 + (-5) + 4 + 3 + (-3) = 0$."""

    hints = r"""**Gợi ý 1 (Công thức DP $O(NK)$):**
Gọi $dp[i]$ là tổng điểm lớn nhất để đi từ ô $1$ đến ô $i$.
Với $dp[1] = a_1$, thì với $i \ge 2$:
$$dp[i] = a_i + \max_{\max(1, i - K) \le j < i} dp[j]$$
Nếu tính $\max$ trực tiếp sẽ tốn $O(NK)$, bị TLE khi $N, K$ lớn.

**Gợi ý 2 (Tối ưu cửa sổ trượt bằng Hàng đợi hai đầu đơn điệu — Monotonic Deque):**
Khi $i$ tăng thêm $1$, đoạn $[i - K, i - 1]$ chỉ trượt sang phải $1$ bước. Ta duy trì một `deque` chứa các chỉ số $j$ sao cho:
1. Tất cả chỉ số trong `deque` đều còn nằm trong cửa sổ hợp lệ ($j \ge i - K$).
2. Giá trị $dp[j]$ tương ứng trong `deque` luôn **giảm nghiêm ngặt** từ đầu (`front`) đến cuối (`back`).

**Gợi ý 3 (Quy trình tại bước $i$ & lưu ý số âm):**
- Loại bỏ các phần tử ở đầu `deque` nếu `dq.front() < i - K`.
- Khi đó `dp[i] = dp[dq.front()] + a[i]` (nên không cần khởi tạo bằng $0$ — đặc biệt quan trọng khi tất cả $a_i$ đều âm!).
- Trước khi đẩy $i$ vào cuối `deque`, loại bỏ mọi chỉ số $idx$ ở cuối `deque` có `dp[idx] <= dp[i]`.
- Tổng điểm có thể lên tới $\pm 3 \times 10^{13}$, nhớ dùng `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;

    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    vector<long long> dp(n);
    dp[0] = a[0];
    deque<int> dq;
    dq.push_back(0);

    for (int i = 1; i < n; ++i) {
        while (!dq.empty() && dq.front() < i - k) {
            dq.pop_front();
        }
        dp[i] = dp[dq.front()] + a[i];
        while (!dq.empty() && dp[dq.back()] <= dp[i]) {
            dq.pop_back();
        }
        dq.push_back(i);
    }

    cout << dp[n - 1] << '\n';
    return 0;
}"""

    py_sol = r"""import sys
from collections import deque


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    arr = [int(x) for x in data[2 : 2 + n]]

    dp = [0] * n
    dp[0] = arr[0]
    dq = deque([0])

    for i in range(1, n):
        limit = i - k
        while dq[0] < limit:
            dq.popleft()
        cur = dp[dq[0]] + arr[i]
        dp[i] = cur
        while dq and dp[dq[-1]] <= cur:
            dq.pop()
        dq.append(i)

    print(dp[n - 1])


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp13-deque-dp-max-jump",
        "title": "Nhảy bước tối đa điểm bằng Deque DP",
        "shortDescription": "Tìm tổng điểm lớn nhất khi nhảy qua mảng có bước nhảy tối đa K bằng Monotonic Deque DP O(N).",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.dp_advanced",
        "tags": ["quy hoạch động", "deque", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N) thời gian, O(N) bộ nhớ.",
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
        pack_id="13-advanced-dp",
        title="Tầng 3: Quy hoạch động nâng cao (AtCoder DP, Digit DP & Deque DP)",
        tier="Tầng 3 — Quy hoạch động nâng cao",
        description=(
            "10 bài DP nâng cao chuẩn AtCoder DP Contest & CSES: LPS, Stock K giao dịch, "
            "Knapsack trọng lượng 10^9, Ba lô hữu hạn tách nhị phân, Candies Prefix DP, "
            "Digit DP và Deque DP."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
