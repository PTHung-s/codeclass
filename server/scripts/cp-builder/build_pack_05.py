"""
Builder for CodeClass CP Pack 05:
Tầng 2: Tìm kiếm nhị phân, Hai con trỏ & Cửa sổ trượt.
"""

from __future__ import annotations

import itertools
import random
import sys
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_lib import build_and_verify_pack  # noqa: E402

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Nhị phân & Hai con trỏ\n"


def fmt_arr(arr: List[int]) -> str:
    return " ".join(map(str, arr))


# =============================================================================
# 1. cp05-count-in-range-bs
# =============================================================================
def brute_p1(inp: str) -> str:
    toks = inp.split()
    n, q = int(toks[0]), int(toks[1])
    arr = [int(x) for x in toks[2 : 2 + n]]
    out = []
    idx = 2 + n
    for _ in range(q):
        l = int(toks[idx])
        r = int(toks[idx + 1])
        idx += 2
        out.append(str(sum(1 for v in arr if l <= v <= r)))
    return "\n".join(out)


def make_p1_input(arr: List[int], queries: List[tuple[int, int]]) -> str:
    lines = [f"{len(arr)} {len(queries)}", fmt_arr(arr)]
    lines.extend(f"{l} {r}" for l, r in queries)
    return "\n".join(lines)


def build_p1() -> dict:
    rng = random.Random(501)

    def rand_case(n: int, q: int, lo: int, hi: int, vals_pool: List[int] | None = None) -> str:
        if vals_pool is not None:
            arr = [rng.choice(vals_pool) for _ in range(n)]
        else:
            arr = [rng.randint(lo, hi) for _ in range(n)]
        queries = []
        for _ in range(q):
            a = rng.randint(lo, hi)
            b = rng.randint(lo, hi)
            if a > b:
                a, b = b, a
            queries.append((a, b))
        return make_p1_input(arr, queries)

    tests = [
        # 3 public samples
        {
            "input": make_p1_input(
                [5, 1, 5, 3, 9, 3],
                [(3, 5), (1, 2), (6, 8), (5, 5)],
            ),
            "expected": "4\n1\n0\n2",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p1_input(
                [-10, -3, 0, -3, 7],
                [(-10, 7), (-3, -3), (-20, -11)],
            ),
            "expected": "5\n2\n0",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p1_input(
                [10**9],
                [(10**9, 10**9), (-10**9, 10**9 - 1), (-10**9, 10**9)],
            ),
            "expected": "1\n0\n1",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / duplicate / overflow-boundary tests
        {
            "input": make_p1_input(
                [-10**9] * 10,
                [
                    (-10**9, -10**9),
                    (-10**9, 10**9),
                    (-10**9 + 1, 10**9),
                    (0, 0),
                ],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p1_input(
                [-10**9, -10**9 + 1, -1, 0, 0, 1, 10**9 - 1, 10**9],
                [
                    (-10**9, -10**9),
                    (-10**9 + 1, 10**9 - 1),
                    (0, 0),
                    (-1, 1),
                    (10**9, 10**9),
                    (-10**9, 10**9),
                ],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p1_input(
                [10, 20, 30, 40, 50],
                [(-100, 9), (11, 19), (21, 29), (31, 39), (41, 49), (51, 100)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p1_input(
                [x for x in range(15, -15, -1) for _ in range(2)],
                [(-20, 20), (0, 0), (-15, -15), (15, 15), (-5, 5), (16, 100)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests (all < 150KB)
        {"input": rand_case(300, 300, -1000, 1000), "hidden": True, "checkBrute": True},
        {
            "input": rand_case(2000, 2000, -50, 50, vals_pool=[rng.randint(-50, 50) for _ in range(15)]),
            "hidden": True,
            "checkBrute": False,
        },
        {"input": rand_case(5000, 3200, -10**9, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_case(10000, 8000, -500, 500), "hidden": True, "checkBrute": False},
        {"input": rand_case(12000, 9500, -999, 999), "hidden": True, "checkBrute": False},
        {"input": rand_case(15000, 12000, 0, 99), "hidden": True, "checkBrute": False},
        {"input": rand_case(30000, 5000, -99, 99), "hidden": True, "checkBrute": False},
        {"input": rand_case(1000, 30000, 0, 9), "hidden": True, "checkBrute": False},
        {
            "input": make_p1_input(
                [42] * 30000,
                [(41, 41), (42, 42), (43, 43), (0, 100), (-10**9, 10**9)] * 200,
            ),
            "hidden": True,
            "checkBrute": False,
        },
    ]

    stress = [rand_case(rng.randint(1, 35), rng.randint(1, 35), -20, 20) for _ in range(25)]

    return {
        "slug": "cp05-count-in-range-bs",
        "title": "Đếm phần tử trong đoạn giá trị",
        "shortDescription": "Sắp xếp mảng và dùng tìm kiếm nhị phân (lower_bound / upper_bound) để trả lời nhanh Q truy vấn đếm số phần tử thuộc đoạn [L, R].",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.binary_search",
        "tags": ["tìm kiếm nhị phân", "sắp xếp", "truy vấn", "tầng 2"],
        "statement": r"""Một hệ thống giám sát cảm biến ghi lại $N$ giá trị đo nguyên $a_1, a_2, \dots, a_N$ (có thể âm, dương hoặc lặp lại nhiều lần).

Để phục vụ báo cáo thống kê, bạn cần trả lời $Q$ truy vấn độc lập. Mỗi truy vấn cho hai số nguyên $L, R$ ($L \le R$) và yêu cầu đếm xem trong mảng có bao nhiêu phần tử $a_i$ thỏa mãn:
$$L \le a_i \le R$$

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, Q$ ($1 \le N, Q \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $Q$ dòng tiếp theo, mỗi dòng gồm hai số nguyên $L, R$ ($-10^9 \le L \le R \le 10^9$).

### Dữ liệu ra
- Gồm $Q$ dòng, dòng thứ $j$ in ra một số nguyên là số lượng phần tử của mảng nằm trong đoạn $[L, R]$ của truy vấn thứ $j$.

### Ràng buộc
- $1 \le N, Q \le 30\,000$
- $-10^9 \le a_i, L, R \le 10^9$ và $L \le R$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O((N + Q) log N).\n"
            + "Duyệt O(N * Q) sẽ quá thời gian (TLE) với N, Q lớn.\n"
        ),
        "hints": r"""### Gợi ý 1
Thứ tự ban đầu của các phần tử trong mảng không ảnh hưởng đến số lượng phần tử nằm trong đoạn $[L, R]$. Hãy sắp xếp mảng tăng dần trước khi xử lý các truy vấn.

### Gợi ý 2
Sau khi sắp xếp mảng $a$ theo thứ tự không giảm, mọi phần tử thỏa $L \le a_i \le R$ đều nằm liên tiếp nhau thành một đoạn chỉ số $[\text{pos}_L, \text{pos}_R - 1]$, trong đó:
- $\text{pos}_L$ là vị trí đầu tiên có $a_i \ge L$ (`lower_bound` / `bisect_left`).
- $\text{pos}_R$ là vị trí đầu tiên có $a_i > R$ (`upper_bound` / `bisect_right`).
Kết quả của truy vấn chính là $\text{pos}_R - \text{pos}_L$.

### Gợi ý 3
Kiểm tra các trường hợp biên: khi không có phần tử nào nằm trong $[L, R]$, cả $\text{pos}_L$ và $\text{pos}_R$ đều bằng nhau nên hiệu tự động bằng $0$; khi nhiều phần tử trùng đúng $L$ hoặc $R$, sự khác biệt giữa `lower_bound` ($\ge$) và `upper_bound` ($>$) giúp đếm đủ tất cả bản sao. Nhớ dùng nhập/xuất nhanh vì có tới $30\,000$ dòng kết quả.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];
    sort(a.begin(), a.end());

    while (q--) {
        long long l, r;
        cin >> l >> r;
        auto it_l = lower_bound(a.begin(), a.end(), l);
        auto it_r = upper_bound(a.begin(), a.end(), r);
        cout << (it_r - it_l) << '\n';
    }
    return 0;
}""",
        "pythonSolution": r"""import sys
from bisect import bisect_left, bisect_right


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    q = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]
    a.sort()

    out = []
    idx = 2 + n
    for _ in range(q):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        out.append(str(bisect_right(a, r) - bisect_left(a, l)))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p1,
        "extraStressInputs": stress,
    }


# =============================================================================
# 2. cp05-two-sum-sorted-count
# =============================================================================
def brute_p2(inp: str) -> str:
    toks = inp.split()
    n, s = int(toks[0]), int(toks[1])
    arr = [int(x) for x in toks[2 : 2 + n]]
    ans = 0
    for i in range(n):
        ai = arr[i]
        for j in range(i + 1, n):
            if ai + arr[j] == s:
                ans += 1
    return str(ans)


def make_p2_input(arr: List[int], target: int) -> str:
    arr_sorted = sorted(arr)
    return f"{len(arr_sorted)} {target}\n{fmt_arr(arr_sorted)}"


def build_p2() -> dict:
    rng = random.Random(502)

    def rand_case(n: int, lo: int, hi: int, target: int | None = None) -> str:
        arr = sorted(rng.randint(lo, hi) for _ in range(n))
        if target is None:
            i = rng.randrange(n)
            j = rng.randrange(n)
            target = arr[i] + arr[j]
        return f"{n} {target}\n{fmt_arr(arr)}"

    tests = [
        # 3 public samples
        {
            "input": make_p2_input([1, 2, 3, 3, 4, 5], 6),
            "expected": "3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p2_input([1, 2, 2, 2, 3, 3, 5], 4),
            "expected": "5",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p2_input([-4, -2, 0, 0, 2], 0),
            "expected": "2",
            "hidden": False,
            "checkBrute": True,
        },
        # 5 corner / duplicate / half-sum / extreme tests
        {
            "input": make_p2_input([5], 10),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p2_input([10**9] * 10, 2 * 10**9),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p2_input([-(10**9)] * 8, -2 * 10**9),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p2_input([2, 2, 2, 3, 3, 3, 3], 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p2_input([-(10**9), -5, 0, 5, 10**9], 1),
            "hidden": True,
            "checkBrute": True,
        },
        # 8 medium -> large tests
        {"input": rand_case(250, -30, 30), "hidden": True, "checkBrute": True},
        {
            "input": make_p2_input(
                [-10] * 40 + [0] * 60 + [5] * 80 + [10] * 50 + [20] * 40,
                10,
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {"input": rand_case(5000, -1000, 1000, 0), "hidden": True, "checkBrute": False},
        {"input": rand_case(10000, -10**9, 10**9, 10**9), "hidden": True, "checkBrute": False},
        {"input": make_p2_input([10**9] * 12000, 2 * 10**9), "hidden": True, "checkBrute": False},
        {"input": make_p2_input([500] * 30000, 1000), "hidden": True, "checkBrute": False},
        {
            "input": make_p2_input([-100] * 15000 + [100] * 15000, 0),
            "hidden": True,
            "checkBrute": False,
        },
        {"input": rand_case(30000, -500, 500, 123), "hidden": True, "checkBrute": False},
    ]

    stress = []
    for _ in range(30):
        n = rng.randint(1, 40)
        lo, hi = -8, 8
        arr = sorted(rng.randint(lo, hi) for _ in range(n))
        target = rng.randint(2 * lo - 2, 2 * hi + 2)
        stress.append(f"{n} {target}\n{fmt_arr(arr)}")

    return {
        "slug": "cp05-two-sum-sorted-count",
        "title": "Đếm cặp có tổng cho trước trên dãy không giảm",
        "shortDescription": "Dùng kỹ thuật hai con trỏ từ hai đầu mảng không giảm để đếm số cặp chỉ số (i, j) có tổng bằng S, xử lý chuẩn các khối phần tử trùng nhau.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.two_pointers",
        "tags": ["hai con trỏ", "sắp xếp", "mảng", "tầng 2"],
        "statement": r"""Một kho linh kiện đã xếp sẵn $N$ mô-đun đo theo dãy giá trị nguyên **không giảm** $a_1 \le a_2 \le \dots \le a_N$ (dãy có thể chứa nhiều phần tử trùng nhau và có thể chứa số âm).

Cho trước một giá trị mục tiêu $S$. Hãy đếm số cặp chỉ số $(i, j)$ thỏa mãn $1 \le i < j \le N$ sao cho:
$$a_i + a_j = S$$

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, S$ ($1 \le N \le 30\,000$, $|S| \le 2 \cdot 10^9$).
- Dòng thứ hai gồm $N$ số nguyên không giảm $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$, $a_1 \le a_2 \le \dots \le a_N$).

### Dữ liệu ra
- In ra một số nguyên duy nhất là số cặp chỉ số $(i, j)$ thỏa mãn yêu cầu.

### Ràng buộc
- $1 \le N \le 30\,000$
- $|a_i| \le 10^9$, $|S| \le 2 \cdot 10^9$
- Dãy $a$ được đảm bảo đã sắp xếp không giảm.""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N) thời gian, O(1) bộ nhớ phụ.\n"
            + "Lưu ý dùng kiểu 64-bit (long long) cho kết quả và phép cộng a[i] + a[j].\n"
        ),
        "hints": r"""### Gợi ý 1
Đặt hai con trỏ `l = 0` ở đầu mảng và `r = N - 1` ở cuối mảng. Vì mảng không giảm:
- Nếu $a_l + a_r < S$, ta bắt buộc phải tăng `l` lên $1$.
- Nếu $a_l + a_r > S$, ta bắt buộc phải giảm `r` xuống $1$.

### Gợi ý 2
Khi gặp $a_l + a_r = S$, đừng chỉ tăng `l` hoặc giảm `r` từng bước đơn lẻ vì mảng có thể có nhiều phần tử trùng nhau! Hãy tách thành hai trường hợp:
- Nếu $a_l = a_r$: toàn bộ $c = r - l + 1$ phần tử trong đoạn $[l, r]$ đều bằng nhau và bằng $S/2$. Số cặp chọn ra là $\binom{c}{2} = \frac{c(c-1)}{2}$, sau đó kết thúc ngay vòng lặp.
- Nếu $a_l < a_r$: đếm số phần tử liên tiếp bằng $a_l$ ở bên trái (gọi là $c_1$) và số phần tử liên tiếp bằng $a_r$ ở bên phải (gọi là $c_2$). Mỗi cặp ghép trái-phải đều hợp lệ nên cộng $c_1 \cdot c_2$ vào đáp án, đồng thời dịch `l += c1`, `r -= c2`.

### Gợi ý 3
Kiểm tra bẫy tràn số và biên:
- Khi $N = 30\,000$ và tất cả phần tử đều bằng $S/2$, tích $c(c-1)$ gần $9 \cdot 10^8$, và khi $a_i = \pm 10^9$ thì $a_l + a_r = \pm 2 \cdot 10^9$: luôn khai báo `long long` trong C++ cho `a[i]`, `S`, `c1`, `c2` và `ans`.
- Khi $N = 1$, vòng lặp `while (l < r)` không chạy và in `0`.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long target;
    if (!(cin >> n >> target)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    int l = 0, r = n - 1;
    long long ans = 0;
    while (l < r) {
        long long s = a[l] + a[r];
        if (s < target) {
            ++l;
        } else if (s > target) {
            --r;
        } else {
            if (a[l] == a[r]) {
                long long cnt = r - l + 1;
                ans += cnt * (cnt - 1) / 2;
                break;
            }
            long long left_val = a[l], c1 = 0;
            while (l <= r && a[l] == left_val) {
                ++c1;
                ++l;
            }
            long long right_val = a[r], c2 = 0;
            while (r >= l && a[r] == right_val) {
                ++c2;
                --r;
            }
            ans += c1 * c2;
        }
    }

    cout << ans << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    target = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    l = 0
    r = n - 1
    ans = 0
    while l < r:
        s = a[l] + a[r]
        if s < target:
            l += 1
        elif s > target:
            r -= 1
        else:
            if a[l] == a[r]:
                cnt = r - l + 1
                ans += cnt * (cnt - 1) // 2
                break
            lv = a[l]
            c1 = 0
            while l <= r and a[l] == lv:
                c1 += 1
                l += 1
            rv = a[r]
            c2 = 0
            while r >= l and a[r] == rv:
                c2 += 1
                r -= 1
            ans += c1 * c2
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p2,
        "extraStressInputs": stress,
    }


# =============================================================================
# 3. cp05-fixed-window-max-sum
# =============================================================================
def brute_p3(inp: str) -> str:
    toks = inp.split()
    n, k = int(toks[0]), int(toks[1])
    arr = [int(x) for x in toks[2 : 2 + n]]
    best = None
    best_pos = 1
    for i in range(n - k + 1):
        s = sum(arr[i : i + k])
        if best is None or s > best:
            best = s
            best_pos = i + 1
    return f"{best} {best_pos}"


def make_p3_input(arr: List[int], k: int) -> str:
    return f"{len(arr)} {k}\n{fmt_arr(arr)}"


def build_p3() -> dict:
    rng = random.Random(503)

    def rand_case(n: int, k: int, lo: int, hi: int) -> str:
        return make_p3_input([rng.randint(lo, hi) for _ in range(n)], k)

    tests = [
        # 3 public samples
        {
            "input": make_p3_input([2, -1, 5, 1, 3, 2], 3),
            "expected": "9 3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p3_input([-5, -2, -2, -5, -1], 2),
            "expected": "-4 2",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p3_input([3, 4, 3, 4, 3], 2),
            "expected": "7 1",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / negative / tie-break / overflow tests
        {
            "input": make_p3_input([-(10**9)], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p3_input([10**9, -500000000, 10**9, 10**9, -200000000], 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p3_input([-100, -50, -10, -10, -20, -10], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p3_input([-10, -10, -10, 5, 6, 7], 3),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {"input": rand_case(200, 37, -1000, 1000), "hidden": True, "checkBrute": True},
        {"input": rand_case(350, 80, -10000, -1), "hidden": True, "checkBrute": True},
        {"input": rand_case(5000, 1234, -10**9, 10**9), "hidden": True, "checkBrute": False},
        {"input": make_p3_input([10**9] * 10000, 5000), "hidden": True, "checkBrute": False},
        {
            "input": make_p3_input([-(10**9)] * 7000 + [-(10**9) + 1] * 3000, 3000),
            "hidden": True,
            "checkBrute": False,
        },
        {"input": rand_case(12000, 6000, -10**9, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_case(30000, 15000, -999, 999), "hidden": True, "checkBrute": False},
        {"input": rand_case(30000, 1, -999, 999), "hidden": True, "checkBrute": False},
        {
            "input": make_p3_input([-500] + [10] * 29998 + [500], 29999),
            "hidden": True,
            "checkBrute": False,
        },
    ]

    stress = [
        rand_case(n, rng.randint(1, n), -20, 20)
        for n in [rng.randint(1, 50) for _ in range(30)]
    ]

    return {
        "slug": "cp05-fixed-window-max-sum",
        "title": "Đoạn con độ dài K có tổng lớn nhất",
        "shortDescription": "Dùng cửa sổ trượt độ dài cố định K để tìm tổng lớn nhất và vị trí bắt đầu nhỏ nhất (1-indexed), cẩn thận số âm và tràn số 64-bit.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.sliding_window",
        "tags": ["cửa sổ trượt", "mảng", "tầng 2"],
        "statement": r"""Một trạm giám sát công suất ghi lại chênh lệch sản lượng điện trong $N$ giờ liên tiếp dưới dạng dãy số nguyên $a_1, a_2, \dots, a_N$ (giá trị có thể âm khi tiêu thụ vượt sản xuất).

Cho số nguyên $K$ ($1 \le K \le N$). Hãy tìm một đoạn con liên tiếp gồm đúng $K$ phần tử sao cho tổng các phần tử trong đoạn đạt **giá trị lớn nhất**. Nếu có nhiều đoạn cùng đạt tổng lớn nhất đó, hãy chọn đoạn có **chỉ số bắt đầu nhỏ nhất** (đánh số từ $1$).

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, K$ ($1 \le K \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Dữ liệu ra
- In ra hai số nguyên `max_sum start_pos` cách nhau bởi một dấu cách, lần lượt là tổng lớn nhất tìm được và vị trí bắt đầu nhỏ nhất (theo chỉ số $1 \dots N - K + 1$).

### Ràng buộc
- $1 \le K \le N \le 30\,000$
- $|a_i| \le 10^9$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N) thời gian.\n"
            + "Tổng đoạn con có thể đạt ±3 * 10^13 nên bắt buộc dùng kiểu 64-bit (long long).\n"
        ),
        "hints": r"""### Gợi ý 1
Đoạn con đầu tiên gồm $K$ phần tử $[a_1, a_2, \dots, a_K]$ có tổng `cur`. Khi trượt cửa sổ sang phải một bước thành $[a_2, \dots, a_{K+1}]$, ta không cần cộng lại cả $K$ phần tử.

### Gợi ý 2
Khi trượt cửa sổ kết thúc tại chỉ số $i$ (0-indexed, với $i$ chạy từ $K$ đến $N - 1$), tổng mới được cập nhật trong $O(1)$:
$$\text{cur} \leftarrow \text{cur} + a_i - a_{i - K}$$
Vị trí bắt đầu (1-indexed) của cửa sổ kết thúc tại $i$ là $i - K + 2$.

### Gợi ý 3
Hai bẫy phổ biến cần tránh:
1. **Khởi tạo sai khi mảng toàn số âm**: Đừng khởi tạo `best = 0`, hãy khởi tạo `best = cur` (tổng của cửa sổ đầu tiên) và `best_pos = 1`.
2. **Xử lý hòa và tràn số**: Chỉ cập nhật khi `cur > best` (dấu lớn hơn nghiêm ngặt `>`, không dùng `>=`) để giữ vị trí bắt đầu nhỏ nhất, và dùng `long long` trong C++ vì tổng có thể vượt giới hạn 32-bit.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    long long cur = 0;
    for (int i = 0; i < k; ++i) cur += a[i];
    long long best = cur;
    int best_pos = 1;

    for (int i = k; i < n; ++i) {
        cur += a[i] - a[i - k];
        if (cur > best) {
            best = cur;
            best_pos = i - k + 2;
        }
    }

    cout << best << ' ' << best_pos << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    cur = sum(a[:k])
    best = cur
    best_pos = 1

    for i in range(k, n):
        cur += a[i] - a[i - k]
        if cur > best:
            best = cur
            best_pos = i - k + 2

    sys.stdout.write(f"{best} {best_pos}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p3,
        "extraStressInputs": stress,
    }


# =============================================================================
# 4. cp05-shortest-subarray-sum-at-least-s
# =============================================================================
def brute_p4(inp: str) -> str:
    toks = inp.split()
    n, s = int(toks[0]), int(toks[1])
    arr = [int(x) for x in toks[2 : 2 + n]]
    best = n + 1
    for i in range(n):
        cur = 0
        for j in range(i, n):
            cur += arr[j]
            if cur >= s:
                if j - i + 1 < best:
                    best = j - i + 1
                break
    return str(-1 if best > n else best)


def make_p4_input(arr: List[int], target: int) -> str:
    return f"{len(arr)} {target}\n{fmt_arr(arr)}"


def build_p4() -> dict:
    rng = random.Random(504)

    def rand_case(n: int, lo: int, hi: int, target: int) -> str:
        return make_p4_input([rng.randint(lo, hi) for _ in range(n)], target)

    arr15 = [rng.randint(1, 999) for _ in range(30000)]

    tests = [
        # 3 public samples
        {
            "input": make_p4_input([2, 3, 1, 2, 4, 3], 7),
            "expected": "2",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p4_input([3, 5, 4, 7], 20),
            "expected": "-1",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p4_input([1, 2, 3, 15, 4], 10),
            "expected": "1",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / boundary / overflow tests
        {
            "input": make_p4_input([5], 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p4_input([5], 6),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p4_input([10, 20, 30, 40, 50], 150),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p4_input([4, 4, 4, 1, 1, 1, 12], 12),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {"input": rand_case(250, 1, 100, 850), "hidden": True, "checkBrute": True},
        {
            "input": make_p4_input([i + 1 for i in range(300)], 5000),
            "hidden": True,
            "checkBrute": True,
        },
        {"input": rand_case(10000, 5 * 10**8, 10**9, 5 * 10**12), "hidden": True, "checkBrute": False},
        {"input": make_p4_input([10**9] * 10000, 10**13 + 1), "hidden": True, "checkBrute": False},
        {"input": rand_case(12000, 1, 10**9, 10**12), "hidden": True, "checkBrute": False},
        {
            "input": make_p4_input([1] * 14999 + [500, 500] + [1] * 14999, 1000),
            "hidden": True,
            "checkBrute": False,
        },
        {"input": rand_case(30000, 1, 999, 5_000_000), "hidden": True, "checkBrute": False},
        {"input": make_p4_input(arr15, sum(arr15)), "hidden": True, "checkBrute": False},
        {
            "input": make_p4_input([(i % 999) + 1 for i in range(30000)], 250_000),
            "hidden": True,
            "checkBrute": False,
        },
    ]

    stress = []
    for _ in range(30):
        n = rng.randint(1, 50)
        arr = [rng.randint(1, 30) for _ in range(n)]
        total = sum(arr)
        target = rng.randint(1, total + 10)
        stress.append(make_p4_input(arr, target))

    return {
        "slug": "cp05-shortest-subarray-sum-at-least-s",
        "title": "Đoạn con ngắn nhất có tổng đạt ngưỡng",
        "shortDescription": "Dùng cửa sổ trượt biến đổi (hai con trỏ) trên mảng số nguyên dương để tìm đoạn con liên tiếp ngắn nhất có tổng >= S.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.sliding_window",
        "tags": ["cửa sổ trượt", "hai con trỏ", "tầng 2"],
        "statement": r"""Trong một chiến dịch gây quỹ kéo dài $N$ ngày liên tiếp, số tiền quyên góp được ở ngày thứ $i$ là một số nguyên dương $a_i$.

Ban tổ chức muốn tìm một giai đoạn gồm các ngày **liên tiếp** có độ dài ngắn nhất sao cho tổng số tiền quyên góp trong giai đoạn đó đạt ít nhất $S$. Nếu toàn bộ $N$ ngày vẫn không đủ $S$, hãy thông báo không tồn tại bằng cách in `-1`.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, S$ ($1 \le N \le 30\,000$, $1 \le S \le 10^{14}$).
- Dòng thứ hai gồm $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

### Dữ liệu ra
- In ra độ dài ngắn nhất của đoạn con liên tiếp có tổng $\ge S$, hoặc in `-1` nếu không tồn tại.

### Ràng buộc
- $1 \le N \le 30\,000$
- $1 \le a_i \le 10^9$
- $1 \le S \le 10^{14}$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N) thời gian.\n"
            + "Lưu ý S <= 10^14 và tổng đoạn có thể vượt 32-bit, cần dùng kiểu 64-bit (long long).\n"
        ),
        "hints": r"""### Gợi ý 1
Vì mọi phần tử $a_i$ đều **nguyên dương** ($a_i \ge 1$), khi mở rộng đầu phải `r` thì tổng cửa sổ $[l, r]$ luôn tăng, và khi thu hẹp đầu trái `l` thì tổng luôn giảm. Tính đơn điệu này cho phép dùng cửa sổ trượt biến đổi.

### Gợi ý 2
Duy trì đoạn $[l, r]$ với tổng hiện tại `cur`:
- Với mỗi đầu phải `r` chạy từ $0$ đến $N - 1$, cộng `a[r]` vào `cur`.
- Trong khi `cur >= S`: cập nhật đáp án `ans = min(ans, r - l + 1)`, trừ `a[l]` khỏi `cur` và tăng `l` lên $1$ để thử rút ngắn cửa sổ hết mức có thể.

### Gợi ý 3
Cả `l` và `r` chỉ tiến sang phải tối đa $N$ lần nên tổng thời gian là $O(N)$ chứ không phải $O(N^2)$. Hãy khởi tạo `ans = N + 1` và sau vòng lặp nếu `ans > N` thì in `-1`. Nhớ dùng `long long` cho `S` và `cur` vì $S \le 10^{14}$.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long target;
    if (!(cin >> n >> target)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    long long cur = 0;
    int l = 0;
    int best = n + 1;
    for (int r = 0; r < n; ++r) {
        cur += a[r];
        while (cur >= target) {
            best = min(best, r - l + 1);
            cur -= a[l];
            ++l;
        }
    }

    if (best > n) cout << -1 << '\n';
    else cout << best << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    target = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    cur = 0
    l = 0
    best = n + 1
    for r, val in enumerate(a):
        cur += val
        while cur >= target:
            length = r - l + 1
            if length < best:
                best = length
            cur -= a[l]
            l += 1

    sys.stdout.write(f"{-1 if best > n else best}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p4,
        "extraStressInputs": stress,
    }


# =============================================================================
# 5. cp05-longest-at-most-k-distinct
# =============================================================================
def brute_p5(inp: str) -> str:
    toks = inp.split()
    n, k = int(toks[0]), int(toks[1])
    arr = [int(x) for x in toks[2 : 2 + n]]
    best = 0
    for i in range(n):
        seen = set()
        for j in range(i, n):
            seen.add(arr[j])
            if len(seen) > k:
                break
            if j - i + 1 > best:
                best = j - i + 1
    return str(best)


def make_p5_input(arr: List[int], k: int) -> str:
    return f"{len(arr)} {k}\n{fmt_arr(arr)}"


def build_p5() -> dict:
    rng = random.Random(505)

    def rand_pool_case(n: int, k: int, pool: List[int]) -> str:
        return make_p5_input([rng.choice(pool) for _ in range(n)], k)

    # Runs case for K=1
    runs_30k: List[int] = []
    while len(runs_30k) < 30000:
        val = rng.randint(0, 99)
        cnt = rng.randint(1, 250)
        runs_30k.extend([val] * min(cnt, 30000 - len(runs_30k)))

    # Alternating blocks of 2 distinct values
    blocks_30k: List[int] = []
    for b in range(60):
        u, v = (b % 90) + 1, ((b + 1) % 90) + 1
        seg_len = 500
        blocks_30k.extend(u if i % 2 == 0 else v for i in range(seg_len))

    tests = [
        # 3 public samples
        {
            "input": make_p5_input([1, 2, 1, 2, 3, 2, 2], 2),
            "expected": "4",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p5_input([-5, -5, 4, 4, 4, -5], 1),
            "expected": "3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p5_input([10**9, -(10**9), 10**9, 0, 0], 3),
            "expected": "5",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / boundary tests
        {
            "input": make_p5_input([0], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p5_input(list(range(20)), 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p5_input([-777] * 25, 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p5_input(
                [10**9, -(10**9), 1, 2, 3, -(10**9), 10**9, -(10**9), 10**9, -(10**9)],
                2,
            ),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests (all < 150KB)
        {"input": rand_pool_case(250, 4, list(range(-10, 11))), "hidden": True, "checkBrute": True},
        {
            "input": make_p5_input([rng.randint(1, 5) for _ in range(300)], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": rand_pool_case(5000, 50, [rng.randint(-10**9, 10**9) for _ in range(200)]),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": rand_pool_case(11000, 100, [rng.randint(-10**9, 10**9) for _ in range(300)]),
            "hidden": True,
            "checkBrute": False,
        },
        {"input": make_p5_input(runs_30k, 1), "hidden": True, "checkBrute": False},
        {"input": rand_pool_case(30000, 10, list(range(25))), "hidden": True, "checkBrute": False},
        {"input": rand_pool_case(30000, 500, list(range(1000))), "hidden": True, "checkBrute": False},
        {"input": make_p5_input(list(range(24000)), 24000), "hidden": True, "checkBrute": False},
        {"input": make_p5_input(blocks_30k, 2), "hidden": True, "checkBrute": False},
    ]

    stress = []
    for _ in range(30):
        n = rng.randint(1, 45)
        k = rng.randint(1, n)
        pool = [rng.randint(-10, 10) for _ in range(rng.randint(1, 10))]
        stress.append(rand_pool_case(n, k, pool))

    return {
        "slug": "cp05-longest-at-most-k-distinct",
        "title": "Đoạn con dài nhất có tối đa K giá trị phân biệt",
        "shortDescription": "Kết hợp cửa sổ trượt hai con trỏ với bảng tần suất (map/dict) để tìm đoạn con liên tiếp dài nhất chứa không quá K giá trị khác nhau.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.sliding_window",
        "tags": ["cửa sổ trượt", "map-set", "hai con trỏ", "tầng 2"],
        "statement": r"""Một ứng dụng nghe nhạc lưu lại lịch sử phát $N$ bài hát liên tiếp, trong đó mỗi bài hát được nhận diện bởi một mã số nguyên $a_i$ ($|a_i| \le 10^9$).

Cho số nguyên $K$ ($1 \le K \le N$). Hãy tìm độ dài lớn nhất của một đoạn phát **liên tiếp** chứa **tối đa $K$ mã bài hát phân biệt**.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, K$ ($1 \le K \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).

### Dữ liệu ra
- In ra một số nguyên duy nhất là độ dài đoạn con liên tiếp dài nhất chứa không quá $K$ giá trị phân biệt.

### Ràng buộc
- $1 \le K \le N \le 30\,000$
- $|a_i| \le 10^9$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N) hoặc O(N log N).\n"
            + "Giá trị |a_i| <= 10^9 (có cả số âm) nên không thể dùng mảng đếm trực tiếp theo chỉ số.\n"
        ),
        "hints": r"""### Gợi ý 1
Nếu một đoạn $[l, r]$ đã chứa quá $K$ giá trị phân biệt thì mở rộng thêm về bên phải chỉ làm số giá trị phân biệt tăng hoặc giữ nguyên. Do đó khi $r$ tăng dần từ trái sang phải, biên trái hợp lệ nhỏ nhất `l` cũng chỉ dịch dần sang phải (không bao giờ lùi lại).

### Gợi ý 2
Dùng một bảng tần suất (`map<long long, int>` trong C++ hoặc `dict` trong Python) lưu số lần xuất hiện của từng giá trị trong cửa sổ $[l, r]$, cùng một biến `distinct` đếm số giá trị có tần suất dương:
- Khi thêm `a[r]`: nếu tần suất cũ bằng $0$ thì tăng `distinct`, sau đó tăng `freq[a[r]]`.
- Trong khi `distinct > K`: giảm `freq[a[l]]`; nếu tần suất về $0$ thì giảm `distinct`, rồi tăng `l`.
- Cập nhật `ans = max(ans, r - l + 1)`.

### Gợi ý 3
Vì $|a_i| \le 10^9$ và có thể âm, không dùng mảng `cnt[a[i]]`. Dùng `map` trong C++ đảm bảo $O(N \log N)$ ổn định trong mọi bộ test (tránh rủi ro xung đột băm của `unordered_map`), còn `dict` trong Python hoạt động rất nhanh.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    map<long long, int> freq;
    int l = 0, distinct = 0, best = 0;
    for (int r = 0; r < n; ++r) {
        if (freq[a[r]] == 0) ++distinct;
        ++freq[a[r]];
        while (distinct > k) {
            --freq[a[l]];
            if (freq[a[l]] == 0) --distinct;
            ++l;
        }
        best = max(best, r - l + 1);
    }

    cout << best << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    freq = {}
    distinct = 0
    l = 0
    best = 0
    for r, x in enumerate(a):
        c = freq.get(x, 0)
        if c == 0:
            distinct += 1
        freq[x] = c + 1
        while distinct > k:
            y = a[l]
            ny = freq[y] - 1
            freq[y] = ny
            if ny == 0:
                distinct -= 1
            l += 1
        length = r - l + 1
        if length > best:
            best = length

    sys.stdout.write(f"{best}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p5,
        "extraStressInputs": stress,
    }


# =============================================================================
# 6. cp05-wood-cutting-bs
# =============================================================================
def brute_p6(inp: str) -> str:
    toks = inp.split()
    n, m = int(toks[0]), int(toks[1])
    h = [int(x) for x in toks[2 : 2 + n]]
    mx = max(h)
    for cut in range(mx, -1, -1):
        if sum(x - cut for x in h if x > cut) >= m:
            return str(cut)
    return "0"


def make_p6_input(h: List[int], m: int) -> str:
    return f"{len(h)} {m}\n{fmt_arr(h)}"


def build_p6() -> dict:
    rng = random.Random(506)

    def rand_case(n: int, lo: int, hi: int, frac: float) -> str:
        h = [rng.randint(lo, hi) for _ in range(n)]
        total = sum(h)
        m = max(1, min(total, int(total * frac)))
        return make_p6_input(h, m)

    h16 = [rng.randint(0, 999) for _ in range(30000)]

    tests = [
        # 3 public samples
        {
            "input": make_p6_input([20, 15, 10, 17], 7),
            "expected": "15",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p6_input([4, 42, 40, 26, 46], 20),
            "expected": "36",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p6_input([5, 5, 5], 15),
            "expected": "0",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / boundary / overflow tests
        {
            "input": make_p6_input([10**9], 1),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p6_input([10**9], 10**9),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p6_input([0, 0, 100, 0, 100], 100),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p6_input([10, 10, 10], 4),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {"input": rand_case(200, 0, 500, 0.35), "hidden": True, "checkBrute": True},
        {
            "input": (lambda arr: make_p6_input(arr, sum(arr)))([rng.randint(0, 800) for _ in range(250)]),
            "hidden": True,
            "checkBrute": True,
        },
        {"input": rand_case(5000, 0, 10**9, 0.42), "hidden": True, "checkBrute": False},
        {"input": make_p6_input([10**9] * 10000, 10**13 - 5000), "hidden": True, "checkBrute": False},
        {"input": rand_case(12000, 10**8, 10**9, 0.55), "hidden": True, "checkBrute": False},
        {
            "input": make_p6_input([10**9] * 10 + [100] * 11990, 5 * 10**9),
            "hidden": True,
            "checkBrute": False,
        },
        {"input": rand_case(30000, 0, 999, 0.33), "hidden": True, "checkBrute": False},
        {"input": make_p6_input([rng.randint(0, 999) for _ in range(30000)], 1), "hidden": True, "checkBrute": False},
        {"input": make_p6_input(h16, sum(h16) - 10), "hidden": True, "checkBrute": False},
    ]

    stress = []
    for _ in range(30):
        n = rng.randint(1, 30)
        h = [rng.randint(0, 200) for _ in range(n)]
        if sum(h) == 0:
            h[0] = 1
        m = rng.randint(1, sum(h))
        stress.append(make_p6_input(h, m))

    return {
        "slug": "cp05-wood-cutting-bs",
        "title": "Chiều cao lưỡi cưa tối đa",
        "shortDescription": "Tìm kiếm nhị phân trên đáp án độ cao H lớn nhất của lưỡi cưa sao cho tổng lượng gỗ cắt được đạt ít nhất M mét (bài toán EKO kinh điển).",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.binary_search_answer",
        "tags": ["tìm kiếm nhị phân", "tối ưu", "tầng 2"],
        "statement": r"""Một lâm trường có $N$ cây gỗ với chiều cao lần lượt là $h_1, h_2, \dots, h_N$ mét ($0 \le h_i \le 10^9$). Để hoàn thành đơn hàng cần thu hoạch **ít nhất $M$ mét gỗ**, đội kỹ thuật sẽ đặt lưỡi cưa tự động ở một độ cao nguyên không âm $H$.

Khi cưa ở độ cao $H$, mọi cây có chiều cao $h_i > H$ sẽ đóng góp đúng $h_i - H$ mét gỗ (các cây có $h_i \le H$ không bị cắt và đóng góp $0$ mét). Nhằm hạn chế chặt quá nhiều cây, hãy tìm độ cao nguyên $H$ **lớn nhất** có thể sao cho tổng lượng gỗ thu được vẫn đạt ít nhất $M$:
$$\sum_{i=1}^{N} \max(0, h_i - H) \ge M$$

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 30\,000$, $1 \le M \le \sum_{i=1}^N h_i$).
- Dòng thứ hai gồm $N$ số nguyên $h_1, h_2, \dots, h_N$ ($0 \le h_i \le 10^9$).

### Dữ liệu ra
- In ra một số nguyên không âm duy nhất là độ cao $H$ lớn nhất thỏa mãn.

### Ràng buộc
- $1 \le N \le 30\,000$
- $0 \le h_i \le 10^9$
- $1 \le M \le \sum_{i=1}^N h_i$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N log(max h_i)).\n"
            + "Lưu ý M và tổng lượng gỗ có thể lên tới 3 * 10^13, bắt buộc dùng kiểu 64-bit (long long).\n"
        ),
        "hints": r"""### Gợi ý 1
Xét hàm $f(H) = \sum_{i=1}^N \max(0, h_i - H)$. Khi độ cao $H$ tăng lên, lượng gỗ $f(H)$ **không tăng**. Vì tính đơn điệu này, tập các giá trị $H$ thỏa mãn $f(H) \ge M$ tạo thành một đoạn liên tiếp $[0, H_{\max}]$.

### Gợi ý 2
Ta tìm kiếm nhị phân $H$ trên miền $[0, \max(h_i)]$:
- Với mỗi giá trị `mid`, tính tổng gỗ thu được trong $O(N)$.
- Nếu tổng $\ge M$: `mid` là một đáp án hợp lệ, lưu `ans = mid` và thử nâng cao hơn bằng cách đặt `lo = mid + 1`.
- Ngược lại: cần hạ lưỡi cưa xuống bằng cách đặt `hi = mid - 1`.

### Gợi ý 3
Chú ý hai điểm biên:
- Khi $M = \sum h_i$, đáp án đúng là $H = 0$ nên cận dưới bắt buộc là `lo = 0` (không được đặt `lo = 1`).
- Luôn dùng kiểu `long long` cho `M` và biến cộng dồn `total` (có thể dừng vòng lặp kiểm tra sớm ngay khi `total >= M`).""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long m;
    if (!(cin >> n >> m)) return 0;
    vector<long long> h(n);
    long long hi = 0;
    for (int i = 0; i < n; ++i) {
        cin >> h[i];
        hi = max(hi, h[i]);
    }

    auto enough = [&](long long cut) -> bool {
        long long total = 0;
        for (long long x : h) {
            if (x > cut) {
                total += x - cut;
                if (total >= m) return true;
            }
        }
        return total >= m;
    };

    long long lo = 0, ans = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (enough(mid)) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    cout << ans << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    h = [int(x) for x in data[2 : 2 + n]]

    lo = 0
    hi = max(h)
    ans = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        total = 0
        for x in h:
            if x > mid:
                total += x - mid
                if total >= m:
                    break
        if total >= m:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p6,
        "extraStressInputs": stress,
    }


# =============================================================================
# 7. cp05-aggressive-towers-bs
# =============================================================================
def brute_p7(inp: str) -> str:
    toks = inp.split()
    n, k = int(toks[0]), int(toks[1])
    xs = sorted(int(x) for x in toks[2 : 2 + n])
    best = 0
    for comb in itertools.combinations(xs, k):
        d = min(comb[i + 1] - comb[i] for i in range(k - 1))
        if d > best:
            best = d
    return str(best)


def make_p7_input(xs: List[int], k: int) -> str:
    return f"{len(xs)} {k}\n{fmt_arr(xs)}"


def build_p7() -> dict:
    rng = random.Random(507)

    def rand_distinct(n: int, k: int, lo: int, hi: int) -> str:
        xs = rng.sample(range(lo, hi + 1), n)
        return make_p7_input(xs, k)

    consec_25k = list(range(25000))
    rng.shuffle(consec_25k)

    clustered_12k = (
        rng.sample(range(0, 50000), 4000)
        + rng.sample(range(400_000_000, 400_050_000), 4000)
        + rng.sample(range(999_950_000, 1_000_000_001), 4000)
    )
    rng.shuffle(clustered_12k)

    tests = [
        # 3 public samples
        {
            "input": make_p7_input([1, 2, 8, 4, 9], 3),
            "expected": "3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p7_input([10, 0, 100, 50], 2),
            "expected": "100",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p7_input([20, 5, 12, 15], 4),
            "expected": "3",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / boundary / cluster tests
        {
            "input": make_p7_input([10**9, 0], 2),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p7_input(list(range(20)), 5),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p7_input([0, 1, 2, 3, 10**9 - 3, 10**9 - 2, 10**9 - 1, 10**9], 3),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p7_input([90, 82, 71, 60, 58, 41, 35, 29, 17, 10, 4, 0], 4),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests (all < 150KB)
        {"input": rand_distinct(14, 5, 0, 100), "hidden": True, "checkBrute": True},
        {"input": rand_distinct(15, 7, 0, 10**9), "hidden": True, "checkBrute": True},
        {"input": rand_distinct(5000, 250, 0, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_distinct(12000, 2, 0, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_distinct(12000, 12000, 0, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_distinct(12000, 600, 0, 10**9), "hidden": True, "checkBrute": False},
        {"input": make_p7_input(consec_25k, 100), "hidden": True, "checkBrute": False},
        {"input": rand_distinct(22000, 11000, 0, 99999), "hidden": True, "checkBrute": False},
        {"input": make_p7_input(clustered_12k, 3000), "hidden": True, "checkBrute": False},
    ]

    stress = [
        rand_distinct(n, rng.randint(2, n), 0, 80)
        for n in [rng.randint(2, 12) for _ in range(30)]
    ]

    return {
        "slug": "cp05-aggressive-towers-bs",
        "title": "Đặt trạm phát sóng xa nhau nhất",
        "shortDescription": "Sắp xếp tọa độ, tìm kiếm nhị phân trên khoảng cách nhỏ nhất D và kiểm tra bằng tham lam từ trái sang phải (bài toán Aggressive Cows).",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.binary_search_answer",
        "tags": ["tìm kiếm nhị phân", "tham lam", "tối ưu", "tầng 2"],
        "statement": r"""Dọc theo một tuyến cao tốc thẳng có $N$ vị trí ứng viên để dựng cột phát sóng tại các tọa độ nguyên **đôi một khác nhau** $x_1, x_2, \dots, x_N$ ($0 \le x_i \le 10^9$, đầu vào có thể chưa được sắp xếp).

Nhà mạng cần chọn đúng $K$ vị trí trong số đó ($2 \le K \le N$) để đặt $K$ trạm phát sóng. Để tránh nhiễu tín hiệu, người ta muốn **cực đại hóa khoảng cách nhỏ nhất** giữa hai trạm bất kỳ được chọn. Hãy tìm giá trị lớn nhất có thể của khoảng cách nhỏ nhất đó.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, K$ ($2 \le K \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên đôi một khác nhau $x_1, x_2, \dots, x_N$ ($0 \le x_i \le 10^9$).

### Dữ liệu ra
- In ra một số nguyên duy nhất là giá trị lớn nhất có thể của khoảng cách nhỏ nhất giữa hai trạm bất kỳ.

### Ràng buộc
- $2 \le K \le N \le 30\,000$
- $0 \le x_i \le 10^9$ và mọi $x_i$ đôi một phân biệt.""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N log N + N log(max x_i - min x_i)).\n"
            + "Đừng quên sắp xếp dãy tọa độ trước khi chạy hàm kiểm tra tham lam.\n"
        ),
        "hints": r"""### Gợi ý 1
Sắp xếp các tọa độ tăng dần: $x_1 < x_2 < \dots < x_N$. Nhận xét rằng nếu ta có thể đặt được $K$ trạm sao cho khoảng cách giữa hai trạm bất kỳ $\ge D$, thì ta cũng dễ dàng đặt được với mọi khoảng cách $D' < D$. Đây là tính chất đơn điệu để tìm kiếm nhị phân theo $D$.

### Gợi ý 2
Để kiểm tra xem một giá trị $D$ có khả thi không (`can_place(D)`), ta dùng chiến lược **tham lam**:
- Luôn đặt trạm đầu tiên tại vị trí trái nhất $x_1$ (đặt sớm nhất sẽ chừa nhiều không gian nhất cho các trạm sau).
- Duyệt tiếp các vị trí $x_i$; mỗi khi $x_i - \text{last} \ge D$ thì đặt thêm một trạm mới tại $x_i$ và cập nhật $\text{last} = x_i$.
- Nếu đặt được ít nhất $K$ trạm thì $D$ khả thi.

### Gợi ý 3
Thực hiện tìm kiếm nhị phân trên đoạn $[0, x_N - x_1]$:
- Nếu `can_place(mid)` đúng: ghi nhận `ans = mid` và thử lớn hơn (`lo = mid + 1`).
- Ngược lại: giảm giới hạn trên (`hi = mid - 1`).
Nhớ tính `mid = lo + (hi - lo) / 2` và dùng `long long` cho tọa độ để tránh mọi lỗi biên khi $x_N - x_1 = 10^9$.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> x(n);
    for (int i = 0; i < n; ++i) cin >> x[i];
    sort(x.begin(), x.end());

    auto can_place = [&](long long dist) -> bool {
        int placed = 1;
        long long last = x[0];
        for (int i = 1; i < n; ++i) {
            if (x[i] - last >= dist) {
                ++placed;
                last = x[i];
                if (placed >= k) return true;
            }
        }
        return placed >= k;
    };

    long long lo = 0, hi = x.back() - x.front(), ans = 0;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (can_place(mid)) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    cout << ans << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    xs = [int(v) for v in data[2 : 2 + n]]
    xs.sort()

    lo = 0
    hi = xs[-1] - xs[0]
    ans = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        placed = 1
        last = xs[0]
        for pos in xs[1:]:
            if pos - last >= mid:
                placed += 1
                last = pos
                if placed >= k:
                    break
        if placed >= k:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p7,
        "extraStressInputs": stress,
    }


# =============================================================================
# 8. cp05-split-array-min-max-sum
# =============================================================================
def brute_p8(inp: str) -> str:
    """Exact O(N^2 * K) DP oracle completely independent of binary search + greedy."""
    toks = inp.split()
    n, k = int(toks[0]), int(toks[1])
    a = [int(x) for x in toks[2 : 2 + n]]
    pref = [0] * (n + 1)
    for i in range(n):
        pref[i + 1] = pref[i] + a[i]
    inf = 10**30
    dp = [inf] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = pref[i]
    for parts in range(2, k + 1):
        ndp = [inf] * (n + 1)
        for i in range(parts, n + 1):
            best = inf
            for j in range(parts - 1, i):
                val = dp[j] if dp[j] > pref[i] - pref[j] else pref[i] - pref[j]
                if val < best:
                    best = val
            ndp[i] = best
        dp = ndp
    return str(dp[n])


def make_p8_input(arr: List[int], k: int) -> str:
    return f"{len(arr)} {k}\n{fmt_arr(arr)}"


def build_p8() -> dict:
    rng = random.Random(508)

    def rand_case(n: int, k: int, lo: int, hi: int) -> str:
        return make_p8_input([rng.randint(lo, hi) for _ in range(n)], k)

    wave_30k = [abs(500 - (i % 1000)) + 1 for i in range(30000)]

    tests = [
        # 3 public samples
        {
            "input": make_p8_input([7, 2, 5, 10, 8], 2),
            "expected": "18",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p8_input([12, 34, 67, 90], 2),
            "expected": "113",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p8_input([1, 2, 100, 3, 4], 3),
            "expected": "100",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / boundary / overflow tests
        {
            "input": make_p8_input([10**9], 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p8_input([10, 500000000, 10**9, 3, 999999999], 5),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p8_input([10**9] * 10, 1),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p8_input([100, 1, 1, 1, 1], 4),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests (all < 150KB)
        {"input": rand_case(30, 6, 1, 100), "hidden": True, "checkBrute": True},
        {
            "input": make_p8_input(
                [rng.choice([1, 2, 5, 1000, 50000]) for _ in range(35)],
                12,
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {"input": rand_case(5000, 50, 1, 10**9), "hidden": True, "checkBrute": False},
        {"input": make_p8_input([10**9] * 12000, 1), "hidden": True, "checkBrute": False},
        {"input": rand_case(12000, 7, 10**8, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_case(12000, 12000, 1, 10**9), "hidden": True, "checkBrute": False},
        {"input": rand_case(30000, 150, 1, 999), "hidden": True, "checkBrute": False},
        {"input": rand_case(30000, 10000, 1, 999), "hidden": True, "checkBrute": False},
        {"input": make_p8_input(wave_30k, 300), "hidden": True, "checkBrute": False},
    ]

    stress = [
        rand_case(n, rng.randint(1, n), 1, 40)
        for n in [rng.randint(1, 25) for _ in range(30)]
    ]

    return {
        "slug": "cp05-split-array-min-max-sum",
        "title": "Chia mảng thành K đoạn cực tiểu hóa tổng lớn nhất",
        "shortDescription": "Tìm kiếm nhị phân trên ngưỡng tổng lớn nhất M và dùng gom đoạn tham lam để chia mảng thành đúng K đoạn liên tiếp không rỗng.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.binary_search_answer",
        "tags": ["tìm kiếm nhị phân", "tham lam", "tối ưu", "tầng 2"],
        "statement": r"""Một trung tâm xử lý dữ liệu có $N$ tác vụ nối tiếp nhau theo thứ tự cố định, tác vụ thứ $i$ cần thời gian xử lý nguyên dương $a_i$ giây ($1 \le a_i \le 10^9$).

Cần phân công dãy tác vụ này cho đúng $K$ máy chủ ($1 \le K \le N$) sao cho:
- Mỗi máy chủ nhận một **đoạn liên tiếp không rỗng** các tác vụ.
- Mọi tác vụ đều thuộc về đúng một máy chủ.

Vì các máy chủ chạy song song, thời gian hoàn thành toàn bộ hệ thống bằng **tổng thời gian lớn nhất** trong số $K$ máy chủ. Hãy tìm giá trị **nhỏ nhất** có thể của tổng lớn nhất đó.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, K$ ($1 \le K \le N \le 30\,000$).
- Dòng thứ hai gồm $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

### Dữ liệu ra
- In ra một số nguyên duy nhất là tổng lớn nhất nhỏ nhất có thể sau khi chia mảng thành đúng $K$ đoạn liên tiếp không rỗng.

### Ràng buộc
- $1 \le K \le N \le 30\,000$
- $1 \le a_i \le 10^9$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N log(sum a_i)).\n"
            + "Tổng toàn mảng có thể lên tới 3 * 10^13 nên cần kiểu 64-bit (long long) cho cận tìm kiếm.\n"
        ),
        "hints": r"""### Gợi ý 1
Xét bài toán kiểm tra ngược: với một ngưỡng $X$ cố định, liệu ta có thể chia mảng thành **không quá $K$ đoạn liên tiếp** sao cho mỗi đoạn có tổng $\le X$ hay không? Nếu có thể với $X$, chắc chắn cũng làm được với mọi $X' > X$.

### Gợi ý 2
Chú ý hai chi tiết quan trọng của hàm kiểm tra `can_split(X)`:
1. Cận dưới của $X$ phải là $\max(a_i)$ (nếu $X < \max(a_i)$ thì không đoạn nào chứa nổi phần tử lớn nhất), còn cận trên là $\sum_{i=1}^N a_i$.
2. Để tối thiểu hóa số đoạn cần dùng, ta **tham lam** gom liên tiếp nhiều phần tử nhất có thể vào đoạn hiện tại chừng nào tổng đoạn chưa vượt $X$; khi vượt $X$ thì mở đoạn mới. Nếu số đoạn sinh ra `parts <= K`, ta luôn có thể tách nhỏ các đoạn có độ dài $\ge 2$ thành đúng $K$ đoạn không rỗng (vì $N \ge K$ và $a_i > 0$ nên tách đoạn không bao giờ làm tăng tổng).

### Gợi ý 3
Thực hiện tìm kiếm nhị phân trên $[\max(a_i), \sum a_i]$:
- Nếu `can_split(mid)` đúng: cập nhật `ans = mid` và thử thu nhỏ hơn (`hi = mid - 1`).
- Nếu sai: tăng cận dưới (`lo = mid + 1`).
Luôn dùng `long long` trong C++ cho `lo`, `hi`, `mid`, `cur` và `ans`.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    long long lo = 0, hi = 0;
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
        lo = max(lo, a[i]);
        hi += a[i];
    }

    auto can_split = [&](long long limit) -> bool {
        int parts = 1;
        long long cur = 0;
        for (long long x : a) {
            if (cur + x > limit) {
                ++parts;
                cur = x;
                if (parts > k) return false;
            } else {
                cur += x;
            }
        }
        return parts <= k;
    };

    long long ans = hi;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (can_split(mid)) {
            ans = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    cout << ans << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2 : 2 + n]]

    lo = max(a)
    hi = sum(a)
    ans = hi
    while lo <= hi:
        mid = (lo + hi) // 2
        parts = 1
        cur = 0
        ok = True
        for x in a:
            if cur + x > mid:
                parts += 1
                cur = x
                if parts > k:
                    ok = False
                    break
            else:
                cur += x
        if ok:
            ans = mid
            hi = mid - 1
        else:
            lo = mid + 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p8,
        "extraStressInputs": stress,
    }


# =============================================================================
# 9. cp05-count-valid-triangles
# =============================================================================
def brute_p9(inp: str) -> str:
    toks = inp.split()
    n = int(toks[0])
    a = [int(x) for x in toks[1 : 1 + n]]
    ans = 0
    for i in range(n):
        ai = a[i]
        for j in range(i + 1, n):
            aj = a[j]
            for k in range(j + 1, n):
                ak = a[k]
                if ai + aj > ak and ai + ak > aj and aj + ak > ai:
                    ans += 1
    return str(ans)


def make_p9_input(arr: List[int]) -> str:
    return f"{len(arr)}\n{fmt_arr(arr)}"


def build_p9() -> dict:
    rng = random.Random(509)

    fibs = [1, 1]
    while fibs[-1] + fibs[-2] <= 10**9:
        fibs.append(fibs[-1] + fibs[-2])

    # Power-law / exponential mixed array
    exp_mix = [min(10**9, max(1, int(2 ** rng.uniform(0, 29.8)))) for _ in range(1500)]
    dup10_pool = [rng.randint(1, 10**9) for _ in range(10)]

    tests = [
        # 3 public samples
        {
            "input": make_p9_input([2, 2, 3, 4]),
            "expected": "3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p9_input([1, 2, 3, 5, 8]),
            "expected": "0",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": make_p9_input([5, 5, 5, 5]),
            "expected": "4",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / degenerate / Fibonacci / 10^9 boundary tests
        {
            "input": make_p9_input([3, 4]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p9_input([10**9, 10**9, 10**9]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p9_input([500_000_000, 500_000_000, 10**9]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p9_input(fibs),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests (includes 32-bit int overflow tests on ans > 2.14e9!)
        {
            "input": make_p9_input([rng.randint(1, 20) for _ in range(50)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p9_input([rng.randint(1, 10**9) for _ in range(60)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": make_p9_input([rng.randint(1, 1000) for _ in range(500)]),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p9_input([rng.randint(1, 10**9) for _ in range(1000)]),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p9_input(exp_mix),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p9_input([rng.choice(dup10_pool) for _ in range(2000)]),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p9_input([10**9] * 2500),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p9_input([rng.randint(1, 10**9) for _ in range(2500)]),
            "hidden": True,
            "checkBrute": False,
        },
        {
            "input": make_p9_input([rng.randint(500_000_000, 10**9) for _ in range(2500)]),
            "hidden": True,
            "checkBrute": False,
        },
    ]

    stress = [
        make_p9_input([rng.randint(1, 25) for _ in range(rng.randint(1, 28))])
        for _ in range(30)
    ]

    return {
        "slug": "cp05-count-valid-triangles",
        "title": "Đếm số bộ ba tạo thành tam giác",
        "shortDescription": "Sắp xếp độ dài các que gỗ và cố định cạnh lớn nhất kết hợp hai con trỏ trong O(N^2) để đếm số tam giác không suy biến.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.two_pointers",
        "tags": ["hai con trỏ", "sắp xếp", "hình học", "tầng 2"],
        "statement": r"""Một xưởng thủ công có $N$ que gỗ có độ dài nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

Hãy đếm số bộ ba chỉ số $(i, j, k)$ thỏa mãn $1 \le i < j < k \le N$ sao cho ba que gỗ có độ dài $a_i, a_j, a_k$ ghép được thành ba cạnh của một **tam giác không suy biến** (tổng độ dài hai cạnh bất kỳ phải lớn hơn hẳn cạnh còn lại).

### Dữ liệu vào
- Dòng đầu tiên gồm một số nguyên $N$ ($1 \le N \le 2500$).
- Dòng thứ hai gồm $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

### Dữ liệu ra
- In ra một số nguyên duy nhất là số bộ ba chỉ số thỏa mãn.

### Ràng buộc
- $1 \le N \le 2500$
- $1 \le a_i \le 10^9$""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(N^2) thời gian.\n"
            + "Cảnh báo tràn số 32-bit: với N = 2500, đáp án có thể đạt C(2500, 3) = 2,601,042,500 > 2^31 - 1, bắt buộc dùng kiểu 64-bit (long long)!\n"
        ),
        "hints": r"""### Gợi ý 1
Nếu sắp xếp mảng tăng dần $a_1 \le a_2 \le \dots \le a_N$, thì với ba chỉ số $l < r < k$, hai điều kiện $a_l + a_k > a_r$ và $a_r + a_k > a_l$ luôn tự động đúng. Ta chỉ cần kiểm tra đúng một điều kiện duy nhất:
$$a_l + a_r > a_k$$

### Gợi ý 2
Cố định chỉ số cạnh lớn nhất $k$ chạy từ $N - 1$ về $2$. Trong đoạn $[0, k - 1]$, dùng hai con trỏ `l = 0` và `r = k - 1`:
- Nếu $a_l + a_r > a_k$: vì mảng không giảm, mọi chỉ số $p \in [l, r - 1]$ đều thỏa $a_p + a_r \ge a_l + a_r > a_k$. Do đó có ngay `r - l` bộ ba hợp lệ ứng với cặp $(r, k)$; cộng `r - l` vào đáp án rồi giảm `r`.
- Ngược lại ($a_l + a_r \le a_k$): cần tăng tổng hai cạnh nhỏ hơn bằng cách tăng `l`.

### Gợi ý 3
Mỗi bước lặp của vòng `while (l < r)` làm khoảng cách `r - l` giảm đi $1$, nên toàn thuật toán chạy đúng $O(N^2)$. Đừng quên dùng dấu `>` nghiêm ngặt (loại tam giác suy biến có $a + b = c$) và khai báo `long long` cho cả `ans` (tối đa $\binom{2500}{3} \approx 2.6 \cdot 10^9$) lẫn `a[l] + a[r]`.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];
    sort(a.begin(), a.end());

    long long ans = 0;
    for (int k = n - 1; k >= 2; --k) {
        int l = 0, r = k - 1;
        while (l < r) {
            if (a[l] + a[r] > a[k]) {
                ans += (r - l);
                --r;
            } else {
                ++l;
            }
        }
    }

    cout << ans << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1 : 1 + n]]
    a.sort()

    ans = 0
    for k in range(n - 1, 1, -1):
        ak = a[k]
        l = 0
        r = k - 1
        while l < r:
            if a[l] + a[r] > ak:
                ans += r - l
                r -= 1
            else:
                l += 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p9,
        "extraStressInputs": stress,
    }


# =============================================================================
# 10. cp05-kth-in-multiplication-table
# =============================================================================
def brute_p10(inp: str) -> str:
    n, m, k = map(int, inp.split())
    vals = sorted(i * j for i in range(1, n + 1) for j in range(1, m + 1))
    return str(vals[k - 1])


def build_p10() -> dict:
    rng = random.Random(510)

    tests = [
        # 3 public samples
        {
            "input": "3 3 5",
            "expected": "3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": "2 3 6",
            "expected": "6",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": "3 4 7",
            "expected": "4",
            "hidden": False,
            "checkBrute": True,
        },
        # 4 corner / boundary / 64-bit tests
        {"input": "1 1 1", "hidden": True, "checkBrute": True},
        {"input": "1 100000 73421", "hidden": True, "checkBrute": False},
        {"input": "100000 1 100000", "hidden": True, "checkBrute": False},
        {"input": "100000 100000 1", "hidden": True, "checkBrute": False},
        # 9 medium -> large tests
        {"input": "12 15 100", "hidden": True, "checkBrute": True},
        {"input": "100 100 5000", "hidden": True, "checkBrute": True},
        {"input": "2 100000 100000", "hidden": True, "checkBrute": False},
        {"input": "1000 1000 500000", "hidden": True, "checkBrute": False},
        {"input": "50000 50000 1250000000", "hidden": True, "checkBrute": False},
        {"input": "100000 100000 10000000000", "hidden": True, "checkBrute": False},
        {"input": "100000 100000 9999999999", "hidden": True, "checkBrute": False},
        {"input": "100000 100000 5000000000", "hidden": True, "checkBrute": False},
        {"input": "99991 99989 3141592653", "hidden": True, "checkBrute": False},
    ]

    stress = []
    for _ in range(35):
        n = rng.randint(1, 35)
        m = rng.randint(1, 35)
        k = rng.randint(1, n * m)
        stress.append(f"{n} {m} {k}")

    return {
        "slug": "cp05-kth-in-multiplication-table",
        "title": "Phần tử nhỏ thứ K trong bảng cửu chương",
        "shortDescription": "Tìm kiếm nhị phân trên giá trị kết quả X kết hợp đếm số ô i*j <= X theo từng hàng trong O(min(N, M) log(N*M)).",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.binary_search_answer",
        "tags": ["tìm kiếm nhị phân", "toán học", "tối ưu", "tầng 2"],
        "statement": r"""Cho bảng cửu chương kích thước $N \times M$ gồm $N$ hàng và $M$ cột, trong đó ô nằm ở hàng $i$, cột $j$ ($1 \le i \le N$, $1 \le j \le M$) chứa giá trị $i \cdot j$.

Nếu liệt kê toàn bộ $N \cdot M$ số trong bảng (tính cả các giá trị xuất hiện nhiều lần) và sắp xếp chúng theo thứ tự không giảm, hãy tìm giá trị đứng ở **vị trí thứ $K$** (đánh số từ $1$).

### Dữ liệu vào
- Một dòng duy nhất gồm ba số nguyên $N, M, K$ ($1 \le N, M \le 10^5$, $1 \le K \le N \cdot M$).

### Dữ liệu ra
- In ra một số nguyên duy nhất là phần tử nhỏ thứ $K$ của bảng cửu chương.

### Ràng buộc
- $1 \le N, M \le 10^5$
- $1 \le K \le N \cdot M$ (chú ý $N \cdot M$ có thể lên tới $10^{10}$)""",
        "requirementsText": (
            REQ_HEADER
            + "Độ phức tạp mong đợi: O(min(N, M) * log(N * M)).\n"
            + "Không thể tạo mảng kích thước N * M (tới 10^10 phần tử). Bắt buộc dùng kiểu 64-bit (long long) cho N, M, K và cận tìm kiếm.\n"
        ),
        "hints": r"""### Gợi ý 1
Với $N, M \le 10^5$, bảng có tới $10^{10}$ ô nên không thể liệt kê rồi sắp xếp. Thay vào đó, hãy đặt câu hỏi ngược: với một số nguyên dương $X$, có bao nhiêu ô $(i, j)$ trong bảng thỏa mãn $i \cdot j \le X$?

### Gợi ý 2
Ở hàng thứ $i$ ($1 \le i \le N$), các phần tử là $i, 2i, \dots, M \cdot i$. Số phần tử không vượt quá $X$ trên hàng $i$ chính là $\min\left(M, \left\lfloor \frac{X}{i} \right\rfloor\right)$. Vậy tổng số ô có giá trị $\le X$ trong toàn bảng là:
$$\text{count}(X) = \sum_{i=1}^{N} \min\left(M, \left\lfloor \frac{X}{i} \right\rfloor\right)$$
Hàm $\text{count}(X)$ không giảm theo $X$, nên đáp án chính là **giá trị $X$ nhỏ nhất** thỏa $\text{count}(X) \ge K$.

### Gợi ý 3
Tại sao giá trị $X$ nhỏ nhất thỏa $\text{count}(X) \ge K$ chắc chắn **có xuất hiện** trong bảng? Vì nếu $X$ không xuất hiện trong bảng thì $\text{count}(X - 1) = \text{count}(X) \ge K$, mâu thuẫn với tính nhỏ nhất của $X$!
Mẹo tối ưu và tránh lỗi:
- Hoán đổi để $N \le M$ nhằm giảm số vòng lặp khi một chiều rất nhỏ.
- Với $i \le \min(N, \lfloor X / M \rfloor)$, cả $M$ ô của hàng $i$ đều $\le X$; với các hàng còn lại chỉ cần duyệt tới $\min(N, X)$ và cộng $\lfloor X / i \rfloor$.
- Dùng `long long` cho tất cả biến vì $K$ và $N \cdot M$ lên tới $10^{10}$.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long n, m, k;
    if (!(cin >> n >> m >> k)) return 0;
    if (n > m) swap(n, m);

    auto count_le = [&](long long x) -> long long {
        long long total = 0;
        long long full = min(n, x / m);
        total += full * m;
        long long upper = min(n, x);
        for (long long i = full + 1; i <= upper; ++i) {
            total += x / i;
        }
        return total;
    };

    long long lo = 1, hi = n * m, ans = hi;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (count_le(mid) >= k) {
            ans = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }

    cout << ans << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    k = int(data[2])
    if n > m:
        n, m = m, n

    lo = 1
    hi = n * m
    ans = hi
    while lo <= hi:
        mid = (lo + hi) // 2
        full = mid // m
        if full > n:
            full = n
        total = full * m
        upper = mid if mid < n else n
        for i in range(full + 1, upper + 1):
            total += mid // i
        if total >= k:
            ans = mid
            hi = mid - 1
        else:
            lo = mid + 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p10,
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

    # Strict size guard (< 150KB per test input) before handing off to pack_lib
    for p in problems:
        assert len(p["tests"]) == 16, f"[{p['slug']}] expected 16 tests, got {len(p['tests'])}"
        for idx, tc in enumerate(p["tests"], 1):
            nbytes = len(tc["input"].encode("utf-8"))
            assert nbytes < 150_000, f"[{p['slug']}] test #{idx} too large: {nbytes} bytes"

    build_and_verify_pack(
        pack_id="05-binary-search-two-pointers",
        title="Tầng 2: Tìm kiếm nhị phân, Hai con trỏ & Cửa sổ trượt",
        tier="Tầng 2 — Kỹ thuật lõi",
        description="10 bài kỹ thuật lõi: lower/upper bound, hai con trỏ, cửa sổ trượt cố định/biến đổi và 4 bài tìm kiếm nhị phân trên đáp án kinh điển.",
        problems=problems,
    )


if __name__ == "__main__":
    main()
