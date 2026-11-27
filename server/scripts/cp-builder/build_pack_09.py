"""
Builder & automated verifier for CodeClass CP Pack 09:
Tầng 3: Đồ thị & Cây toàn diện (BFS/DFS, Topo, Dijkstra, DSU/MST)

Generates and verifies 10 original Vietnamese competitive programming problems
(3 easy, 4 medium, 3 hard), 16 test cases per problem (160 tests total),
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

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Đồ thị & Cây\n"
MOD = 1_000_000_007
SAFE_MAX_BYTES = 148_000


def fmt_graph_unweighted(n: int, edges: List[Tuple[int, int]]) -> str:
    lines = [f"{n} {len(edges)}"]
    lines.extend(f"{u} {v}" for u, v in edges)
    return "\n".join(lines)


def fmt_graph_weighted(n: int, edges: List[Tuple[int, int, int]]) -> str:
    lines = [f"{n} {len(edges)}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    return "\n".join(lines)


def fmt_tree_weighted(n: int, edges: List[Tuple[int, int, int]]) -> str:
    lines = [str(n)]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    return "\n".join(lines)


def fmt_grid(grid: List[str]) -> str:
    return f"{len(grid)} {len(grid[0])}\n" + "\n".join(grid)


def fmt_edge_removal(
    n: int, edges: List[Tuple[int, int]], queries: List[int]
) -> str:
    lines = [f"{n} {len(edges)} {len(queries)}"]
    lines.extend(f"{u} {v}" for u, v in edges)
    lines.append(" ".join(map(str, queries)))
    return "\n".join(lines)


# ============================================================================
# 1. cp09-connected-components-stats
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    parent = list(range(n + 1))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    idx = 2
    for _ in range(m):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[rv] = ru

    counts: Dict[int, int] = {}
    for i in range(1, n + 1):
        r = find(i)
        counts[r] = counts.get(r, 0) + 1
    return f"{len(counts)} {max(counts.values())}"


def build_p01() -> dict:
    rng = random.Random(901)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_unweighted(6, [(1, 2), (2, 3), (4, 5), (1, 3)]),
            "hidden": False,
            "expected": "3 3",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(4, [(1, 2), (2, 3), (3, 4), (2, 2), (1, 2)]),
            "hidden": False,
            "expected": "1 4",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(5, []),
            "hidden": False,
            "expected": "5 1",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_unweighted(1, []),
            "hidden": True,
            "expected": "1 1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(5, [(i, i) for i in range(1, 6)]),
            "hidden": True,
            "expected": "5 1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                8,
                [(1, 2), (1, 2), (1, 3), (1, 4), (4, 1), (5, 5), (6, 7), (7, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                10,
                [(1, 2), (2, 3), (3, 4), (4, 5), (6, 7), (7, 8), (8, 9), (9, 10)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(
                20,
                [(i, j) for i in range(1, 16) for j in range(i + 1, 16)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 145KB)
    # Test 9: Medium random
    e9 = [(rng.randint(1, 200), rng.randint(1, 200)) for _ in range(250)]
    tests.append({"input": fmt_graph_unweighted(200, e9), "hidden": True, "checkBrute": True})

    # Test 10: Medium cycles + isolated
    e10 = []
    for base in range(1, 451, 50):
        for k in range(49):
            e10.append((base + k, base + k + 1))
        e10.append((base + 49, base))
    tests.append({"input": fmt_graph_unweighted(500, e10), "hidden": True, "checkBrute": True})

    # Test 11: Deep chain N=10000 (kills recursive DFS)
    e11 = [(i, i + 1) for i in range(1, 10_000)]
    tests.append({"input": fmt_graph_unweighted(10_000, e11), "hidden": True})

    # Test 12: Star + small cliques N=12000
    e12 = [(1, i) for i in range(2, 6_001)]
    for base in range(6_001, 11_000, 5):
        for k in range(4):
            e12.append((base + k, base + k + 1))
        e12.append((base + 4, base))
    tests.append({"input": fmt_graph_unweighted(12_000, e12), "hidden": True})

    # Test 13: N=25000 with many small components + self-loops
    e13 = []
    for i in range(1, 20_000, 2):
        e13.append((i, i + 1))
    for _ in range(500):
        u = rng.randint(1, 25_000)
        e13.append((u, u))
    tests.append({"input": fmt_graph_unweighted(25_000, e13), "hidden": True})

    # Test 14: Sparse random giant component N=15000, M=11000
    e14 = [(rng.randint(1, 15_000), rng.randint(1, 15_000)) for _ in range(11_000)]
    tests.append({"input": fmt_graph_unweighted(15_000, e14), "hidden": True})

    # Test 15: Binary tree + cross edges N=11000
    e15 = [(i // 2, i) for i in range(2, 10_501)]
    for _ in range(800):
        e15.append((rng.randint(1, 10_500), rng.randint(1, 10_500)))
    tests.append({"input": fmt_graph_unweighted(11_000, e15), "hidden": True})

    # Test 16: Max N=25000, M=11000 with 1 giant shuffled chain + noise
    perm = list(range(1, 25_001))
    rng.shuffle(perm)
    e16 = [(perm[i], perm[i + 1]) for i in range(9_500)]
    for _ in range(1_500):
        e16.append((rng.randint(1, 25_000), rng.randint(1, 25_000)))
    tests.append({"input": fmt_graph_unweighted(25_000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 30)
        m = rng.randint(0, 45)
        edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_graph_unweighted(n, edges))

    statement = r"""Một hệ thống mạng máy tính gồm $N$ máy chủ được đánh số từ $1$ đến $N$ và $M$ dây cáp truyền thông hai chiều. Mỗi dây cáp nối trực tiếp hai máy chủ $u$ và $v$ (có thể có nhiều dây cáp nối cùng một cặp máy chủ hoặc dây nối một máy với chính nó).

Hai máy chủ được gọi là thuộc cùng một **thành phần liên thông** nếu có thể truyền dữ liệu qua lại giữa chúng trực tiếp hoặc thông qua một chuỗi các máy chủ trung gian.

Hãy xác định:
1. Tổng số thành phần liên thông của đồ thị.
2. Kích thước (số lượng đỉnh) của thành phần liên thông lớn nhất.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N \le 25\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cạnh vô hướng nối đỉnh $u$ và đỉnh $v$.

### Kết quả
- In ra một dòng duy nhất gồm hai số nguyên cách nhau bởi một dấu cách: số thành phần liên thông và kích thước thành phần liên thông lớn nhất.

### Ràng buộc
- $1 \le N \le 25\,000$
- $0 \le M \le 30\,000$
- $1 \le u, v \le N$"""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Mỗi máy chủ là một đỉnh, mỗi dây cáp hai chiều là một cạnh vô hướng. Các cụm mạng tách rời chính là các thành phần liên thông của đồ thị vô hướng.

**Gợi ý 2 (Ý tưởng thuật toán):**
Duyệt lần lượt từng đỉnh $i$ từ $1$ đến $N$. Nếu đỉnh $i$ chưa được thăm, ta bắt đầu một lượt tìm kiếm theo chiều rộng (**BFS**) hoặc tìm kiếm theo chiều sâu (**DFS**) từ $i$ để đánh dấu toàn bộ các đỉnh thuộc cùng thành phần liên thông với $i$, đồng thời đếm số đỉnh `sz` đã thăm trong lượt này.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Với đồ thị dạng chuỗi dài tới $25\,000$ đỉnh, DFS đệ quy có thể gây tràn ngăn xếp (RecursionError / Stack Overflow), nhất là trong Python. Hãy dùng **BFS bằng hàng đợi** hoặc **DFS lặp bằng ngăn xếp (stack)**.
- Nhớ đánh dấu đỉnh đã thăm **ngay khi đưa vào hàng đợi/ngăn xếp** để tránh đưa trùng một đỉnh nhiều lần khi đồ thị có đa cạnh hoặc chu trình."""

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
        if (u != v) {
            adj[u].push_back(v);
            adj[v].push_back(u);
        }
    }

    vector<char> vis(n + 1, 0);
    vector<int> q;
    q.reserve(n);

    int compCount = 0;
    int maxSize = 0;

    for (int i = 1; i <= n; ++i) {
        if (vis[i]) continue;
        ++compCount;
        vis[i] = 1;
        q.clear();
        q.push_back(i);
        for (size_t head = 0; head < q.size(); ++head) {
            int u = q[head];
            for (int v : adj[u]) {
                if (!vis[v]) {
                    vis[v] = 1;
                    q.push_back(v);
                }
            }
        }
        maxSize = max(maxSize, (int)q.size());
    }

    cout << compCount << ' ' << maxSize << '\n';
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
        if u != v:
            adj[u].append(v)
            adj[v].append(u)

    vis = bytearray(n + 1)
    comp_count = 0
    max_size = 0

    for i in range(1, n + 1):
        if vis[i]:
            continue
        comp_count += 1
        vis[i] = 1
        stack = [i]
        sz = 0
        while stack:
            u = stack.pop()
            sz += 1
            for v in adj[u]:
                if not vis[v]:
                    vis[v] = 1
                    stack.append(v)
        if sz > max_size:
            max_size = sz

    sys.stdout.write(f"{comp_count} {max_size}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-connected-components-stats",
        "title": "Thống kê thành phần liên thông",
        "shortDescription": "Đếm số thành phần liên thông và tìm kích thước thành phần lớn nhất trên đồ thị vô hướng.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.graph_traversal",
        "tags": ["đồ thị", "bfs-dfs", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M), dùng BFS/DFS lặp tránh tràn ngăn xếp.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp09-maze-shortest-path-bfs
# ============================================================================

def brute_p02(inp: str) -> str:
    lines = inp.strip().splitlines()
    n, m = map(int, lines[0].split())
    grid = lines[1 : 1 + n]
    INF = 10**9
    dist = [[INF] * m for _ in range(n)]
    tr = tc = -1
    for r in range(n):
        for c in range(m):
            if grid[r][c] == "S":
                dist[r][c] = 0
            elif grid[r][c] == "E":
                tr, tc = r, c

    # Independent Bellman-Ford / iterative relaxation on grid
    changed = True
    while changed:
        changed = False
        for r in range(n):
            for c in range(m):
                d = dist[r][c]
                if d == INF:
                    continue
                nd = d + 1
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < n and 0 <= nc < m and grid[nr][nc] != "#":
                        if nd < dist[nr][nc]:
                            dist[nr][nc] = nd
                            changed = True

    ans = dist[tr][tc]
    return str(-1 if ans == INF else ans)


def make_snake_maze(n: int, m: int) -> List[str]:
    # Odd dimensions, classic serpentine path of length ~ n*m/2
    g = [["."] * m for _ in range(n)]
    for r in range(1, n, 2):
        for c in range(m):
            g[r][c] = "#"
        if (r // 2) % 2 == 0:
            g[r][m - 1] = "."
        else:
            g[r][0] = "."
    g[0][0] = "S"
    end_c = m - 1 if ((n - 1) // 2) % 2 == 0 else 0
    g[n - 1][end_c] = "E"
    return ["".join(row) for row in g]


def make_random_grid(rng: random.Random, n: int, m: int, wall_prob: float) -> List[str]:
    g = [["#" if rng.random() < wall_prob else "." for _ in range(m)] for _ in range(n)]
    sr, sc = rng.randrange(n), rng.randrange(m)
    while True:
        tr, tc = rng.randrange(n), rng.randrange(m)
        if (tr, tc) != (sr, sc):
            break
    g[sr][sc] = "S"
    g[tr][tc] = "E"
    return ["".join(row) for row in g]


def build_p02() -> dict:
    rng = random.Random(902)

    tests = [
        # 3 public samples
        {
            "input": fmt_grid([
                "S..#.",
                ".#...",
                ".#.#.",
                "...#E",
            ]),
            "hidden": False,
            "expected": "7",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "S#.",
                "##.",
                "..E",
            ]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid(["S..E"]),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_grid(["SE"]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid(["S", ".", "#", ".", "E"]),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid(["S#", "#E"]),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_grid([
                "S....",
                ".....",
                ".....",
                ".....",
                "....E",
            ]),
            "hidden": True,
            "expected": "8",
            "checkBrute": True,
        },
        {
            "input": fmt_grid(make_snake_maze(9, 9)),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({"input": fmt_grid(make_random_grid(rng, 12, 12, 0.28)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_grid(make_random_grid(rng, 50, 50, 0.25)), "hidden": True})
    tests.append({"input": fmt_grid(make_random_grid(rng, 120, 120, 0.26)), "hidden": True})

    # Test 12: 200x200 blocked right around E
    g12 = [["." for _ in range(200)] for _ in range(200)]
    g12[0][0] = "S"
    g12[199][199] = "E"
    g12[198][199] = "#"
    g12[199][198] = "#"
    tests.append({"input": fmt_grid(["".join(r) for r in g12]), "hidden": True, "expected": "-1"})

    # Test 13: 300x300 completely open
    g13 = [["." for _ in range(300)] for _ in range(300)]
    g13[0][0] = "S"
    g13[299][299] = "E"
    tests.append({"input": fmt_grid(["".join(r) for r in g13]), "hidden": True, "expected": "598"})

    # Test 14: 299x299 serpentine maze (~45,000 steps!)
    tests.append({"input": fmt_grid(make_snake_maze(299, 299)), "hidden": True})

    # Test 15: 250x250 rooms with narrow gates
    g15 = [["." for _ in range(250)] for _ in range(250)]
    for r in range(0, 250, 10):
        for c in range(250):
            g15[r][c] = "#"
        g15[r][(r * 7 + 3) % 250] = "."
    for c in range(5, 250, 15):
        for r in range(250):
            if r % 10 != 0:
                g15[r][c] = "#"
        g15[(c * 3 + 1) % 250][c] = "."
    g15[1][1] = "S"
    g15[249][249] = "E"
    tests.append({"input": fmt_grid(["".join(r) for r in g15]), "hidden": True})

    # Test 16: 300x300 random walkable maze (~90KB)
    g16 = make_random_grid(rng, 300, 300, 0.28)
    tests.append({"input": fmt_grid(g16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(2, 10)
        m = rng.randint(2, 10)
        p = rng.uniform(0.1, 0.45)
        extra_stress.append(fmt_grid(make_random_grid(rng, n, m, p)))

    statement = r"""Một robot tự hành đang di chuyển trong một mê cung hình chữ nhật kích thước $N \times M$ ($N$ hàng, $M$ cột). Mỗi ô trong mê cung là một trong bốn ký tự:
- `.`: ô trống có thể đi qua;
- `#`: tường chắn không thể đi vào;
- `S`: vị trí xuất phát của robot (xuất hiện đúng một lần);
- `E`: vị trí đích cần đến (xuất hiện đúng một lần).

Mỗi bước, robot có thể di chuyển từ ô hiện tại sang một trong $4$ ô kề cạnh (lên, xuống, trái, phải) nằm trong phạm vi bảng và không phải là tường `#`. Mỗi bước di chuyển tốn chi phí bằng $1$.

Hãy tìm số bước đi ngắn nhất để robot di chuyển từ `S` đến `E`, hoặc in ra `-1` nếu không tồn tại đường đi hợp lệ.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N, M \le 300$, $N \cdot M \ge 2$).
- $N$ dòng tiếp theo, mỗi dòng là một xâu gồm đúng $M$ ký tự thuộc tập `{'.', '#', 'S', 'E'}`.

### Kết quả
- Một số nguyên duy nhất là số bước ngắn nhất từ `S` đến `E`, hoặc `-1` nếu không đến được.

### Ràng buộc
- $1 \le N, M \le 300$, $N \cdot M \ge 2$
- Có đúng một ô `S` và đúng một ô `E` trong lưới."""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Xem mỗi ô không phải tường là một đỉnh của đồ thị vô hướng không trọng số; hai ô kề cạnh có cạnh nối với nhau. Bài toán trở thành tìm đường đi ngắn nhất từ `S` đến `E` trên đồ thị có trọng số các cạnh đều bằng $1$.

**Gợi ý 2 (Ý tưởng thuật toán):**
Sử dụng thuật toán **BFS** xuất phát từ ô `S` với mảng khoảng cách `dist[r][c]` khởi tạo bằng `-1`, `dist[S] = 0`. Vì các bước đều có chi phí $1$, lần đầu tiên một ô được thăm trong BFS chắc chắn là khoảng cách ngắn nhất tới ô đó.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Đánh dấu `dist[nr][nc] = dist[r][c] + 1` **ngay trước khi** đẩy ô `(nr, nc)` vào hàng đợi, nếu không một ô có thể bị đẩy vào hàng đợi rất nhiều lần gây TLE/MLE.
- Kiểm tra biên cẩn thận `0 <= nr < N` và `0 <= nc < M`. Trong Python, có thể làm phẳng tọa độ thành chỉ số $1$ chiều `u = r * M + c` để BFS chạy cực nhanh trên lưới $300 \times 300$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<string> grid(n);
    int sr = -1, sc = -1, tr = -1, tc = -1;
    for (int r = 0; r < n; ++r) {
        cin >> grid[r];
        for (int c = 0; c < m; ++c) {
            if (grid[r][c] == 'S') {
                sr = r;
                sc = c;
            } else if (grid[r][c] == 'E') {
                tr = r;
                tc = c;
            }
        }
    }

    vector<int> dist(n * m, -1);
    queue<int> q;
    int start = sr * m + sc;
    int target = tr * m + tc;
    dist[start] = 0;
    q.push(start);

    const int dr[4] = {-1, 1, 0, 0};
    const int dc[4] = {0, 0, -1, 1};

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        if (u == target) {
            cout << dist[u] << '\n';
            return 0;
        }
        int r = u / m;
        int c = u % m;
        int nd = dist[u] + 1;
        for (int k = 0; k < 4; ++k) {
            int nr = r + dr[k];
            int nc = c + dc[k];
            if (nr >= 0 && nr < n && nc >= 0 && nc < m && grid[nr][nc] != '#') {
                int v = nr * m + nc;
                if (dist[v] == -1) {
                    dist[v] = nd;
                    q.push(v);
                }
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

    flat = "".join(rows)
    start = flat.find("S")
    target = flat.find("E")

    total = n * m
    dist = [-1] * total
    dist[start] = 0
    q = deque([start])

    while q:
        u = q.popleft()
        if u == target:
            sys.stdout.write(f"{dist[u]}\n")
            return
        nd = dist[u] + 1
        r, c = divmod(u, m)
        if r > 0:
            v = u - m
            if dist[v] == -1 and flat[v] != "#":
                dist[v] = nd
                q.append(v)
        if r + 1 < n:
            v = u + m
            if dist[v] == -1 and flat[v] != "#":
                dist[v] = nd
                q.append(v)
        if c > 0:
            v = u - 1
            if dist[v] == -1 and flat[v] != "#":
                dist[v] = nd
                q.append(v)
        if c + 1 < m:
            v = u + 1
            if dist[v] == -1 and flat[v] != "#":
                dist[v] = nd
                q.append(v)

    sys.stdout.write("-1\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-maze-shortest-path-bfs",
        "title": "Đường đi ngắn nhất trong mê cung",
        "shortDescription": "Tìm số bước di chuyển ít nhất từ ô xuất phát đến ô đích trong mê cung lưới bằng BFS.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.graph_grid_bipartite",
        "tags": ["đồ thị", "bfs-dfs", "lưới", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N × M) bằng BFS trên lưới.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp09-tree-diameter
# ============================================================================

def brute_p03(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    adj: List[List[Tuple[int, int]]] = [[] for _ in range(n + 1)]
    idx = 1
    for _ in range(n - 1):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    # Independent all-pairs BFS/DFS from every vertex
    best = 0
    for s in range(1, n + 1):
        dist = [-1] * (n + 1)
        dist[s] = 0
        stack = [s]
        while stack:
            u = stack.pop()
            du = dist[u]
            if du > best:
                best = du
            for v, w in adj[u]:
                if dist[v] == -1:
                    dist[v] = du + w
                    stack.append(v)
    return str(best)


def make_random_tree(
    rng: random.Random, n: int, w_lo: int, w_hi: int
) -> List[Tuple[int, int, int]]:
    perm = list(range(1, n + 1))
    rng.shuffle(perm)
    edges = []
    for i in range(1, n):
        p = rng.randrange(i)
        u, v = perm[p], perm[i]
        if rng.random() < 0.5:
            u, v = v, u
        edges.append((u, v, rng.randint(w_lo, w_hi)))
    rng.shuffle(edges)
    return edges


def build_p03() -> dict:
    rng = random.Random(903)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_weighted(5, [(1, 2, 3), (2, 3, 4), (2, 4, 5), (4, 5, 2)]),
            "hidden": False,
            "expected": "11",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_weighted(4, [(1, 2, 10), (1, 3, 20), (1, 4, 30)]),
            "hidden": False,
            "expected": "50",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_weighted(1, []),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_tree_weighted(2, [(1, 2, 10**9)]),
            "hidden": True,
            "expected": "1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_weighted(5, [(i, i + 1, 10**9) for i in range(1, 5)]),
            "hidden": True,
            "expected": "4000000000",
            "checkBrute": True,
        },
        {
            # Y-tree where vertex 1 is on the shortest leg
            "input": fmt_tree_weighted(
                7,
                [(1, 2, 1), (2, 3, 100), (3, 4, 200), (2, 5, 150), (5, 6, 250), (6, 7, 50)],
            ),
            "hidden": True,
            "expected": "750",
            "checkBrute": True,
        },
        {
            # Caterpillar N=30
            "input": fmt_tree_weighted(
                30,
                [(i, i + 1, rng.randint(1, 1000)) for i in range(1, 15)]
                + [(i - 14, i, rng.randint(500, 5000)) for i in range(16, 31)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Complete binary tree N=63
            "input": fmt_tree_weighted(
                63,
                [(i // 2, i, rng.randint(1, 10**9)) for i in range(2, 64)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (staying < 145KB)
    tests.append({"input": fmt_tree_weighted(100, make_random_tree(rng, 100, 1, 10**9)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_tree_weighted(500, make_random_tree(rng, 500, 1, 10**9)), "hidden": True})

    # Test 11: Star N=6500
    e11 = [(3250, i, rng.randint(1, 10**9)) for i in range(1, 6_501) if i != 3250]
    tests.append({"input": fmt_tree_weighted(6_500, e11), "hidden": True})

    # Test 12: Long chain N=6800 with w=10^9 (64-bit overflow + recursion killer)
    e12 = [(i, i + 1, 10**9) for i in range(1, 6_800)]
    tests.append({"input": fmt_tree_weighted(6_800, e12), "hidden": True, "expected": str(6_799 * 10**9)})

    # Test 13: Deep bamboo N=10000 with small weights 1..99 (~135KB)
    e13 = [(i, i + 1, rng.randint(1, 99)) for i in range(1, 10_000)]
    tests.append({"input": fmt_tree_weighted(10_000, e13), "hidden": True})

    # Test 14: Broom graph N=6500 (handle 3000 + star 3500)
    e14 = [(i, i + 1, rng.randint(10**8, 10**9)) for i in range(1, 3_000)]
    e14 += [(3_000, i, rng.randint(1, 10**9)) for i in range(3_001, 6_501)]
    tests.append({"input": fmt_tree_weighted(6_500, e14), "hidden": True})

    # Test 15: Random shuffled tree N=6800
    tests.append({"input": fmt_tree_weighted(6_800, make_random_tree(rng, 6_800, 1, 10**9)), "hidden": True})

    # Test 16: Twin heavy deep branches where root 1 is tiny stub
    e16 = [(1, 2, 1)]
    # Branch A: 2 -> 3 -> ... -> 3400
    e16 += [(i, i + 1, rng.randint(5 * 10**8, 10**9)) for i in range(2, 3_400)]
    # Branch B: 2 -> 3401 -> ... -> 6800
    e16.append((2, 3_401, rng.randint(5 * 10**8, 10**9)))
    e16 += [(i, i + 1, rng.randint(5 * 10**8, 10**9)) for i in range(3_401, 6_800)]
    tests.append({"input": fmt_tree_weighted(6_800, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 40)
        edges = make_random_tree(rng, n, 1, 10**9)
        extra_stress.append(fmt_tree_weighted(n, edges))

    statement = r"""Một mạng lưới giao thông có cấu trúc hình cây gồm $N$ thành phố được đánh số từ $1$ đến $N$ và $N - 1$ tuyến đường hai chiều. Tuyến đường thứ $i$ nối trực tiếp hai thành phố $u_i$ và $v_i$ với độ dài nguyên dương $w_i$. Do mạng lưới là một cây, giữa hai thành phố bất kỳ luôn tồn tại duy nhất một đường đi đơn.

**Đường kính của cây** được định nghĩa là khoảng cách lớn nhất (tổng trọng số các cạnh trên đường đi đơn) giữa hai đỉnh bất kỳ $x, y \in \{1, 2, \dots, N\}$ trên cây (với $N = 1$, đường kính bằng $0$).

Hãy tính đường kính của cây đã cho.

### Dữ liệu vào
- Dòng đầu tiên chứa một số nguyên $N$ ($1 \le N \le 25\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $1 \le w_i \le 10^9$) mô tả một cạnh của cây.

### Kết quả
- Một số nguyên duy nhất là đường kính của cây.

### Ràng buộc
- $1 \le N \le 25\,000$
- $1 \le w_i \le 10^9$
- Dữ liệu đảm bảo đồ thị là một cây hợp lệ."""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Nếu thử duyệt từ mọi đỉnh để tính khoảng cách lớn nhất, độ phức tạp sẽ là $O(N^2)$ và quá chậm khi $N$ lớn. Cây có tính chất hình học rất đẹp giúp tìm đường kính chỉ với **2 lần duyệt**.

**Gợi ý 2 (Ý tưởng thuật toán — 2 lần BFS/DFS):**
1. Chọn một đỉnh bất kỳ (ví dụ đỉnh $1$), duyệt toàn bộ cây để tìm đỉnh $A$ có khoảng cách lớn nhất từ đỉnh $1$. Với trọng số cạnh không âm, $A$ luôn là một đầu mút của đường kính cây.
2. Từ đỉnh $A$, duyệt cây lần thứ hai để tìm khoảng cách lớn nhất tới mọi đỉnh khác. Giá trị lớn nhất thu được chính là đường kính của cây.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Tổng trọng số trên đường đi có thể lên tới $(N - 1) \cdot 10^9 \approx 2.5 \times 10^{13}$, vượt xa kiểu số nguyên $32$-bit. Trong C++ bắt buộc dùng `long long`.
- Dùng BFS/DFS lặp thay vì đệ quy để không bị tràn ngăn xếp khi cây suy biến thành đường thẳng dài."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<vector<pair<int, long long>>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    auto farthest = [&](int start) -> pair<int, long long> {
        vector<long long> dist(n + 1, -1);
        vector<int> q;
        q.reserve(n);
        dist[start] = 0;
        q.push_back(start);

        int bestNode = start;
        long long bestDist = 0;

        for (size_t head = 0; head < q.size(); ++head) {
            int u = q[head];
            if (dist[u] > bestDist) {
                bestDist = dist[u];
                bestNode = u;
            }
            for (const auto& [v, w] : adj[u]) {
                if (dist[v] == -1) {
                    dist[v] = dist[u] + w;
                    q.push_back(v);
                }
            }
        }
        return {bestNode, bestDist};
    };

    auto [a, d1] = farthest(1);
    auto [b, diameter] = farthest(a);
    cout << diameter << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    adj = [[] for _ in range(n + 1)]
    idx = 1
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    def farthest(start: int):
        dist = [-1] * (n + 1)
        dist[start] = 0
        stack = [start]
        best_node = start
        best_dist = 0
        while stack:
            u = stack.pop()
            du = dist[u]
            if du > best_dist:
                best_dist = du
                best_node = u
            for v, w in adj[u]:
                if dist[v] == -1:
                    dist[v] = du + w
                    stack.append(v)
        return best_node, best_dist

    a, _ = farthest(1)
    _, diameter = farthest(a)
    sys.stdout.write(f"{diameter}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-tree-diameter",
        "title": "Đường kính của cây có trọng số",
        "shortDescription": "Tìm khoảng cách lớn nhất giữa hai đỉnh bất kỳ trên cây có trọng số cạnh nguyên dương bằng hai lần duyệt BFS/DFS.",
        "difficulty": "easy",
        "estimatedTime": 25,
        "skillId": "algo.graph_traversal",
        "tags": ["cây", "đồ thị", "bfs-dfs", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N), sử dụng 2 lần BFS/DFS lặp và kiểu số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp09-bipartite-two-teams
# ============================================================================

def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    edges = []
    idx = 2
    for _ in range(m):
        u, v = toks[idx] - 1, toks[idx + 1] - 1
        idx += 2
        edges.append((u, v))

    # Exhaustive 2^N bitmask search (1 = Team 1, 0 = Team 2)
    best = -1
    for mask in range(1 << n):
        ok = True
        for u, v in edges:
            if ((mask >> u) & 1) == ((mask >> v) & 1):
                ok = False
                break
        if ok:
            cnt = mask.bit_count()
            if cnt > best:
                best = cnt
    if best == -1:
        return "NO"
    return f"YES\n{best}"


def build_p04() -> dict:
    rng = random.Random(904)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_unweighted(6, [(1, 2), (2, 3), (4, 5)]),
            "hidden": False,
            "expected": "YES\n4",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(3, [(1, 2), (2, 3), (3, 1)]),
            "hidden": False,
            "expected": "NO",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(4, []),
            "hidden": False,
            "expected": "YES\n4",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_unweighted(1, []),
            "hidden": True,
            "expected": "YES\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(3, [(2, 2)]),
            "hidden": True,
            "expected": "NO",
            "checkBrute": True,
        },
        {
            # Even C4 + Odd C5
            "input": fmt_graph_unweighted(
                9,
                [(1, 2), (2, 3), (3, 4), (4, 1), (5, 6), (6, 7), (7, 8), (8, 9), (9, 5)],
            ),
            "hidden": True,
            "expected": "NO",
            "checkBrute": True,
        },
        {
            # Even C6 + Star K_{1,4}
            "input": fmt_graph_unweighted(
                11,
                [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 1), (7, 8), (7, 9), (7, 10), (7, 11)],
            ),
            "hidden": True,
            "expected": "YES\n7",
            "checkBrute": True,
        },
        {
            # Multi-edges on bipartite graph
            "input": fmt_graph_unweighted(
                6,
                [(1, 2), (1, 2), (2, 3), (3, 2), (1, 4), (4, 5), (5, 6), (6, 1)],
            ),
            "hidden": True,
            "expected": "YES\n3",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    # Test 9: Random bipartite N=14 (brute verified)
    side9 = [rng.randint(0, 1) for _ in range(15)]
    e9 = []
    for _ in range(30):
        u, v = rng.randint(1, 14), rng.randint(1, 14)
        if side9[u] != side9[v]:
            e9.append((u, v))
    tests.append({"input": fmt_graph_unweighted(14, e9), "hidden": True, "checkBrute": True})

    # Test 10: Random general N=14 (brute verified)
    e10 = [(rng.randint(1, 14), rng.randint(1, 14)) for _ in range(25)]
    tests.append({"input": fmt_graph_unweighted(14, e10), "hidden": True, "checkBrute": True})

    # Test 11: Even cycle C_10000
    e11 = [(i, i + 1) for i in range(1, 10_000)] + [(10_000, 1)]
    tests.append({"input": fmt_graph_unweighted(10_000, e11), "hidden": True, "expected": "YES\n5000"})

    # Test 12: Odd cycle C_10001
    e12 = [(i, i + 1) for i in range(1, 10_001)] + [(10_001, 1)]
    tests.append({"input": fmt_graph_unweighted(10_001, e12), "hidden": True, "expected": "NO"})

    # Test 13: Unbalanced forest of stars N=25000, M=10500
    e13 = []
    cur = 1
    while cur + 15 <= 25_000 and len(e13) + 14 <= 10_500:
        for k in range(1, 15):
            e13.append((cur, cur + k))
        cur += 15
    tests.append({"input": fmt_graph_unweighted(25_000, e13), "hidden": True})

    # Test 14: Large random bipartite N=15000, M=11000
    side14 = [rng.randint(0, 1) for _ in range(15_001)]
    left14 = [i for i in range(1, 15_001) if side14[i] == 0]
    right14 = [i for i in range(1, 15_001) if side14[i] == 1]
    e14 = [(rng.choice(left14), rng.choice(right14)) for _ in range(11_000)]
    tests.append({"input": fmt_graph_unweighted(15_000, e14), "hidden": True})

    # Test 15: Large bipartite + 1 planted odd cycle of length 101 at the end
    side15 = [rng.randint(0, 1) for _ in range(15_001)]
    left15 = [i for i in range(1, 14_800) if side15[i] == 0]
    right15 = [i for i in range(1, 14_800) if side15[i] == 1]
    e15 = [(rng.choice(left15), rng.choice(right15)) for _ in range(10_800)]
    for i in range(14_850, 14_950):
        e15.append((i, i + 1))
    e15.append((14_950, 14_850))  # 101 vertices -> odd cycle!
    tests.append({"input": fmt_graph_unweighted(15_000, e15), "hidden": True, "expected": "NO"})

    # Test 16: Max N=25000, M=11000 multi-component unbalanced bipartite (~135KB)
    e16 = []
    # Group 1: unbalanced K_{a, b} sparse on 1..12000 (3000 on side 0, 9000 on side 1)
    g1_a = list(range(1, 3_001))
    g1_b = list(range(3_001, 12_001))
    for _ in range(7_000):
        e16.append((rng.choice(g1_a), rng.choice(g1_b)))
    # Group 2: unbalanced on 12001..20000 (2000 vs 6000)
    g2_a = list(range(12_001, 14_001))
    g2_b = list(range(14_001, 20_001))
    for _ in range(4_000):
        e16.append((rng.choice(g2_a), rng.choice(g2_b)))
    tests.append({"input": fmt_graph_unweighted(25_000, e16), "hidden": True})

    extra_stress = []
    for t in range(30):
        n = rng.randint(1, 13)
        if t % 2 == 0:
            # Bipartite-biased
            side = [rng.randint(0, 1) for _ in range(n + 1)]
            m = rng.randint(0, 2 * n)
            edges = []
            for _ in range(m):
                u, v = rng.randint(1, n), rng.randint(1, n)
                if side[u] != side[v]:
                    edges.append((u, v))
        else:
            m = rng.randint(0, 2 * n)
            edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_graph_unweighted(n, edges))

    statement = r"""Câu lạc bộ Tin học có $N$ học sinh được đánh số từ $1$ đến $N$ và $M$ cặp học sinh không hòa hợp với nhau. Mỗi cặp $(u_i, v_i)$ cho biết học sinh $u_i$ và học sinh $v_i$ **không thể** ở chung một đội (một cặp có thể bị liệt kê nhiều lần, và nếu $u_i = v_i$ thì học sinh đó tự mâu thuẫn với chính mình nên không thể xếp vào bất kỳ đội nào).

Ban tổ chức muốn chia tất cả $N$ học sinh vào **hai đội** (đội 1 và đội 2; một trong hai đội có thể không có học sinh nào) sao cho không có hai học sinh nào trong danh sách không hòa hợp nằm cùng đội.

Hãy kiểm tra xem có thể chia đội hợp lệ hay không:
- Nếu không thể, in ra `NO`.
- Nếu có thể, in ra `YES` ở dòng thứ nhất và ở dòng thứ hai in ra **số lượng học sinh lớn nhất** có thể xếp vào **đội 1**.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 25\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng gồm hai số nguyên $u_i, v_i$ ($1 \le u_i, v_i \le N$) biểu diễn một cặp không hòa hợp.

### Kết quả
- Nếu không thể chia hợp lệ: in một dòng `NO`.
- Nếu có thể: dòng 1 in `YES`, dòng 2 in một số nguyên duy nhất là số học sinh lớn nhất có thể xếp vào đội 1.

### Ràng buộc
- $1 \le N \le 25\,000$
- $0 \le M \le 30\,000$
- $1 \le u_i, v_i \le N$"""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Điều kiện "không có hai học sinh cùng đội nằm trong danh sách không hòa hợp" tương đương với việc đồ thị vô hướng gồm $N$ đỉnh và $M$ cạnh có thể tô bằng **2 màu** (đồ thị 2 phía — *bipartite graph*).

**Gợi ý 2 (Ý tưởng thuật toán):**
Duyệt từng thành phần liên thông chưa tô màu bằng BFS/DFS lặp:
- Gán màu `0` cho đỉnh bắt đầu, mọi đỉnh kề với đỉnh màu $c$ phải được gán màu $1 - c$.
- Nếu bắt gặp cạnh nối hai đỉnh cùng màu (kể cả khuyên $u = v$), đồ thị chứa chu trình lẻ $\Rightarrow$ in `NO` ngay lập tức.
- Đếm số đỉnh mang màu `0` là $A$ và số đỉnh mang màu `1` là $B$ trong thành phần liên thông đó.

**Gợi ý 3 (Tối ưu số lượng đội 1 & bẫy thường gặp):**
Vì các thành phần liên thông hoàn toàn độc lập nhau, trong mỗi thành phần ta có thể tự do chọn phía màu `0` hoặc phía màu `1` làm đội 1. Do đó, số học sinh lớn nhất có thể xếp vào đội 1 là tổng $\sum \max(A_k, B_k)$ trên mọi thành phần liên thông $k$ (đỉnh cô lập có $A = 1, B = 0$ nên đóng góp $1$)."""

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
        if (u != v) adj[v].push_back(u);
    }

    vector<int> color(n + 1, -1);
    vector<int> q;
    q.reserve(n);
    int maxTeam1 = 0;

    for (int i = 1; i <= n; ++i) {
        if (color[i] != -1) continue;
        color[i] = 0;
        q.clear();
        q.push_back(i);
        int cnt[2] = {1, 0};

        for (size_t head = 0; head < q.size(); ++head) {
            int u = q[head];
            int cu = color[u];
            for (int v : adj[u]) {
                if (color[v] == -1) {
                    color[v] = cu ^ 1;
                    ++cnt[color[v]];
                    q.push_back(v);
                } else if (color[v] == cu) {
                    cout << "NO\n";
                    return 0;
                }
            }
        }
        maxTeam1 += max(cnt[0], cnt[1]);
    }

    cout << "YES\n" << maxTeam1 << '\n';
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
        if u != v:
            adj[v].append(u)

    color = [-1] * (n + 1)
    max_team1 = 0

    for i in range(1, n + 1):
        if color[i] != -1:
            continue
        color[i] = 0
        stack = [i]
        c0 = 1
        c1 = 0
        while stack:
            u = stack.pop()
            cu = color[u]
            nc = cu ^ 1
            for v in adj[u]:
                cv = color[v]
                if cv == -1:
                    color[v] = nc
                    if nc == 0:
                        c0 += 1
                    else:
                        c1 += 1
                    stack.append(v)
                elif cv == cu:
                    sys.stdout.write("NO\n")
                    return
        max_team1 += c0 if c0 >= c1 else c1

    sys.stdout.write(f"YES\n{max_team1}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-bipartite-two-teams",
        "title": "Chia hai đội tuyển không xung đột",
        "shortDescription": "Kiểm tra đồ thị 2 phía và tìm số lượng học sinh tối đa có thể xếp vào đội 1 sao cho không có cặp mâu thuẫn nào cùng đội.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.graph_grid_bipartite",
        "tags": ["đồ thị", "bfs-dfs", "đồ thị 2 phía", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M) bằng tô 2 màu BFS/DFS lặp.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp09-lexicographic-topo-sort
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    edges = []
    idx = 2
    for _ in range(m):
        edges.append((toks[idx], toks[idx + 1]))
        idx += 2

    # Exhaustive permutations in lexicographic order
    for perm in itertools.permutations(range(1, n + 1)):
        pos = [0] * (n + 1)
        for p_idx, node in enumerate(perm):
            pos[node] = p_idx
        if all(pos[u] < pos[v] for u, v in edges):
            return " ".join(map(str, perm))
    return "-1"


def make_random_dag_unweighted(
    rng: random.Random, n: int, m: int
) -> List[Tuple[int, int]]:
    order = list(range(1, n + 1))
    rng.shuffle(order)
    edges = []
    if n >= 2:
        for _ in range(m):
            a = rng.randrange(n)
            b = rng.randrange(n)
            if a == b:
                b = (b + 1) % n
            if a > b:
                a, b = b, a
            edges.append((order[a], order[b]))
    return edges


def build_p05() -> dict:
    rng = random.Random(905)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_unweighted(4, [(4, 2), (3, 1), (2, 1)]),
            "hidden": False,
            "expected": "3 4 2 1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(3, [(1, 2), (2, 3), (3, 1)]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(4, [(2, 1), (4, 3)]),
            "hidden": False,
            "expected": "2 1 4 3",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_unweighted(1, []),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_unweighted(3, [(2, 2)]),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            # Duplicate edges on DAG
            "input": fmt_graph_unweighted(
                5, [(5, 3), (5, 3), (3, 1), (3, 1), (4, 2), (2, 1)]
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Reverse chain 6->5->4->3->2->1
            "input": fmt_graph_unweighted(6, [(i, i - 1) for i in range(6, 1, -1)]),
            "hidden": True,
            "expected": "6 5 4 3 2 1",
            "checkBrute": True,
        },
        {
            # Disconnected cycle (0-indegree node exists, but cycle elsewhere)
            "input": fmt_graph_unweighted(5, [(1, 2), (3, 4), (4, 5), (5, 3)]),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (keep N <= 15000 and input/output < 145KB)
    tests.append({"input": fmt_graph_unweighted(8, make_random_dag_unweighted(rng, 8, 12)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_graph_unweighted(500, make_random_dag_unweighted(rng, 500, 1_500)), "hidden": True})

    # Test 11: Medium with hidden cycle
    e11 = make_random_dag_unweighted(rng, 500, 1_400)
    e11 += [(491, 492), (492, 493), (493, 491)]
    tests.append({"input": fmt_graph_unweighted(500, e11), "hidden": True, "expected": "-1"})

    # Test 12: Reverse chain N=11000 (input ~130KB, output ~60KB)
    e12 = [(i, i - 1) for i in range(11_000, 1, -1)]
    tests.append({"input": fmt_graph_unweighted(11_000, e12), "hidden": True})

    # Test 13: Layered DAG unlocking tiny labels late N=10000, M=10500
    e13 = []
    # Pair (k + 5000) -> k for k = 1..5000, plus random forward edges
    for k in range(1, 5_001):
        e13.append((k + 5_000, k))
    for _ in range(5_500):
        a = rng.randint(5_001, 10_000)
        b = rng.randint(1, 5_000)
        e13.append((a, b))
    tests.append({"input": fmt_graph_unweighted(10_000, e13), "hidden": True})

    # Test 14: Random sparse DAG N=15000, M=10500 (input ~126KB, output ~84KB)
    tests.append({"input": fmt_graph_unweighted(15_000, make_random_dag_unweighted(rng, 15_000, 10_500)), "hidden": True})

    # Test 15: Large DAG + 1 back-edge forming long cycle N=15000
    e15 = [(i, i + 1) for i in range(1, 10_001)]
    e15.append((10_001, 5_000))
    tests.append({"input": fmt_graph_unweighted(15_000, e15), "hidden": True, "expected": "-1"})

    # Test 16: Anti-FIFO/DFS heap stress N=15000, M=10000
    e16 = []
    # Build chains of length 3 where heads are large and tails are small
    for k in range(1, 5_001):
        e16.append((10_000 + k, 5_000 + k))
        e16.append((5_000 + k, k))
    tests.append({"input": fmt_graph_unweighted(15_000, e16), "hidden": True})

    extra_stress = []
    for t in range(25):
        n = rng.randint(1, 8)
        m = rng.randint(0, 14)
        if t % 3 != 0:
            edges = make_random_dag_unweighted(rng, n, m)
        else:
            edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_graph_unweighted(n, edges))

    statement = r"""Một dự án phần mềm gồm $N$ công việc được đánh số từ $1$ đến $N$ và $M$ ràng buộc thứ tự có hướng. Mỗi ràng buộc $(u, v)$ yêu cầu công việc $u$ phải hoàn thành **trước** công việc $v$ (có thể có nhiều ràng buộc trùng nhau giữa cùng một cặp công việc).

Hãy tìm một **thứ tự sắp xếp Topo** — tức một hoán vị $(p_1, p_2, \dots, p_N)$ của $\{1, 2, \dots, N\}$ sao cho với mọi cạnh có hướng $u \to v$, đỉnh $u$ xuất hiện trước đỉnh $v$ trong hoán vị — đồng thời hoán vị $p$ là **nhỏ nhất theo thứ tự từ điển**.

Nếu không tồn tại thứ tự thực hiện hợp lệ (đồ thị có chu trình), hãy in ra `-1`.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 20\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng gồm hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cạnh có hướng $u \to v$.

### Kết quả
- Nếu đồ thị có chu trình, in `-1`.
- Ngược lại, in ra $N$ số nguyên trên một dòng, cách nhau bởi dấu cách, biểu diễn thứ tự Topo nhỏ nhất theo thứ tự từ điển.

### Ràng buộc
- $1 \le N \le 20\,000$
- $0 \le M \le 30\,000$
- $1 \le u, v \le N$"""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Tại mỗi bước chọn đỉnh tiếp theo cho hoán vị Topo, tập các ứng viên hợp lệ chính là toàn bộ các đỉnh chưa được chọn và hiện có **bán bậc vào (in-degree) bằng $0$**.

**Gợi ý 2 (Ý tưởng thuật toán — Kahn + Min-Heap):**
Để kết quả có thứ tự từ điển nhỏ nhất, ở mọi bước ta tham lam chọn ứng viên có **chỉ số nhỏ nhất** trong tập các đỉnh đang có bán bậc vào bằng $0$:
- Đưa tất cả các đỉnh có `indeg[i] == 0` vào một **Min-Heap** (`priority_queue` với `greater<int>` trong C++, `heapq` trong Python).
- Lặp chừng nào heap khác rỗng: lấy đỉnh nhỏ nhất $u$ đưa vào danh sách kết quả, rồi giảm `indeg[v]` của mọi đỉnh kề $v$; nếu `indeg[v]` về $0$, đẩy $v$ vào heap.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Không dùng hàng đợi FIFO thông thường hay DFS đảo ngược vì cả hai đều không đảm bảo thứ tự từ điển nhỏ nhất (ví dụ: đồ thị `2 -> 1`, `4 -> 3` có đáp án là `2 1 4 3`, không phải `2 4 1 3`).
- Nếu sau khi heap rỗng mà số đỉnh thu được nhỏ hơn $N$, đồ thị chắc chắn có chu trình $\Rightarrow$ in `-1`."""

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

    priority_queue<int, vector<int>, greater<int>> pq;
    for (int i = 1; i <= n; ++i) {
        if (indeg[i] == 0) pq.push(i);
    }

    vector<int> order;
    order.reserve(n);
    while (!pq.empty()) {
        int u = pq.top();
        pq.pop();
        order.push_back(u);
        for (int v : adj[u]) {
            if (--indeg[v] == 0) {
                pq.push(v);
            }
        }
    }

    if ((int)order.size() < n) {
        cout << -1 << '\n';
    } else {
        for (int i = 0; i < n; ++i) {
            if (i) cout << ' ';
            cout << order[i];
        }
        cout << '\n';
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
    indeg = [0] * (n + 1)
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        indeg[v] += 1

    pq = [i for i in range(1, n + 1) if indeg[i] == 0]
    heapq.heapify(pq)

    order = []
    while pq:
        u = heapq.heappop(pq)
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                heapq.heappush(pq, v)

    if len(order) < n:
        sys.stdout.write("-1\n")
    else:
        sys.stdout.write(" ".join(map(str, order)) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-lexicographic-topo-sort",
        "title": "Thứ tự công việc nhỏ nhất theo từ điển",
        "shortDescription": "Tìm thứ tự sắp xếp Topo có thứ tự từ điển nhỏ nhất trên đồ thị có hướng bằng thuật toán Kahn kết hợp Min-Heap.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.graph_topo_dag",
        "tags": ["đồ thị", "topo sort", "heap", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + M) log N) bằng Kahn's Algorithm + Min-Heap.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp09-minimum-spanning-tree-kruskal
# ============================================================================

def brute_p06(inp: str) -> str:
    # Independent O(N^2) dense Prim's algorithm (no DSU, no edge sorting)
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    INF = 10**18
    mat = [[INF] * (n + 1) for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        if u != v and w < mat[u][v]:
            mat[u][v] = w
            mat[v][u] = w

    in_mst = [False] * (n + 1)
    key = [INF] * (n + 1)
    key[1] = 0
    total = 0
    for _ in range(n):
        u = -1
        best = INF
        for i in range(1, n + 1):
            if not in_mst[i] and key[i] < best:
                best = key[i]
                u = i
        if u == -1:
            return "-1"
        in_mst[u] = True
        total += best
        row = mat[u]
        for v in range(1, n + 1):
            if not in_mst[v] and row[v] < key[v]:
                key[v] = row[v]
    return str(total)


def build_p06() -> dict:
    rng = random.Random(906)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 3), (1, 3, 1), (2, 3, 2), (2, 4, 4), (3, 4, 5)]
            ),
            "hidden": False,
            "expected": "7",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(4, [(1, 2, 5), (3, 4, 7)]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                3, [(1, 1, 1), (1, 2, 10), (1, 2, 4), (2, 3, 6), (1, 3, 15)]
            ),
            "hidden": False,
            "expected": "10",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_weighted(1, []),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(1, [(1, 1, 100), (1, 1, 5)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(2, []),
            "hidden": True,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            # 64-bit overflow check
            "input": fmt_graph_weighted(5, [(i, i + 1, 10**9) for i in range(1, 5)]),
            "hidden": True,
            "expected": "4000000000",
            "checkBrute": True,
        },
        {
            # Complete K6 all equal huge weights
            "input": fmt_graph_weighted(
                6, [(i, j, 10**9) for i in range(1, 7) for j in range(i + 1, 7)]
            ),
            "hidden": True,
            "expected": "5000000000",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 145KB)
    e9 = [(rng.randint(1, 60), rng.randint(1, 60), rng.randint(1, 10**9)) for _ in range(300)]
    tests.append({"input": fmt_graph_weighted(60, e9), "hidden": True, "checkBrute": True})

    e10 = [(rng.randint(1, 150), rng.randint(1, 150), rng.randint(1, 10**6)) for _ in range(600)]
    tests.append({"input": fmt_graph_weighted(150, e10), "hidden": True, "checkBrute": True})

    # Test 11: Large disconnected graph (2 components)
    e11 = make_random_tree(rng, 2_500, 1, 10**9)
    t11b = make_random_tree(rng, 2_500, 1, 10**9)
    e11 += [(u + 2_500, v + 2_500, w) for u, v, w in t11b]
    for _ in range(1_000):
        u, v = rng.randint(1, 2_500), rng.randint(1, 2_500)
        e11.append((u, v, rng.randint(1, 10**9)))
    tests.append({"input": fmt_graph_weighted(5_000, e11), "hidden": True, "expected": "-1"})

    # Test 12: Connected random graph N=4000, M=6400
    e12 = make_random_tree(rng, 4_000, 10**6, 10**9)
    for _ in range(2_401):
        e12.append((rng.randint(1, 4_000), rng.randint(1, 4_000), rng.randint(1, 10**9)))
    rng.shuffle(e12)
    tests.append({"input": fmt_graph_weighted(4_000, e12), "hidden": True})

    # Test 13: Heavy chain + cheaper chord shortcuts N=4500, M=6500
    e13 = [(i, i + 1, 10**9) for i in range(1, 4_500)]
    for _ in range(2_001):
        u = rng.randint(1, 4_500)
        v = rng.randint(1, 4_500)
        e13.append((u, v, rng.randint(1, 10**5)))
    rng.shuffle(e13)
    tests.append({"input": fmt_graph_weighted(4_500, e13), "hidden": True})

    # Test 14: Equal huge weights N=5000, M=6400
    e14 = [(u, v, 10**9) for u, v, _ in make_random_tree(rng, 5_000, 1, 1)]
    for _ in range(1_401):
        e14.append((rng.randint(1, 5_000), rng.randint(1, 5_000), 10**9))
    tests.append({"input": fmt_graph_weighted(5_000, e14), "hidden": True, "expected": str(4_999 * 10**9)})

    # Test 15: Multi-edge heavy stress N=3000, M=6400
    e15 = make_random_tree(rng, 3_000, 10**8, 10**9)
    for u, v, w in e15[:2_000]:
        e15.append((u, v, rng.randint(1, w)))
    for _ in range(1_401):
        u = rng.randint(1, 3_000)
        e15.append((u, u, rng.randint(1, 100)))
    rng.shuffle(e15)
    tests.append({"input": fmt_graph_weighted(3_000, e15), "hidden": True})

    # Test 16: Large sparse N=6000, M=6500 with w in [1, 10^9] (~140KB)
    e16 = make_random_tree(rng, 6_000, 1, 10**9)
    for _ in range(501):
        e16.append((rng.randint(1, 6_000), rng.randint(1, 6_000), rng.randint(1, 10**9)))
    rng.shuffle(e16)
    tests.append({"input": fmt_graph_weighted(6_000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        m = rng.randint(0, 80)
        edges = [(rng.randint(1, n), rng.randint(1, n), rng.randint(1, 10**9)) for _ in range(m)]
        extra_stress.append(fmt_graph_weighted(n, edges))

    statement = r"""Một tỉnh có $N$ khu dân cư được đánh số từ $1$ đến $N$ và $M$ phương án lắp đặt tuyến cáp quang hai chiều. Phương án thứ $i$ kết nối trực tiếp hai khu dân cư $u_i$ và $v_i$ với chi phí nguyên dương $w_i$ (dữ liệu có thể chứa nhiều phương án nối cùng một cặp đỉnh, cạnh khuyên $u_i = v_i$, và đồ thị có thể không liên thông).

Hãy chọn một tập con các tuyến cáp sao cho tất cả $N$ khu dân cư đều kết nối được với nhau (trực tiếp hoặc gián tiếp) với **tổng chi phí nhỏ nhất có thể**. Nếu đồ thị không liên thông (không thể nối đủ $N$ khu dân cư), hãy in ra `-1`.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 25\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng gồm ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $1 \le w_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là tổng trọng số của cây khung nhỏ nhất (bằng $0$ nếu $N = 1$), hoặc `-1` nếu đồ thị không liên thông.

### Ràng buộc
- $1 \le N \le 25\,000$
- $0 \le M \le 30\,000$
- $1 \le u_i, v_i \le N$, $1 \le w_i \le 10^9$"""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Tập cạnh nhỏ nhất nối liên thông $N$ đỉnh chính là một **cây khung nhỏ nhất (Minimum Spanning Tree — MST)** gồm đúng $N - 1$ cạnh không tạo chu trình.

**Gợi ý 2 (Ý tưởng thuật toán — Kruskal + DSU):**
1. Sắp xếp toàn bộ $M$ cạnh theo trọng số $w_i$ tăng dần.
2. Khởi tạo cấu trúc **DSU (Disjoint Set Union)** cho $N$ đỉnh riêng biệt.
3. Duyệt lần lượt từng cạnh $(u, v, w)$ đã sắp xếp: nếu `find(u) != find(v)`, ta hợp nhất hai thành phần, cộng $w$ vào tổng chi phí và tăng số cạnh đã chọn thêm $1$.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Sau khi duyệt hết các cạnh, kiểm tra nếu số cạnh chọn được đúng bằng $N - 1$ thì in tổng chi phí, ngược lại in `-1`. Cách kiểm tra này tự động xử lý đúng cả trường hợp $N = 1$ (chọn $0 = N - 1$ cạnh, tổng bằng $0$), khuyên và đa cạnh!
- Dùng `long long` trong C++ và cài DSU có nén đường (path compression) + gộp theo kích thước (union by size) để đạt $O(M \log M)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct Edge {
    int u, v;
    long long w;
};

struct DSU {
    vector<int> parent, sz;
    DSU(int n) : parent(n + 1), sz(n + 1, 1) {
        iota(parent.begin(), parent.end(), 0);
    }
    int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a;
        sz[a] += sz[b];
        return true;
    }
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<Edge> edges(m);
    for (int i = 0; i < m; ++i) {
        cin >> edges[i].u >> edges[i].v >> edges[i].w;
    }

    sort(edges.begin(), edges.end(), [](const Edge& a, const Edge& b) {
        return a.w < b.w;
    });

    DSU dsu(n);
    long long total = 0;
    int used = 0;

    for (const auto& e : edges) {
        if (dsu.unite(e.u, e.v)) {
            total += e.w;
            ++used;
            if (used == n - 1) break;
        }
    }

    if (used == n - 1) {
        cout << total << '\n';
    } else {
        cout << -1 << '\n';
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

    edges = []
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        edges.append((w, u, v))

    edges.sort(key=lambda e: e[0])

    parent = list(range(n + 1))
    sz = [1] * (n + 1)

    total = 0
    used = 0
    for w, u, v in edges:
        while parent[u] != u:
            parent[u] = parent[parent[u]]
            u = parent[u]
        while parent[v] != v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        if u != v:
            if sz[u] < sz[v]:
                u, v = v, u
            parent[v] = u
            sz[u] += sz[v]
            total += w
            used += 1
            if used == n - 1:
                break

    if used == n - 1:
        sys.stdout.write(f"{total}\n")
    else:
        sys.stdout.write("-1\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-minimum-spanning-tree-kruskal",
        "title": "Cây khung nhỏ nhất (Kruskal)",
        "shortDescription": "Tìm tổng trọng số nhỏ nhất của cây khung nối toàn bộ đồ thị vô hướng bằng thuật toán Kruskal và DSU.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.graph_dsu_mst",
        "tags": ["đồ thị", "dsu", "mst", "tham lam", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(M log M) bằng thuật toán Kruskal và DSU.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp09-dijkstra-shortest-path
# ============================================================================

def brute_p07(inp: str) -> str:
    # Independent all-simple-paths DFS oracle (valid since w >= 0 and no 0-weight cycles)
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    adj: List[List[Tuple[int, int]]] = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))

    INF = 10**30
    best_dist = INF
    best_cnt = 0
    vis = [False] * (n + 1)

    def dfs(u: int, cur_d: int) -> None:
        nonlocal best_dist, best_cnt
        if cur_d > best_dist:
            return
        if u == n:
            if cur_d < best_dist:
                best_dist = cur_d
                best_cnt = 1
            elif cur_d == best_dist:
                best_cnt = (best_cnt + 1) % MOD
            return
        for v, w in adj[u]:
            if not vis[v]:
                vis[v] = True
                dfs(v, cur_d + w)
                vis[v] = False

    vis[1] = True
    dfs(1, 0)
    if best_dist == INF:
        return "-1 0"
    return f"{best_dist} {best_cnt}"


def make_no_zero_cycle_graph(
    rng: random.Random, n: int, m: int, zero_prob: float, w_max: int
) -> List[Tuple[int, int, int]]:
    # Assign a hidden topo rank so 0-weight edges strictly increase rank (zero-cycles impossible!)
    rank = list(range(n + 1))
    perm = list(range(1, n + 1))
    rng.shuffle(perm)
    for idx, node in enumerate(perm):
        rank[node] = idx

    edges = []
    for _ in range(m):
        u = rng.randint(1, n)
        v = rng.randint(1, n)
        if rng.random() < zero_prob and rank[u] < rank[v]:
            w = 0
        else:
            w = rng.randint(1, w_max)
        edges.append((u, v, w))
    return edges


def build_p07() -> dict:
    rng = random.Random(907)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 2), (2, 4, 3), (1, 3, 1), (3, 4, 4), (1, 4, 6)]
            ),
            "hidden": False,
            "expected": "5 2",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(4, [(1, 2, 5), (3, 4, 2)]),
            "hidden": False,
            "expected": "-1 0",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(
                4, [(1, 2, 0), (2, 4, 5), (1, 3, 5), (3, 4, 0), (1, 4, 5)]
            ),
            "hidden": False,
            "expected": "5 3",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_weighted(1, []),
            "hidden": True,
            "expected": "0 1",
            "checkBrute": True,
        },
        {
            # Positive self-loops and duplicate parallel edges
            "input": fmt_graph_weighted(
                3,
                [(1, 1, 5), (1, 2, 4), (1, 2, 4), (2, 3, 3), (2, 3, 3), (1, 3, 7)],
            ),
            "hidden": True,
            "expected": "7 5",
            "checkBrute": True,
        },
        {
            # Zero-weight edge order trap: 2 and 3 both at dist 2, edge 3->2 has weight 0!
            "input": fmt_graph_weighted(
                4, [(1, 2, 2), (1, 3, 2), (3, 2, 0), (2, 4, 1)]
            ),
            "hidden": True,
            "expected": "3 2",
            "checkBrute": True,
        },
        {
            # 64-bit overflow path length
            "input": fmt_graph_weighted(6, [(i, i + 1, 10**9) for i in range(1, 6)]),
            "hidden": True,
            "expected": "5000000000 1",
            "checkBrute": True,
        },
        {
            # 35 chained diamonds -> 2^35 mod (10^9+7)
            "input": fmt_graph_weighted(
                71,
                [
                    e
                    for k in range(35)
                    for e in (
                        (2 * k + 1, 2 * k + 2, 1),
                        (2 * k + 2, 2 * k + 3, 2),
                        (2 * k + 1, 2 * k + 3, 3),
                    )
                ],
            ),
            "hidden": True,
            "expected": f"{35 * 3} {pow(2, 35, MOD)}",
        },
    ]

    # 8 medium -> large tests (all < 145KB)
    tests.append({"input": fmt_graph_weighted(8, make_no_zero_cycle_graph(rng, 8, 20, 0.25, 10)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_graph_weighted(8, make_no_zero_cycle_graph(rng, 8, 22, 0.4, 5)), "hidden": True, "checkBrute": True})

    # Test 11: Chain of 100 diamonds with 3 parallel choices per block -> 3^100 mod MOD
    e11 = []
    # Vertices: 1 -> (2, 3, 4) -> 5 -> ...; 100 blocks -> 401 vertices
    for k in range(100):
        s = 4 * k + 1
        t = 4 * k + 5
        e11.append((s, s + 1, 5))
        e11.append((s + 1, t, 5))
        e11.append((s, s + 2, 3))
        e11.append((s + 2, t, 7))
        e11.append((s, s + 3, 0))
        e11.append((s + 3, t, 10))
    tests.append({"input": fmt_graph_weighted(401, e11), "hidden": True, "expected": f"1000 {pow(3, 100, MOD)}"})

    # Test 12: Medium random graph N=1000, M=4000
    tests.append({"input": fmt_graph_weighted(1_000, make_no_zero_cycle_graph(rng, 1_000, 4_000, 0.05, 10**6)), "hidden": True})

    # Test 13: Large layered DAG with massive shortest path count N=3000, M=6500
    e13 = []
    # Layers of size 3: layer 0 has node 1; layers 1..999 have 3 nodes each; last node 3000
    for c in range(3):
        e13.append((1, 2 + c, 10**7))
    for layer in range(998):
        base = 2 + 3 * layer
        nxt = base + 3
        for a in range(3):
            for b in range(2):
                e13.append((base + a, nxt + ((a + b) % 3), 10**7))
    last_base = 2 + 3 * 998
    for c in range(3):
        e13.append((last_base + c, 3_000, 10**7))
    tests.append({"input": fmt_graph_weighted(3_000, e13), "hidden": True})

    # Test 14: Long chain + shortcuts N=5000, M=6500 with huge weights
    e14 = [(i, i + 1, rng.randint(10**8, 10**9)) for i in range(1, 5_000)]
    for _ in range(1_501):
        u = rng.randint(1, 4_900)
        v = min(5_000, u + rng.randint(1, 80))
        e14.append((u, v, rng.randint(1, 10**9)))
    rng.shuffle(e14)
    tests.append({"input": fmt_graph_weighted(5_000, e14), "hidden": True})

    # Test 15: Large unreachable N=5000, M=6000
    e15 = make_no_zero_cycle_graph(rng, 4_999, 6_000, 0.05, 10**9)
    tests.append({"input": fmt_graph_weighted(5_000, e15), "hidden": True, "expected": "-1 0"})

    # Test 16: Large general graph N=6000, M=6500 with 0-weights & huge weights (~140KB)
    e16 = [(i, i + 1, rng.randint(1, 10**9)) for i in range(1, 6_000)]
    e16 += make_no_zero_cycle_graph(rng, 6_000, 501, 0.15, 10**9)
    rng.shuffle(e16)
    tests.append({"input": fmt_graph_weighted(6_000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 8)
        m = rng.randint(0, 18)
        edges = make_no_zero_cycle_graph(rng, n, m, 0.25, 6)
        extra_stress.append(fmt_graph_weighted(n, edges))

    statement = r"""Cho một đồ thị có hướng có trọng số không âm gồm $N$ đỉnh (đánh số từ $1$ đến $N$) và $M$ cạnh có hướng. Cạnh thứ $i$ đi từ đỉnh $u_i$ đến đỉnh $v_i$ với trọng số nguyên $w_i$ ($0 \le w_i \le 10^9$). Đồ thị có thể có cạnh song song (các cạnh song song có chỉ số khác nhau được xem là phân biệt) và cạnh khuyên, đồng thời đảm bảo **không tồn tại chu trình có tổng trọng số bằng $0$**.

Hãy tìm:
1. Độ dài của đường đi ngắn nhất từ đỉnh $1$ đến đỉnh $N$.
2. Số lượng đường đi ngắn nhất đạt đúng độ dài đó, lấy phần dư khi chia cho $10^9 + 7$.

Nếu không tồn tại đường đi từ đỉnh $1$ đến đỉnh $N$, hãy in ra `-1 0`. (Với $N = 1$, đường đi ngắn nhất là đường đi rỗng có độ dài $0$ và số cách là $1$.)

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 20\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng gồm ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $0 \le w_i \le 10^9$).

### Kết quả
- Một dòng duy nhất gồm hai số nguyên cách nhau bởi dấu cách: độ dài đường đi ngắn nhất và số lượng đường đi ngắn nhất theo modulo $10^9 + 7$ (hoặc `-1 0` nếu không đến được đỉnh $N$).

### Ràng buộc
- $1 \le N \le 20\,000$
- $0 \le M \le 30\,000$
- $0 \le w_i \le 10^9$, không có chu trình tổng trọng số bằng $0$."""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Vì trọng số các cạnh đều không âm ($w_i \ge 0$), ta dùng thuật toán **Dijkstra** với hàng đợi ưu tiên (Min-Heap) để tìm mảng khoảng cách ngắn nhất `dist[1..N]` từ đỉnh $1$ trong $O((N + M) \log N)$.

**Gợi ý 2 (Ý tưởng đếm số đường đi ngắn nhất):**
- Nếu mọi cạnh đều có trọng số dương ($w_i > 0$), có thể cập nhật trực tiếp `ways[v]` ngay trong lúc chạy Dijkstra: khi tìm thấy đường đi ngắn hơn thì gán `ways[v] = ways[u]`; khi bằng nhau thì cộng `ways[v] = (ways[v] + ways[u]) % MOD`.
- **Cẩn thận với cạnh trọng số $0$!** Khi tồn tại cạnh $u \to v$ có $w = 0$ và `dist[u] == dist[v]`, đỉnh $v$ có thể bị lấy ra khỏi heap *trước* đỉnh $u$, khiến cách cộng trực tiếp trong Dijkstra bị sót đường đi.

**Gợi ý 3 (Cài đặt chuẩn xác cho cả $w_i = 0$):**
Sau khi Dijkstra tìm xong mảng `dist[]`, giữ lại mọi cạnh "chặt" thỏa mãn `dist[u] != INF` và `dist[u] + w == dist[v]`. Vì không có chu trình trọng số $0$, tập các cạnh chặt này tạo thành một **DAG**! Ta chỉ cần chạy **Kahn Topo Sort + DP** trên DAG đó với `ways[1] = 1` và `ways[v] = (ways[v] + ways[u]) % MOD` là đảm bảo chính xác tuyệt đối 100%."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static constexpr long long INF = (1LL << 62);
static constexpr int MOD = 1000000007;

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
    }

    vector<long long> dist(n + 1, INF);
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<pair<long long, int>>> pq;
    dist[1] = 0;
    pq.push({0, 1});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d != dist[u]) continue;
        for (const auto& [v, w] : adj[u]) {
            long long nd = d + w;
            if (nd < dist[v]) {
                dist[v] = nd;
                pq.push({nd, v});
            }
        }
    }

    if (dist[n] == INF) {
        cout << "-1 0\n";
        return 0;
    }

    // Build shortest-path DAG of tight edges (handles w == 0 cleanly)
    vector<vector<int>> dag(n + 1);
    vector<int> indeg(n + 1, 0);
    for (int u = 1; u <= n; ++u) {
        if (dist[u] == INF) continue;
        for (const auto& [v, w] : adj[u]) {
            if (dist[u] + w == dist[v]) {
                dag[u].push_back(v);
                ++indeg[v];
            }
        }
    }

    queue<int> q;
    for (int i = 1; i <= n; ++i) {
        if (dist[i] != INF && indeg[i] == 0) {
            q.push(i);
        }
    }

    vector<int> ways(n + 1, 0);
    ways[1] = 1;

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        int wu = ways[u];
        for (int v : dag[u]) {
            ways[v] += wu;
            if (ways[v] >= MOD) ways[v] -= MOD;
            if (--indeg[v] == 0) {
                q.push(v);
            }
        }
    }

    cout << dist[n] << ' ' << ways[n] << '\n';
    return 0;
}"""

    py_sol = r"""import heapq
import sys


def solve() -> None:
    MOD = 1_000_000_007
    INF = 1 << 62

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

    dist = [INF] * (n + 1)
    dist[1] = 0
    pq = [(0, 1)]

    while pq:
        d, u = heapq.heappop(pq)
        if d != dist[u]:
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))

    if dist[n] == INF:
        sys.stdout.write("-1 0\n")
        return

    # Shortest-path DAG DP (exact even when 0-weight edges are present)
    dag = [[] for _ in range(n + 1)]
    indeg = [0] * (n + 1)
    for u in range(1, n + 1):
        du = dist[u]
        if du == INF:
            continue
        for v, w in adj[u]:
            if du + w == dist[v]:
                dag[u].append(v)
                indeg[v] += 1

    stack = [i for i in range(1, n + 1) if dist[i] != INF and indeg[i] == 0]
    ways = [0] * (n + 1)
    ways[1] = 1

    while stack:
        u = stack.pop()
        wu = ways[u]
        for v in dag[u]:
            nv = ways[v] + wu
            if nv >= MOD:
                nv -= MOD
            ways[v] = nv
            indeg[v] -= 1
            if indeg[v] == 0:
                stack.append(v)

    sys.stdout.write(f"{dist[n]} {ways[n]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-dijkstra-shortest-path",
        "title": "Đường đi ngắn nhất và đếm số cách (Dijkstra)",
        "shortDescription": "Tìm độ dài đường đi ngắn nhất từ đỉnh 1 đến đỉnh N trên đồ thị có hướng trọng số không âm và đếm số đường đi ngắn nhất theo modulo 10^9+7.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.graph_shortest_path",
        "tags": ["đồ thị", "dijkstra", "heap", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + M) log N) bằng Dijkstra kết hợp đếm đường đi trên DAG cạnh ngắn nhất.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp09-dag-longest-weighted-path
# ============================================================================

def brute_p08(inp: str) -> str:
    # Independent Bellman-Ford longest path relaxation (no Topo Sort)
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    edges = []
    idx = 2
    for _ in range(m):
        edges.append((toks[idx], toks[idx + 1], toks[idx + 2]))
        idx += 3

    dp = [0] * (n + 1)
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            cand = dp[u] + w
            if cand > dp[v]:
                dp[v] = cand
                changed = True
        if not changed:
            break
    return str(max(dp))


def make_random_dag_weighted(
    rng: random.Random, n: int, m: int, w_lo: int, w_hi: int
) -> List[Tuple[int, int, int]]:
    order = list(range(1, n + 1))
    rng.shuffle(order)
    edges = []
    if n >= 2:
        for _ in range(m):
            a = rng.randrange(n)
            b = rng.randrange(n)
            if a == b:
                b = (b + 1) % n
            if a > b:
                a, b = b, a
            edges.append((order[a], order[b], rng.randint(w_lo, w_hi)))
    return edges


def build_p08() -> dict:
    rng = random.Random(908)

    tests = [
        # 3 public samples
        {
            "input": fmt_graph_weighted(
                5, [(1, 2, 4), (1, 3, 2), (3, 2, 5), (2, 4, 6), (4, 5, 3)]
            ),
            "hidden": False,
            "expected": "16",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(5, [(4, 2, 10), (5, 3, 7), (3, 1, 8)]),
            "hidden": False,
            "expected": "15",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(4, []),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_weighted(1, []),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Parallel edges with different weights
            "input": fmt_graph_weighted(3, [(2, 1, 5), (2, 1, 100), (2, 1, 42)]),
            "hidden": True,
            "expected": "100",
            "checkBrute": True,
        },
        {
            # Reverse-numbered chain with 64-bit overflow
            "input": fmt_graph_weighted(6, [(i, i - 1, 10**9) for i in range(6, 1, -1)]),
            "hidden": True,
            "expected": "5000000000",
            "checkBrute": True,
        },
        {
            # Diamond with sneaky heavier multi-hop path
            "input": fmt_graph_weighted(
                6,
                [(6, 5, 10), (5, 4, 10), (4, 3, 10), (3, 2, 10), (6, 2, 35), (2, 1, 7)],
            ),
            "hidden": True,
            "expected": "47",
            "checkBrute": True,
        },
        {
            # Vertex 1 isolated, best path in component 2
            "input": fmt_graph_weighted(
                6, [(5, 4, 100), (4, 2, 200), (6, 3, 250)]
            ),
            "hidden": True,
            "expected": "300",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 145KB)
    tests.append({"input": fmt_graph_weighted(40, make_random_dag_weighted(rng, 40, 120, 1, 10**9)), "hidden": True, "checkBrute": True})
    tests.append({"input": fmt_graph_weighted(100, make_random_dag_weighted(rng, 100, 400, 1, 10**9)), "hidden": True, "checkBrute": True})

    # Test 11: Deep reverse chain N=6500 with w=10^9 (recursion & overflow killer)
    e11 = [(i, i - 1, 10**9) for i in range(6_500, 1, -1)]
    tests.append({"input": fmt_graph_weighted(6_500, e11), "hidden": True, "expected": str(6_499 * 10**9)})

    # Test 12: Chained diamonds (exponential paths -> kills naive DFS without memo!)
    # 1600 blocks -> 3201 vertices, 6400 edges
    e12 = []
    for k in range(1_600):
        s = 2 * k + 1
        m_node = 2 * k + 2
        t = 2 * k + 3
        e12.append((s, m_node, rng.randint(1, 10**9)))
        e12.append((m_node, t, rng.randint(1, 10**9)))
        e12.append((s, t, rng.randint(1, 10**9)))
        e12.append((s, t, rng.randint(1, 10**9)))
    tests.append({"input": fmt_graph_weighted(3_201, e12), "hidden": True})

    # Test 13: Random shuffled-ID DAG N=5000, M=6500
    tests.append({"input": fmt_graph_weighted(5_000, make_random_dag_weighted(rng, 5_000, 6_500, 1, 10**9)), "hidden": True})

    # Test 14: Disconnected forest of heavy DAGs N=8000, M=6000
    e14 = []
    for base in range(0, 8_000, 400):
        sub = make_random_dag_weighted(rng, 400, 300, 10**8, 10**9)
        e14 += [(u + base, v + base, w) for u, v, w in sub]
    tests.append({"input": fmt_graph_weighted(8_000, e14), "hidden": True})

    # Test 15: Dense-ish DAG N=1000, M=6500
    tests.append({"input": fmt_graph_weighted(1_000, make_random_dag_weighted(rng, 1_000, 6_500, 1, 10**9)), "hidden": True})

    # Test 16: Large shuffled DAG N=6500, M=6500 (~140KB)
    tests.append({"input": fmt_graph_weighted(6_500, make_random_dag_weighted(rng, 6_500, 6_500, 1, 10**9)), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 30)
        m = rng.randint(0, 70)
        edges = make_random_dag_weighted(rng, n, m, 1, 10**9)
        extra_stress.append(fmt_graph_weighted(n, edges))

    statement = r"""Cho một đồ thị có hướng không chu trình (**DAG**) gồm $N$ đỉnh được đánh số từ $1$ đến $N$ và $M$ cạnh có hướng. Cạnh thứ $i$ đi từ đỉnh $u_i$ đến đỉnh $v_i$ với trọng số nguyên dương $w_i$ ($1 \le w_i \le 10^9$). Đồ thị có thể không liên thông và có thể chứa cạnh song song.

Hãy tìm **tổng trọng số lớn nhất** của một đường đi có hướng bất kỳ trên đồ thị. Đường đi có thể bắt đầu tại bất kỳ đỉnh nào, kết thúc tại bất kỳ đỉnh nào, và có thể gồm $0$ cạnh (khi đó tổng trọng số bằng $0$).

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 25\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng gồm ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $1 \le w_i \le 10^9$). Đảm bảo đồ thị không có chu trình.

### Kết quả
- Một số nguyên duy nhất là tổng trọng số lớn nhất của một đường đi có hướng trên DAG.

### Ràng buộc
- $1 \le N \le 25\,000$
- $0 \le M \le 30\,000$
- $1 \le w_i \le 10^9$, đồ thị là DAG."""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Trên đồ thị tổng quát, bài toán tìm đường đi đơn dài nhất là NP-hard. Tuy nhiên trên **DAG** (không có chu trình), ta luôn có thể sắp xếp các đỉnh theo thứ tự Topo để quy hoạch động tuyến tính.

**Gợi ý 2 (Công thức Quy hoạch động):**
Gọi `dp[v]` là tổng trọng số lớn nhất của một đường đi có hướng **kết thúc tại đỉnh $v$**.
- Khởi tạo `dp[v] = 0` cho mọi $v \in [1, N]$ (ứng với đường đi độ dài $0$ bắt đầu ngay tại $v$).
- Khi duyệt đỉnh $u$ theo thứ tự Topo, với mỗi cạnh $u \to v$ có trọng số $w$, ta cập nhật:
  $$dp[v] = \max(dp[v],\ dp[u] + w)$$

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Đáp án cuối cùng là $\max_{1 \le v \le N} dp[v]$ (không giả sử đường đi phải bắt đầu từ $1$ hay kết thúc tại $N$).
- Dùng **Kahn's Algorithm** lặp để tránh lỗi tràn ngăn xếp khi DAG có chuỗi dài, và dùng kiểu số nguyên $64$-bit (`long long` trong C++) vì kết quả có thể đạt $2.5 \times 10^{13}$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<vector<pair<int, long long>>> adj(n + 1);
    vector<int> indeg(n + 1, 0);
    for (int i = 0; i < m; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        ++indeg[v];
    }

    queue<int> q;
    for (int i = 1; i <= n; ++i) {
        if (indeg[i] == 0) q.push(i);
    }

    vector<long long> dp(n + 1, 0);
    long long ans = 0;

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        ans = max(ans, dp[u]);
        for (const auto& [v, w] : adj[u]) {
            dp[v] = max(dp[v], dp[u] + w);
            if (--indeg[v] == 0) {
                q.push(v);
            }
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
    m = int(data[1])

    adj = [[] for _ in range(n + 1)]
    indeg = [0] * (n + 1)
    idx = 2
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        adj[u].append((v, w))
        indeg[v] += 1

    stack = [i for i in range(1, n + 1) if indeg[i] == 0]
    dp = [0] * (n + 1)
    ans = 0

    while stack:
        u = stack.pop()
        du = dp[u]
        if du > ans:
            ans = du
        for v, w in adj[u]:
            cand = du + w
            if cand > dp[v]:
                dp[v] = cand
            indeg[v] -= 1
            if indeg[v] == 0:
                stack.append(v)

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-dag-longest-weighted-path",
        "title": "Đường đi có tổng trọng số lớn nhất trên DAG",
        "shortDescription": "Tìm tổng trọng số lớn nhất của một đường đi có hướng bất kỳ trên đồ thị có hướng không chu trình (DAG) bằng Topo Sort kết hợp Quy hoạch động.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.graph_topo_dag",
        "tags": ["đồ thị", "topo sort", "quy hoạch động", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N + M) bằng Kahn Topo Sort + DP trên DAG.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp09-flight-discount-layered-dijkstra
# ============================================================================

def brute_p09(inp: str) -> str:
    # Independent Floyd-Warshall + enumerate every edge as the discounted flight
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    INF = 10**30
    dist = [[INF] * (n + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dist[i][i] = 0
    edges = []
    idx = 2
    for _ in range(m):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        edges.append((u, v, w))
        if w < dist[u][v]:
            dist[u][v] = w

    for k in range(1, n + 1):
        dk = dist[k]
        for i in range(1, n + 1):
            dik = dist[i][k]
            if dik == INF:
                continue
            di = dist[i]
            for j in range(1, n + 1):
                cand = dik + dk[j]
                if cand < di[j]:
                    di[j] = cand

    ans = dist[1][n]
    for u, v, w in edges:
        if dist[1][u] < INF and dist[v][n] < INF:
            cand = dist[1][u] + (w // 2) + dist[v][n]
            if cand < ans:
                ans = cand
    return "-1" if ans >= INF else str(ans)


def build_p09() -> dict:
    rng = random.Random(909)

    tests = [
        # 3 public samples
        {
            # Greedy shortest-path trap: normal shortest is 1->2->3 (10 -> 7), direct 1->3 (12 -> 6)!
            "input": fmt_graph_weighted(3, [(1, 2, 5), (2, 3, 5), (1, 3, 12)]),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        {
            "input": fmt_graph_weighted(4, [(1, 2, 5), (3, 4, 5)]),
            "hidden": False,
            "expected": "-1",
            "checkBrute": True,
        },
        {
            # Odd-weight floor division check
            "input": fmt_graph_weighted(3, [(1, 2, 7), (2, 3, 9)]),
            "hidden": False,
            "expected": "11",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_graph_weighted(1, []),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Single edge w=1 -> floor(1/2) = 0
            "input": fmt_graph_weighted(2, [(1, 2, 1)]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            # Parallel edges + self-loops
            "input": fmt_graph_weighted(
                3,
                [(1, 1, 100), (1, 2, 20), (1, 2, 15), (2, 3, 30), (2, 3, 25), (1, 3, 41)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Cycle + discount shortcut
            "input": fmt_graph_weighted(
                5,
                [(1, 2, 4), (2, 3, 4), (3, 1, 1), (2, 4, 100), (4, 5, 2), (3, 5, 55)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # 64-bit overflow test
            "input": fmt_graph_weighted(11, [(i, i + 1, 10**9) for i in range(1, 11)]),
            "hidden": True,
            "expected": "9500000000",
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 145KB)
    e9 = [(rng.randint(1, 25), rng.randint(1, 25), rng.randint(1, 10**9)) for _ in range(70)]
    tests.append({"input": fmt_graph_weighted(25, e9), "hidden": True, "checkBrute": True})

    e10 = [(rng.randint(1, 30), rng.randint(1, 30), rng.randint(1, 50)) for _ in range(110)]
    tests.append({"input": fmt_graph_weighted(30, e10), "hidden": True, "checkBrute": True})

    # Test 11: Long chain N=6000 with odd weights near 10^9
    e11 = [(i, i + 1, 10**9 - 1 - 2 * (i % 100)) for i in range(1, 6_000)]
    tests.append({"input": fmt_graph_weighted(6_000, e11), "hidden": True})

    # Test 12: Two competing highways (1 many-small-edge highway vs 1 few-huge-edge highway)
    e12 = []
    # Highway A: 1 -> 2 -> ... -> 2000 -> 4000 (each edge 500000 -> total ~10^9)
    for i in range(1, 2_000):
        e12.append((i, i + 1, 500_000))
    e12.append((2_000, 4_000, 500_000))
    # Highway B: 1 -> 2001 -> 4000 (500_000_001 + 1_000_000_000 -> halved = 1_000_000_001)
    # Plus another path 1 -> 2002 -> 4000 (400_000_000 + 999_999_999 -> halved = 899_999_999!)
    e12.append((1, 2_001, 500_000_001))
    e12.append((2_001, 4_000, 1_000_000_000))
    e12.append((1, 2_002, 400_000_000))
    e12.append((2_002, 4_000, 999_999_999))
    for _ in range(4_000):
        u = rng.randint(1, 3_999)
        v = rng.randint(2, 4_000)
        e12.append((u, v, rng.randint(10**7, 10**9)))
    tests.append({"input": fmt_graph_weighted(4_000, e12), "hidden": True})

    # Test 13: Large unreachable N=5000, M=6000
    e13 = [(rng.randint(1, 4_999), rng.randint(1, 4_999), rng.randint(1, 10**9)) for _ in range(6_000)]
    tests.append({"input": fmt_graph_weighted(5_000, e13), "hidden": True, "expected": "-1"})

    # Test 14: Directed grid-like graph 60 x 60 (N=3600, M~6400)
    e14 = []
    for r in range(60):
        for c in range(60):
            u = r * 60 + c + 1
            if c + 1 < 60:
                e14.append((u, u + 1, rng.randint(1, 10**8)))
            if r + 1 < 60:
                e14.append((u, u + 60, rng.randint(1, 10**8)))
    # Add some long expensive jumps that become attractive with coupon
    for _ in range(300):
        u = rng.randint(1, 2_000)
        v = rng.randint(2_001, 3_600)
        e14.append((u, v, rng.randint(5 * 10**8, 10**9)))
    tests.append({"input": fmt_graph_weighted(3_600, e14), "hidden": True})

    # Test 15: Random graph N=5000, M=6500
    e15 = [(i, i + 1, rng.randint(10**7, 10**9)) for i in range(1, 5_000)]
    for _ in range(1_501):
        e15.append((rng.randint(1, 5_000), rng.randint(1, 5_000), rng.randint(1, 10**9)))
    rng.shuffle(e15)
    tests.append({"input": fmt_graph_weighted(5_000, e15), "hidden": True})

    # Test 16: Max-size adversarial Dijkstra graph N=6000, M=6500 (~140KB)
    e16 = [(i, i + 1, rng.randint(1, 10**9)) for i in range(1, 6_000)]
    for _ in range(501):
        u = rng.randint(1, 5_900)
        v = min(6_000, u + rng.randint(1, 250))
        e16.append((u, v, rng.randint(1, 10**9)))
    rng.shuffle(e16)
    tests.append({"input": fmt_graph_weighted(6_000, e16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 22)
        m = rng.randint(0, 60)
        edges = [(rng.randint(1, n), rng.randint(1, n), rng.randint(1, 10**9)) for _ in range(m)]
        extra_stress.append(fmt_graph_weighted(n, edges))

    statement = r"""Mạng lưới hàng không gồm $N$ thành phố được đánh số từ $1$ đến $N$ và $M$ chuyến bay một chiều. Chuyến bay thứ $i$ đi từ thành phố $u_i$ đến thành phố $v_i$ với giá vé nguyên dương $w_i$ ($1 \le w_i \le 10^9$).

Bạn cần bay từ thành phố $1$ đến thành phố $N$ và đang sở hữu đúng **một phiếu giảm giá**. Khi đi qua một chuyến bay bất kỳ có giá vé $w$, bạn có thể sử dụng phiếu giảm giá để giảm giá vé chuyến bay đó xuống còn $\lfloor w / 2 \rfloor$ (phần nguyên của $w / 2$). Phiếu giảm giá chỉ được dùng tối đa một lần trên cả hành trình (nếu $N = 1$, chi phí là $0$).

Hãy tìm tổng chi phí nhỏ nhất để đi từ thành phố $1$ đến thành phố $N$, hoặc in ra `-1` nếu không tồn tại hành trình hợp lệ.

### Dữ liệu vào
- Dòng đầu tiên gồm hai số nguyên $N, M$ ($1 \le N \le 20\,000$, $0 \le M \le 30\,000$).
- $M$ dòng tiếp theo, mỗi dòng gồm ba số nguyên $u_i, v_i, w_i$ ($1 \le u_i, v_i \le N$, $1 \le w_i \le 10^9$).

### Kết quả
- Một số nguyên duy nhất là tổng chi phí nhỏ nhất, hoặc `-1` nếu không đến được thành phố $N$.

### Ràng buộc
- $1 \le N \le 20\,000$
- $0 \le M \le 30\,000$
- $1 \le w_i \le 10^9$"""

    hints = r"""**Gợi ý 1 (Tránh bẫy tham lam):**
Tìm đường đi ngắn nhất thông thường rồi giảm một nửa cạnh đắt nhất trên đường đi đó là **SAI**! Ví dụ: đường $1 \to 2 \to 3$ có giá $5 + 5 = 10$ (giảm giá còn $7$), trong khi đường thẳng $1 \to 3$ giá $12$ sau khi giảm giá chỉ còn $6 < 7$.

**Gợi ý 2 (Ý tưởng thuật toán — Đồ thị phân tầng / Layered Dijkstra):**
Mở rộng mỗi đỉnh $u$ thành **2 trạng thái** `(u, used)`:
- `(u, 0)`: đã đến $u$ và **chưa dùng** phiếu giảm giá.
- `(u, 1)`: đã đến $u$ và **đã dùng** phiếu giảm giá.

Với mỗi cạnh $u \to v$ có trọng số $w$:
- Từ `(u, 0)` có thể đi sang `(v, 0)` với chi phí $+w$ (không dùng phiếu) hoặc sang `(v, 1)` với chi phí $+\lfloor w / 2 \rfloor$ (dùng phiếu tại cạnh này).
- Từ `(u, 1)` chỉ có thể đi sang `(v, 1)` với chi phí $+w$.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Chạy một lần Dijkstra duy nhất trên đồ thị $2N$ trạng thái xuất phát từ `(1, 0)`. Đáp án là $\min(\text{dist}[N][0], \text{dist}[N][1])$.
- Dùng phép chia nguyên `w / 2` (C++) hoặc `w // 2` (Python) trên kiểu số nguyên $64$-bit, tuyệt đối không dùng số thực `double` để tránh sai số làm tròn."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static constexpr long long INF = (1LL << 62);

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
    }

    // State encoding: state = (u << 1) | used
    vector<long long> dist(2 * n + 2, INF);
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<pair<long long, int>>> pq;

    int start = (1 << 1);
    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        auto [d, state] = pq.top();
        pq.pop();
        if (d != dist[state]) continue;

        int u = state >> 1;
        int used = state & 1;

        for (const auto& [v, w] : adj[u]) {
            int ns = (v << 1) | used;
            long long nd = d + w;
            if (nd < dist[ns]) {
                dist[ns] = nd;
                pq.push({nd, ns});
            }
            if (used == 0) {
                int ns1 = (v << 1) | 1;
                long long nd1 = d + (w >> 1);
                if (nd1 < dist[ns1]) {
                    dist[ns1] = nd1;
                    pq.push({nd1, ns1});
                }
            }
        }
    }

    long long ans = min(dist[n << 1], dist[(n << 1) | 1]);
    if (ans == INF) {
        cout << -1 << '\n';
    } else {
        cout << ans << '\n';
    }
    return 0;
}"""

    py_sol = r"""import heapq
import sys


def solve() -> None:
    INF = 1 << 62
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

    dist = [INF] * (2 * n + 2)
    start = 2  # (1 << 1) | 0
    dist[start] = 0
    pq = [(0, start)]

    while pq:
        d, state = heapq.heappop(pq)
        if d != dist[state]:
            continue
        u = state >> 1
        used = state & 1
        if used == 0:
            for v, w in adj[u]:
                ns0 = v << 1
                nd0 = d + w
                if nd0 < dist[ns0]:
                    dist[ns0] = nd0
                    heapq.heappush(pq, (nd0, ns0))
                ns1 = ns0 | 1
                nd1 = d + (w >> 1)
                if nd1 < dist[ns1]:
                    dist[ns1] = nd1
                    heapq.heappush(pq, (nd1, ns1))
        else:
            for v, w in adj[u]:
                ns1 = (v << 1) | 1
                nd1 = d + w
                if nd1 < dist[ns1]:
                    dist[ns1] = nd1
                    heapq.heappush(pq, (nd1, ns1))

    ans = min(dist[n << 1], dist[(n << 1) | 1])
    sys.stdout.write("-1\n" if ans == INF else f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-flight-discount-layered-dijkstra",
        "title": "Phiếu giảm giá chuyến bay (Layered Dijkstra)",
        "shortDescription": "Tìm chi phí rẻ nhất đi từ thành phố 1 đến N khi được dùng một phiếu giảm giá 50% cho tối đa một chuyến bay bằng Dijkstra trên đồ thị phân tầng.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.graph_shortest_path",
        "tags": ["đồ thị", "dijkstra", "quy hoạch động", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + M) log N) bằng Layered Graph Dijkstra 2 trạng thái.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp09-offline-reverse-dsu-edge-removal
# ============================================================================

def brute_p10(inp: str) -> str:
    # Independent forward simulation: after each edge deletion, run BFS to count components
    toks = list(map(int, inp.split()))
    n, m, q = toks[0], toks[1], toks[2]
    edges = [(0, 0)]
    idx = 3
    for _ in range(m):
        edges.append((toks[idx], toks[idx + 1]))
        idx += 2
    queries = toks[idx : idx + q]

    alive = [True] * (m + 1)
    ans = []
    for e_id in queries:
        alive[e_id] = False
        adj: List[List[int]] = [[] for _ in range(n + 1)]
        for i in range(1, m + 1):
            if alive[i]:
                u, v = edges[i]
                adj[u].append(v)
                adj[v].append(u)
        vis = [False] * (n + 1)
        comps = 0
        for s in range(1, n + 1):
            if not vis[s]:
                comps += 1
                vis[s] = True
                dq = deque([s])
                while dq:
                    u = dq.popleft()
                    for v in adj[u]:
                        if not vis[v]:
                            vis[v] = True
                            dq.append(v)
        ans.append(str(comps))
    return " ".join(ans)


def build_p10() -> dict:
    rng = random.Random(910)

    tests = [
        # 3 public samples
        {
            "input": fmt_edge_removal(
                4, [(1, 2), (2, 3), (3, 4), (4, 1)], [1, 2, 3]
            ),
            "hidden": False,
            "expected": "1 2 3",
            "checkBrute": True,
        },
        {
            "input": fmt_edge_removal(
                5, [(1, 2), (2, 3), (3, 4), (1, 3)], [4, 1, 2, 3]
            ),
            "hidden": False,
            "expected": "2 3 4 5",
            "checkBrute": True,
        },
        {
            "input": fmt_edge_removal(
                3, [(1, 2), (1, 2), (2, 2), (2, 3)], [3, 1, 2, 4]
            ),
            "hidden": False,
            "expected": "1 1 2 3",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_edge_removal(1, [(1, 1)], [1]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            # Q=1 < M with surviving edges keeping graph connected
            "input": fmt_edge_removal(
                4, [(1, 2), (2, 3), (3, 4), (4, 1), (1, 3)], [2]
            ),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            # Deleting every edge of a tree
            "input": fmt_edge_removal(
                6, [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6)], [3, 1, 5, 2, 4]
            ),
            "hidden": True,
            "expected": "2 3 4 5 6",
            "checkBrute": True,
        },
        {
            # K5 deleting all 10 edges in random order
            "input": fmt_edge_removal(
                5,
                [(i, j) for i in range(1, 6) for j in range(i + 1, 6)],
                [1, 5, 2, 8, 3, 9, 4, 10, 6, 7],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Initially disconnected with parallel edges & self-loops
            "input": fmt_edge_removal(
                7,
                [(1, 2), (1, 2), (3, 4), (4, 5), (5, 3), (6, 6)],
                [6, 1, 3, 2, 4, 5],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 145KB input AND output)
    e9 = [(rng.randint(1, 30), rng.randint(1, 30)) for _ in range(60)]
    q9 = rng.sample(range(1, 61), 45)
    tests.append({"input": fmt_edge_removal(30, e9, q9), "hidden": True, "checkBrute": True})

    e10 = [(rng.randint(1, 60), rng.randint(1, 60)) for _ in range(100)]
    q10 = rng.sample(range(1, 101), 80)
    tests.append({"input": fmt_edge_removal(60, e10, q10), "hidden": True, "checkBrute": True})

    # Test 11: Star graph N=8000, M=7999, Q=7999
    e11 = [(1, i) for i in range(2, 8_001)]
    q11 = list(range(1, 8_000))
    rng.shuffle(q11)
    tests.append({"input": fmt_edge_removal(8_000, e11, q11), "hidden": True})

    # Test 12: Long path N=8000, M=7999, Q=7999 (random deletion order)
    e12 = [(i, i + 1) for i in range(1, 8_000)]
    q12 = list(range(1, 8_000))
    rng.shuffle(q12)
    tests.append({"input": fmt_edge_removal(8_000, e12, q12), "hidden": True})

    # Test 13: Cycle + chords N=5000, M=8500, Q=7000
    e13 = [(i, i + 1) for i in range(1, 5_000)] + [(5_000, 1)]
    for _ in range(3_500):
        e13.append((rng.randint(1, 5_000), rng.randint(1, 5_000)))
    q13 = rng.sample(range(1, 8_501), 7_000)
    tests.append({"input": fmt_edge_removal(5_000, e13, q13), "hidden": True})

    # Test 14: Multi-component sparse N=20000, M=8500, Q=8000 (~138KB)
    e14 = [(rng.randint(1, 20_000), rng.randint(1, 20_000)) for _ in range(8_500)]
    q14 = rng.sample(range(1, 8_501), 8_000)
    tests.append({"input": fmt_edge_removal(20_000, e14, q14), "hidden": True})

    # Test 15: Parallel edges + bridges mixed N=10000, M=8500, Q=8500
    e15 = []
    for i in range(1, 4_001):
        e15.append((i, i + 1))
    for i in range(1, 2_001):
        e15.append((i, i + 1))  # duplicate bridges
    for _ in range(2_500):
        u = rng.randint(4_002, 10_000)
        v = rng.randint(4_002, 10_000)
        e15.append((u, v))
    q15 = list(range(1, 8_501))
    rng.shuffle(q15)
    tests.append({"input": fmt_edge_removal(10_000, e15, q15), "hidden": True})

    # Test 16: Large random graph N=15000, M=8500, Q=8000 (~138KB)
    e16 = [(rng.randint(1, 15_000), rng.randint(1, 15_000)) for _ in range(8_500)]
    q16 = rng.sample(range(1, 8_501), 8_000)
    tests.append({"input": fmt_edge_removal(15_000, e16, q16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 25)
        m = rng.randint(1, 50)
        q = rng.randint(1, m)
        edges = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        queries = rng.sample(range(1, m + 1), q)
        extra_stress.append(fmt_edge_removal(n, edges, queries))

    statement = r"""Cho một đồ thị vô hướng gồm $N$ đỉnh (đánh số từ $1$ đến $N$) và $M$ cạnh được đánh số từ $1$ đến $M$ (đồ thị có thể không liên thông, có thể chứa đa cạnh và cạnh khuyên).

Có $Q$ thao tác phá hủy cạnh xảy ra tuần tự: ở thao tác thứ $k$ ($1 \le k \le Q$), cạnh có chỉ số $e_k$ bị **xóa vĩnh viễn** khỏi đồ thị. Các chỉ số $e_1, e_2, \dots, e_Q$ đôi một khác nhau và thỏa mãn $1 \le e_k \le M$.

Sau mỗi thao tác xóa cạnh, hãy xác định số lượng thành phần liên thông hiện tại của đồ thị.

### Dữ liệu vào
- Dòng đầu tiên gồm ba số nguyên $N, M, Q$ ($1 \le N \le 20\,000$, $1 \le M \le 25\,000$, $1 \le Q \le M$).
- $M$ dòng tiếp theo: dòng thứ $i$ gồm hai số nguyên $u_i, v_i$ ($1 \le u_i, v_i \le N$) biểu diễn cạnh thứ $i$.
- Dòng cuối cùng gồm $Q$ số nguyên đôi một khác nhau $e_1, e_2, \dots, e_Q$ ($1 \le e_k \le M$).

### Kết quả
- In ra một dòng duy nhất gồm $Q$ số nguyên cách nhau bởi dấu cách, trong đó số thứ $k$ là số thành phần liên thông của đồ thị **sau khi** đã xóa $k$ cạnh $e_1, e_2, \dots, e_k$.

### Ràng buộc
- $1 \le N \le 20\,000$
- $1 \le M \le 25\,000$
- $1 \le Q \le M$, các chỉ số $e_k$ đôi một khác nhau."""

    hints = r"""**Gợi ý 1 (Nhận diện mô hình):**
Cấu trúc **DSU (Disjoint Set Union)** hỗ trợ **thêm cạnh** và duy trì số thành phần liên thông gần như $O(1)$ mỗi thao tác, nhưng **không** hỗ trợ xóa cạnh trực tiếp! Nếu sau mỗi lần xóa ta chạy lại BFS/DFS thì độ phức tạp là $O(Q \cdot (N + M))$, chắc chắn TLE.

**Gợi ý 2 (Kỹ thuật xử lý ngoại tuyến — Đảo ngược thời gian):**
Vì ta biết trước toàn bộ danh sách $Q$ thao tác xóa, hãy đọc hết dữ liệu rồi **đảo ngược thời gian**:
1. Đánh dấu tất cả $Q$ cạnh nằm trong truy vấn xóa.
2. Bắt đầu từ trạng thái **cuối cùng** (sau khi đã xóa đủ $Q$ cạnh): khởi tạo DSU với `comps = N` và chỉ hợp nhất các cạnh **không bao giờ bị xóa**.
3. Duyệt ngược $k$ từ $Q$ về $1$:
   - Ghi nhận đáp án `ans[k] = comps` (đây chính là số thành phần liên thông sau khi đã xóa $e_1, \dots, e_k$).
   - Sau đó **thêm ngược lại** cạnh $e_k$ vào DSU; nếu hợp nhất thành công hai thành phần khác nhau thì giảm `comps` đi $1$.

**Gợi ý 3 (Cài đặt & bẫy thường gặp):**
- Cẩn thận thứ tự "ghi đáp án trước, thêm cạnh sau": tại bước $k = Q$, trạng thái hiện tại là đã xóa $e_1 \dots e_Q$, nên ghi `ans[Q] = comps` trước rồi mới thêm cạnh $e_Q$ để chuyển sang trạng thái sau khi xóa $e_1 \dots e_{Q-1}$.
- Không bị nhầm khi có đa cạnh hoặc cạnh khuyên: DSU tự động chỉ giảm `comps` khi `find(u) != find(v)`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct DSU {
    vector<int> parent, sz;
    int comps;
    DSU(int n) : parent(n + 1), sz(n + 1, 1), comps(n) {
        iota(parent.begin(), parent.end(), 0);
    }
    int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    void unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return;
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a;
        sz[a] += sz[b];
        --comps;
    }
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m, q;
    if (!(cin >> n >> m >> q)) return 0;

    vector<int> U(m + 1), V(m + 1);
    for (int i = 1; i <= m; ++i) {
        cin >> U[i] >> V[i];
    }

    vector<int> queries(q);
    vector<char> removed(m + 1, 0);
    for (int i = 0; i < q; ++i) {
        cin >> queries[i];
        removed[queries[i]] = 1;
    }

    DSU dsu(n);
    for (int i = 1; i <= m; ++i) {
        if (!removed[i]) {
            dsu.unite(U[i], V[i]);
        }
    }

    vector<int> ans(q);
    for (int i = q - 1; i >= 0; --i) {
        ans[i] = dsu.comps;
        int e = queries[i];
        dsu.unite(U[e], V[e]);
    }

    for (int i = 0; i < q; ++i) {
        if (i) cout << ' ';
        cout << ans[i];
    }
    cout << '\n';
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

    u_arr = [0] * (m + 1)
    v_arr = [0] * (m + 1)
    idx = 3
    for i in range(1, m + 1):
        u_arr[i] = int(data[idx])
        v_arr[i] = int(data[idx + 1])
        idx += 2

    queries = [0] * q
    removed = bytearray(m + 1)
    for i in range(q):
        e = int(data[idx])
        idx += 1
        queries[i] = e
        removed[e] = 1

    parent = list(range(n + 1))
    sz = [1] * (n + 1)
    comps = n

    def unite(a: int, b: int) -> None:
        nonlocal comps
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        while parent[b] != b:
            parent[b] = parent[parent[b]]
            b = parent[b]
        if a != b:
            if sz[a] < sz[b]:
                a, b = b, a
            parent[b] = a
            sz[a] += sz[b]
            comps -= 1

    for i in range(1, m + 1):
        if not removed[i]:
            unite(u_arr[i], v_arr[i])

    ans = [0] * q
    for i in range(q - 1, -1, -1):
        ans[i] = comps
        e = queries[i]
        unite(u_arr[e], v_arr[e])

    sys.stdout.write(" ".join(map(str, ans)) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp09-offline-reverse-dsu-edge-removal",
        "title": "Đếm thành phần liên thông khi xóa cạnh (Offline Reverse DSU)",
        "shortDescription": "Trả lời số thành phần liên thông sau mỗi thao tác xóa cạnh bằng kỹ thuật xử lý ngoại tuyến đảo ngược thời gian kết hợp DSU.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.graph_dsu_mst",
        "tags": ["đồ thị", "dsu", "offline", "tối ưu", "tầng 3"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + M + Q) α(N)) bằng kỹ thuật Offline Reverse DSU.",
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

    # Strict pre-check: 16 tests per problem and < 150KB per test input
    for p in problems:
        assert len(p["tests"]) == 16, f"{p['slug']} expected 16 tests, got {len(p['tests'])}"
        for ti, tc in enumerate(p["tests"], 1):
            b = len(tc["input"].encode("utf-8"))
            assert b < SAFE_MAX_BYTES, (
                f"{p['slug']} test #{ti} input is {b} bytes (limit < {SAFE_MAX_BYTES})"
            )

    build_and_verify_pack(
        pack_id="09-graphs-trees",
        title="Tầng 3: Đồ thị & Cây toàn diện (BFS/DFS, Topo, Dijkstra, DSU/MST)",
        tier="Tầng 3 — Quy hoạch động & Đồ thị",
        description=(
            "10 bài Đồ thị & Cây chuẩn thi HSG: liên thông, mê cung BFS, đường kính cây, "
            "đồ thị 2 phía, Topo Sort từ điển, Kruskal MST, Dijkstra, DAG DP, "
            "Layered Dijkstra và Offline Reverse DSU."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
