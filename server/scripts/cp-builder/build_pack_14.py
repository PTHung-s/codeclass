"""
Builder & automated verifier for CodeClass CP Pack 14:
Tầng 3–4: Đồ thị nâng cao (0-1 BFS, Floyd, Bellman-Ford, Tarjan & SCC)

Generates and verifies 10 original Vietnamese competitive programming problems
(3 easy, 4 medium, 3 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions (strictly iterative on deep graphs),
and independent brute-force stress checks on all 10/10 problems.
"""

from __future__ import annotations

import heapq
import random
import sys
from collections import deque
from pathlib import Path
from typing import Dict, List, Set, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Đồ thị nâng cao\n"
SAFE_MAX_BYTES = 148_000


def fmt_grid(grid: List[str]) -> str:
    return f"{len(grid)} {len(grid[0])}\n" + "\n".join(grid)


def fmt_graph_unweighted(n: int, edges: List[Tuple[int, int]]) -> str:
    lines = [f"{n} {len(edges)}"]
    lines.extend(f"{u} {v}" for u, v in edges)
    return "\n".join(lines)


def fmt_graph_weighted(n: int, edges: List[Tuple[int, int, int]]) -> str:
    lines = [f"{n} {len(edges)}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    return "\n".join(lines)


def fmt_floyd(
    n: int,
    edges: List[Tuple[int, int, int]],
    queries: List[Tuple[int, int]],
) -> str:
    lines = [f"{n} {len(edges)} {len(queries)}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    lines.extend(f"{u} {v}" for u, v in queries)
    return "\n".join(lines)


def fmt_k_routes(n: int, k: int, edges: List[Tuple[int, int, int]]) -> str:
    lines = [f"{n} {len(edges)} {k}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    return "\n".join(lines)


def fmt_coin_collector(
    n: int, coins: List[int], edges: List[Tuple[int, int]]
) -> str:
    lines = [f"{n} {len(edges)}", " ".join(map(str, coins))]
    lines.extend(f"{u} {v}" for u, v in edges)
    return "\n".join(lines)


# ============================================================================
# 1. cp14-multi-source-bfs-stations
# ============================================================================

def brute_p01(inp: str) -> str:
    lines = inp.strip().splitlines()
    n, m = map(int, lines[0].split())
    grid = lines[1 : 1 + n]
    max_d = -1
    unreach = 0

    for sr in range(n):
        for sc in range(m):
            if grid[sr][sc] != ".":
                continue
            dist = [[-1] * m for _ in range(n)]
            dist[sr][sc] = 0
            q = deque([(sr, sc)])
            found = -1
            while q:
                r, c = q.popleft()
                if grid[r][c] == "S":
                    found = dist[r][c]
                    break
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < n and 0 <= nc < m and grid[nr][nc] != "#" and dist[nr][nc] == -1:
                        dist[nr][nc] = dist[r][c] + 1
                        q.append((nr, nc))
            if found == -1:
                unreach += 1
            elif found > max_d:
                max_d = found
    return f"{max_d} {unreach}"


def build_p01() -> dict:
    rng = random.Random(1401)

    def rand_grid(n: int, m: int, p_wall: float, p_sta: float) -> List[str]:
        rows = []
        for _ in range(n):
            row = []
            for _ in range(m):
                x = rng.random()
                if x < p_wall:
                    row.append("#")
                elif x < p_wall + p_sta:
                    row.append("S")
                else:
                    row.append(".")
            rows.append("".join(row))
        return rows

    tests = [
        # 3 public samples
        {
            "input": fmt_grid([
                "S..#.",
                ".#.#.",
                ".#..S",
                "###..",
                "..#..",
            ]),
            "hidden": False,
            "expected": "3 2",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "S...",
                ".##.",
                "...S",
            ]),
            "hidden": False,
            "expected": "2 0",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "..#.",
                ".##.",
                "....",
            ]),
            "hidden": False,
            "expected": "-1 9",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_grid(["."]), "hidden": True, "expected": "-1 1", "checkBrute": True},
        {"input": fmt_grid(["S"]), "hidden": True, "expected": "-1 0", "checkBrute": True},
        {"input": fmt_grid(["#"]), "hidden": True, "expected": "-1 0", "checkBrute": True},
        {
            "input": fmt_grid([
                "S#S",
                "#.#",
                "S#S",
            ]),
            "hidden": True,
            "expected": "-1 1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "SS#..",
                "SS#..",
                "#####",
                "..S..",
            ]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (up to 250x250)
    tests.append({"input": fmt_grid(rand_grid(20, 25, 0.25, 0.04)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_grid(rand_grid(35, 35, 0.35, 0.02)), "hidden": True, "checkBrute": True})

    # Test 11: 1x250 corridor with S at ends and walls
    row11 = list("." * 250)
    row11[0] = "S"
    row11[180] = "#"
    row11[249] = "S"
    tests.append({"input": fmt_grid(["".join(row11)]), "hidden": True})

    # Test 12: 250x250 empty grid with 1 S at corner (max dist = 498)
    g12 = [list("." * 250) for _ in range(250)]
    g12[0][0] = "S"
    tests.append({"input": fmt_grid(["".join(r) for r in g12]), "hidden": True})

    # Test 13: 250x250 snake labyrinth with 1 S at (0,0)
    g13 = [list("." * 250) for _ in range(250)]
    for r in range(250):
        if r % 2 == 1:
            for c in range(250):
                g13[r][c] = "#"
            if (r // 2) % 2 == 0:
                g13[r][249] = "."
            else:
                g13[r][0] = "."
    g13[0][0] = "S"
    tests.append({"input": fmt_grid(["".join(r) for r in g13]), "hidden": True})

    # Test 14: 250x250 no S at all
    tests.append({"input": fmt_grid(rand_grid(250, 250, 0.2, 0.0)), "hidden": True})

    # Test 15: 250x250 sparse stations, heavy walls
    tests.append({"input": fmt_grid(rand_grid(250, 250, 0.42, 0.003)), "hidden": True})

    # Test 16: 250x250 dense stations
    tests.append({"input": fmt_grid(rand_grid(250, 250, 0.22, 0.05)), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 15)
        m = rng.randint(1, 15)
        extra_stress.append(fmt_grid(rand_grid(n, m, rng.uniform(0.0, 0.45), rng.uniform(0.0, 0.15))))

    statement = r"""Một khu đô thị được mô hình hóa bằng lưới ô vuông kích thước $N \times M$. Mỗi ô thuộc một trong ba loại:
- `.`: ô đường đi thông thoáng.
- `#`: ô tường chắn, không thể đi qua.
- `S`: trạm phát sóng cứu hộ (bản đồ có thể có $0$, $1$ hoặc nhiều trạm `S`).

Từ một ô, ta chỉ có thể di chuyển sang $4$ ô kề cạnh (lên, xuống, trái, phải) nằm trong lưới và không phải là tường `#`. Với mỗi ô đường đi `.` có thể đi tới ít nhất một trạm `S`, khoảng cách của ô đó tới trạm gần nhất là số bước di chuyển ít nhất để đi từ ô đó tới một trạm `S` bất kỳ.

Hãy xác định hai giá trị:
1. Khoảng cách lớn nhất tới trạm `S` gần nhất trong tất cả các ô `.` **có thể đi tới** được ít nhất một trạm `S` (in `-1` nếu không có ô `.` nào đi tới được trạm `S`).
2. Số lượng ô `.` **không thể đi tới** bất kỳ trạm `S` nào.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N, M \le 250$).
- $N$ dòng tiếp theo, mỗi dòng là một xâu độ dài $M$ chỉ gồm các ký tự `.`, `#`, `S`.

### Kết quả
- In ra trên một dòng hai số nguyên cách nhau bởi một dấu cách: khoảng cách lớn nhất tìm được (hoặc `-1`) và số lượng ô `.` không thể tiếp cận trạm `S`.

### Ràng buộc
- $1 \le N, M \le 250$
- Lưới chỉ chứa các ký tự `.`, `#`, `S`.

### Subtasks
- **Subtask 1 (30%):** $1 \le N, M \le 30$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Các ô `.` ở góc dưới trái `(5, 1)` và `(5, 2)` bị dãy `#` cô lập hoàn toàn nên không đến được trạm `S` nào (có $2$ ô không tiếp cận được). Trong các ô `.` đến được `S`, ô `(4, 4)` và `(4, 5)` có khoảng cách ngắn nhất tới `S` là $3$ — đây là khoảng cách lớn nhất.
- **Ví dụ 2:** Mọi ô `.` đều đi được tới một trong hai trạm `S` với khoảng cách tối đa bằng $2$.
- **Ví dụ 3:** Không có trạm `S` nào trên bản đồ, do đó cả $9$ ô `.` đều không đến được trạm và giá trị thứ nhất là `-1`."""

    hints = r"""**Gợi ý 1 (Đảo chiều tìm kiếm):**
Thay vì chạy BFS riêng lẻ từ từng ô `.` (tốn $O((NM)^2)$), ta có thể tìm kiếm **ngược từ tất cả các trạm `S` cùng một lúc**!

**Gợi ý 2 (Multi-source BFS):**
Đưa **tất cả** các ô `S` vào hàng đợi `queue` ngay từ đầu với khoảng cách `dist = 0`, rồi chạy một lần BFS duy nhất lan ra các ô `.` lân cận chưa thăm (`#` đóng vai trò vật cản).

**Gợi ý 3 (Xử lý trường hợp biên):**
- Nếu bản đồ không có trạm `S` nào, hoặc mọi ô `.` đều bị tường `#` ngăn cách với `S`, hoặc bản đồ không có ô `.` nào thì giá trị đầu tiên phải là `-1`.
- Hãy dùng mảng 1 chiều phẳng kích thước $N \cdot M$ trong Python để BFS đạt tốc độ tối đa."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<string> grid(n);
    for (int i = 0; i < n; ++i) {
        cin >> grid[i];
    }

    vector<int> dist(n * m, -1);
    vector<int> q;
    q.reserve(n * m);

    for (int r = 0; r < n; ++r) {
        for (int c = 0; c < m; ++c) {
            if (grid[r][c] == 'S') {
                int id = r * m + c;
                dist[id] = 0;
                q.push_back(id);
            }
        }
    }

    const int dr[4] = {-1, 1, 0, 0};
    const int dc[4] = {0, 0, -1, 1};

    for (size_t head = 0; head < q.size(); ++head) {
        int u = q[head];
        int r = u / m;
        int c = u % m;
        int nd = dist[u] + 1;
        for (int d = 0; d < 4; ++d) {
            int nr = r + dr[d];
            int nc = c + dc[d];
            if (nr < 0 || nr >= n || nc < 0 || nc >= m) continue;
            if (grid[nr][nc] != '.') continue;
            int v = nr * m + nc;
            if (dist[v] == -1) {
                dist[v] = nd;
                q.push_back(v);
            }
        }
    }

    int maxDist = -1;
    int unreachable = 0;
    for (int r = 0; r < n; ++r) {
        for (int c = 0; c < m; ++c) {
            if (grid[r][c] == '.') {
                int d = dist[r * m + c];
                if (d == -1) {
                    ++unreachable;
                } else if (d > maxDist) {
                    maxDist = d;
                }
            }
        }
    }

    cout << maxDist << ' ' << unreachable << '\n';
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

    flat = "".join(rows)
    total = n * m
    dist = [-1] * total
    dq = deque()

    for idx, ch in enumerate(flat):
        if ch == "S":
            dist[idx] = 0
            dq.append(idx)

    while dq:
        u = dq.popleft()
        nd = dist[u] + 1
        r, c = divmod(u, m)
        if r > 0:
            v = u - m
            if flat[v] == "." and dist[v] == -1:
                dist[v] = nd
                dq.append(v)
        if r + 1 < n:
            v = u + m
            if flat[v] == "." and dist[v] == -1:
                dist[v] = nd
                dq.append(v)
        if c > 0:
            v = u - 1
            if flat[v] == "." and dist[v] == -1:
                dist[v] = nd
                dq.append(v)
        if c + 1 < m:
            v = u + 1
            if flat[v] == "." and dist[v] == -1:
                dist[v] = nd
                dq.append(v)

    max_dist = -1
    unreach = 0
    for idx, ch in enumerate(flat):
        if ch == ".":
            d = dist[idx]
            if d == -1:
                unreach += 1
            elif d > max_dist:
                max_dist = d

    sys.stdout.write(f"{max_dist} {unreach}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-multi-source-bfs-stations",
        "title": "Trạm phát sóng cứu hộ (Multi-source BFS)",
        "shortDescription": "Tìm khoảng cách lớn nhất tới trạm gần nhất và đếm số ô bị cô lập trên lưới bằng Multi-source BFS.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.graph_grid_bipartite",
        "tags": ["đồ thị", "bfs-dfs", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * M), dùng Multi-source BFS.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp14-zero-one-bfs-arrows
# ============================================================================

def brute_p02(inp: str) -> str:
    lines = inp.strip().splitlines()
    n, m = map(int, lines[0].split())
    grid = lines[1 : 1 + n]
    dirs = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}
    inf = 10**9
    dist = [[inf] * m for _ in range(n)]
    dist[0][0] = 0
    pq = [(0, 0, 0)]
    while pq:
        d, r, c = heapq.heappop(pq)
        if d > dist[r][c]:
            continue
        if r == n - 1 and c == m - 1:
            return str(d)
        cur_dir = grid[r][c]
        for ch, (dr, dc) in dirs.items():
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < m:
                w = 0 if ch == cur_dir else 1
                if d + w < dist[nr][nc]:
                    dist[nr][nc] = d + w
                    heapq.heappush(pq, (d + w, nr, nc))
    return str(dist[n - 1][m - 1])


def build_p02() -> dict:
    rng = random.Random(1402)
    arrows = "UDLR"

    def rand_arrow_grid(n: int, m: int) -> List[str]:
        return ["".join(rng.choice(arrows) for _ in range(m)) for _ in range(n)]

    tests = [
        # 3 public samples
        {
            "input": fmt_grid([
                "RRD",
                "LLD",
                "RRR",
            ]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "RRRD",
                "LLLU",
                "DRRR",
            ]),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "LL",
                "UU",
            ]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_grid(["U"]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_grid(["R" * 8]), "hidden": True, "expected": "0", "checkBrute": True},
        {"input": fmt_grid(["L" * 8]), "hidden": True, "expected": "7", "checkBrute": True},
        {
            "input": fmt_grid([
                "RDLU",
                "DRUL",
                "LURD",
                "ULDR",
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "DDDD",
                "UUUU",
                "DDDD",
                "UUUU",
            ]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_grid(rand_arrow_grid(25, 25)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_grid(rand_arrow_grid(40, 50)), "hidden": True, "checkBrute": True})

    # Test 11: 1x250 all L (cost = 249)
    tests.append({"input": fmt_grid(["L" * 250]), "hidden": True})

    # Test 12: 250x1 all U (cost = 249)
    tests.append({"input": fmt_grid(["U" for _ in range(250)]), "hidden": True})

    # Test 13: 250x250 snake zero-cost path with noisy background
    g13 = [list("U" * 250) for _ in range(250)]
    for r in range(250):
        if r % 2 == 0:
            for c in range(249):
                g13[r][c] = "R"
            g13[r][249] = "D"
        else:
            for c in range(1, 250):
                g13[r][c] = "L"
            g13[r][0] = "D"
    tests.append({"input": fmt_grid(["".join(r) for r in g13]), "hidden": True})

    # Test 14: 250x250 all pointing away from bottom-right (U/L)
    g14 = ["".join(rng.choice("UL") for _ in range(250)) for _ in range(250)]
    tests.append({"input": fmt_grid(g14), "hidden": True})

    # Test 15: 250x250 uniform random
    tests.append({"input": fmt_grid(rand_arrow_grid(250, 250)), "hidden": True})

    # Test 16: 250x250 alternating horizontal bands
    g16 = []
    for r in range(250):
        ch = "R" if r % 2 == 0 else "L"
        g16.append(ch * 250)
    tests.append({"input": fmt_grid(g16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 16)
        m = rng.randint(1, 16)
        extra_stress.append(fmt_grid(rand_arrow_grid(n, m)))

    statement = r"""Cho bảng lưới kích thước $N \times M$, các hàng đánh số từ $1$ đến $N$, các cột từ $1$ đến $M$. Mỗi ô $(r, c)$ chứa đúng một ký tự mũi tên định hướng trong tập `{U, D, L, R}` tương ứng với 4 hướng đi:
- `U`: lên trên $(r - 1, c)$
- `D`: xuống dưới $(r + 1, c)$
- `L`: sang trái $(r, c - 1)$
- `R`: sang phải $(r, c + 1)$

Một robot xuất phát từ ô góc trên trái $(1, 1)$ và cần di chuyển tới ô góc dưới phải $(N, M)$. Tại mỗi bước ở ô $(r, c)$, robot có thể bước sang một trong $4$ ô kề cạnh nằm trong phạm vi lưới:
- Nếu bước đúng theo hướng mũi tên ghi tại ô $(r, c)$, chi phí là $0$.
- Nếu đổi sang một hướng khác với mũi tên tại ô $(r, c)$, chi phí là $1$.

Hãy tìm tổng chi phí nhỏ nhất để robot đi từ $(1, 1)$ đến $(N, M)$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N, M \le 250$).
- $N$ dòng tiếp theo, mỗi dòng gồm $M$ ký tự thuộc `{U, D, L, R}`.

### Kết quả
- In ra một số nguyên duy nhất là tổng chi phí nhỏ nhất tìm được.

### Ràng buộc
- $1 \le N, M \le 250$
- Mọi ô chỉ gồm các ký tự `U`, `D`, `L`, `R`.

### Subtasks
- **Subtask 1 (30%):** $1 \le N, M \le 30$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đi theo đúng mũi tên `(1,1) -> (1,2) -> (1,3) -> (2,3) -> (3,3)` mất tổng chi phí $0$.
- **Ví dụ 2:** Đi `(1,1) -> (1,2) -> (1,3) -> (1,4) -> (2,4)` mất $0$ chi phí, tại `(2,4)` đổi hướng từ `U` sang `D` tốn $1$ để xuống `(3,4)`. Tổng chi phí là $1$.
- **Ví dụ 3:** Tại `(1,1)` đổi sang `R` (hoặc `D`) tốn $1$, ô tiếp theo lại đổi hướng về `(2,2)` tốn thêm $1$. Tổng chi phí là $2$."""

    hints = r"""**Gợi ý 1 (Mô hình hóa đồ thị có trọng số 0/1):**
Mỗi ô là một đỉnh. Từ mỗi ô $(r, c)$, có tối đa $4$ cạnh có hướng tới các ô kề cạnh: cạnh đi theo hướng mũi tên có trọng số $0$, tối đa $3$ cạnh còn lại có trọng số $1$.

**Gợi ý 2 (Thuật toán 0-1 BFS với `deque`):**
Vì mọi cạnh chỉ có trọng số $0$ hoặc $1$, ta không cần hàng đợi ưu tiên $O(E \log V)$. Thay vào đó, dùng hàng đợi hai đầu `deque`:
- Khi cập nhật được `dist[v] = dist[u] + 0`, đẩy `v` vào **đầu** `deque` (`push_front` / `appendleft`).
- Khi cập nhật được `dist[v] = dist[u] + 1`, đẩy `v` vào **cuối** `deque` (`push_back` / `append`).

**Gợi ý 3 (Lưu ý cài đặt):**
Nhờ thứ tự không giảm trong `deque`, ngay khi lấy được ô đích $(N, M)$ ra khỏi đầu `deque`, giá trị `dist` của nó chính là đáp án tối ưu. Đừng quên kiểm tra `if d > dist[u]: continue` để bỏ qua các trạng thái cũ."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<string> grid(n);
    for (int i = 0; i < n; ++i) {
        cin >> grid[i];
    }

    const int INF = 1e9;
    vector<int> dist(n * m, INF);
    deque<int> dq;

    dist[0] = 0;
    dq.push_back(0);

    const int dr[4] = {-1, 1, 0, 0};
    const int dc[4] = {0, 0, -1, 1};
    const char dirCh[4] = {'U', 'D', 'L', 'R'};
    int target = n * m - 1;

    while (!dq.empty()) {
        int u = dq.front();
        dq.pop_front();
        if (u == target) break;

        int r = u / m;
        int c = u % m;
        int d = dist[u];
        char cur = grid[r][c];

        for (int k = 0; k < 4; ++k) {
            int nr = r + dr[k];
            int nc = c + dc[k];
            if (nr < 0 || nr >= n || nc < 0 || nc >= m) continue;
            int w = (cur == dirCh[k]) ? 0 : 1;
            int v = nr * m + nc;
            if (d + w < dist[v]) {
                dist[v] = d + w;
                if (w == 0) {
                    dq.push_front(v);
                } else {
                    dq.push_back(v);
                }
            }
        }
    }

    cout << dist[target] << '\n';
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
    flat = "".join(data[2 : 2 + n])

    total = n * m
    target = total - 1
    inf = 10**9
    dist = [inf] * total
    dist[0] = 0
    dq = deque([0])

    while dq:
        u = dq.popleft()
        if u == target:
            break
        d = dist[u]
        r, c = divmod(u, m)
        ch = flat[u]

        if r > 0:
            v = u - m
            w = 0 if ch == "U" else 1
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                if w == 0:
                    dq.appendleft(v)
                else:
                    dq.append(v)
        if r + 1 < n:
            v = u + m
            w = 0 if ch == "D" else 1
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                if w == 0:
                    dq.appendleft(v)
                else:
                    dq.append(v)
        if c > 0:
            v = u - 1
            w = 0 if ch == "L" else 1
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                if w == 0:
                    dq.appendleft(v)
                else:
                    dq.append(v)
        if c + 1 < m:
            v = u + 1
            w = 0 if ch == "R" else 1
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                if w == 0:
                    dq.appendleft(v)
                else:
                    dq.append(v)

    sys.stdout.write(f"{dist[target]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-zero-one-bfs-arrows",
        "title": "Lưới mũi tên chi phí nhỏ nhất (0-1 BFS)",
        "shortDescription": "Tìm chi phí nhỏ nhất đi từ (1,1) đến (N,M) trên lưới mũi tên bằng thuật toán 0-1 BFS với deque.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "0-1 bfs", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * M), dùng 0-1 BFS với deque.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp14-floyd-warshall-queries
# ============================================================================

def brute_p03(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m, q = toks[0], toks[1], toks[2]
    adj: List[List[Tuple[int, int]]] = [[] for _ in range(n + 1)]
    idx = 3
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    inf = 10**20
    cache: Dict[int, List[int]] = {}

    def dijkstra(s: int) -> List[int]:
        dist = [inf] * (n + 1)
        dist[s] = 0
        pq = [(0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            for v, w in adj[u]:
                if d + w < dist[v]:
                    dist[v] = d + w
                    heapq.heappush(pq, (d + w, v))
        return dist

    out = []
    for _ in range(q):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        if u not in cache:
            cache[u] = dijkstra(u)
        d = cache[u][v]
        out.append("-1" if d >= inf else str(d))
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1403)

    tests = [
        # 3 public samples
        {
            "input": fmt_floyd(
                4,
                [(1, 2, 5), (2, 3, 3), (1, 3, 10), (3, 4, 2)],
                [(1, 4), (2, 4), (1, 1), (1, 3)],
            ),
            "hidden": False,
            "expected": "10\n5\n0\n8",
            "checkBrute": True,
        },
        {
            "input": fmt_floyd(
                5,
                [(1, 2, 4), (1, 2, 2), (2, 2, 1), (4, 5, 7)],
                [(1, 2), (2, 5), (4, 5), (3, 3)],
            ),
            "hidden": False,
            "expected": "2\n-1\n7\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_floyd(
                4,
                [(1, 2, 0), (2, 3, 0), (3, 4, 1000000000), (1, 4, 3000000000 if False else 1000000000)],
                [(1, 3), (1, 4)],
            ),
            "hidden": False,
            "expected": "0\n1000000000",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_floyd(1, [], [(1, 1), (1, 1)]), "hidden": True, "expected": "0\n0", "checkBrute": True},
        {
            "input": fmt_floyd(3, [(1, 2, 0), (2, 3, 0)], [(1, 3), (3, 1), (2, 2)]),
            "hidden": True,
            "expected": "0\n0\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_floyd(
                6,
                [(1, 2, 1000000000), (2, 3, 1000000000), (3, 4, 1000000000), (4, 5, 1000000000), (5, 6, 1000000000)],
                [(1, 6), (6, 1), (2, 5)],
            ),
            "hidden": True,
            "expected": "5000000000\n5000000000\n3000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_floyd(
                4,
                [(1, 2, 10), (1, 2, 3), (1, 2, 7), (1, 1, 0), (2, 2, 5)],
                [(1, 2), (2, 1), (3, 4), (4, 4)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_floyd(
                10,
                [(i, i + 1, i * 100) for i in range(1, 5)] + [(6, 7, 50), (7, 8, 50)],
                [(1, 5), (1, 6), (6, 8), (9, 10), (10, 10)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    # Test 9: Medium random N=40, M=150, Q=300
    e9 = [(rng.randint(1, 40), rng.randint(1, 40), rng.randint(0, 10**6)) for _ in range(150)]
    q9 = [(rng.randint(1, 40), rng.randint(1, 40)) for _ in range(300)]
    tests.append({"input": fmt_floyd(40, e9, q9), "hidden": True, "checkBrute": True})

    # Test 10: Medium disconnected components N=60, M=200, Q=400
    e10 = [(rng.randint(1, 30), rng.randint(1, 30), rng.randint(1, 10**5)) for _ in range(120)]
    e10 += [(rng.randint(31, 58), rng.randint(31, 58), rng.randint(1, 10**5)) for _ in range(80)]
    q10 = [(rng.randint(1, 60), rng.randint(1, 60)) for _ in range(400)]
    tests.append({"input": fmt_floyd(60, e10, q10), "hidden": True, "checkBrute": True})

    # Test 11: Line N=120 with huge 1e9 weights + shortcuts, Q=2000
    e11 = [(i, i + 1, 1_000_000_000) for i in range(1, 120)]
    for _ in range(50):
        e11.append((rng.randint(1, 120), rng.randint(1, 120), rng.randint(0, 10**9)))
    q11 = [(1, 120), (120, 1)] + [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(1998)]
    tests.append({"input": fmt_floyd(120, e11, q11), "hidden": True})

    # Test 12: Dense N=120, M=6800 (near max M!), Q=3500
    e12 = [(rng.randint(1, 120), rng.randint(1, 120), rng.randint(1, 99999)) for _ in range(6800)]
    q12 = [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(3500)]
    tests.append({"input": fmt_floyd(120, e12, q12), "hidden": True})

    # Test 13: Max Q=10000 with N=120, M=2500
    e13 = [(rng.randint(1, 120), rng.randint(1, 120), rng.randint(0, 10**9)) for _ in range(2500)]
    q13 = [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(10_000)]
    tests.append({"input": fmt_floyd(120, e13, q13), "hidden": True})

    # Test 14: 2 large disconnected clusters N=120, M=4000, Q=6000
    e14 = [(rng.randint(1, 60), rng.randint(1, 60), rng.randint(1, 10**7)) for _ in range(2000)]
    e14 += [(rng.randint(61, 118), rng.randint(61, 118), rng.randint(1, 10**7)) for _ in range(2000)]
    q14 = [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(6000)]
    tests.append({"input": fmt_floyd(120, e14, q14), "hidden": True})

    # Test 15: Complete graph K120 subset (7000 edges, weights <= 1000), Q=4000
    all_pairs = [(u, v) for u in range(1, 121) for v in range(u + 1, 121)]
    rng.shuffle(all_pairs)
    e15 = [(u, v, rng.randint(0, 999)) for u, v in all_pairs[:7000]]
    q15 = [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(4000)]
    tests.append({"input": fmt_floyd(120, e15, q15), "hidden": True})

    # Test 16: Multi-edges + zero-weight bridges N=120, M=3500, Q=8000
    e16 = [(i, i + 1, 0) for i in range(1, 120, 2)]
    e16 += [(rng.randint(1, 120), rng.randint(1, 120), rng.randint(0, 10**9)) for _ in range(3440)]
    q16 = [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(8000)]
    tests.append({"input": fmt_floyd(120, e16, q16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 18)
        m = rng.randint(0, 40)
        q = rng.randint(1, 30)
        edges = [(rng.randint(1, n), rng.randint(1, n), rng.randint(0, 10**9)) for _ in range(m)]
        queries = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(q)]
        extra_stress.append(fmt_floyd(n, edges, queries))

    statement = r"""Cho đồ thị vô hướng gồm $N$ đỉnh đánh số từ $1$ đến $N$ và $M$ cạnh có trọng số nguyên không âm. Đồ thị có thể không liên thông, có thể chứa đa cạnh (nhiều cạnh nối cùng một cặp đỉnh) và khuyên (cạnh nối một đỉnh với chính nó).

Bạn cần trả lời $Q$ truy vấn độc lập; mỗi truy vấn cho một cặp đỉnh $(u, v)$ và yêu cầu tìm độ dài đường đi ngắn nhất giữa $u$ và $v$ (hoặc báo `-1` nếu không tồn tại đường đi).

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, M, Q$ ($1 \le N \le 120$, $0 \le M \le 7000$, $1 \le Q \le 10\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ ($1 \le u, v \le N$, $0 \le w \le 10^9$) biểu diễn một cạnh vô hướng nối $u$ và $v$ có trọng số $w$.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra một số nguyên là độ dài đường đi ngắn nhất cho truy vấn thứ $i$, hoặc `-1` nếu hai đỉnh không liên thông.

### Ràng buộc
- $1 \le N \le 120$
- $0 \le M \le 7000$
- $1 \le Q \le 10\,000$
- $0 \le w \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 30$, $Q \le 200$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đường đi ngắn nhất từ $1$ đến $4$ là $1 \to 2 \to 3 \to 4$ có tổng trọng số $5 + 3 + 2 = 10$. Từ $1$ đến $1$ có độ dài $0$.
- **Ví dụ 2:** Giữa $1$ và $2$ có hai cạnh trọng số $4$ và $2$, chọn cạnh $2$. Các đỉnh $2$ và $5$ thuộc hai thành phần liên thông khác nhau nên kết quả là `-1`."""

    hints = r"""**Gợi ý 1 (Nhận diện bài toán mọi cặp đỉnh):**
Số đỉnh $N \le 120$ rất nhỏ nhưng số truy vấn $Q$ lên tới $10\,000$. Thay vì chạy Dijkstra cho mỗi truy vấn, ta nên tính trước đường đi ngắn nhất giữa **mọi cặp đỉnh**.

**Gợi ý 2 (Thuật toán Floyd-Warshall):**
Khởi tạo ma trận khoảng cách $d[u][v]$:
- $d[i][i] = 0$ với mọi $i$.
- Khi đọc cạnh $(u, v, w)$, cập nhật $d[u][v] = d[v][u] = \min(d[u][v], w)$ (tránh mất cạnh nhỏ hơn khi có đa cạnh).
- Dùng 3 vòng lặp `k`, `i`, `j` cập nhật $d[i][j] = \min(d[i][j], d[i][k] + d[k][j])$.

**Gợi ý 3 (Kiểu dữ liệu & Tối ưu):**
- Tổng trọng số đường đi có thể lên tới $(N - 1) \cdot 10^9 \approx 1.2 \times 10^{11}$, vượt quá `int` 32-bit; hãy dùng `long long` (`INF = 4e18`).
- Trong Python, do đồ thị vô hướng nên ma trận $d$ đối xứng: chỉ cần duyệt $j$ từ $i + 1$ đến $N$ và bỏ qua nếu $d[i][k] = \text{INF}$, giúp chạy nhanh gấp đôi."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, q;
    if (!(cin >> n >> m >> q)) return 0;

    const long long INF = 4000000000000000000LL;
    vector<vector<long long>> dist(n + 1, vector<long long>(n + 1, INF));
    for (int i = 1; i <= n; ++i) dist[i][i] = 0;

    for (int i = 0; i < m; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        if (w < dist[u][v]) {
            dist[u][v] = dist[v][u] = w;
        }
    }

    for (int k = 1; k <= n; ++k) {
        for (int i = 1; i <= n; ++i) {
            if (dist[i][k] == INF) continue;
            long long dik = dist[i][k];
            for (int j = i + 1; j <= n; ++j) {
                long long nd = dik + dist[k][j];
                if (nd < dist[i][j]) {
                    dist[i][j] = dist[j][i] = nd;
                }
            }
        }
    }

    for (int i = 0; i < q; ++i) {
        int u, v;
        cin >> u >> v;
        if (dist[u][v] >= INF) {
            cout << -1 << '\n';
        } else {
            cout << dist[u][v] << '\n';
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
    q = int(data[2])

    inf = 4 * 10**18
    dist = [[inf] * (n + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dist[i][i] = 0

    idx = 3
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        if w < dist[u][v]:
            dist[u][v] = w
            dist[v][u] = w

    for k in range(1, n + 1):
        dk = dist[k]
        for i in range(1, n + 1):
            dik = dist[i][k]
            if dik == inf:
                continue
            di = dist[i]
            for j in range(i + 1, n + 1):
                nd = dik + dk[j]
                if nd < di[j]:
                    di[j] = nd
                    dist[j][i] = nd

    out = []
    for _ in range(q):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        d = dist[u][v]
        out.append("-1" if d >= inf else str(d))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-floyd-warshall-queries",
        "title": "Truy vấn đường đi ngắn nhất mọi cặp đỉnh (Floyd-Warshall)",
        "shortDescription": "Tính đường đi ngắn nhất giữa mọi cặp đỉnh trên đồ thị vô hướng có đa cạnh bằng Floyd-Warshall.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "floyd", "truy vấn", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N^3 + M + Q) bằng Floyd-Warshall.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp14-directed-cycle-kahn
# ============================================================================

def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    adj: List[List[int]] = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        adj[u].append(v)

    reach = [[False] * (n + 1) for _ in range(n + 1)]
    for s in range(1, n + 1):
        q = deque()
        for v in adj[s]:
            if not reach[s][v]:
                reach[s][v] = True
                q.append(v)
        while q:
            u = q.popleft()
            for v in adj[u]:
                if not reach[s][v]:
                    reach[s][v] = True
                    q.append(v)

    in_cycle = [reach[i][i] for i in range(n + 1)]
    stuck = 0
    for v in range(1, n + 1):
        if in_cycle[v] or any(in_cycle[c] and reach[c][v] for c in range(1, n + 1)):
            stuck += 1

    if stuck == 0:
        return "NO 0"
    return f"YES {stuck}"


def build_p04() -> dict:
    rng = random.Random(1404)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_unweighted(5, [(1, 2), (2, 3), (3, 4), (4, 2), (4, 5)]),
            "hidden": False,
            "expected": "YES 4",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(4, [(1, 2), (1, 3), (2, 4), (3, 4)]),
            "hidden": False,
            "expected": "NO 0",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(4, [(1, 2), (2, 2), (2, 3), (4, 3)]),
            "hidden": False,
            "expected": "YES 2",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_graph_unweighted(1, []), "hidden": True, "expected": "NO 0", "checkBrute": True},
        {"input": fmt_graph_unweighted(1, [(1, 1)]), "hidden": True, "expected": "YES 1", "checkBrute": True},
        {
            "input": fmt_graph_unweighted(6, [(1, 2), (2, 3), (4, 5), (5, 4), (4, 5), (6, 1)]),
            "hidden": True,
            "expected": "YES 2",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(5, [(1, 2), (2, 3), (3, 4), (4, 5), (5, 1)]),
            "hidden": True,
            "expected": "YES 5",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                6, [(1, 2), (2, 3), (3, 1), (4, 2), (5, 4), (6, 5)]
            ),
            "hidden": True,
            "expected": "YES 3",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    # Test 9: Medium random with cycles N=80, M=140
    e9 = [(rng.randint(1, 80), rng.randint(1, 80)) for _ in range(140)]
    tests.append({"input": fmt_graph_unweighted(80, e9), "hidden": True, "checkBrute": True})

    # Test 10: Medium random DAG N=100, M=300
    perm10 = list(range(1, 101))
    rng.shuffle(perm10)
    e10 = []
    for _ in range(300):
        a, b = sorted(rng.sample(range(100), 2))
        e10.append((perm10[a], perm10[b]))
    tests.append({"input": fmt_graph_unweighted(100, e10), "hidden": True, "checkBrute": True})

    # Test 11: Large DAG chain N=20000, M=12000 (acyclic)
    perm11 = list(range(1, 20_001))
    rng.shuffle(perm11)
    e11 = [(perm11[i], perm11[i + 1]) for i in range(12_000)]
    tests.append({"input": fmt_graph_unweighted(20_000, e11), "hidden": True})

    # Test 12: Large single cycle N=12000, M=12000
    e12 = [(i, i + 1) for i in range(1, 12_000)] + [(12_000, 1)]
    tests.append({"input": fmt_graph_unweighted(12_000, e12), "hidden": True})

    # Test 13: DAG prefix (8000) -> 2-cycle -> DAG suffix (4000)
    e13 = [(i, i + 1) for i in range(1, 8000)]
    e13 += [(8000, 8001), (8001, 8002), (8002, 8001)]
    e13 += [(i, i + 1) for i in range(8002, 12000)]
    tests.append({"input": fmt_graph_unweighted(12_000, e13), "hidden": True})

    # Test 14: Random sparse directed N=20000, M=12000
    e14 = [(rng.randint(1, 20_000), rng.randint(1, 20_000)) for _ in range(12_000)]
    tests.append({"input": fmt_graph_unweighted(20_000, e14), "hidden": True})

    # Test 15: Dense shuffled DAG N=5000, M=13000
    perm15 = list(range(1, 5001))
    rng.shuffle(perm15)
    e15 = []
    for _ in range(13_000):
        a, b = sorted(rng.sample(range(5000), 2))
        e15.append((perm15[a], perm15[b]))
    tests.append({"input": fmt_graph_unweighted(5000, e15), "hidden": True})

    # Test 16: Mixed multi-edges + self-loops + many components N=15000, M=12500
    e16 = [(i, i + 1) for i in range(1, 10_000)]
    for _ in range(2500):
        u = rng.randint(1, 15_000)
        v = rng.randint(1, 15_000)
        e16.append((u, v))
    tests.append({"input": fmt_graph_unweighted(15_000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 25)
        m = rng.randint(0, 45)
        edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_graph_unweighted(n, edges))

    statement = r"""Cho đồ thị có hướng gồm $N$ đỉnh (đánh số từ $1$ đến $N$) và $M$ cung có hướng $(u \to v)$. Đồ thị có thể không liên thông, có thể chứa đa cung và khuyên (cung $u \to u$).

Sử dụng giải thuật **Kahn** (liên tục lấy ra các đỉnh có bậc vào bằng $0$ và xóa các cung đi ra từ đỉnh đó):
1. Kiểm tra xem đồ thị có chứa chu trình có hướng hay không (`YES` nếu có chu trình, `NO` nếu là DAG).
2. Đếm số lượng đỉnh **không thể** xuất hiện trong bất kỳ thứ tự Topo hợp lệ nào — tức các đỉnh bị kẹt (không bao giờ đạt bậc vào bằng $0$ trong quá trình Kahn, bằng $N - \text{số đỉnh được Kahn lấy ra}$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 20\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cung có hướng $u \to v$.

### Kết quả
- In ra trên một dòng gồm chuỗi `YES` hoặc `NO`, theo sau bởi một dấu cách và số nguyên là số lượng đỉnh bị kẹt ($0$ nếu kết quả là `NO`).

### Ràng buộc
- $1 \le N \le 20\,000$
- $0 \le M \le 30\,000$
- $1 \le u, v \le N$

### Subtasks
- **Subtask 1 (30%):** $N \le 100$, $M \le 300$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đỉnh $1$ có bậc vào $0$ nên được Kahn lấy ra, nhưng sau đó $2, 3, 4$ tạo thành chu trình $2 \to 3 \to 4 \to 2$ và kéo theo đỉnh $5$ cũng có bậc vào luôn $\ge 1$. Vậy có $4$ đỉnh bị kẹt (`YES 4`).
- **Ví dụ 2:** Đồ thị là DAG, cả $4$ đỉnh đều được lấy ra (`NO 0`).
- **Ví dụ 3:** Khuyên $2 \to 2$ giữ cho $2$ không bao giờ có bậc vào $0$, làm $3$ cũng bị kẹt theo ($1$ và $4$ lấy ra được). Còn lại $2$ đỉnh bị kẹt (`YES 2`)."""

    hints = r"""**Gợi ý 1 (Ý tưởng giải thuật Kahn):**
Một đỉnh chỉ có thể đứng ở đầu phần đồ thị còn lại nếu nó không còn điều kiện tiên quyết nào (bậc vào `indeg[u] == 0`).

**Gợi ý 2 (Quy trình thực hiện):**
1. Tính `indeg[v]` cho mọi đỉnh $v$ (nếu có đa cung thì cộng đủ số lần xuất hiện).
2. Đưa tất cả đỉnh có `indeg[u] == 0` vào hàng đợi.
3. Lặp: lấy `u` ra, tăng biến đếm `popped`, rồi với mỗi cung `u -> v`, giảm `indeg[v]` đi $1$; nếu `indeg[v] == 0`, đưa `v` vào hàng đợi.

**Gợi ý 3 (Kết luận từ biến đếm):**
Số đỉnh bị kẹt chính xác là $N - \text{popped}$. Đồ thị có chu trình khi và chỉ khi `popped < N` (tức số đỉnh bị kẹt $> 0$)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<vector<int>> adj(n + 1);
    vector<int> indeg(n + 1, 0);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        ++indeg[v];
    }

    vector<int> q;
    q.reserve(n);
    for (int i = 1; i <= n; ++i) {
        if (indeg[i] == 0) q.push_back(i);
    }

    for (size_t head = 0; head < q.size(); ++head) {
        int u = q[head];
        for (int v : adj[u]) {
            if (--indeg[v] == 0) {
                q.push_back(v);
            }
        }
    }

    int stuck = n - static_cast<int>(q.size());
    if (stuck == 0) {
        cout << "NO 0\n";
    } else {
        cout << "YES " << stuck << '\n';
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

    adj = [[] for _ in range(n + 1)]
    indeg = [0] * (n + 1)
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        indeg[v] += 1

    dq = deque(i for i in range(1, n + 1) if indeg[i] == 0)
    popped = 0
    while dq:
        u = dq.popleft()
        popped += 1
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                dq.append(v)

    stuck = n - popped
    if stuck == 0:
        sys.stdout.write("NO 0\n")
    else:
        sys.stdout.write(f"YES {stuck}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-directed-cycle-kahn",
        "title": "Phát hiện chu trình và đỉnh bị kẹt (Kahn Topo Sort)",
        "shortDescription": "Kiểm tra chu trình trên đồ thị có hướng và đếm số đỉnh không thể xếp Topo bằng giải thuật Kahn.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "topo sort", "chu trình", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M) với thuật toán Kahn.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp14-bellman-ford-neg-cycle
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    adj: List[List[Tuple[int, int]]] = [[] for _ in range(n + 1)]
    reach = [[False] * (n + 1) for _ in range(n + 1)]
    inf = 10**30
    dist = [[inf] * (n + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        reach[i][i] = True
        dist[i][i] = 0

    idx = 2
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))
        reach[u][v] = True
        if w < dist[u][v]:
            dist[u][v] = w

    for k in range(1, n + 1):
        for i in range(1, n + 1):
            if not reach[i][k]:
                continue
            for j in range(1, n + 1):
                if reach[k][j]:
                    reach[i][j] = True
                    if dist[i][k] + dist[k][j] < dist[i][j]:
                        dist[i][j] = dist[i][k] + dist[k][j]

    if not reach[1][n]:
        return "UNREACHABLE"
    for k in range(1, n + 1):
        if reach[1][k] and reach[k][n] and dist[k][k] < 0:
            return "NEG_INF"
    return str(dist[1][n])


def build_p05() -> dict:
    rng = random.Random(1405)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 5), (2, 3, -3), (3, 4, 2), (1, 4, 6)]
            ),
            "hidden": False,
            "expected": "4",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 1), (2, 3, -2), (3, 2, 1), (3, 4, 5)]
            ),
            "hidden": False,
            "expected": "NEG_INF",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 3), (2, 1, -5), (3, 4, 1)]
            ),
            "hidden": False,
            "expected": "UNREACHABLE",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_graph_weighted(
                5, [(1, 5, 10), (1, 2, 1), (2, 3, -2), (3, 2, 1)]
            ),
            "hidden": True,
            "expected": "10",  # negative cycle exists, reachable from 1, CANNOT reach 5!
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                5, [(1, 5, 7), (2, 3, -5), (3, 2, 1), (3, 5, 2)]
            ),
            "hidden": True,
            "expected": "7",  # negative cycle can reach 5, NOT reachable from 1!
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(1, []),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(1, [(1, 1, -1)]),
            "hidden": True,
            "expected": "NEG_INF",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, -1000000000), (2, 3, -1000000000), (3, 4, -1000000000)]
            ),
            "hidden": True,
            "expected": "-3000000000",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (N <= 400, M <= 2000)
    # Test 9: Medium random with mostly non-negative + few small negatives
    e9 = [(rng.randint(1, 35), rng.randint(1, 35), rng.randint(-5, 30)) for _ in range(90)]
    tests.append({"input": fmt_graph_weighted(35, e9), "hidden": True, "checkBrute": True})

    # Test 10: Medium DAG with large negative & positive weights
    e10 = []
    for i in range(1, 45):
        e10.append((i, i + 1, rng.randint(-10**9, 10**9)))
        if i + 2 <= 45:
            e10.append((i, i + 2, rng.randint(-10**9, 10**9)))
    tests.append({"input": fmt_graph_weighted(45, e10), "hidden": True, "checkBrute": True})

    # Test 11: Max N=400 chain in reverse vertex order (worst-case Bellman-Ford)
    perm11 = [1] + list(range(399, 1, -1)) + [400]
    e11 = [(perm11[i], perm11[i + 1], -1_000_000_000) for i in range(399)]
    tests.append({"input": fmt_graph_weighted(400, e11), "hidden": True})

    # Test 12: N=400, M=2000 with negative cycle ONLY unreachable from 1 or not reaching N
    e12 = [(i, i + 1, rng.randint(-1000, 5000)) for i in range(1, 400)]
    # dead branch with negative cycle
    e12 += [(10, 399, 5), (399, 398, -10), (398, 399, 5)]  # Wait: 398<->399 net -5, can 399 reach 400? Yes if 399->400!
    # Let's keep 398/399 out of path to 400 by putting dead neg cycle on isolated 201..202
    e12 = [(i, i + 1, rng.randint(-1000, 5000)) for i in range(1, 200)] + [(200, 400, 10)]
    e12 += [(1, 201, 5), (201, 202, -10), (202, 201, 1)]  # reachable from 1, cannot reach 400
    e12 += [(203, 204, -10), (204, 203, 1), (204, 400, 5)]  # reaches 400, not reachable from 1
    while len(e12) < 2000:
        u = rng.randint(1, 199)
        v = rng.randint(u + 1, 200)
        e12.append((u, v, rng.randint(-1000, 5000)))
    tests.append({"input": fmt_graph_weighted(400, e12), "hidden": True})

    # Test 13: N=400, M=2000 with negative cycle ON path 1 -> ... -> N (long propagation)
    e13 = [(i, i + 1, 10) for i in range(1, 400)]
    e13 += [(150, 140, -200)]  # creates neg cycle 140..150, propagates through 151..400!
    while len(e13) < 2000:
        u = rng.randint(1, 399)
        v = rng.randint(u + 1, 400)
        e13.append((u, v, rng.randint(1, 1000)))
    tests.append({"input": fmt_graph_weighted(400, e13), "hidden": True})

    # Test 14: N=400, M=1800 UNREACHABLE
    e14 = [(rng.randint(1, 250), rng.randint(1, 250), rng.randint(-100, 100)) for _ in range(1200)]
    e14 += [(rng.randint(251, 400), rng.randint(251, 400), rng.randint(-100, 100)) for _ in range(600)]
    tests.append({"input": fmt_graph_weighted(400, e14), "hidden": True})

    # Test 15: N=400, M=2000 dense DAG with zero-weight cycles? No, zero-weight cycle + positive weights
    e15 = [(i, i + 1, 0) for i in range(1, 300)] + [(300, 1, 0)]
    for i in range(300, 400):
        e15.append((i, i + 1, rng.randint(1, 10**7)))
    while len(e15) < 2000:
        u = rng.randint(1, 399)
        v = rng.randint(u + 1, 400)
        e15.append((u, v, rng.randint(0, 10**7)))
    tests.append({"input": fmt_graph_weighted(400, e15), "hidden": True})

    # Test 16: N=400, M=2000 shuffled DAG with negative weights
    perm16 = list(range(2, 400))
    rng.shuffle(perm16)
    order16 = [1] + perm16 + [400]
    e16 = [(order16[i], order16[i + 1], rng.randint(-10**8, 10**8)) for i in range(399)]
    while len(e16) < 2000:
        a, b = sorted(rng.sample(range(400), 2))
        e16.append((order16[a], order16[b], rng.randint(-10**8, 10**8)))
    tests.append({"input": fmt_graph_weighted(400, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 18)
        m = rng.randint(0, 35)
        edges = [(rng.randint(1, n), rng.randint(1, n), rng.randint(-15, 25)) for _ in range(m)]
        extra_stress.append(fmt_graph_weighted(n, edges))

    statement = r"""Cho đồ thị có hướng gồm $N$ đỉnh (đánh số từ $1$ đến $N$) và $M$ cung có hướng, mỗi cung $(u \to v)$ có trọng số nguyên $w$ (có thể âm, bằng $0$ hoặc dương; có thể có đa cung và khuyên).

Hãy tìm độ dài đường đi ngắn nhất từ đỉnh $1$ đến đỉnh $N$:
- Nếu đỉnh $N$ không thể đi tới được từ đỉnh $1$, in `UNREACHABLE`.
- Nếu tồn tại đường đi từ $1$ đến $N$ có tổng trọng số giảm vô hạn về $-\infty$ (tức tồn tại chu trình âm vừa đi tới được từ $1$, vừa từ đó đi tới được $N$), in `NEG_INF`.
- Ngược lại, in ra một số nguyên là độ dài đường đi ngắn nhất từ $1$ đến $N$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 400$, $0 \le M \le 2000$).
- $M$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ ($1 \le u, v \le N$, $-10^9 \le w \le 10^9$).

### Kết quả
- In ra `UNREACHABLE`, `NEG_INF`, hoặc độ dài đường đi ngắn nhất từ $1$ đến $N$.

### Ràng buộc
- $1 \le N \le 400$
- $0 \le M \le 2000$
- $-10^9 \le w \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 40$, $M \le 150$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đường đi $1 \to 2 \to 3 \to 4$ có tổng trọng số $5 + (-3) + 2 = 4$, ngắn hơn cạnh trực tiếp $1 \to 4$ ($6$).
- **Ví dụ 2:** Chu trình $2 \to 3 \to 2$ có tổng trọng số $-1 < 0$, có thể đi tới từ $1$ và đi tiếp tới $4$, nên độ dài đường đi có thể nhỏ tùy ý (`NEG_INF`).
- **Ví dụ 3:** Dù có chu trình âm $1 \to 2 \to 1$, đỉnh $4$ không hề đi tới được từ $1$ nên đáp án là `UNREACHABLE`."""

    hints = r"""**Gợi ý 1 (Bellman-Ford $N - 1$ vòng):**
Khởi tạo `dist[1] = 0`, các đỉnh khác bằng `INF` ($4 \cdot 10^{18}$). Thực hiện $N - 1$ vòng nới lỏng tất cả $M$ cung (chỉ nới lỏng khi `dist[u] < INF`). Sau $N - 1$ vòng, nếu `dist[N] == INF` thì kết quả là `UNREACHABLE`.

**Gợi ý 2 (Cẩn thận bẫy chu trình âm):**
Không phải cứ có chu trình âm là đáp án `NEG_INF`! Chu trình âm có thể nằm ở nhánh cụt (từ $1$ vào được nhưng không ra được $N$) hoặc không đi tới được từ $1$.

**Gợi ý 3 (Vòng lặp thứ $N$ + BFS kiểm tra tới $N$):**
Chạy thêm vòng nới lỏng thứ $N$: mọi đỉnh `v` còn được giảm `dist[v]` ở vòng này chắc chắn nằm trên hoặc bị ảnh hưởng bởi một chu trình âm đi tới được từ $1$. Đưa tất cả các đỉnh `v` đó vào hàng đợi và chạy **BFS/DFS** theo các cung có hướng: nếu chạm tới được đỉnh $N$ thì đáp án là `NEG_INF`, ngược lại in `dist[N]`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Edge {
    int u, v;
    long long w;
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<Edge> edges(m);
    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        cin >> edges[i].u >> edges[i].v >> edges[i].w;
        adj[edges[i].u].push_back(edges[i].v);
    }

    const long long INF = 4000000000000000000LL;
    vector<long long> dist(n + 1, INF);
    dist[1] = 0;

    for (int iter = 1; iter <= n - 1; ++iter) {
        bool changed = false;
        for (const auto& e : edges) {
            if (dist[e.u] < INF && dist[e.u] + e.w < dist[e.v]) {
                dist[e.v] = dist[e.u] + e.w;
                changed = true;
            }
        }
        if (!changed) break;
    }

    if (dist[n] >= INF) {
        cout << "UNREACHABLE\n";
        return 0;
    }

    vector<char> vis(n + 1, 0);
    vector<int> q;
    for (const auto& e : edges) {
        if (dist[e.u] < INF && dist[e.u] + e.w < dist[e.v]) {
            if (!vis[e.v]) {
                vis[e.v] = 1;
                q.push_back(e.v);
            }
        }
    }

    for (size_t head = 0; head < q.size(); ++head) {
        int u = q[head];
        for (int v : adj[u]) {
            if (!vis[v]) {
                vis[v] = 1;
                q.push_back(v);
            }
        }
    }

    if (vis[n]) {
        cout << "NEG_INF\n";
    } else {
        cout << dist[n] << '\n';
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

    edges = []
    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        edges.append((u, v, w))
        adj[u].append(v)

    inf = 4 * 10**18
    dist = [inf] * (n + 1)
    dist[1] = 0

    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            du = dist[u]
            if du < inf and du + w < dist[v]:
                dist[v] = du + w
                changed = True
        if not changed:
            break

    if dist[n] >= inf:
        sys.stdout.write("UNREACHABLE\n")
        return

    vis = bytearray(n + 1)
    dq = deque()
    for u, v, w in edges:
        du = dist[u]
        if du < inf and du + w < dist[v]:
            if not vis[v]:
                vis[v] = 1
                dq.append(v)

    while dq:
        u = dq.popleft()
        if u == n:
            sys.stdout.write("NEG_INF\n")
            return
        for v in adj[u]:
            if not vis[v]:
                vis[v] = 1
                dq.append(v)

    sys.stdout.write(f"{dist[n]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-bellman-ford-neg-cycle",
        "title": "Đường đi ngắn nhất và chu trình âm (Bellman-Ford)",
        "shortDescription": "Tìm đường đi ngắn nhất từ 1 đến N hoặc phát hiện chu trình âm làm đường đi giảm vô hạn.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "bellman-ford", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N * M) với Bellman-Ford.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp14-tarjan-bridges-articulation
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    edges: List[Tuple[int, int]] = []
    idx = 2
    for _ in range(m):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        edges.append((u, v))

    def count_comp(skip_node: int = 0, skip_edge: int = -1) -> int:
        adj: List[List[int]] = [[] for _ in range(n + 1)]
        for ei, (u, v) in enumerate(edges):
            if ei == skip_edge or u == skip_node or v == skip_node:
                continue
            adj[u].append(v)
            adj[v].append(u)
        vis = [False] * (n + 1)
        comp = 0
        for i in range(1, n + 1):
            if i == skip_node or vis[i]:
                continue
            comp += 1
            vis[i] = True
            q = deque([i])
            while q:
                u = q.popleft()
                for v in adj[u]:
                    if not vis[v]:
                        vis[v] = True
                        q.append(v)
        return comp

    base = count_comp()
    arts = sum(1 for x in range(1, n + 1) if count_comp(skip_node=x) > base)
    bridges = sum(1 for ei in range(m) if count_comp(skip_edge=ei) > base)
    return f"{arts} {bridges}"


def build_p06() -> dict:
    rng = random.Random(1406)

    def simple_random_edges(n: int, target_m: int) -> List[Tuple[int, int]]:
        seen: Set[Tuple[int, int]] = set()
        out: List[Tuple[int, int]] = []
        attempts = 0
        max_possible = n * (n - 1) // 2
        goal = min(target_m, max_possible)
        while len(out) < goal and attempts < goal * 10 + 100:
            attempts += 1
            u = rng.randint(1, n)
            v = rng.randint(1, n)
            if u == v:
                continue
            a, b = (u, v) if u < v else (v, u)
            if (a, b) not in seen:
                seen.add((a, b))
                out.append((a, b))
        return out

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_unweighted(
                6, [(1, 2), (2, 3), (3, 1), (3, 4), (4, 5), (5, 6), (6, 4)]
            ),
            "hidden": False,
            "expected": "2 1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                5, [(1, 2), (2, 3), (3, 4), (4, 5)]
            ),
            "hidden": False,
            "expected": "3 4",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                5, [(1, 2), (2, 3), (3, 4), (4, 1), (1, 3), (2, 4)]
            ),
            "hidden": False,
            "expected": "0 0",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_graph_unweighted(1, []), "hidden": True, "expected": "0 0", "checkBrute": True},
        {"input": fmt_graph_unweighted(2, [(1, 2)]), "hidden": True, "expected": "0 1", "checkBrute": True},
        {
            "input": fmt_graph_unweighted(
                7, [(1, 2), (1, 3), (1, 4), (2, 3), (4, 5), (5, 6), (6, 4)]
            ),
            "hidden": True,
            "expected": "2 1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                7, [(1, 2), (2, 3), (3, 1), (1, 4), (4, 5), (5, 1), (1, 6), (6, 7), (7, 1)]
            ),
            "hidden": True,
            "expected": "1 0",  # bowtie-3: vertex 1 is articulation point, 0 bridges!
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                8, [(1, 2), (2, 3), (3, 1), (4, 5), (6, 7), (7, 8)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (strictly simple undirected graphs, < 148 KB)
    tests.append({"input": fmt_graph_unweighted(35, simple_random_edges(35, 60)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_graph_unweighted(50, simple_random_edges(50, 75)), "hidden": True, "checkBrute": True})

    # Test 11: Deep chain N=15000, M=14999 (kills recursive Tarjan!)
    # Note: 14999 edges ~ 14999 * 11 ~ 165KB! Watch size: use 12000 chain (< 132KB)!
    # Wait: let's test N=15000 with chain of 11500 + isolated vertices -> ~125KB!
    e11 = [(i, i + 1) for i in range(1, 11_500)]
    tests.append({"input": fmt_graph_unweighted(15_000, e11), "hidden": True})

    # Test 12: Shuffled deep chain N=12000
    perm12 = list(range(1, 12_001))
    rng.shuffle(perm12)
    e12 = [(perm12[i], perm12[i + 1]) for i in range(11_999)]
    tests.append({"input": fmt_graph_unweighted(12_000, e12), "hidden": True})

    # Test 13: Many triangles/biconnected blocks joined by bridges N=11000
    e13 = []
    for base in range(1, 10_990, 4):
        e13.extend([(base, base + 1), (base + 1, base + 2), (base + 2, base)])
        if base + 3 <= 11_000:
            e13.append((base + 2, base + 3))
        if base + 4 <= 11_000:
            e13.append((base + 3, base + 4))
    tests.append({"input": fmt_graph_unweighted(11_000, e13), "hidden": True})

    # Test 14: Random simple graph N=15000, M=12000
    tests.append({"input": fmt_graph_unweighted(15_000, simple_random_edges(15_000, 12_000)), "hidden": True})

    # Test 15: Flower of 3-cycles sharing vertex 1 (1 articulation, 0 bridges) N=8001, M=12000
    e15 = []
    for v in range(2, 8001, 2):
        e15.extend([(1, v), (v, v + 1), (v + 1, 1)])
    tests.append({"input": fmt_graph_unweighted(8001, e15), "hidden": True})

    # Test 16: Grid-like 100x100 with bridge-connected sub-grids (N=10000, ~13000 edges? Wait 13000*10=130KB)
    # Use 80x80 grid (N=6400, M = 2*79*80 = 12640 edges ~ 125KB) with a few edges removed
    e16 = []
    for r in range(80):
        for c in range(80):
            u = r * 80 + c + 1
            if c + 1 < 80:
                e16.append((u, u + 1))
            if r + 1 < 80 and (c == 0 or r % 10 != 5):
                e16.append((u, u + 80))
    tests.append({"input": fmt_graph_unweighted(6400, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 20)
        m = rng.randint(0, min(35, n * (n - 1) // 2))
        extra_stress.append(fmt_graph_unweighted(n, simple_random_edges(n, m)))

    statement = r"""Cho đơn đồ thị vô hướng gồm $N$ đỉnh đánh số từ $1$ đến $N$ và $M$ cạnh (không có khuyên, không có đa cạnh; đồ thị có thể không liên thông).

Trong đồ thị vô hướng:
- Một đỉnh $u$ được gọi là **đỉnh khớp** (articulation point) nếu việc xóa đỉnh $u$ (cùng các cạnh kề với nó) làm tăng số thành phần liên thông của đồ thị.
- Một cạnh $e$ được gọi là **cạnh cầu** (bridge) nếu việc xóa cạnh $e$ làm tăng số thành phần liên thông của đồ thị.

Hãy đếm tổng số đỉnh khớp và tổng số cạnh cầu của đồ thị đã cho.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 15\,000$, $0 \le M \le 25\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$, $u \ne v$) biểu diễn một cạnh vô hướng. Dữ liệu đảm bảo không có hai cạnh nào nối cùng một cặp đỉnh.

### Kết quả
- In ra trên một dòng hai số nguyên cách nhau bởi một dấu cách: số lượng đỉnh khớp và số lượng cạnh cầu.

### Ràng buộc
- $1 \le N \le 15\,000$
- $0 \le M \le 25\,000$
- Đơn đồ thị vô hướng.

### Subtasks
- **Subtask 1 (30%):** $N \le 60$, $M \le 100$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đồ thị gồm hai tam giác $(1,2,3)$ và $(4,5,6)$ nối với nhau qua cạnh $(3,4)$. Có $2$ đỉnh khớp là $3, 4$ và $1$ cạnh cầu là $(3,4)$.
- **Ví dụ 2:** Đường thẳng $1-2-3-4-5$: ba đỉnh giữa $2, 3, 4$ là đỉnh khớp, cả $4$ cạnh đều là cạnh cầu.
- **Ví dụ 3:** Đồ thị đầy đủ $K_4$ cùng đỉnh cô lập $5$: không có đỉnh khớp, không có cạnh cầu (`0 0`)."""

    hints = r"""**Gợi ý 1 (Ý tưởng Tarjan với `tin` và `low`):**
Khi chạy DFS trên từng thành phần liên thông, gán `tin[u]` là thời điểm thăm đỉnh `u` và `low[u]` là giá trị `tin` nhỏ nhất có thể đi tới từ cây con gốc `u` (qua tối đa một cạnh ngược).

**Gợi ý 2 (Điều kiện khớp & cầu):**
Với cạnh cây DFS `(p -> u)`:
- `(p, u)` là **cạnh cầu** khi và chỉ khi `low[u] > tin[p]`.
- Nếu `p` **không phải gốc** cây DFS: `p` là **đỉnh khớp** khi tồn tại ít nhất một con `u` thỏa `low[u] >= tin[p]` (chú ý chỉ đánh dấu `is_art[p] = 1`, không đếm trùng nhiều lần!).
- Nếu `p` **là gốc** cây DFS: `p` là **đỉnh khớp** khi và chỉ khi `p` có từ $2$ nhánh con trực tiếp trở lên trong cây DFS.

**Gợi ý 3 (Tránh tràn ngăn xếp khi cài đặt):**
Với $N$ lên tới $15\,000$ và đồ thị dạng đường thẳng dài, DFS đệ quy trong Python sẽ gây lỗi `RecursionError`. Hãy tự quản lý khung gọi hàm `(u, parent, edge_idx)` bằng một **ngăn xếp lặp (`stack`)**."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> tin(n + 1, 0), low(n + 1, 0);
    vector<char> isArt(n + 1, 0);
    int timer = 0;
    int bridges = 0;

    struct Frame {
        int u, p, idx;
    };
    vector<Frame> st;

    for (int root = 1; root <= n; ++root) {
        if (tin[root]) continue;
        tin[root] = low[root] = ++timer;
        int rootChildren = 0;
        st.push_back({root, 0, 0});

        while (!st.empty()) {
            Frame& top = st.back();
            int u = top.u;
            int p = top.p;
            if (top.idx < static_cast<int>(adj[u].size())) {
                int v = adj[u][top.idx++];
                if (v == p) continue;
                if (tin[v]) {
                    if (tin[v] < low[u]) low[u] = tin[v];
                } else {
                    if (u == root) ++rootChildren;
                    tin[v] = low[v] = ++timer;
                    st.push_back({v, u, 0});
                }
            } else {
                st.pop_back();
                if (p != 0) {
                    if (low[u] < low[p]) low[p] = low[u];
                    if (low[u] > tin[p]) ++bridges;
                    if (p != root && low[u] >= tin[p]) isArt[p] = 1;
                }
            }
        }
        if (rootChildren > 1) isArt[root] = 1;
    }

    int artCount = 0;
    for (int i = 1; i <= n; ++i) artCount += isArt[i];

    cout << artCount << ' ' << bridges << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    tin = [0] * (n + 1)
    low = [0] * (n + 1)
    is_art = bytearray(n + 1)
    timer = 0
    bridges = 0

    for root in range(1, n + 1):
        if tin[root]:
            continue
        timer += 1
        tin[root] = low[root] = timer
        root_children = 0
        stack = [[root, 0, 0]]
        while stack:
            top = stack[-1]
            u = top[0]
            p = top[1]
            i = top[2]
            nbrs = adj[u]
            if i < len(nbrs):
                v = nbrs[i]
                top[2] = i + 1
                if v == p:
                    continue
                if tin[v]:
                    if tin[v] < low[u]:
                        low[u] = tin[v]
                else:
                    if u == root:
                        root_children += 1
                    timer += 1
                    tin[v] = low[v] = timer
                    stack.append([v, u, 0])
            else:
                stack.pop()
                if p != 0:
                    if low[u] < low[p]:
                        low[p] = low[u]
                    if low[u] > tin[p]:
                        bridges += 1
                    if p != root and low[u] >= tin[p]:
                        is_art[p] = 1
        if root_children > 1:
            is_art[root] = 1

    sys.stdout.write(f"{sum(is_art)} {bridges}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-tarjan-bridges-articulation",
        "title": "Đếm đỉnh khớp và cạnh cầu (Tarjan lặp)",
        "shortDescription": "Đếm số đỉnh khớp và số cạnh cầu trên đơn đồ thị vô hướng bằng thuật toán Tarjan dạng lặp.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "tarjan", "khớp cầu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M), dùng Tarjan lặp tránh tràn ngăn xếp.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp14-scc-make-strongly-connected
# ============================================================================

def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    adj: List[List[int]] = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        adj[u].append(v)

    reach = [[False] * (n + 1) for _ in range(n + 1)]
    for s in range(1, n + 1):
        reach[s][s] = True
        q = deque([s])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if not reach[s][v]:
                    reach[s][v] = True
                    q.append(v)

    comp = [0] * (n + 1)
    scc = 0
    for i in range(1, n + 1):
        if comp[i]:
            continue
        scc += 1
        for j in range(1, n + 1):
            if reach[i][j] and reach[j][i]:
                comp[j] = scc

    if scc == 1:
        return "1 0"

    has_in = [False] * (scc + 1)
    has_out = [False] * (scc + 1)
    for u in range(1, n + 1):
        cu = comp[u]
        for v in adj[u]:
            cv = comp[v]
            if cu != cv:
                has_out[cu] = True
                has_in[cv] = True

    in0 = sum(1 for c in range(1, scc + 1) if not has_in[c])
    out0 = sum(1 for c in range(1, scc + 1) if not has_out[c])
    return f"{scc} {max(in0, out0)}"


def build_p07() -> dict:
    rng = random.Random(1407)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_unweighted(
                5, [(1, 2), (2, 1), (2, 3), (3, 4), (4, 5), (5, 3)]
            ),
            "hidden": False,
            "expected": "2 1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                4, [(1, 2), (2, 3), (3, 4), (4, 1)]
            ),
            "hidden": False,
            "expected": "1 0",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                5, [(1, 2), (1, 3), (1, 4), (5, 2)]
            ),
            "hidden": False,
            "expected": "5 3",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_graph_unweighted(1, []), "hidden": True, "expected": "1 0", "checkBrute": True},
        {"input": fmt_graph_unweighted(5, []), "hidden": True, "expected": "5 5", "checkBrute": True},
        {
            "input": fmt_graph_unweighted(
                4, [(1, 1), (2, 2), (1, 2), (1, 2), (3, 4), (4, 3)]
            ),
            "hidden": True,
            "expected": "3 2",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                6, [(1, 2), (2, 3), (4, 5), (5, 6), (6, 4)]
            ),
            "hidden": True,
            "expected": "4 2",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                6, [(1, 2), (2, 3), (3, 1), (4, 1), (5, 1), (6, 1)]
            ),
            "hidden": True,
            "expected": "4 3",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    tests.append(
        {
            "input": fmt_graph_unweighted(
                40, [(rng.randint(1, 40), rng.randint(1, 40)) for _ in range(90)]
            ),
            "hidden": True,
            "checkBrute": True,
        }
    )
    tests.append(
        {
            "input": fmt_graph_unweighted(
                60, [(rng.randint(1, 60), rng.randint(1, 60)) for _ in range(130)]
            ),
            "hidden": True,
            "checkBrute": True,
        }
    )

    # Test 11: Deep chain N=12000 (kills recursive Tarjan/Kosaraju)
    e11 = [(i, i + 1) for i in range(1, 12_000)]
    tests.append({"input": fmt_graph_unweighted(12_000, e11), "hidden": True})

    # Test 12: One giant cycle N=12000 (1 SCC -> 0 edges)
    perm12 = list(range(1, 12_001))
    rng.shuffle(perm12)
    e12 = [(perm12[i], perm12[(i + 1) % 12_000]) for i in range(12_000)]
    tests.append({"input": fmt_graph_unweighted(12_000, e12), "hidden": True})

    # Test 13: Many small SCCs in a tree-like DAG N=15000, M=12000
    e13 = []
    for base in range(1, 10_000, 5):
        for k in range(5):
            e13.append((base + k, base + (k + 1) % 5))
    for base in range(6, 10_000, 5):
        parent_base = ((base // 5) // 2) * 5 + 1
        e13.append((parent_base, base))
    tests.append({"input": fmt_graph_unweighted(15_000, e13), "hidden": True})

    # Test 14: Random directed N=15000, M=12500
    e14 = [(rng.randint(1, 15_000), rng.randint(1, 15_000)) for _ in range(12_500)]
    tests.append({"input": fmt_graph_unweighted(15_000, e14), "hidden": True})

    # Test 15: Two giant SCCs connected one-way + isolated nodes
    e15 = [(i, i + 1) for i in range(1, 4000)] + [(4000, 1)]
    e15 += [(i, i + 1) for i in range(4001, 8000)] + [(8000, 4001)]
    e15 += [(2000, 6000)]
    tests.append({"input": fmt_graph_unweighted(10_000, e15), "hidden": True})

    # Test 16: Star out + star in across SCCs N=12000, M=12000
    e16 = [(1, i) for i in range(2, 6001)] + [(i, 12000) for i in range(6001, 12000)]
    tests.append({"input": fmt_graph_unweighted(12_000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 22)
        m = rng.randint(0, 45)
        edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_graph_unweighted(n, edges))

    statement = r"""Cho đồ thị có hướng gồm $N$ đỉnh đánh số từ $1$ đến $N$ và $M$ cung có hướng $(u \to v)$. Đồ thị có thể không liên thông, có thể chứa đa cung và khuyên.

Một tập đỉnh tạo thành một **thành phần liên thông mạnh (SCC)** tối đại nếu từ mọi đỉnh trong tập đều đi tới được mọi đỉnh khác trong tập. Toàn bộ đồ thị được gọi là **liên thông mạnh** nếu chỉ có đúng $1$ SCC duy nhất.

Hãy xác định:
1. Số lượng thành phần liên thông mạnh (SCC) của đồ thị.
2. Số lượng cung có hướng **ít nhất** cần thêm vào đồ thị để toàn bộ đồ thị trở thành liên thông mạnh.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 15\,000$, $0 \le M \le 25\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn cung có hướng $u \to v$.

### Kết quả
- In ra trên một dòng hai số nguyên cách nhau bởi một dấu cách: số lượng SCC và số lượng cung ít nhất cần thêm.

### Ràng buộc
- $1 \le N \le 15\,000$
- $0 \le M \le 25\,000$
- $1 \le u, v \le N$

### Subtasks
- **Subtask 1 (30%):** $N \le 60$, $M \le 150$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Có $2$ SCC là $\{1, 2\}$ và $\{3, 4, 5\}$, với cung $2 \to 3$. Chỉ cần thêm $1$ cung $3 \to 1$ là toàn đồ thị liên thông mạnh (`2 1`).
- **Ví dụ 2:** Chu trình $1 \to 2 \to 3 \to 4 \to 1$ đã liên thông mạnh sẵn (`1 0`).
- **Ví dụ 3:** Có $5$ SCC rời rạc, trên DAG nén có $2$ đỉnh nguồn ($1, 5$) có bậc vào bằng $0$ và $3$ đỉnh đích ($2, 3, 4$) có bậc ra bằng $0$. Cần ít nhất $\max(2, 3) = 3$ cung để nối thành một SCC duy nhất."""

    hints = r"""**Gợi ý 1 (Nén đồ thị thành DAG):**
Dùng thuật toán Tarjan (hoặc Kosaraju) **dạng lặp** để tìm các thành phần liên thông mạnh và gán nhãn `comp[u]` cho mỗi đỉnh. Khi co mỗi SCC thành một siêu đỉnh, ta thu được một đồ thị có hướng không chu trình (DAG).

**Gợi ý 2 (Công thức trên DAG nén):**
- Nếu số SCC là $1$: đồ thị đã liên thông mạnh nên cần thêm $0$ cung.
- Nếu số SCC $> 1$: gọi `in0` là số SCC có bậc vào bằng $0$ (không có cung nào từ SCC khác đi vào nó), `out0` là số SCC có bậc ra bằng $0$. Để mọi đỉnh đều có đường vào và đường ra khỏi SCC của mình, ta cần ít nhất $\max(\text{in0}, \text{out0})$ cung (và luôn ghép được bằng đúng $\max(\text{in0}, \text{out0})$ cung).

**Gợi ý 3 (Lưu ý cài đặt):**
Chỉ xét các cung `(u -> v)` có `comp[u] != comp[v]` để đánh dấu `has_out[comp[u]]` và `has_in[comp[v]]`; không cần lo về đa cung khi dùng cờ boolean."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
    }

    vector<int> tin(n + 1, 0), low(n + 1, 0), comp(n + 1, 0);
    vector<char> onStack(n + 1, 0);
    vector<int> sccStack;
    sccStack.reserve(n);

    struct Frame {
        int u, idx;
    };
    vector<Frame> dfsStack;
    int timer = 0;
    int sccCount = 0;

    for (int root = 1; root <= n; ++root) {
        if (tin[root]) continue;
        tin[root] = low[root] = ++timer;
        onStack[root] = 1;
        sccStack.push_back(root);
        dfsStack.push_back({root, 0});

        while (!dfsStack.empty()) {
            Frame& top = dfsStack.back();
            int u = top.u;
            if (top.idx < static_cast<int>(adj[u].size())) {
                int v = adj[u][top.idx++];
                if (!tin[v]) {
                    tin[v] = low[v] = ++timer;
                    onStack[v] = 1;
                    sccStack.push_back(v);
                    dfsStack.push_back({v, 0});
                } else if (onStack[v]) {
                    if (tin[v] < low[u]) low[u] = tin[v];
                }
            } else {
                dfsStack.pop_back();
                if (!dfsStack.empty()) {
                    int p = dfsStack.back().u;
                    if (low[u] < low[p]) low[p] = low[u];
                }
                if (low[u] == tin[u]) {
                    ++sccCount;
                    while (true) {
                        int w = sccStack.back();
                        sccStack.pop_back();
                        onStack[w] = 0;
                        comp[w] = sccCount;
                        if (w == u) break;
                    }
                }
            }
        }
    }

    if (sccCount == 1) {
        cout << "1 0\n";
        return 0;
    }

    vector<char> hasIn(sccCount + 1, 0), hasOut(sccCount + 1, 0);
    for (int u = 1; u <= n; ++u) {
        int cu = comp[u];
        for (int v : adj[u]) {
            int cv = comp[v];
            if (cu != cv) {
                hasOut[cu] = 1;
                hasIn[cv] = 1;
            }
        }
    }

    int in0 = 0, out0 = 0;
    for (int c = 1; c <= sccCount; ++c) {
        if (!hasIn[c]) ++in0;
        if (!hasOut[c]) ++out0;
    }

    cout << sccCount << ' ' << max(in0, out0) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    m = int(data[1])

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)

    tin = [0] * (n + 1)
    low = [0] * (n + 1)
    comp = [0] * (n + 1)
    on_stack = bytearray(n + 1)
    scc_stack = []
    timer = 0
    scc_count = 0

    for root in range(1, n + 1):
        if tin[root]:
            continue
        timer += 1
        tin[root] = low[root] = timer
        on_stack[root] = 1
        scc_stack.append(root)
        dfs_stack = [[root, 0]]

        while dfs_stack:
            top = dfs_stack[-1]
            u = top[0]
            i = top[1]
            nbrs = adj[u]
            if i < len(nbrs):
                v = nbrs[i]
                top[1] = i + 1
                if not tin[v]:
                    timer += 1
                    tin[v] = low[v] = timer
                    on_stack[v] = 1
                    scc_stack.append(v)
                    dfs_stack.append([v, 0])
                elif on_stack[v]:
                    if tin[v] < low[u]:
                        low[u] = tin[v]
            else:
                dfs_stack.pop()
                if dfs_stack:
                    p = dfs_stack[-1][0]
                    if low[u] < low[p]:
                        low[p] = low[u]
                if low[u] == tin[u]:
                    scc_count += 1
                    while True:
                        w = scc_stack.pop()
                        on_stack[w] = 0
                        comp[w] = scc_count
                        if w == u:
                            break

    if scc_count == 1:
        sys.stdout.write("1 0\n")
        return

    has_in = bytearray(scc_count + 1)
    has_out = bytearray(scc_count + 1)
    for u in range(1, n + 1):
        cu = comp[u]
        for v in adj[u]:
            cv = comp[v]
            if cu != cv:
                has_out[cu] = 1
                has_in[cv] = 1

    in0 = scc_count - sum(has_in)
    out0 = scc_count - sum(has_out)
    ans = in0 if in0 > out0 else out0
    sys.stdout.write(f"{scc_count} {ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-scc-make-strongly-connected",
        "title": "Mở rộng đồ thị thành liên thông mạnh (SCC)",
        "shortDescription": "Tìm số thành phần liên thông mạnh và số cung ít nhất cần thêm để cả đồ thị liên thông mạnh.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "tarjan", "scc", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M), dùng Tarjan/Kosaraju lặp.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp14-second-shortest-path
# ============================================================================

def brute_p08(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    adj: List[List[Tuple[int, int]]] = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    # Independent state-tracking Dijkstra recording distinct popped lengths per vertex
    distinct: List[List[int]] = [[] for _ in range(n + 1)]
    pq = [(0, 1)]
    while pq:
        d, u = heapq.heappop(pq)
        du = distinct[u]
        if len(du) >= 2:
            continue
        if du and du[-1] == d:
            continue
        du.append(d)
        if u == n and len(du) == 2:
            return str(du[1])
        for v, w in adj[u]:
            if len(distinct[v]) < 2:
                heapq.heappush(pq, (d + w, v))
    return "-1"


def build_p08() -> dict:
    rng = random.Random(1408)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 100), (2, 4, 200), (2, 3, 250), (3, 4, 100)]
            ),
            "hidden": False,
            "expected": "450",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                3, [(1, 2, 5), (2, 3, 5), (1, 3, 10)]
            ),
            "hidden": False,
            "expected": "20",  # 1->3 has length 10 (twice!), next strictly greater is 20 (1->2->1->3 or 1->3->2->3)
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 3), (2, 1, 4), (3, 4, 5)]
            ),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        # 5 corner cases
        {"input": fmt_graph_weighted(1, []), "hidden": True, "expected": "-1", "checkBrute": True},
        {
            "input": fmt_graph_weighted(1, [(1, 1, 7)]),
            "hidden": True,
            "expected": "7",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(2, [(1, 2, 1000000000)]),
            "hidden": True,
            "expected": "3000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 4), (1, 2, 6), (2, 4, 5), (1, 3, 4), (3, 4, 5)]
            ),
            "hidden": True,
            "expected": "11",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                5, [(1, 2, 10), (2, 5, 10), (1, 3, 5), (3, 4, 5), (4, 5, 10), (2, 3, 1)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    tests.append(
        {
            "input": fmt_graph_weighted(
                30, [(rng.randint(1, 30), rng.randint(1, 30), rng.randint(1, 50)) for _ in range(70)]
            ),
            "hidden": True,
            "checkBrute": True,
        }
    )
    tests.append(
        {
            "input": fmt_graph_weighted(
                50, [(rng.randint(1, 50), rng.randint(1, 50), rng.randint(1, 1000)) for _ in range(120)]
            ),
            "hidden": True,
            "checkBrute": True,
        }
    )

    # Test 11: Long chain N=7000 with huge 1e9 weights
    e11 = [(i, i + 1, 1_000_000_000) for i in range(1, 7000)]
    tests.append({"input": fmt_graph_weighted(7000, e11), "hidden": True})

    # Test 12: N=12000 disconnected
    e12 = [(rng.randint(1, 6000), rng.randint(1, 6000), rng.randint(1, 10**6)) for _ in range(4000)]
    e12 += [(rng.randint(6001, 12_000), rng.randint(6001, 12_000), rng.randint(1, 10**6)) for _ in range(4000)]
    tests.append({"input": fmt_graph_weighted(12_000, e12), "hidden": True})

    # Test 13: Grid-like layered DAG + backward edges N=8000, M=10000
    e13 = [(i, i + 1, rng.randint(1, 1000)) for i in range(1, 8000)]
    for _ in range(2000):
        u = rng.randint(1, 8000)
        v = rng.randint(1, 8000)
        e13.append((u, v, rng.randint(1, 1000)))
    tests.append({"input": fmt_graph_weighted(8000, e13), "hidden": True})

    # Test 14: Random sparse N=12000, M=6500
    e14 = [(i, i + 1, rng.randint(1, 10**9)) for i in range(1, 3500)]
    e14 += [(rng.randint(1, 12_000), rng.randint(1, 12_000), rng.randint(1, 10**9)) for _ in range(3000)]
    e14.append((3500, 12_000, 777_777_777))
    tests.append({"input": fmt_graph_weighted(12_000, e14), "hidden": True})

    # Test 15: Many equal shortest paths (diamond chain) N=6000
    e15 = []
    cur = 1
    while cur + 3 <= 6000:
        e15.extend([(cur, cur + 1, 10), (cur, cur + 2, 10), (cur + 1, cur + 3, 10), (cur + 2, cur + 3, 10)])
        cur += 3
    e15.append((cur, 6000, 10))
    e15.append((1, 6000, 999_999))
    tests.append({"input": fmt_graph_weighted(6000, e15), "hidden": True})

    # Test 16: Dense small-weight random N=4000, M=10000
    e16 = [(i, i + 1, rng.randint(1, 50)) for i in range(1, 4000)]
    e16 += [(rng.randint(1, 4000), rng.randint(1, 4000), rng.randint(1, 100)) for _ in range(6000)]
    tests.append({"input": fmt_graph_weighted(4000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 18)
        m = rng.randint(0, 35)
        edges = [(rng.randint(1, n), rng.randint(1, n), rng.randint(1, 40)) for _ in range(m)]
        extra_stress.append(fmt_graph_weighted(n, edges))

    statement = r"""Cho đồ thị vô hướng gồm $N$ đỉnh đánh số từ $1$ đến $N$ và $M$ cạnh có trọng số nguyên dương. Đồ thị có thể không liên thông, có thể chứa đa cạnh và khuyên.

Một hành trình từ $1$ đến $N$ được phép đi lặp lại đỉnh và cạnh tùy ý (kể cả đi qua lại nhiều lần trên cùng một cạnh). Hãy tìm độ dài của hành trình **ngắn nhất thứ hai** từ $1$ đến $N$ — tức giá trị độ dài nhỏ nhất mà **lớn hơn hẳn** (strictly greater) độ dài đường đi ngắn nhất từ $1$ đến $N$. Nếu không tồn tại (chẳng hạn $N$ không đi tới được từ $1$ hoặc chỉ có duy nhất một độ dài hành trình), in `-1`.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 12\,000$, $0 \le M \le 20\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ ($1 \le u, v \le N$, $1 \le w \le 10^9$) biểu diễn cạnh vô hướng nối $u, v$ có trọng số $w$.

### Kết quả
- In ra một số nguyên duy nhất là độ dài đường đi ngắn nhất thứ hai từ $1$ đến $N$, hoặc `-1` nếu không tồn tại.

### Ràng buộc
- $1 \le N \le 12\,000$
- $0 \le M \le 20\,000$
- $1 \le w \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 50$, $M \le 150$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đường đi ngắn nhất là $1 \to 2 \to 4$ (độ dài $300$). Đường ngắn nhất thứ hai là $1 \to 2 \to 3 \to 4$ có độ dài $100 + 250 + 100 = 450$.
- **Ví dụ 2:** Có hai đường đi khác nhau cùng đạt độ dài nhỏ nhất $10$ ($1 \to 3$ và $1 \to 2 \to 3$), nhưng đề yêu cầu giá trị **lớn hơn hẳn** đường ngắn nhất, do đó đáp án là $20$ (ví dụ đi $1 \to 2 \to 1 \to 3$).
- **Ví dụ 3:** Đỉnh $4$ không liên thông với đỉnh $1$ nên in `-1`."""

    hints = r"""**Gợi ý 1 (Lưu 2 giá trị tốt nhất tại mỗi đỉnh):**
Với mỗi đỉnh $u$, ta chỉ cần duy trì hai giá trị:
- `dist1[u]`: độ dài hành trình ngắn nhất từ $1$ tới $u$.
- `dist2[u]`: độ dài hành trình ngắn nhất **thứ hai** (luôn thỏa `dist2[u] > dist1[u]`) từ $1$ tới $u$.

**Gợi ý 2 (Cập nhật trạng thái trong Dijkstra):**
Khi xét ứng viên độ dài `nd = d + w` tới đỉnh `v`:
1. Nếu `nd < dist1[v]`: hoán đổi `dist1[v]` và `nd`, đẩy `(dist1[v], v)` vào heap; khi đó giá trị `dist1[v]` cũ (đang giữ trong `nd`) trở thành ứng viên cho `dist2[v]`.
2. Nếu `dist1[v] < nd < dist2[v]`: cập nhật `dist2[v] = nd` và đẩy `(dist2[v], v)` vào heap.
3. Nếu `nd == dist1[v]`: bỏ qua vì ta cần giá trị **lớn hơn hẳn** `dist1[v]`.

**Gợi ý 3 (Tránh tràn số & lưu ý):**
Tổng độ dài có thể lớn hơn $2^{31}-1$ (ví dụ đi qua lại cạnh $10^9$ cho tổng $3 \cdot 10^9$), nên phải dùng `long long` (`INF = 4e18`) trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<vector<pair<int, long long>>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    const long long INF = 4000000000000000000LL;
    vector<long long> dist1(n + 1, INF), dist2(n + 1, INF);
    using P = pair<long long, int>;
    priority_queue<P, vector<P>, greater<P>> pq;

    dist1[1] = 0;
    pq.push({0, 1});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist2[u]) continue;

        for (auto [v, w] : adj[u]) {
            long long nd = d + w;
            if (nd < dist1[v]) {
                swap(dist1[v], nd);
                pq.push({dist1[v], v});
            }
            if (dist1[v] < nd && nd < dist2[v]) {
                dist2[v] = nd;
                pq.push({dist2[v], v});
            }
        }
    }

    if (dist2[n] >= INF) {
        cout << -1 << '\n';
    } else {
        cout << dist2[n] << '\n';
    }
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

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    inf = 4 * 10**18
    dist1 = [inf] * (n + 1)
    dist2 = [inf] * (n + 1)
    dist1[1] = 0
    pq = [(0, 1)]

    heappop = heapq.heappop
    heappush = heapq.heappush

    while pq:
        d, u = heappop(pq)
        if d > dist2[u]:
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist1[v]:
                dist1[v], nd = nd, dist1[v]
                heappush(pq, (dist1[v], v))
            if dist1[v] < nd < dist2[v]:
                dist2[v] = nd
                heappush(pq, (nd, v))

    ans = dist2[n]
    sys.stdout.write("-1\n" if ans >= inf else f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-second-shortest-path",
        "title": "Đường đi ngắn nhất thứ hai (Second Shortest Path)",
        "shortDescription": "Tìm độ dài đường đi ngắn nhất thứ hai (lớn hơn hẳn đường ngắn nhất) từ 1 đến N bằng Dijkstra mở rộng.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "dijkstra", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + M) log N) với Dijkstra lưu dist1/dist2.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp14-k-shortest-paths
# ============================================================================

def brute_p09(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m, k = toks[0], toks[1], toks[2]
    adj: List[List[Tuple[int, int]]] = [[] for _ in range(n + 1)]
    idx = 3
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))

    # Independent bounded DFS brute-force over all walks:
    # Step 1: BFS/DFS to find any K walks (or min cost limit via simple walk duplication)
    # Using iterative deepening by cost bound: find K shortest via BFS of edge-count?
    # Better: find one path to N (cost C0), plus minimum cycle at N or any reachable node;
    # run DFS with limit = C0 + k * max_edge_w * n (if positive) until >= k walks found,
    # then tighten bound to the K-th smallest found and enumerate ALL walks <= bound!
    found: List[int] = []
    # Find a seed path via Dijkstra-free BFS (fewest edges)
    parent_cost = [-1] * (n + 1)
    parent_cost[1] = 0
    q = deque([1])
    while q:
        u = q.popleft()
        for v, w in adj[u]:
            if parent_cost[v] == -1:
                parent_cost[v] = parent_cost[u] + w
                q.append(v)

    # Start with a safe increasing cost threshold until DFS finds >= k walks
    bound = max(1, parent_cost[n])
    while True:
        found.clear()
        stack = [(1, 0)]
        while stack:
            u, d = stack.pop()
            if u == n:
                found.append(d)
            for v, w in adj[u]:
                if d + w <= bound:
                    stack.append((v, d + w))
            if len(found) > 20000:
                break
        if len(found) >= k:
            found.sort()
            bound = found[k - 1]
            # Final exact pass with bound = k-th smallest so we can't miss any <= bound
            exact: List[int] = []
            stack2 = [(1, 0)]
            while stack2:
                u, d = stack2.pop()
                if u == n:
                    exact.append(d)
                for v, w in adj[u]:
                    if d + w <= bound:
                        stack2.append((v, d + w))
            exact.sort()
            return " ".join(map(str, exact[:k]))
        bound *= 2


def build_p09() -> dict:
    rng = random.Random(1409)

    tests = [
        # 3 public samples
        {
            "input": fmt_k_routes(
                4, 3, [(1, 2, 1), (1, 3, 3), (2, 3, 2), (2, 4, 6), (3, 2, 8), (3, 4, 1)]
            ),
            "hidden": False,
            "expected": "4 4 7",
            "checkBrute": True,
        },
        {
            "input": fmt_k_routes(
                2, 5, [(1, 2, 1), (1, 2, 2), (2, 1, 1)]
            ),
            "hidden": False,
            "expected": "1 2 3 4 4",
            "checkBrute": True,
        },
        {
            "input": fmt_k_routes(
                3, 4, [(1, 2, 1000000000), (2, 3, 1000000000), (1, 3, 2000000000), (3, 1, 1)]
            ),
            "hidden": False,
            "expected": "2000000000 2000000000 4000000001 4000000001",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_k_routes(2, 1, [(1, 2, 5), (2, 1, 3)]),
            "hidden": True,
            "expected": "5",
            "checkBrute": True,
        },
        {
            "input": fmt_k_routes(2, 10, [(1, 2, 1), (2, 2, 1)]),
            "hidden": True,
            "expected": "1 2 3 4 5 6 7 8 9 10",
            "checkBrute": True,
        },
        {
            "input": fmt_k_routes(
                4, 6, [(1, 2, 5), (2, 3, 5), (3, 4, 5), (4, 3, 1), (1, 4, 100)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_k_routes(
                4, 8, [(1, 2, 2), (1, 3, 2), (2, 4, 3), (3, 4, 3), (4, 1, 1), (2, 3, 1)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_k_routes(
                5, 10, [(1, 2, 10), (2, 3, 10), (3, 4, 10), (4, 5, 10), (1, 5, 50), (3, 2, 1)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB, >= K routes guaranteed)
    # Test 9: Medium small-cycle graph N=10, M=25, K=10
    e9 = [(i, i + 1, rng.randint(1, 20)) for i in range(1, 10)] + [(10, 1, 5)]
    e9 += [(rng.randint(1, 10), rng.randint(1, 10), rng.randint(1, 30)) for _ in range(15)]
    tests.append({"input": fmt_k_routes(10, 10, e9), "hidden": True, "checkBrute": True})

    # Test 10: Medium N=12, M=30, K=8
    e10 = [(i, i + 1, rng.randint(10, 50)) for i in range(1, 12)] + [(12, 10, 3)]
    e10 += [(rng.randint(1, 12), rng.randint(1, 12), rng.randint(5, 60)) for _ in range(18)]
    tests.append({"input": fmt_k_routes(12, 8, e10), "hidden": True, "checkBrute": True})

    # Test 11: Line N=6500 with back-edges + K=10
    e11 = [(i, i + 1, 1_000_000_000) for i in range(1, 6500)]
    e11 += [(6500, 6499, 1)]  # creates cheap loop near N
    for _ in range(400):
        e11.append((rng.randint(1, 6500), rng.randint(1, 6500), rng.randint(10**7, 10**9)))
    tests.append({"input": fmt_k_routes(6500, 10, e11), "hidden": True})

    # Test 12: Dense layered DAG with 10+ parallel routes N=3000, M=9500, K=10
    e12 = [(i, i + 1, rng.randint(1, 1000)) for i in range(1, 3000)]
    while len(e12) < 9_500:
        u = rng.randint(1, 2999)
        v = rng.randint(u + 1, min(3000, u + 30))
        e12.append((u, v, rng.randint(1, 5000)))
    tests.append({"input": fmt_k_routes(3000, 10, e12), "hidden": True})

    # Test 13: Random directed strongly connected-ish N=8000, M=8500, K=10
    e13 = [(i, i + 1, rng.randint(1, 10**5)) for i in range(1, 8000)]
    e13 += [(8000, 1, rng.randint(1, 10**5))]
    while len(e13) < 8_500:
        e13.append((rng.randint(1, 8000), rng.randint(1, 8000), rng.randint(1, 10**6)))
    tests.append({"input": fmt_k_routes(8000, 10, e13), "hidden": True})

    # Test 14: Diamond chain of 2000 layers (exponentially many ties!) N=6001, K=10
    e14 = []
    cur = 1
    while cur + 3 <= 6001:
        e14.extend([(cur, cur + 1, 100), (cur, cur + 2, 100), (cur + 1, cur + 3, 100), (cur + 2, cur + 3, 100)])
        cur += 3
    if cur < 6001:
        e14.append((cur, 6001, 100))
    tests.append({"input": fmt_k_routes(6001, 10, e14), "hidden": True})

    # Test 15: Max weight 1e9 chains + loops N=5000, M=6500, K=10
    e15 = [(i, i + 1, 1_000_000_000) for i in range(1, 5000)]
    e15 += [(i + 1, i, 1_000_000_000) for i in range(1, 200)]
    while len(e15) < 6500:
        e15.append((rng.randint(1, 5000), rng.randint(1, 5000), rng.randint(1, 10**9)))
    tests.append({"input": fmt_k_routes(5000, 10, e15), "hidden": True})

    # Test 16: N=4000, M=12000, K=9, small weights causing many heap updates
    e16 = [(i, i + 1, rng.randint(1, 20)) for i in range(1, 4000)]
    e16 += [(4000, 3995, 1)]
    while len(e16) < 12_000:
        e16.append((rng.randint(1, 4000), rng.randint(1, 4000), rng.randint(1, 50)))
    tests.append({"input": fmt_k_routes(4000, 9, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(2, 8)
        k = rng.randint(1, 10)
        # Ensure at least K routes by adding path 1->..->n and self-loop on n
        edges = [(i, i + 1, rng.randint(1, 25)) for i in range(1, n)]
        edges.append((n, n, rng.randint(1, 10)))
        extra_m = rng.randint(0, 8)
        for _ in range(extra_m):
            edges.append((rng.randint(1, n), rng.randint(1, n), rng.randint(1, 30)))
        extra_stress.append(fmt_k_routes(n, k, edges))

    statement = r"""Cho mạng lưới hàng không gồm $N$ thành phố (đánh số từ $1$ đến $N$) và $M$ đường bay một chiều, mỗi đường bay có giá vé nguyên dương $w_i$ (có thể có đa cung và khuyên).

Một lộ trình từ $1$ đến $N$ là một dãy các đường bay nối tiếp từ thành phố $1$ đến thành phố $N$ (được phép đi qua lại một thành phố hoặc một đường bay nhiều lần). Hãy tìm $K$ mức giá vé nhỏ nhất (theo thứ tự **không giảm**) trong tất cả các lộ trình khác nhau từ $1$ đến $N$; nếu có nhiều lộ trình khác nhau có cùng tổng giá vé thì vẫn liệt kê đầy đủ theo số lần xuất hiện. Dữ liệu luôn đảm bảo tồn tại ít nhất $K$ lộ trình từ $1$ đến $N$.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên $N, M, K$ ($2 \le N \le 8000$, $1 \le M \le 15\,000$, $1 \le K \le 10$).
- $M$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ ($1 \le u, v \le N$, $1 \le w \le 10^9$) biểu diễn một chuyến bay một chiều từ $u$ tới $v$ với giá $w$.

### Kết quả
- In ra trên một dòng gồm $K$ số nguyên cách nhau bởi dấu cách là $K$ chi phí nhỏ nhất theo thứ tự không giảm.

### Ràng buộc
- $2 \le N \le 8000$
- $1 \le M \le 15\,000$
- $1 \le K \le 10$
- $1 \le w \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 15$, $M \le 40$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Các lộ trình rẻ nhất từ $1$ đến $4$ là $1 \to 3 \to 4$ (giá $4$), $1 \to 2 \to 3 \to 4$ (giá $4$) và $1 \to 2 \to 4$ (giá $7$).
- **Ví dụ 2:** Có hai cạnh $1 \to 2$ giá $1$ và $2$, kết hợp cung quay lại $2 \to 1$ giá $1$, tạo thành $5$ lộ trình rẻ nhất có giá $1, 2, 3, 4, 4$ (có hai cách khác nhau đạt giá $4$: đi cạnh $1$ rồi vòng lại đi cạnh $2$, hoặc đi cạnh $2$ rồi vòng lại đi cạnh $1$).
- **Ví dụ 3:** Hai lộ trình đầu có giá $2 \times 10^9$, hai lộ trình tiếp theo đi vòng về $1$ thêm chi phí $1$ rồi lặp lại cho giá $4 \times 10^9 + 1$."""

    hints = r"""**Gợi ý 1 (Nhận xét cốt lõi của Dijkstra $K$-lần):**
Trong thuật toán Dijkstra chuẩn, mỗi đỉnh chỉ cần lấy ra khỏi hàng đợi ưu tiên $1$ lần vì ta chỉ cần đường ngắn nhất thứ nhất. Khi cần $K$ đường ngắn nhất, mỗi đỉnh trung gian chỉ cần được mở rộng tối đa **$K$ lần** (lần thứ $K+1$ trở đi không thể tạo ra lộ trình thuộc top $K$ tốt nhất tới $N$).

**Gợi ý 2 (Thuật toán):**
- Duy trì mảng `cnt[u]` đếm số lần đỉnh `u` đã được lấy ra khỏi min-heap (`priority_queue`).
- Khi lấy `(d, u)` ra: nếu `cnt[u] >= K`, bỏ qua ngay. Ngược lại tăng `cnt[u] += 1`.
- Nếu `u == N`, lưu `d` vào kết quả; khi đã đủ $K$ kết quả thì dừng ngay.
- Với mỗi cung `(u -> v, w)`, chỉ đẩy `(d + w, v)` vào heap nếu `cnt[v] < K`.

**Gợi ý 3 (Độ phức tạp & Kiểu dữ liệu):**
Mỗi đỉnh mở rộng tối đa $K$ lần nên số phần tử đẩy vào heap tối đa là $K \cdot M \le 150\,000$, độ phức tạp $O(K M \log(K M))$ chạy rất nhanh cả trong C++ và Python. Tổng chi phí có thể vượt `int` 32-bit, hãy dùng `long long`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, k;
    if (!(cin >> n >> m >> k)) return 0;

    vector<vector<pair<int, long long>>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
    }

    vector<int> cnt(n + 1, 0);
    vector<long long> ans;
    ans.reserve(k);

    using P = pair<long long, int>;
    priority_queue<P, vector<P>, greater<P>> pq;
    pq.push({0, 1});

    while (!pq.empty() && static_cast<int>(ans.size()) < k) {
        auto [d, u] = pq.top();
        pq.pop();
        if (cnt[u] >= k) continue;
        ++cnt[u];
        if (u == n) {
            ans.push_back(d);
            if (static_cast<int>(ans.size()) == k) break;
        }
        for (auto [v, w] : adj[u]) {
            if (cnt[v] < k) {
                pq.push({d + w, v});
            }
        }
    }

    for (int i = 0; i < k; ++i) {
        if (i) cout << ' ';
        cout << ans[i];
    }
    cout << '\n';
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

    cnt = [0] * (n + 1)
    ans = []
    pq = [(0, 1)]
    heappop = heapq.heappop
    heappush = heapq.heappush

    while pq and len(ans) < k:
        d, u = heappop(pq)
        if cnt[u] >= k:
            continue
        cnt[u] += 1
        if u == n:
            ans.append(str(d))
            if len(ans) == k:
                break
        for v, w in adj[u]:
            if cnt[v] < k:
                heappush(pq, (d + w, v))

    sys.stdout.write(" ".join(ans) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-k-shortest-paths",
        "title": "K lộ trình rẻ nhất (CSES Flight Routes)",
        "shortDescription": "Tìm K đường đi ngắn nhất (tính cả lặp đỉnh và trùng độ dài) từ 1 đến N bằng Dijkstra mở rộng.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "dijkstra", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(K * M log(K * M)) bằng Dijkstra K-lần.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp14-scc-coin-collector
# ============================================================================

def brute_p10(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    coins = [0] + toks[2 : 2 + n]
    adj: List[List[int]] = [[] for _ in range(n + 1)]
    idx = 2 + n
    for _ in range(m):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        adj[u].append(v)

    # Independent BFS reachability + SCC condensation + brute memoized DAG DFS
    reach = [[False] * (n + 1) for _ in range(n + 1)]
    for s in range(1, n + 1):
        reach[s][s] = True
        q = deque([s])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if not reach[s][v]:
                    reach[s][v] = True
                    q.append(v)

    comp = [0] * (n + 1)
    scc = 0
    scc_val = [0]
    for i in range(1, n + 1):
        if comp[i]:
            continue
        scc += 1
        total = 0
        for j in range(1, n + 1):
            if reach[i][j] and reach[j][i]:
                comp[j] = scc
                total += coins[j]
        scc_val.append(total)

    dag: List[Set[int]] = [set() for _ in range(scc + 1)]
    for u in range(1, n + 1):
        cu = comp[u]
        for v in adj[u]:
            cv = comp[v]
            if cu != cv:
                dag[cu].add(cv)

    memo = [-1] * (scc + 1)

    def best_from(c: int) -> int:
        if memo[c] != -1:
            return memo[c]
        nxt = 0
        for d in dag[c]:
            nxt = max(nxt, best_from(d))
        memo[c] = scc_val[c] + nxt
        return memo[c]

    return str(max(best_from(c) for c in range(1, scc + 1)))


def build_p10() -> dict:
    rng = random.Random(1410)

    tests = [
        # 3 public samples
        {
            "input": fmt_coin_collector(
                4,
                [4, 5, 2, 7],
                [(1, 2), (2, 1), (1, 3), (2, 4), (3, 4)],
            ),
            "hidden": False,
            "expected": "18",
            "checkBrute": True,
        },
        {
            "input": fmt_coin_collector(
                5,
                [10, 20, 5, 100, 1],
                [(1, 2), (2, 3), (3, 1), (4, 5)],
            ),
            "hidden": False,
            "expected": "101",
            "checkBrute": True,
        },
        {
            "input": fmt_coin_collector(
                4,
                [1000000000, 1000000000, 1000000000, 1000000000],
                [(1, 2), (2, 3), (3, 4), (4, 1)],
            ),
            "hidden": False,
            "expected": "4000000000",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_coin_collector(1, [42], []),
            "hidden": True,
            "expected": "42",
            "checkBrute": True,
        },
        {
            "input": fmt_coin_collector(3, [0, 0, 0], [(1, 2), (2, 3)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_coin_collector(
                4, [5, 8, 3, 9], []
            ),
            "hidden": True,
            "expected": "9",
            "checkBrute": True,
        },
        {
            "input": fmt_coin_collector(
                6,
                [10, 20, 30, 5, 50, 1],
                [(1, 2), (2, 1), (2, 3), (3, 4), (2, 5), (5, 6), (6, 5)],
            ),
            "hidden": True,
            "expected": "81",
            "checkBrute": True,
        },
        {
            "input": fmt_coin_collector(
                5,
                [100, 1, 1, 1, 200],
                [(1, 1), (1, 2), (2, 3), (3, 4), (4, 2), (4, 5), (2, 2)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    tests.append(
        {
            "input": fmt_coin_collector(
                40,
                [rng.randint(0, 1000) for _ in range(40)],
                [(rng.randint(1, 40), rng.randint(1, 40)) for _ in range(95)],
            ),
            "hidden": True,
            "checkBrute": True,
        }
    )
    tests.append(
        {
            "input": fmt_coin_collector(
                55,
                [rng.randint(0, 10**9) for _ in range(55)],
                [(rng.randint(1, 55), rng.randint(1, 55)) for _ in range(130)],
            ),
            "hidden": True,
            "checkBrute": True,
        }
    )

    # Test 11: Deep chain N=10500 (kills recursive Tarjan/DP)
    e11 = [(i, i + 1) for i in range(1, 10_500)]
    c11 = [rng.randint(1, 99) for _ in range(10_500)]
    tests.append({"input": fmt_coin_collector(10_500, c11, e11), "hidden": True})

    # Test 12: Shuffled giant SCC + tail N=15000, M=6000
    c12 = [rng.randint(0, 9999) for _ in range(15_000)]
    e12 = [(rng.randint(1, 15_000), rng.randint(1, 15_000)) for _ in range(6000)]
    tests.append({"input": fmt_coin_collector(15_000, c12, e12), "hidden": True})

    # Test 13: Large 1e9 coins (6000 nodes, 7500 edges -> huge long long sum > 1e12)
    c13 = [rng.randint(5 * 10**8, 10**9) for _ in range(6000)]
    e13 = [(i, i + 1) for i in range(1, 6000)]
    for _ in range(1501):
        e13.append((rng.randint(1, 6000), rng.randint(1, 6000)))
    tests.append({"input": fmt_coin_collector(6000, c13, e13), "hidden": True})

    # Test 14: Many small cycles linked in a DAG N=6000, M=9000
    c14 = [rng.randint(1, 10**5) for _ in range(6000)]
    e14 = []
    for base in range(1, 6000, 4):
        for k in range(4):
            e14.append((base + k, base + (k + 1) % 4))
    for base in range(1, 5990, 4):
        if base + 4 <= 6000:
            e14.append((base, base + 4))
        if base + 8 <= 6000:
            e14.append((base + 1, base + 8))
    tests.append({"input": fmt_coin_collector(6000, c14, e14), "hidden": True})

    # Test 15: Dense random SCCs N=4000, M=10000 with 1e9 coins
    c15 = [rng.randint(0, 10**9) for _ in range(4000)]
    e15 = [(rng.randint(1, 4000), rng.randint(1, 4000)) for _ in range(10_000)]
    tests.append({"input": fmt_coin_collector(4000, c15, e15), "hidden": True})

    # Test 16: Binary DAG of SCCs N=6000, M=9998
    c16 = [rng.randint(1, 10**6) for _ in range(6000)]
    e16 = []
    for base in range(1, 6000, 3):
        e16.extend([(base, base + 1), (base + 1, base + 2), (base + 2, base)])
    num_blocks = 6000 // 3
    for b in range(1, num_blocks + 1):
        if 2 * b <= num_blocks:
            e16.append(((b - 1) * 3 + 1, (2 * b - 1) * 3 + 1))
        if 2 * b + 1 <= num_blocks:
            e16.append(((b - 1) * 3 + 2, (2 * b) * 3 + 1))
    tests.append({"input": fmt_coin_collector(6000, c16, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 20)
        m = rng.randint(0, 40)
        coins = [rng.randint(0, 10**9) for _ in range(n)]
        edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_coin_collector(n, coins, edges))

    statement = r"""Một trò chơi có $N$ căn phòng (đánh số từ $1$ đến $N$) và $M$ hành lang một chiều nối giữa các phòng (có thể có đa cung và khuyên). Căn phòng thứ $i$ chứa $c_i$ đồng xu vàng.

Bạn được quyền chọn **bất kỳ** căn phòng nào để bắt đầu và đi qua các hành lang một chiều tùy ý (có thể quay lại một phòng nhiều lần, nhưng số xu tại mỗi phòng chỉ được nhặt **tối đa một lần** ở lần đầu tiên ghé thăm).

Hãy tìm tổng số đồng xu vàng lớn nhất có thể thu thập được.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 15\,000$, $0 \le M \le 25\,000$).
- Dòng thứ hai chứa $N$ số nguyên $c_1, c_2, \dots, c_N$ ($0 \le c_i \le 10^9$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn hành lang một chiều từ phòng $u$ sang phòng $v$.

### Kết quả
- In ra một số nguyên duy nhất là tổng số xu lớn nhất thu được.

### Ràng buộc
- $1 \le N \le 15\,000$
- $0 \le M \le 25\,000$
- $0 \le c_i \le 10^9$

### Subtasks
- **Subtask 1 (30%):** $N \le 60$, $M \le 150$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Xuất phát tại phòng $2$, đi theo lộ trình $2 \to 1 \to 3 \to 4$ để thu toàn bộ xu của cả $4$ phòng với tổng $5 + 4 + 2 + 7 = 18$.
- **Ví dụ 2:** Cụm $\{1, 2, 3\}$ có tổng $35$ xu, trong khi xuất phát ở phòng $4$ rồi sang $5$ thu được $100 + 1 = 101$ xu.
- **Ví dụ 3:** Cả $4$ phòng tạo thành một chu trình nên có thể đi vòng qua tất cả và thu $4 \times 10^9$ xu."""

    hints = r"""**Gợi ý 1 (Tính chất trong cùng một SCC):**
Nếu đã bước vào một thành phần liên thông mạnh (SCC), bạn luôn có thể đi vòng quanh mọi đỉnh trong SCC đó để nhặt **toàn bộ** số xu của tất cả các đỉnh thuộc SCC ấy!

**Gợi ý 2 (Nén thành DAG + Quy hoạch động):**
Dùng thuật toán Tarjan (hoặc Kosaraju) **dạng lặp** để gom các đỉnh theo từng SCC. Với mỗi SCC `c`, tính `scc_coin[c]` là tổng $c_i$ của các đỉnh trong SCC `c`. Khi co mỗi SCC thành một đỉnh, ta thu được một đồ thị DAG có trọng số trên đỉnh.

**Gợi ý 3 (Quy hoạch động theo thứ tự Topo của Tarjan):**
Trong Tarjan, khi một SCC được pop khỏi ngăn xếp, toàn bộ các SCC mà nó có thể đi tới đều đã được pop **trước đó** (`comp[v] < comp[u]` với mọi cạnh `u -> v` khác SCC). Do đó chỉ cần duyệt `c` từ `1` đến `sccCount`:
$$\text{dp}[c] = \text{scc\_coin}[c] + \max_{(c \to d)} \text{dp}[d]$$
Kết quả là $\max_{1 \le c \le \text{sccCount}} \text{dp}[c]$ (dùng kiểu `long long`)."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<long long> coins(n + 1);
    for (int i = 1; i <= n; ++i) cin >> coins[i];

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
    }

    vector<int> tin(n + 1, 0), low(n + 1, 0), comp(n + 1, 0);
    vector<char> onStack(n + 1, 0);
    vector<int> sccStack;
    sccStack.reserve(n);

    struct Frame {
        int u, idx;
    };
    vector<Frame> dfsStack;
    int timer = 0;
    int sccCount = 0;
    vector<long long> sccCoin(1, 0);

    for (int root = 1; root <= n; ++root) {
        if (tin[root]) continue;
        tin[root] = low[root] = ++timer;
        onStack[root] = 1;
        sccStack.push_back(root);
        dfsStack.push_back({root, 0});

        while (!dfsStack.empty()) {
            Frame& top = dfsStack.back();
            int u = top.u;
            if (top.idx < static_cast<int>(adj[u].size())) {
                int v = adj[u][top.idx++];
                if (!tin[v]) {
                    tin[v] = low[v] = ++timer;
                    onStack[v] = 1;
                    sccStack.push_back(v);
                    dfsStack.push_back({v, 0});
                } else if (onStack[v]) {
                    if (tin[v] < low[u]) low[u] = tin[v];
                }
            } else {
                dfsStack.pop_back();
                if (!dfsStack.empty()) {
                    int p = dfsStack.back().u;
                    if (low[u] < low[p]) low[p] = low[u];
                }
                if (low[u] == tin[u]) {
                    ++sccCount;
                    long long total = 0;
                    while (true) {
                        int w = sccStack.back();
                        sccStack.pop_back();
                        onStack[w] = 0;
                        comp[w] = sccCount;
                        total += coins[w];
                        if (w == u) break;
                    }
                    sccCoin.push_back(total);
                }
            }
        }
    }

    vector<vector<int>> dag(sccCount + 1);
    for (int u = 1; u <= n; ++u) {
        int cu = comp[u];
        for (int v : adj[u]) {
            int cv = comp[v];
            if (cu != cv) {
                dag[cu].push_back(cv);
            }
        }
    }

    // Tarjan pops SCCs in reverse topological order: cu -> cv implies cv < cu.
    vector<long long> dp(sccCount + 1, 0);
    long long ans = 0;
    for (int c = 1; c <= sccCount; ++c) {
        long long bestNext = 0;
        for (int nxt : dag[c]) {
            if (dp[nxt] > bestNext) bestNext = dp[nxt];
        }
        dp[c] = sccCoin[c] + bestNext;
        if (dp[c] > ans) ans = dp[c];
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
    m = int(data[1])

    coins = [0] * (n + 1)
    idx = 2
    for i in range(1, n + 1):
        coins[i] = int(data[idx])
        idx += 1

    adj = [[] for _ in range(n + 1)]
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)

    tin = [0] * (n + 1)
    low = [0] * (n + 1)
    comp = [0] * (n + 1)
    on_stack = bytearray(n + 1)
    scc_stack = []
    scc_coin = [0]
    timer = 0
    scc_count = 0

    for root in range(1, n + 1):
        if tin[root]:
            continue
        timer += 1
        tin[root] = low[root] = timer
        on_stack[root] = 1
        scc_stack.append(root)
        dfs_stack = [[root, 0]]

        while dfs_stack:
            top = dfs_stack[-1]
            u = top[0]
            i = top[1]
            nbrs = adj[u]
            if i < len(nbrs):
                v = nbrs[i]
                top[1] = i + 1
                if not tin[v]:
                    timer += 1
                    tin[v] = low[v] = timer
                    on_stack[v] = 1
                    scc_stack.append(v)
                    dfs_stack.append([v, 0])
                elif on_stack[v]:
                    if tin[v] < low[u]:
                        low[u] = tin[v]
            else:
                dfs_stack.pop()
                if dfs_stack:
                    p = dfs_stack[-1][0]
                    if low[u] < low[p]:
                        low[p] = low[u]
                if low[u] == tin[u]:
                    scc_count += 1
                    total = 0
                    while True:
                        w = scc_stack.pop()
                        on_stack[w] = 0
                        comp[w] = scc_count
                        total += coins[w]
                        if w == u:
                            break
                    scc_coin.append(total)

    dag = [[] for _ in range(scc_count + 1)]
    for u in range(1, n + 1):
        cu = comp[u]
        for v in adj[u]:
            cv = comp[v]
            if cu != cv:
                dag[cu].append(cv)

    dp = [0] * (scc_count + 1)
    ans = 0
    for c in range(1, scc_count + 1):
        best_next = 0
        for nxt in dag[c]:
            if dp[nxt] > best_next:
                best_next = dp[nxt]
        val = scc_coin[c] + best_next
        dp[c] = val
        if val > ans:
            ans = val

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp14-scc-coin-collector",
        "title": "Thu thập đồng xu trên đồ thị có hướng (CSES Coin Collector)",
        "shortDescription": "Nén các thành phần liên thông mạnh thành DAG rồi quy hoạch động tìm tổng xu lớn nhất.",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.graph_advanced",
        "tags": ["đồ thị", "scc", "quy hoạch động", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M), dùng Tarjan lặp + Topo DP trên DAG.",
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
        pack_id="14-advanced-graphs",
        title="Tầng 3–4: Đồ thị nâng cao (0-1 BFS, Floyd, Bellman-Ford, Tarjan & SCC)",
        tier="Tầng 3–4 — Đồ thị nâng cao",
        description=(
            "10 bài đồ thị nâng cao chuẩn CSES & VNOI: Multi-source BFS, 0-1 BFS, "
            "Floyd-Warshall, Bellman-Ford chu trình âm, Tarjan khớp & cầu, "
            "SCC mở rộng liên thông mạnh, Đường đi ngắn thứ 2/thứ K và SCC Coin Collector."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
