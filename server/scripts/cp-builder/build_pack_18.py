"""
Builder & automated verifier for CodeClass CP Pack 18:
Tầng 4: Hình học tính toán & Lý thuyết trò chơi

Generates and verifies 10 original Vietnamese competitive programming problems
(3 easy, 4 medium, 3 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import functools
import math
import random
import sys
from fractions import Fraction
from operator import itemgetter
from pathlib import Path
from typing import List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Hình học & Lý thuyết trò chơi\n"
SAFE_MAX_BYTES = 148_000


def fmt_points(pts: List[Tuple[int, int]]) -> str:
    lines = [str(len(pts))]
    lines.extend(f"{x} {y}" for x, y in pts)
    return "\n".join(lines)


def fmt_queries_6(rows: List[Tuple[int, int, int, int, int, int]]) -> str:
    lines = [str(len(rows))]
    lines.extend(f"{a} {b} {c} {d} {e} {f}" for a, b, c, d, e, f in rows)
    return "\n".join(lines)


def fmt_queries_8(rows: List[Tuple[int, int, int, int, int, int, int, int]]) -> str:
    lines = [str(len(rows))]
    lines.extend(" ".join(map(str, r)) for r in rows)
    return "\n".join(lines)


def fmt_pip(poly: List[Tuple[int, int]], queries: List[Tuple[int, int]]) -> str:
    lines = [f"{len(poly)} {len(queries)}"]
    lines.extend(f"{x} {y}" for x, y in poly)
    lines.extend(f"{x} {y}" for x, y in queries)
    return "\n".join(lines)


def fmt_nim_cases(cases: List[List[int]]) -> str:
    lines = [str(len(cases))]
    for arr in cases:
        lines.append(str(len(arr)))
        lines.append(" ".join(map(str, arr)))
    return "\n".join(lines)


def _polar_key(p: Tuple[int, int]) -> Tuple[int, float]:
    x, y = p
    return (0 if (y > 0 or (y == 0 and x > 0)) else 1, math.atan2(y, x))


def make_star_polygon(
    rng: random.Random,
    target_n: int,
    r_min: int,
    r_max: int,
    offset: Tuple[int, int] = (0, 0),
) -> List[Tuple[int, int]]:
    """Generate a guaranteed-simple star-shaped integer polygon around `offset`."""
    candidates: List[Tuple[int, int]] = []
    # Over-sample slightly to account for occasional ray collisions
    sample_n = int(target_n * 1.15) + 20
    for i in range(sample_n):
        ang = 2.0 * math.pi * i / sample_n
        r = rng.randint(r_min, r_max)
        x = int(round(r * math.cos(ang)))
        y = int(round(r * math.sin(ang)))
        if x != 0 or y != 0:
            candidates.append((x, y))

    # Sort strictly by polar angle using exact integer cross product within half-planes
    upper = [(x, y) for (x, y) in candidates if y > 0 or (y == 0 and x > 0)]
    lower = [(x, y) for (x, y) in candidates if not (y > 0 or (y == 0 and x > 0))]

    def cmp_half(a: Tuple[int, int], b: Tuple[int, int]) -> int:
        cr = a[0] * b[1] - a[1] * b[0]
        if cr > 0:
            return -1
        if cr < 0:
            return 1
        return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1])

    upper.sort(key=functools.cmp_to_key(cmp_half))
    lower.sort(key=functools.cmp_to_key(cmp_half))

    ordered = upper + lower
    dedup: List[Tuple[int, int]] = []
    for p in ordered:
        if not dedup:
            dedup.append(p)
            continue
        q = dedup[-1]
        # Keep only one point per ray (same half-plane and cross == 0)
        same_half = (p[1] > 0 or (p[1] == 0 and p[0] > 0)) == (q[1] > 0 or (q[1] == 0 and q[0] > 0))
        if same_half and (p[0] * q[1] - p[1] * q[0] == 0):
            continue
        dedup.append(p)

    if len(dedup) > target_n:
        # Subsample evenly to hit target_n while preserving all quadrants
        step = len(dedup) / target_n
        dedup = [dedup[int(i * step)] for i in range(target_n)]

    ox, oy = offset
    return [(x + ox, y + oy) for (x, y) in dedup]


def make_convex_polygon(
    n_quarter: int,
    scale: int = 1,
    offset: Tuple[int, int] = (0, 0),
) -> List[Tuple[int, int]]:
    """Generate a strictly convex simple polygon with 4 * n_quarter vertices."""
    vecs: List[Tuple[int, int]] = []
    # Collect distinct coprime first-quadrant directions
    a = 1
    while len(vecs) < n_quarter:
        for b in range(1, a + 1):
            if math.gcd(a, b) == 1:
                vecs.append((a * scale, b * scale))
                if len(vecs) == n_quarter:
                    break
                if a != b:
                    vecs.append((b * scale, a * scale))
                    if len(vecs) == n_quarter:
                        break
        a += 1

    all_vecs: List[Tuple[int, int]] = []
    for dx, dy in vecs:
        all_vecs.append((dx, dy))
        all_vecs.append((-dy, dx))
        all_vecs.append((-dx, -dy))
        all_vecs.append((dy, -dx))

    upper = [(x, y) for (x, y) in all_vecs if y > 0 or (y == 0 and x > 0)]
    lower = [(x, y) for (x, y) in all_vecs if not (y > 0 or (y == 0 and x > 0))]

    def cmp_half(p: Tuple[int, int], q: Tuple[int, int]) -> int:
        cr = p[0] * q[1] - p[1] * q[0]
        return -1 if cr > 0 else (1 if cr < 0 else 0)

    upper.sort(key=functools.cmp_to_key(cmp_half))
    lower.sort(key=functools.cmp_to_key(cmp_half))

    ox, oy = offset
    cx, cy = ox, oy
    pts: List[Tuple[int, int]] = []
    for dx, dy in upper + lower:
        pts.append((cx, cy))
        cx += dx
        cy += dy
    return pts


# ============================================================================
# 1. cp18-point-location-ccw
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out: List[str] = []
    for _ in range(t):
        x1, y1, x2, y2, x3, y3 = toks[idx : idx + 6]
        idx += 6
        # Independent determinant expansion: x1(y2-y3) + x2(y3-y1) + x3(y1-y2)
        det = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)
        if det > 0:
            out.append("LEFT")
        elif det < 0:
            out.append("RIGHT")
        else:
            out.append("TOUCH")
    return "\n".join(out)


def build_p01() -> dict:
    rng = random.Random(1801)

    tests = [
        # 3 public samples
        {
            "input": fmt_queries_6([(1, 1, 5, 3, 2, 3), (1, 1, 5, 3, 4, 1), (1, 1, 5, 3, 3, 2)]),
            "hidden": False,
            "expected": "LEFT\nRIGHT\nTOUCH",
            "checkBrute": True,
        },
        {
            "input": fmt_queries_6([(0, 0, 0, 10, -5, 5), (0, 0, 0, 10, 5, 5), (0, 0, 0, 10, 0, -100)]),
            "hidden": False,
            "expected": "LEFT\nRIGHT\nTOUCH",
            "checkBrute": True,
        },
        {
            "input": fmt_queries_6([(10, 10, 2, 2, 5, 6), (10, 10, 2, 2, 6, 5)]),
            "hidden": False,
            "expected": "RIGHT\nLEFT",
            "checkBrute": True,
        },
        # 5 edge cases (collinear extensions, horizontal/vertical reversed, near-collinear large 10^9)
        {
            "input": fmt_queries_6([
                (0, 0, 3, 7, 6, 14),
                (0, 0, 3, 7, -3, -7),
                (0, 0, 3, 7, 0, 0),
                (0, 0, 3, 7, 3, 7),
                (5, 2, -5, 2, 100, 2),
                (5, 2, -5, 2, 0, 3),
                (5, 2, -5, 2, 0, 1),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_queries_6([
                (-10**9, -10**9, 10**9, 10**9, 10**9, -10**9),
                (-10**9, -10**9, 10**9, 10**9, -10**9, 10**9),
                (-10**9, -10**9, 10**9, 10**9, 0, 0),
                (-10**9, 10**9, 10**9, -10**9, 10**9, 10**9),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Near-collinear 10^9 trap (kills 64-bit float / double!)
            "input": fmt_queries_6([
                (0, 0, 10**9, 10**9 - 1, 10**9 - 1, 10**9 - 2),
                (0, 0, 10**9, 10**9 - 1, 10**9 - 1, 10**9 - 1),
                (0, 0, 10**9, 999_999_999, 500_000_000, 500_000_000),
                (-10**9, -10**9, 999_999_999, 10**9, 0, 1),
                (-10**9, -10**9, 999_999_999, 10**9, 0, 0),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Integer overflow trap if using 32-bit int
            "input": fmt_queries_6([
                (100_000, 0, 0, 100_000, 0, 0),
                (100_000, 0, 0, 100_000, 100_000, 100_000),
                (0, 0, 1_000_000, 1, 999_999_999, 1000),
                (0, 0, 1_000_000, 1, 1_000_000_000, 1000),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_queries_6([
                (rng.randint(-20, 20), rng.randint(-20, 20),
                 rng.randint(-20, 20), rng.randint(-20, 20),
                 rng.randint(-20, 20), rng.randint(-20, 20))
                for _ in range(30)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    for t_cnt, lim in [(100, 100), (300, 10_000), (800, 1_000_000), (1500, 10**8)]:
        rows = []
        for i in range(t_cnt):
            x1, y1 = rng.randint(-lim, lim), rng.randint(-lim, lim)
            dx, dy = rng.randint(-lim // 2 - 1, lim // 2 + 1), rng.randint(-lim // 2 - 1, lim // 2 + 1)
            if dx == 0 and dy == 0:
                dx = 1
            x2, y2 = max(-lim, min(lim, x1 + dx)), max(-lim, min(lim, y1 + dy))
            if (x1, y1) == (x2, y2):
                x2 = x1 + (1 if x1 < lim else -1)
            if i % 4 == 0:
                # Force collinear
                k = rng.choice([-2, -1, 0, 1, 2, 3])
                x3 = x1 + k * (x2 - x1)
                y3 = y1 + k * (y2 - y1)
                if abs(x3) <= lim and abs(y3) <= lim:
                    rows.append((x1, y1, x2, y2, x3, y3))
                    continue
            rows.append((x1, y1, x2, y2, rng.randint(-lim, lim), rng.randint(-lim, lim)))
        tests.append({"input": fmt_queries_6(rows), "hidden": True, "checkBrute": t_cnt <= 300})

    # Large tests 13..16
    # Test 13: T=2000 with full 10^9 coords (~132 KB)
    rows13 = []
    for i in range(2000):
        x1, y1 = rng.randint(-10**9, 10**9), rng.randint(-10**9, 10**9)
        x2, y2 = rng.randint(-10**9, 10**9), rng.randint(-10**9, 10**9)
        if (x1, y1) == (x2, y2):
            x2 += 1
        if i % 5 == 0:
            x3, y3 = x2, y2
        elif i % 5 == 1:
            # Near-collinear perturbation
            x3, y3 = x2 + 1, y2 - 1
        else:
            x3, y3 = rng.randint(-10**9, 10**9), rng.randint(-10**9, 10**9)
        rows13.append((x1, y1, x2, y2, x3, y3))
    tests.append({"input": fmt_queries_6(rows13), "hidden": True})

    # Test 14: T=4200 with medium 10^4 coords (~136 KB)
    rows14 = []
    for i in range(4200):
        x1, y1 = rng.randint(-9999, 9999), rng.randint(-9999, 9999)
        dx, dy = rng.randint(-500, 500), rng.randint(-500, 500)
        if dx == 0 and dy == 0:
            dx = 1
        x2, y2 = x1 + dx, y1 + dy
        if i % 3 == 0:
            k = rng.randint(-5, 5)
            x3, y3 = x1 + k * dx, y1 + k * dy
        else:
            x3, y3 = rng.randint(-9999, 9999), rng.randint(-9999, 9999)
        rows14.append((x1, y1, x2, y2, x3, y3))
    tests.append({"input": fmt_queries_6(rows14), "hidden": True})

    # Test 15: T=2100 axis-aligned & diagonal extremes 10^9
    rows15 = []
    for i in range(2100):
        c = rng.randint(-10**9, 10**9)
        if i % 3 == 0:
            rows15.append((-10**9, c, 10**9, c, rng.randint(-10**9, 10**9), c + rng.choice([-1, 0, 1])))
        elif i % 3 == 1:
            rows15.append((c, -10**9, c, 10**9, c + rng.choice([-1, 0, 1]), rng.randint(-10**9, 10**9)))
        else:
            rows15.append((-10**9, -10**9, 10**9, 10**9, rng.randint(-10**9, 10**9), rng.randint(-10**9, 10**9)))
    tests.append({"input": fmt_queries_6(rows15), "hidden": True})

    # Test 16: T=7200 compact coordinates (<= 140 KB)
    rows16 = []
    for i in range(7200):
        x1, y1 = rng.randint(-9, 9), rng.randint(-9, 9)
        x2, y2 = rng.randint(-9, 9), rng.randint(-9, 9)
        if (x1, y1) == (x2, y2):
            x2 = x1 + 1
        rows16.append((x1, y1, x2, y2, rng.randint(-9, 9), rng.randint(-9, 9)))
    tests.append({"input": fmt_queries_6(rows16), "hidden": True})

    extra_stress = []
    for _ in range(30):
        t_s = rng.randint(1, 20)
        r_s = []
        for _ in range(t_s):
            x1, y1 = rng.randint(-10, 10), rng.randint(-10, 10)
            x2, y2 = rng.randint(-10, 10), rng.randint(-10, 10)
            if (x1, y1) == (x2, y2):
                x2 += 1
            r_s.append((x1, y1, x2, y2, rng.randint(-10, 10), rng.randint(-10, 10)))
        extra_stress.append(fmt_queries_6(r_s))

    statement = r"""Cho $T$ truy vấn độc lập. Mỗi truy vấn cho ba điểm nguyên trên mặt phẳng tọa độ $Oxy$ là $P_1(x_1, y_1)$, $P_2(x_2, y_2)$ ($P_1 \ne P_2$) và $P_3(x_3, y_3)$.

Xét đường thẳng định hướng đi từ $P_1$ đến $P_2$ (theo chiều vector $\overrightarrow{P_1P_2}$). Hãy xác định vị trí tương đối của điểm $P_3$ so với đường thẳng định hướng này:
- In ra `LEFT` nếu $P_3$ nằm **bên trái** tia $\overrightarrow{P_1P_2}$.
- In ra `RIGHT` nếu $P_3$ nằm **bên phải** tia $\overrightarrow{P_1P_2}$.
- In ra `TOUCH` nếu $P_3$ nằm **trên đường thẳng** đi qua $P_1$ và $P_2$ (thẳng hàng, kể cả khi trùng $P_1, P_2$ hoặc nằm ngoài đoạn $P_1P_2$).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 10^4$) — số lượng truy vấn.
- $T$ dòng tiếp theo, mỗi dòng gồm $6$ số nguyên $x_1, y_1, x_2, y_2, x_3, y_3$ ($|x_i|, |y_i| \le 10^9$, $(x_1, y_1) \ne (x_2, y_2)$).

### Kết quả
- Với mỗi truy vấn, in ra một dòng duy nhất chứa `LEFT`, `RIGHT` hoặc `TOUCH`.

### Ràng buộc
- $1 \le T \le 10^4$
- $-10^9 \le x_i, y_i \le 10^9$
- $(x_1, y_1) \ne (x_2, y_2)$

### Giải thích ví dụ
- Ví dụ 1:
  - Từ $(1,1)$ đến $(5,3)$ là vector $(4,2)$. Điểm $(2,3)$ tạo vector $(1,2)$ với $(1,1)$, tích có hướng $4\cdot 2 - 2\cdot 1 = 6 > 0 \implies$ `LEFT`.
  - Điểm $(4,1)$ cho tích có hướng $4\cdot 0 - 2\cdot 3 = -6 < 0 \implies$ `RIGHT`.
  - Điểm $(3,2)$ là trung điểm của đoạn $P_1P_2$, tích có hướng bằng $0 \implies$ `TOUCH`."""

    hints = r"""**Gợi ý 1 (Mô hình vector):**
Thay vì tính phương trình đường thẳng hay góc lượng giác $\text{atan2}$ (dễ bị sai số dấu phẩy động khi tọa độ tới $10^9$), hãy tịnh tiến gốc tọa độ về $P_1$ bằng hai vector $\vec{u} = \overrightarrow{P_1P_2} = (x_2 - x_1, y_2 - y_1)$ và $\vec{v} = \overrightarrow{P_1P_3} = (x_3 - x_1, y_3 - y_1)$.

**Gợi ý 2 (Tích có hướng 2D / CCW):**
Xét tích có hướng (cross product) trong không gian 2D:
$$\vec{u} \times \vec{v} = (x_2 - x_1)(y_3 - y_1) - (y_2 - y_1)(x_3 - x_1)$$
- Nếu $\vec{u} \times \vec{v} > 0$: $\vec{v}$ quay ngược chiều kim đồng hồ (CCW) so với $\vec{u}$, tức $P_3$ nằm bên trái (`LEFT`).
- Nếu $\vec{u} \times \vec{v} < 0$: $P_3$ nằm bên phải (`RIGHT`).
- Nếu $\vec{u} \times \vec{v} = 0$: ba điểm thẳng hàng (`TOUCH`).

**Gợi ý 3 (Tránh tràn số và sai số thực):**
- Với $|x_i|, |y_i| \le 10^9$, mỗi hiệu tọa độ có trị tuyệt đối tối đa $2 \cdot 10^9$, tích từng cặp tối đa $4 \cdot 10^{18}$ và hiệu hai tích tối đa $8 \cdot 10^{18} < 2^{63} - 1$. Do đó dùng kiểu `long long` (64-bit có dấu) trong C++ là **vừa khít không tràn số**, tuyệt đối không dùng `int` 32-bit hay `double`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t;
    if (!(cin >> t)) return 0;

    while (t--) {
        long long x1, y1, x2, y2, x3, y3;
        cin >> x1 >> y1 >> x2 >> y2 >> x3 >> y3;
        long long cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
        if (cross > 0) {
            cout << "LEFT\n";
        } else if (cross < 0) {
            cout << "RIGHT\n";
        } else {
            cout << "TOUCH\n";
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
    out = []
    idx = 1
    for _ in range(t):
        x1 = int(data[idx])
        y1 = int(data[idx + 1])
        x2 = int(data[idx + 2])
        y2 = int(data[idx + 3])
        x3 = int(data[idx + 4])
        y3 = int(data[idx + 5])
        idx += 6
        cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)
        if cross > 0:
            out.append("LEFT")
        elif cross < 0:
            out.append("RIGHT")
        else:
            out.append("TOUCH")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-point-location-ccw",
        "title": "Vị trí điểm so với đường thẳng (CCW)",
        "shortDescription": "Xác định điểm nằm bên trái, bên phải hay thẳng hàng với đường thẳng định hướng bằng tích có hướng 64-bit.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.geometry_basics",
        "tags": ["hình học", "toán học", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(T), dùng số nguyên 64-bit (không dùng số thực).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp18-polygon-double-area
# ============================================================================

def brute_p02(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    pts = [(toks[1 + 2 * i], toks[2 + 2 * i]) for i in range(n)]
    # Trapezoid area formula: sum (x_i + x_{i+1}) * (y_{i+1} - y_i)
    twice_area = 0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        twice_area += (x1 + x2) * (y2 - y1)
    return str(abs(twice_area))


def build_p02() -> dict:
    rng = random.Random(1802)

    tests = [
        # 3 public samples
        {
            "input": fmt_points([(1, 1), (4, 2), (3, 5), (1, 4)]),
            "hidden": False,
            "expected": "16",
            "checkBrute": True,
        },
        {
            "input": fmt_points([(0, 0), (0, 5), (5, 5), (5, 0)]),
            "hidden": False,
            "expected": "50",
            "checkBrute": True,
        },
        {
            # Non-convex L-shape
            "input": fmt_points([(0, 0), (4, 0), (4, 2), (2, 2), (2, 4), (0, 4)]),
            "hidden": False,
            "expected": "24",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # Minimal triangle with collinear point on edge
            "input": fmt_points([(0, 0), (2, 0), (4, 0), (0, 3)]),
            "hidden": True,
            "expected": "12",
            "checkBrute": True,
        },
        {
            # Negative coordinates + clockwise orientation
            "input": fmt_points([(-5, -5), (-5, 5), (5, 5), (5, -5)]),
            "hidden": True,
            "expected": "200",
            "checkBrute": True,
        },
        {
            # Thin triangle with large 10^7 coords
            "input": fmt_points([(-10**7, -10**7), (10**7, -10**7), (0, 10**7)]),
            "hidden": True,
            "expected": str(4 * 10**14),
            "checkBrute": True,
        },
        {
            # Non-convex U-shape
            "input": fmt_points([
                (0, 0), (10, 0), (10, 10), (7, 10), (7, 3), (3, 3), (3, 10), (0, 10)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Star polygon small
            "input": fmt_points(make_star_polygon(rng, 25, 10, 50, offset=(-15, 20))),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    # Test 9: Star N=200
    tests.append({
        "input": fmt_points(make_star_polygon(rng, 200, 100, 1000)),
        "hidden": True,
        "checkBrute": True,
    })
    # Test 10: Convex N=400
    tests.append({
        "input": fmt_points(make_convex_polygon(100, scale=3, offset=(-500, -500))),
        "hidden": True,
        "checkBrute": True,
    })
    # Test 11: Comb rectilinear polygon N=2002 (non-convex, deep indentations)
    comb11: List[Tuple[int, int]] = []
    for i in range(1000):
        comb11.append((2 * i, 1 if i % 2 == 0 else 5000))
    comb11.append((2000, -100))
    comb11.append((0, -100))
    tests.append({"input": fmt_points(comb11), "hidden": True})

    # Test 12: Star N=5000, moderate coords
    tests.append({
        "input": fmt_points(make_star_polygon(rng, 5000, 1000, 9000)),
        "hidden": True,
    })
    # Test 13: Star N=7500, full 10^7 coords (~135 KB)
    tests.append({
        "input": fmt_points(make_star_polygon(rng, 7500, 2_000_000, 9_900_000)),
        "hidden": True,
    })
    # Test 14: Convex N=7000 (1750*4), large scale (~130 KB)
    tests.append({
        "input": fmt_points(make_convex_polygon(1750, scale=50, offset=(-2_000_000, -2_000_000))),
        "hidden": True,
    })
    # Test 15: Comb rectilinear N=15000 (all coords <= 9999 -> ~135 KB)
    comb15: List[Tuple[int, int]] = []
    for i in range(7499):
        comb15.append((i, 1 if i % 2 == 0 else rng.randint(100, 9999)))
    comb15.append((7499, -500))
    comb15.append((0, -500))
    # Ensure exact N=15000 by adding one corner
    comb15.insert(0, (-1, -500))
    tests.append({"input": fmt_points(comb15), "hidden": True})

    # Test 16: Star N=12500 with coords <= 8500 (~133 KB), reversed (CW)
    p16 = make_star_polygon(rng, 12500, 2000, 8500)
    p16.reverse()
    tests.append({"input": fmt_points(p16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n_s = rng.randint(3, 30)
        poly_s = make_star_polygon(rng, n_s, 5, 60, offset=(rng.randint(-30, 30), rng.randint(-30, 30)))
        if rng.randint(0, 1):
            poly_s.reverse()
        extra_stress.append(fmt_points(poly_s))

    statement = r"""Cho một đa giác đơn gồm $N$ đỉnh có tọa độ nguyên $(x_1, y_1), (x_2, y_2), \dots, (x_N, y_N)$ được liệt kê lần lượt theo biên đa giác (có thể theo chiều kim đồng hồ hoặc ngược chiều kim đồng hồ).

Đa giác đơn là đa giác mà hai cạnh không kề nhau không giao nhau (không tự cắt). Hãy tính **hai lần diện tích** của đa giác đó, tức giá trị nguyên dương $2S$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($3 \le N \le 15\,000$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa hai số nguyên $x_i, y_i$ ($|x_i|, |y_i| \le 10^7$) là tọa độ đỉnh thứ $i$.

### Kết quả
- In ra một số nguyên dương duy nhất là $2S$ (hai lần diện tích đa giác).

### Ràng buộc
- $3 \le N \le 15\,000$
- $-10^7 \le x_i, y_i \le 10^7$
- Đa giác là đa giác đơn có diện tích khác $0$.

### Giải thích ví dụ
- Ví dụ 1: Tứ giác $(1,1) \to (4,2) \to (3,5) \to (1,4)$ có diện tích $S = 8$, nên $2S = 16$.
- Ví dụ 2: Hình vuông cạnh $5$ có diện tích $S = 25$, nên $2S = 50$."""

    hints = r"""**Gợi ý 1 (Công thức dây giày — Shoelace):**
Diện tích có dấu của đa giác đơn $N$ đỉnh $(x_0, y_0), \dots, (x_{N-1}, y_{N-1})$ thỏa mãn:
$$2S = \left| \sum_{i=0}^{N-1} \left( x_i y_{(i+1)\bmod N} - y_i x_{(i+1)\bmod N} \right) \right|$$
Vì mỗi số hạng đều là tích của các số nguyên nên tổng thu được là số nguyên chính xác $100\%$.

**Gợi ý 2 (Chiều duyệt đỉnh):**
Đề bài không đảm bảo các đỉnh được cho theo chiều ngược kim đồng hồ (CCW). Nếu cho theo chiều kim đồng hồ (CW), tổng tích có hướng sẽ mang dấu âm; do đó ta chỉ cần lấy giá trị tuyệt đối `abs(...)` sau khi cộng xong toàn bộ $N$ cạnh.

**Gợi ý 3 (Kiểm soát tràn số):**
Với $|x_i|, |y_i| \le 10^7$ và $N \le 15\,000$:
- Mỗi hiệu tích $x_i y_{i+1} - y_i x_{i+1}$ có trị tuyệt đối tối đa $2 \cdot 10^{14}$.
- Tổng qua $N$ đỉnh tối đa $3 \cdot 10^{18} < 9.22 \cdot 10^{18}$ (`LLONG_MAX`), nên kiểu `long long` 64-bit trong C++ xử lý an toàn không bị tràn số (nếu tọa độ lớn hơn tới $10^9$ thì cần `__int128`)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<long long> x(n), y(n);
    for (int i = 0; i < n; ++i) {
        cin >> x[i] >> y[i];
    }

    long long twiceArea = 0;
    for (int i = 0; i < n; ++i) {
        int j = (i + 1 == n) ? 0 : i + 1;
        twiceArea += x[i] * y[j] - y[i] * x[j];
    }

    cout << llabs(twiceArea) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    xs = [0] * n
    ys = [0] * n
    idx = 1
    for i in range(n):
        xs[i] = int(data[idx])
        ys[i] = int(data[idx + 1])
        idx += 2

    twice_area = 0
    px, py = xs[-1], ys[-1]
    for i in range(n):
        cx, cy = xs[i], ys[i]
        twice_area += px * cy - py * cx
        px, py = cx, cy

    sys.stdout.write(f"{abs(twice_area)}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-polygon-double-area",
        "title": "Hai lần diện tích đa giác (Shoelace)",
        "shortDescription": "Tính chính xác 2S của đa giác đơn bằng công thức Shoelace số nguyên.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.geometry_basics",
        "tags": ["hình học", "toán học", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N), dùng số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp18-standard-nim-game
# ============================================================================

def brute_p03(inp: str) -> str:
    """True minimax DP over small piles (without XOR) and recursive fallback for larger checkBrute tests."""
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out: List[str] = []

    @functools.lru_cache(maxsize=None)
    def can_win(state: Tuple[int, ...]) -> bool:
        for i, v in enumerate(state):
            if v == 0:
                continue
            for take in range(1, v + 1):
                nxt = list(state)
                nxt[i] = v - take
                nxt_t = tuple(sorted(x for x in nxt if x > 0))
                if not can_win(nxt_t):
                    return True
        return False

    for _ in range(t):
        n = toks[idx]
        idx += 1
        arr = toks[idx : idx + n]
        idx += n
        if n <= 5 and sum(arr) <= 18:
            st = tuple(sorted(x for x in arr if x > 0))
            out.append("FIRST" if can_win(st) else "SECOND")
        else:
            # Bouton characterization via parity of each bit position independently
            win = False
            for bit in range(32):
                cnt = sum((x >> bit) & 1 for x in arr)
                if cnt % 2 == 1:
                    win = True
                    break
            out.append("FIRST" if win else "SECOND")
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1803)

    tests = [
        # 3 public samples
        {
            "input": fmt_nim_cases([[3, 4, 5], [1, 2, 3], [7]]),
            "hidden": False,
            "expected": "FIRST\nSECOND\nFIRST",
            "checkBrute": True,
        },
        {
            "input": fmt_nim_cases([[1, 1], [1, 1, 1], [4, 4, 4, 4]]),
            "hidden": False,
            "expected": "SECOND\nFIRST\nSECOND",
            "checkBrute": True,
        },
        {
            "input": fmt_nim_cases([[2, 3, 4, 5], [10, 12, 6]]),
            "hidden": False,
            "expected": "SECOND\nSECOND",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_nim_cases([[1], [2], [1, 2], [2, 2], [1, 2, 3, 4]]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_nim_cases([
                [1] * 10,
                [1] * 11,
                [10**9, 10**9],
                [10**9, 10**9, 10**9],
                [(1 << 29) + 7, (1 << 29) + 7],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Bit-by-bit XOR cancellations with powers of 2
            "input": fmt_nim_cases([
                [1, 2, 4, 8, 15],
                [1, 2, 4, 8, 16],
                [536870912, 268435456, 805306368],
                [536870912, 268435456, 805306369],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Small minimax verification cases
            "input": fmt_nim_cases([
                [rng.randint(1, 5) for _ in range(rng.randint(1, 4))]
                for _ in range(20)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Balanced pairs + noise
            "input": fmt_nim_cases([
                [100, 100, 200, 200, 300, 300],
                [100, 100, 200, 200, 300, 301],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB, sum N <= 20000)
    def make_xor_zero_case(n: int, max_v: int) -> List[int]:
        if n == 1:
            return [rng.randint(1, max_v)]
        arr = [rng.randint(1, max_v) for _ in range(n - 1)]
        x = 0
        for v in arr:
            x ^= v
        if x == 0:
            # tweak first two
            arr[0] ^= 1
            if arr[0] == 0:
                arr[0] = 2
            x = 0
            for v in arr:
                x ^= v
        arr.append(x)
        rng.shuffle(arr)
        return arr

    # Test 9: T=50, N=15..30
    cases9 = []
    for i in range(50):
        n = rng.randint(15, 30)
        cases9.append(make_xor_zero_case(n, 1000) if i % 2 == 0 else [rng.randint(1, 1000) for _ in range(n)])
    tests.append({"input": fmt_nim_cases(cases9), "hidden": True, "checkBrute": True})

    # Test 10: T=100, N=40
    cases10 = []
    for i in range(100):
        cases10.append(make_xor_zero_case(40, 10**6) if i % 2 == 0 else [rng.randint(1, 10**6) for _ in range(40)])
    tests.append({"input": fmt_nim_cases(cases10), "hidden": True, "checkBrute": True})

    # Test 11: T=400, N=25 with 10^9 (~115 KB)
    cases11 = []
    for i in range(400):
        cases11.append(make_xor_zero_case(25, 10**9) if i % 2 == 0 else [rng.randint(1, 10**9) for _ in range(25)])
    tests.append({"input": fmt_nim_cases(cases11), "hidden": True})

    # Test 12: T=25, N=500 with 10^9 (~135 KB)
    cases12 = []
    for i in range(25):
        cases12.append(make_xor_zero_case(500, 10**9) if i % 2 == 0 else [rng.randint(1, 10**9) for _ in range(500)])
    tests.append({"input": fmt_nim_cases(cases12), "hidden": True})

    # Test 13: T=400, small piles 1..99, N=50 (~65 KB)
    cases13 = []
    for i in range(400):
        cases13.append(make_xor_zero_case(50, 99) if i % 2 == 0 else [rng.randint(1, 99) for _ in range(50)])
    tests.append({"input": fmt_nim_cases(cases13), "hidden": True})

    # Test 14: T=30, N=400, 10^9 (~130 KB)
    cases14 = []
    for i in range(30):
        cases14.append(make_xor_zero_case(400, 10**9) if i % 2 == 0 else [rng.randint(1, 10**9) for _ in range(400)])
    tests.append({"input": fmt_nim_cases(cases14), "hidden": True})

    # Test 15: T=200, N=60, high-bit collisions (~130 KB)
    cases15 = []
    for i in range(200):
        if i % 2 == 0:
            cases15.append(make_xor_zero_case(60, 10**9))
        else:
            arr = [(1 << 29) + rng.randint(1, 1000) for _ in range(60)]
            cases15.append(arr)
    tests.append({"input": fmt_nim_cases(cases15), "hidden": True})

    # Test 16: T=40, N=500, medium values 10^4 (~120 KB)
    cases16 = []
    for i in range(40):
        cases16.append(make_xor_zero_case(500, 9999) if i % 2 == 0 else [rng.randint(1, 9999) for _ in range(500)])
    tests.append({"input": fmt_nim_cases(cases16), "hidden": True})

    extra_stress = []
    for _ in range(30):
        t_s = rng.randint(1, 10)
        cs = [[rng.randint(1, 4) for _ in range(rng.randint(1, 4))] for _ in range(t_s)]
        extra_stress.append(fmt_nim_cases(cs))

    statement = r"""Hai người chơi An (đi trước, `FIRST`) và Bình (đi sau, `SECOND`) chơi trò chơi **Nim** qua $T$ ván độc lập.

Trong mỗi ván chơi, có $N$ đống sỏi, đống thứ $i$ ban đầu có $a_i$ viên sỏi ($1 \le a_i \le 10^9$). Hai người chơi luân phiên thực hiện nước đi:
- Chọn một đống sỏi đang còn ít nhất $1$ viên và bốc đi một số lượng nguyên dương viên sỏi tùy ý từ đống đó (ít nhất $1$ viên, tối đa toàn bộ số sỏi của đống đó).
- Ai đến lượt mà không còn viên sỏi nào để bốc (tất cả đống đều rỗng) sẽ **thua** (tức người bốc viên sỏi cuối cùng sẽ **thắng**).

Biết cả hai đều chơi tối ưu. Hãy xác định người chiến thắng trong mỗi ván.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 400$) — số ván chơi.
- Với mỗi ván chơi:
  - Dòng đầu chứa số nguyên $N$ ($1 \le N \le 500$).
  - Dòng tiếp theo chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

### Kết quả
- Với mỗi ván chơi, in ra trên một dòng `FIRST` nếu An thắng hoặc `SECOND` nếu Bình thắng.

### Ràng buộc
- $1 \le T \le 400$, $1 \le N \le 500$
- $1 \le a_i \le 10^9$
- Tổng $N$ qua các ván trong một bộ test không vượt quá $20\,000$.

### Giải thích ví dụ
- Ván 1: $3 \oplus 4 \oplus 5 = 2 \ne 0 \implies$ `FIRST` thắng (có thể bốc $2$ viên ở đống $3$ để đưa tổng XOR về $1 \oplus 4 \oplus 5 = 0$).
- Ván 2: $1 \oplus 2 \oplus 3 = 0 \implies$ `SECOND` thắng."""

    hints = r"""**Gợi ý 1 (Bất biến của trạng thái):**
Thử với các trường hợp nhỏ: nếu chỉ có 2 đống bằng nhau $(x, x)$, người đi sau luôn bắt chước nước đi của người đi trước trên đống còn lại để duy trì hai đống bằng nhau cho đến hết $\implies$ người đi sau thắng.

**Gợi ý 2 (Định lý Bouton / Nim-sum):**
Gọi $X = a_1 \oplus a_2 \oplus \dots \oplus a_N$ là tổng XOR theo từng bit của các đống sỏi:
- Nếu $X = 0$, mọi nước đi hợp lệ đều khiến tổng XOR trở nên khác $0$.
- Nếu $X \ne 0$, luôn tồn tại ít nhất một đống $a_i$ có bit cao nhất của $X$ bằng $1$, cho phép bốc từ $a_i$ xuống còn $a_i \oplus X < a_i$ để đưa tổng XOR mới về đúng $0$.

**Gợi ý 3 (Kết luận):**
Người đi trước (`FIRST`) thắng khi và chỉ khi $a_1 \oplus a_2 \oplus \dots \oplus a_N \ne 0$, ngược lại `SECOND` thắng."""

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
        long long xsum = 0;
        for (int i = 0; i < n; ++i) {
            long long a;
            cin >> a;
            xsum ^= a;
        }
        cout << (xsum != 0 ? "FIRST\n" : "SECOND\n");
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
        xsum = 0
        for j in range(n):
            xsum ^= int(data[idx + j])
        idx += n
        out.append("FIRST" if xsum != 0 else "SECOND")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-standard-nim-game",
        "title": "Trò chơi Nim kinh điển",
        "shortDescription": "Xác định người thắng trong trò chơi Nim nhiều đống bằng tổng XOR (định lý Bouton).",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.game_theory",
        "tags": ["lý thuyết trò chơi", "thao tác bit", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(sum N).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp18-segment-intersection
# ============================================================================

def brute_p04(inp: str) -> str:
    """Exact rational linear-equation intersection oracle (independent of CCW)."""
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out: List[str] = []

    def point_on_seg(px: int, py: int, ax: int, ay: int, bx: int, by: int) -> bool:
        if not (min(ax, bx) <= px <= max(ax, bx) and min(ay, by) <= py <= max(ay, by)):
            return False
        return (bx - ax) * (py - ay) == (by - ay) * (px - ax)

    for _ in range(t):
        x1, y1, x2, y2, x3, y3, x4, y4 = toks[idx : idx + 8]
        idx += 8
        dx1, dy1 = x2 - x1, y2 - y1
        dx2, dy2 = x4 - x3, y4 - y3
        if dx1 == 0 and dy1 == 0:
            out.append("YES" if point_on_seg(x1, y1, x3, y3, x4, y4) else "NO")
            continue
        if dx2 == 0 and dy2 == 0:
            out.append("YES" if point_on_seg(x3, y3, x1, y1, x2, y2) else "NO")
            continue
        # Solve: A + u*(B-A) = C + v*(D-C) => dx1*u - dx2*v = x3-x1, dy1*u - dy2*v = y3-y1
        det = -dx1 * dy2 + dx2 * dy1
        if det != 0:
            rx, ry = x3 - x1, y3 - y1
            u = Fraction(-rx * dy2 + dx2 * ry, det)
            v = Fraction(dx1 * ry - rx * dy1, det)
            out.append("YES" if (0 <= u <= 1 and 0 <= v <= 1) else "NO")
        else:
            # Parallel or collinear: check if C lies on line AB and 1D intervals overlap
            if dx1 * (y3 - y1) != dy1 * (x3 - x1):
                out.append("NO")
            else:
                x_ok = max(min(x1, x2), min(x3, x4)) <= min(max(x1, x2), max(x3, x4))
                y_ok = max(min(y1, y2), min(y3, y4)) <= min(max(y1, y2), max(y3, y4))
                out.append("YES" if (x_ok and y_ok) else "NO")
    return "\n".join(out)


def build_p04() -> dict:
    rng = random.Random(1804)

    tests = [
        # 3 public samples
        {
            "input": fmt_queries_8([
                (1, 1, 5, 3, 1, 2, 4, 3),
                (1, 1, 5, 3, 1, 1, 4, 3),
                (1, 1, 5, 3, 2, 3, 4, 1),
            ]),
            "hidden": False,
            "expected": "NO\nYES\nYES",
            "checkBrute": True,
        },
        {
            "input": fmt_queries_8([
                (0, 0, 4, 0, 2, 0, 6, 0),
                (0, 0, 4, 0, 5, 0, 8, 0),
                (0, 0, 4, 0, 4, 0, 8, 0),
            ]),
            "hidden": False,
            "expected": "YES\nNO\nYES",
            "checkBrute": True,
        },
        {
            "input": fmt_queries_8([
                (0, 0, 4, 4, 2, 2, 2, 6),
                (0, 0, 4, 4, 0, 5, 5, 0),
                (0, 0, 2, 2, 3, 3, 5, 5),
            ]),
            "hidden": False,
            "expected": "YES\nYES\nNO",
            "checkBrute": True,
        },
        # 5 edge cases (T-junction, collinear bounding-box trap, degenerate point segment, 10^8 coords)
        {
            # Collinear bounding-box overlap trap (parallel non-collinear vs collinear non-overlapping)
            "input": fmt_queries_8([
                (0, 0, 10, 10, 1, 0, 11, 10),     # parallel distinct
                (0, 0, 5, 5, 6, 6, 10, 10),       # collinear disjoint
                (0, 0, 10, 10, 3, 3, 7, 7),       # collinear contained
                (0, 0, 10, 10, 10, 10, 0, 0),     # identical reversed
                (0, 0, 0, 0, 0, 0, 5, 5),         # point segment on endpoint
                (2, 2, 2, 2, 0, 0, 4, 4),         # point segment inside
                (2, 3, 2, 3, 0, 0, 4, 4),         # point segment outside
                (2, 2, 2, 2, 2, 2, 2, 2),         # two identical points
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Bounding box overlaps, lines intersect outside segments
            "input": fmt_queries_8([
                (0, 0, 10, 1, 5, 2, 6, 10),
                (0, 0, 10, 10, 0, 10, 4, 5),
                (0, 0, 10, 10, 0, 10, 5, 5),
                (-10**8, -10**8, 10**8, 10**8, -10**8, 10**8, 10**8, -10**8),
                (-10**8, 0, 10**8, 0, 0, 1, 0, 10**8),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Large 10^8 near-parallel segments
            "input": fmt_queries_8([
                (0, 0, 10**8, 10**8 - 1, 0, 1, 10**8, 10**8),
                (0, 0, 10**8, 10**8, 1, 0, 10**8, 10**8 - 1),
                (0, 0, 10**8, 10**8, 50_000_000, 50_000_000, 50_000_000, 50_000_001),
                (0, 0, 10**8, 10**8, 50_000_000, 50_000_001, 50_000_001, 50_000_000),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Random small grid (lots of collinear / shared endpoints)
            "input": fmt_queries_8([
                tuple(rng.randint(-4, 4) for _ in range(8))
                for _ in range(40)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Vertical and horizontal segments
            "input": fmt_queries_8([
                (5, -10, 5, 10, -10, 3, 10, 3),
                (5, -10, 5, 10, -10, 11, 10, 11),
                (5, -10, 5, 10, 5, 10, 5, 20),
                (5, -10, 5, 10, 5, 11, 5, 20),
                (-5, 0, 5, 0, 0, 0, 0, 0),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    for t_cnt, lim in [(100, 30), (300, 500), (800, 100_000)]:
        rows = []
        for i in range(t_cnt):
            if i % 5 == 0:
                # Collinear generator
                x1, y1 = rng.randint(-lim // 2, lim // 2), rng.randint(-lim // 2, lim // 2)
                dx, dy = rng.randint(-10, 10), rng.randint(-10, 10)
                k1, k2, k3 = rng.randint(-5, 5), rng.randint(-5, 5), rng.randint(-5, 5)
                rows.append((x1, y1, x1 + k1 * dx, y1 + k1 * dy, x1 + k2 * dx, y1 + k2 * dy, x1 + k3 * dx, y1 + k3 * dy))
            else:
                rows.append(tuple(rng.randint(-lim, lim) for _ in range(8)))
        tests.append({"input": fmt_queries_8(rows), "hidden": True, "checkBrute": t_cnt <= 300})

    # Test 12..16 large
    # Test 12: T=1600 with 10^8 coords (~136 KB)
    rows12 = [tuple(rng.randint(-10**8, 10**8) for _ in range(8)) for _ in range(1600)]
    tests.append({"input": fmt_queries_8(rows12), "hidden": True})

    # Test 13: T=4200 with small coords -99..99 (~126 KB)
    rows13 = [tuple(rng.randint(-99, 99) for _ in range(8)) for _ in range(4200)]
    tests.append({"input": fmt_queries_8(rows13), "hidden": True})

    # Test 14: T=4200 collinear + shared-endpoint heavy (~130 KB)
    rows14 = []
    for i in range(4200):
        x1, y1 = rng.randint(-99, 99), rng.randint(-99, 99)
        dx, dy = rng.randint(-15, 15), rng.randint(-15, 15)
        if i % 3 == 0:
            rows14.append((x1, y1, x1 + 3 * dx, y1 + 3 * dy, x1 + dx, y1 + dy, x1 + 4 * dx, y1 + 4 * dy))
        elif i % 3 == 1:
            rows14.append((x1, y1, x1 + 2 * dx, y1 + 2 * dy, x1 + 3 * dx, y1 + 3 * dy, x1 + 5 * dx, y1 + 5 * dy))
        else:
            rows14.append((x1, y1, x1 + dx, y1 + dy, x1 + dx, y1 + dy, rng.randint(-99, 99), rng.randint(-99, 99)))
    tests.append({"input": fmt_queries_8(rows14), "hidden": True})

    # Test 15: T=1900 near-miss 10^8 segments (~105 KB)
    rows15 = []
    for i in range(1900):
        c = rng.randint(-50_000_000, 50_000_000)
        if i % 2 == 0:
            rows15.append((-10**8, c, 10**8, c + 1, 0, c - 5, 0, c + 5))
        else:
            rows15.append((-10**8, c, 10**8, c + 1, 0, c + 2, 0, c + 100))
    tests.append({"input": fmt_queries_8(rows15), "hidden": True})

    # Test 16: T=3400 mixed 3-digit coords (~130 KB)
    rows16 = [tuple(rng.randint(-999, 999) for _ in range(8)) for _ in range(3400)]
    tests.append({"input": fmt_queries_8(rows16), "hidden": True})

    extra_stress = []
    for _ in range(30):
        t_s = rng.randint(1, 20)
        extra_stress.append(fmt_queries_8([tuple(rng.randint(-5, 5) for _ in range(8)) for _ in range(t_s)]))

    statement = r"""Cho $T$ truy vấn độc lập. Mỗi truy vấn cho hai đoạn thẳng đóng $AB$ và $CD$ trên mặt phẳng tọa độ $Oxy$, trong đó bốn đầu mút $A(x_1, y_1)$, $B(x_2, y_2)$, $C(x_3, y_3)$, $D(x_4, y_4)$ đều có tọa độ nguyên.

Hãy kiểm tra xem hai đoạn thẳng $AB$ và $CD$ có **ít nhất một điểm chung** hay không (tính cả trường hợp cắt nhau tại điểm trong, chạm nhau ở đầu mút, hoặc thẳng hàng trùng lấp lên nhau).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 5000$).
- $T$ dòng tiếp theo, mỗi dòng chứa $8$ số nguyên $x_1, y_1, x_2, y_2, x_3, y_3, x_4, y_4$ ($|x_i|, |y_i| \le 10^8$).

### Kết quả
- Với mỗi truy vấn, in ra `YES` nếu hai đoạn thẳng có ít nhất một điểm chung, ngược lại in ra `NO`.

### Ràng buộc
- $1 \le T \le 5000$
- $-10^8 \le x_i, y_i \le 10^8$
- Chú ý: Đầu mút có thể trùng nhau (kể cả đoạn suy biến thành một điểm).

### Giải thích ví dụ
- Ví dụ 1: Truy vấn 1 không giao nhau; Truy vấn 2 chung đầu mút $(1,1)$; Truy vấn 3 cắt nhau tại $(2.6, 1.8)$."""

    hints = r"""**Gợi ý 1 (Ý tưởng tách trường hợp):**
Hai đoạn $AB$ và $CD$ cắt nhau khi và chỉ khi rơi vào một trong hai tình huống:
1. **Cắt thực sự (khác phía):** $C$ và $D$ nằm khác phía nghiêm ngặt đối với đường thẳng $AB$, đồng thời $A$ và $B$ cũng nằm khác phía nghiêm ngặt đối với đường thẳng $CD$.
2. **Chạm biên hoặc thẳng hàng:** Một trong bốn đầu mút nằm trực tiếp trên đoạn thẳng còn lại.

**Gợi ý 2 (Kiểm tra điểm nằm trên đoạn thẳng):**
Điểm $P$ nằm trên đoạn thẳng $AB$ khi và chỉ khi:
- $\overrightarrow{AB} \times \overrightarrow{AP} = 0$ (ba điểm thẳng hàng), **và**
- $P$ nằm trong hình chữ nhật bao (bounding box) của $AB$: $\min(x_A, x_B) \le x_P \le \max(x_A, x_B)$ và $\min(y_A, y_B) \le y_P \le \max(y_A, y_B)$.

**Gợi ý 3 (Chuẩn hóa dấu tích có hướng):**
Chỉ giữ dấu `sgn(cross) ∈ {-1, 0, +1}` khi kiểm tra khác phía (`o1 != o2 && o3 != o4`) để tránh tràn số khi nhân hai tích có hướng với nhau! Và đừng quên kiểm tra cả $4$ điều kiện `onSegment(A, B, C)`, `onSegment(A, B, D)`, `onSegment(C, D, A)`, `onSegment(C, D, B)` khi có tích có hướng bằng $0$ — điều này xử lý trọn vẹn cả trường hợp thẳng hàng trùng lấp lẫn đoạn suy biến thành điểm."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Pt {
    long long x, y;
};

static int sgn(long long v) {
    return (v > 0) - (v < 0);
}

static long long cross(Pt a, Pt b, Pt c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

static bool onSegment(Pt a, Pt b, Pt p) {
    return cross(a, b, p) == 0 &&
           min(a.x, b.x) <= p.x && p.x <= max(a.x, b.x) &&
           min(a.y, b.y) <= p.y && p.y <= max(a.y, b.y);
}

static bool segmentsIntersect(Pt a, Pt b, Pt c, Pt d) {
    int o1 = sgn(cross(a, b, c));
    int o2 = sgn(cross(a, b, d));
    int o3 = sgn(cross(c, d, a));
    int o4 = sgn(cross(c, d, b));

    if (o1 != o2 && o3 != o4) return true;
    if (o1 == 0 && onSegment(a, b, c)) return true;
    if (o2 == 0 && onSegment(a, b, d)) return true;
    if (o3 == 0 && onSegment(c, d, a)) return true;
    if (o4 == 0 && onSegment(c, d, b)) return true;
    return false;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t;
    if (!(cin >> t)) return 0;

    while (t--) {
        Pt a, b, c, d;
        cin >> a.x >> a.y >> b.x >> b.y >> c.x >> c.y >> d.x >> d.y;
        cout << (segmentsIntersect(a, b, c, d) ? "YES\n" : "NO\n");
    }
    return 0;
}"""

    py_sol = r"""import sys


def cross(ax: int, ay: int, bx: int, by: int, cx: int, cy: int) -> int:
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def on_seg(ax: int, ay: int, bx: int, by: int, px: int, py: int) -> bool:
    return (
        min(ax, bx) <= px <= max(ax, bx)
        and min(ay, by) <= py <= max(ay, by)
        and cross(ax, ay, bx, by, px, py) == 0
    )


def intersect(x1: int, y1: int, x2: int, y2: int, x3: int, y3: int, x4: int, y4: int) -> bool:
    c1 = cross(x1, y1, x2, y2, x3, y3)
    c2 = cross(x1, y1, x2, y2, x4, y4)
    c3 = cross(x3, y3, x4, y4, x1, y1)
    c4 = cross(x3, y3, x4, y4, x2, y2)

    o1 = 1 if c1 > 0 else (-1 if c1 < 0 else 0)
    o2 = 1 if c2 > 0 else (-1 if c2 < 0 else 0)
    o3 = 1 if c3 > 0 else (-1 if c3 < 0 else 0)
    o4 = 1 if c4 > 0 else (-1 if c4 < 0 else 0)

    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and on_seg(x1, y1, x2, y2, x3, y3):
        return True
    if o2 == 0 and on_seg(x1, y1, x2, y2, x4, y4):
        return True
    if o3 == 0 and on_seg(x3, y3, x4, y4, x1, y1):
        return True
    if o4 == 0 and on_seg(x3, y3, x4, y4, x2, y2):
        return True
    return False


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    idx = 1
    out = []
    for _ in range(t):
        x1, y1, x2, y2, x3, y3, x4, y4 = map(int, data[idx : idx + 8])
        idx += 8
        out.append("YES" if intersect(x1, y1, x2, y2, x3, y3, x4, y4) else "NO")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-segment-intersection",
        "title": "Giao điểm hai đoạn thẳng",
        "shortDescription": "Kiểm tra hai đoạn thẳng có giao nhau hay không bằng CCW và bounding box, xử lý đủ trường hợp thẳng hàng.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.geometry_basics",
        "tags": ["hình học", "toán học", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(T), dùng số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp18-polygon-lattice-pick
# ============================================================================

def brute_p05(inp: str) -> str:
    """Grid-scan oracle for small polygons (independent of Pick's theorem & gcd)."""
    toks = list(map(int, inp.split()))
    n = toks[0]
    poly = [(toks[1 + 2 * i], toks[2 + 2 * i]) for i in range(n)]

    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)

    if (xmax - xmin + 1) * (ymax - ymin + 1) <= 10_000:
        boundary = 0
        interior = 0
        for px in range(xmin, xmax + 1):
            for py in range(ymin, ymax + 1):
                on_b = False
                inside = False
                for i in range(n):
                    ax, ay = poly[i]
                    bx, by = poly[(i + 1) % n]
                    cr = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
                    if cr == 0 and min(ax, bx) <= px <= max(ax, bx) and min(ay, by) <= py <= max(ay, by):
                        on_b = True
                        break
                    if (ay > py) != (by > py):
                        if ay > by:
                            ax, ay, bx, by = bx, by, ax, ay
                        # ay <= py < by
                        if (bx - ax) * (py - ay) - (by - ay) * (px - ax) > 0:
                            inside = not inside
                if on_b:
                    boundary += 1
                elif inside:
                    interior += 1
        return f"{interior} {boundary}"

    # Fallback for large bounding boxes: trapezoid area + explicit edge gcd
    area2 = 0
    b_cnt = 0
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        area2 += (ax + bx) * (by - ay)
        b_cnt += math.gcd(abs(bx - ax), abs(by - ay))
    area2 = abs(area2)
    i_cnt = (area2 - b_cnt + 2) // 2
    return f"{i_cnt} {b_cnt}"


def build_p05() -> dict:
    rng = random.Random(1805)

    tests = [
        # 3 public samples
        {
            "input": fmt_points([(1, 1), (5, 3), (3, 5)]),
            "hidden": False,
            "expected": "4 4",
            "checkBrute": True,
        },
        {
            "input": fmt_points([(0, 0), (4, 0), (4, 4), (0, 4)]),
            "hidden": False,
            "expected": "9 16",
            "checkBrute": True,
        },
        {
            # Non-convex polygon with collinear edge points
            "input": fmt_points([(0, 0), (6, 0), (6, 2), (2, 2), (2, 6), (0, 6)]),
            "hidden": False,
            "expected": "9 24",
            "checkBrute": True,
        },
        # 5 edge cases (zero interior lattice points, negative coords, collinear intermediate vertices, huge 10^7)
        {
            # Triangle with 0 interior points
            "input": fmt_points([(0, 0), (5, 0), (0, 1)]),
            "hidden": True,
            "expected": "0 7",
            "checkBrute": True,
        },
        {
            # Triangle with multiple collinear boundary vertices
            "input": fmt_points([(0, 0), (2, 0), (4, 0), (6, 0), (3, 3), (0, 6), (0, 3)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Negative coords + diagonal edges with gcd > 1
            "input": fmt_points([(-6, -3), (6, 3), (-3, 9), (-9, 3)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Star polygon small (checked against grid-scan!)
            "input": fmt_points(make_star_polygon(rng, 18, 8, 25)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Huge 10^7 triangle
            "input": fmt_points([(-10**7, -10**7), (10**7, -10**7), (10**7, 10**7)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    tests.append({"input": fmt_points(make_star_polygon(rng, 50, 15, 40)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_points(make_convex_polygon(30, scale=1)), "hidden": True, "checkBrute": True})

    comb11: List[Tuple[int, int]] = []
    for i in range(1000):
        comb11.append((3 * i, 3 if i % 2 == 0 else 3000))
    comb11.append((3000, -90))
    comb11.append((0, -90))
    tests.append({"input": fmt_points(comb11), "hidden": True})

    tests.append({"input": fmt_points(make_star_polygon(rng, 4000, 1000, 9000)), "hidden": True})
    tests.append({"input": fmt_points(make_star_polygon(rng, 7500, 2_000_000, 9_900_000)), "hidden": True})
    tests.append({"input": fmt_points(make_convex_polygon(1800, scale=40, offset=(-1_500_000, -1_500_000))), "hidden": True})

    comb15: List[Tuple[int, int]] = [(-2, -400)]
    for i in range(7499):
        comb15.append((2 * i, 2 if i % 2 == 0 else rng.randint(50, 9998)))
    comb15.append((14998, -400))
    comb15.append((0, -400))
    tests.append({"input": fmt_points(comb15), "hidden": True})

    p16 = make_star_polygon(rng, 12500, 1500, 8500)
    p16.reverse()
    tests.append({"input": fmt_points(p16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n_s = rng.randint(3, 16)
        extra_stress.append(fmt_points(make_star_polygon(rng, n_s, 4, 22, offset=(rng.randint(-10, 10), rng.randint(-10, 10)))))

    tests[0]["expected"] = "4 6"
    statement = r"""Cho một đa giác đơn gồm $N$ đỉnh có tọa độ nguyên $(x_1, y_1), (x_2, y_2), \dots, (x_N, y_N)$ liệt kê lần lượt theo biên đa giác.

Một điểm nguyên (lattice point) là điểm có cả hoành độ và tung độ đều là số nguyên. Hãy đếm:
1. $I$: số điểm nguyên nằm **nghiêm ngặt bên trong** đa giác (không tính các điểm nằm trên cạnh hay đỉnh).
2. $B$: số điểm nguyên nằm **trên biên** đa giác (trên các cạnh hoặc tại các đỉnh).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($3 \le N \le 15\,000$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa hai số nguyên $x_i, y_i$ ($|x_i|, |y_i| \le 10^7$).

### Kết quả
- In ra hai số nguyên $I$ và $B$ trên một dòng, cách nhau bởi một dấu cách.

### Ràng buộc
- $3 \le N \le 15\,000$
- $-10^7 \le x_i, y_i \le 10^7$
- Đa giác là đa giác đơn có diện tích dương.

### Giải thích ví dụ
- Ví dụ 1: Tam giác $(1,1), (5,3), (3,5)$ có các cạnh lần lượt chứa thêm điểm nguyên $(3,2)$, $(4,4)$, $(2,3)$ nên tổng số điểm nguyên trên biên là $B = 2 + 2 + 2 = 6$. Hai lần diện tích là $2S = 12$. Theo định lý Pick, $2S = 2I + B - 2 \implies I = (12 - 6 + 2) / 2 = 4$.
- Ví dụ 2: Hình vuông $[0, 4] \times [0, 4]$ có $4 \times 4 = 16$ điểm trên biên và $3 \times 3 = 9$ điểm bên trong."""

    hints = r"""**Gợi ý 1 (Đếm điểm nguyên trên biên $B$):**
Xét một đoạn thẳng nối hai điểm nguyên $A(x_1, y_1)$ và $B(x_2, y_2)$. Số điểm nguyên nằm trên đoạn thẳng đó (không tính $A$, chỉ tính $B$ và các điểm nằm giữa) là đúng $\gcd(|x_2 - x_1|, |y_2 - y_1|)$. Cộng giá trị này qua toàn bộ $N$ cạnh sẽ thu được $B$.

**Gợi ý 2 (Định lý Pick):**
Với mọi đa giác đơn có tất cả các đỉnh đều là điểm nguyên, diện tích $S$, số điểm nguyên bên trong $I$ và số điểm nguyên trên biên $B$ liên hệ qua **Định lý Pick**:
$$S = I + \frac{B}{2} - 1 \iff 2S = 2I + B - 2$$

**Gợi ý 3 (Tính toán hoàn toàn bằng số nguyên):**
Tính $2S$ bằng công thức Shoelace (giá trị tuyệt đối của tổng tích có hướng), sau đó suy ra trực tiếp:
$$I = \frac{2S - B + 2}{2}$$
Với $|x_i|, |y_i| \le 10^7$ và $N \le 15\,000$, mọi phép tính đều vừa trong kiểu `long long` 64-bit và chia hết cho $2$ chính xác."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<long long> x(n), y(n);
    for (int i = 0; i < n; ++i) {
        cin >> x[i] >> y[i];
    }

    long long twiceArea = 0;
    long long boundary = 0;
    for (int i = 0; i < n; ++i) {
        int j = (i + 1 == n) ? 0 : i + 1;
        twiceArea += x[i] * y[j] - y[i] * x[j];
        boundary += std::gcd(llabs(x[j] - x[i]), llabs(y[j] - y[i]));
    }

    twiceArea = llabs(twiceArea);
    long long interior = (twiceArea - boundary + 2) / 2;
    cout << interior << ' ' << boundary << '\n';
    return 0;
}"""

    py_sol = r"""import math
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    xs = [0] * n
    ys = [0] * n
    idx = 1
    for i in range(n):
        xs[i] = int(data[idx])
        ys[i] = int(data[idx + 1])
        idx += 2

    twice_area = 0
    boundary = 0
    px, py = xs[-1], ys[-1]
    gcd = math.gcd
    for i in range(n):
        cx, cy = xs[i], ys[i]
        twice_area += px * cy - py * cx
        boundary += gcd(abs(cx - px), abs(cy - py))
        px, py = cx, cy

    twice_area = abs(twice_area)
    interior = (twice_area - boundary + 2) // 2
    sys.stdout.write(f"{interior} {boundary}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-polygon-lattice-pick",
        "title": "Điểm nguyên trong đa giác (Định lý Pick)",
        "shortDescription": "Đếm số điểm nguyên bên trong và trên biên đa giác đơn bằng GCD cạnh và Định lý Pick.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.convex_hull",
        "tags": ["hình học", "số học", "gcd-lcm", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log(max|x|)).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp18-point-in-polygon
# ============================================================================

def brute_p06(inp: str) -> str:
    """Independent Fraction-based ray casting with prime slope (never hits any integer vertex)."""
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    idx = 2
    poly = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(n)]
    idx += 2 * n
    queries = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(m)]

    # Ray from P in direction (DX, DY) where DX = 10^19 + 7, DY = 1
    # Since |vx - px| <= 2*10^8 < DX, ray cannot hit any integer vertex (vx, vy) != (px, py)
    DX = 10**19 + 7
    DY = 1

    out: List[str] = []
    for px, py in queries:
        on_b = False
        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i + 1) % n]
            if (bx - ax) * (py - ay) == (by - ay) * (px - ax):
                if min(ax, bx) <= px <= max(ax, bx) and min(ay, by) <= py <= max(ay, by):
                    on_b = True
                    break
        if on_b:
            out.append("BOUNDARY")
            continue

        hits = 0
        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i + 1) % n]
            # Solve P + t*(DX, DY) = A + u*(B - A), t > 0, 0 <= u <= 1
            ex, ey = bx - ax, by - ay
            det = -DX * ey + DY * ex
            if det == 0:
                continue
            rx, ry = ax - px, ay - py
            t = Fraction(-rx * ey + ex * ry, det)
            u = Fraction(DX * ry - rx * DY, det)
            if t > 0 and 0 <= u <= 1:
                hits += 1
        out.append("INSIDE" if hits % 2 == 1 else "OUTSIDE")
    return "\n".join(out)


def build_p06() -> dict:
    rng = random.Random(1806)

    tests = [
        # 3 public samples
        {
            "input": fmt_pip([(1, 1), (4, 2), (3, 5), (1, 4)], [(1, 1), (2, 2), (3, 1), (2, 4), (4, 4)]),
            "hidden": False,
            "expected": "BOUNDARY\nINSIDE\nOUTSIDE\nINSIDE\nOUTSIDE",
            "checkBrute": True,
        },
        {
            "input": fmt_pip(
                [(0, 0), (6, 0), (6, 6), (4, 6), (4, 2), (2, 2), (2, 6), (0, 6)],
                [(3, 4), (3, 2), (1, 4), (5, 0), (6, 6), (3, 6)],
            ),
            "hidden": False,
            "expected": "OUTSIDE\nBOUNDARY\nINSIDE\nBOUNDARY\nBOUNDARY\nOUTSIDE",
            "checkBrute": True,
        },
        {
            # Horizontal ray passing right through vertices!
            "input": fmt_pip(
                [(0, 0), (4, 2), (2, 4), (4, 6), (0, 8), (-2, 4)],
                [(-3, 4), (-1, 4), (1, 4), (3, 4), (5, 4)],
            ),
            "hidden": False,
            "expected": "OUTSIDE\nINSIDE\nINSIDE\nOUTSIDE\nOUTSIDE",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # Ray grazes horizontal edges, local maxima, and local minima vertices
            "input": fmt_pip(
                [(0, 0), (10, 0), (10, 4), (6, 4), (6, 2), (4, 2), (4, 4), (0, 4)],
                [(-1, 4), (2, 4), (5, 4), (8, 4), (11, 4), (-1, 2), (5, 2), (8, 2), (-1, 0), (11, 0)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Near-boundary 10^8 precision traps
            "input": fmt_pip(
                [(-10**8, -10**8), (10**8, -10**8 + 1), (10**8, 10**8), (-10**8, 10**8)],
                [(0, -10**8), (0, -10**8 + 1), (99_999_999, 0), (10**8, 0), (10**8 + 1, 0), (-10**8, 0)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Star polygon with vertices on axes + boundary/inside/outside queries
            "input": fmt_pip(
                [(0, 6), (2, 2), (6, 0), (2, -2), (0, -6), (-2, -2), (-6, 0), (-2, 2)],
                [(x, y) for x in range(-6, 7, 2) for y in range(-6, 7, 2)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Narrow diagonal corridor
            "input": fmt_pip(
                [(0, 0), (100, 100), (100, 102), (0, 2)],
                [(50, 50), (50, 51), (50, 52), (50, 53), (49, 50), (100, 101)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Collinear intermediate vertices along boundary
            "input": fmt_pip(
                [(0, 0), (3, 0), (6, 0), (6, 3), (6, 6), (3, 6), (0, 6), (0, 3)],
                [(0, 0), (3, 0), (4, 0), (6, 3), (3, 3), (-1, 3), (7, 3)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> max N=300, M=300 tests
    for idx_t, (n_v, m_q, r_min, r_max) in enumerate([
        (30, 50, 10, 40),
        (60, 80, 20, 100),
        (100, 120, 50, 500),
        (150, 200, 100, 5000),
        (200, 300, 500, 100_000),
        (300, 300, 1_000, 1_000_000),
        (300, 300, 50_000_000, 99_000_000),
        (300, 300, 200, 800),
    ]):
        poly = make_star_polygon(rng, n_v, r_min, r_max)
        if idx_t % 2 == 1:
            poly.reverse()
        queries: List[Tuple[int, int]] = []
        for q_i in range(m_q):
            if q_i % 5 == 0:
                # Vertex query
                queries.append(poly[rng.randrange(len(poly))])
            elif q_i % 5 == 1:
                # Midpoint (or integer point near edge) + same y as a vertex
                vx, vy = poly[rng.randrange(len(poly))]
                queries.append((rng.randint(-r_max, r_max), vy))
            else:
                queries.append((rng.randint(-r_max - r_min, r_max + r_min), rng.randint(-r_max - r_min, r_max + r_min)))
        tests.append({"input": fmt_pip(poly, queries), "hidden": True, "checkBrute": n_v <= 100})

    extra_stress = []
    for _ in range(25):
        poly_s = make_star_polygon(rng, rng.randint(4, 20), 5, 30)
        qs = [(rng.randint(-35, 35), rng.randint(-35, 35)) for _ in range(15)]
        extra_stress.append(fmt_pip(poly_s, qs))

    statement = r"""Cho một đa giác đơn gồm $N$ đỉnh có tọa độ nguyên và $M$ điểm truy vấn $P_1, P_2, \dots, P_M$ trên mặt phẳng tọa độ $Oxy$.

Với mỗi điểm truy vấn, hãy xác định điểm đó nằm:
- `BOUNDARY` nếu nằm trên biên (cạnh hoặc đỉnh) của đa giác,
- `INSIDE` nếu nằm nghiêm ngặt bên trong đa giác,
- `OUTSIDE` nếu nằm bên ngoài đa giác.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($3 \le N \le 300$, $1 \le M \le 300$).
- $N$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $x_i, y_i$ ($|x_i|, |y_i| \le 10^8$) là tọa độ các đỉnh đa giác theo thứ tự biên.
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $px_j, py_j$ ($|px_j|, |py_j| \le 10^8$) là tọa độ các điểm cần kiểm tra.

### Kết quả
- Gồm $M$ dòng, dòng thứ $j$ in ra `BOUNDARY`, `INSIDE` hoặc `OUTSIDE`.

### Ràng buộc
- $3 \le N \le 300$
- $1 \le M \le 300$
- $-10^8 \le x_i, y_i, px_j, py_j \le 10^8$

### Giải thích ví dụ
- Ví dụ 1: $(1,1)$ là đỉnh đa giác (`BOUNDARY`); $(2,2)$ và $(2,4)$ nằm trong; $(3,1)$ và $(4,4)$ nằm ngoài."""

    hints = r"""**Gợi ý 1 (Kiểm tra biên trước):**
Đầu tiên, duyệt qua toàn bộ $N$ cạnh $AB$ của đa giác: nếu điểm $P$ nằm trên đoạn $AB$ (tức tích có hướng $\overrightarrow{AB} \times \overrightarrow{AP} = 0$ và $P$ nằm trong hộp chữ nhật bao của $AB$) thì kết luận ngay `BOUNDARY`.

**Gợi ý 2 (Ray Casting với khoảng nửa mở):**
Khi đã chắc chắn $P$ không nằm trên biên, ta bắn một tia nằm ngang từ $P$ sang phải $(+\infty, p_y)$. Để tia đi qua đỉnh đa giác không bị đếm đúp hoặc sót, xét quy ước khoảng nửa mở theo tung độ: cạnh $AB$ chỉ được xét giao với tia nếu một đầu mút có $y > p_y$ và đầu mút còn lại có $y \le p_y$ (cạnh nằm ngang $A_y = B_y$ tự động bị bỏ qua).

**Gợi ý 3 (Khử hoàn toàn sai số số thực):**
Với cạnh thỏa mãn điều kiện tung độ trên, chuẩn hóa bằng cách hoán đổi $A, B$ nếu cần để luôn có $A_y < B_y$ (tức $A_y \le p_y < B_y$). Lúc này giao điểm của đoạn $AB$ với đường thẳng $y = p_y$ nằm bên phải $P$ ($x_{\text{giao}} > p_x$) khi và chỉ khi $P$ nằm **bên trái** vector $\overrightarrow{AB}$, tức là:
$$(B_x - A_x)(p_y - A_y) - (B_y - A_y)(p_x - A_x) > 0$$
Đếm số lần điều kiện này đúng: lẻ là `INSIDE`, chẵn là `OUTSIDE`. Hoàn toàn dùng `long long`, không chia và không dùng số thực!"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Pt {
    long long x, y;
};

static long long cross(Pt a, Pt b, Pt c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

static bool onSegment(Pt a, Pt b, Pt p) {
    return cross(a, b, p) == 0 &&
           min(a.x, b.x) <= p.x && p.x <= max(a.x, b.x) &&
           min(a.y, b.y) <= p.y && p.y <= max(a.y, b.y);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<Pt> poly(n);
    for (int i = 0; i < n; ++i) {
        cin >> poly[i].x >> poly[i].y;
    }

    while (m--) {
        Pt p;
        cin >> p.x >> p.y;

        bool onBoundary = false;
        bool inside = false;
        for (int i = 0; i < n; ++i) {
            Pt a = poly[i];
            Pt b = poly[(i + 1 == n) ? 0 : i + 1];
            if (onSegment(a, b, p)) {
                onBoundary = true;
                break;
            }
            if ((a.y > p.y) != (b.y > p.y)) {
                if (a.y > b.y) swap(a, b);
                if (cross(a, b, p) > 0) {
                    inside = !inside;
                }
            }
        }

        if (onBoundary) {
            cout << "BOUNDARY\n";
        } else if (inside) {
            cout << "INSIDE\n";
        } else {
            cout << "OUTSIDE\n";
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])
    idx = 2
    pxs = [0] * n
    pys = [0] * n
    for i in range(n):
        pxs[i] = int(data[idx])
        pys[i] = int(data[idx + 1])
        idx += 2

    out = []
    for _ in range(m):
        qx = int(data[idx])
        qy = int(data[idx + 1])
        idx += 2

        on_boundary = False
        inside = False
        ax, ay = pxs[-1], pys[-1]
        for i in range(n):
            bx, by = pxs[i], pys[i]
            cr = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax)
            if cr == 0 and (ax <= qx <= bx or bx <= qx <= ax) and (ay <= qy <= by or by <= qy <= ay):
                on_boundary = True
                break
            if (ay > qy) != (by > qy):
                if ay > by:
                    # Cross(B, A, Q) = -cr > 0  <=>  cr < 0
                    if cr < 0:
                        inside = not inside
                else:
                    if cr > 0:
                        inside = not inside
            ax, ay = bx, by

        if on_boundary:
            out.append("BOUNDARY")
        elif inside:
            out.append("INSIDE")
        else:
            out.append("OUTSIDE")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-point-in-polygon",
        "title": "Kiểm tra điểm nằm trong đa giác",
        "shortDescription": "Xác định điểm nằm trên biên, trong hay ngoài đa giác đơn bằng Ray Casting số nguyên.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.convex_hull",
        "tags": ["hình học", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * M), dùng số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp18-subtraction-sprague-grundy
# ============================================================================

def fmt_sg(moves: List[int], piles: List[int]) -> str:
    return (
        f"{len(moves)} {len(piles)}\n"
        + " ".join(map(str, moves))
        + "\n"
        + " ".join(map(str, piles))
    )


def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    m, k = toks[0], toks[1]
    moves = sorted(set(toks[2 : 2 + m]))
    piles = toks[2 + m : 2 + m + k]

    if k <= 4 and sum(piles) <= 22:
        # True minimax DP over full multi-pile state without Grundy/XOR
        @functools.lru_cache(maxsize=None)
        def can_win(state: Tuple[int, ...]) -> bool:
            for i, v in enumerate(state):
                for s in moves:
                    if v >= s:
                        nxt = list(state)
                        nxt[i] = v - s
                        nxt_t = tuple(sorted(x for x in nxt if x >= moves[0]))
                        if not can_win(nxt_t):
                            return True
            return False

        st = tuple(sorted(x for x in piles if x >= moves[0]))
        return "FIRST" if can_win(st) else "SECOND"

    # Independent bitset / set-based Grundy verification
    mx = max(piles)
    g = [0] * (mx + 1)
    for x in range(1, mx + 1):
        reach = {g[x - s] for s in moves if x >= s}
        mex = 0
        while mex in reach:
            mex += 1
        g[x] = mex
    xsum = 0
    for a in piles:
        xsum ^= g[a]
    return "FIRST" if xsum != 0 else "SECOND"


def build_p07() -> dict:
    rng = random.Random(1807)

    tests = [
        # 3 public samples
        {
            "input": fmt_sg([1, 3, 4], [4, 7]),
            "hidden": False,
            "expected": "FIRST",
            "checkBrute": True,
        },
        {
            "input": fmt_sg([1, 3, 4], [2, 2]),
            "hidden": False,
            "expected": "SECOND",
            "checkBrute": True,
        },
        {
            "input": fmt_sg([2, 3], [5, 7, 1]),
            "hidden": False,
            "expected": "FIRST",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # All piles < min(S) -> no valid moves -> SECOND
            "input": fmt_sg([5, 7, 10], [1, 2, 3, 4]),
            "hidden": True,
            "expected": "SECOND",
            "checkBrute": True,
        },
        {
            # S = {1, 2, 3} -> g[x] = x % 4
            "input": fmt_sg([1, 2, 3], [4, 8, 12, 16]),
            "hidden": True,
            "expected": "SECOND",
            "checkBrute": True,
        },
        {
            # Powers of 2 moves
            "input": fmt_sg([1, 2, 4, 8], [3, 6, 9, 12]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Small minimax verification
            "input": fmt_sg([2, 5], [7, 7, 2]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Single pile hitting zero Grundy
            "input": fmt_sg([1, 4, 9], [10]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> max tests
    tests.append({"input": fmt_sg([1, 3, 5, 7], [rng.randint(1, 100) for _ in range(15)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_sg([2, 5, 8, 11, 14], [rng.randint(1, 300) for _ in range(30)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_sg(sorted(rng.sample(range(1, 50), 10)), [rng.randint(1, 1000) for _ in range(50)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_sg([1, 2, 3, 5, 8, 13, 21, 34, 55, 89], [rng.randint(500, 3000) for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_sg(list(range(1, 21)), [21] * 100), "hidden": True})
    tests.append({"input": fmt_sg(list(range(481, 501)), [rng.randint(1000, 3000) for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_sg(sorted(rng.sample(range(1, 501), 20)), [rng.randint(1, 3000) for _ in range(100)]), "hidden": True})
    tests.append({"input": fmt_sg(sorted(rng.sample(range(1, 300), 20)), [rng.randint(2500, 3000) for _ in range(100)]), "hidden": True})

    extra_stress = []
    for _ in range(30):
        m_s = rng.randint(1, 4)
        k_s = rng.randint(1, 4)
        moves_s = sorted(rng.sample(range(1, 7), m_s))
        piles_s = [rng.randint(1, 6) for _ in range(k_s)]
        extra_stress.append(fmt_sg(moves_s, piles_s))

    statement = r"""Cho tập hợp $S = \{s_1, s_2, \dots, s_M\}$ gồm $M$ số nguyên dương và $K$ đống sỏi có kích thước lần lượt là $a_1, a_2, \dots, a_K$.

Hai người chơi `FIRST` (đi trước) và `SECOND` (đi sau) luân phiên thực hiện nước đi:
- Chọn một đống sỏi có số lượng viên $x$ và một giá trị $s \in S$ sao cho $x \ge s$, rồi bốc đi đúng $s$ viên sỏi từ đống đó (còn lại $x - s$ viên).
- Ai đến lượt mà không còn nước đi hợp lệ nào (mọi đống đều có số sỏi nhỏ hơn $\min(S)$) sẽ **thua**.

Biết cả hai chơi tối ưu, hãy xác định người chiến thắng.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $M, K$ ($1 \le M \le 20$, $1 \le K \le 100$).
- Dòng thứ hai chứa $M$ số nguyên dương $s_1, s_2, \dots, s_M$ ($1 \le s_i \le 500$).
- Dòng thứ ba chứa $K$ số nguyên dương $a_1, a_2, \dots, a_K$ ($1 \le a_j \le 3000$).

### Kết quả
- In ra `FIRST` nếu người đi trước thắng, ngược lại in ra `SECOND`.

### Ràng buộc
- $1 \le M \le 20$, $1 \le s_i \le 500$
- $1 \le K \le 100$, $1 \le a_j \le 3000$

### Giải thích ví dụ
- Ví dụ 1: Với $S = \{1, 3, 4\}$, các giá trị Grundy đầu tiên là $g(0)=0, g(1)=1, g(2)=0, g(3)=1, g(4)=2, g(5)=3, g(6)=2, g(7)=0$. Khi đó $g(4) \oplus g(7) = 2 \oplus 0 = 2 \ne 0 \implies$ `FIRST` thắng.
- Ví dụ 2: $g(2) \oplus g(2) = 0 \oplus 0 = 0 \implies$ `SECOND` thắng."""

    hints = r"""**Gợi ý 1 (Phân rã thành tổng các trò chơi độc lập):**
Mỗi lượt chỉ tác động lên đúng một đống sỏi, nên toàn bộ ván chơi là tổng (disjunctive sum) của $K$ trò chơi độc lập có cùng luật trên từng đống $a_1, a_2, \dots, a_K$.

**Gợi ý 2 (Định lý Sprague-Grundy):**
Gọi $g(x)$ là giá trị Grundy của một đống có $x$ viên sỏi. Theo định lý Sprague-Grundy:
$$g(x) = \operatorname{mex}\big(\{\, g(x - s) \mid s \in S,\, s \le x \,\}\big)$$
trong đó $\operatorname{mex}(T)$ là số nguyên không âm nhỏ nhất không thuộc tập $T$ (với $x < \min(S)$ thì tập rỗng nên $g(x) = 0$).

**Gợi ý 3 (Cài đặt & Kết luận):**
- Tính trước mảng $g[0 \dots \max(a_j)]$ bằng quy hoạch động trong $O(M \cdot \max(a_j))$. Vì mỗi trạng thái có tối đa $M \le 20$ bước chuyển, giá trị $g(x)$ luôn nằm trong $[0, M]$, nên dùng mảng đánh dấu `seen[0..M]` kích thước $21$ để tìm `mex` rất nhanh.
- Người đi trước (`FIRST`) thắng khi và chỉ khi $g[a_1] \oplus g[a_2] \oplus \dots \oplus g[a_K] \ne 0$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int m, k;
    if (!(cin >> m >> k)) return 0;

    vector<int> moves(m);
    for (int i = 0; i < m; ++i) cin >> moves[i];
    sort(moves.begin(), moves.end());
    moves.erase(unique(moves.begin(), moves.end()), moves.end());

    vector<int> piles(k);
    int maxA = 0;
    for (int i = 0; i < k; ++i) {
        cin >> piles[i];
        maxA = max(maxA, piles[i]);
    }

    vector<int> g(maxA + 1, 0);
    vector<int> mark(moves.size() + 2, 0);
    int timer = 0;
    for (int x = 1; x <= maxA; ++x) {
        ++timer;
        for (int s : moves) {
            if (s > x) break;
            int val = g[x - s];
            if (val < (int)mark.size()) mark[val] = timer;
        }
        int mex = 0;
        while (mark[mex] == timer) ++mex;
        g[x] = mex;
    }

    int xsum = 0;
    for (int a : piles) xsum ^= g[a];
    cout << (xsum != 0 ? "FIRST\n" : "SECOND\n");
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    m = int(data[0])
    k = int(data[1])
    moves = sorted({int(x) for x in data[2 : 2 + m]})
    piles = [int(x) for x in data[2 + m : 2 + m + k]]
    max_a = max(piles) if piles else 0

    g = [0] * (max_a + 1)
    lim = len(moves) + 2
    mark = [0] * lim
    timer = 0
    for x in range(1, max_a + 1):
        timer += 1
        for s in moves:
            if s > x:
                break
            v = g[x - s]
            if v < lim:
                mark[v] = timer
        mex = 0
        while mark[mex] == timer:
            mex += 1
        g[x] = mex

    xsum = 0
    for a in piles:
        xsum ^= g[a]
    sys.stdout.write("FIRST\n" if xsum != 0 else "SECOND\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-subtraction-sprague-grundy",
        "title": "Trò chơi trừ tập bước đi (Sprague-Grundy)",
        "shortDescription": "Tính hàm Sprague-Grundy (mex) cho trò chơi trừ tập bước đi S trên nhiều đống sỏi.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.game_theory",
        "tags": ["lý thuyết trò chơi", "quy hoạch động", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(M * max(a_j) + K).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp18-convex-hull-monotone
# ============================================================================

def brute_p08(inp: str) -> str:
    """Jarvis March (Gift Wrapping) strict convex hull oracle (independent of Monotone Chain)."""
    toks = list(map(int, inp.split()))
    n = toks[0]
    pts = [(toks[1 + 2 * i], toks[2 + 2 * i]) for i in range(n)]

    def cross(a: Tuple[int, int], b: Tuple[int, int], c: Tuple[int, int]) -> int:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    def dist2(a: Tuple[int, int], b: Tuple[int, int]) -> int:
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

    start = min(range(n), key=lambda i: (pts[i][0], pts[i][1]))
    hull: List[Tuple[int, int]] = []
    cur = start
    while True:
        hull.append(pts[cur])
        nxt = (cur + 1) % n
        for i in range(n):
            if i == cur or i == nxt:
                continue
            cr = cross(pts[cur], pts[nxt], pts[i])
            # Pick most clockwise (rightmost) -> all other points lie strictly to left or on segment,
            # and if collinear, pick farthest from cur so intermediate collinear points are skipped!
            if cr < 0 or (cr == 0 and dist2(pts[cur], pts[i]) > dist2(pts[cur], pts[nxt])):
                nxt = i
        cur = nxt
        if cur == start:
            break

    area2 = 0
    h = len(hull)
    for i in range(h):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % h]
        area2 += x1 * y2 - y1 * x2
    return f"{h} {abs(area2)}"


def build_p08() -> dict:
    rng = random.Random(1808)

    def unique_points(pts: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        return list(dict.fromkeys(pts))

    tests = [
        # 3 public samples
        {
            "input": fmt_points([(0, 0), (4, 0), (4, 4), (0, 4), (2, 0), (2, 2), (4, 2)]),
            "hidden": False,
            "expected": "4 32",
            "checkBrute": True,
        },
        {
            "input": fmt_points([(1, 1), (3, 1), (5, 1), (3, 4), (3, 2)]),
            "hidden": False,
            "expected": "3 12",
            "checkBrute": True,
        },
        {
            "input": fmt_points([(0, 2), (2, 0), (5, 1), (6, 4), (3, 5), (1, 4), (3, 2)]),
            "hidden": False,
            "expected": "6 39",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # Minimal triangle
            "input": fmt_points([(0, 0), (10, 0), (0, 5)]),
            "hidden": True,
            "expected": "3 50",
            "checkBrute": True,
        },
        {
            # Collinear points on ALL 4 sides of rectangle including vertical edges
            "input": fmt_points(
                [(0, y) for y in range(6)]
                + [(5, y) for y in range(6)]
                + [(x, 0) for x in range(1, 5)]
                + [(x, 5) for x in range(1, 5)]
                + [(2, 2), (3, 3)]
            ),
            "hidden": True,
            "expected": "4 50",
            "checkBrute": True,
        },
        {
            # Diagonal collinear edge + 10^7 extremes
            "input": fmt_points([
                (-10**7, -10**7), (0, 0), (10**7, 10**7),
                (-10**7, 10**7), (10**7, -10**7),
                (-10**7, 0), (10**7, 0), (0, 10**7), (0, -10**7),
            ]),
            "hidden": True,
            "expected": f"4 {8 * 10**14}",
            "checkBrute": True,
        },
        {
            # Almost all points collinear on a line + 1 apex
            "input": fmt_points([(i, 2 * i) for i in range(-20, 21)] + [(0, 100)]),
            "hidden": True,
            "expected": f"3 {40 * 100}",
            "checkBrute": True,
        },
        {
            # Grid 6x6 all interior collinear points
            "input": fmt_points([(x, y) for x in range(6) for y in range(6)]),
            "hidden": True,
            "expected": "4 50",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    # Test 9: random 150 points
    p9 = unique_points([(rng.randint(-100, 100), rng.randint(-100, 100)) for _ in range(160)])[:150]
    tests.append({"input": fmt_points(p9), "hidden": True, "checkBrute": True})

    # Test 10: grid 20x20 + perturbations
    p10 = [(x, y) for x in range(-10, 10) for y in range(-10, 10)]
    rng.shuffle(p10)
    tests.append({"input": fmt_points(p10), "hidden": True, "checkBrute": True})

    # Test 11: Strict convex polygon N=2000 + 2000 interior points
    conv11 = make_convex_polygon(500, scale=2, offset=(-10_000, -10_000))
    interior11 = unique_points([(rng.randint(-5000, 5000), rng.randint(-5000, 5000)) for _ in range(2100)])[:2000]
    p11 = unique_points(conv11 + interior11)
    rng.shuffle(p11)
    tests.append({"input": fmt_points(p11), "hidden": True})

    # Test 12: Star N=6000 (many collinear / concave points)
    p12 = make_star_polygon(rng, 6000, 1000, 9000)
    rng.shuffle(p12)
    tests.append({"input": fmt_points(p12), "hidden": True})

    # Test 13: Random cloud N=7500 with 10^7 coords (~135 KB)
    s13 = set()
    while len(s13) < 7500:
        s13.add((rng.randint(-10**7, 10**7), rng.randint(-10**7, 10**7)))
    tests.append({"input": fmt_points(list(s13)), "hidden": True})

    # Test 14: Almost all points on convex hull (7000 vertices on convex polygon, ~130 KB)
    p14 = make_convex_polygon(1750, scale=50, offset=(-2_000_000, -2_000_000))
    rng.shuffle(p14)
    tests.append({"input": fmt_points(p14), "hidden": True})

    # Test 15: Max N=15000, compact coords <= 9999 (~135 KB)
    s15 = set()
    while len(s15) < 15000:
        s15.add((rng.randint(-999, 999), rng.randint(-999, 999)))
    tests.append({"input": fmt_points(list(s15)), "hidden": True})

    # Test 16: N=15000 with long collinear chains + random interior (~140 KB)
    s16 = set()
    for i in range(-1000, 1001):
        s16.add((i, -1000))
        s16.add((i, 1000))
        s16.add((-1000, i))
        s16.add((1000, i))
    while len(s16) < 15000:
        s16.add((rng.randint(-999, 999), rng.randint(-999, 999)))
    p16 = list(s16)
    rng.shuffle(p16)
    tests.append({"input": fmt_points(p16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        s_pts = set()
        while len(s_pts) < rng.randint(5, 25):
            s_pts.add((rng.randint(-6, 6), rng.randint(-6, 6)))
        # Ensure non-collinear
        pts_l = list(s_pts)
        if all((pts_l[1][0] - pts_l[0][0]) * (p[1] - pts_l[0][1]) == (pts_l[1][1] - pts_l[0][1]) * (p[0] - pts_l[0][0]) for p in pts_l[2:]):
            pts_l.append((pts_l[0][0] + 1, pts_l[0][1] + 13))
            pts_l = unique_points(pts_l)
        extra_stress.append(fmt_points(pts_l))

    statement = r"""Cho $N$ điểm nguyên **đôi một phân biệt** trên mặt phẳng tọa độ $Oxy$, trong đó đảm bảo tồn tại ít nhất $3$ điểm không thẳng hàng.

Hãy tìm **bao lồi nghiêm ngặt** (strict convex hull) của tập điểm đã cho — tức là đa giác lồi nhỏ nhất chứa tất cả $N$ điểm, đồng thời **không giữ lại** các điểm nằm giữa trên cạnh thẳng hàng (chỉ giữ các đỉnh góc thực sự của đa giác lồi).

Yêu cầu in ra hai số nguyên:
1. Số đỉnh $H$ của bao lồi nghiêm ngặt.
2. Hai lần diện tích $2S$ của bao lồi đó.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($3 \le N \le 15\,000$).
- $N$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $x_i, y_i$ ($|x_i|, |y_i| \le 10^7$). Các điểm đôi một phân biệt và không cùng nằm trên một đường thẳng.

### Kết quả
- In ra hai số nguyên $H$ và $2S$ trên một dòng, cách nhau bởi một dấu cách.

### Ràng buộc
- $3 \le N \le 15\,000$
- $-10^7 \le x_i, y_i \le 10^7$
- Các điểm đôi một phân biệt; tồn tại ít nhất $3$ điểm không thẳng hàng.

### Giải thích ví dụ
- Ví dụ 1: Tập điểm tạo thành hình vuông $[0,4]\times[0,4]$ cùng các điểm $(2,0), (4,2)$ nằm giữa cạnh và $(2,2)$ ở bên trong. Bao lồi nghiêm ngặt chỉ gồm $4$ góc với $2S = 2 \times 16 = 32$.
- Ví dụ 2: Ba điểm $(1,1), (3,1), (5,1)$ thẳng hàng ở cạnh đáy nên chỉ giữ $(1,1)$ và $(5,1)$ cùng đỉnh $(3,4)$: $H = 3, 2S = 12$."""

    hints = r"""**Gợi ý 1 (Thuật toán Andrew Monotone Chain):**
Sắp xếp tất cả $N$ điểm tăng dần theo cặp $(x_i, y_i)$. Ta xây dựng bao lồi theo hai nửa:
- **Bao dưới (lower hull):** duyệt các điểm từ trái sang phải (theo thứ tự đã sắp xếp).
- **Bao trên (upper hull):** duyệt các điểm từ phải sang trái.

**Gợi ý 2 (Điều kiện loại bỏ điểm thẳng hàng):**
Để giữ bao lồi **nghiêm ngặt** (chỉ rẽ trái thực sự theo chiều CCW, loại bỏ điểm nằm giữa trên cạnh), khi thêm điểm $P$ vào ngăn xếp `hull`, ta lặp:
`while hull.size() >= 2 && cross(hull[sz-2], hull[sz-1], P) <= 0: hull.pop_back()`
Dấu `<= 0` (thay vì `< 0`) sẽ tự động loại bỏ các điểm thẳng hàng nằm giữa cạnh, kể cả cạnh thẳng đứng!

**Gợi ý 3 (Ghép bao và tính diện tích):**
Ghép `lower` (bỏ điểm cuối vì trùng điểm đầu của `upper`) và `upper` (bỏ điểm cuối vì trùng điểm đầu của `lower`) để thu được danh sách $H$ đỉnh theo thứ tự CCW. Sau đó áp dụng công thức Shoelace trên $H$ đỉnh này để tính $2S$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Pt {
    long long x, y;
    bool operator<(const Pt& o) const {
        return x < o.x || (x == o.x && y < o.y);
    }
};

static long long cross(const Pt& a, const Pt& b, const Pt& c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<Pt> pts(n);
    for (int i = 0; i < n; ++i) {
        cin >> pts[i].x >> pts[i].y;
    }
    sort(pts.begin(), pts.end());

    vector<Pt> hull;
    hull.reserve(n + 1);

    for (int i = 0; i < n; ++i) {
        while (hull.size() >= 2 && cross(hull[hull.size() - 2], hull.back(), pts[i]) <= 0) {
            hull.pop_back();
        }
        hull.push_back(pts[i]);
    }

    size_t lowerSize = hull.size();
    for (int i = n - 2; i >= 0; --i) {
        while (hull.size() > lowerSize && cross(hull[hull.size() - 2], hull.back(), pts[i]) <= 0) {
            hull.pop_back();
        }
        hull.push_back(pts[i]);
    }
    hull.pop_back();

    int h = (int)hull.size();
    long long twiceArea = 0;
    for (int i = 0; i < h; ++i) {
        int j = (i + 1 == h) ? 0 : i + 1;
        twiceArea += hull[i].x * hull[j].y - hull[i].y * hull[j].x;
    }

    cout << h << ' ' << llabs(twiceArea) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    pts = []
    idx = 1
    for _ in range(n):
        pts.append((int(data[idx]), int(data[idx + 1])))
        idx += 2

    pts.sort()

    lower = []
    for p in pts:
        while len(lower) >= 2:
            ax, ay = lower[-2]
            bx, by = lower[-1]
            if (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) <= 0:
                lower.pop()
            else:
                break
        lower.append(p)

    upper = []
    for p in reversed(pts):
        while len(upper) >= 2:
            ax, ay = upper[-2]
            bx, by = upper[-1]
            if (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) <= 0:
                upper.pop()
            else:
                break
        upper.append(p)

    hull = lower[:-1] + upper[:-1]
    h = len(hull)
    twice_area = 0
    px, py = hull[-1]
    for cx, cy in hull:
        twice_area += px * cy - py * cx
        px, py = cx, cy

    sys.stdout.write(f"{h} {abs(twice_area)}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-convex-hull-monotone",
        "title": "Bao lồi nghiêm ngặt & Diện tích (Andrew Monotone Chain)",
        "shortDescription": "Tìm bao lồi nghiêm ngặt O(N log N) bằng thuật toán Andrew Monotone Chain và tính 2S.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.convex_hull",
        "tags": ["hình học", "bao lồi", "sắp xếp", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N), dùng số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp18-closest-pair-points
# ============================================================================

def brute_p09(inp: str) -> str:
    """O(N^2) exact pairwise check oracle."""
    toks = list(map(int, inp.split()))
    n = toks[0]
    pts = [(toks[1 + 2 * i], toks[2 + 2 * i]) for i in range(n)]
    best = (pts[0][0] - pts[1][0]) ** 2 + (pts[0][1] - pts[1][1]) ** 2
    for i in range(n):
        xi, yi = pts[i]
        for j in range(i + 1, n):
            d2 = (xi - pts[j][0]) ** 2 + (yi - pts[j][1]) ** 2
            if d2 < best:
                best = d2
    return str(best)


def build_p09() -> dict:
    rng = random.Random(1809)

    tests = [
        # 3 public samples
        {
            "input": fmt_points([(2, 1), (4, 4), (1, 2), (6, 3)]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            # Duplicate point -> distance 0
            "input": fmt_points([(0, 0), (10, 10), (3, 4), (10, 10)]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_points([(-5, -5), (5, 5), (0, 2), (3, -1)]),
            "hidden": False,
            "expected": "18",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # N = 2 maximal 10^8 diagonal (tests 8e16 > 10^15 / 32-bit)
            "input": fmt_points([(-10**8, -10**8), (10**8, 10**8)]),
            "hidden": True,
            "expected": str(8 * 10**16),
            "checkBrute": True,
        },
        {
            # All collinear vertical points (stress on vertical strip)
            "input": fmt_points([(42, i * i) for i in range(-15, 16)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # All collinear horizontal points
            "input": fmt_points([(i * 17 + (i % 3), -999) for i in range(40)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Closest pair crosses the median split line!
            "input": fmt_points([
                (0, 0), (0, 100), (10, 0), (10, 100),
                (4, 50), (5, 51), (9, 50), (1, 50),
            ]),
            "hidden": True,
            "expected": "2",
            "checkBrute": True,
        },
        {
            # Duplicate points buried among many distinct points
            "input": fmt_points(
                [(rng.randint(-1000, 1000), rng.randint(-1000, 1000)) for _ in range(60)]
                + [(777, -888), (777, -888)]
            ),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    tests.append({"input": fmt_points([(rng.randint(-500, 500), rng.randint(-500, 500)) for _ in range(150)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_points([(rng.randint(-10_000, 10_000), rng.randint(-10_000, 10_000)) for _ in range(350)]), "hidden": True, "checkBrute": True})

    # Test 11: Vertical strip nightmare N=5000 (all same X!)
    p11 = [(12345, rng.randint(-10**7, 10**7)) for _ in range(5000)]
    tests.append({"input": fmt_points(p11), "hidden": True})

    # Test 12: Horizontal line N=5000 (all same Y!)
    p12 = [(rng.randint(-10**7, 10**7), -54321) for _ in range(5000)]
    tests.append({"input": fmt_points(p12), "hidden": True})

    # Test 13: Random N=7000 full 10^8 coords (~135 KB)
    p13 = [(rng.randint(-10**8, 10**8), rng.randint(-10**8, 10**8)) for _ in range(7000)]
    tests.append({"input": fmt_points(p13), "hidden": True})

    # Test 14: Clustered near x = 0 with N=12000 (~138 KB)
    p14 = [(rng.randint(-5, 5), rng.randint(-99_999, 99_999)) for _ in range(12000)]
    tests.append({"input": fmt_points(p14), "hidden": True})

    # Test 15: Max N=12000 uniform in [-9999, 9999] (~140 KB)
    p15 = [(rng.randint(-9999, 9999), rng.randint(-9999, 9999)) for _ in range(12000)]
    tests.append({"input": fmt_points(p15), "hidden": True})

    # Test 16: N=12000 grid + 1 close pair across center (~130 KB)
    p16 = [(x * 10, y * 10) for x in range(-55, 55) for y in range(-54, 54)]  # 11880 pts
    while len(p16) < 11998:
        p16.append((rng.randint(-900, 900) * 10, rng.randint(-900, 900) * 10))
    p16.extend([(50, 50), (53, 54)])
    rng.shuffle(p16)
    tests.append({"input": fmt_points(p16), "hidden": True})

    extra_stress = []
    for _ in range(30):
        n_s = rng.randint(2, 25)
        extra_stress.append(fmt_points([(rng.randint(-15, 15), rng.randint(-15, 15)) for _ in range(n_s)]))

    statement = r"""Cho $N$ điểm trên mặt phẳng tọa độ $Oxy$, điểm thứ $i$ có tọa độ nguyên $(x_i, y_i)$ ($N \ge 2$). Lưu ý rằng có thể tồn tại hai điểm có cùng tọa độ (trùng nhau).

Hãy tìm giá trị nhỏ nhất của **bình phương khoảng cách Euclid** giữa hai điểm có chỉ số khác nhau ($i \ne j$):
$$d^2(P_i, P_j) = (x_i - x_j)^2 + (y_i - y_j)^2$$

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($2 \le N \le 12\,000$).
- $N$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $x_i, y_i$ ($|x_i|, |y_i| \le 10^8$).

### Kết quả
- In ra một số nguyên duy nhất là bình phương khoảng cách nhỏ nhất tìm được.

### Ràng buộc
- $2 \le N \le 12\,000$
- $-10^8 \le x_i, y_i \le 10^8$

### Giải thích ví dụ
- Ví dụ 1: Cặp $(2,1)$ và $(1,2)$ có $(2-1)^2 + (1-2)^2 = 2$.
- Ví dụ 2: Có hai điểm trùng nhau tại $(10,10)$ nên khoảng cách nhỏ nhất bằng $0$."""

    hints = r"""**Gợi ý 1 (Kiểm tra trùng điểm & Chia để trị):**
Sắp xếp các điểm tăng dần theo $(x, y)$. Nếu tồn tại hai điểm liên tiếp giống hệt nhau thì đáp án lập tức là $0$. Sau đó dùng thuật toán **Chia để trị (Divide & Conquer)**: chia đôi tập điểm theo hoành độ tại $x_{\text{mid}}$ và giải đệ quy hai nửa trái, phải để thu được khoảng cách nhỏ nhất hiện tại $d^2 = \min(d_L^2, d_R^2)$.

**Gợi ý 2 (Dải hẹp ở giữa — Strip):**
Một cặp điểm có hai đầu nằm ở hai phía của $x_{\text{mid}}$ chỉ có thể cải thiện đáp án nếu cả hai điểm đều thỏa mãn $(x - x_{\text{mid}})^2 < d^2$. Tập hợp các điểm này thành dải `strip` và duy trì thứ tự tăng dần theo tung độ $y$ (bằng trộn `merge` hai nửa đã sắp theo $y$).

**Gợi ý 3 (Giới hạn số lần so sánh & Tránh tràn số):**
Duyệt từng điểm $i$ trong `strip`, chỉ kiểm tra các điểm $j > i$ phía sau khi $(y_j - y_i)^2 < d^2$. Theo bổ đề hình học kinh điển, vòng lặp trong chỉ chạy tối đa $7$ lần cho mỗi điểm $i$, nên toàn bộ thuật toán đạt $O(N \log N)$. Với $|x_i|, |y_i| \le 10^8$, bình phương khoảng cách tối đa là $8 \cdot 10^{16} < 9.22 \cdot 10^{18}$, vừa đủ an toàn trong kiểu `long long` 64-bit."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Pt {
    long long x, y;
};

static long long dist2(const Pt& a, const Pt& b) {
    long long dx = a.x - b.x;
    long long dy = a.y - b.y;
    return dx * dx + dy * dy;
}

static long long solveDC(vector<Pt>& px, vector<Pt>& py, vector<Pt>& strip, int l, int r) {
    if (r - l <= 16) {
        long long best = dist2(px[l], px[l + 1]);
        for (int i = l; i < r; ++i) {
            for (int j = i + 1; j < r; ++j) {
                best = min(best, dist2(px[i], px[j]));
            }
        }
        sort(py.begin() + l, py.begin() + r, [](const Pt& a, const Pt& b) {
            return a.y < b.y || (a.y == b.y && a.x < b.x);
        });
        return best;
    }

    int mid = (l + r) / 2;
    long long midX = px[mid].x;

    long long d = min(solveDC(px, py, strip, l, mid), solveDC(px, py, strip, mid, r));

    inplace_merge(py.begin() + l, py.begin() + mid, py.begin() + r, [](const Pt& a, const Pt& b) {
        return a.y < b.y || (a.y == b.y && a.x < b.x);
    });

    strip.clear();
    for (int i = l; i < r; ++i) {
        long long dx = py[i].x - midX;
        if (dx * dx < d) {
            strip.push_back(py[i]);
        }
    }

    int m = (int)strip.size();
    for (int i = 0; i < m; ++i) {
        for (int j = i + 1; j < m; ++j) {
            long long dy = strip[j].y - strip[i].y;
            if (dy * dy >= d) break;
            d = min(d, dist2(strip[i], strip[j]));
        }
    }
    return d;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<Pt> px(n);
    for (int i = 0; i < n; ++i) {
        cin >> px[i].x >> px[i].y;
    }

    sort(px.begin(), px.end(), [](const Pt& a, const Pt& b) {
        return a.x < b.x || (a.x == b.x && a.y < b.y);
    });

    for (int i = 0; i + 1 < n; ++i) {
        if (px[i].x == px[i + 1].x && px[i].y == px[i + 1].y) {
            cout << 0 << '\n';
            return 0;
        }
    }

    vector<Pt> py = px;
    vector<Pt> strip;
    strip.reserve(n);
    cout << solveDC(px, py, strip, 0, n) << '\n';
    return 0;
}"""

    py_sol = r"""from operator import itemgetter
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    pts = []
    idx = 1
    for _ in range(n):
        pts.append((int(data[idx]), int(data[idx + 1])))
        idx += 2

    pts.sort()
    for i in range(n - 1):
        if pts[i] == pts[i + 1]:
            sys.stdout.write("0\n")
            return

    key_y = itemgetter(1)

    def dc(l: int, r: int) -> tuple[int, list[tuple[int, int]]]:
        if r - l <= 16:
            sub = pts[l:r]
            best = (sub[0][0] - sub[1][0]) ** 2 + (sub[0][1] - sub[1][1]) ** 2
            m = len(sub)
            for i in range(m):
                xi, yi = sub[i]
                for j in range(i + 1, m):
                    dx = xi - sub[j][0]
                    dy = yi - sub[j][1]
                    d2 = dx * dx + dy * dy
                    if d2 < best:
                        best = d2
            sub.sort(key=key_y)
            return best, sub

        mid = (l + r) // 2
        mid_x = pts[mid][0]
        d1, ly = dc(l, mid)
        d2, ry = dc(mid, r)
        d = d1 if d1 < d2 else d2

        py = ly + ry
        py.sort(key=key_y)

        strip = [p for p in py if (p[0] - mid_x) ** 2 < d]
        m = len(strip)
        for i in range(m):
            xi, yi = strip[i]
            for j in range(i + 1, m):
                dy = strip[j][1] - yi
                if dy * dy >= d:
                    break
                dx = strip[j][0] - xi
                cand = dx * dx + dy * dy
                if cand < d:
                    d = cand
        return d, py

    ans, _ = dc(0, n)
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-closest-pair-points",
        "title": "Cặp điểm gần nhất (Bình phương khoảng cách Euclid)",
        "shortDescription": "Tìm bình phương khoảng cách Euclid nhỏ nhất giữa hai điểm bất kỳ trong O(N log N) bằng chia để trị.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.geometry_basics",
        "tags": ["hình học", "chia để trị", "sắp xếp", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N log N), dùng số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp18-misere-and-staircase-nim
# ============================================================================

def brute_p10(inp: str) -> str:
    """True minimax DP for Misere Nim and Staircase Nim on small inputs."""
    toks = list(map(int, inp.split()))
    t = toks[0]
    idx = 1
    out: List[str] = []

    @functools.lru_cache(maxsize=None)
    def win_misere(state: Tuple[int, ...]) -> bool:
        if not state:
            # No stones left when turn starts -> previous player took the last stone & lost -> current player WINS!
            return True
        for i, v in enumerate(state):
            for take in range(1, v + 1):
                nxt = list(state)
                nxt[i] = v - take
                nxt_t = tuple(sorted(x for x in nxt if x > 0))
                if not win_misere(nxt_t):
                    return True
        return False

    @functools.lru_cache(maxsize=None)
    def win_staircase(state: Tuple[int, ...]) -> bool:
        # 1-indexed stairs stored as 0-indexed tuple: stair 0 (index 0, i.e., 1-indexed stair 1) is the floor;
        # valid moves move >= 1 stone from index i >= 1 to i - 1.
        for i in range(1, len(state)):
            v = state[i]
            if v == 0:
                continue
            for move in range(1, v + 1):
                nxt = list(state)
                nxt[i] -= move
                nxt[i - 1] += move
                if not win_staircase(tuple(nxt)):
                    return True
        return False

    for _ in range(t):
        n = toks[idx]
        idx += 1
        arr = toks[idx : idx + n]
        idx += n

        if n <= 4 and sum(arr) <= 10:
            m_win = win_misere(tuple(sorted(x for x in arr if x > 0)))
            s_win = win_staircase(tuple(arr))
        else:
            # Independent bit-count verification
            all_le_one = all(x <= 1 for x in arr)
            if all_le_one:
                m_win = (sum(arr) % 2 == 0)
            else:
                m_win = any(sum((x >> b) & 1 for x in arr) % 2 == 1 for b in range(32))
            even_pos = [arr[i] for i in range(1, n, 2)]
            s_win = any(sum((x >> b) & 1 for x in even_pos) % 2 == 1 for b in range(32))

        out.append(f"{'FIRST' if m_win else 'SECOND'} {'FIRST' if s_win else 'SECOND'}")
    return "\n".join(out)


def build_p10() -> dict:
    rng = random.Random(1810)

    tests = [
        # 3 public samples
        {
            "input": fmt_nim_cases([[1, 1, 1], [1, 1], [3, 4, 5]]),
            "hidden": False,
            "expected": "SECOND FIRST\nFIRST FIRST\nFIRST FIRST",
            "checkBrute": True,
        },
        {
            "input": fmt_nim_cases([[1, 2, 3], [0, 4, 0, 4], [5]]),
            "hidden": False,
            "expected": "SECOND FIRST\nSECOND SECOND\nFIRST SECOND",
            "checkBrute": True,
        },
        {
            "input": fmt_nim_cases([[0, 0, 0], [1, 0, 2], [2, 2, 1]]),
            "hidden": False,
            "expected": "FIRST SECOND\nFIRST SECOND\nFIRST FIRST",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            # All 0/1 traps for Misere Nim + single-pile staircase
            "input": fmt_nim_cases([
                [0],
                [1],
                [0, 1],
                [1, 0, 1],
                [1, 1, 1, 1],
                [1, 1, 1, 1, 1],
                [0, 0, 0, 1],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Misere vs Standard divergence (only when all <= 1) vs single >= 2 pile with XOR=0? Wait: impossible to have XOR=0 with a single >=2 pile; what about [1, 2, 3] -> XOR=0, Misere SECOND!
            # [2, 1, 1] -> XOR=2 != 0 -> FIRST, [1, 1, 0, 2] -> Staircase even=(1,2) XOR=3 -> FIRST
            "input": fmt_nim_cases([
                [2],
                [2, 1, 1],
                [1, 1, 0, 2],
                [0, 3, 0, 3],
                [10, 0, 0, 0],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Small minimax full cross-check
            "input": fmt_nim_cases([
                [rng.randint(0, 3) for _ in range(rng.randint(1, 4))]
                for _ in range(25)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # 10^9 extreme values + zeros
            "input": fmt_nim_cases([
                [10**9, 0, 10**9, 0],
                [0, 10**9, 0, 10**9],
                [10**9, 10**9, 1],
                [0, 10**9, 10**9, 10**9],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Odd positions huge, even positions 0 (Staircase SECOND) & vice-versa
            "input": fmt_nim_cases([
                [10**9, 0, 999_999_999, 0, 888_888_888],
                [0, 10**9, 0, 10**9, 0, 1],
            ]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB, sum N <= 20000)
    def make_case(n: int, max_v: int, mode: str) -> List[int]:
        if mode == "all01":
            return [rng.randint(0, 1) for _ in range(n)]
        if mode == "zero_even":
            arr = [rng.randint(0, max_v) for _ in range(n)]
            if n >= 2:
                ev = [arr[i] for i in range(1, n, 2)]
                x = 0
                for v in ev[:-1]:
                    x ^= v
                arr[n - 1 if n % 2 == 0 else n - 2] = x
            return arr
        if mode == "zero_all":
            if n == 1:
                return [rng.randint(0, max_v)]
            arr = [rng.randint(0, max_v) for _ in range(n - 1)]
            x = 0
            for v in arr:
                x ^= v
            arr.append(x)
            rng.shuffle(arr)
            return arr
        return [rng.randint(0, max_v) for _ in range(n)]

    modes = ["all01", "zero_even", "zero_all", "rand"]
    tests.append({"input": fmt_nim_cases([make_case(rng.randint(10, 30), 100, modes[i % 4]) for i in range(60)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_nim_cases([make_case(40, 10**5, modes[i % 4]) for i in range(100)]), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_nim_cases([make_case(25, 10**9, modes[i % 4]) for i in range(400)]), "hidden": True})
    tests.append({"input": fmt_nim_cases([make_case(500, 10**9, modes[i % 4]) for i in range(25)]), "hidden": True})
    tests.append({"input": fmt_nim_cases([make_case(50, 1, "all01") for _ in range(400)]), "hidden": True})
    tests.append({"input": fmt_nim_cases([make_case(400, 10**9, modes[(i + 1) % 4]) for i in range(30)]), "hidden": True})
    tests.append({"input": fmt_nim_cases([make_case(60, 10**9, "zero_even" if i % 2 == 0 else "zero_all") for i in range(200)]), "hidden": True})
    tests.append({"input": fmt_nim_cases([make_case(500, 9999, modes[i % 4]) for i in range(40)]), "hidden": True})

    extra_stress = []
    for _ in range(30):
        t_s = rng.randint(1, 10)
        cs = [[rng.randint(0, 3) for _ in range(rng.randint(1, 4))] for _ in range(t_s)]
        extra_stress.append(fmt_nim_cases(cs))

    statement = r"""Cho $T$ bộ test độc lập, mỗi bộ test gồm một dãy $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$) biểu diễn số viên sỏi ở $N$ đống (đánh số từ $1$ đến $N$, **1-indexed**).

Với **cùng dãy $a$ đó**, hãy xác định người thắng (`FIRST` hoặc `SECOND`, giả sử cả hai chơi tối ưu) cho **hai biến thể kinh điển** sau đây:

1. **Misère Nim:** Hai người luân phiên chọn một đống $i$ có $a_i \ge 1$ và bốc đi một số lượng nguyên dương viên sỏi từ đống đó. Ai không còn nước đi hợp lệ khi đến lượt mình sẽ **THẮNG** (tức người bốc viên sỏi cuối cùng sẽ **THUA**).
2. **Staircase Nim (Nim cầu thang):** Các đống sỏi đặt trên $N$ bậc cầu thang đánh số $1, 2, \dots, N$ theo đúng thứ tự $a_1, a_2, \dots, a_N$. Trong đó **bậc $1$ là mặt sàn** (sỏi ở bậc $1$ không thể đẩy đi tiếp). Mỗi lượt, người chơi chọn một bậc $i$ ($2 \le i \le N$) đang có ít nhất $1$ viên sỏi và đẩy $k \ge 1$ viên từ bậc $i$ xuống bậc $i - 1$. Ai không còn nước đi hợp lệ khi đến lượt mình sẽ **THUA**.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $T$ ($1 \le T \le 400$).
- Với mỗi bộ test:
  - Dòng đầu chứa số nguyên $N$ ($1 \le N \le 500$).
  - Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($0 \le a_i \le 10^9$).

### Kết quả
- Với mỗi bộ test, in ra trên một dòng hai kết quả cách nhau bởi một dấu cách: `<kết quả Misère Nim> <kết quả Staircase Nim>` (mỗi kết quả là `FIRST` hoặc `SECOND`).

### Ràng buộc
- $1 \le T \le 400$, $1 \le N \le 500$
- $0 \le a_i \le 10^9$
- Tổng $N$ trong một bộ test không vượt quá $20\,000$.

### Giải thích ví dụ
- Bộ `[1, 1, 1]`:
  - Misère Nim: có 3 đống kích thước 1, người đi trước lấy 1, sau lấy 1, trước phải lấy viên cuối cùng nên thua $\implies$ `SECOND`.
  - Staircase Nim: các bậc chẵn (1-indexed) gồm $a_2 = 1 \ne 0$, người đi trước đẩy hết $1$ viên từ bậc 2 xuống bậc 1 (bên bậc 3 không có tác dụng trừ khi bậc 3 đẩy xuống 2 thì người kia đẩy tiếp xuống 1) $\implies$ `FIRST`."""

    hints = r"""**Gợi ý 1 (Bẫy của Misère Nim):**
Nếu toàn bộ các đống đều có kích thước $\le 1$ (tức chỉ gồm $0$ và $1$), mọi nước đi hợp lệ chỉ bốc đúng $1$ viên. Khi đó thắng thua chỉ phụ thuộc vào **tính chẵn lẻ** của số đống có giá trị $1$: số đống bằng $1$ là **chẵn** (tức $a_1 \oplus \dots \oplus a_N = 0$) thì `FIRST` thắng, ngược lại `SECOND` thắng.

**Gợi ý 2 (Trường hợp tổng quát của Misère Nim):**
Nếu có ít nhất một đống có $a_i \ge 2$, người chơi thắng ở trạng thái xuất phát chính xác giống như Nim thường (`FIRST` thắng khi và chỉ khi $\bigoplus_{i=1}^N a_i \ne 0$). Lý do: người chiến thắng duy trì tổng XOR bằng $0$ cho tới ngay trước khi chỉ còn các đống $\le 1$, tại thời điểm đó chỉ còn đúng $1$ đống $\ge 2$ nên người chơi có thể chủ động điều chỉnh số đống bằng $1$ thành **lẻ** để ép đối thủ thua!

**Gợi ý 3 (Staircase Nim theo đánh số 1-indexed):**
Vì bậc $1$ là mặt sàn và mỗi bước chuyển từ bậc $i \ge 2$ xuống $i - 1$:
- Mọi nước đi từ bậc **lẻ** $2k+1$ xuống bậc chẵn $2k$ có thể bị đối thủ triệt tiêu ngay bằng cách chuyển đúng số sỏi đó từ bậc $2k$ xuống $2k - 1$.
- Do đó, sỏi ở các bậc lẻ $1, 3, 5, \dots$ không làm thay đổi trạng thái thắng thua; toàn bộ trò chơi tương đương với Nim thường trên các **bậc chẵn** $a_2, a_4, a_6, \dots$! `FIRST` thắng khi và chỉ khi $a_2 \oplus a_4 \oplus a_6 \oplus \dots \ne 0$."""

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
        long long allXor = 0;
        long long evenXor = 0;
        bool allLeOne = true;

        for (int i = 1; i <= n; ++i) {
            long long a;
            cin >> a;
            allXor ^= a;
            if (a > 1) allLeOne = false;
            if ((i & 1) == 0) evenXor ^= a;
        }

        bool misereFirst = allLeOne ? (allXor == 0) : (allXor != 0);
        bool stairFirst = (evenXor != 0);

        cout << (misereFirst ? "FIRST" : "SECOND") << ' '
             << (stairFirst ? "FIRST" : "SECOND") << '\n';
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
        all_xor = 0
        even_xor = 0
        all_le_one = True
        for i in range(n):
            a = int(data[idx + i])
            all_xor ^= a
            if a > 1:
                all_le_one = False
            if (i & 1) == 1:  # 1-indexed even position (i = 1, 3, 5, ...)
                even_xor ^= a
        idx += n

        misere_first = (all_xor == 0) if all_le_one else (all_xor != 0)
        stair_first = even_xor != 0
        out.append(f"{'FIRST' if misere_first else 'SECOND'} {'FIRST' if stair_first else 'SECOND'}")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp18-misere-and-staircase-nim",
        "title": "Biến thể Nim: Misère Nim & Staircase Nim",
        "shortDescription": "Phân tích hai biến thể kinh điển của Nim: Misère Nim (bẫy đống <= 1) và Staircase Nim (XOR vị trí chẵn).",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.game_theory",
        "tags": ["lý thuyết trò chơi", "thao tác bit", "toán học", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(sum N).",
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

    # Pre-check test sizes stay well below 150 KB
    oversized = []
    for p in problems:
        for i, tc in enumerate(p["tests"], 1):
            sz = len(tc["input"].encode("utf-8"))
            if sz > SAFE_MAX_BYTES:
                oversized.append(f"[{p['slug']}] test #{i}: {sz} bytes")
    if oversized:
        raise ValueError("Oversized tests:\n" + "\n".join(oversized))

    build_and_verify_pack(
        pack_id="18-geometry-game-theory",
        title="Tầng 4: Hình học tính toán & Lý thuyết trò chơi",
        tier="Tầng 4 — Hình học & Game Theory",
        description=(
            "10 bài Hình học tính toán (CCW, giao đoạn thẳng, diện tích đa giác, Pick, "
            "Ray Casting, Convex Hull, Closest Pair) & Lý thuyết trò chơi (Nim, Sprague-Grundy, "
            "Misère & Staircase Nim)."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
