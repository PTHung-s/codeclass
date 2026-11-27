"""
Builder script for CodeClass CP Pack 04: Sắp xếp, Tham lam & Chia để trị.
Generates and verifies `server/data/cp-packs/04-sorting-greedy.json`.
"""

from __future__ import annotations

import itertools
import random
from typing import Any, Dict, List

from pack_lib import build_and_verify_pack

MAX_PACK_TEST_BYTES = 150_000
REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Sắp xếp & Tham lam\n"


def assert_test_budgets(problems: List[Dict[str, Any]]) -> None:
    """Enforce exact 16 tests per problem and strict < 150KB test size budget."""
    for p in problems:
        slug = p["slug"]
        tests = p["tests"]
        if len(tests) != 16:
            raise ValueError(f"[{slug}] expected exactly 16 tests, got {len(tests)}")
        pub = sum(1 for t in tests if not t.get("hidden", True))
        if not (2 <= pub <= 3):
            raise ValueError(f"[{slug}] expected 2..3 public samples, got {pub}")
        for idx, t in enumerate(tests, 1):
            sz = len(t["input"].encode("utf-8"))
            if sz >= MAX_PACK_TEST_BYTES:
                raise ValueError(f"[{slug}] test #{idx} input is {sz} bytes (>= {MAX_PACK_TEST_BYTES})")


# =============================================================================
# 1. cp04-icpc-scoreboard-sort
# =============================================================================
def build_p01() -> Dict[str, Any]:
    rng = random.Random(401)

    def fmt_case(k: int, teams: List[tuple[int, int, int]]) -> str:
        lines = [f"{len(teams)} {k}"]
        for tid, solved, pen in teams:
            lines.append(f"{tid} {solved} {pen}")
        return "\n".join(lines)

    def brute_p01(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n, k = tokens[0], tokens[1]
        teams = []
        pos = 2
        for _ in range(n):
            teams.append((tokens[pos], tokens[pos + 1], tokens[pos + 2]))
            pos += 3

        def is_better(a: tuple[int, int, int], b: tuple[int, int, int]) -> bool:
            if a[1] != b[1]:
                return a[1] > b[1]
            if a[2] != b[2]:
                return a[2] < b[2]
            return a[0] < b[0]

        used = [False] * n
        res = []
        for _ in range(k):
            best = -1
            for i in range(n):
                if not used[i]:
                    if best == -1 or is_better(teams[i], teams[best]):
                        best = i
            used[best] = True
            res.append(str(teams[best][0]))
        return " ".join(res)

    def gen_rand_teams(n: int, max_id: int, max_solved: int = 15, max_pen: int = 10**6) -> List[tuple[int, int, int]]:
        ids = rng.sample(range(1, max_id + 1), n)
        return [(tid, rng.randint(0, max_solved), rng.randint(0, max_pen)) for tid in ids]

    # Sample 1
    s1 = fmt_case(3, [
        (105, 5, 320),
        (102, 7, 500),
        (108, 5, 290),
        (101, 5, 320),
        (109, 7, 450),
    ])
    # Sample 2
    s2 = fmt_case(4, [
        (999999999, 0, 0),
        (1, 0, 0),
        (500, 0, 10),
        (42, 0, 0),
    ])
    # Sample 3
    s3 = fmt_case(2, [
        (10, 12, 100),
        (20, 12, 100),
        (5, 12, 100),
    ])

    tests = [
        {"input": s1, "hidden": False, "expected": "109 102 108", "checkBrute": True},
        {"input": s2, "hidden": False, "expected": "1 42 999999999 500", "checkBrute": True},
        {"input": s3, "hidden": False, "expected": "5 10", "checkBrute": True},
        # Corner 4: N=1, K=1
        {"input": fmt_case(1, [(10**9, 15, 10**6)]), "hidden": True, "checkBrute": True},
        # Corner 5: All tied on solved & penalty, reverse IDs
        {"input": fmt_case(10, [(10**9 - i * 123456, 8, 420) for i in range(15)]), "hidden": True, "checkBrute": True},
        # Corner 6: All tied on solved, strict penalty tie-break with extreme penalties
        {"input": fmt_case(5, [(100 + i, 15, (10 - i) * 100000) for i in range(11)]), "hidden": True, "checkBrute": True},
        # Corner 7: Adversarial opposite order of solved vs penalty vs id
        {"input": fmt_case(8, [
            (1, 3, 0), (2, 3, 1), (3, 3, 0), (4, 4, 10**6), (5, 4, 999999),
            (6, 4, 10**6), (7, 0, 0), (8, 15, 10**6), (9, 15, 0), (10, 15, 0),
        ]), "hidden": True, "checkBrute": True},
        # Corner 8: K = N = 50
        {"input": fmt_case(50, gen_rand_teams(50, 10**9, 5, 20)), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(10, gen_rand_teams(200, 10**6, 15, 5000)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(25, gen_rand_teams(500, 10**9, 4, 10)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(50, gen_rand_teams(1000, 10**9, 15, 10**6)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(50, gen_rand_teams(2000, 10**9, 2, 5)), "hidden": True},
        # Large 13..16 (all < 150KB)
        {"input": fmt_case(50, gen_rand_teams(4000, 10**9, 15, 10**6)), "hidden": True},
        {"input": fmt_case(50, gen_rand_teams(6200, 10**9, 15, 10**6)), "hidden": True},
        {"input": fmt_case(50, gen_rand_teams(9000, 99999, 15, 9999)), "hidden": True},
        {"input": fmt_case(50, gen_rand_teams(11500, 50000, 3, 50)), "hidden": True},
    ]

    extra_stress = [
        fmt_case(rng.randint(1, min(n, 50)), gen_rand_teams(n, 1000, rng.randint(1, 15), rng.randint(0, 10)))
        for n in [1, 2, 5, 10, 15, 25, 40, 60, 80, 100, 120, 150, 200, 250, 300]
    ]

    return {
        "slug": "cp04-icpc-scoreboard-sort",
        "title": "Xếp hạng bảng điểm ICPC",
        "shortDescription": "Sắp xếp danh sách đội thi ICPC theo nhiều tiêu chí ưu tiên và in ra mã số của K đội dẫn đầu.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.sorting_basics",
        "tags": ["sắp xếp", "cài đặt", "tầng 1"],
        "statement": r"""Trong kỳ thi lập trình ICPC, ban tổ chức cần tổng hợp bảng xếp hạng của $N$ đội thi. Mỗi đội được mô tả bởi bộ ba số nguyên `(id, solved, penalty)`:
- `id`: mã số định danh duy nhất của đội ($1 \le \text{id} \le 10^9$);
- `solved`: số bài tập đội đã giải đúng ($0 \le \text{solved} \le 15$);
- `penalty`: tổng thời gian phạt của đội ($0 \le \text{penalty} \le 10^6$).

Quy tắc xếp hạng giữa hai đội được xác định theo thứ tự ưu tiên sau:
1. Đội có số bài giải được (`solved`) **nhiều hơn** xếp trên.
2. Nếu `solved` bằng nhau, đội có tổng thời gian phạt (`penalty`) **nhỏ hơn** xếp trên.
3. Nếu cả `solved` và `penalty` đều bằng nhau, đội có mã số (`id`) **nhỏ hơn** xếp trên.

Hãy tìm và in ra mã số `id` của $K$ đội đứng đầu bảng xếp hạng theo đúng thứ tự từ hạng $1$ đến hạng $K$.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên dương $N$ và $K$ ($1 \le N \le 20\,000$, $1 \le K \le \min(N, 50)$).
- Trong $N$ dòng tiếp theo, dòng thứ $i$ gồm ba số nguyên `id`, `solved`, `penalty` của đội thứ $i$. Mọi `id` đôi một phân biệt.

### Kết quả
- In ra trên một dòng duy nhất $K$ số nguyên là `id` của $K$ đội dẫn đầu, cách nhau bởi một dấu cách.

**Giải thích ví dụ:**
- Ở ví dụ 1, hai đội `109` và `102` cùng giải được $7$ bài, nhưng đội `109` có phạt $450 < 500$ nên xếp hạng $1$, đội `102` hạng $2$. Trong nhóm giải $5$ bài, đội `108` có phạt $290$ nhỏ nhất nên xếp hạng $3$. Vậy top $3$ là `109 102 108`.
- Ở ví dụ 2, tất cả đội đều giải $0$ bài; ba đội có phạt bằng $0$ được sắp theo `id` tăng dần là `1`, `42`, `999999999`, theo sau là đội `500` có phạt $10$.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Thiết kế hàm so sánh (comparator) thỏa mãn tính chất thứ tự nghiêm ngặt (strict weak ordering).",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Đừng sắp xếp riêng lẻ từng cột một cách tùy tiện; hãy lưu thông tin mỗi đội trong một cấu trúc (struct/tuple) rồi sắp xếp một lần duy nhất bằng khóa đa tiêu chí.

**Gợi ý 2 (Ý tưởng thuật toán):**
- Trong C++, viết hàm so sánh (lambda) nhận hai `Team a, b`: so sánh `a.solved > b.solved` trước; nếu bằng thì `a.penalty < b.penalty`; nếu vẫn bằng thì `a.id < b.id`.
- Trong Python, tận dụng so sánh tuple với khóa `key=lambda x: (-x[1], x[2], x[0])`. Dấu trừ trước `solved` giúp sắp xếp giảm dần trong khi hai tiêu chí sau vẫn tăng dần.

**Gợi ý 3 (Cài đặt & Lưu ý):**
Nhớ dùng `ios::sync_with_stdio(false); cin.tie(nullptr);` trong C++ hoặc `sys.stdin.read().split()` trong Python để đọc nhanh $N = 20\,000$ dòng. Sau khi sắp xếp chỉ cần in đúng $K$ phần tử đầu tiên.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

struct Team {
    long long id;
    int solved;
    int penalty;
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<Team> teams(n);
    for (int i = 0; i < n; ++i) {
        cin >> teams[i].id >> teams[i].solved >> teams[i].penalty;
    }

    sort(teams.begin(), teams.end(), [](const Team& a, const Team& b) {
        if (a.solved != b.solved) return a.solved > b.solved;
        if (a.penalty != b.penalty) return a.penalty < b.penalty;
        return a.id < b.id;
    });

    for (int i = 0; i < k; ++i) {
        if (i > 0) cout << ' ';
        cout << teams[i].id;
    }
    cout << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    teams = []
    idx = 2
    for _ in range(n):
        tid = int(data[idx])
        solved = int(data[idx + 1])
        penalty = int(data[idx + 2])
        idx += 3
        teams.append((tid, solved, penalty))

    teams.sort(key=lambda t: (-t[1], t[2], t[0]))
    print(" ".join(str(teams[i][0]) for i in range(k)))


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 2. cp04-max-pairs-within-k
# =============================================================================
def build_p02() -> Dict[str, Any]:
    rng = random.Random(402)

    def fmt_case(k: int, arr: List[int]) -> str:
        return f"{len(arr)} {k}\n" + " ".join(map(str, arr))

    def brute_p02(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n, k = tokens[0], tokens[1]
        a = tokens[2:2 + n]
        if n <= 14:
            # Independent exact bitmask DP over ALL arbitrary pairs (no sorting assumption!)
            dp = [0] * (1 << n)
            for mask in range(1, 1 << n):
                # pick lowest set bit i
                lsb = mask & -mask
                i = lsb.bit_length() - 1
                rem = mask ^ lsb
                best = dp[rem]
                # try pairing i with any j in rem
                sub = rem
                while sub:
                    lsb2 = sub & -sub
                    j = lsb2.bit_length() - 1
                    sub ^= lsb2
                    if abs(a[i] - a[j]) <= k:
                        cand = 1 + dp[rem ^ lsb2]
                        if cand > best:
                            best = cand
                dp[mask] = best
            return str(dp[(1 << n) - 1])
        # Independent DP on sorted array for medium verification
        a.sort()
        dp2 = [0] * (n + 1)
        for i in range(2, n + 1):
            dp2[i] = dp2[i - 1]
            if a[i - 1] - a[i - 2] <= k:
                dp2[i] = max(dp2[i], dp2[i - 2] + 1)
        return str(dp2[n])

    tests = [
        {"input": fmt_case(2, [1, 5, 3, 7, 10]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_case(0, [4, 2, 4, 4, 2, 7]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_case(3, [1, 10, 20, 30]), "hidden": False, "expected": "0", "checkBrute": True},
        # Corner 4: N=1
        {"input": fmt_case(10**9, [5]), "hidden": True, "checkBrute": True},
        # Corner 5: Anti-middle-pairing trap [1, 3, 5, 7], K=2 -> must pair (1,3) and (5,7), NOT (3,5)!
        {"input": fmt_case(2, [7, 3, 1, 5]), "hidden": True, "checkBrute": True},
        # Corner 6: Exact boundary 0 and 10^9 with K = 10^9 and K = 10^9 - 1
        {"input": fmt_case(10**9 - 1, [0, 10**9, 0, 10**9]), "hidden": True, "checkBrute": True},
        {"input": fmt_case(10**9, [0, 10**9, 500000000]), "hidden": True, "checkBrute": True},
        # Corner 7: Odd-length tightly packed clusters
        {"input": fmt_case(1, [1, 2, 3, 10, 11, 12, 20, 21, 22, 23, 24]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(5, [rng.randint(0, 40) for _ in range(14)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case(10, [rng.randint(0, 500) for _ in range(200)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case(100, [rng.randint(0, 2000) for _ in range(1500)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case(0, [rng.randint(0, 100) for _ in range(5000)]), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case(50000, [rng.randint(0, 10**9) for _ in range(12000)]), "hidden": True},
        {"input": fmt_case(10**7, [rng.randint(0, 10**9) for _ in range(12500)]), "hidden": True},
        {"input": fmt_case(2, [rng.randint(0, 9999) for _ in range(25000)]), "hidden": True},
        {"input": fmt_case(1, [rng.randint(0, 999) for _ in range(30000)]), "hidden": True},
    ]

    extra_stress = [
        fmt_case(rng.randint(0, 15), [rng.randint(0, 30) for _ in range(rng.randint(1, 13))])
        for _ in range(25)
    ]

    return {
        "slug": "cp04-max-pairs-within-k",
        "title": "Ghép cặp kỹ năng tương đồng",
        "shortDescription": "Tìm số lượng cặp học sinh tối đa có thể ghép sao cho chênh lệch kỹ năng trong mỗi cặp không vượt quá K.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.greedy_basics",
        "tags": ["tham lam", "sắp xếp", "tầng 1"],
        "statement": r"""Câu lạc bộ tin học có $N$ học sinh, học sinh thứ $i$ có chỉ số kỹ năng là số nguyên không âm $a_i$ ($0 \le a_i \le 10^9$). Để tổ chức buổi luyện tập theo đôi, huấn luyện viên muốn ghép các học sinh thành nhiều cặp nhất có thể với quy định:
- Mỗi học sinh chỉ thuộc **tối đa một** cặp.
- Hai học sinh $i$ và $j$ ($i \neq j$) có thể ghép thành một cặp nếu và chỉ nếu chênh lệch kỹ năng giữa họ không vượt quá ngưỡng $K$ cho trước, tức là $|a_i - a_j| \le K$.

Hãy tính số cặp học sinh nhiều nhất có thể ghép được.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N$ và $K$ ($1 \le N \le 30\,000$, $0 \le K \le 10^9$).
- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là số cặp tối đa ghép được.

**Giải thích ví dụ:**
- Ở ví dụ 1 ($K = 2$), sau khi sắp xếp ta có dãy $[1, 3, 5, 7, 10]$. Ta ghép được $2$ cặp là $(1, 3)$ và $(5, 7)$, dư học sinh $10$. Nếu ghép $(3, 5)$ trước thì $1$ và $7$ đều không còn ai phù hợp để ghép và chỉ thu được $1$ cặp.
- Ở ví dụ 2 ($K = 0$), chỉ các học sinh có cùng kỹ năng mới ghép được: một cặp $(2, 2)$ và một cặp $(4, 4)$, tổng cộng $2$ cặp.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Sau khi sắp xếp, xét cặp phần tử liền kề theo lập luận trao đổi (Exchange Argument).",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Nếu sắp xếp mảng $a$ tăng dần: $a_1 \le a_2 \le \dots \le a_N$, hãy chú ý tới phần tử nhỏ nhất $a_1$. Nếu $a_1$ không thể ghép với $a_2$ (tức $a_2 - a_1 > K$), thì $a_1$ chắc chắn không thể ghép với bất kỳ phần tử nào khác.

**Gợi ý 2 (Ý tưởng thuật toán — Exchange Argument):**
Khi $a_2 - a_1 \le K$, luôn tồn tại một cách ghép tối ưu chứa đúng cặp $(a_1, a_2)$! Thật vậy, nếu trong lời giải tối ưu $a_1$ ghép với $a_j$ và $a_2$ ghép với $a_m$ ($j, m \ge 3$), ta có thể đổi lại thành $(a_1, a_2)$ và $(a_j, a_m)$ mà vẫn đảm bảo $|a_j - a_m| \le K$.

**Gợi ý 3 (Cài đặt & Lưu ý):**
Sắp xếp mảng tăng dần rồi duyệt con trỏ `i` từ $0$ đến $N - 2$:
- Nếu `a[i + 1] - a[i] <= K`: tăng đáp án lên $1$ và nhảy `i += 2`.
- Ngược lại: bỏ qua `a[i]` và tăng `i += 1`.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    sort(a.begin(), a.end());
    int ans = 0;
    for (int i = 0; i + 1 < n; ) {
        if (a[i + 1] - a[i] <= k) {
            ++ans;
            i += 2;
        } else {
            ++i;
        }
    }

    cout << ans << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    a.sort()

    ans = 0
    i = 0
    while i + 1 < n:
        if a[i + 1] - a[i] <= k:
            ans += 1
            i += 2
        else:
            i += 1
    print(ans)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 3. cp04-min-k-range-diff
# =============================================================================
def build_p03() -> Dict[str, Any]:
    rng = random.Random(403)

    def fmt_case(k: int, arr: List[int]) -> str:
        return f"{len(arr)} {k}\n" + " ".join(map(str, arr))

    def brute_p03(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n, k = tokens[0], tokens[1]
        a = tokens[2:2 + n]
        best = None
        for comb in itertools.combinations(a, k):
            diff = max(comb) - min(comb)
            if best is None or diff < best:
                best = diff
        return str(best)

    tests = [
        {"input": fmt_case(3, [10, 100, 300, 200, 1000, 20, 30]), "hidden": False, "expected": "20", "checkBrute": True},
        {"input": fmt_case(4, [-5, 2, -1, 0, 8, -3]), "hidden": False, "expected": "5", "checkBrute": True},
        {"input": fmt_case(1, [-10**9, 10**9]), "hidden": False, "expected": "0", "checkBrute": True},
        # Corner 4: N=1, K=1
        {"input": fmt_case(1, [42]), "hidden": True, "checkBrute": True},
        # Corner 5: K=N with max range [-10^9, 10^9] -> 2*10^9
        {"input": fmt_case(4, [-10**9, 0, 500, 10**9]), "hidden": True, "checkBrute": True},
        # Corner 6: All duplicates
        {"input": fmt_case(5, [-7] * 10), "hidden": True, "checkBrute": True},
        # Corner 7: Optimal window at the very end
        {"input": fmt_case(3, [-100, -50, 0, 100, 101, 102]), "hidden": True, "checkBrute": True},
        # Corner 8: Optimal window at the very beginning
        {"input": fmt_case(3, [500, 1, 2, 3, 100, 200]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(6, [rng.randint(-50, 50) for _ in range(15)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case(10, [rng.randint(-1000, 1000) for _ in range(100)]), "hidden": True},
        {"input": fmt_case(50, [rng.randint(-10**6, 10**6) for _ in range(1000)]), "hidden": True},
        {"input": fmt_case(200, [rng.randint(-10**9, 10**9) for _ in range(3000)]), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case(500, [rng.randint(-10**9, 10**9) for _ in range(11000)]), "hidden": True},
        {"input": fmt_case(11500, [rng.randint(-10**9, 10**9) for _ in range(11500)]), "hidden": True},
        {"input": fmt_case(5000, [rng.randint(-9999, 9999) for _ in range(22000)]), "hidden": True},
        {"input": fmt_case(12345, [rng.randint(-999, 999) for _ in range(30000)]), "hidden": True},
    ]

    extra_stress = [
        fmt_case(rng.randint(1, n), [rng.randint(-100, 100) for _ in range(n)])
        for n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 10, 12, 14, 13, 11]
    ]

    return {
        "slug": "cp04-min-k-range-diff",
        "title": "Chọn K phần tử ít chênh lệch nhất",
        "shortDescription": "Chọn đúng K phần tử từ mảng sao cho hiệu giữa phần tử lớn nhất và nhỏ nhất trong nhóm được chọn là nhỏ nhất.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.top_k_selection",
        "tags": ["sắp xếp", "tham lam", "tầng 1"],
        "statement": r"""Cho một mảng gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$) và một số nguyên dương $K$ ($1 \le K \le N$).

Hãy chọn đúng $K$ phần tử ở $K$ vị trí phân biệt trong mảng sao cho độ chênh lệch giữa phần tử lớn nhất và phần tử nhỏ nhất trong $K$ phần tử được chọn đạt giá trị **nhỏ nhất có thể**.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên dương $N$ và $K$ ($1 \le K \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($-10^9 \le a_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là giá trị chênh lệch nhỏ nhất có thể.

**Giải thích ví dụ:**
- Ở ví dụ 1 ($K = 3$), ta chọn bộ ba $\{10, 20, 30\}$, khi đó $\max - \min = 30 - 10 = 20$ là nhỏ nhất.
- Ở ví dụ 2 ($K = 4$), sau khi sắp xếp ta có $[-5, -3, -1, 0, 2, 8]$. Cửa sổ $[-3, -1, 0, 2]$ cho hiệu $2 - (-3) = 5$ nhỏ nhất.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Hiệu hai số trong đoạn [-10^9, 10^9] có thể lên đến 2 × 10^9, nên dùng kiểu 64-bit (long long) trong C++.",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Thứ tự ban đầu của các phần tử trong mảng không ảnh hưởng đến việc chọn tập con $K$ phần tử. Vì vậy ta có thể sắp xếp mảng tăng dần trước: $a_0 \le a_1 \le \dots \le a_{N-1}$.

**Gợi ý 2 (Ý tưởng thuật toán):**
Nếu tập $K$ phần tử được chọn có phần tử nhỏ nhất là $a_i$ và lớn nhất là $a_j$, thì giữa $a_i$ và $a_j$ trong mảng đã sắp xếp phải có ít nhất $K - 2$ phần tử khác, tức $j \ge i + K - 1$. Để $a_j - a_i$ nhỏ nhất với $a_i$ cố định, ta luôn chọn đúng $K$ phần tử liên tiếp $a_i, a_{i+1}, \dots, a_{i+K-1}$.

**Gợi ý 3 (Cài đặt & Lưu ý):**
Sau khi sắp xếp, duyệt cửa sổ trượt độ dài $K$: tính $\min_{0 \le i \le N - K} (a_{i + K - 1} - a_i)$. Với $K = 1$, đáp án luôn bằng $0$.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    sort(a.begin(), a.end());
    long long ans = a[k - 1] - a[0];
    for (int i = 1; i + k - 1 < n; ++i) {
        ans = min(ans, a[i + k - 1] - a[i]);
    }

    cout << ans << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    a.sort()

    ans = a[k - 1] - a[0]
    for i in range(1, n - k + 1):
        diff = a[i + k - 1] - a[i]
        if diff < ans:
            ans = diff
    print(ans)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 4. cp04-activity-selection
# =============================================================================
def build_p04() -> Dict[str, Any]:
    rng = random.Random(404)

    def fmt_case(ivs: List[tuple[int, int]]) -> str:
        lines = [str(len(ivs))]
        for l, r in ivs:
            lines.append(f"{l} {r}")
        return "\n".join(lines)

    def brute_p04(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        ivs = [(tokens[1 + 2 * i], tokens[2 + 2 * i]) for i in range(n)]
        if n <= 14:
            # Independent exact 2^N subset check
            best = 0
            for mask in range(1, 1 << n):
                cnt = mask.bit_count()
                if cnt <= best:
                    continue
                chosen = [ivs[i] for i in range(n) if (mask >> i) & 1]
                chosen.sort()
                ok = True
                for j in range(1, len(chosen)):
                    if chosen[j][0] < chosen[j - 1][1]:
                        ok = False
                        break
                if ok:
                    best = cnt
            return str(best)
        # Independent O(N^2) DP sorted by start time
        ivs.sort()
        dp = [1] * n
        for i in range(n):
            for j in range(i):
                if ivs[j][1] <= ivs[i][0] and dp[j] + 1 > dp[i]:
                    dp[i] = dp[j] + 1
        return str(max(dp))

    def gen_rand_ivs(n: int, max_coord: int, max_len: int) -> List[tuple[int, int]]:
        res = []
        for _ in range(n):
            l = rng.randint(0, max_coord - 1)
            r = min(max_coord, l + rng.randint(1, max_len))
            res.append((l, r))
        return res

    tests = [
        {"input": fmt_case([(1, 4), (3, 5), (0, 6), (5, 7), (8, 9), (5, 9)]), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt_case([(0, 5), (4, 6), (5, 10)]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_case([(0, 2), (2, 4), (4, 6), (6, 8)]), "hidden": False, "expected": "4", "checkBrute": True},
        # Corner 4: N=1 starting at 0
        {"input": fmt_case([(0, 1)]), "hidden": True, "checkBrute": True},
        # Corner 5: Anti-earliest-start-time
        {"input": fmt_case([(0, 10**9), (1, 2), (2, 3), (3, 4), (4, 5)]), "hidden": True, "checkBrute": True},
        # Corner 6: Anti-shortest-interval chain
        {"input": fmt_case([(0, 10), (9, 11), (10, 20), (19, 21), (20, 30)]), "hidden": True, "checkBrute": True},
        # Corner 7: Nested & identical intervals
        {"input": fmt_case([(1, 100), (2, 99), (3, 98), (4, 97), (50, 51), (50, 51), (50, 51)]), "hidden": True, "checkBrute": True},
        # Corner 8: Large 10^9 boundary touching
        {"input": fmt_case([(0, 500000000), (500000000, 10**9), (1, 10**9), (499999999, 500000001)]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(gen_rand_ivs(14, 30, 10)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_ivs(150, 1000, 120)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_ivs(300, 10**9, 10**8)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_ivs(2000, 10**5, 500)), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case(gen_rand_ivs(6500, 10**9, 10**7)), "hidden": True},
        {"input": fmt_case([(i * 100000, (i + 1) * 100000) for i in range(6000)]), "hidden": True},
        {"input": fmt_case(gen_rand_ivs(15000, 999, 50)), "hidden": True},
        {"input": fmt_case(gen_rand_ivs(22000, 99, 15)), "hidden": True},
    ]

    extra_stress = [
        fmt_case(gen_rand_ivs(rng.randint(1, 13), rng.randint(5, 25), rng.randint(2, 10)))
        for _ in range(25)
    ]

    return {
        "slug": "cp04-activity-selection",
        "title": "Sắp lịch cuộc họp tối đa",
        "shortDescription": "Chọn nhiều cuộc họp không giao nhau nhất từ danh sách các khoảng thời gian nửa mở [L, R).",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.greedy_scheduling",
        "tags": ["tham lam", "sắp xếp", "lập lịch", "tầng 2"],
        "statement": r"""Một phòng hội thảo duy nhất nhận được $N$ yêu cầu đặt lịch họp. Cuộc họp thứ $i$ diễn ra trong khoảng thời gian nửa mở $[L_i, R_i)$ với $0 \le L_i < R_i \le 10^9$.

Hai cuộc họp $i$ và $j$ được coi là **không giao nhau** nếu chúng có thể diễn ra trong cùng một phòng, tức là $R_i \le L_j$ hoặc $R_j \le L_i$ (một cuộc họp mới có thể bắt đầu ngay tại thời điểm cuộc họp trước vừa kết thúc).

Hãy tìm số lượng cuộc họp **nhiều nhất** có thể được chấp nhận.

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 25\,000$).
- Trong $N$ dòng tiếp theo, dòng thứ $i$ gồm hai số nguyên $L_i$ và $R_i$ ($0 \le L_i < R_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là số cuộc họp tối đa có thể chọn.

**Giải thích ví dụ:**
- Ở ví dụ 1, ta có thể chọn $3$ cuộc họp: $[1, 4)$, $[5, 7)$ và $[8, 9)$.
- Ở ví dụ 2, nếu chọn tham lam theo thời lượng ngắn nhất $[4, 6)$ ta sẽ chặn cả hai cuộc họp $[0, 5)$ và $[5, 10)$; cách tối ưu là chọn $[0, 5)$ và $[5, 10)$ để đạt $2$ cuộc họp.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Khởi tạo thời điểm kết thúc trước đó bằng -1 vì cuộc họp có thể bắt đầu tại L = 0.",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Các chiến lược tham lam như "chọn cuộc họp bắt đầu sớm nhất" hay "chọn cuộc họp có thời lượng ngắn nhất" đều dễ dàng bị phản ví dụ đánh bại. Hãy nghĩ xem yếu tố nào giúp ta còn lại nhiều khoảng thời gian trống phía sau nhất.

**Gợi ý 2 (Ý tưởng thuật toán — Earliest Finish Time):**
Sắp xếp tất cả cuộc họp theo thời điểm kết thúc $R_i$ **tăng dần**. Cuộc họp kết thúc sớm nhất $e_1$ luôn thuộc về một phương án tối ưu nào đó: nếu phương án tối ưu chọn cuộc họp đầu tiên là $x$ với $R_x \ge R_{e_1}$, ta thay $x$ bằng $e_1$ mà không gây xung đột với bất kỳ cuộc họp nào phía sau.

**Gợi ý 3 (Cài đặt & Lưu ý):**
Khởi tạo `last_end = -1` (tránh khởi tạo bằng `0` nếu có cuộc họp bắt đầu tại `0`). Duyệt từng cuộc họp `(L, R)` theo thứ tự $R$ tăng dần: nếu `L >= last_end` thì chọn cuộc họp này và cập nhật `last_end = R`.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<pair<long long, long long>> iv(n);
    for (int i = 0; i < n; ++i) {
        cin >> iv[i].first >> iv[i].second;
    }

    sort(iv.begin(), iv.end(), [](const auto& a, const auto& b) {
        if (a.second != b.second) return a.second < b.second;
        return a.first < b.first;
    });

    int ans = 0;
    long long last_end = -1;
    for (const auto& [l, r] : iv) {
        if (l >= last_end) {
            ++ans;
            last_end = r;
        }
    }

    cout << ans << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    iv = []
    idx = 1
    for _ in range(n):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        iv.append((l, r))

    iv.sort(key=lambda x: (x[1], x[0]))
    ans = 0
    last_end = -1
    for l, r in iv:
        if l >= last_end:
            ans += 1
            last_end = r
    print(ans)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 5. cp04-min-meeting-rooms
# =============================================================================
def build_p05() -> Dict[str, Any]:
    rng = random.Random(405)

    def fmt_case(ivs: List[tuple[int, int]]) -> str:
        lines = [str(len(ivs))]
        for l, r in ivs:
            lines.append(f"{l} {r}")
        return "\n".join(lines)

    def brute_p05(inp: str) -> str:
        # Independent O(N^2) occupancy check at every start coordinate L_i
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        ivs = [(tokens[1 + 2 * i], tokens[2 + 2 * i]) for i in range(n)]
        ans = 0
        for l_i, _ in ivs:
            cnt = 0
            for l_j, r_j in ivs:
                if l_j <= l_i < r_j:
                    cnt += 1
            if cnt > ans:
                ans = cnt
        return str(ans)

    def gen_rand_ivs(n: int, max_coord: int, max_len: int) -> List[tuple[int, int]]:
        res = []
        for _ in range(n):
            l = rng.randint(0, max_coord - 1)
            r = min(max_coord, l + rng.randint(1, max_len))
            res.append((l, r))
        return res

    tests = [
        {"input": fmt_case([(0, 30), (5, 10), (15, 20)]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_case([(0, 5), (5, 10), (10, 15)]), "hidden": False, "expected": "1", "checkBrute": True},
        {"input": fmt_case([(1, 10), (2, 10), (3, 10), (10, 20), (10, 20)]), "hidden": False, "expected": "3", "checkBrute": True},
        # Corner 4: N=1
        {"input": fmt_case([(0, 10**9)]), "hidden": True, "checkBrute": True},
        # Corner 5: Many simultaneous ends and starts at exact same timestamp t=100
        {"input": fmt_case([(0, 100)] * 5 + [(100, 200)] * 5 + [(200, 300)] * 4), "hidden": True, "checkBrute": True},
        # Corner 6: Nested intervals all overlapping
        {"input": fmt_case([(i, 1000 - i) for i in range(50)]), "hidden": True, "checkBrute": True},
        # Corner 7: Point-touching chain mixed with one full-span interval
        {"input": fmt_case([(0, 10**9)] + [(i * 1000, (i + 1) * 1000) for i in range(20)]), "hidden": True, "checkBrute": True},
        # Corner 8: Exact identical intervals
        {"input": fmt_case([(123456789, 987654321)] * 12), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(gen_rand_ivs(100, 50, 15)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_ivs(300, 1000, 200)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_ivs(500, 10**9, 10**8)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_ivs(2000, 10**4, 1000)), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case(gen_rand_ivs(6500, 10**9, 2 * 10**8)), "hidden": True},
        {"input": fmt_case([(0, 500000000)] * 3000 + [(500000000, 10**9)] * 3000), "hidden": True},
        {"input": fmt_case(gen_rand_ivs(15000, 999, 200)), "hidden": True},
        {"input": fmt_case(gen_rand_ivs(22000, 99, 30)), "hidden": True},
    ]

    extra_stress = [
        fmt_case(gen_rand_ivs(rng.randint(1, 40), rng.randint(5, 30), rng.randint(1, 15)))
        for _ in range(25)
    ]

    return {
        "slug": "cp04-min-meeting-rooms",
        "title": "Số phòng học tối thiểu",
        "shortDescription": "Tính số phòng học ít nhất cần bố trí để tất cả N lớp học theo khung giờ [L, R) diễn ra mà không xung đột.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.greedy_scheduling",
        "tags": ["tham lam", "sắp xếp", "sweep line", "tầng 2"],
        "statement": r"""Một trung tâm đào tạo cần xếp phòng cho $N$ lớp học trong ngày. Lớp học thứ $i$ diễn ra trong khoảng thời gian nửa mở $[L_i, R_i)$ ($0 \le L_i < R_i \le 10^9$).

Tại mọi thời điểm, một phòng học chỉ có thể phục vụ tối đa một lớp. Nếu một lớp kết thúc tại thời điểm $t$ và một lớp khác bắt đầu đúng tại thời điểm $t$, hai lớp đó **có thể** dùng chung một phòng (vì khoảng thời gian là nửa mở $[L_i, R_i)$).

Hãy tính số phòng học **ít nhất** cần dùng để tổ chức trọn vẹn cả $N$ lớp học.

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 25\,000$).
- Trong $N$ dòng tiếp theo, dòng thứ $i$ gồm hai số nguyên $L_i$ và $R_i$ ($0 \le L_i < R_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là số phòng học tối thiểu cần thiết.

**Giải thích ví dụ:**
- Ở ví dụ 1, lớp $[0, 30)$ trùng thời gian với $[5, 10)$ và $[15, 20)$, nhưng $[5, 10)$ và $[15, 20)$ không giao nhau nên dùng chung phòng thứ hai. Do đó chỉ cần $2$ phòng.
- Ở ví dụ 2, ba lớp nối tiếp $[0, 5)$, $[5, 10)$, $[10, 15)$ không chồng lấn nên chỉ cần đúng $1$ phòng.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Khi dùng kỹ thuật quét sự kiện (Sweep Line), tại cùng một thời điểm t cần xử lý sự kiện kết thúc (-1) trước sự kiện bắt đầu (+1).",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Theo định lý phân hoạch đồ thị khoảng (Interval Graph Coloring), số phòng tối thiểu cần dùng đúng bằng **số lớp học tối đa diễn ra đồng thời** tại cùng một thời điểm nào đó.

**Gợi ý 2 (Ý tưởng thuật toán — Sweep Line):**
Biến mỗi lớp học $[L_i, R_i)$ thành hai sự kiện trên trục thời gian:
- `(L_i, +1)`: tăng số lớp đang học lên $1$;
- `(R_i, -1)`: giảm số lớp đang học xuống $1$.
Sắp xếp toàn bộ $2N$ sự kiện theo thời điểm tăng dần rồi quét từ trái sang phải, cập nhật tổng tiền tố lớn nhất.

**Gợi ý 3 (Cài đặt & Lưu ý):**
Rất dễ sai ở trường hợp hai lớp chạm đầu mút $R_i = L_j = t$: vì lớp cũ đã trả phòng trước khi lớp mới vào, ta phải đặt sự kiện `(t, -1)` **trước** `(t, +1)`. Khi lưu dưới dạng cặp `(time, delta)` và sắp xếp mặc định, `-1 < +1` nên thứ tự này tự động đúng!""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<pair<long long, int>> events;
    events.reserve(2 * n);
    for (int i = 0; i < n; ++i) {
        long long l, r;
        cin >> l >> r;
        events.emplace_back(l, 1);
        events.emplace_back(r, -1);
    }

    sort(events.begin(), events.end());

    int cur = 0, ans = 0;
    for (const auto& [t, delta] : events) {
        cur += delta;
        ans = max(ans, cur);
    }

    cout << ans << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


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
    ans = 0
    for _, delta in events:
        cur += delta
        if cur > ans:
            ans = cur
    print(ans)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 6. cp04-weighted-job-completion
# =============================================================================
def build_p06() -> Dict[str, Any]:
    rng = random.Random(406)

    def fmt_case(jobs: List[tuple[int, int]]) -> str:
        lines = [str(len(jobs))]
        for t, w in jobs:
            lines.append(f"{t} {w}")
        return "\n".join(lines)

    def brute_p06(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        jobs = [(tokens[1 + 2 * i], tokens[2 + 2 * i]) for i in range(n)]
        if n <= 8:
            # Independent exact N! permutation search
            best = None
            for perm in itertools.permutations(jobs):
                cur = 0
                cost = 0
                for t, w in perm:
                    cur += t
                    cost += w * cur
                if best is None or cost < best:
                    best = cost
            return str(best)
        # Independent exact bitmask DP O(N * 2^N) for 9 <= N <= 14
        inf = 10**30
        size = 1 << n
        sum_t = [0] * size
        for mask in range(1, size):
            lsb = mask & -mask
            i = lsb.bit_length() - 1
            sum_t[mask] = sum_t[mask ^ lsb] + jobs[i][0]
        dp = [inf] * size
        dp[0] = 0
        for mask in range(1, size):
            c_time = sum_t[mask]
            sub = mask
            best = inf
            while sub:
                lsb = sub & -sub
                i = lsb.bit_length() - 1
                sub ^= lsb
                cand = dp[mask ^ lsb] + jobs[i][1] * c_time
                if cand < best:
                    best = cand
            dp[mask] = best
        return str(dp[size - 1])

    def gen_rand_jobs(n: int, max_t: int, max_w: int) -> List[tuple[int, int]]:
        return [(rng.randint(1, max_t), rng.randint(1, max_w)) for _ in range(n)]

    tests = [
        {"input": fmt_case([(3, 10), (2, 1)]), "hidden": False, "expected": "35", "checkBrute": True},
        {"input": fmt_case([(2, 3), (10, 12)]), "hidden": False, "expected": "150", "checkBrute": True},
        {"input": fmt_case([(1, 4), (10, 5), (2, 6)]), "hidden": False, "expected": "87", "checkBrute": True},
        # Corner 4: N=1 max values
        {"input": fmt_case([(10000, 10000)]), "hidden": True, "checkBrute": True},
        # Corner 5: Equal ratios t/w -> any order gives same cost
        {"input": fmt_case([(1, 2), (2, 4), (3, 6), (5, 10), (4, 8)]), "hidden": True, "checkBrute": True},
        # Corner 6: Very close ratios (9999/10000 vs 9998/9999 vs 10000/10000)
        {"input": fmt_case([(10000, 10000), (9999, 10000), (9998, 9999), (9997, 9998), (10000, 9999)]), "hidden": True, "checkBrute": True},
        # Corner 7: Anti-greedy by w-t, by t, by w simultaneously
        {"input": fmt_case([(2, 3), (10, 12), (5, 6), (1, 1), (4, 5), (3, 4), (8, 9), (6, 8)]), "hidden": True, "checkBrute": True},
        # Corner 8: Overflow int32 with small N=14 (sum ~ 10^10)
        {"input": fmt_case([(10000, 10000)] * 14), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(gen_rand_jobs(13, 100, 100)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_jobs(200, 1000, 1000)), "hidden": True},
        {"input": fmt_case(gen_rand_jobs(1000, 10000, 10000)), "hidden": True},
        {"input": fmt_case(gen_rand_jobs(5000, 10000, 10000)), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case([(10000, 10000)] * 11500), "hidden": True},  # huge int64 ~ 6.6 * 10^15
        {"input": fmt_case(gen_rand_jobs(12500, 10000, 10000)), "hidden": True},
        {"input": fmt_case(gen_rand_jobs(18000, 999, 999)), "hidden": True},
        {"input": fmt_case(gen_rand_jobs(24000, 99, 99)), "hidden": True},
    ]

    extra_stress = [
        fmt_case(gen_rand_jobs(rng.randint(1, 8), rng.randint(1, 50), rng.randint(1, 50)))
        for _ in range(20)
    ] + [
        fmt_case(gen_rand_jobs(rng.randint(9, 12), 10000, 10000))
        for _ in range(6)
    ]

    return {
        "slug": "cp04-weighted-job-completion",
        "title": "Tối ưu tổng phạt hoàn thành công việc",
        "shortDescription": "Sắp xếp thứ tự thực hiện N công việc có thời gian xử lý và trọng số phạt để tối thiểu hóa tổng chi phí hoàn thành có trọng số.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.greedy_basics",
        "tags": ["tham lam", "sắp xếp", "tối ưu", "tầng 2"],
        "statement": r"""Một máy chủ cần xử lý tuần tự $N$ công việc bắt đầu từ thời điểm $0$ (tại mỗi thời điểm chỉ làm một công việc và không ngắt quãng giữa chừng). Công việc thứ $i$ cần thời gian thực hiện là $t_i$ và có trọng số phạt $w_i$ ($1 \le t_i, w_i \le 10^4$).

Nếu ta chọn một thứ tự thực hiện $N$ công việc và công việc $i$ hoàn thành tại thời điểm $C_i$ (bằng tổng thời gian $t$ của chính nó và các công việc thực hiện trước nó), chi phí phạt của công việc $i$ là $w_i \cdot C_i$.

Hãy tìm thứ tự thực hiện tối ưu sao cho tổng chi phí phạt
$$\sum_{i=1}^{N} w_i \cdot C_i$$
là **nhỏ nhất có thể**, và in ra giá trị tổng chi phí nhỏ nhất đó.

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 25\,000$).
- Trong $N$ dòng tiếp theo, dòng thứ $i$ gồm hai số nguyên dương $t_i$ và $w_i$ ($1 \le t_i, w_i \le 10^4$).

### Kết quả
- Một số nguyên duy nhất là tổng chi phí phạt nhỏ nhất.

**Giải thích ví dụ:**
- Ở ví dụ 1, làm công việc $(t=3, w=10)$ trước rồi $(t=2, w=1)$ cho tổng phạt $3 \times 10 + (3 + 2) \times 1 = 35$, nhỏ hơn làm ngược lại ($2 \times 1 + 5 \times 10 = 52$).
- Ở ví dụ 2, chọn $(2, 3)$ trước $(10, 12)$ cho chi phí $2 \times 3 + 12 \times 12 = 150$, nhỏ hơn thứ tự ngược lại ($10 \times 12 + 12 \times 3 = 156$). Chú ý rằng chiến lược sắp theo hiệu $w_i - t_i$ giảm dần sẽ cho kết quả sai trên ví dụ này!""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Kết quả có thể lên tới 3.2 × 10^16 (vượt int32), bắt buộc dùng kiểu long long trong C++ và tránh sai số dấu phẩy động khi so sánh.",
        "hints": r"""**Gợi ý 1 (Nhận xét — Phương pháp trao đổi phần tử liền kề):**
Xét hai công việc đứng liền kề nhau $A = (t_A, w_A)$ và $B = (t_B, w_B)$ sau khi đã chạy hết một tiền tố tốn thời gian $T$. Việc hoán đổi chỗ của $A$ và $B$ không hề ảnh hưởng tới thời điểm hoàn thành của mọi công việc khác!

**Gợi ý 2 (Ý tưởng thuật toán — Exchange Argument):**
- Đặt $A$ trước $B$ góp phần chi phí: $w_A(T + t_A) + w_B(T + t_A + t_B)$.
- Đặt $B$ trước $A$ góp phần chi phí: $w_B(T + t_B) + w_A(T + t_B + t_A)$.
Lấy hiệu hai biểu thức, ta thấy $A$ nên đứng trước $B$ khi và chỉ khi $w_B \cdot t_A < w_A \cdot t_B$, tương đương $\frac{t_A}{w_A} < \frac{t_B}{w_B}$ (luật Smith).

**Gợi ý 3 (Cài đặt & Lưu ý):**
Để tránh sai số số thực, hãy so sánh trực tiếp bằng phép nhân chéo số nguyên `a.t * b.w < b.t * a.w` (dùng kiểu `long long`). Khi cộng dồn thời gian `cur_time` và tổng `total_cost`, đều phải dùng `long long`.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

struct Job {
    long long t, w;
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<Job> jobs(n);
    for (int i = 0; i < n; ++i) {
        cin >> jobs[i].t >> jobs[i].w;
    }

    sort(jobs.begin(), jobs.end(), [](const Job& a, const Job& b) {
        return a.t * b.w < b.t * a.w;
    });

    long long cur_time = 0;
    long long total_cost = 0;
    for (const auto& j : jobs) {
        cur_time += j.t;
        total_cost += j.w * cur_time;
    }

    cout << total_cost << '\\n';
    return 0;
}""",
        "pythonSolution": """from functools import cmp_to_key
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    jobs = []
    idx = 1
    for _ in range(n):
        jobs.append((int(data[idx]), int(data[idx + 1])))
        idx += 2

    def cmp_jobs(a: tuple[int, int], b: tuple[int, int]) -> int:
        diff = a[0] * b[1] - b[0] * a[1]
        if diff < 0:
            return -1
        if diff > 0:
            return 1
        return 0

    jobs.sort(key=cmp_to_key(cmp_jobs))
    cur_time = 0
    total_cost = 0
    for t, w in jobs:
        cur_time += t
        total_cost += w * cur_time
    print(total_cost)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 7. cp04-count-inversions
# =============================================================================
def build_p07() -> Dict[str, Any]:
    rng = random.Random(407)

    def fmt_case(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    def brute_p07(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        a = tokens[1:1 + n]
        cnt = 0
        for i in range(n):
            ai = a[i]
            for j in range(i + 1, n):
                if ai > a[j]:
                    cnt += 1
        return str(cnt)

    tests = [
        {"input": fmt_case([2, 4, 1, 3, 5]), "hidden": False, "expected": "3", "checkBrute": True},
        {"input": fmt_case([5, 4, 3, 2, 1]), "hidden": False, "expected": "10", "checkBrute": True},
        {"input": fmt_case([3, 3, 3, 3]), "hidden": False, "expected": "0", "checkBrute": True},
        # Corner 4: N=1
        {"input": fmt_case([-10**9]), "hidden": True, "checkBrute": True},
        # Corner 5: Already sorted with negatives and max range
        {"input": fmt_case([-10**9, -500, -1, 0, 0, 1, 500, 10**9]), "hidden": True, "checkBrute": True},
        # Corner 6: Many duplicates mixed with inversions
        {"input": fmt_case([5, 3, 5, 3, 5, 3, 1, 1, 5, 1]), "hidden": True, "checkBrute": True},
        # Corner 7: Two sorted halves concatenated in wrong order
        {"input": fmt_case(list(range(50, 100)) + list(range(0, 50))), "hidden": True, "checkBrute": True},
        # Corner 8: Alternating high/low values with huge negatives
        {"input": fmt_case([10**9 if i % 2 == 0 else -10**9 for i in range(60)]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case([rng.randint(-100, 100) for _ in range(150)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([rng.randint(-10**9, 10**9) for _ in range(400)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([rng.randint(0, 5) for _ in range(500)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([rng.randint(-10**9, 10**9) for _ in range(3000)]), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case([rng.randint(-10**9, 10**9) for _ in range(11500)]), "hidden": True},
        {"input": fmt_case(list(range(24000, 0, -1))), "hidden": True},  # 287,988,000 inversions
        {"input": fmt_case([rng.randint(-999, 999) for _ in range(28000)]), "hidden": True},
        {"input": fmt_case([9 - (i * 10) // 30000 for i in range(30000)]), "hidden": True},  # 405,000,000 inversions
    ]

    extra_stress = [
        fmt_case([rng.randint(-20, 20) for _ in range(rng.randint(1, 60))])
        for _ in range(25)
    ]

    return {
        "slug": "cp04-count-inversions",
        "title": "Đếm số cặp nghịch thế",
        "shortDescription": "Đếm số cặp chỉ số (i, j) với i < j và a[i] > a[j] trong mảng bằng kỹ thuật chia để trị Merge Sort.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.divide_conquer_mod",
        "tags": ["chia để trị", "sắp xếp", "tối ưu", "tầng 2"],
        "statement": r"""Cho một mảng gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$). Một cặp chỉ số $(i, j)$ được gọi là một **cặp nghịch thế** (inversion) nếu thỏa mãn đồng thời hai điều kiện:
$$1 \le i < j \le N \quad \text{và} \quad a_i > a_j.$$

Số cặp nghịch thế đo mức độ "xáo trộn" của một dãy số so với thứ tự tăng dần. Hãy đếm tổng số cặp nghịch thế của mảng đã cho.

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($-10^9 \le a_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là số cặp nghịch thế của mảng.

**Giải thích ví dụ:**
- Ở ví dụ 1, mảng $[2, 4, 1, 3, 5]$ có đúng $3$ cặp nghịch thế: $(2, 1)$, $(4, 1)$ và $(4, 3)$.
- Ở ví dụ 2, mảng giảm ngặt độ dài $5$ có mọi cặp đều là nghịch thế: $\binom{5}{2} = 10$.
- Ở ví dụ 3, các phần tử bằng nhau không tạo thành cặp nghịch thế (vì điều kiện là $a_i > a_j$ ngặt), nên kết quả là $0$.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Số cặp nghịch thế có thể lên tới N(N - 1)/2 (dễ vượt int32 ở các giới hạn lớn hơn), hãy luôn dùng kiểu long long trong C++.",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Vòng lặp lồng nhau $O(N^2)$ sẽ quá chậm với $N = 30\,000$. Hãy chia mảng thành hai nửa trái và phải: mọi cặp nghịch thế hoặc nằm trọn trong nửa trái, hoặc nằm trọn trong nửa phải, hoặc có một phần tử bên trái và một phần tử bên phải.

**Gợi ý 2 (Ý tưởng thuật toán — Merge Sort):**
Kết hợp đếm nghịch thế ngay trong bước trộn (merge) của thuật toán Sắp xếp trộn (Merge Sort). Khi hai nửa $[l, \text{mid})$ và $[\text{mid}, r)$ đều đã được sắp xếp tăng dần, ta dùng hai con trỏ $i, j$:
- Nếu `a[i] <= a[j]`: đưa `a[i]` vào mảng tạm (chú ý dấu `<=` để không đếm nhầm phần tử bằng nhau!).
- Nếu `a[i] > a[j]`: vì nửa trái đã tăng dần, toàn bộ các phần tử từ `a[i]` đến `a[mid - 1]` đều lớn hơn `a[j]`, nên cộng thêm `mid - i` vào kết quả!

**Gợi ý 3 (Cài đặt & Lưu ý):**
Trong C++, cấp phát một mảng phụ `tmp` kích thước $N$ dùng chung cho mọi lần gọi đệ quy để tránh cấp phát lặp lại tốn thời gian, và dùng kiểu trả về `long long` cho biến đếm.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

long long merge_count(vector<long long>& a, vector<long long>& tmp, int l, int r) {
    if (r - l <= 1) return 0;
    int mid = l + (r - l) / 2;
    long long inv = merge_count(a, tmp, l, mid) + merge_count(a, tmp, mid, r);
    int i = l, j = mid, k = l;
    while (i < mid && j < r) {
        if (a[i] <= a[j]) {
            tmp[k++] = a[i++];
        } else {
            tmp[k++] = a[j++];
            inv += (mid - i);
        }
    }
    while (i < mid) tmp[k++] = a[i++];
    while (j < r) tmp[k++] = a[j++];
    for (int p = l; p < r; ++p) a[p] = tmp[p];
    return inv;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n), tmp(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    cout << merge_count(a, tmp, 0, n) << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


def sort_count(arr: list[int]) -> tuple[list[int], int]:
    n = len(arr)
    if n <= 1:
        return arr, 0
    mid = n // 2
    left, inv_l = sort_count(arr[:mid])
    right, inv_r = sort_count(arr[mid:])

    merged = []
    inv = inv_l + inv_r
    i = 0
    j = 0
    len_l = len(left)
    len_r = len(right)
    while i < len_l and j < len_r:
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            inv += len_l - i
            j += 1
    if i < len_l:
        merged.extend(left[i:])
    if j < len_r:
        merged.extend(right[j:])
    return merged, inv


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    _, ans = sort_count(a)
    print(ans)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 8. cp04-min-jumps-reach-end
# =============================================================================
def build_p08() -> Dict[str, Any]:
    rng = random.Random(408)

    def fmt_case(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    def brute_p08(inp: str) -> str:
        # Independent O(N^2) DP shortest path on DAG
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        a = tokens[1:1 + n]
        inf = 10**9
        dp = [inf] * n
        dp[0] = 0
        for i in range(n):
            if dp[i] == inf:
                continue
            limit = min(n - 1, i + a[i])
            nxt = dp[i] + 1
            for j in range(i + 1, limit + 1):
                if nxt < dp[j]:
                    dp[j] = nxt
        return str(-1 if dp[n - 1] == inf else dp[n - 1])

    tests = [
        {"input": fmt_case([2, 3, 1, 1, 4]), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": fmt_case([3, 2, 1, 0, 4]), "hidden": False, "expected": "-1", "checkBrute": True},
        {"input": fmt_case([0]), "hidden": False, "expected": "0", "checkBrute": True},
        # Corner 4: N=2 impossible (a1=0)
        {"input": fmt_case([0, 10]), "hidden": True, "checkBrute": True},
        # Corner 5: Anti-greedy jumping maximum distance every time (lands on 0)
        {"input": fmt_case([2, 5, 0, 0, 0, 1]), "hidden": True, "checkBrute": True},
        # Corner 6: Anti-greedy picking largest a[j] instead of largest j + a[j]
        {"input": fmt_case([3, 4, 1, 3, 0, 0, 1]), "hidden": True, "checkBrute": True},
        # Corner 7: Huge single jump from start (a1 = 10^9)
        {"input": fmt_case([10**9, 0, 0, 0, 0, 0]), "hidden": True, "checkBrute": True},
        # Corner 8: Unreachable only at the very last step
        {"input": fmt_case([1, 1, 1, 1, 1, 0, 5]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case([rng.randint(0, 4) for _ in range(100)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([rng.randint(1, 8) for _ in range(300)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([rng.randint(0, 10) for _ in range(500)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([1 if i < 998 else 0 for i in range(1000)]), "hidden": True, "checkBrute": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case([1] * 30000), "hidden": True},  # 29999 jumps
        {"input": fmt_case([1] * 29998 + [0, 5]), "hidden": True},  # -1 at very end
        {"input": fmt_case([rng.randint(1, 50) for _ in range(30000)]), "hidden": True},
        {"input": fmt_case([rng.randint(0, 10**9) if i % 7 == 0 else rng.randint(0, 5) for i in range(15000)]), "hidden": True},
    ]

    extra_stress = [
        fmt_case([rng.randint(0, rng.randint(1, 6)) for _ in range(rng.randint(1, 45))])
        for _ in range(30)
    ]

    return {
        "slug": "cp04-min-jumps-reach-end",
        "title": "Số bước nhảy ít nhất tới đích",
        "shortDescription": "Tìm số bước nhảy tối thiểu để đi từ vị trí 1 đến vị trí N khi tại vị trí i có thể nhảy tiến tối đa a[i] ô.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.greedy_scheduling",
        "tags": ["tham lam", "tối ưu", "tầng 2"],
        "statement": r"""Trên một đường đua thẳng có $N$ ô được đánh số từ $1$ đến $N$. Mỗi ô $i$ ghi một số nguyên không âm $a_i$ ($0 \le a_i \le 10^9$) biểu thị độ dài bước nhảy tối đa từ ô đó.

Khi đang đứng ở vị trí $i$, trong **một bước nhảy**, bạn có thể tiến tới bất kỳ vị trí $j$ nào thỏa mãn:
$$i + 1 \le j \le \min(N, i + a_i).$$
(Nếu $a_i = 0$, bạn không thể nhảy tiếp từ vị trí $i$.)

Xuất phát tại vị trí $1$, hãy tìm **số bước nhảy ít nhất** để tới được vị trí $N$. Nếu không tồn tại cách đi tới vị trí $N$, in ra `-1`.

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là số bước nhảy ít nhất để tới vị trí $N$, hoặc `-1` nếu không thể tới.

**Giải thích ví dụ:**
- Ở ví dụ 1, xuất phát ở ô $1$ ($a_1 = 2$), nhảy $1$ bước tới ô $2$ ($a_2 = 3$), rồi nhảy tiếp tới ô $5$: tổng cộng $2$ bước.
- Ở ví dụ 2, dù chọn cách nào ta cũng không thể vượt qua ô $4$ (có $a_4 = 0$), nên không thể tới ô $5$ (đáp án `-1`).
- Ở ví dụ 3, với $N = 1$ ta đã đứng sẵn tại đích nên cần $0$ bước nhảy.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N).\nLưu ý: Xử lý riêng trường hợp N = 1 (đáp án 0) và kiểm tra cẩn thận trường hợp bị kẹt giữa đường (không thể mở rộng tầm với).",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Tránh hai bẫy tham lam kinh điển: luôn nhảy xa nhất (`i -> i + a[i]`) có thể đáp đúng vào ô có giá trị `0`; còn chọn ô có `a[j]` lớn nhất chưa chắc đưa ta đi xa nhất vì còn phụ thuộc chỉ số `j` (phải tối đa hóa `j + a[j]`).

**Gợi ý 2 (Ý tưởng thuật toán — Tham lam theo tầng BFS):**
Tập các vị trí có thể tới được sau đúng $k$ bước nhảy luôn tạo thành một đoạn liên tiếp kết thúc tại `cur_end`. Khi duyệt các ô $i$ trong tầng hiện tại (từ đầu tầng đến `cur_end`), ta liên tục cập nhật tầm với xa nhất cho tầng tiếp theo: `farthest = max(farthest, i + a[i])`.

**Gợi ý 3 (Cài đặt & Lưu ý):**
- Nếu $N = 1$, in ngay `0`.
- Duyệt $i$ từ $0$ đến $N - 2$ (theo chỉ số 0): nếu `i > farthest` thì không tới được ô $i$, in `-1`. Cập nhật `farthest = max(farthest, i + a[i])`. Khi chạm ranh giới tầng hiện tại (`i == cur_end`): nếu `farthest <= i` tức không thể tiến thêm, in `-1`; ngược lại tăng `jumps += 1`, đặt `cur_end = farthest`, và dừng ngay khi `cur_end >= N - 1`.""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    if (n == 1) {
        cout << 0 << '\\n';
        return 0;
    }

    int jumps = 0;
    long long cur_end = 0;
    long long farthest = 0;
    for (int i = 0; i < n - 1; ++i) {
        if (i > farthest) {
            cout << -1 << '\\n';
            return 0;
        }
        farthest = max(farthest, static_cast<long long>(i) + a[i]);
        if (i == cur_end) {
            if (farthest <= i) {
                cout << -1 << '\\n';
                return 0;
            }
            ++jumps;
            cur_end = farthest;
            if (cur_end >= n - 1) break;
        }
    }

    if (cur_end >= n - 1) cout << jumps << '\\n';
    else cout << -1 << '\\n';
    return 0;
}""",
        "pythonSolution": """import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]

    if n == 1:
        print(0)
        return

    jumps = 0
    cur_end = 0
    farthest = 0
    for i in range(n - 1):
        if i > farthest:
            print(-1)
            return
        reach = i + a[i]
        if reach > farthest:
            farthest = reach
        if i == cur_end:
            if farthest <= i:
                print(-1)
                return
            jumps += 1
            cur_end = farthest
            if cur_end >= n - 1:
                break

    print(jumps if cur_end >= n - 1 else -1)


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 9. cp04-largest-concatenated-number
# =============================================================================
def build_p09() -> Dict[str, Any]:
    rng = random.Random(409)

    def fmt_case(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    def brute_p09(inp: str) -> str:
        tokens = inp.split()
        n = int(tokens[0])
        strs = [str(int(x)) for x in tokens[1:1 + n]]
        best = -1
        for perm in itertools.permutations(strs):
            val = int("".join(perm))
            if val > best:
                best = val
        return str(best)

    prefix_pool = [
        9, 98, 989, 9898, 9899, 98989, 98988,
        1, 12, 121, 1212, 12121, 123, 1213,
        83, 830, 8308, 83083, 830830, 0,
    ]

    tests = [
        {"input": fmt_case([3, 30, 34, 5, 9]), "hidden": False, "expected": "9534330", "checkBrute": True},
        {"input": fmt_case([0, 0, 0]), "hidden": False, "expected": "0", "checkBrute": True},
        {"input": fmt_case([12, 121, 123]), "hidden": False, "expected": "12312121", "checkBrute": True},
        # Corner 4: Single zero
        {"input": fmt_case([0]), "hidden": True, "checkBrute": True},
        # Corner 5: Zeros mixed with one non-zero
        {"input": fmt_case([0, 0, 50, 0, 0]), "hidden": True, "checkBrute": True},
        # Corner 6: Subtle cyclic prefix traps
        {"input": fmt_case([830, 8308, 83083, 83, 8, 83088]), "hidden": True, "checkBrute": True},
        # Corner 7: Powers of 10 and 10^9 boundary
        {"input": fmt_case([10**9, 10**8, 10**7, 10, 1, 999999999, 999999998]), "hidden": True, "checkBrute": True},
        # Corner 8: Anti-padding traps [432, 43243] and [34323, 3432]
        {"input": fmt_case([432, 43243, 34323, 3432, 43, 4]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case([rng.choice(prefix_pool) for _ in range(8)]), "hidden": True, "checkBrute": True},
        {"input": fmt_case([0] * 5000), "hidden": True},  # all zeros large -> "0"
        {"input": fmt_case([rng.choice(prefix_pool) for _ in range(500)]), "hidden": True},
        {"input": fmt_case([rng.randint(0, 10**9) for _ in range(2000)]), "hidden": True},
        # Large 13..16 (< 150KB for both input and output!)
        {"input": fmt_case([rng.randint(0, 10**9) for _ in range(11500)]), "hidden": True},
        {"input": fmt_case([rng.choice(prefix_pool) for _ in range(15000)]), "hidden": True},
        {"input": fmt_case([98765] * 15000), "hidden": True},
        {"input": fmt_case([rng.randint(0, 999999) for _ in range(15000)]), "hidden": True},
    ]

    extra_stress = [
        fmt_case([rng.choice(prefix_pool) for _ in range(rng.randint(1, 7))])
        for _ in range(25)
    ]

    return {
        "slug": "cp04-largest-concatenated-number",
        "title": "Ghép số lớn nhất",
        "shortDescription": "Sắp xếp lại N số nguyên không âm rồi ghép chuỗi biểu diễn thập phân của chúng để tạo thành số nguyên lớn nhất có thể.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.greedy_basics",
        "tags": ["tham lam", "sắp xếp", "xâu", "tầng 2"],
        "statement": r"""Cho $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$). Bạn được phép thay đổi thứ tự các số này tùy ý, sau đó viết liền biểu diễn thập phân của chúng lại với nhau để tạo thành một số nguyên duy nhất.

Hãy tìm số nguyên **lớn nhất có thể** tạo được.

*Lưu ý quan trọng:* Kết quả là một số nguyên hợp lệ, không chứa các chữ số `0` vô nghĩa ở đầu (đặc biệt, nếu toàn bộ $N$ số đều bằng `0`, kết quả phải là `0` chứ không phải `000...`).

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 15\,000$).
- Dòng thứ hai gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$).

### Kết quả
- Một dòng duy nhất là số nguyên lớn nhất tạo được sau khi ghép.

**Giải thích ví dụ:**
- Ở ví dụ 1, thứ tự ghép tối ưu cho $[3, 30, 34, 5, 9]$ là `9`, `5`, `34`, `3`, `30` tạo thành `9534330`. Chú ý rằng `3` đứng trước `30` (vì `"330" > "303"`), nhưng `34` lại đứng trước `3` (vì `"343" > "334"`).
- Ở ví dụ 2, tất cả các số đều là `0`, nên số nguyên lớn nhất là `0`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N · L) với L <= 10 là độ dài chữ số.\nLưu ý: Xử lý trường hợp tất cả các phần tử đều bằng 0.",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Sắp xếp theo thứ tự từ điển giảm dần thông thường sẽ bị sai khi một xâu là tiền tố của xâu kia (ví dụ `"30" > "3"` theo từ điển, nhưng `"330" > "303"`).

**Gợi ý 2 (Ý tưởng thuật toán — Exchange Argument):**
Với hai xâu chữ số `x` và `y`, việc đổi chỗ `x` và `y` khi chúng đứng cạnh nhau chỉ thay đổi đoạn ghép `x + y` thành `y + x` mà không đổi tổng độ dài số tạo thành. Do đó, `x` nên đứng trước `y` khi và chỉ khi `x + y > y + x` theo so sánh xâu! Ta có thể chứng minh quan hệ này có tính bắc cầu (vì tương đương so sánh giá trị $\frac{x}{10^{|x|} - 1}$).

**Gợi ý 3 (Cài đặt & Lưu ý):**
- Đọc các số (chuyển sang xâu thập phân chuẩn), sắp xếp bằng comparator `a + b > b + a` (C++ dùng lambda, Python dùng `functools.cmp_to_key`).
- Sau khi sắp xếp, nếu phần tử đứng đầu bằng `"0"` thì toàn bộ mảng đều là `0` — hãy in đúng `"0"` rồi kết thúc!""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<string> s(n);
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        s[i] = to_string(x);
    }

    sort(s.begin(), s.end(), [](const string& a, const string& b) {
        return a + b > b + a;
    });

    if (s[0] == "0") {
        cout << "0\\n";
        return 0;
    }

    for (const string& part : s) cout << part;
    cout << '\\n';
    return 0;
}""",
        "pythonSolution": """from functools import cmp_to_key
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    parts = [str(int(x)) for x in data[1:1 + n]]

    def cmp_str(a: str, b: str) -> int:
        ab = a + b
        ba = b + a
        if ab > ba:
            return -1
        if ab < ba:
            return 1
        return 0

    parts.sort(key=cmp_to_key(cmp_str))
    if parts[0] == "0":
        print("0")
    else:
        print("".join(parts))


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# =============================================================================
# 10. cp04-deadline-profit-scheduling
# =============================================================================
def build_p10() -> Dict[str, Any]:
    rng = random.Random(410)

    def fmt_case(jobs: List[tuple[int, int]]) -> str:
        lines = [str(len(jobs))]
        for d, p in jobs:
            lines.append(f"{d} {p}")
        return "\n".join(lines)

    def brute_p10(inp: str) -> str:
        tokens = list(map(int, inp.split()))
        n = tokens[0]
        jobs = [(tokens[1 + 2 * i], tokens[2 + 2 * i]) for i in range(n)]
        if n <= 12:
            # Independent exact 2^N subset enumeration checking feasibility condition
            best = 0
            for mask in range(1, 1 << n):
                ds = []
                profit = 0
                for i in range(n):
                    if (mask >> i) & 1:
                        ds.append(jobs[i][0])
                        profit += jobs[i][1]
                if profit <= best:
                    continue
                ds.sort()
                ok = True
                for k, d in enumerate(ds):
                    if d < k + 1:
                        ok = False
                        break
                if ok:
                    best = profit
            return str(best)
        # Independent dual algorithm: sort by profit DESC + assign latest free slot <= d
        order = sorted(jobs, key=lambda x: -x[1])
        used = [False] * (n + 1)
        total = 0
        for d, p in order:
            slot = min(d, n)
            while slot >= 1 and used[slot]:
                slot -= 1
            if slot >= 1:
                used[slot] = True
                total += p
        return str(total)

    def gen_rand_orders(n: int, max_d: int, max_p: int) -> List[tuple[int, int]]:
        return [(rng.randint(1, min(n, max_d)), rng.randint(1, max_p)) for _ in range(n)]

    tests = [
        {"input": fmt_case([(2, 100), (1, 19), (2, 27), (1, 25), (3, 15)]), "hidden": False, "expected": "142", "checkBrute": True},
        {"input": fmt_case([(1, 10), (2, 100), (2, 100)]), "hidden": False, "expected": "200", "checkBrute": True},
        {"input": fmt_case([(1, 50), (1, 80), (1, 30)]), "hidden": False, "expected": "80", "checkBrute": True},
        # Corner 4: N=1
        {"input": fmt_case([(1, 10**9)]), "hidden": True, "checkBrute": True},
        # Corner 5: All deadlines = N -> take all, huge int32 overflow
        {"input": fmt_case([(10, 10**9 - i) for i in range(10)]), "hidden": True, "checkBrute": True},
        # Corner 6: Staircase bottleneck trap
        {"input": fmt_case([(1, 5), (2, 10), (2, 10), (3, 100), (3, 100), (3, 100), (4, 1), (4, 2)]), "hidden": True, "checkBrute": True},
        # Corner 7: Unsorted deadlines with tie-profits
        {"input": fmt_case([(4, 50), (1, 50), (2, 50), (2, 50), (1, 10), (3, 50), (3, 100), (4, 100), (4, 100), (4, 100)]), "hidden": True, "checkBrute": True},
        # Corner 8: All deadline 1 among 100 orders
        {"input": fmt_case([(1, rng.randint(1, 10**9)) for _ in range(100)]), "hidden": True, "checkBrute": True},
        # Medium 9..12
        {"input": fmt_case(gen_rand_orders(12, 6, 1000)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_orders(200, 100, 10**9)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_orders(600, 300, 10**9)), "hidden": True, "checkBrute": True},
        {"input": fmt_case(gen_rand_orders(2000, 1000, 10**9)), "hidden": True},
        # Large 13..16 (< 150KB)
        {"input": fmt_case(gen_rand_orders(8000, 4000, 10**9)), "hidden": True},  # profit sum ~ 3 * 10^12
        {"input": fmt_case([(8500, 10**9)] * 8500), "hidden": True},  # exact 8.5 * 10^12
        {"input": fmt_case(gen_rand_orders(16000, 999, 9999)), "hidden": True},
        {"input": fmt_case(gen_rand_orders(23000, 99, 99)), "hidden": True},
    ]

    extra_stress = [
        fmt_case(gen_rand_orders(rng.randint(1, 11), rng.randint(1, 8), 1000))
        for _ in range(20)
    ] + [
        fmt_case(gen_rand_orders(rng.randint(50, 150), rng.randint(10, 80), 10**9))
        for _ in range(8)
    ]

    return {
        "slug": "cp04-deadline-profit-scheduling",
        "title": "Lập lịch đơn hàng tối đa lợi nhuận",
        "shortDescription": "Chọn và xếp lịch các đơn hàng mất 1 đơn vị thời gian có hạn chót và lợi nhuận để đạt tổng lợi nhuận lớn nhất.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.greedy_scheduling",
        "tags": ["tham lam", "heap", "lập lịch", "tối ưu", "tầng 2"],
        "statement": r"""Một xưởng gia công nhận được $N$ đơn hàng. Mỗi đơn hàng $i$ đều cần đúng $1$ đơn vị thời gian để hoàn thành, có hạn chót $d_i$ ($1 \le d_i \le N$) và mang lại lợi nhuận $p_i$ ($1 \le p_i \le 10^9$).

Tại mỗi khung thời gian nguyên $1, 2, 3, \dots$, xưởng chỉ xử lý được **tối đa một** đơn hàng. Đơn hàng $i$ nếu được chọn phải được xếp vào một khung thời gian $t \in \{1, 2, \dots, d_i\}$ sao cho không có hai đơn hàng nào trùng khung thời gian. Bạn có thể bỏ qua những đơn hàng không muốn làm.

Hãy tìm **tổng lợi nhuận lớn nhất** mà xưởng có thể thu được.

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên dương $N$ ($1 \le N \le 25\,000$).
- Trong $N$ dòng tiếp theo, dòng thứ $i$ gồm hai số nguyên dương $d_i$ và $p_i$ ($1 \le d_i \le N$, $1 \le p_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là tổng lợi nhuận lớn nhất đạt được.

**Giải thích ví dụ:**
- Ở ví dụ 1, ta xếp đơn `(2, 27)` vào khung giờ $1$, đơn `(2, 100)` vào khung giờ $2$, và đơn `(3, 15)` vào khung giờ $3$, thu được tổng lợi nhuận tối đa $27 + 100 + 15 = 142$.
- Ở ví dụ 2, dù đơn `(1, 10)` có hạn chót sớm nhất, ta nên bỏ qua nó để dành cả hai khung giờ $1$ và $2$ cho hai đơn `(2, 100)`, thu được tổng lợi nhuận $200$.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(N log N).\nLưu ý: Tổng lợi nhuận có thể lên tới 2.5 × 10^13 (vượt int32), bắt buộc dùng kiểu long long trong C++.",
        "hints": r"""**Gợi ý 1 (Nhận xét):**
Một tập các đơn hàng có thể xếp lịch hợp lệ khi và chỉ khi với mọi mốc thời gian $d$, số đơn hàng trong tập có hạn chót $\le d$ không vượt quá $d$.

**Gợi ý 2 (Ý tưởng thuật toán — Tham lam hối hận với Min-Heap):**
Sắp xếp các đơn hàng theo hạn chót $d_i$ **tăng dần** và duy trì một hàng đợi ưu tiên nhỏ nhất (Min-Heap) lưu lợi nhuận các đơn đang được chọn:
- Khi duyệt tới đơn `(d, p)`, tạm thời nhận nó bằng cách đẩy `p` vào Min-Heap.
- Nếu kích thước Heap vượt quá `d` (tức ta đã nhận nhiều hơn $d$ đơn trong khoảng thời gian $[1, d]$), hãy loại bỏ ngay đơn có **lợi nhuận nhỏ nhất** (đỉnh Min-Heap)!

**Gợi ý 3 (Cài đặt & Lưu ý):**
- Trong C++, dùng `priority_queue<long long, vector<long long>, greater<long long>>`.
- Trong Python, dùng module `heapq` (`heappush` và `heappop`).
- Sau khi duyệt hết $N$ đơn, đáp án chính là tổng mọi phần tử còn lại trong Min-Heap (tính bằng kiểu 64-bit `long long`).""",
        "cppSolution": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<pair<int, long long>> jobs(n);
    for (int i = 0; i < n; ++i) {
        cin >> jobs[i].first >> jobs[i].second;
    }

    sort(jobs.begin(), jobs.end());

    priority_queue<long long, vector<long long>, greater<long long>> pq;
    for (const auto& [d, p] : jobs) {
        pq.push(p);
        if (static_cast<int>(pq.size()) > d) {
            pq.pop();
        }
    }

    long long total = 0;
    while (!pq.empty()) {
        total += pq.top();
        pq.pop();
    }

    cout << total << '\\n';
    return 0;
}""",
        "pythonSolution": """import heapq
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    jobs = []
    idx = 1
    for _ in range(n):
        jobs.append((int(data[idx]), int(data[idx + 1])))
        idx += 2

    jobs.sort()
    pq: list[int] = []
    for d, p in jobs:
        heapq.heappush(pq, p)
        if len(pq) > d:
            heapq.heappop(pq)

    print(sum(pq))


if __name__ == "__main__":
    solve()""",
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
    assert_test_budgets(problems)

    out_path = build_and_verify_pack(
        pack_id="04-sorting-greedy",
        title="Tầng 1–2: Sắp xếp, Tham lam & Chia để trị",
        tier="Tầng 1–2 — Nền tảng & Lõi",
        description="10 bài sắp xếp đa tiêu chí, tham lam chứng minh trao đổi, lập lịch khoảng, đếm nghịch thế Merge Sort và lập lịch có hạn chót.",
        problems=problems,
    )

    # Extra check: verify every serialized test input and output is strictly < 150KB
    import json
    payload = json.loads(out_path.read_text(encoding="utf-8"))
    max_in = 0
    max_out = 0
    for p in payload["problems"]:
        for idx, tc in enumerate(p["testCases"], 1):
            in_b = len(tc["input"].encode("utf-8"))
            out_b = len(tc["output"].encode("utf-8"))
            max_in = max(max_in, in_b)
            max_out = max(max_out, out_b)
            if in_b >= MAX_PACK_TEST_BYTES or out_b >= MAX_PACK_TEST_BYTES:
                raise ValueError(
                    f"[{p['slug']}] test #{idx} exceeds {MAX_PACK_TEST_BYTES}B (in={in_b}, out={out_b})"
                )
    print(f"Budget check OK: max_test_input={max_in} B, max_test_output={max_out} B (< {MAX_PACK_TEST_BYTES} B)")


if __name__ == "__main__":
    main()
