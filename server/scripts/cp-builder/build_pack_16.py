"""
Builder & automated verifier for CodeClass CP Pack 16:
Tầng 4: Thuật toán trên Cây nâng cao (Euler Tour, LCA & Rerooting)

Generates and verifies 10 original Vietnamese competitive programming problems
(2 easy, 4 medium, 4 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions (100% iterative BFS/DFS/Euler-Tour),
and independent brute-force stress checks on all 10/10 problems.
"""

from __future__ import annotations

import random
import sys
from collections import deque
from pathlib import Path
from typing import Callable, List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Thuật toán trên Cây nâng cao\n"
SAFE_MAX_BYTES = 148_000


# ============================================================================
# Shared Tree Generation & Formatting Helpers
# ============================================================================

def relabel_tree(n: int, edges: List[Tuple[int, int]], rng: random.Random, fix_root_1: bool = True) -> List[Tuple[int, int]]:
    """Randomly permute vertex labels (optionally keeping vertex 1 fixed)."""
    if fix_root_1:
        others = list(range(2, n + 1))
        rng.shuffle(others)
        perm = [0, 1] + others
    else:
        perm = list(range(1, n + 1))
        rng.shuffle(perm)
        perm = [0] + perm
    out: List[Tuple[int, int]] = []
    for u, v in edges:
        a, b = perm[u], perm[v]
        if rng.random() < 0.5:
            out.append((a, b))
        else:
            out.append((b, a))
    rng.shuffle(out)
    return out


def make_path_tree(n: int) -> List[Tuple[int, int]]:
    return [(i, i + 1) for i in range(1, n)]


def make_star_tree(n: int, center: int = 1) -> List[Tuple[int, int]]:
    return [(center, i) for i in range(1, n + 1) if i != center]


def make_binary_tree(n: int) -> List[Tuple[int, int]]:
    return [(i // 2, i) for i in range(2, n + 1)]


def make_random_tree(n: int, rng: random.Random, max_depth_bias: int = 0) -> List[Tuple[int, int]]:
    edges: List[Tuple[int, int]] = []
    for i in range(2, n + 1):
        if max_depth_bias > 0:
            lo = max(1, i - max_depth_bias)
            p = rng.randint(lo, i - 1)
        else:
            p = rng.randint(1, i - 1)
        edges.append((p, i))
    return edges


def make_caterpillar_tree(n: int, spine_len: int, rng: random.Random) -> List[Tuple[int, int]]:
    spine_len = max(1, min(n, spine_len))
    edges = [(i, i + 1) for i in range(1, spine_len)]
    for v in range(spine_len + 1, n + 1):
        p = rng.randint(1, spine_len)
        edges.append((p, v))
    return edges


def make_two_centroid_tree(half: int, rng: random.Random) -> List[Tuple[int, int]]:
    """Build an even-sized tree (2*half) guaranteed to have two centroids (1 and 2)."""
    edges: List[Tuple[int, int]] = [(1, 2)]
    left_nodes = [1] + list(range(3, half + 2))
    right_nodes = [2] + list(range(half + 2, 2 * half + 1))
    for idx in range(1, len(left_nodes)):
        p = left_nodes[rng.randint(0, idx - 1)]
        edges.append((p, left_nodes[idx]))
    for idx in range(1, len(right_nodes)):
        p = right_nodes[rng.randint(0, idx - 1)]
        edges.append((p, right_nodes[idx]))
    return edges


def fmt_tree_only(n: int, edges: List[Tuple[int, int]]) -> str:
    lines = [str(n)]
    lines.extend(f"{u} {v}" for u, v in edges)
    return "\n".join(lines)


def fmt_tree_node_weights(n: int, weights: List[int], edges: List[Tuple[int, int]]) -> str:
    lines = [str(n), " ".join(map(str, weights))]
    lines.extend(f"{u} {v}" for u, v in edges)
    return "\n".join(lines)


def fmt_tree_queries(n: int, edges: List[Tuple[int, int]], queries: List[Tuple[int, int]]) -> str:
    lines = [f"{n} {len(queries)}"]
    lines.extend(f"{u} {v}" for u, v in edges)
    lines.extend(f"{a} {b}" for a, b in queries)
    return "\n".join(lines)


def fmt_weighted_tree_queries(
    n: int, edges: List[Tuple[int, int, int]], queries: List[Tuple[int, int]]
) -> str:
    lines = [f"{n} {len(queries)}"]
    lines.extend(f"{u} {v} {w}" for u, v, w in edges)
    lines.extend(f"{a} {b}" for a, b in queries)
    return "\n".join(lines)


def fmt_node_val_queries(
    n: int, vals: List[int], edges: List[Tuple[int, int]], queries: List[Tuple[int, ...]]
) -> str:
    lines = [f"{n} {len(queries)}", " ".join(map(str, vals))]
    lines.extend(f"{u} {v}" for u, v in edges)
    for q in queries:
        lines.append(" ".join(map(str, q)))
    return "\n".join(lines)


def build_tree_parent_depth(n: int, edges: List[Tuple[int, int]], root: int = 1) -> Tuple[List[List[int]], List[int], List[int]]:
    adj = [[] for _ in range(n + 1)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    parent = [0] * (n + 1)
    depth = [0] * (n + 1)
    q = deque([root])
    vis = [False] * (n + 1)
    vis[root] = True
    while q:
        u = q.popleft()
        for v in adj[u]:
            if not vis[v]:
                vis[v] = True
                parent[v] = u
                depth[v] = depth[u] + 1
                q.append(v)
    return adj, parent, depth


# ============================================================================
# 1. cp16-subtree-sizes-depths
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    w = [0] + toks[1 : n + 1]
    edges = [(toks[n + 1 + 2 * i], toks[n + 2 + 2 * i]) for i in range(n - 1)]
    _, parent, depth = build_tree_parent_depth(n, edges, 1)

    sub = [0] * (n + 1)
    for u in range(1, n + 1):
        cur = u
        while cur != 0:
            sub[cur] += 1
            cur = parent[cur]

    sum_dw = sum(depth[u] * w[u] for u in range(1, n + 1))
    sum_sub = sum(sub[1 : n + 1])
    return f"{sum_dw} {sum_sub}"


def build_p01() -> dict:
    rng = random.Random(1601)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_node_weights(5, [10, 20, 30, 40, 50], [(1, 2), (1, 3), (2, 4), (2, 5)]),
            "hidden": False,
            "expected": "230 11",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_node_weights(4, [5, 1, 2, 3], [(1, 2), (2, 3), (3, 4)]),
            "hidden": False,
            "expected": "14 10",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_node_weights(1, [1_000_000_000], []),
            "hidden": False,
            "expected": "0 1",
            "checkBrute": True,
        },
        # 5 edge / overflow / special structure cases
        {
            "input": fmt_tree_node_weights(2, [1_000_000_000, 1_000_000_000], [(2, 1)]),
            "hidden": True,
            "expected": "1000000000 3",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_node_weights(50, [1_000_000_000] * 50, make_path_tree(50)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_node_weights(80, [1_000_000_000] * 80, make_star_tree(80)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_node_weights(
                120,
                [rng.randint(1, 1_000_000_000) for _ in range(120)],
                relabel_tree(120, make_random_tree(120, rng), rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_node_weights(
                250,
                [rng.randint(1, 1_000_000_000) for _ in range(250)],
                relabel_tree(250, make_binary_tree(250), rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    specs = [
        (600, make_random_tree(600, rng), 1_000_000_000, True),
        (1_200, relabel_tree(1_200, make_caterpillar_tree(1_200, 400, rng), rng), 1_000_000_000, True),
        (2_500, make_path_tree(2_500), 1_000_000_000, False),
        (4_000, relabel_tree(4_000, make_random_tree(4_000, rng, max_depth_bias=5), rng), 1_000_000_000, False),
        (5_500, relabel_tree(5_500, make_path_tree(5_500), rng), 1_000_000_000, False),
        (6_200, relabel_tree(6_200, make_binary_tree(6_200), rng), 1_000_000_000, False),
        (8_500, make_star_tree(8_500), 999, False),
        (10_500, make_path_tree(10_500), 99, False),
    ]
    for n, edges, max_w, chk in specs:
        lo_w = max(1, max_w // 2) if max_w > 1000 else 1
        ws = [rng.randint(lo_w, max_w) for _ in range(n)]
        tests.append({"input": fmt_tree_node_weights(n, ws, edges), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        edges = relabel_tree(n, make_random_tree(n, rng), rng)
        ws = [rng.randint(1, 10**9) for _ in range(n)]
        extra_stress.append(fmt_tree_node_weights(n, ws, edges))

    statement = r"""Cho một cây gồm $N$ đỉnh được đánh số từ $1$ đến $N$, có gốc tại đỉnh $1$. Mỗi đỉnh $u$ được gán một trọng số nguyên dương $w_u$.

Với mỗi đỉnh $u$ ($1 \le u \le N$), ta định nghĩa:
- $d(u)$ là **độ sâu** của đỉnh $u$: số cạnh trên đường đi đơn từ gốc $1$ đến $u$ (quy ước $d(1) = 0$).
- $s(u)$ là **kích thước cây con** gốc $u$: tổng số đỉnh nằm trong cây con gốc $u$ (tính cả chính đỉnh $u$).

Hãy tính hai đại lượng sau:
1. $A = \sum_{u=1}^{N} d(u) \cdot w_u$
2. $B = \sum_{u=1}^{N} s(u)$

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($1 \le N \le 20\,000$).
- Dòng thứ hai chứa $N$ số nguyên $w_1, w_2, \dots, w_N$ ($1 \le w_i \le 10^9$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) mô tả một cạnh vô hướng của cây.

### Kết quả
- In ra một dòng duy nhất chứa hai số nguyên $A$ và $B$ cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le N \le 20\,000$
- $1 \le w_i \le 10^9$
- Đồ thị đầu vào luôn là một cây hợp lệ.

### Subtasks
- **Subtask 1 (40% số test):** $N \le 1\,000$.
- **Subtask 2 (60% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1 ($N = 5$, $w = [10, 20, 30, 40, 50]$):
  - Độ sâu các đỉnh: $d(1)=0, d(2)=1, d(3)=1, d(4)=2, d(5)=2 \implies A = 0\cdot 10 + 1\cdot 20 + 1\cdot 30 + 2\cdot 40 + 2\cdot 50 = 230$.
  - Kích thước cây con: $s(1)=5, s(2)=3, s(3)=1, s(4)=1, s(5)=1 \implies B = 5+3+1+1+1 = 11$."""

    hints = r"""**Gợi ý 1 (Tính chất cây có gốc):**
Để xác định độ sâu $d(u)$ và cha `parent[u]` của từng đỉnh, chỉ cần duyệt cây một lần từ gốc `1` bằng BFS hoặc DFS lặp.

**Gợi ý 2 (Tính kích thước cây con dưới lên):**
Nếu ta lưu lại thứ tự thăm các đỉnh `order` (từ gốc ra ngoài), thì khi duyệt `order` theo chiều **ngược lại** (từ lá về gốc), mỗi đỉnh con $v$ luôn được xử lý trước đỉnh cha $p = \text{parent}[v]$. Khi đó ta khởi tạo `sub[u] = 1` và cộng dồn `sub[parent[u]] += sub[u]`.

**Gợi ý 3 (Lưu ý kiểu dữ liệu & tràn ngăn xếp):**
- Với cây đường thẳng $N = 20\,000$ và $w_i = 10^9$, giá trị $A = \sum d(u) \cdot w_u$ có thể đạt tới khoảng $2 \times 10^{17}$, vượt xa giới hạn `int` 32-bit. Hãy dùng kiểu số nguyên 64-bit (`long long` trong C++).
- Đừng dùng DFS đệ quy trong Python vì cây đường thẳng $N = 20\,000$ sẽ vượt giới hạn đệ quy mặc định (`RecursionError`). Hãy dùng BFS hoặc DFS lặp."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<long long> w(n + 1);
    for (int i = 1; i <= n; ++i) cin >> w[i];

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> parent(n + 1, 0), depth(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);

    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (int v : adj[u]) {
            if (v != parent[u]) {
                parent[v] = u;
                depth[v] = depth[u] + 1;
                order.push_back(v);
            }
        }
    }

    vector<long long> sub(n + 1, 1);
    for (int i = n - 1; i >= 1; --i) {
        int u = order[i];
        sub[parent[u]] += sub[u];
    }

    long long sum_dw = 0, sum_sub = 0;
    for (int u = 1; u <= n; ++u) {
        sum_dw += (long long)depth[u] * w[u];
        sum_sub += sub[u];
    }

    cout << sum_dw << ' ' << sum_sub << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    w = [0] * (n + 1)
    for i in range(1, n + 1):
        w[i] = int(data[i])

    adj = [[] for _ in range(n + 1)]
    idx = n + 1
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [0] * (n + 1)
    depth = [0] * (n + 1)
    order = [1]
    head = 0
    while head < len(order):
        u = order[head]
        head += 1
        p = parent[u]
        du = depth[u] + 1
        for v in adj[u]:
            if v != p:
                parent[v] = u
                depth[v] = du
                order.append(v)

    sub = [1] * (n + 1)
    for i in range(n - 1, 0, -1):
        u = order[i]
        sub[parent[u]] += sub[u]

    sum_dw = 0
    sum_sub = 0
    for u in range(1, n + 1):
        sum_dw += depth[u] * w[u]
        sum_sub += sub[u]

    sys.stdout.write(f"{sum_dw} {sum_sub}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-subtree-sizes-depths",
        "title": "Độ sâu và kích thước cây con",
        "shortDescription": "Tính tổng độ sâu có trọng số và tổng kích thước tất cả các cây con trên cây gốc 1 bằng duyệt lặp.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "bfs-dfs", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N), sử dụng BFS/DFS lặp và kiểu số nguyên 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp16-tree-centroid
# ============================================================================

def brute_p02(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    adj = [[] for _ in range(n + 1)]
    idx = 1
    for _ in range(n - 1):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    limit = n // 2
    for c in range(1, n + 1):
        vis = [False] * (n + 1)
        vis[c] = True
        ok = True
        for start in range(1, n + 1):
            if vis[start]:
                continue
            q = deque([start])
            vis[start] = True
            cnt = 0
            while q:
                u = q.popleft()
                cnt += 1
                for v in adj[u]:
                    if not vis[v]:
                        vis[v] = True
                        q.append(v)
            if cnt > limit:
                ok = False
                break
        if ok:
            return str(c)
    return "1"


def build_p02() -> dict:
    rng = random.Random(1602)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_only(5, [(1, 2), (2, 3), (3, 4), (3, 5)]),
            "hidden": False,
            "expected": "3",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(4, [(1, 2), (2, 3), (3, 4)]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(1, []),
            "hidden": False,
            "expected": "1",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_tree_only(2, [(2, 1)]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(6, [(5, 3), (5, 1), (5, 2), (3, 4), (3, 6)]),
            "hidden": True,
            "expected": "3",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(15, make_star_tree(15, center=9)),
            "hidden": True,
            "expected": "9",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(60, make_two_centroid_tree(30, rng)),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(120, relabel_tree(120, make_two_centroid_tree(60, rng), rng, fix_root_1=False)),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    specs = [
        (300, relabel_tree(300, make_random_tree(300, rng), rng, fix_root_1=False), True),
        (800, relabel_tree(800, make_two_centroid_tree(400, rng), rng, fix_root_1=False), True),
        (2_000, relabel_tree(2_000, make_caterpillar_tree(2_000, 700, rng), rng, fix_root_1=False), False),
        (4_500, relabel_tree(4_500, make_two_centroid_tree(2_250, rng), rng, fix_root_1=False), False),
        (7_000, relabel_tree(7_000, make_binary_tree(7_000), rng, fix_root_1=False), False),
        (9_500, make_star_tree(9_500, center=4321), False),
        (11_500, make_path_tree(11_500), False),
        (12_500, relabel_tree(12_500, make_random_tree(12_500, rng, max_depth_bias=10), rng, fix_root_1=False), False),
    ]
    for _, edges, chk in specs:
        n = len(edges) + 1
        tests.append({"input": fmt_tree_only(n, edges), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        if n % 2 == 0 and rng.random() < 0.4:
            edges = relabel_tree(n, make_two_centroid_tree(n // 2, rng), rng, fix_root_1=False)
        else:
            edges = relabel_tree(n, make_random_tree(n, rng), rng, fix_root_1=False)
        extra_stress.append(fmt_tree_only(n, edges))

    statement = r"""Cho một cây gồm $N$ đỉnh được đánh số từ $1$ đến $N$.

Một đỉnh $c$ được gọi là **trọng tâm (centroid)** của cây nếu khi xóa đỉnh $c$ cùng tất cả các cạnh liên thuộc với nó, mọi thành phần liên thông còn lại đều có số lượng đỉnh không vượt quá $\lfloor N / 2 \rfloor$.

Mỗi cây luôn có $1$ hoặc $2$ trọng tâm. Nếu cây có $2$ trọng tâm, hãy in ra trọng tâm có **chỉ số nhỏ hơn**.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($1 \le N \le 20\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cạnh vô hướng của cây.

### Kết quả
- In ra một số nguyên duy nhất là chỉ số của trọng tâm cần tìm (nếu có hai trọng tâm thì in đỉnh có chỉ số nhỏ hơn).

### Ràng buộc
- $1 \le N \le 20\,000$
- Đồ thị đầu vào luôn là một cây.

### Subtasks
- **Subtask 1 (40% số test):** $N \le 1\,000$.
- **Subtask 2 (60% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1 ($N = 5$, $\lfloor N/2 \rfloor = 2$): nếu xóa đỉnh $3$, các thành phần liên thông còn lại là $\{1, 2\}$ (kích thước $2$), $\{4\}$ (kích thước $1$) và $\{5\}$ (kích thước $1$), đều $\le 2$, nên $3$ là trọng tâm duy nhất.
- Với ví dụ 2 ($N = 4$, đường thẳng $1-2-3-4$, $\lfloor N/2 \rfloor = 2$): cả đỉnh $2$ và đỉnh $3$ đều là trọng tâm, ta chọn đỉnh có chỉ số nhỏ hơn là $2$."""

    hints = r"""**Gợi ý 1 (Các thành phần khi xóa một đỉnh):**
Nếu chọn tạm đỉnh $1$ làm gốc của cây, khi xóa một đỉnh $u$ bất kỳ, các thành phần liên thông còn lại gồm:
- Các cây con gốc $v$ với mỗi con trực tiếp $v$ của $u$ (có kích thước `sub[v]`).
- Phần phía trên $u$ gồm toàn bộ các đỉnh không nằm trong cây con gốc $u$ (có kích thước $N - \text{sub}[u]$).

**Gợi ý 2 (Kiểm tra toàn bộ $N$ đỉnh trong $O(N)$):**
Thay vì đi tìm dần từ gốc (dễ sót trường hợp có 2 trọng tâm nếu không cẩn thận quy ước), ta chỉ cần tính sẵn mảng `sub[u]` bằng một lượt BFS + duyệt ngược thứ tự `order`, đồng thời lưu giá trị lớn nhất của `sub[v]` trong các con của $u$ vào `max_child[u]`.
Khi đó đỉnh $u$ là trọng tâm khi và chỉ khi $\max(\text{max\_child}[u], N - \text{sub}[u]) \le \lfloor N / 2 \rfloor$.

**Gợi ý 3 (Lấy chỉ số nhỏ nhất):**
Chỉ cần duyệt $u$ từ $1$ đến $N$ và lấy đỉnh $u$ đầu tiên thỏa mãn điều kiện trọng tâm, ta chắc chắn thu được trọng tâm có chỉ số nhỏ hơn khi cây có 2 trọng tâm."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> parent(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);
    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (int v : adj[u]) {
            if (v != parent[u]) {
                parent[v] = u;
                order.push_back(v);
            }
        }
    }

    vector<int> sub(n + 1, 1), max_child(n + 1, 0);
    for (int i = n - 1; i >= 1; --i) {
        int u = order[i];
        int p = parent[u];
        sub[p] += sub[u];
        max_child[p] = max(max_child[p], sub[u]);
    }

    int limit = n / 2;
    for (int u = 1; u <= n; ++u) {
        int worst = max(max_child[u], n - sub[u]);
        if (worst <= limit) {
            cout << u << '\n';
            return 0;
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

    adj = [[] for _ in range(n + 1)]
    idx = 1
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [0] * (n + 1)
    order = [1]
    head = 0
    while head < len(order):
        u = order[head]
        head += 1
        p = parent[u]
        for v in adj[u]:
            if v != p:
                parent[v] = u
                order.append(v)

    sub = [1] * (n + 1)
    max_child = [0] * (n + 1)
    for i in range(n - 1, 0, -1):
        u = order[i]
        p = parent[u]
        su = sub[u]
        sub[p] += su
        if su > max_child[p]:
            max_child[p] = su

    limit = n // 2
    for u in range(1, n + 1):
        up_part = n - sub[u]
        worst = max_child[u] if max_child[u] >= up_part else up_part
        if worst <= limit:
            sys.stdout.write(f"{u}\n")
            return


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-tree-centroid",
        "title": "Tìm trọng tâm cây (Centroid)",
        "shortDescription": "Tìm trọng tâm của cây vô hướng trong O(N), ưu tiên chỉ số nhỏ nhất nếu có hai trọng tâm.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "trọng tâm", "bfs-dfs", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N), cài đặt lặp không đệ quy.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp16-binary-lifting-kth-ancestor
# ============================================================================

def brute_p03(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    idx = 2
    edges = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(n - 1)]
    idx += 2 * (n - 1)
    _, parent, depth = build_tree_parent_depth(n, edges, 1)

    out = []
    for _ in range(q):
        u, k = toks[idx], toks[idx + 1]
        idx += 2
        if k > depth[u]:
            out.append("-1")
        else:
            cur = u
            for _ in range(k):
                cur = parent[cur]
            out.append(str(cur))
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1603)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_queries(5, [(1, 2), (1, 3), (2, 4), (2, 5)], [(4, 0), (4, 2), (4, 3)]),
            "hidden": False,
            "expected": "4\n1\n-1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(6, [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6)], [(6, 1), (6, 5), (6, 6), (1, 0)]),
            "hidden": False,
            "expected": "5\n1\n-1\n1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(1, [], [(1, 0), (1, 1)]),
            "hidden": False,
            "expected": "1\n-1",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_tree_queries(
                10,
                make_path_tree(10),
                [(10, k) for k in range(0, 11)] + [(1, 1), (5, 4), (5, 5)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                20,
                make_star_tree(20),
                [(i, 0) for i in range(1, 6)] + [(i, 1) for i in range(1, 6)] + [(i, 2) for i in range(2, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                64,
                make_path_tree(64),
                [(64, 1), (64, 2), (64, 4), (64, 8), (64, 16), (64, 32), (64, 63), (64, 64), (33, 31)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                150,
                relabel_tree(150, make_random_tree(150, rng), rng),
                [(rng.randint(1, 150), rng.randint(0, 150)) for _ in range(150)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                300,
                relabel_tree(300, make_binary_tree(300), rng),
                [(rng.randint(1, 300), rng.randint(0, 12)) for _ in range(300)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    med_large_specs = [
        (800, 1_000, relabel_tree(800, make_random_tree(800, rng), rng), 400, True),
        (2_000, 2_000, relabel_tree(2_000, make_caterpillar_tree(2_000, 900, rng), rng), 1_000, True),
        (4_500, 4_500, relabel_tree(4_500, make_random_tree(4_500, rng, max_depth_bias=8), rng), 800, False),
        (6_000, 6_000, make_binary_tree(6_000), 14, False),
        (6_500, 5_500, relabel_tree(6_500, make_path_tree(6_500), rng), 6_500, False),
        (8_500, 3_500, make_path_tree(8_500), 8_500, False),
        (10_500, 2_000, relabel_tree(10_500, make_caterpillar_tree(10_500, 4_000, rng), rng), 4_500, False),
        (11_500, 1_000, make_star_tree(11_500), 3, False),
    ]
    for n, q, edges, max_k, chk in med_large_specs:
        qs = [(rng.randint(1, n), rng.randint(0, min(n, max_k))) for _ in range(q)]
        tests.append({"input": fmt_tree_queries(n, edges, qs), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        q = rng.randint(1, 35)
        edges = relabel_tree(n, make_random_tree(n, rng), rng)
        qs = [(rng.randint(1, n), rng.randint(0, n)) for _ in range(q)]
        extra_stress.append(fmt_tree_queries(n, edges, qs))

    statement = r"""Cho một cây gồm $N$ đỉnh đánh số từ $1$ đến $N$, có gốc tại đỉnh $1$.

Bạn cần trả lời $Q$ truy vấn. Mỗi truy vấn gồm hai số nguyên $(u, k)$: hãy tìm **tổ tiên thứ $k$** của đỉnh $u$ (tức là đỉnh đạt được khi từ $u$ đi ngược về phía gốc $1$ đúng $k$ cạnh).
- Quy ước tổ tiên thứ $0$ của $u$ là chính $u$.
- Nếu số bước đi ngược $k$ vượt quá độ sâu của $u$ (tức là đi quá gốc $1$), hãy in ra `-1`.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) mô tả một cạnh vô hướng của cây.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, k$ ($1 \le u \le N$, $0 \le k \le N$) mô tả một truy vấn.

### Kết quả
- Gồm $Q$ dòng, mỗi dòng in ra một số nguyên là kết quả của truy vấn tương ứng.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $1 \le u \le N$, $0 \le k \le N$

### Subtasks
- **Subtask 1 (35% số test):** $N, Q \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Trong ví dụ 1, cây có $1$ là gốc, cha của $4$ là $2$, cha của $2$ là $1$:
  - Tổ tiên thứ $0$ của $4$ là $4$.
  - Tổ tiên thứ $2$ của $4$ là $1$.
  - Từ $4$ chỉ đi lên tối đa $2$ bước tới gốc $1$, nên tổ tiên thứ $3$ không tồn tại (in `-1`)."""

    hints = r"""**Gợi ý 1 (Ý tưởng nhảy lũy thừa — Binary Lifting):**
Nếu nhảy từng bước một thì mỗi truy vấn mất $O(N)$ trong trường hợp cây đường thẳng. Thay vì nhảy từng bước, ta lưu trước tổ tiên thứ $2^0, 2^1, 2^2, \dots, 2^{14}$ của mỗi đỉnh!

**Gợi ý 2 (Công thức quy hoạch động dựng bảng):**
Gọi `up[j][u]` là tổ tiên thứ $2^j$ của đỉnh $u$ (bằng `0` nếu không tồn tại).
- Trước tiên dùng BFS từ gốc `1` để tính `up[0][u]` (cha trực tiếp của $u$, với `up[0][1] = 0`).
- Với mỗi $j = 1 \dots 14$: `up[j][u] = up[j - 1][up[j - 1][u]]` (quy ước `up[*][0] = 0`).

**Gợi ý 3 (Trả lời truy vấn theo biểu diễn nhị phân):**
Để tìm tổ tiên thứ $k$ của $u$, phân tích $k$ thành tổng các lũy thừa của $2$: với mỗi bit $j$ bật (tức `(k >> j) & 1`), gán `u = up[j][u]`. Nếu sau khi nhảy hết bit mà `u == 0` (hoặc ngay từ đầu `k > depth[u]`), đáp án là `-1`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    const int LOG = 15;
    vector<vector<int>> up(LOG, vector<int>(n + 1, 0));
    vector<int> depth(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);

    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (int v : adj[u]) {
            if (v != up[0][u]) {
                up[0][v] = u;
                depth[v] = depth[u] + 1;
                order.push_back(v);
            }
        }
    }

    for (int j = 1; j < LOG; ++j) {
        for (int u = 1; u <= n; ++u) {
            up[j][u] = up[j - 1][up[j - 1][u]];
        }
    }

    while (q--) {
        int u, k;
        cin >> u >> k;
        if (k > depth[u]) {
            cout << -1 << '\n';
            continue;
        }
        for (int j = 0; j < LOG; ++j) {
            if ((k >> j) & 1) {
                u = up[j][u];
            }
        }
        cout << u << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    q = int(data[1])

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    LOG = 15
    up = [[0] * (n + 1) for _ in range(LOG)]
    depth = [0] * (n + 1)
    order = [1]
    head = 0
    up0 = up[0]
    while head < len(order):
        u = order[head]
        head += 1
        p = up0[u]
        du = depth[u] + 1
        for v in adj[u]:
            if v != p:
                up0[v] = u
                depth[v] = du
                order.append(v)

    for j in range(1, LOG):
        prev = up[j - 1]
        cur = up[j]
        for u in range(1, n + 1):
            cur[u] = prev[prev[u]]

    out = []
    for _ in range(q):
        u = int(data[idx])
        k = int(data[idx + 1])
        idx += 2
        if k > depth[u]:
            out.append("-1")
        else:
            j = 0
            while k:
                if k & 1:
                    u = up[j][u]
                k >>= 1
                j += 1
            out.append(str(u))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-binary-lifting-kth-ancestor",
        "title": "Tìm tổ tiên thứ K (Binary Lifting)",
        "shortDescription": "Trả lời nhanh các truy vấn tìm tổ tiên thứ K trên cây gốc 1 bằng kỹ thuật Binary Lifting.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "binary lifting", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) với Binary Lifting.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp16-lca-queries
# ============================================================================

def brute_p04(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    idx = 2
    edges = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(n - 1)]
    idx += 2 * (n - 1)
    _, parent, depth = build_tree_parent_depth(n, edges, 1)

    out = []
    for _ in range(q):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        while depth[u] > depth[v]:
            u = parent[u]
        while depth[v] > depth[u]:
            v = parent[v]
        while u != v:
            u = parent[u]
            v = parent[v]
        out.append(str(u))
    return "\n".join(out)


def build_p04() -> dict:
    rng = random.Random(1604)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_queries(6, [(1, 2), (1, 3), (2, 4), (2, 5), (3, 6)], [(4, 5), (4, 6), (4, 2), (5, 5)]),
            "hidden": False,
            "expected": "2\n1\n2\n5",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(5, [(1, 2), (2, 3), (3, 4), (4, 5)], [(5, 3), (1, 5), (4, 2)]),
            "hidden": False,
            "expected": "3\n1\n2",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(1, [], [(1, 1), (1, 1)]),
            "hidden": False,
            "expected": "1\n1",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_tree_queries(
                10,
                make_path_tree(10),
                [(1, 10), (10, 1), (4, 9), (7, 7), (2, 8), (6, 3)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                25,
                make_star_tree(25),
                [(2, 25), (1, 14), (10, 10), (7, 19), (15, 1)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                63,
                make_binary_tree(63),
                [(32, 63), (32, 33), (16, 48), (10, 41), (1, 63), (21, 21)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                180,
                relabel_tree(180, make_random_tree(180, rng), rng),
                [(rng.randint(1, 180), rng.randint(1, 180)) for _ in range(200)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                350,
                relabel_tree(350, make_caterpillar_tree(350, 150, rng), rng),
                [(rng.randint(1, 350), rng.randint(1, 350)) for _ in range(300)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    med_large_specs = [
        (700, 1_000, relabel_tree(700, make_random_tree(700, rng), rng), True),
        (1_800, 2_000, relabel_tree(1_800, make_path_tree(1_800), rng), True),
        (4_000, 5_000, relabel_tree(4_000, make_random_tree(4_000, rng, max_depth_bias=12), rng), False),
        (6_000, 6_500, make_binary_tree(6_000), False),
        (7_500, 4_500, relabel_tree(7_500, make_path_tree(7_500), rng), False),
        (9_500, 2_500, relabel_tree(9_500, make_caterpillar_tree(9_500, 3_500, rng), rng), False),
        (10_500, 1_800, make_path_tree(10_500), False),
        (11_500, 1_200, relabel_tree(11_500, make_star_tree(11_500), rng), False),
    ]
    for n, q, edges, chk in med_large_specs:
        qs = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(q)]
        tests.append({"input": fmt_tree_queries(n, edges, qs), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        q = rng.randint(1, 35)
        edges = relabel_tree(n, make_random_tree(n, rng), rng)
        qs = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(q)]
        extra_stress.append(fmt_tree_queries(n, edges, qs))

    statement = r"""Cho một cây gồm $N$ đỉnh đánh số từ $1$ đến $N$, có gốc tại đỉnh $1$.

Tổ tiên chung gần nhất (**LCA — Lowest Common Ancestor**) của hai đỉnh $u$ và $v$, ký hiệu $\text{LCA}(u, v)$, là đỉnh nằm sâu nhất (xa gốc $1$ nhất) đồng thời là tổ tiên của cả $u$ và $v$ (mỗi đỉnh được coi là tổ tiên của chính nó).

Cho $Q$ truy vấn, mỗi truy vấn gồm hai đỉnh $(u, v)$. Hãy tìm $\text{LCA}(u, v)$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) mô tả một cạnh của cây.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra $\text{LCA}(u, v)$ của truy vấn thứ $i$.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $1 \le u, v \le N$

### Subtasks
- **Subtask 1 (35% số test):** $N, Q \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1: gốc là $1$, con của $1$ là $2, 3$; con của $2$ là $4, 5$; con của $3$ là $6$.
  - $\text{LCA}(4, 5) = 2$.
  - $\text{LCA}(4, 6) = 1$.
  - $\text{LCA}(4, 2) = 2$ (vì $2$ là tổ tiên của $4$ và của chính nó).
  - $\text{LCA}(5, 5) = 5$."""

    hints = r"""**Gợi ý 1 (Bước 1 — Cân bằng độ sâu):**
Giả sử `depth[u] >= depth[v]` (nếu không thì hoán đổi $u$ và $v$). Ta đưa đỉnh $u$ lên đúng `diff = depth[u] - depth[v]` bước bằng Binary Lifting để hai đỉnh có cùng độ sâu.

**Gợi ý 2 (Trường hợp đặc biệt khi cùng độ sâu):**
Sau khi đưa lên cùng độ sâu, nếu `u == v` thì một đỉnh chính là tổ tiên của đỉnh kia — đáp án ngay lập tức là `u`.

**Gợi ý 3 (Bước 2 — Nhảy đồng thời về ngay dưới LCA):**
Nếu `u != v`, ta duyệt `j` giảm dần từ `LOG - 1` xuống `0`: nếu `up[j][u] != up[j][v]`, ta cho cả hai cùng nhảy lên: `u = up[j][u]`, `v = up[j][v]`. Sau vòng lặp, `u` và `v` là hai con trực tiếp khác nhau của LCA, nên đáp án là `up[0][u]`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    const int LOG = 15;
    vector<vector<int>> up(LOG, vector<int>(n + 1, 0));
    vector<int> depth(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);

    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (int v : adj[u]) {
            if (v != up[0][u]) {
                up[0][v] = u;
                depth[v] = depth[u] + 1;
                order.push_back(v);
            }
        }
    }

    for (int j = 1; j < LOG; ++j) {
        for (int u = 1; u <= n; ++u) {
            up[j][u] = up[j - 1][up[j - 1][u]];
        }
    }

    auto lca = [&](int u, int v) -> int {
        if (depth[u] < depth[v]) swap(u, v);
        int diff = depth[u] - depth[v];
        for (int j = 0; j < LOG; ++j) {
            if ((diff >> j) & 1) u = up[j][u];
        }
        if (u == v) return u;
        for (int j = LOG - 1; j >= 0; --j) {
            if (up[j][u] != up[j][v]) {
                u = up[j][u];
                v = up[j][v];
            }
        }
        return up[0][u];
    };

    while (q--) {
        int u, v;
        cin >> u >> v;
        cout << lca(u, v) << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    q = int(data[1])

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    LOG = 15
    up = [[0] * (n + 1) for _ in range(LOG)]
    depth = [0] * (n + 1)
    order = [1]
    head = 0
    up0 = up[0]
    while head < len(order):
        u = order[head]
        head += 1
        p = up0[u]
        du = depth[u] + 1
        for v in adj[u]:
            if v != p:
                up0[v] = u
                depth[v] = du
                order.append(v)

    for j in range(1, LOG):
        prev = up[j - 1]
        cur = up[j]
        for u in range(1, n + 1):
            cur[u] = prev[prev[u]]

    out = []
    for _ in range(q):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        if depth[u] < depth[v]:
            u, v = v, u
        diff = depth[u] - depth[v]
        j = 0
        while diff:
            if diff & 1:
                u = up[j][u]
            diff >>= 1
            j += 1
        if u == v:
            out.append(str(u))
            continue
        for j in range(LOG - 1, -1, -1):
            upj = up[j]
            if upj[u] != upj[v]:
                u = upj[u]
                v = upj[v]
        out.append(str(up0[u]))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-lca-queries",
        "title": "Tổ tiên chung gần nhất (LCA)",
        "shortDescription": "Trả lời Q truy vấn tìm tổ tiên chung gần nhất LCA(u, v) trên cây bằng Binary Lifting.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "lca", "binary lifting", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) bằng Binary Lifting.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp16-tree-weighted-distances
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(n - 1):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    parent = [0] * (n + 1)
    pw = [0] * (n + 1)
    depth = [0] * (n + 1)
    dq = deque([1])
    vis = [False] * (n + 1)
    vis[1] = True
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if not vis[v]:
                vis[v] = True
                parent[v] = u
                pw[v] = w
                depth[v] = depth[u] + 1
                dq.append(v)

    out = []
    for _ in range(q):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        ans = 0
        while depth[u] > depth[v]:
            ans += pw[u]
            u = parent[u]
        while depth[v] > depth[u]:
            ans += pw[v]
            v = parent[v]
        while u != v:
            ans += pw[u] + pw[v]
            u = parent[u]
            v = parent[v]
        out.append(str(ans))
    return "\n".join(out)


def build_p05() -> dict:
    rng = random.Random(1605)

    def add_weights(edges: List[Tuple[int, int]], lo: int = 1, hi: int = 1_000_000_000) -> List[Tuple[int, int, int]]:
        return [(u, v, rng.randint(lo, hi)) for u, v in edges]

    tests = [
        # 3 public samples
        {
            "input": fmt_weighted_tree_queries(
                5,
                [(1, 2, 4), (1, 3, 7), (2, 4, 5), (2, 5, 3)],
                [(4, 5), (3, 4), (2, 2)],
            ),
            "hidden": False,
            "expected": "8\n16\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                4,
                [(1, 2, 1_000_000_000), (2, 3, 1_000_000_000), (3, 4, 1_000_000_000)],
                [(1, 4), (2, 4)],
            ),
            "hidden": False,
            "expected": "3000000000\n2000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(1, [], [(1, 1)]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_weighted_tree_queries(
                2,
                [(1, 2, 1_000_000_000)],
                [(1, 2), (2, 1), (1, 1), (2, 2)],
            ),
            "hidden": True,
            "expected": "1000000000\n1000000000\n0\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                30,
                add_weights(make_path_tree(30), 900_000_000, 1_000_000_000),
                [(1, 30), (30, 1), (5, 25), (15, 16)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                40,
                add_weights(make_star_tree(40), 1, 1_000_000_000),
                [(2, 40), (1, 20), (15, 15), (3, 39)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                120,
                add_weights(relabel_tree(120, make_random_tree(120, rng), rng)),
                [(rng.randint(1, 120), rng.randint(1, 120)) for _ in range(150)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                250,
                add_weights(relabel_tree(250, make_binary_tree(250), rng)),
                [(rng.randint(1, 250), rng.randint(1, 250)) for _ in range(250)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    med_large = [
        (600, 1_000, relabel_tree(600, make_random_tree(600, rng), rng), 1_000_000_000, True),
        (1_200, 2_000, relabel_tree(1_200, make_caterpillar_tree(1_200, 500, rng), rng), 1_000_000_000, True),
        (2_500, 3_500, relabel_tree(2_500, make_path_tree(2_500), rng), 1_000_000_000, False),
        (3_500, 5_000, make_binary_tree(3_500), 1_000_000_000, False),
        (4_500, 4_000, relabel_tree(4_500, make_random_tree(4_500, rng, max_depth_bias=10), rng), 1_000_000_000, False),
        (5_500, 1_800, make_path_tree(5_500), 1_000_000_000, False),
        (6_200, 500, relabel_tree(6_200, make_path_tree(6_200), rng), 1_000_000_000, False),
        (8_000, 2_500, make_star_tree(8_000), 999, False),
    ]
    for n, q, edges, max_w, chk in med_large:
        lo_w = max(1, max_w // 2) if max_w > 1000 else 1
        we = add_weights(edges, lo_w, max_w)
        qs = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(q)]
        tests.append({"input": fmt_weighted_tree_queries(n, we, qs), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        q = rng.randint(1, 35)
        we = add_weights(relabel_tree(n, make_random_tree(n, rng), rng))
        qs = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(q)]
        extra_stress.append(fmt_weighted_tree_queries(n, we, qs))

    statement = r"""Cho một cây có trọng số gồm $N$ đỉnh đánh số từ $1$ đến $N$. Mỗi cạnh nối hai đỉnh $u, v$ có độ dài (trọng số nguyên dương) là $w$.

Cho $Q$ truy vấn, mỗi truy vấn gồm hai đỉnh $(u, v)$. Hãy tính tổng trọng số các cạnh trên đường đi đơn duy nhất nối giữa $u$ và $v$ (nếu $u = v$, khoảng cách bằng $0$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ ($1 \le u, v \le N$, $1 \le w \le 10^9$) mô tả một cạnh nối $u$ và $v$ có trọng số $w$.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra một số nguyên là khoảng cách giữa hai đỉnh trong truy vấn thứ $i$.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $1 \le w \le 10^9$

### Subtasks
- **Subtask 1 (35% số test):** $N, Q \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1: đường đi từ $4$ tới $5$ qua $4 - 2 - 5$ có tổng trọng số $5 + 3 = 8$; đường đi từ $3$ tới $4$ qua $3 - 1 - 2 - 4$ có tổng trọng số $7 + 4 + 5 = 16$.
- Với ví dụ 2: kết quả có thể vượt quá $2^{31} - 1$, cần dùng kiểu số nguyên 64-bit."""

    hints = r"""**Gợi ý 1 (Khoảng cách từ gốc):**
Chọn đỉnh $1$ làm gốc cây. Trong một lượt BFS từ gốc $1$, ta tính được khoảng cách $\text{dist}[u]$ là tổng trọng số từ đỉnh $1$ đến đỉnh $u$ (dùng `long long`).

**Gợi ý 2 (Công thức qua LCA):**
Đường đi đơn giữa $u$ và $v$ đi từ $u$ lên tới $l = \text{LCA}(u, v)$ rồi đi xuống $v$. Phần đường đi từ gốc $1$ đến $l$ bị tính lặp 2 lần trong $\text{dist}[u] + \text{dist}[v]$. Do đó:
$$\text{distance}(u, v) = \text{dist}[u] + \text{dist}[v] - 2 \cdot \text{dist}[\text{LCA}(u, v)]$$

**Gợi ý 3 (Cài đặt):**
Kết hợp BFS tính `dist[u]` cùng với bảng Binary Lifting `up[j][u]` để trả lời mỗi truy vấn trong $O(\log N)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<vector<pair<int, long long>>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        long long w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    const int LOG = 15;
    vector<vector<int>> up(LOG, vector<int>(n + 1, 0));
    vector<int> depth(n + 1, 0), order;
    vector<long long> dist(n + 1, 0);
    order.reserve(n);
    order.push_back(1);

    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (auto [v, w] : adj[u]) {
            if (v != up[0][u]) {
                up[0][v] = u;
                depth[v] = depth[u] + 1;
                dist[v] = dist[u] + w;
                order.push_back(v);
            }
        }
    }

    for (int j = 1; j < LOG; ++j) {
        for (int u = 1; u <= n; ++u) {
            up[j][u] = up[j - 1][up[j - 1][u]];
        }
    }

    auto lca = [&](int u, int v) -> int {
        if (depth[u] < depth[v]) swap(u, v);
        int diff = depth[u] - depth[v];
        for (int j = 0; j < LOG; ++j) {
            if ((diff >> j) & 1) u = up[j][u];
        }
        if (u == v) return u;
        for (int j = LOG - 1; j >= 0; --j) {
            if (up[j][u] != up[j][v]) {
                u = up[j][u];
                v = up[j][v];
            }
        }
        return up[0][u];
    };

    while (q--) {
        int u, v;
        cin >> u >> v;
        int w = lca(u, v);
        cout << dist[u] + dist[v] - 2LL * dist[w] << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    q = int(data[1])

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    LOG = 15
    up = [[0] * (n + 1) for _ in range(LOG)]
    depth = [0] * (n + 1)
    dist = [0] * (n + 1)
    order = [1]
    head = 0
    up0 = up[0]
    while head < len(order):
        u = order[head]
        head += 1
        p = up0[u]
        du = depth[u] + 1
        wu = dist[u]
        for v, w in adj[u]:
            if v != p:
                up0[v] = u
                depth[v] = du
                dist[v] = wu + w
                order.append(v)

    for j in range(1, LOG):
        prev = up[j - 1]
        cur = up[j]
        for u in range(1, n + 1):
            cur[u] = prev[prev[u]]

    out = []
    for _ in range(q):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        a, b = u, v
        if depth[a] < depth[b]:
            a, b = b, a
        diff = depth[a] - depth[b]
        j = 0
        while diff:
            if diff & 1:
                a = up[j][a]
            diff >>= 1
            j += 1
        if a != b:
            for j in range(LOG - 1, -1, -1):
                upj = up[j]
                if upj[a] != upj[b]:
                    a = upj[a]
                    b = upj[b]
            lca_uv = up0[a]
        else:
            lca_uv = a
        out.append(str(dist[u] + dist[v] - 2 * dist[lca_uv]))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-tree-weighted-distances",
        "title": "Khoảng cách trên cây có trọng số",
        "shortDescription": "Tính khoảng cách giữa hai đỉnh bất kỳ trên cây có trọng số bằng dist[u] + dist[v] - 2*dist[LCA].",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "lca", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) dùng LCA + mảng dist 64-bit.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp16-euler-tour-subtree-sum
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2 : n + 2]
    idx = n + 2
    edges = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(n - 1)]
    idx += 2 * (n - 1)
    adj, parent, _ = build_tree_parent_depth(n, edges, 1)

    children = [[] for _ in range(n + 1)]
    for u in range(2, n + 1):
        children[parent[u]].append(u)

    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            u, val = toks[idx + 1], toks[idx + 2]
            idx += 3
            a[u] = val
        else:
            u = toks[idx + 1]
            idx += 2
            s = 0
            st = [u]
            while st:
                cur = st.pop()
                s += a[cur]
                for ch in children[cur]:
                    st.append(ch)
            out.append(str(s))
    return "\n".join(out)


def gen_val_queries(
    n: int, q: int, rng: random.Random, lo_v: int = -1_000_000_000, hi_v: int = 1_000_000_000
) -> List[Tuple[int, ...]]:
    qs: List[Tuple[int, ...]] = []
    has_type2 = False
    for i in range(q):
        if i == q - 1 and not has_type2:
            t = 2
        else:
            t = 1 if rng.random() < 0.45 else 2
        if t == 1:
            qs.append((1, rng.randint(1, n), rng.randint(lo_v, hi_v)))
        else:
            has_type2 = True
            qs.append((2, rng.randint(1, n)))
    return qs


def build_p06() -> dict:
    rng = random.Random(1606)

    tests = [
        # 3 public samples
        {
            "input": fmt_node_val_queries(
                5,
                [4, 2, 5, 2, 1],
                [(1, 2), (1, 3), (3, 4), (3, 5)],
                [(2, 3), (1, 5, 3), (2, 3), (2, 1)],
            ),
            "hidden": False,
            "expected": "8\n10\n16",
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                4,
                [-10, 20, -30, 40],
                [(1, 2), (2, 3), (3, 4)],
                [(2, 1), (2, 3), (1, 4, -50), (2, 2), (2, 4)],
            ),
            "hidden": False,
            "expected": "20\n10\n-60\n-50",
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                1,
                [100],
                [],
                [(2, 1), (1, 1, -200), (2, 1)],
            ),
            "hidden": False,
            "expected": "100\n-200",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_node_val_queries(
                10,
                [1_000_000_000] * 10,
                make_path_tree(10),
                [(2, 1), (1, 5, -1_000_000_000), (2, 1), (2, 5), (2, 6)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                20,
                [rng.randint(-100, 100) for _ in range(20)],
                make_star_tree(20),
                [(2, 1)] + [(1, i, i * 10) for i in range(2, 10)] + [(2, 1), (2, 5), (2, 15)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                60,
                [rng.randint(-10**9, 10**9) for _ in range(60)],
                relabel_tree(60, make_random_tree(60, rng), rng),
                gen_val_queries(60, 80, rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                150,
                [rng.randint(-10**9, 10**9) for _ in range(150)],
                relabel_tree(150, make_binary_tree(150), rng),
                gen_val_queries(150, 200, rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                300,
                [rng.randint(-10**9, 10**9) for _ in range(300)],
                make_path_tree(300),
                gen_val_queries(300, 300, rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    med_large = [
        (700, 1_000, relabel_tree(700, make_random_tree(700, rng), rng), 1_000_000_000, True),
        (1_500, 2_000, relabel_tree(1_500, make_caterpillar_tree(1_500, 600, rng), rng), 1_000_000_000, True),
        (3_000, 3_500, relabel_tree(3_000, make_path_tree(3_000), rng), 1_000_000_000, False),
        (4_200, 4_500, make_binary_tree(4_200), 1_000_000_000, False),
        (5_000, 3_500, relabel_tree(5_000, make_random_tree(5_000, rng, max_depth_bias=10), rng), 1_000_000_000, False),
        (6_000, 2_000, make_path_tree(6_000), 1_000_000_000, False),
        (8_500, 3_000, make_star_tree(8_500), 999, False),
        (9_500, 2_500, make_path_tree(9_500), 99, False),
    ]
    for n, q, edges, mv, chk in med_large:
        vals = [rng.randint(-mv, mv) for _ in range(n)]
        qs = gen_val_queries(n, q, rng, -mv, mv)
        tests.append({"input": fmt_node_val_queries(n, vals, edges, qs), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        q = rng.randint(1, 35)
        vals = [rng.randint(-10**9, 10**9) for _ in range(n)]
        edges = relabel_tree(n, make_random_tree(n, rng), rng)
        qs = gen_val_queries(n, q, rng)
        extra_stress.append(fmt_node_val_queries(n, vals, edges, qs))

    statement = r"""Cho một cây gồm $N$ đỉnh đánh số từ $1$ đến $N$, có gốc tại đỉnh $1$. Ban đầu, mỗi đỉnh $u$ mang giá trị nguyên $a_u$.

Hãy xử lý $Q$ truy vấn thuộc một trong hai dạng sau:
- `1 u val`: Cập nhật giá trị tại đỉnh $u$ thành $\text{val}$ (tức gán $a_u \leftarrow \text{val}$).
- `2 u`: Tính và in ra tổng giá trị của tất cả các đỉnh thuộc **cây con gốc $u$** (bao gồm cả đỉnh $u$).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) mô tả một cạnh của cây.
- $Q$ dòng tiếp theo, mỗi dòng là một truy vấn `1 u val` ($1 \le u \le N$, $|\text{val}| \le 10^9$) hoặc `2 u` ($1 \le u \le N$). Dữ liệu đảm bảo có ít nhất một truy vấn loại `2`.

### Kết quả
- Với mỗi truy vấn loại `2`, in ra một dòng chứa kết quả tìm được.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $|a_i|, |\text{val}| \le 10^9$

### Subtasks
- **Subtask 1 (35% số test):** $N, Q \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1: cây con gốc $3$ gồm $\{3, 4, 5\}$ có tổng ban đầu là $5 + 2 + 1 = 8$. Sau khi gán $a_5 = 3$, tổng cây con gốc $3$ tăng lên $5 + 2 + 3 = 10$, và tổng toàn cây (cây con gốc $1$) là $4 + 2 + 5 + 2 + 3 = 16$."""

    hints = r"""**Gợi ý 1 (Trải phẳng cây — Euler Tour):**
Duyệt DFS từ gốc `1` và ghi nhận thời điểm vào `tin[u]` (tăng bộ đếm `timer` mỗi khi thăm mới một đỉnh) và thời điểm thoát `tout[u]` (giá trị `timer` sau khi thăm xong toàn bộ cây con gốc `u`).
Khi đó, toàn bộ các đỉnh thuộc cây con gốc $u$ tương ứng chính xác với một **đoạn liên tiếp** `[tin[u], tout[u]]` trên dãy Euler Tour!

**Gợi ý 2 (Cấu trúc dữ liệu BIT / Fenwick Tree):**
Bài toán quy về trên mảng 1 chiều độ dài $N$:
- Cập nhật điểm tại vị trí `tin[u]` một lượng `delta = val - a[u]`, sau đó cập nhật `a[u] = val`.
- Truy vấn tổng đoạn `[tin[u], tout[u]]` bằng `bit.query(tout[u]) - bit.query(tin[u] - 1)`.

**Gợi ý 3 (Cài đặt Euler Tour không đệ quy):**
Để tránh tràn ngăn xếp trên cây đường thẳng, ta dùng stack hai trạng thái: đẩy `u > 0` (lúc vào: tăng `timer`, gán `tin[u] = timer`, đẩy `~u` vào stack để đánh dấu lúc thoát, rồi đẩy các con vào stack); khi pop gặp số âm `x`, gán `tout[~x] = timer`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct BIT {
    int n;
    vector<long long> tree;
    explicit BIT(int n) : n(n), tree(n + 1, 0) {}
    void add(int idx, long long val) {
        for (; idx <= n; idx += idx & -idx) tree[idx] += val;
    }
    long long sum(int idx) const {
        long long res = 0;
        for (; idx > 0; idx -= idx & -idx) res += tree[idx];
        return res;
    }
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<long long> a(n + 1);
    for (int i = 1; i <= n; ++i) cin >> a[i];

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> tin(n + 1, 0), tout(n + 1, 0), parent(n + 1, 0);
    int timer = 0;
    vector<int> st;
    st.reserve(2 * n);
    st.push_back(1);
    while (!st.empty()) {
        int u = st.back();
        st.pop_back();
        if (u > 0) {
            tin[u] = ++timer;
            st.push_back(~u);
            int p = parent[u];
            for (int v : adj[u]) {
                if (v != p) {
                    parent[v] = u;
                    st.push_back(v);
                }
            }
        } else {
            tout[~u] = timer;
        }
    }

    BIT bit(n);
    for (int u = 1; u <= n; ++u) bit.add(tin[u], a[u]);

    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int u;
            long long val;
            cin >> u >> val;
            long long delta = val - a[u];
            a[u] = val;
            bit.add(tin[u], delta);
        } else {
            int u;
            cin >> u;
            cout << bit.sum(tout[u]) - bit.sum(tin[u] - 1) << '\n';
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
    q = int(data[1])

    a = [0] * (n + 1)
    for i in range(1, n + 1):
        a[i] = int(data[i + 1])

    adj = [[] for _ in range(n + 1)]
    idx = n + 2
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    tin = [0] * (n + 1)
    tout = [0] * (n + 1)
    parent = [0] * (n + 1)
    timer = 0
    stack = [1]
    while stack:
        u = stack.pop()
        if u > 0:
            timer += 1
            tin[u] = timer
            stack.append(~u)
            p = parent[u]
            for v in adj[u]:
                if v != p:
                    parent[v] = u
                    stack.append(v)
        else:
            tout[~u] = timer

    bit = [0] * (n + 1)
    for u in range(1, n + 1):
        i = tin[u]
        val = a[u]
        while i <= n:
            bit[i] += val
            i += i & -i

    out = []
    for _ in range(q):
        t = int(data[idx])
        if t == 1:
            u = int(data[idx + 1])
            val = int(data[idx + 2])
            idx += 3
            delta = val - a[u]
            a[u] = val
            i = tin[u]
            while i <= n:
                bit[i] += delta
                i += i & -i
        else:
            u = int(data[idx + 1])
            idx += 2
            s_r = 0
            i = tout[u]
            while i > 0:
                s_r += bit[i]
                i -= i & -i
            s_l = 0
            i = tin[u] - 1
            while i > 0:
                s_l += bit[i]
                i -= i & -i
            out.append(str(s_r - s_l))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-euler-tour-subtree-sum",
        "title": "Truy vấn tổng cây con (Euler Tour + BIT)",
        "shortDescription": "Cập nhật giá trị đỉnh và truy vấn tổng giá trị cây con trên cây bằng Euler Tour kết hợp Fenwick Tree.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "euler tour", "bit-fenwick", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) bằng Euler Tour lặp + BIT.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp16-euler-tour-root-path-sum
# ============================================================================

def brute_p07(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    a = [0] + toks[2 : n + 2]
    idx = n + 2
    edges = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(n - 1)]
    idx += 2 * (n - 1)
    _, parent, _ = build_tree_parent_depth(n, edges, 1)

    out = []
    for _ in range(q):
        t = toks[idx]
        if t == 1:
            u, val = toks[idx + 1], toks[idx + 2]
            idx += 3
            a[u] = val
        else:
            u = toks[idx + 1]
            idx += 2
            s = 0
            cur = u
            while cur != 0:
                s += a[cur]
                cur = parent[cur]
            out.append(str(s))
    return "\n".join(out)


def build_p07() -> dict:
    rng = random.Random(1607)

    tests = [
        # 3 public samples
        {
            "input": fmt_node_val_queries(
                5,
                [4, 2, 5, 2, 1],
                [(1, 2), (1, 3), (3, 4), (3, 5)],
                [(2, 4), (1, 3, 10), (2, 4), (2, 2)],
            ),
            "hidden": False,
            "expected": "11\n16\n6",
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                4,
                [10, -5, 20, -15],
                [(1, 2), (2, 3), (3, 4)],
                [(2, 4), (1, 1, -10), (2, 4), (2, 3)],
            ),
            "hidden": False,
            "expected": "10\n-10\n5",
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                1,
                [-50],
                [],
                [(2, 1), (1, 1, 75), (2, 1)],
            ),
            "hidden": False,
            "expected": "-50\n75",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_node_val_queries(
                12,
                [1_000_000_000] * 12,
                make_path_tree(12),
                [(2, 12), (1, 1, -1_000_000_000), (1, 6, -1_000_000_000), (2, 12), (2, 5)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                25,
                [rng.randint(-100, 100) for _ in range(25)],
                make_star_tree(25),
                [(2, 25), (1, 1, 500), (2, 2), (2, 25), (1, 25, -500), (2, 25)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                70,
                [rng.randint(-10**9, 10**9) for _ in range(70)],
                relabel_tree(70, make_random_tree(70, rng), rng),
                gen_val_queries(70, 90, rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                160,
                [rng.randint(-10**9, 10**9) for _ in range(160)],
                relabel_tree(160, make_binary_tree(160), rng),
                gen_val_queries(160, 200, rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_node_val_queries(
                300,
                [rng.randint(-10**9, 10**9) for _ in range(300)],
                make_path_tree(300),
                gen_val_queries(300, 300, rng),
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    med_large = [
        (700, 1_000, relabel_tree(700, make_random_tree(700, rng), rng), 1_000_000_000, True),
        (1_500, 2_000, relabel_tree(1_500, make_caterpillar_tree(1_500, 600, rng), rng), 1_000_000_000, True),
        (3_000, 3_500, relabel_tree(3_000, make_path_tree(3_000), rng), 1_000_000_000, False),
        (4_200, 4_500, make_binary_tree(4_200), 1_000_000_000, False),
        (5_000, 3_500, relabel_tree(5_000, make_random_tree(5_000, rng, max_depth_bias=10), rng), 1_000_000_000, False),
        (6_000, 2_000, make_path_tree(6_000), 1_000_000_000, False),
        (8_500, 3_000, make_star_tree(8_500), 999, False),
        (9_500, 2_500, make_path_tree(9_500), 99, False),
    ]
    for n, q, edges, mv, chk in med_large:
        vals = [rng.randint(-mv, mv) for _ in range(n)]
        qs = gen_val_queries(n, q, rng, -mv, mv)
        tests.append({"input": fmt_node_val_queries(n, vals, edges, qs), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 35)
        q = rng.randint(1, 35)
        vals = [rng.randint(-10**9, 10**9) for _ in range(n)]
        edges = relabel_tree(n, make_random_tree(n, rng), rng)
        qs = gen_val_queries(n, q, rng)
        extra_stress.append(fmt_node_val_queries(n, vals, edges, qs))

    statement = r"""Cho một cây gồm $N$ đỉnh đánh số từ $1$ đến $N$, có gốc tại đỉnh $1$. Ban đầu, mỗi đỉnh $u$ có giá trị nguyên $a_u$.

Hãy xử lý $Q$ truy vấn thuộc một trong hai dạng sau:
- `1 u val`: Gán lại giá trị tại đỉnh $u$ thành $\text{val}$ ($a_u \leftarrow \text{val}$).
- `2 u`: Tính và in ra tổng giá trị của tất cả các đỉnh nằm trên đường đi đơn từ gốc $1$ đến đỉnh $u$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($1 \le N, Q \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ ($|a_i| \le 10^9$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cạnh của cây.
- $Q$ dòng tiếp theo, mỗi dòng là một truy vấn `1 u val` ($1 \le u \le N$, $|\text{val}| \le 10^9$) hoặc `2 u` ($1 \le u \le N$). Dữ liệu đảm bảo có ít nhất một truy vấn loại `2`.

### Kết quả
- Với mỗi truy vấn loại `2`, in ra một dòng chứa kết quả tương ứng.

### Ràng buộc
- $1 \le N, Q \le 15\,000$
- $|a_i|, |\text{val}| \le 10^9$

### Subtasks
- **Subtask 1 (35% số test):** $N, Q \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1: đường đi từ $1$ đến $4$ là $1 - 3 - 4$ có tổng ban đầu $4 + 5 + 2 = 11$. Sau khi đổi $a_3 = 10$, tổng trên đường đi từ $1$ đến $4$ là $4 + 10 + 2 = 16$, còn đường đi từ $1$ đến $2$ giữ nguyên $4 + 2 = 6$."""

    hints = r"""**Gợi ý 1 (Ảnh hưởng của một đỉnh lên các đường từ gốc):**
Đỉnh $u$ nằm trên đường đi từ gốc $1$ đến đỉnh $x$ khi và chỉ khi $x$ nằm trong **cây con gốc $u$**!
Nói cách khác, khi tăng giá trị của đỉnh $u$ thêm `delta`, tổng đường đi từ gốc của **mọi** đỉnh $x$ trong cây con gốc $u$ đều tăng thêm `delta`.

**Gợi ý 2 (Euler Tour + Mảng hiệu trên BIT):**
Với khoảng Euler Tour `[tin[u], tout[u]]`:
- Thao tác `1 u val` với `delta = val - a[u]` tương ứng với **cập nhật đoạn** cộng `delta` lên toàn bộ `[tin[u], tout[u]]`.
- Thao tác `2 u` chính là **truy vấn điểm** tại vị trí `tin[u]`.

**Gợi ý 3 (Cập nhật đoạn + Truy vấn điểm bằng BIT):**
Dùng mảng hiệu trên cây Fenwick (BIT) kích thước $N + 1$:
- Để cộng `delta` vào đoạn `[L, R]`: gọi `bit_add(L, delta)` và `bit_add(R + 1, -delta)` (nếu $R + 1 \le N$).
- Để lấy giá trị tại vị trí `pos = tin[u]`: chỉ cần tính tổng tiền tố `bit_sum(tin[u])`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

struct BIT {
    int n;
    vector<long long> tree;
    explicit BIT(int n) : n(n), tree(n + 2, 0) {}
    void add(int idx, long long val) {
        for (; idx <= n; idx += idx & -idx) tree[idx] += val;
    }
    void range_add(int l, int r, long long val) {
        add(l, val);
        if (r + 1 <= n) add(r + 1, -val);
    }
    long long point_query(int idx) const {
        long long res = 0;
        for (; idx > 0; idx -= idx & -idx) res += tree[idx];
        return res;
    }
};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<long long> a(n + 1);
    for (int i = 1; i <= n; ++i) cin >> a[i];

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> tin(n + 1, 0), tout(n + 1, 0), parent(n + 1, 0);
    int timer = 0;
    vector<int> st;
    st.reserve(2 * n);
    st.push_back(1);
    while (!st.empty()) {
        int u = st.back();
        st.pop_back();
        if (u > 0) {
            tin[u] = ++timer;
            st.push_back(~u);
            int p = parent[u];
            for (int v : adj[u]) {
                if (v != p) {
                    parent[v] = u;
                    st.push_back(v);
                }
            }
        } else {
            tout[~u] = timer;
        }
    }

    BIT bit(n);
    for (int u = 1; u <= n; ++u) bit.range_add(tin[u], tout[u], a[u]);

    while (q--) {
        int type;
        cin >> type;
        if (type == 1) {
            int u;
            long long val;
            cin >> u >> val;
            long long delta = val - a[u];
            a[u] = val;
            bit.range_add(tin[u], tout[u], delta);
        } else {
            int u;
            cin >> u;
            cout << bit.point_query(tin[u]) << '\n';
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
    q = int(data[1])

    a = [0] * (n + 1)
    for i in range(1, n + 1):
        a[i] = int(data[i + 1])

    adj = [[] for _ in range(n + 1)]
    idx = n + 2
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    tin = [0] * (n + 1)
    tout = [0] * (n + 1)
    parent = [0] * (n + 1)
    timer = 0
    stack = [1]
    while stack:
        u = stack.pop()
        if u > 0:
            timer += 1
            tin[u] = timer
            stack.append(~u)
            p = parent[u]
            for v in adj[u]:
                if v != p:
                    parent[v] = u
                    stack.append(v)
        else:
            tout[~u] = timer

    bit = [0] * (n + 2)

    def bit_add(pos: int, val: int) -> None:
        while pos <= n:
            bit[pos] += val
            pos += pos & -pos

    for u in range(1, n + 1):
        bit_add(tin[u], a[u])
        if tout[u] + 1 <= n:
            bit_add(tout[u] + 1, -a[u])

    out = []
    for _ in range(q):
        t = int(data[idx])
        if t == 1:
            u = int(data[idx + 1])
            val = int(data[idx + 2])
            idx += 3
            delta = val - a[u]
            a[u] = val
            bit_add(tin[u], delta)
            if tout[u] + 1 <= n:
                bit_add(tout[u] + 1, -delta)
        else:
            u = int(data[idx + 1])
            idx += 2
            s = 0
            pos = tin[u]
            while pos > 0:
                s += bit[pos]
                pos -= pos & -pos
            out.append(str(s))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-euler-tour-root-path-sum",
        "title": "Truy vấn tổng đường đi từ gốc (Euler Tour + BIT)",
        "shortDescription": "Cập nhật giá trị đỉnh và truy vấn tổng đường đi từ gốc 1 bằng Euler Tour kết hợp BIT mảng hiệu.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "euler tour", "bit-fenwick", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) bằng Euler Tour + BIT mảng hiệu.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp16-tree-rerooting-distances
# ============================================================================

def brute_p08(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    adj = [[] for _ in range(n + 1)]
    idx = 1
    for _ in range(n - 1):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    mn = 10**18
    mx = -1
    for s in range(1, n + 1):
        dist = [-1] * (n + 1)
        dist[s] = 0
        q = deque([s])
        total = 0
        while q:
            u = q.popleft()
            total += dist[u]
            for v in adj[u]:
                if dist[v] == -1:
                    dist[v] = dist[u] + 1
                    q.append(v)
        mn = min(mn, total)
        mx = max(mx, total)
    return f"{mn} {mx}"


def build_p08() -> dict:
    rng = random.Random(1608)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_only(5, [(1, 2), (1, 3), (3, 4), (3, 5)]),
            "hidden": False,
            "expected": "5 9",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(4, [(1, 2), (2, 3), (3, 4)]),
            "hidden": False,
            "expected": "4 6",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(1, []),
            "hidden": False,
            "expected": "0 0",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_tree_only(2, [(1, 2)]),
            "hidden": True,
            "expected": "1 1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(10, make_star_tree(10)),
            "hidden": True,
            "expected": "9 17",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(31, make_binary_tree(31)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(80, relabel_tree(80, make_two_centroid_tree(40, rng), rng, fix_root_1=False)),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_only(150, relabel_tree(150, make_random_tree(150, rng), rng, fix_root_1=False)),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    specs = [
        (400, relabel_tree(400, make_random_tree(400, rng), rng, fix_root_1=False), True),
        (900, relabel_tree(900, make_caterpillar_tree(900, 350, rng), rng, fix_root_1=False), True),
        (2_500, make_path_tree(2_500), False),
        (5_000, relabel_tree(5_000, make_two_centroid_tree(2_500, rng), rng, fix_root_1=False), False),
        (7_500, relabel_tree(7_500, make_binary_tree(7_500), rng, fix_root_1=False), False),
        (9_500, make_star_tree(9_500, center=5000), False),
        (11_500, make_path_tree(11_500), False),
        (12_500, relabel_tree(12_500, make_random_tree(12_500, rng, max_depth_bias=12), rng, fix_root_1=False), False),
    ]
    for _, edges, chk in specs:
        n = len(edges) + 1
        tests.append({"input": fmt_tree_only(n, edges), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        edges = relabel_tree(n, make_random_tree(n, rng), rng, fix_root_1=False)
        extra_stress.append(fmt_tree_only(n, edges))

    statement = r"""Cho một cây không trọng số gồm $N$ đỉnh đánh số từ $1$ đến $N$. Với mỗi đỉnh $u$ ($1 \le u \le N$), định nghĩa:
$$D(u) = \sum_{v=1}^{N} \text{dist}(u, v)$$
trong đó $\text{dist}(u, v)$ là số cạnh trên đường đi ngắn nhất giữa hai đỉnh $u$ và $v$.

Hãy tìm giá trị nhỏ nhất và giá trị lớn nhất của $D(u)$ xét trên tất cả $N$ đỉnh của cây.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($1 \le N \le 20\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) biểu diễn một cạnh vô hướng của cây.

### Kết quả
- In ra một dòng duy nhất gồm hai số nguyên: $\min_{1 \le u \le N} D(u)$ và $\max_{1 \le u \le N} D(u)$ cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le N \le 20\,000$
- Đồ thị đầu vào luôn là một cây hợp lệ.

### Subtasks
- **Subtask 1 (35% số test):** $N \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1 ($N = 5$, cây có $3$ nối $1, 4, 5$ và $1$ nối $2$):
  - $D(1) = 0 + 1 + 1 + 2 + 2 = 6$, $D(2) = 9$, $D(3) = 5$, $D(4) = 8$, $D(5) = 8$.
  - Vậy giá trị nhỏ nhất là $5$ và lớn nhất là $9$."""

    hints = r"""**Gợi ý 1 (Tính đáp án tại gốc cố định $1$):**
Chọn tạm đỉnh $1$ làm gốc cây. Với mỗi đỉnh $u$, gọi `sub[u]` là số đỉnh thuộc cây con gốc $u$, và `down[u]` là tổng khoảng cách từ $u$ đến mọi đỉnh nằm trong cây con gốc $u$.
Duyệt cây theo thứ tự ngược BFS (`order` từ cuối về đầu):
- `sub[p] += sub[u]`
- `down[p] += down[u] + sub[u]`
Khi đó `ans[1] = down[1]`.

**Gợi ý 2 (Kỹ thuật đổi gốc — Rerooting DP):**
Giả sử ta đã biết `ans[p]` của cha $p$ và muốn tính `ans[u]` cho con trực tiếp $u$ của $p$:
- Khi chuyển gốc từ $p$ sang $u$, tất cả `sub[u]` đỉnh nằm trong cây con gốc $u$ sẽ **gần lại** thêm $1$ bước.
- Tất cả $N - \text{sub}[u]$ đỉnh còn lại (không nằm trong cây con gốc $u$) sẽ **xa ra** thêm $1$ bước.
Do đó:
$$\text{ans}[u] = \text{ans}[p] - \text{sub}[u] + (N - \text{sub}[u]) = \text{ans}[p] + N - 2 \cdot \text{sub}[u]$$

**Gợi ý 3 (Cài đặt lặp $O(N)$):**
Chỉ cần duyệt xuôi mảng `order` (bắt đầu từ chỉ số `1` vì `order[0] = 1` đã có `ans[1]`), ta tính được toàn bộ `ans[u]` trong $O(N)$ mà không cần đệ quy!"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    vector<int> parent(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);
    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (int v : adj[u]) {
            if (v != parent[u]) {
                parent[v] = u;
                order.push_back(v);
            }
        }
    }

    vector<long long> sub(n + 1, 1), down(n + 1, 0);
    for (int i = n - 1; i >= 1; --i) {
        int u = order[i];
        int p = parent[u];
        sub[p] += sub[u];
        down[p] += down[u] + sub[u];
    }

    vector<long long> ans(n + 1, 0);
    ans[1] = down[1];
    long long mn = ans[1], mx = ans[1];
    for (int i = 1; i < n; ++i) {
        int u = order[i];
        ans[u] = ans[parent[u]] + n - 2LL * sub[u];
        mn = min(mn, ans[u]);
        mx = max(mx, ans[u]);
    }

    cout << mn << ' ' << mx << '\n';
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
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [0] * (n + 1)
    order = [1]
    head = 0
    while head < len(order):
        u = order[head]
        head += 1
        p = parent[u]
        for v in adj[u]:
            if v != p:
                parent[v] = u
                order.append(v)

    sub = [1] * (n + 1)
    down = [0] * (n + 1)
    for i in range(n - 1, 0, -1):
        u = order[i]
        p = parent[u]
        sub[p] += sub[u]
        down[p] += down[u] + sub[u]

    ans = [0] * (n + 1)
    ans[1] = down[1]
    mn = ans[1]
    mx = ans[1]
    for i in range(1, n):
        u = order[i]
        val = ans[parent[u]] + n - 2 * sub[u]
        ans[u] = val
        if val < mn:
            mn = val
        if val > mx:
            mx = val

    sys.stdout.write(f"{mn} {mx}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-tree-rerooting-distances",
        "title": "Tổng khoảng cách từ mọi đỉnh (Rerooting DP)",
        "shortDescription": "Tìm giá trị nhỏ nhất và lớn nhất của tổng khoảng cách từ một đỉnh tới mọi đỉnh bằng kỹ thuật Rerooting DP O(N).",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "quy hoạch động", "rerooting", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(N) bằng Rerooting DP lặp (BFS + duyệt xuôi/ngược).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp16-tree-max-edge-path
# ============================================================================

def brute_p09(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, q = toks[0], toks[1]
    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(n - 1):
        u, v, w = toks[idx], toks[idx + 1], toks[idx + 2]
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    parent = [0] * (n + 1)
    pw = [0] * (n + 1)
    depth = [0] * (n + 1)
    dq = deque([1])
    vis = [False] * (n + 1)
    vis[1] = True
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if not vis[v]:
                vis[v] = True
                parent[v] = u
                pw[v] = w
                depth[v] = depth[u] + 1
                dq.append(v)

    out = []
    for _ in range(q):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        res = 0
        while depth[u] > depth[v]:
            if pw[u] > res:
                res = pw[u]
            u = parent[u]
        while depth[v] > depth[u]:
            if pw[v] > res:
                res = pw[v]
            v = parent[v]
        while u != v:
            if pw[u] > res:
                res = pw[u]
            if pw[v] > res:
                res = pw[v]
            u = parent[u]
            v = parent[v]
        out.append(str(res))
    return "\n".join(out)


def build_p09() -> dict:
    rng = random.Random(1609)

    def add_weights(edges: List[Tuple[int, int]], lo: int = 1, hi: int = 1_000_000_000) -> List[Tuple[int, int, int]]:
        return [(u, v, rng.randint(lo, hi)) for u, v in edges]

    def diff_pairs(n: int, q: int) -> List[Tuple[int, int]]:
        qs = []
        for _ in range(q):
            u = rng.randint(1, n)
            v = rng.randint(1, n - 1)
            if v >= u:
                v += 1
            qs.append((u, v))
        return qs

    tests = [
        # 3 public samples
        {
            "input": fmt_weighted_tree_queries(
                5,
                [(1, 2, 4), (1, 3, 9), (2, 4, 7), (2, 5, 2)],
                [(4, 5), (3, 4), (1, 2)],
            ),
            "hidden": False,
            "expected": "7\n9\n4",
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                4,
                [(1, 2, 100), (2, 3, 50), (3, 4, 1_000_000_000)],
                [(1, 3), (2, 4), (1, 4)],
            ),
            "hidden": False,
            "expected": "100\n1000000000\n1000000000",
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                2,
                [(1, 2, 42)],
                [(1, 2), (2, 1)],
            ),
            "hidden": False,
            "expected": "42\n42",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_weighted_tree_queries(
                20,
                [(i, i + 1, i * 1000) for i in range(1, 20)],
                [(1, 20), (1, 2), (10, 15), (19, 20)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                35,
                add_weights(make_star_tree(35), 1, 1_000_000_000),
                [(1, 35), (2, 35), (10, 20), (3, 19)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                64,
                add_weights(make_binary_tree(64), 5, 5),
                [(32, 63), (1, 64), (17, 45)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                140,
                add_weights(relabel_tree(140, make_random_tree(140, rng), rng)),
                diff_pairs(140, 150),
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_weighted_tree_queries(
                250,
                add_weights(relabel_tree(250, make_caterpillar_tree(250, 100, rng), rng)),
                diff_pairs(250, 250),
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    med_large = [
        (600, 1_000, relabel_tree(600, make_random_tree(600, rng), rng), 1_000_000_000, True),
        (1_200, 2_000, relabel_tree(1_200, make_caterpillar_tree(1_200, 500, rng), rng), 1_000_000_000, True),
        (2_500, 3_500, relabel_tree(2_500, make_path_tree(2_500), rng), 1_000_000_000, False),
        (3_500, 5_000, make_binary_tree(3_500), 1_000_000_000, False),
        (4_500, 4_000, relabel_tree(4_500, make_random_tree(4_500, rng, max_depth_bias=10), rng), 1_000_000_000, False),
        (5_500, 1_800, make_path_tree(5_500), 1_000_000_000, False),
        (6_200, 500, relabel_tree(6_200, make_path_tree(6_200), rng), 1_000_000_000, False),
        (8_000, 2_500, make_star_tree(8_000), 999, False),
    ]
    for n, q, edges, max_w, chk in med_large:
        we = add_weights(edges, 1, max_w)
        qs = diff_pairs(n, q)
        tests.append({"input": fmt_weighted_tree_queries(n, we, qs), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(2, 35)
        q = rng.randint(1, 35)
        we = add_weights(relabel_tree(n, make_random_tree(n, rng), rng))
        qs = diff_pairs(n, q)
        extra_stress.append(fmt_weighted_tree_queries(n, we, qs))

    statement = r"""Cho một cây có trọng số gồm $N$ đỉnh đánh số từ $1$ đến $N$. Mỗi cạnh nối hai đỉnh $u, v$ có trọng số nguyên dương $w$.

Cho $Q$ truy vấn, mỗi truy vấn gồm hai đỉnh phân biệt $(u, v)$ ($u \ne v$). Hãy tìm trọng số của **cạnh lớn nhất** nằm trên đường đi đơn duy nhất giữa $u$ và $v$.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, Q$ ($2 \le N \le 15\,000$, $1 \le Q \le 15\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa ba số nguyên $u, v, w$ ($1 \le u, v \le N$, $1 \le w \le 10^9$) mô tả một cạnh nối $u$ và $v$ có trọng số $w$.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$, $u \ne v$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra trọng số lớn nhất trong số các cạnh trên đường đi từ $u$ đến $v$.

### Ràng buộc
- $2 \le N \le 15\,000$
- $1 \le Q \le 15\,000$
- $1 \le w \le 10^9$

### Subtasks
- **Subtask 1 (35% số test):** $N, Q \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1:
  - Đường đi giữa $4$ và $5$ đi qua hai cạnh $(4, 2)$ trọng số $7$ và $(2, 5)$ trọng số $2 \implies \max = 7$.
  - Đường đi giữa $3$ và $4$ đi qua $(3, 1)$ ($9$), $(1, 2)$ ($4$), $(2, 4)$ ($7$) $\implies \max = 9$."""

    hints = r"""**Gợi ý 1 (Lưu thêm thông tin trên bảng Binary Lifting):**
Ngoài mảng `up[j][u]` (tổ tiên thứ $2^j$ của $u$), ta duy trì thêm mảng `mx[j][u]` là **trọng số cạnh lớn nhất** trên đoạn đường đi từ $u$ lên tới `up[j][u]`.

**Gợi ý 2 (Khởi tạo và chuyển trạng thái):**
- Từ lượt BFS gốc `1`: với mỗi con $v$ của $u$ qua cạnh trọng số $w$, ta gán `up[0][v] = u` và `mx[0][v] = w`.
- Khi xây dựng bảng nhảy $j = 1 \dots 14$:
  - `up[j][u] = up[j - 1][up[j - 1][u]]`
  - `mx[j][u] = max(mx[j - 1][u], mx[j - 1][up[j - 1][u]])`

**Gợi ý 3 (Cập nhật kết quả trong lúc tìm LCA):**
Trong quá trình đưa $u$ và $v$ về cùng độ sâu rồi cùng nhảy lên LCA, mỗi khi nhảy `u = up[j][u]`, nhớ cập nhật `ans = max(ans, mx[j][u])` (tương tự cho $v$). Nếu sau khi cân bằng độ sâu mà $u \ne v$, sau vòng nhảy cuối cùng cần gộp thêm hai cạnh cuối `mx[0][u]` và `mx[0][v]` trước khi trả `ans`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<vector<pair<int, int>>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v, w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    const int LOG = 15;
    vector<vector<int>> up(LOG, vector<int>(n + 1, 0));
    vector<vector<int>> mx(LOG, vector<int>(n + 1, 0));
    vector<int> depth(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);

    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (auto [v, w] : adj[u]) {
            if (v != up[0][u]) {
                up[0][v] = u;
                mx[0][v] = w;
                depth[v] = depth[u] + 1;
                order.push_back(v);
            }
        }
    }

    for (int j = 1; j < LOG; ++j) {
        for (int u = 1; u <= n; ++u) {
            int mid = up[j - 1][u];
            up[j][u] = up[j - 1][mid];
            mx[j][u] = max(mx[j - 1][u], mx[j - 1][mid]);
        }
    }

    auto query_max = [&](int u, int v) -> int {
        int ans = 0;
        if (depth[u] < depth[v]) swap(u, v);
        int diff = depth[u] - depth[v];
        for (int j = 0; j < LOG; ++j) {
            if ((diff >> j) & 1) {
                ans = max(ans, mx[j][u]);
                u = up[j][u];
            }
        }
        if (u == v) return ans;
        for (int j = LOG - 1; j >= 0; --j) {
            if (up[j][u] != up[j][v]) {
                ans = max(ans, max(mx[j][u], mx[j][v]));
                u = up[j][u];
                v = up[j][v];
            }
        }
        return max(ans, max(mx[0][u], mx[0][v]));
    };

    while (q--) {
        int u, v;
        cin >> u >> v;
        cout << query_max(u, v) << '\n';
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    q = int(data[1])

    adj = [[] for _ in range(n + 1)]
    idx = 2
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        w = int(data[idx + 2])
        idx += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    LOG = 15
    up = [[0] * (n + 1) for _ in range(LOG)]
    mx = [[0] * (n + 1) for _ in range(LOG)]
    depth = [0] * (n + 1)
    order = [1]
    head = 0
    up0 = up[0]
    mx0 = mx[0]
    while head < len(order):
        u = order[head]
        head += 1
        p = up0[u]
        du = depth[u] + 1
        for v, w in adj[u]:
            if v != p:
                up0[v] = u
                mx0[v] = w
                depth[v] = du
                order.append(v)

    for j in range(1, LOG):
        prev_u = up[j - 1]
        cur_u = up[j]
        prev_m = mx[j - 1]
        cur_m = mx[j]
        for u in range(1, n + 1):
            mid = prev_u[u]
            cur_u[u] = prev_u[mid]
            a = prev_m[u]
            b = prev_m[mid]
            cur_m[u] = a if a >= b else b

    out = []
    for _ in range(q):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        if depth[u] < depth[v]:
            u, v = v, u
        ans = 0
        diff = depth[u] - depth[v]
        j = 0
        while diff:
            if diff & 1:
                w = mx[j][u]
                if w > ans:
                    ans = w
                u = up[j][u]
            diff >>= 1
            j += 1
        if u != v:
            for j in range(LOG - 1, -1, -1):
                upj = up[j]
                if upj[u] != upj[v]:
                    mxj = mx[j]
                    wu = mxj[u]
                    wv = mxj[v]
                    if wu > ans:
                        ans = wu
                    if wv > ans:
                        ans = wv
                    u = upj[u]
                    v = upj[v]
            wu = mx0[u]
            wv = mx0[v]
            if wu > ans:
                ans = wu
            if wv > ans:
                ans = wv
        out.append(str(ans))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-tree-max-edge-path",
        "title": "Cạnh lớn nhất trên đường đi (Binary Lifting)",
        "shortDescription": "Tìm cạnh có trọng số lớn nhất trên đường đi giữa hai đỉnh trên cây bằng Binary Lifting.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "lca", "binary lifting", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + Q) log N) với Binary Lifting lưu max cạnh.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp16-tree-diff-counting-paths
# ============================================================================

def brute_p10(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n, m = toks[0], toks[1]
    idx = 2
    edges = [(toks[idx + 2 * i], toks[idx + 2 * i + 1]) for i in range(n - 1)]
    idx += 2 * (n - 1)
    _, parent, depth = build_tree_parent_depth(n, edges, 1)

    cnt = [0] * (n + 1)
    for _ in range(m):
        u, v = toks[idx], toks[idx + 1]
        idx += 2
        while depth[u] > depth[v]:
            cnt[u] += 1
            u = parent[u]
        while depth[v] > depth[u]:
            cnt[v] += 1
            v = parent[v]
        while u != v:
            cnt[u] += 1
            cnt[v] += 1
            u = parent[u]
            v = parent[v]
        cnt[u] += 1

    best_c = -1
    best_u = 1
    for u in range(1, n + 1):
        if cnt[u] > best_c:
            best_c = cnt[u]
            best_u = u
    return f"{best_c} {best_u}"


def build_p10() -> dict:
    rng = random.Random(1610)

    tests = [
        # 3 public samples
        {
            "input": fmt_tree_queries(5, [(1, 2), (1, 3), (3, 4), (3, 5)], [(1, 4), (2, 5), (3, 4)]),
            "hidden": False,
            "expected": "3 3",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(4, [(1, 2), (2, 3), (3, 4)], [(1, 4), (2, 3)]),
            "hidden": False,
            "expected": "2 2",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(3, [(1, 2), (1, 3)], [(2, 2), (3, 3)]),
            "hidden": False,
            "expected": "1 2",
            "checkBrute": True,
        },
        # 5 edge cases
        {
            "input": fmt_tree_queries(1, [], [(1, 1), (1, 1), (1, 1)]),
            "hidden": True,
            "expected": "3 1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                8,
                make_star_tree(8),
                [(2, 3), (4, 5), (6, 7), (2, 8), (1, 1)],
            ),
            "hidden": True,
            "expected": "5 1",
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                10,
                make_path_tree(10),
                [(3, 6), (4, 7), (7, 9), (4, 4)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                150,
                relabel_tree(150, make_random_tree(150, rng), rng),
                [(rng.randint(1, 150), rng.randint(1, 150)) for _ in range(180)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_tree_queries(
                300,
                relabel_tree(300, make_binary_tree(300), rng),
                [(rng.randint(1, 300), rng.randint(1, 300)) for _ in range(300)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (< 148 KB)
    med_large = [
        (700, 1_000, relabel_tree(700, make_random_tree(700, rng), rng), True),
        (1_800, 2_000, relabel_tree(1_800, make_caterpillar_tree(1_800, 700, rng), rng), True),
        (4_000, 5_000, relabel_tree(4_000, make_random_tree(4_000, rng, max_depth_bias=10), rng), False),
        (6_000, 6_500, make_binary_tree(6_000), False),
        (7_500, 4_500, relabel_tree(7_500, make_path_tree(7_500), rng), False),
        (9_500, 2_500, relabel_tree(9_500, make_caterpillar_tree(9_500, 3_500, rng), rng), False),
        (10_500, 1_800, make_path_tree(10_500), False),
        (11_500, 1_200, make_star_tree(11_500, center=777), False),
    ]
    for n, m, edges, chk in med_large:
        paths = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        tests.append({"input": fmt_tree_queries(n, edges, paths), "hidden": True, "checkBrute": chk})

    extra_stress = []
    for _ in range(30):
        n = rng.randint(1, 35)
        m = rng.randint(1, 35)
        edges = relabel_tree(n, make_random_tree(n, rng), rng)
        paths = [(rng.randint(1, n), rng.randint(1, n)) for _ in range(m)]
        extra_stress.append(fmt_tree_queries(n, edges, paths))

    statement = r"""Cho một cây gồm $N$ đỉnh đánh số từ $1$ đến $N$ và $M$ đường đi $(u_i, v_i)$.

Mỗi đường đi $(u_i, v_i)$ sẽ cộng thêm `1` vào bộ đếm của **tất cả các đỉnh** nằm trên đường đi đơn giữa $u_i$ và $v_i$ (bao gồm cả hai đầu mút $u_i, v_i$; nếu $u_i = v_i$ thì chỉ cộng `1` vào đỉnh $u_i$).

Sau khi xử lý tất cả $M$ đường đi, hãy tìm số lần được đi qua lớn nhất tại một đỉnh và **chỉ số đỉnh nhỏ nhất** đạt được số lần đó.

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N, M$ ($1 \le N, M \le 15\,000$).
- $N - 1$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u, v$ ($1 \le u, v \le N$) mô tả một cạnh của cây.
- $M$ dòng tiếp theo, mỗi dòng chứa hai số nguyên $u_i, v_i$ ($1 \le u_i, v_i \le N$).

### Kết quả
- In ra một dòng duy nhất gồm hai số nguyên: số lần đi qua lớn nhất và chỉ số đỉnh nhỏ nhất đạt giá trị lớn nhất đó.

### Ràng buộc
- $1 \le N, M \le 15\,000$
- $1 \le u, v, u_i, v_i \le N$

### Subtasks
- **Subtask 1 (35% số test):** $N, M \le 1\,000$.
- **Subtask 2 (65% số test):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với ví dụ 1: 3 đường đi $(1,4), (2,5), (3,4)$ đi qua các đỉnh lần lượt là $\{1,3,4\}$, $\{2,1,3,5\}$, $\{3,4\}$. Số lần qua từng đỉnh là: đỉnh $1$: $2$, đỉnh $2$: $1$, đỉnh $3$: $3$, đỉnh $4$: $2$, đỉnh $5$: $1$. Đỉnh $3$ được đi qua nhiều nhất với $3$ lần.
- Với ví dụ 2: cả hai đỉnh $2$ và $3$ đều có $2$ lần đi qua, ta in chỉ số nhỏ hơn là $2$."""

    hints = r"""**Gợi ý 1 (Ý tưởng mảng hiệu trên cây — Tree Difference Array):**
Chọn đỉnh $1$ làm gốc cây. Ta muốn cộng $1$ cho mọi đỉnh trên đường đi $(u, v)$ bằng cách chỉ sửa đổi $O(1)$ giá trị tại vài đỉnh, rồi cuối cùng cộng dồn từ lá lên gốc.

**Gợi ý 2 (4 phép cập nhật tại $u, v, \text{LCA}, \text{parent}[\text{LCA}]$):**
Gọi $l = \text{LCA}(u, v)$. Khi cộng dồn tổng cây con từ dưới lên trên:
- Đặt `diff[u] += 1` và `diff[v] += 1`: mọi tổ tiên từ $u$ và $v$ lên tới gốc đều nhận được $+1$ (riêng các tổ tiên từ $l$ lên gốc nhận $+2$).
- Ta chỉ muốn $l$ nhận tổng $+1$ và các tổ tiên thực sự của $l$ nhận $0$. Do đó:
  - `diff[l] -= 1` (để tại $l$ còn $2 - 1 = 1$).
  - Nếu `parent[l] != 0`, đặt `diff[parent[l]] -= 1` (để từ `parent[l]` trở lên còn $1 - 1 = 0$).

**Gợi ý 3 (Tổng hợp kết quả):**
Sau khi xử lý tất cả $M$ đường đi bằng LCA (Binary Lifting), duyệt ngược mảng `order` của BFS từ $N-1$ về $1$: `diff[parent[u]] += diff[u]`. Cuối cùng duyệt $u = 1 \dots N$ và chọn đỉnh đầu tiên đạt `max(diff)`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    if (!(cin >> n >> m)) return 0;

    vector<vector<int>> adj(n + 1);
    for (int i = 0; i < n - 1; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    const int LOG = 15;
    vector<vector<int>> up(LOG, vector<int>(n + 1, 0));
    vector<int> depth(n + 1, 0), order;
    order.reserve(n);
    order.push_back(1);

    for (size_t head = 0; head < order.size(); ++head) {
        int u = order[head];
        for (int v : adj[u]) {
            if (v != up[0][u]) {
                up[0][v] = u;
                depth[v] = depth[u] + 1;
                order.push_back(v);
            }
        }
    }

    for (int j = 1; j < LOG; ++j) {
        for (int u = 1; u <= n; ++u) {
            up[j][u] = up[j - 1][up[j - 1][u]];
        }
    }

    auto lca = [&](int u, int v) -> int {
        if (depth[u] < depth[v]) swap(u, v);
        int diff = depth[u] - depth[v];
        for (int j = 0; j < LOG; ++j) {
            if ((diff >> j) & 1) u = up[j][u];
        }
        if (u == v) return u;
        for (int j = LOG - 1; j >= 0; --j) {
            if (up[j][u] != up[j][v]) {
                u = up[j][u];
                v = up[j][v];
            }
        }
        return up[0][u];
    };

    vector<int> diff(n + 1, 0);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        int w = lca(u, v);
        diff[u] += 1;
        diff[v] += 1;
        diff[w] -= 1;
        if (up[0][w] != 0) diff[up[0][w]] -= 1;
    }

    for (int i = n - 1; i >= 1; --i) {
        int u = order[i];
        diff[up[0][u]] += diff[u];
    }

    int best_cnt = -1, best_u = 1;
    for (int u = 1; u <= n; ++u) {
        if (diff[u] > best_cnt) {
            best_cnt = diff[u];
            best_u = u;
        }
    }

    cout << best_cnt << ' ' << best_u << '\n';
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
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    LOG = 15
    up = [[0] * (n + 1) for _ in range(LOG)]
    depth = [0] * (n + 1)
    order = [1]
    head = 0
    up0 = up[0]
    while head < len(order):
        u = order[head]
        head += 1
        p = up0[u]
        du = depth[u] + 1
        for v in adj[u]:
            if v != p:
                up0[v] = u
                depth[v] = du
                order.append(v)

    for j in range(1, LOG):
        prev = up[j - 1]
        cur = up[j]
        for u in range(1, n + 1):
            cur[u] = prev[prev[u]]

    diff = [0] * (n + 1)
    for _ in range(m):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        a, b = u, v
        if depth[a] < depth[b]:
            a, b = b, a
        d = depth[a] - depth[b]
        j = 0
        while d:
            if d & 1:
                a = up[j][a]
            d >>= 1
            j += 1
        if a != b:
            for j in range(LOG - 1, -1, -1):
                upj = up[j]
                if upj[a] != upj[b]:
                    a = upj[a]
                    b = upj[b]
            w = up0[a]
        else:
            w = a
        diff[u] += 1
        diff[v] += 1
        diff[w] -= 1
        pw = up0[w]
        if pw != 0:
            diff[pw] -= 1

    for i in range(n - 1, 0, -1):
        u = order[i]
        diff[up0[u]] += diff[u]

    best_cnt = -1
    best_u = 1
    for u in range(1, n + 1):
        c = diff[u]
        if c > best_cnt:
            best_cnt = c
            best_u = u

    sys.stdout.write(f"{best_cnt} {best_u}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp16-tree-diff-counting-paths",
        "title": "Đếm đường đi qua các đỉnh (Tree Difference Array)",
        "shortDescription": "Đếm số đường đi qua mỗi đỉnh trên cây bằng LCA kết hợp mảng hiệu trên cây (Tree Difference Array).",
        "difficulty": "hard",
        "estimatedTime": 40,
        "skillId": "algo.tree_lca_euler",
        "tags": ["cây", "lca", "mảng hiệu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((N + M) log N) bằng LCA + Tree Difference Array.",
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
        pack_id="16-advanced-trees",
        title="Tầng 4: Thuật toán trên Cây nâng cao (Euler Tour, LCA & Rerooting)",
        tier="Tầng 4 — Cây nâng cao",
        description=(
            "10 bài Thuật toán trên Cây nâng cao chuẩn CSES Tree & USACO Gold: "
            "kích thước cây con, Trọng tâm (Centroid), Binary Lifting tổ tiên thứ K, "
            "LCA, Khoảng cách cây, Euler Tour + BIT, Rerooting DP, "
            "Max cạnh trên đường đi và Tree Difference Array."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
