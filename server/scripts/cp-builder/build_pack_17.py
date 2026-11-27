"""
Builder & automated verifier for CodeClass CP Pack 17:
Tầng 4: Xâu nâng cao (Trie, Binary Trie Max-XOR, Z & Manacher)

Generates and verifies 10 original Vietnamese competitive programming problems
(2 easy, 4 medium, 4 hard), 16 test cases per problem (160 tests total),
dual C++17 + Python 3 solutions, and independent brute-force stress checks
on all 10/10 problems.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pack_lib import build_and_verify_pack

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Xâu nâng cao & Trie\n"
MOD = 1_000_000_007
SAFE_MAX_BYTES = 148_000


def rand_str(rng: random.Random, length: int, alphabet: str = "abcdefghijklmnopqrstuvwxyz") -> str:
    return "".join(rng.choices(alphabet, k=length))


def thue_morse(length: int) -> str:
    res = ["a"]
    while len(res) < length:
        res.extend(["b" if ch == "a" else "a" for ch in res])
    return "".join(res[:length])


def fmt_trie_queries(words: List[str], queries: List[str]) -> str:
    lines = [f"{len(words)} {len(queries)}"]
    lines.extend(words)
    lines.extend(queries)
    return "\n".join(lines)


def fmt_hash_queries(s: str, queries: List[Tuple[int, int, int, int]]) -> str:
    lines = [s, str(len(queries))]
    lines.extend(f"{l1} {r1} {l2} {r2}" for l1, r1, l2, r2 in queries)
    return "\n".join(lines)


def fmt_array(arr: List[int]) -> str:
    return f"{len(arr)}\n" + " ".join(map(str, arr))


def fmt_word_comb(s: str, words: List[str]) -> str:
    lines = [s, str(len(words))]
    lines.extend(words)
    return "\n".join(lines)


# ============================================================================
# 1. cp17-trie-prefix-count
# ============================================================================

def brute_p01(inp: str) -> str:
    toks = inp.split()
    n, q = int(toks[0]), int(toks[1])
    words = toks[2 : 2 + n]
    queries = toks[2 + n : 2 + n + q]
    out = []
    for p in queries:
        out.append(str(sum(1 for w in words if w.startswith(p))))
    return "\n".join(out)


def build_p01() -> dict:
    rng = random.Random(1701)

    tests = [
        # 3 public samples
        {
            "input": fmt_trie_queries(
                ["app", "apple", "app", "apply", "bat", "ball"],
                ["app", "ap", "ba", "cat", "apple", "apples"],
            ),
            "hidden": False,
            "expected": "4\n4\n2\n0\n1\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_trie_queries(
                ["a", "ab", "abc", "b", "bc"],
                ["a", "ab", "abcd", "b", "c"],
            ),
            "hidden": False,
            "expected": "3\n2\n0\n2\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_trie_queries(
                ["code", "code", "code", "code"],
                ["c", "co", "code", "coder", "d"],
            ),
            "hidden": False,
            "expected": "4\n4\n4\n0\n0",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_trie_queries(["a"], ["a", "aa", "b"]),
            "hidden": True,
            "expected": "1\n0\n0",
            "checkBrute": True,
        },
        {
            "input": fmt_trie_queries(
                ["aaaaa", "aaa", "a", "aaaa", "aa"],
                ["a", "aa", "aaa", "aaaa", "aaaaa", "aaaaaa"],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_trie_queries(
                ["zzzz", "zzz", "xyzw", "xy", "mnop"],
                ["z", "zz", "zzzzz", "x", "xyz", "abc"],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_trie_queries(
                ["hello", "world", "hello", "help", "hero"],
                ["he", "hel", "hell", "hello", "wor", "z"],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_trie_queries(
                [rand_str(rng, rng.randint(1, 10), "abc") for _ in range(40)],
                [rand_str(rng, rng.randint(1, 8), "abc") for _ in range(40)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_trie_queries(
            [rand_str(rng, rng.randint(2, 12), "abcd") for _ in range(300)],
            [rand_str(rng, rng.randint(1, 8), "abcd") for _ in range(300)],
        ),
        "hidden": True,
        "checkBrute": True,
    })

    w10 = ["pre" + rand_str(rng, rng.randint(1, 10), "abc") for _ in range(600)]
    q10 = ["pre" + rand_str(rng, rng.randint(0, 6), "abc") for _ in range(600)]
    tests.append({"input": fmt_trie_queries(w10, q10), "hidden": True, "checkBrute": True})

    # Test 11: Deep chain (50,000 chars total, kills recursive Trie)
    tests.append({
        "input": fmt_trie_queries(
            ["a" * 25_000, "a" * 24_999 + "b"],
            ["a" * 25_000, "a" * 24_999, "a" * 24_999 + "b", "a" * 10_000, "b"],
        ),
        "hidden": True,
    })

    # Test 12: Max N=12000, Q=12000 short words (~105 KB)
    w12 = [rand_str(rng, rng.randint(2, 5), "abcde") for _ in range(12_000)]
    q12 = [rand_str(rng, rng.randint(1, 4), "abcde") for _ in range(12_000)]
    tests.append({"input": fmt_trie_queries(w12, q12), "hidden": True})

    # Test 13: Shared long prefix + duplicates
    base_words = ["algo" + rand_str(rng, 6, "abcd") for _ in range(1_250)]
    w13 = base_words * 4  # 5000 words, total 50000 chars
    q13 = [w[: rng.randint(1, 10)] for w in rng.choices(base_words, k=5_000)]
    tests.append({"input": fmt_trie_queries(w13, q13), "hidden": True})

    # Test 14: 10000 identical words
    tests.append({
        "input": fmt_trie_queries(
            ["abcde"] * 10_000,
            ["a", "ab", "abc", "abcd", "abcde", "abcdef", "x"] * 1_400,
        ),
        "hidden": True,
    })

    # Test 15: 6000 words & 6000 queries over 26 letters
    w15 = [rand_str(rng, rng.randint(4, 12)) for _ in range(6_000)]
    q15 = [
        (rng.choice(w15)[: rng.randint(1, 5)] if i % 2 == 0 else rand_str(rng, rng.randint(1, 5)))
        for i in range(6_000)
    ]
    tests.append({"input": fmt_trie_queries(w15, q15), "hidden": True})

    # Test 16: 1000 long words (len 50) & 1000 long queries (len 50)
    w16 = [rand_str(rng, 50, "ab") for _ in range(1_000)]
    q16 = [
        (rng.choice(w16)[: rng.randint(20, 50)] if i % 3 != 0 else rand_str(rng, 50, "ab"))
        for i in range(1_000)
    ]
    tests.append({"input": fmt_trie_queries(w16, q16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(1, 25)
        q = rng.randint(1, 25)
        ws = [rand_str(rng, rng.randint(1, 8), "abc") for _ in range(n)]
        qs = [rand_str(rng, rng.randint(1, 8), "abc") for _ in range(q)]
        extra_stress.append(fmt_trie_queries(ws, qs))

    statement = r"""Một hệ thống tìm kiếm lưu trữ một từ điển gồm $N$ từ (các từ có thể xuất hiện lặp lại nhiều lần trong danh sách) và nhận được $Q$ truy vấn gợi ý tự động.

Mỗi truy vấn cung cấp một xâu tiền tố $P$. Hãy đếm xem trong danh sách $N$ từ đã cho có bao nhiêu từ bắt đầu bằng $P$ (nếu một từ xuất hiện $c$ lần trong từ điển và có tiền tố là $P$, nó được tính cả $c$ lần).

### Dữ liệu vào
- Dòng đầu tiên chứa hai số nguyên $N$ và $Q$ ($1 \le N, Q \le 12\,000$).
- $N$ dòng tiếp theo, mỗi dòng chứa một xâu $W_i$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`).
- $Q$ dòng tiếp theo, mỗi dòng chứa một xâu tiền tố $P_j$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $j$ in ra một số nguyên duy nhất là số từ trong từ điển bắt đầu bằng $P_j$.

### Ràng buộc
- $1 \le N, Q \le 12\,000$
- Tổng độ dài các từ trong từ điển không vượt quá $60\,000$.
- Tổng độ dài các xâu truy vấn không vượt quá $60\,000$.

### Subtasks
- **Subtask 1 (30% số điểm):** $N, Q \le 300$, tổng độ dài các từ và truy vấn không quá $2\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Từ điển gồm `app`, `apple`, `app`, `apply`, `bat`, `ball`. Tiền tố `app` khớp với $4$ từ (`app`, `apple`, `app`, `apply`); `ap` cũng khớp với $4$ từ đó; `ba` khớp với $2$ từ (`bat`, `ball`); `cat` và `apples` không khớp từ nào nên kết quả là `0`.
- **Ví dụ 2:** Các từ bắt đầu bằng `a` là `a`, `ab`, `abc` ($3$ từ); bắt đầu bằng `ab` có $2$ từ; không có từ nào bắt đầu bằng `abcd` hay `c`.
- **Ví dụ 3:** Từ `code` xuất hiện $4$ lần nên các tiền tố `c`, `co`, `code` đều có đáp án là `4`."""

    hints = r"""**Gợi ý 1:**
Nếu với mỗi truy vấn ta duyệt toàn bộ $N$ từ để kiểm tra `startsWith`, tổng chi phí trong trường hợp xấu nhất sẽ tỷ lệ với $N \cdot |P|$ hoặc $Q \cdot \sum |W_i|$, quá chậm với giới hạn $12\,000$. Ta cần gom chung các tiền tố giống nhau vào một cấu trúc cây.

**Gợi ý 2:**
Xây dựng **cây tiền tố (Trie)**. Tại mỗi nút $u$ trên Trie, lưu biến `cnt[u]` cho biết có bao nhiêu từ trong từ điển đi qua nút $u$ (tức có xâu tương ứng với đường đi từ gốc đến $u$ là tiền tố). Khi chèn một từ $W$, đi dọc theo từng ký tự từ gốc và tăng `cnt[u]` thêm $1$ tại mỗi nút bước vào.

**Gợi ý 3:**
Để trả lời truy vấn $P$, chỉ cần đi từ gốc Trie theo từng ký tự của $P$. Nếu tại một ký tự nào đó không có nhánh con tương ứng, in ra `0` ngay; nếu đi hết $P$ tới nút $u$, đáp án chính là `cnt[u]`. Hãy cài đặt bằng vòng lặp (không đệ quy) để tránh tràn ngăn xếp khi có từ dài tới $25\,000$ ký tự."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, q;
    if (!(cin >> n >> q)) return 0;

    vector<array<int, 26>> nxt(1);
    nxt[0].fill(-1);
    vector<int> cnt(1, 0);

    string s;
    for (int i = 0; i < n; ++i) {
        cin >> s;
        int u = 0;
        for (char ch : s) {
            int c = ch - 'a';
            if (nxt[u][c] == -1) {
                nxt[u][c] = (int)nxt.size();
                nxt.emplace_back();
                nxt.back().fill(-1);
                cnt.push_back(0);
            }
            u = nxt[u][c];
            ++cnt[u];
        }
    }

    for (int j = 0; j < q; ++j) {
        cin >> s;
        int u = 0;
        bool ok = true;
        for (char ch : s) {
            int c = ch - 'a';
            if (nxt[u][c] == -1) {
                ok = false;
                break;
            }
            u = nxt[u][c];
        }
        cout << (ok ? cnt[u] : 0) << '\n';
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

    children = [{}]
    cnt = [0]

    idx = 2
    for _ in range(n):
        w = data[idx]
        idx += 1
        u = 0
        for ch in w:
            node = children[u]
            v = node.get(ch)
            if v is None:
                v = len(children)
                node[ch] = v
                children.append({})
                cnt.append(0)
            u = v
            cnt[u] += 1

    out = []
    for _ in range(q):
        p = data[idx]
        idx += 1
        u = 0
        for ch in p:
            v = children[u].get(ch)
            if v is None:
                u = -1
                break
            u = v
        out.append("0" if u == -1 else str(cnt[u]))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-trie-prefix-count",
        "title": "Đếm từ theo tiền tố bằng Trie",
        "shortDescription": "Xây dựng cây tiền tố (Trie) để đếm số từ trong từ điển bắt đầu bằng mỗi xâu truy vấn.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.string_trie_z",
        "tags": ["trie", "xâu", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(∑|W| + ∑|P|) với Trie lặp.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 2. cp17-z-function-stats
# ============================================================================

def brute_p02(inp: str) -> str:
    s = inp.strip()
    n = len(s)
    total = 0
    mx = 0
    for i in range(1, n):
        k = 0
        while i + k < n and s[k] == s[i + k]:
            k += 1
        total += k
        if k > mx:
            mx = k
    return f"{total} {mx}"


def build_p02() -> dict:
    rng = random.Random(1702)

    fib = ["a", "b"]
    while len(fib[-1]) < 25_000:
        fib.append(fib[-1] + fib[-2])
    fib_str = fib[-1][:20_000]

    tests = [
        # 3 public samples
        {"input": "abacaba", "hidden": False, "expected": "5 3", "checkBrute": True},
        {"input": "aaaa", "hidden": False, "expected": "6 3", "checkBrute": True},
        {"input": "abcdef", "hidden": False, "expected": "0 0", "checkBrute": True},
        # 5 corner cases
        {"input": "z", "hidden": True, "expected": "0 0", "checkBrute": True},
        {"input": "aa", "hidden": True, "expected": "1 1", "checkBrute": True},
        {"input": "abababab", "hidden": True, "checkBrute": True},
        {"input": "aabaaab", "hidden": True, "checkBrute": True},
        {"input": thue_morse(64), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests
        {"input": rand_str(rng, 500, "abc"), "hidden": True, "checkBrute": True},
        {"input": ("abcab" * 200)[:-1] + "z", "hidden": True, "checkBrute": True},
        {"input": fib_str, "hidden": True},
        {"input": "a" * 80_000, "hidden": True, "expected": "3199960000 79999"},
        {"input": "abcab" * 16_000, "hidden": True},
        {"input": "a" * 39_999 + "b" + "a" * 40_000, "hidden": True},
        {"input": rand_str(rng, 80_000, "ab"), "hidden": True},
        {"input": rand_str(rng, 80_000), "hidden": True},
    ]

    extra_stress = [rand_str(rng, rng.randint(1, 80), "ab") for _ in range(15)] + [
        rand_str(rng, rng.randint(1, 80), "abcd") for _ in range(15)
    ]

    statement = r"""Cho một xâu ký tự $S$ có độ dài $N$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`), đánh số chỉ số từ $0$ đến $N - 1$.

Theo định nghĩa hàm $Z$ (Z-function):
- $Z[0] = 0$.
- Với mọi $1 \le i < N$, $Z[i]$ là độ dài tiền tố chung dài nhất (LCP) giữa xâu $S$ và hậu tố $S[i..N-1]$.

Hãy tính và in ra trên một dòng hai số nguyên: tổng $\sum_{i=0}^{N-1} Z[i]$ và giá trị lớn nhất $\max_{0 \le i < N} Z[i]$.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ ($1 \le |S| \le 80\,000$).

### Kết quả
- Một dòng duy nhất gồm hai số nguyên cách nhau bởi dấu cách: tổng các giá trị $Z[i]$ và giá trị $Z[i]$ lớn nhất.

### Ràng buộc
- $1 \le |S| \le 80\,000$
- $S$ chỉ gồm các ký tự chữ thường `'a'`–`'z'`.

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 2\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Với $S =$ `abacaba`, mảng $Z = [0, 0, 1, 0, 3, 0, 1]$. Tổng là $0 + 0 + 1 + 0 + 3 + 0 + 1 = 5$, giá trị lớn nhất là $3$.
- **Ví dụ 2:** Với $S =$ `aaaa`, mảng $Z = [0, 3, 2, 1]$, tổng là $6$ và lớn nhất là $3$.
- **Ví dụ 3:** Với $S =$ `abcdef`, mọi $Z[i] = 0$, nên tổng và giá trị lớn nhất đều bằng $0$."""

    hints = r"""**Gợi ý 1:**
Với $|S| \le 80\,000$, cách so sánh từng cặp $S[k]$ và $S[i+k]$ cho mỗi $i$ mất $O(N^2)$ (ví dụ với xâu toàn ký tự `'a'`). Cần tận dụng các kết quả đã so sánh trước đó bằng cửa sổ $[l, r]$.

**Gợi ý 2:**
Duy trì đoạn $[l, r]$ là Z-box có biên phải $r$ lớn nhất đã biết sao cho $S[l..r] = S[0..r-l]$. Khi xét vị trí $i$:
- Nếu $i \le r$, ta có thể khởi tạo nhanh $Z[i] = \min(r - i + 1, Z[i - l])$.
- Sau đó tiếp tục mở rộng $Z[i]$ bằng vòng `while` khi $i + Z[i] < N$ và $S[Z[i]] = S[i + Z[i]]$.
- Nếu $i + Z[i] - 1 > r$, cập nhật $l = i$, $r = i + Z[i] - 1$.

**Gợi ý 3:**
Mỗi lần vòng `while` thành công đều làm tăng $r$, nên tổng số bước so sánh là $O(N)$. Lưu ý: với $S = \text{`'a'`}^{80\,000}$, tổng $\sum Z[i]$ lên tới $\frac{80\,000 \times 79\,999}{2} \approx 3.2 \times 10^9$, vượt quá `int` $32$-bit trong C++, vì vậy phải dùng kiểu `long long`."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;

    int n = (int)s.size();
    vector<int> z(n, 0);
    int l = 0, r = 0;
    long long sumZ = 0;
    int maxZ = 0;

    for (int i = 1; i < n; ++i) {
        if (i <= r) {
            z[i] = min(r - i + 1, z[i - l]);
        }
        while (i + z[i] < n && s[z[i]] == s[i + z[i]]) {
            ++z[i];
        }
        if (i + z[i] - 1 > r) {
            l = i;
            r = i + z[i] - 1;
        }
        sumZ += z[i];
        if (z[i] > maxZ) maxZ = z[i];
    }

    cout << sumZ << ' ' << maxZ << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)
    z = [0] * n
    l = 0
    r = 0
    sum_z = 0
    max_z = 0

    for i in range(1, n):
        zi = 0
        if i <= r:
            rem = r - i + 1
            zi = z[i - l]
            if zi > rem:
                zi = rem
        while i + zi < n and s[zi] == s[i + zi]:
            zi += 1
        z[i] = zi
        if i + zi - 1 > r:
            l = i
            r = i + zi - 1
        sum_z += zi
        if zi > max_z:
            max_z = zi

    sys.stdout.write(f"{sum_z} {max_z}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-z-function-stats",
        "title": "Thống kê hàm Z của xâu",
        "shortDescription": "Tính mảng hàm Z của xâu trong O(N) và in ra tổng cùng giá trị lớn nhất.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.string_trie_z",
        "tags": ["z-function", "xâu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S|), dùng kiểu 64-bit cho tổng.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 3. cp17-rolling-hash-eq-queries
# ============================================================================

def brute_p03(inp: str) -> str:
    toks = inp.split()
    s = toks[0]
    q = int(toks[1])
    out = []
    idx = 2
    for _ in range(q):
        l1 = int(toks[idx]) - 1
        r1 = int(toks[idx + 1])
        l2 = int(toks[idx + 2]) - 1
        r2 = int(toks[idx + 3])
        idx += 4
        out.append("YES" if s[l1:r1] == s[l2:r2] else "NO")
    return "\n".join(out)


def build_p03() -> dict:
    rng = random.Random(1703)

    tests = [
        # 3 public samples
        {
            "input": fmt_hash_queries(
                "abacaba",
                [(1, 3, 5, 7), (1, 4, 4, 7), (2, 3, 6, 7), (1, 1, 7, 7)],
            ),
            "hidden": False,
            "expected": "YES\nNO\nYES\nYES",
            "checkBrute": True,
        },
        {
            "input": fmt_hash_queries(
                "mississippi",
                [(2, 4, 5, 7), (2, 6, 5, 9), (1, 4, 8, 11)],
            ),
            "hidden": False,
            "expected": "YES\nNO\nNO",
            "checkBrute": True,
        },
        {
            "input": fmt_hash_queries(
                "aaaaaa",
                [(1, 3, 4, 6), (1, 2, 1, 3), (3, 5, 2, 4)],
            ),
            "hidden": False,
            "expected": "YES\nNO\nYES",
            "checkBrute": True,
        },
        # 5 corner / anti-hash cases
        {
            "input": fmt_hash_queries("a", [(1, 1, 1, 1)]),
            "hidden": True,
            "expected": "YES",
            "checkBrute": True,
        },
        {
            "input": fmt_hash_queries(
                "abcdefg",
                [(1, 7, 1, 7), (1, 6, 2, 7), (1, 1, 2, 2), (3, 5, 3, 5)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Different lengths + 1-char mismatch at start, mid, end
            "input": fmt_hash_queries(
                "abcdexabcdfxabzde",
                [(1, 5, 7, 11), (1, 4, 7, 10), (1, 5, 13, 17), (1, 3, 7, 10)],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Thue-Morse anti-hash length 256
            "input": fmt_hash_queries(
                thue_morse(256),
                [
                    (1, 64, 193, 256),
                    (1, 128, 129, 256),
                    (33, 96, 161, 224),
                    (1, 32, 97, 128),
                ],
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_hash_queries(
                rand_str(rng, 120, "ab"),
                [(1, 10, 11, 20)] + [
                    (
                        l1 := rng.randint(1, 100),
                        l1 + (ln := rng.randint(0, 19)),
                        l2 := rng.randint(1, 100),
                        l2 + ln,
                    )
                    for _ in range(39)
                ],
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    s9 = rand_str(rng, 500, "abc")
    q9 = []
    for i in range(300):
        ln = rng.randint(1, 80)
        l1 = rng.randint(1, 500 - ln + 1)
        l2 = rng.randint(1, 500 - ln + 1)
        q9.append((l1, l1 + ln - 1, l2, l2 + ln - 1))
    tests.append({"input": fmt_hash_queries(s9, q9), "hidden": True, "checkBrute": True})

    # Test 10: Repeated blocks + small mutations
    s10 = ("abcde" * 200)
    s10 = s10[:500] + "z" + s10[501:]
    q10 = [
        (1, 400, 11, 410),
        (1, 500, 502, 1001 - 1),
        (2, 499, 502, 999),
        (51, 250, 601, 800),
    ]
    for _ in range(196):
        ln = rng.randint(5, 200)
        l1 = rng.randint(1, len(s10) - ln + 1)
        l2 = rng.randint(1, len(s10) - ln + 1)
        q10.append((l1, l1 + ln - 1, l2, l2 + ln - 1))
    tests.append({"input": fmt_hash_queries(s10, q10), "hidden": True, "checkBrute": True})

    # Test 11: Max Q=15000 on short string |S|=9 (1-digit indices -> ~120 KB)
    s11 = "abacabaab"
    q11 = []
    for _ in range(15_000):
        l1 = rng.randint(1, 9)
        r1 = rng.randint(l1, 9)
        if rng.random() < 0.7:
            ln = r1 - l1
            l2 = rng.randint(1, 9 - ln)
            r2 = l2 + ln
        else:
            l2 = rng.randint(1, 9)
            r2 = rng.randint(l2, 9)
        q11.append((l1, r1, l2, r2))
    tests.append({"input": fmt_hash_queries(s11, q11), "hidden": True})

    # Test 12: Max |S|=40000 with Q=4500 queries (~140 KB)
    s12 = rand_str(rng, 40_000, "ab")
    q12 = []
    for i in range(4_500):
        if i % 3 == 0:
            ln = rng.randint(10, 5_000)
            l1 = rng.randint(1, 40_000 - ln + 1)
            q12.append((l1, l1 + ln - 1, l1, l1 + ln - 1))
        else:
            ln = rng.randint(1, 3_000)
            l1 = rng.randint(1, 40_000 - ln + 1)
            l2 = rng.randint(1, 40_000 - ln + 1)
            q12.append((l1, l1 + ln - 1, l2, l2 + ln - 1))
    tests.append({"input": fmt_hash_queries(s12, q12), "hidden": True})

    # Test 13: Thue-Morse length 32768 (anti-hash)
    s13 = thue_morse(32_768)
    q13 = [
        (1, 16384, 16385, 32768),
        (1, 8192, 24577, 32768),
        (4097, 8192, 16385, 20480),
        (1, 1024, 3073, 4096),
    ]
    for _ in range(4_000):
        pw = 1 << rng.randint(3, 12)
        l1 = rng.randint(1, 32_768 - pw + 1)
        l2 = rng.randint(1, 32_768 - pw + 1)
        q13.append((l1, l1 + pw - 1, l2, l2 + pw - 1))
    tests.append({"input": fmt_hash_queries(s13, q13), "hidden": True})

    # Test 14: Periodic string len 40000, single-char mismatches
    s14_list = list("abcde" * 8_000)
    s14_list[19_999] = "z"
    s14_list[39_999] = "y"
    s14 = "".join(s14_list)
    q14 = [
        (1, 19995, 20001, 39995),
        (1, 20000, 20001, 40000),
        (1, 19999, 20001, 39999),
    ]
    for _ in range(4_200):
        ln = rng.randint(50, 15_000)
        l1 = rng.randint(1, 40_000 - ln + 1)
        l2 = rng.randint(1, 40_000 - ln + 1)
        q14.append((l1, l1 + ln - 1, l2, l2 + ln - 1))
    tests.append({"input": fmt_hash_queries(s14, q14), "hidden": True})

    # Test 15: Copied substrings (guaranteed equal long matches) on |S|=40000
    chunk = rand_str(rng, 10_000)
    s15 = chunk + rand_str(rng, 5_000) + chunk + rand_str(rng, 5_000) + chunk
    q15 = []
    for i in range(4_000):
        ln = rng.randint(100, 9_500)
        off = rng.randint(0, 10_000 - ln)
        if i % 2 == 0:
            q15.append((1 + off, 1 + off + ln - 1, 15_001 + off, 15_001 + off + ln - 1))
        else:
            q15.append((1 + off, 1 + off + ln - 1, 30_001 + off, 30_001 + off + ln - 1))
    tests.append({"input": fmt_hash_queries(s15, q15), "hidden": True})

    # Test 16: All 'a' len 40000 with 1 'b' in middle
    s16 = "a" * 20_000 + "b" + "a" * 19_999
    q16 = []
    for i in range(4_000):
        ln = rng.randint(1, 19_000)
        l1 = rng.randint(1, 40_000 - ln + 1)
        l2 = rng.randint(1, 40_000 - ln + 1)
        if i % 5 == 0:
            l2 = min(40_000 - ln + 1, max(1, 20_001 - ln // 2))
        q16.append((l1, l1 + ln - 1, l2, l2 + ln - 1))
    tests.append({"input": fmt_hash_queries(s16, q16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        n = rng.randint(2, 40)
        s = rand_str(rng, n, "ab")
        qs = []
        for _ in range(20):
            l1 = rng.randint(1, n)
            r1 = rng.randint(l1, n)
            l2 = rng.randint(1, n)
            r2 = rng.randint(l2, n)
            qs.append((l1, r1, l2, r2))
        extra_stress.append(fmt_hash_queries(s, qs))

    statement = r"""Cho một xâu $S$ độ dài $N$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`, đánh số từ $1$ đến $N$) và $Q$ truy vấn.

Mỗi truy vấn gồm bốn số nguyên $l_1, r_1, l_2, r_2$ ($1 \le l_1 \le r_1 \le N$, $1 \le l_2 \le r_2 \le N$). Hãy kiểm tra xem hai đoạn con $S[l_1..r_1]$ và $S[l_2..r_2]$ có giống hệt nhau hay không.

### Dữ liệu vào
- Dòng đầu tiên chứa xâu $S$ ($1 \le |S| \le 40\,000$).
- Dòng thứ hai chứa số nguyên $Q$ ($1 \le Q \le 15\,000$).
- $Q$ dòng tiếp theo, mỗi dòng chứa bốn số nguyên $l_1, r_1, l_2, r_2$.

### Kết quả
- Gồm $Q$ dòng, in ra `YES` nếu $S[l_1..r_1] = S[l_2..r_2]$, ngược lại in ra `NO`.

### Ràng buộc
- $1 \le |S| \le 40\,000$
- $1 \le Q \le 15\,000$
- $1 \le l_1 \le r_1 \le |S|$, $1 \le l_2 \le r_2 \le |S|$

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 1\,000$, $Q \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** $S =$ `abacaba`. Đoạn $[1..3]$ là `aba` bằng đoạn $[5..7]$ (`aba`); $[1..4]$ (`abac`) khác $[4..7]$ (`caba`); $[2..3]$ (`ba`) bằng $[6..7]$ (`ba`); $[1..1]$ (`a`) bằng $[7..7]$ (`a`).
- **Ví dụ 2:** Với $S =$ `mississippi`, đoạn $[2..4]$ và $[5..7]$ đều là `iss` (`YES`), nhưng $[2..6]$ (`issis`) khác $[5..9]$ (`issip`) và $[1..4]$ (`miss`) khác $[8..11]$ (`ippi`) nên đều in `NO`.
- **Ví dụ 3:** Với $S =$ `aaaaaa`, hai đoạn có độ dài khác nhau ($[1..2]$ và $[1..3]$) chắc chắn khác nhau (`NO`)."""

    hints = r"""**Gợi ý 1:**
Nếu dùng so sánh trực tiếp từng ký tự cho mỗi truy vấn, độ phức tạp sẽ là $O(Q \cdot |S|)$, vượt quá thời gian cho phép. Ta cần biểu diễn mỗi đoạn con bằng một mã băm số nguyên để so sánh trong $O(1)$.

**Gợi ý 2:**
Sử dụng **Rolling Hash (Polynomial Hash)** với cơ số $B$ (ví dụ $311$) và modulo nguyên tố lớn $M$:
$$H[i] = (H[i-1] \cdot B + (S[i] - \text{`'a'`}) + 1) \bmod M$$
Khi đó mã băm của đoạn $S[l..r]$ ($1$-indexed) là:
$$\text{getHash}(l, r) = (H[r] - H[l - 1] \cdot B^{r - l + 1}) \bmod M$$

**Gợi ý 3:**
Một modulo duy nhất có thể bị xung đột (Birthday Paradox hoặc bộ test chống hash kiểu Thue-Morse). Hãy dùng **Double Rolling Hash** với hai cặp $(B_1, M_1) = (311, 10^9 + 7)$ và $(B_2, M_2) = (313, 10^9 + 9)$. Đồng thời kiểm tra nhanh $r_1 - l_1 \ne r_2 - l_2$ để trả về `NO` ngay lập tức."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    int q;
    if (!(cin >> s >> q)) return 0;

    int n = (int)s.size();
    const long long M1 = 1000000007LL;
    const long long M2 = 1000000009LL;
    const long long B1 = 311LL;
    const long long B2 = 313LL;

    vector<long long> pw1(n + 1, 1), pw2(n + 1, 1);
    vector<long long> h1(n + 1, 0), h2(n + 1, 0);

    for (int i = 0; i < n; ++i) {
        long long v = (s[i] - 'a') + 1;
        pw1[i + 1] = (pw1[i] * B1) % M1;
        pw2[i + 1] = (pw2[i] * B2) % M2;
        h1[i + 1] = (h1[i] * B1 + v) % M1;
        h2[i + 1] = (h2[i] * B2 + v) % M2;
    }

    auto getHash = [&](int l, int r) -> pair<long long, long long> {
        int len = r - l + 1;
        long long x1 = (h1[r] - h1[l - 1] * pw1[len]) % M1;
        if (x1 < 0) x1 += M1;
        long long x2 = (h2[r] - h2[l - 1] * pw2[len]) % M2;
        if (x2 < 0) x2 += M2;
        return {x1, x2};
    };

    while (q--) {
        int l1, r1, l2, r2;
        cin >> l1 >> r1 >> l2 >> r2;
        if (r1 - l1 != r2 - l2) {
            cout << "NO\n";
        } else if (getHash(l1, r1) == getHash(l2, r2)) {
            cout << "YES\n";
        } else {
            cout << "NO\n";
        }
    }
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    q = int(data[1])
    n = len(s)

    M1 = 1_000_000_007
    M2 = 1_000_000_009
    B1 = 311
    B2 = 313

    pw1 = [1] * (n + 1)
    pw2 = [1] * (n + 1)
    h1 = [0] * (n + 1)
    h2 = [0] * (n + 1)

    cur1 = 0
    cur2 = 0
    p1 = 1
    p2 = 1
    for i, ch in enumerate(s, 1):
        v = ord(ch) - 96
        p1 = (p1 * B1) % M1
        p2 = (p2 * B2) % M2
        pw1[i] = p1
        pw2[i] = p2
        cur1 = (cur1 * B1 + v) % M1
        cur2 = (cur2 * B2 + v) % M2
        h1[i] = cur1
        h2[i] = cur2

    out = []
    idx = 2
    for _ in range(q):
        l1 = int(data[idx])
        r1 = int(data[idx + 1])
        l2 = int(data[idx + 2])
        r2 = int(data[idx + 3])
        idx += 4
        if r1 - l1 != r2 - l2:
            out.append("NO")
            continue
        ln = r1 - l1 + 1
        a1 = (h1[r1] - h1[l1 - 1] * pw1[ln]) % M1
        b1 = (h1[r2] - h1[l2 - 1] * pw1[ln]) % M1
        if a1 != b1:
            out.append("NO")
            continue
        a2 = (h2[r1] - h2[l1 - 1] * pw2[ln]) % M2
        b2 = (h2[r2] - h2[l2 - 1] * pw2[ln]) % M2
        out.append("YES" if a2 == b2 else "NO")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-rolling-hash-eq-queries",
        "title": "So sánh đoạn con bằng Double Rolling Hash",
        "shortDescription": "Dùng Double Rolling Hash trả lời O(1) mỗi truy vấn kiểm tra hai đoạn con có bằng nhau không.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.string_trie_z",
        "tags": ["hash", "xâu", "truy vấn", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S| + Q), dùng Double Rolling Hash.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 4. cp17-manacher-palindrome-stats
# ============================================================================

def brute_p04(inp: str) -> str:
    s = inp.strip()
    n = len(s)
    total = 0
    best = 1
    for c in range(n):
        l, r = c, c
        while l >= 0 and r < n and s[l] == s[r]:
            total += 1
            if r - l + 1 > best:
                best = r - l + 1
            l -= 1
            r += 1
        l, r = c, c + 1
        while l >= 0 and r < n and s[l] == s[r]:
            total += 1
            if r - l + 1 > best:
                best = r - l + 1
            l -= 1
            r += 1
    return f"{total} {best}"


def build_p04() -> dict:
    rng = random.Random(1704)

    pal_base = rand_str(rng, 29_999, "abc")
    big_pal = pal_base + "z" + pal_base[::-1]

    tests = [
        # 3 public samples
        {"input": "ababa", "hidden": False, "expected": "9 5", "checkBrute": True},
        {"input": "abba", "hidden": False, "expected": "6 4", "checkBrute": True},
        {"input": "abc", "hidden": False, "expected": "3 1", "checkBrute": True},
        # 5 corner cases
        {"input": "a", "hidden": True, "expected": "1 1", "checkBrute": True},
        {"input": "aa", "hidden": True, "expected": "3 2", "checkBrute": True},
        {"input": "aaaa", "hidden": True, "expected": "10 4", "checkBrute": True},
        {"input": "abacdfgdcaba", "hidden": True, "checkBrute": True},
        {"input": "aabbaa", "hidden": True, "checkBrute": True},
        # 8 medium -> large tests
        {"input": rand_str(rng, 400, "abc"), "hidden": True, "checkBrute": True},
        {"input": ("abccba" * 100), "hidden": True, "checkBrute": True},
        {"input": "a" * 60_000, "hidden": True, "expected": "1800030000 60000"},
        {"input": "ab" * 30_000, "hidden": True},
        {"input": "a" * 29_999 + "bb" + "a" * 29_999, "hidden": True},
        {"input": big_pal, "hidden": True},
        {"input": rand_str(rng, 60_000, "ab"), "hidden": True},
        {"input": rand_str(rng, 60_000), "hidden": True},
    ]

    extra_stress = [rand_str(rng, rng.randint(1, 60), "ab") for _ in range(15)] + [
        rand_str(rng, rng.randint(1, 60), "abcd") for _ in range(15)
    ]

    statement = r"""Một xâu được gọi là **palindrome** (xâu đối xứng) nếu đọc xuôi và đọc ngược đều giống nhau (ví dụ: `a`, `bb`, `ababa`).

Cho một xâu $S$ độ dài $N$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`). Hãy tính:
1. Tổng số xâu con liên tiếp của $S$ là palindrome (hai xâu con nằm ở các vị trí khác nhau được tính là hai lần).
2. Độ dài của xâu con liên tiếp là palindrome dài nhất trong $S$.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ ($1 \le |S| \le 60\,000$).

### Kết quả
- Một dòng duy nhất gồm hai số nguyên cách nhau bởi dấu cách: tổng số xâu con palindrome và độ dài palindrome dài nhất.

### Ràng buộc
- $1 \le |S| \le 60\,000$
- $S$ chỉ gồm các ký tự chữ thường `'a'`–`'z'`.

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 2\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** $S =$ `ababa` có $5$ palindrome độ dài $1$, $3$ palindrome độ dài $3$ (`aba`, `bab`, `aba`) và $1$ palindrome độ dài $5$ (`ababa`), tổng cộng $9$ và độ dài lớn nhất là $5$.
- **Ví dụ 2:** $S =$ `abba` có $4$ palindrome độ dài $1$, `bb` (độ dài $2$) và `abba` (độ dài $4$), tổng cộng $6$ và lớn nhất là $4$.
- **Ví dụ 3:** $S =$ `abc` chỉ có $3$ palindrome độ dài $1$ (`a`, `b`, `c`)."""

    hints = r"""**Gợi ý 1:**
Mỗi xâu con palindrome đều có một tâm đối xứng (hoặc nằm tại một ký tự nếu độ dài lẻ, hoặc nằm giữa hai ký tự liền kề nếu độ dài chẵn). Tuy nhiên, mở rộng từ từng tâm một cách ngây thơ tốn $O(N^2)$ thời gian.

**Gợi ý 2:**
Áp dụng **thuật toán Manacher** để tính trong $O(N)$:
- `d1[i]`: bán kính của palindrome độ dài lẻ dài nhất có tâm tại $i$ (gồm cả tâm, nên độ dài là $2 \cdot d_1[i] - 1$, đóng góp đúng $d_1[i]$ palindrome lẻ tâm $i$).
- `d2[i]`: bán kính của palindrome độ dài chẵn dài nhất có tâm nằm giữa $i - 1$ và $i$ (độ dài là $2 \cdot d_2[i]$, đóng góp đúng $d_2[i]$ palindrome chẵn tại vị trí này).

**Gợi ý 3:**
Tổng số palindrome là $\sum d_1[i] + \sum d_2[i]$ (có thể lên tới $\frac{60\,000 \times 60\,001}{2} \approx 1.8 \times 10^9$, nên dùng `long long` trong C++ để an toàn). Độ dài lớn nhất là $\max(\max(2 d_1[i] - 1), \max(2 d_2[i]))$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;

    int n = (int)s.size();
    vector<int> d1(n, 0), d2(n, 0);

    long long total = 0;
    int bestLen = 1;

    // Odd-length palindromes
    for (int i = 0, l = 0, r = -1; i < n; ++i) {
        int k = (i > r) ? 1 : min(d1[l + r - i], r - i + 1);
        while (i - k >= 0 && i + k < n && s[i - k] == s[i + k]) {
            ++k;
        }
        d1[i] = k;
        total += k;
        bestLen = max(bestLen, 2 * k - 1);
        if (i + k - 1 > r) {
            l = i - k + 1;
            r = i + k - 1;
        }
    }

    // Even-length palindromes
    for (int i = 0, l = 0, r = -1; i < n; ++i) {
        int k = (i > r) ? 0 : min(d2[l + r - i + 1], r - i + 1);
        while (i - k - 1 >= 0 && i + k < n && s[i - k - 1] == s[i + k]) {
            ++k;
        }
        d2[i] = k;
        total += k;
        bestLen = max(bestLen, 2 * k);
        if (i + k - 1 > r) {
            l = i - k;
            r = i + k - 1;
        }
    }

    cout << total << ' ' << bestLen << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)

    d1 = [0] * n
    total = 0
    best_len = 1

    l = 0
    r = -1
    for i in range(n):
        k = 1 if i > r else min(d1[l + r - i], r - i + 1)
        while i - k >= 0 and i + k < n and s[i - k] == s[i + k]:
            k += 1
        d1[i] = k
        total += k
        cur = 2 * k - 1
        if cur > best_len:
            best_len = cur
        if i + k - 1 > r:
            l = i - k + 1
            r = i + k - 1

    d2 = [0] * n
    l = 0
    r = -1
    for i in range(n):
        k = 0 if i > r else min(d2[l + r - i + 1], r - i + 1)
        while i - k - 1 >= 0 and i + k < n and s[i - k - 1] == s[i + k]:
            k += 1
        d2[i] = k
        total += k
        cur = 2 * k
        if cur > best_len:
            best_len = cur
        if i + k - 1 > r:
            l = i - k
            r = i + k - 1

    sys.stdout.write(f"{total} {best_len}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-manacher-palindrome-stats",
        "title": "Đếm xâu con đối xứng bằng Manacher",
        "shortDescription": "Dùng thuật toán Manacher O(N) đếm tổng số xâu con palindrome và tìm độ dài lớn nhất.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.string_trie_z",
        "tags": ["manacher", "xâu", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S|) với thuật toán Manacher.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 5. cp17-binary-trie-max-xor-pair
# ============================================================================

def brute_p05(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    best = 0
    for i in range(n):
        ai = a[i]
        for j in range(i + 1, n):
            v = ai ^ a[j]
            if v > best:
                best = v
    return str(best)


def build_p05() -> dict:
    rng = random.Random(1705)
    MAXV = (1 << 30) - 1

    tests = [
        # 3 public samples
        {
            "input": fmt_array([3, 10, 5, 25, 2, 8]),
            "hidden": False,
            "expected": "28",
            "checkBrute": True,
        },
        {
            "input": fmt_array([14, 70, 53, 83, 49, 91, 36, 80, 92, 51, 66, 70]),
            "hidden": False,
            "expected": "127",
            "checkBrute": True,
        },
        {
            "input": fmt_array([5, 5, 5]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_array([0, 0]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_array([0, MAXV]),
            "hidden": True,
            "expected": str(MAXV),
            "checkBrute": True,
        },
        {
            "input": fmt_array([1 << b for b in range(30)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_array([MAXV, MAXV - 1, MAXV // 2, 123456789]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_array([rng.randint(0, MAXV) for _ in range(35)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (keep < 148 KB)
    tests.append({
        "input": fmt_array([rng.randint(0, 1000) for _ in range(250)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_array([rng.randint(0, MAXV) for _ in range(400)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_array([0] * 14_998 + [1 << 29, (1 << 29) - 1]),
        "hidden": True,
        "expected": str(MAXV),
    })
    tests.append({
        "input": fmt_array([rng.randint(0, (1 << 20) - 1) for _ in range(15_000)]),
        "hidden": True,
    })
    tests.append({
        "input": fmt_array([
            rng.randint(0, MAXV) if i % 3 == 0 else rng.randint(0, 99_999)
            for i in range(15_000)
        ]),
        "hidden": True,
    })
    # Test 14: All share top 15 bits, differ only in low bits
    high = (0b101101011010110) << 15
    tests.append({
        "input": fmt_array([high | rng.randint(0, (1 << 15) - 1) for _ in range(13_000)]),
        "hidden": True,
    })
    # Test 15: Full 30-bit random N=13000 (< 145 KB)
    tests.append({
        "input": fmt_array([rng.randint(0, MAXV) for _ in range(13_000)]),
        "hidden": True,
    })
    # Test 16: N=15000 mix of powers of 2 and randoms (< 145 KB)
    a16 = [(1 << (i % 30)) for i in range(7_500)] + [rng.randint(0, (1 << 24) - 1) for _ in range(7_500)]
    rng.shuffle(a16)
    tests.append({"input": fmt_array(a16), "hidden": True})

    extra_stress = [
        fmt_array([rng.randint(0, MAXV) for _ in range(rng.randint(2, 25))])
        for _ in range(30)
    ]

    statement = r"""Cho một mảng gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

Hãy tìm giá trị lớn nhất của phép toán bitwise XOR $a_i \oplus a_j$ xét trên mọi cặp chỉ số phân biệt $1 \le i < j \le N$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($2 \le N \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ cách nhau bởi dấu cách.

### Kết quả
- Một số nguyên duy nhất là giá trị lớn nhất của $a_i \oplus a_j$ với $1 \le i < j \le N$.

### Ràng buộc
- $2 \le N \le 15\,000$
- $0 \le a_i < 2^{30}$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Chọn cặp $(5, 25)$ cho giá trị $5 \oplus 25 = 28$, đây là giá trị XOR lớn nhất trong mảng.
- **Ví dụ 2:** Cặp $(36, 91)$ cho $36 \oplus 91 = 127$.
- **Ví dụ 3:** Mọi phần tử đều bằng $5$ nên $a_i \oplus a_j = 0$."""

    hints = r"""**Gợi ý 1:**
Để tối đa hóa $a_i \oplus a_j$, ta ưu tiên cho các bit từ cao xuống thấp ($b = 29, 28, \dots, 0$) khác nhau càng nhiều càng tốt: ở mỗi bit $b$, nếu $a_i$ có bit là `bit`, ta luôn muốn tìm một số $a_j$ đã xuất hiện có bit đối là `1 - bit`.

**Gợi ý 2:**
Biểu diễn mỗi số thành một xâu nhị phân độ dài cố định $30$ bit (từ bit $29$ xuống bit $0$) và lưu vào **Binary Trie** (mỗi nút chỉ có tối đa $2$ con: nhánh `0` và nhánh `1`).

**Gợi ý 3:**
Đưa $a_1$ vào Binary Trie trước. Với mỗi $i$ từ $2$ đến $N$:
1. Truy vấn số cho XOR lớn nhất với $a_i$ trong Trie bằng cách đi từ gốc xuống, ưu tiên chọn nhánh `1 - bit`; nếu không có nhánh đối mới đi theo nhánh `bit`.
2. Cập nhật đáp án rồi mới chèn $a_i$ vào Trie (đảm bảo $i \ne j$). Trong Python, hãy dùng hai mảng phẳng `c0`, `c1` lưu chỉ số nút thay vì `dict` để chạy cực nhanh."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<int> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    vector<array<int, 2>> nxt;
    nxt.reserve(n * 30 + 2);
    nxt.push_back({-1, -1});

    auto insertVal = [&](int x) {
        int u = 0;
        for (int b = 29; b >= 0; --b) {
            int bit = (x >> b) & 1;
            if (nxt[u][bit] == -1) {
                nxt[u][bit] = (int)nxt.size();
                nxt.push_back({-1, -1});
            }
            u = nxt[u][bit];
        }
    };

    auto queryMax = [&](int x) -> int {
        int u = 0;
        int res = 0;
        for (int b = 29; b >= 0; --b) {
            int bit = (x >> b) & 1;
            int want = bit ^ 1;
            if (nxt[u][want] != -1) {
                res |= (1 << b);
                u = nxt[u][want];
            } else {
                u = nxt[u][bit];
            }
        }
        return res;
    };

    insertVal(a[0]);
    int ans = 0;
    for (int i = 1; i < n; ++i) {
        ans = max(ans, queryMax(a[i]));
        insertVal(a[i]);
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
    a = [int(x) for x in data[1 : 1 + n]]

    max_nodes = n * 30 + 2
    c0 = [-1] * max_nodes
    c1 = [-1] * max_nodes
    sz = 1

    # Insert a[0]
    u = 0
    x = a[0]
    for b in range(29, -1, -1):
        if (x >> b) & 1:
            v = c1[u]
            if v == -1:
                v = sz
                c1[u] = v
                sz += 1
            u = v
        else:
            v = c0[u]
            if v == -1:
                v = sz
                c0[u] = v
                sz += 1
            u = v

    ans = 0
    for i in range(1, n):
        x = a[i]
        u = 0
        res = 0
        for b in range(29, -1, -1):
            if (x >> b) & 1:
                v = c0[u]
                if v != -1:
                    res |= 1 << b
                    u = v
                else:
                    u = c1[u]
            else:
                v = c1[u]
                if v != -1:
                    res |= 1 << b
                    u = v
                else:
                    u = c0[u]
        if res > ans:
            ans = res

        u = 0
        for b in range(29, -1, -1):
            if (x >> b) & 1:
                v = c1[u]
                if v == -1:
                    v = sz
                    c1[u] = v
                    sz += 1
                u = v
            else:
                v = c0[u]
                if v == -1:
                    v = sz
                    c0[u] = v
                    sz += 1
                u = v

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-binary-trie-max-xor-pair",
        "title": "Cặp phần tử có XOR lớn nhất (Binary Trie)",
        "shortDescription": "Tìm giá trị lớn nhất của a_i XOR a_j (i < j) bằng Binary Trie 30 bit.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.string_trie_z",
        "tags": ["trie", "thao tác bit", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(30 * N) bằng Binary Trie.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 6. cp17-trie-word-combinations
# ============================================================================

def brute_p06(inp: str) -> str:
    toks = inp.split()
    s = toks[0]
    k = int(toks[1])
    words = toks[2 : 2 + k]
    n = len(s)
    dp = [0] * (n + 1)
    dp[n] = 1
    for i in range(n - 1, -1, -1):
        ways = 0
        for w in words:
            if s.startswith(w, i):
                ways += dp[i + len(w)]
        dp[i] = ways % MOD
    return str(dp[0])


def build_p06() -> dict:
    rng = random.Random(1706)

    def unique_words(pool: List[str]) -> List[str]:
        return list(dict.fromkeys(pool))

    tests = [
        # 3 public samples
        {
            "input": fmt_word_comb("ababc", ["ab", "abab", "c", "cb"]),
            "hidden": False,
            "expected": "2",
            "checkBrute": True,
        },
        {
            "input": fmt_word_comb("aaaa", ["a", "aa", "aaa"]),
            "hidden": False,
            "expected": "7",
            "checkBrute": True,
        },
        {
            "input": fmt_word_comb("codeclass", ["code", "clas"]),
            "hidden": False,
            "expected": "0",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_word_comb("a", ["a"]),
            "hidden": True,
            "expected": "1",
            "checkBrute": True,
        },
        {
            "input": fmt_word_comb("a", ["b", "aa"]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_word_comb("ababab", ["ab", "ba", "aba", "bab", "abab"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Words longer than S
            "input": fmt_word_comb("abc", ["a", "bc", "abc", "abcd", "abcde"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_word_comb(
                rand_str(rng, 40, "ab"),
                unique_words([rand_str(rng, rng.randint(1, 6), "ab") for _ in range(30)]),
            ),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests
    tests.append({
        "input": fmt_word_comb(
            rand_str(rng, 250, "abc"),
            unique_words([rand_str(rng, rng.randint(1, 8), "abc") for _ in range(250)]),
        ),
        "hidden": True,
        "checkBrute": True,
    })

    tests.append({
        "input": fmt_word_comb(
            "ab" * 200,
            unique_words(["a", "b", "ab", "ba", "aba", "bab", "abab", "baba", "ababab"]),
        ),
        "hidden": True,
        "checkBrute": True,
    })

    # Test 11: Worst-case 'a' * 2500 with 'a'*1 .. 'a'*340 (total dict len ~58k)
    w11 = ["a" * L for L in range(1, 340)]
    tests.append({"input": fmt_word_comb("a" * 2_500, w11), "hidden": True})

    # Test 12: |S|=2500 built from concatenating dictionary blocks
    dict12 = unique_words([rand_str(rng, rng.randint(4, 15), "abc") for _ in range(3_500)])
    parts12 = []
    cur_len = 0
    while cur_len < 2_500:
        w = rng.choice(dict12)
        if cur_len + len(w) <= 2_500:
            parts12.append(w)
            cur_len += len(w)
        else:
            tail = rand_str(rng, 2_500 - cur_len, "abc")
            if tail not in dict12:
                dict12.append(tail)
            parts12.append(tail)
            cur_len = 2_500
    tests.append({"input": fmt_word_comb("".join(parts12), dict12), "hidden": True})

    # Test 13: K=4000 distinct words of length ~14 (total ~56k), |S|=2500 binary
    w13 = unique_words([rand_str(rng, rng.randint(3, 18), "ab") for _ in range(4_500)])[:4_000]
    w13_set = set(w13)
    for ch in ("a", "b", "aa", "ab", "ba", "bb", "aba", "bab"):
        if ch not in w13_set and len(w13) < 4_000:
            w13.append(ch)
            w13_set.add(ch)
    tests.append({"input": fmt_word_comb(rand_str(rng, 2_500, "ab"), w13), "hidden": True})

    # Test 14: Impossible at the very last character
    s14 = "ab" * 1_249 + "az"
    w14 = unique_words(["a", "b", "ab", "ba", "aba", "bab", "abab"] + [rand_str(rng, 10, "ab") for _ in range(1_000)])
    tests.append({"input": fmt_word_comb(s14, w14), "hidden": True, "expected": "0"})

    # Test 15: Long dictionary words matching long chunks of S
    s15 = rand_str(rng, 2_500, "abcde")
    w15_pool = [s15[i : i + rng.randint(10, 60)] for i in range(0, 2_440, 5)]
    w15_pool.extend(["a", "b", "c", "d", "e"])
    w15_pool.extend(rand_str(rng, 14, "abcde") for _ in range(2_000))
    w15 = unique_words(w15_pool)[:4_000]
    tests.append({"input": fmt_word_comb(s15, w15), "hidden": True})

    # Test 16: 'a'*2500 with 'a'*1..300 plus 'a'*2500 (long single path)
    w16 = ["a" * L for L in range(1, 320)] + ["a" * 2_500]
    tests.append({"input": fmt_word_comb("a" * 2_500, w16), "hidden": True})

    extra_stress = []
    for _ in range(25):
        s = rand_str(rng, rng.randint(1, 25), "ab")
        ws = unique_words([rand_str(rng, rng.randint(1, 6), "ab") for _ in range(rng.randint(1, 20))])
        extra_stress.append(fmt_word_comb(s, ws))

    statement = r"""Cho một xâu mục tiêu $S$ độ dài $N$ và một từ điển gồm $K$ từ **phân biệt** $W_1, W_2, \dots, W_K$ (mỗi từ chỉ gồm chữ cái tiếng Anh thường `a`–`z`).

Hãy đếm số cách tách xâu $S$ thành một dãy liên tiếp các từ thuộc từ điển sao cho khi ghép lại đúng bằng $S$. Mỗi từ trong từ điển có thể được sử dụng nhiều lần. Vì kết quả có thể rất lớn, hãy in ra phần dư khi chia cho $10^9 + 7$.

### Dữ liệu vào
- Dòng đầu tiên chứa xâu $S$ ($1 \le |S| \le 2\,500$).
- Dòng thứ hai chứa số nguyên $K$ ($1 \le K \le 4\,000$).
- $K$ dòng tiếp theo, mỗi dòng chứa một từ $W_i$ (đôi một khác nhau).

### Kết quả
- Một số nguyên duy nhất là số cách ghép xâu $S$ theo modulo $10^9 + 7$.

### Ràng buộc
- $1 \le |S| \le 2\,500$
- $1 \le K \le 4\,000$
- Tổng độ dài các từ trong từ điển không vượt quá $60\,000$.
- Các từ trong từ điển đôi một phân biệt.

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 250$, $K \le 250$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** $S =$ `ababc`, từ điển `{"ab", "abab", "c", "cb"}`. Có $2$ cách tách hợp lệ: `ab + ab + c` và `abab + c`.
- **Ví dụ 2:** $S =$ `aaaa`, từ điển `{"a", "aa", "aaa"}`. Số cách tách là $7$ (tương ứng các tổng thành phần có thứ tự tạo thành $4$ từ $\{1, 2, 3\}$).
- **Ví dụ 3:** $S =$ `codeclass`, không thể tách hoàn toàn thành các từ trong từ điển nên đáp án là `0`."""

    hints = r"""**Gợi ý 1:**
Gọi `dp[i]` là số cách tách hậu tố $S[i..N-1]$ theo modulo $10^9 + 7$, với cơ sở `dp[N] = 1`. Đáp án cần tìm là `dp[0]`.

**Gợi ý 2:**
Để tính `dp[i]`, nếu ta thử so sánh $S[i..]$ với toàn bộ $K$ từ trong từ điển sẽ tốn $O(N \cdot \sum |W_i|)$, quá chậm. Thay vào đó, hãy đưa toàn bộ $K$ từ vào một **cây Trie**, đánh dấu `is_end[u] = true` ở nút kết thúc của mỗi từ.

**Gợi ý 3:**
Với mỗi vị trí $i$ từ $N - 1$ về $0$, bắt đầu đi từ gốc Trie theo các ký tự $S[i], S[i+1], \dots, S[j]$:
- Nếu gặp một nút $u$ có `is_end[u] == true`, cộng thêm `dp[j + 1]` vào `dp[i]` (nhớ lấy modulo $10^9 + 7$).
- Nếu không có nhánh đi tiếp trên Trie thì dừng vòng lặp cho $i$ ngay lập tức.
Độ phức tạp tối đa là $O(|S|^2 + \sum |W_i|)$."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    int k;
    if (!(cin >> s >> k)) return 0;

    vector<array<int, 26>> nxt(1);
    nxt[0].fill(-1);
    vector<char> isEnd(1, 0);

    string w;
    for (int i = 0; i < k; ++i) {
        cin >> w;
        int u = 0;
        for (char ch : w) {
            int c = ch - 'a';
            if (nxt[u][c] == -1) {
                nxt[u][c] = (int)nxt.size();
                nxt.emplace_back();
                nxt.back().fill(-1);
                isEnd.push_back(0);
            }
            u = nxt[u][c];
        }
        isEnd[u] = 1;
    }

    const int MOD = 1000000007;
    int n = (int)s.size();
    vector<int> dp(n + 1, 0);
    dp[n] = 1;

    for (int i = n - 1; i >= 0; --i) {
        int u = 0;
        long long ways = 0;
        for (int j = i; j < n; ++j) {
            int c = s[j] - 'a';
            u = nxt[u][c];
            if (u == -1) break;
            if (isEnd[u]) {
                ways += dp[j + 1];
                if (ways >= MOD) ways -= MOD;
            }
        }
        dp[i] = (int)ways;
    }

    cout << dp[0] << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    k = int(data[1])

    children = [{}]
    is_end = [False]

    idx = 2
    for _ in range(k):
        w = data[idx]
        idx += 1
        u = 0
        for ch in w:
            node = children[u]
            v = node.get(ch)
            if v is None:
                v = len(children)
                node[ch] = v
                children.append({})
                is_end.append(False)
            u = v
        is_end[u] = True

    MOD = 1_000_000_007
    n = len(s)
    dp = [0] * (n + 1)
    dp[n] = 1

    for i in range(n - 1, -1, -1):
        u = 0
        ways = 0
        for j in range(i, n):
            u = children[u].get(s[j], -1)
            if u == -1:
                break
            if is_end[u]:
                ways += dp[j + 1]
        dp[i] = ways % MOD

    sys.stdout.write(f"{dp[0]}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-trie-word-combinations",
        "title": "Ghép xâu từ từ điển (Trie + Quy hoạch động)",
        "shortDescription": "Đếm số cách tách xâu S thành chuỗi các từ trong từ điển theo modulo 10^9 + 7.",
        "difficulty": "medium",
        "estimatedTime": 30,
        "skillId": "algo.string_trie_z",
        "tags": ["trie", "quy hoạch động", "xâu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S|^2 + ∑|W|).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 7. cp17-kmp-all-borders
# ============================================================================

def brute_p07(inp: str) -> str:
    s = inp.strip()
    n = len(s)
    cnt = 0
    total = 0
    for L in range(1, n):
        if s[:L] == s[n - L :]:
            cnt += 1
            total += L
    return f"{cnt} {total}"


def build_p07() -> dict:
    rng = random.Random(1707)

    # Recursive Zimin-like word (many nested borders)
    zimin = "a"
    for ch in "bcdefghijklmno":
        nxt = zimin + ch + zimin
        if len(nxt) > 70_000:
            break
        zimin = nxt

    tests = [
        # 3 public samples
        {"input": "abcababcab", "hidden": False, "expected": "2 7", "checkBrute": True},
        {"input": "aaaa", "hidden": False, "expected": "3 6", "checkBrute": True},
        {"input": "abcdef", "hidden": False, "expected": "0 0", "checkBrute": True},
        # 5 corner cases
        {"input": "a", "hidden": True, "expected": "0 0", "checkBrute": True},
        {"input": "aa", "hidden": True, "expected": "1 1", "checkBrute": True},
        {"input": "aba", "hidden": True, "expected": "1 1", "checkBrute": True},
        {"input": "ababa", "hidden": True, "expected": "2 4", "checkBrute": True},
        {"input": "abababab", "hidden": True, "expected": "3 12", "checkBrute": True},
        # 8 medium -> large tests
        {"input": ("abcab" * 100), "hidden": True, "checkBrute": True},
        {"input": ("aabaa" * 150) + "aab", "hidden": True, "checkBrute": True},
        {"input": "a" * 80_000, "hidden": True, "expected": "79999 3199960000"},
        {"input": zimin, "hidden": True},
        {"input": "abacaba" * 10_000, "hidden": True},
        {"input": "a" * 30_000 + "b" + "a" * 30_000, "hidden": True},
        {"input": rand_str(rng, 80_000, "ab"), "hidden": True},
        {"input": "a" * 39_999 + "b" + "a" * 39_998 + "ba", "hidden": True},
    ]

    extra_stress = [rand_str(rng, rng.randint(1, 60), "ab") for _ in range(15)] + [
        rand_str(rng, rng.randint(1, 60), "abc") for _ in range(15)
    ]

    statement = r"""Một **border** của xâu $S$ là một xâu khác rỗng vừa là tiền tố **thực sự** (độ dài $1 \le L < |S|$) vừa là hậu tố của $S$.

Ví dụ, với $S =$ `abcababcab`, các border của $S$ là `ab` (độ dài $2$) và `abcab` (độ dài $5$).

Cho xâu $S$ độ dài $N$ ($1 \le N \le 80\,000$) chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`). Hãy tìm số lượng border của $S$ và tổng độ dài của tất cả các border đó.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ ($1 \le |S| \le 80\,000$).

### Kết quả
- Một dòng duy nhất gồm hai số nguyên cách nhau bởi dấu cách: số lượng border của $S$ và tổng độ dài của tất cả các border đó. Nếu $S$ không có border nào, in ra `0 0`.

### Ràng buộc
- $1 \le |S| \le 80\,000$
- $S$ chỉ gồm các ký tự chữ thường `'a'`–`'z'`.

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 2\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** $S =$ `abcababcab` có $2$ border là `ab` ($2$) và `abcab` ($5$), tổng độ dài $2 + 5 = 7$.
- **Ví dụ 2:** $S =$ `aaaa` có $3$ border là `a` ($1$), `aa` ($2$), `aaa` ($3$), tổng độ dài $6$.
- **Ví dụ 3:** $S =$ `abcdef` không có tiền tố thực sự nào đồng thời là hậu tố nên kết quả là `0 0`."""

    hints = r"""**Gợi ý 1:**
Theo định nghĩa của hàm tiền tố KMP (Prefix Function), $\pi[N - 1]$ chính là độ dài của **border dài nhất** của xâu $S$.

**Gợi ý 2:**
Mọi border ngắn hơn của $S$ có độ dài nhỏ hơn $k = \pi[N - 1]$ đều là border của tiền tố $S[0..k-1]$! Vì vậy border dài tiếp theo có độ dài là $\pi[k - 1]$, rồi $\pi[\pi[k - 1] - 1]$, cứ thế cho đến khi về $0$.

**Gợi ý 3:**
Tính mảng $\pi$ của KMP trong $O(N)$, sau đó lặp `k = pi[n - 1]; while k > 0: cnt += 1; sum_len += k; k = pi[k - 1]`. Lưu ý với $S = \text{`'a'`}^{80\,000}$, tổng độ dài lên tới $\frac{79\,999 \times 80\,000}{2} \approx 3.2 \times 10^9$, nên cần kiểu `long long` trong C++."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;

    int n = (int)s.size();
    vector<int> pi(n, 0);
    for (int i = 1; i < n; ++i) {
        int j = pi[i - 1];
        while (j > 0 && s[i] != s[j]) {
            j = pi[j - 1];
        }
        if (s[i] == s[j]) ++j;
        pi[i] = j;
    }

    int cnt = 0;
    long long totalLen = 0;
    int k = pi[n - 1];
    while (k > 0) {
        ++cnt;
        totalLen += k;
        k = pi[k - 1];
    }

    cout << cnt << ' ' << totalLen << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)
    pi = [0] * n

    for i in range(1, n):
        j = pi[i - 1]
        ch = s[i]
        while j > 0 and ch != s[j]:
            j = pi[j - 1]
        if ch == s[j]:
            j += 1
        pi[i] = j

    cnt = 0
    total_len = 0
    k = pi[n - 1]
    while k > 0:
        cnt += 1
        total_len += k
        k = pi[k - 1]

    sys.stdout.write(f"{cnt} {total_len}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-kmp-all-borders",
        "title": "Đếm và tính tổng độ dài các Border (KMP)",
        "shortDescription": "Dùng hàm tiền tố KMP đếm số lượng và tính tổng độ dài mọi border thực sự của xâu.",
        "difficulty": "hard",
        "estimatedTime": 25,
        "skillId": "algo.string_trie_z",
        "tags": ["kmp", "xâu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S|) với KMP Prefix Function.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 8. cp17-binary-trie-max-subarray-xor
# ============================================================================

def brute_p08(inp: str) -> str:
    toks = list(map(int, inp.split()))
    n = toks[0]
    a = toks[1 : 1 + n]
    best = 0
    for l in range(n):
        cur = 0
        for r in range(l, n):
            cur ^= a[r]
            if cur > best:
                best = cur
    return str(best)


def build_p08() -> dict:
    rng = random.Random(1708)
    MAXV = (1 << 30) - 1

    tests = [
        # 3 public samples
        {
            "input": fmt_array([8, 1, 2, 12, 7, 6]),
            "hidden": False,
            "expected": "15",
            "checkBrute": True,
        },
        {
            "input": fmt_array([3, 8, 2, 6, 4]),
            "hidden": False,
            "expected": "15",
            "checkBrute": True,
        },
        {
            "input": fmt_array([4, 6]),
            "hidden": False,
            "expected": "6",
            "checkBrute": True,
        },
        # 5 corner cases
        {
            "input": fmt_array([0]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_array([MAXV]),
            "hidden": True,
            "expected": str(MAXV),
            "checkBrute": True,
        },
        {
            "input": fmt_array([0, 0, 0, 0, 0]),
            "hidden": True,
            "expected": "0",
            "checkBrute": True,
        },
        {
            "input": fmt_array([1, 2, 4, 8, 16, 32]),
            "hidden": True,
            "expected": "63",
            "checkBrute": True,
        },
        {
            "input": fmt_array([rng.randint(0, MAXV) for _ in range(30)]),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    # 8 medium -> large tests (all < 148 KB)
    tests.append({
        "input": fmt_array([rng.randint(0, 500) for _ in range(250)]),
        "hidden": True,
        "checkBrute": True,
    })
    tests.append({
        "input": fmt_array([rng.randint(0, MAXV) for _ in range(400)]),
        "hidden": True,
        "checkBrute": True,
    })
    # Test 11: Best subarray is the full array of 15,000 elements
    tests.append({
        "input": fmt_array([1 << (i % 30) for i in range(30)] + [0] * 14_970),
        "hidden": True,
        "expected": str(MAXV),
    })
    # Test 12: Identical large numbers (odd vs even parity)
    tests.append({
        "input": fmt_array([123_456_789] * 14_500),
        "hidden": True,
        "expected": "123456789",
    })
    # Test 13: N=15000 mixed sizes (< 140 KB)
    tests.append({
        "input": fmt_array([
            rng.randint(0, MAXV) if i % 2 == 0 else rng.randint(0, 65_535)
            for i in range(15_000)
        ]),
        "hidden": True,
    })
    # Test 14: Prefix XOR trap (best requires cancelling prefix)
    a14 = [MAXV] + [1 << b for b in range(29)] + [rng.randint(0, (1 << 20) - 1) for _ in range(12_000)]
    tests.append({"input": fmt_array(a14), "hidden": True})
    # Test 15: Full 30-bit random N=13000 (< 145 KB)
    tests.append({
        "input": fmt_array([rng.randint(0, MAXV) for _ in range(13_000)]),
        "hidden": True,
    })
    # Test 16: Random 25-bit N=15000 (< 135 KB)
    tests.append({
        "input": fmt_array([rng.randint(0, (1 << 25) - 1) for _ in range(15_000)]),
        "hidden": True,
    })

    extra_stress = [
        fmt_array([rng.randint(0, MAXV) for _ in range(rng.randint(1, 25))])
        for _ in range(30)
    ]

    statement = r"""Cho một mảng gồm $N$ số nguyên không âm $a_1, a_2, \dots, a_N$ ($0 \le a_i < 2^{30}$).

Hãy tìm giá trị lớn nhất của tổng XOR một đoạn con liên tiếp **không rỗng** $a_l \oplus a_{l+1} \oplus \dots \oplus a_r$ ($1 \le l \le r \le N$).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên $N$ ($1 \le N \le 15\,000$).
- Dòng thứ hai chứa $N$ số nguyên $a_1, a_2, \dots, a_N$ cách nhau bởi dấu cách.

### Kết quả
- Một số nguyên duy nhất là tổng XOR lớn nhất của một đoạn con liên tiếp không rỗng.

### Ràng buộc
- $1 \le N \le 15\,000$
- $0 \le a_i < 2^{30}$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** Đoạn con $[8, 1, 2, 12]$ không phải tối ưu nhất mà đoạn con $[1, 2, 12]$ cho $1 \oplus 2 \oplus 12 = 15$ (hoặc $[7, 6]$ cho $1$); giá trị lớn nhất đạt được là $15$.
- **Ví dụ 2:** Đoạn con $[3, 8, 2, 6]$ có $3 \oplus 8 \oplus 2 \oplus 6 = 15$.
- **Ví dụ 3:** Đoạn con $[4, 6]$ có $4 \oplus 6 = 2$, nhưng đoạn con $[6]$ chỉ gồm $1$ phần tử cho giá trị $6$ lớn hơn."""

    hints = r"""**Gợi ý 1:**
Đặt mảng tiền tố XOR: $P_0 = 0$ và $P_i = a_1 \oplus a_2 \oplus \dots \oplus a_i$. Do tính chất $x \oplus x = 0$, tổng XOR của đoạn $[l..r]$ chính xác bằng $P_r \oplus P_{l - 1}$.

**Gợi ý 2:**
Bài toán quy về: với mỗi $r$ từ $1$ đến $N$, tìm $P_{l-1}$ ($0 \le l - 1 < r$) sao cho $P_r \oplus P_{l-1}$ đạt giá trị lớn nhất. Việc chèn $P_0 = 0$ ngay từ đầu đảm bảo mọi tiền tố $[1..r]$ cũng được xét tới (khi chọn $l - 1 = 0$), đồng thời luôn là đoạn con không rỗng vì $P_r$ được truy vấn **trước khi** chèn vào Trie.

**Gợi ý 3:**
Sử dụng **Binary Trie** trên $30$ bit (từ bit $29$ xuống $0$). Chèn $P_0 = 0$ vào Trie, sau đó duyệt $i = 1..N$: cập nhật `pref ^= a[i]`, truy vấn giá trị XOR lớn nhất giữa `pref` và các giá trị đang có trong Trie, cập nhật đáp án, rồi mới chèn `pref` vào Trie."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<array<int, 2>> nxt;
    nxt.reserve((n + 1) * 30 + 2);
    nxt.push_back({-1, -1});

    auto insertVal = [&](int x) {
        int u = 0;
        for (int b = 29; b >= 0; --b) {
            int bit = (x >> b) & 1;
            if (nxt[u][bit] == -1) {
                nxt[u][bit] = (int)nxt.size();
                nxt.push_back({-1, -1});
            }
            u = nxt[u][bit];
        }
    };

    auto queryMax = [&](int x) -> int {
        int u = 0;
        int res = 0;
        for (int b = 29; b >= 0; --b) {
            int bit = (x >> b) & 1;
            int want = bit ^ 1;
            if (nxt[u][want] != -1) {
                res |= (1 << b);
                u = nxt[u][want];
            } else {
                u = nxt[u][bit];
            }
        }
        return res;
    };

    insertVal(0);
    int pref = 0;
    int ans = 0;
    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;
        pref ^= x;
        ans = max(ans, queryMax(pref));
        insertVal(pref);
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
    a = [int(x) for x in data[1 : 1 + n]]

    max_nodes = (n + 1) * 30 + 2
    c0 = [-1] * max_nodes
    c1 = [-1] * max_nodes
    sz = 1

    # Insert P_0 = 0
    u = 0
    for _ in range(30):
        v = c0[u]
        if v == -1:
            v = sz
            c0[u] = v
            sz += 1
        u = v

    pref = 0
    ans = 0
    for x in a:
        pref ^= x
        u = 0
        res = 0
        for b in range(29, -1, -1):
            if (pref >> b) & 1:
                v = c0[u]
                if v != -1:
                    res |= 1 << b
                    u = v
                else:
                    u = c1[u]
            else:
                v = c1[u]
                if v != -1:
                    res |= 1 << b
                    u = v
                else:
                    u = c0[u]
        if res > ans:
            ans = res

        u = 0
        for b in range(29, -1, -1):
            if (pref >> b) & 1:
                v = c1[u]
                if v == -1:
                    v = sz
                    c1[u] = v
                    sz += 1
                u = v
            else:
                v = c0[u]
                if v == -1:
                    v = sz
                    c0[u] = v
                    sz += 1
                u = v

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-binary-trie-max-subarray-xor",
        "title": "Đoạn con có tổng XOR lớn nhất",
        "shortDescription": "Dùng Prefix XOR kết hợp Binary Trie tìm đoạn con liên tiếp không rỗng có tổng XOR lớn nhất.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.string_trie_z",
        "tags": ["trie", "prefix xor", "thao tác bit", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(30 * N) với Prefix XOR + Binary Trie.",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 9. cp17-longest-common-substring-hash
# ============================================================================

def brute_p09(inp: str) -> str:
    a, b = inp.split()
    n, m = len(a), len(b)
    dp = [0] * (m + 1)
    best = 0
    for i in range(1, n + 1):
        new_dp = [0] * (m + 1)
        ai = a[i - 1]
        for j in range(1, m + 1):
            if ai == b[j - 1]:
                v = dp[j - 1] + 1
                new_dp[j] = v
                if v > best:
                    best = v
        dp = new_dp
    return str(best)


def build_p09() -> dict:
    rng = random.Random(1709)

    tm = thue_morse(16_384)
    common12 = rand_str(rng, 10_000, "abcde")
    a12 = rand_str(rng, 7_500, "fghij") + common12 + rand_str(rng, 7_500, "klmno")
    b12 = rand_str(rng, 8_000, "pqrst") + common12 + rand_str(rng, 7_000, "uvwxy")

    common16 = rand_str(rng, 1_234)
    a16 = rand_str(rng, 12_000) + common16 + rand_str(rng, 11_766)
    b16 = rand_str(rng, 11_000) + common16 + rand_str(rng, 12_766)

    tests = [
        # 3 public samples
        {"input": "ababc\nbabca", "hidden": False, "expected": "4", "checkBrute": True},
        {"input": "abcdef\nghijkl", "hidden": False, "expected": "0", "checkBrute": True},
        {"input": "aaaa\naa", "hidden": False, "expected": "2", "checkBrute": True},
        # 5 corner cases
        {"input": "a\na", "hidden": True, "expected": "1", "checkBrute": True},
        {"input": "a\nb", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "abcdefgh\nijklmnop", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "xyzabc\nabcpqr", "hidden": True, "expected": "3", "checkBrute": True},
        {"input": (s_same := rand_str(rng, 50, "abc")) + "\n" + s_same, "hidden": True, "expected": "50", "checkBrute": True},
        # 8 medium -> large tests
        {"input": rand_str(rng, 150, "ab") + "\n" + rand_str(rng, 150, "ab"), "hidden": True, "checkBrute": True},
        {
            "input": (
                rand_str(rng, 80, "abc")
                + (c10 := rand_str(rng, 45, "def"))
                + rand_str(rng, 75, "abc")
                + "\n"
                + rand_str(rng, 70, "ghi")
                + c10
                + rand_str(rng, 85, "ghi")
            ),
            "hidden": True,
            "checkBrute": True,
        },
        {"input": "a" * 25_000 + "\n" + "a" * 25_000, "hidden": True, "expected": "25000"},
        {"input": a12 + "\n" + b12, "hidden": True, "expected": "10000"},
        {"input": tm + "\n" + tm[:8192] + "z" + tm[8193:], "hidden": True},
        {"input": rand_str(rng, 500, "ab") + "\n" + rand_str(rng, 25_000, "ab"), "hidden": True},
        {"input": rand_str(rng, 25_000, "ab") + "\n" + rand_str(rng, 25_000, "ab"), "hidden": True},
        {"input": a16 + "\n" + b16, "hidden": True},
    ]

    extra_stress = [
        rand_str(rng, rng.randint(1, 35), "ab") + "\n" + rand_str(rng, rng.randint(1, 35), "ab")
        for _ in range(15)
    ] + [
        rand_str(rng, rng.randint(1, 35), "abcd") + "\n" + rand_str(rng, rng.randint(1, 35), "abcd")
        for _ in range(15)
    ]

    statement = r"""Cho hai xâu ký tự $A$ và $B$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`).

Hãy tìm độ dài của **xâu con liên tiếp chung** dài nhất xuất hiện đồng thời trong cả $A$ và $B$. Nếu không có ký tự nào chung, đáp án là $0$.

### Dữ liệu vào
- Dòng thứ nhất chứa xâu $A$ ($1 \le |A| \le 25\,000$).
- Dòng thứ hai chứa xâu $B$ ($1 \le |B| \le 25\,000$).

### Kết quả
- Một số nguyên duy nhất là độ dài xâu con liên tiếp chung dài nhất của $A$ và $B$.

### Ràng buộc
- $1 \le |A|, |B| \le 25\,000$
- $A, B$ chỉ gồm các ký tự chữ thường `'a'`–`'z'`.

### Subtasks
- **Subtask 1 (30% số điểm):** $|A|, |B| \le 1\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** $A =$ `ababc`, $B =$ `babca` có xâu con liên tiếp chung dài nhất là `babc` với độ dài $4$.
- **Ví dụ 2:** Hai xâu hoàn toàn không có ký tự nào chung nên kết quả là `0`.
- **Ví dụ 3:** $A =$ `aaaa`, $B =$ `aa` có xâu con chung dài nhất là `aa` (độ dài $2$)."""

    hints = r"""**Gợi ý 1:**
Nhận thấy tính chất đơn điệu: nếu tồn tại một xâu con chung có độ dài $L$, thì chắc chắn cũng tồn tại xâu con chung có độ dài $L - 1$ (chính là tiền tố độ dài $L - 1$ của nó). Vì vậy ta có thể **tìm kiếm nhị phân** trên đáp án $L \in [0, \min(|A|, |B|)]$.

**Gợi ý 2:**
Để kiểm tra xem có tồn tại xâu con chung độ dài $L$ hay không, hãy tính **Double Rolling Hash** cho tất cả các đoạn con độ dài $L$ của xâu ngắn hơn (ví dụ $A$) và lưu vào bảng băm (`unordered_set` / `set`). Sau đó trượt cửa sổ độ dài $L$ trên xâu còn lại và kiểm tra xem mã băm kép có xuất hiện trong tập đã lưu không.

**Gợi ý 3:**
Nên tiền xử lý mảng prefix hash và lũy thừa của cả hai hệ cơ số $B_1, B_2$ một lần duy nhất trước khi tìm kiếm nhị phân. Có thể ghép cặp `(h1, h2)` thành một số nguyên $64$-bit `(h1 << 32) | h2` để đưa vào `unordered_set<uint64_t>` (trong C++) hoặc `set` (trong Python) nhằm giảm mạnh chi phí bộ nhớ và thời gian."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string a, b;
    if (!(cin >> a >> b)) return 0;
    if (a.size() > b.size()) swap(a, b);

    int n = (int)a.size();
    int m = (int)b.size();

    const long long M1 = 1000000007LL;
    const long long M2 = 1000000009LL;
    const long long B1 = 311LL;
    const long long B2 = 313LL;

    vector<long long> pw1(m + 1, 1), pw2(m + 1, 1);
    for (int i = 1; i <= m; ++i) {
        pw1[i] = (pw1[i - 1] * B1) % M1;
        pw2[i] = (pw2[i - 1] * B2) % M2;
    }

    auto buildHash = [&](const string& s) {
        int len = (int)s.size();
        vector<long long> h1(len + 1, 0), h2(len + 1, 0);
        for (int i = 0; i < len; ++i) {
            long long v = (s[i] - 'a') + 1;
            h1[i + 1] = (h1[i] * B1 + v) % M1;
            h2[i + 1] = (h2[i] * B2 + v) % M2;
        }
        return make_pair(move(h1), move(h2));
    };

    auto [ha1, ha2] = buildHash(a);
    auto [hb1, hb2] = buildHash(b);

    auto getKey = [&](const vector<long long>& h1, const vector<long long>& h2, int l, int len) -> uint64_t {
        long long x1 = (h1[l + len] - h1[l] * pw1[len]) % M1;
        if (x1 < 0) x1 += M1;
        long long x2 = (h2[l + len] - h2[l] * pw2[len]) % M2;
        if (x2 < 0) x2 += M2;
        return (uint64_t(x1) << 32) | uint64_t(x2);
    };

    auto ok = [&](int len) -> bool {
        if (len == 0) return true;
        unordered_set<uint64_t> seen;
        seen.reserve((n - len + 1) * 2);
        for (int i = 0; i + len <= n; ++i) {
            seen.insert(getKey(ha1, ha2, i, len));
        }
        for (int j = 0; j + len <= m; ++j) {
            if (seen.count(getKey(hb1, hb2, j, len))) return true;
        }
        return false;
    };

    int lo = 0, hi = n, ans = 0;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (ok(mid)) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    cout << ans << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if len(data) < 2:
        return
    a, b = data[0], data[1]
    if len(a) > len(b):
        a, b = b, a

    n = len(a)
    m = len(b)

    M1 = 1_000_000_007
    M2 = 1_000_000_009
    B1 = 311
    B2 = 313

    pw1 = [1] * (m + 1)
    pw2 = [1] * (m + 1)
    for i in range(1, m + 1):
        pw1[i] = (pw1[i - 1] * B1) % M1
        pw2[i] = (pw2[i - 1] * B2) % M2

    ha1 = [0] * (n + 1)
    ha2 = [0] * (n + 1)
    c1 = 0
    c2 = 0
    for i, ch in enumerate(a, 1):
        v = ord(ch) - 96
        c1 = (c1 * B1 + v) % M1
        c2 = (c2 * B2 + v) % M2
        ha1[i] = c1
        ha2[i] = c2

    hb1 = [0] * (m + 1)
    hb2 = [0] * (m + 1)
    c1 = 0
    c2 = 0
    for i, ch in enumerate(b, 1):
        v = ord(ch) - 96
        c1 = (c1 * B1 + v) % M1
        c2 = (c2 * B2 + v) % M2
        hb1[i] = c1
        hb2[i] = c2

    def check(L: int) -> bool:
        if L == 0:
            return True
        p1 = pw1[L]
        p2 = pw2[L]
        seen = {
            (((ha1[i + L] - ha1[i] * p1) % M1) << 32)
            | ((ha2[i + L] - ha2[i] * p2) % M2)
            for i in range(n - L + 1)
        }
        for j in range(m - L + 1):
            key = (
                (((hb1[j + L] - hb1[j] * p1) % M1) << 32)
                | ((hb2[j + L] - hb2[j] * p2) % M2)
            )
            if key in seen:
                return True
        return False

    lo, hi = 0, n
    ans = 0
    while lo <= hi:
        mid = (lo + hi) >> 1
        if check(mid):
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-longest-common-substring-hash",
        "title": "Xâu con chung liên tiếp dài nhất (Binary Search + Hash)",
        "shortDescription": "Tìm độ dài xâu con liên tiếp chung dài nhất của hai xâu bằng Binary Search + Double Rolling Hash.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.string_trie_z",
        "tags": ["hash", "tìm kiếm nhị phân", "xâu", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O((|A| + |B|) log min(|A|, |B|)).",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# 10. cp17-minimal-rotation-booth
# ============================================================================

def brute_p10(inp: str) -> str:
    s = inp.strip()
    n = len(s)
    best_k = 0
    best_str = s
    for k in range(1, n):
        rot = s[k:] + s[:k]
        if rot < best_str:
            best_str = rot
            best_k = k
    return str(best_k)


def build_p10() -> dict:
    rng = random.Random(1710)

    # Periodic string where minimal rotation occurs multiple times (must return smallest index)
    period_s = "baab" * 12_500  # len 50,000, minimal rotation "aabb" at k=1 (and 5, 9, ...)
    # Almost-equal blocks differing only at the end
    block_trap = ("aaab" * 5_000) + ("aaac" * 5_000) + "aaaa"

    tests = [
        # 3 public samples
        {"input": "acab", "hidden": False, "expected": "2", "checkBrute": True},
        {"input": "bba", "hidden": False, "expected": "2", "checkBrute": True},
        {"input": "baabaa", "hidden": False, "expected": "1", "checkBrute": True},
        # 5 corner cases
        {"input": "a", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "aaaa", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "abcd", "hidden": True, "expected": "0", "checkBrute": True},
        {"input": "dcba", "hidden": True, "expected": "3", "checkBrute": True},
        {"input": "babab", "hidden": True, "expected": "1", "checkBrute": True},
        # 8 medium -> large tests
        {"input": rand_str(rng, 200, "ab"), "hidden": True, "checkBrute": True},
        {"input": ("cba" * 100) + "a", "hidden": True, "checkBrute": True},
        {"input": "a" * 50_000, "hidden": True, "expected": "0"},
        {"input": period_s, "hidden": True, "expected": "1"},
        {"input": "z" * 49_999 + "a", "hidden": True, "expected": "49999"},
        {"input": block_trap, "hidden": True},
        {"input": rand_str(rng, 50_000, "ab"), "hidden": True},
        {"input": rand_str(rng, 50_000), "hidden": True},
    ]

    extra_stress = [rand_str(rng, rng.randint(1, 50), "ab") for _ in range(15)] + [
        rand_str(rng, rng.randint(1, 50), "abc") for _ in range(15)
    ]

    statement = r"""Cho một xâu ký tự $S$ độ dài $N$ chỉ gồm các chữ cái tiếng Anh thường (`a`–`z`), đánh số chỉ số từ $0$ đến $N - 1$.

Với mỗi $k$ ($0 \le k < N$), phép xoay vòng thứ $k$ của $S$ là xâu:
$$R_k = S[k..N-1] + S[0..k-1]$$

Trong số $N$ phép xoay vòng đó, hãy tìm chỉ số $k$ ($0$-indexed) **nhỏ nhất** tạo ra xâu xoay vòng có thứ tự từ điển nhỏ nhất.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ ($1 \le |S| \le 50\,000$).

### Kết quả
- Một số nguyên duy nhất là chỉ số $k$ ($0 \le k < |S|$) nhỏ nhất đạt thứ tự từ điển nhỏ nhất.

### Ràng buộc
- $1 \le |S| \le 50\,000$
- $S$ chỉ gồm các ký tự chữ thường `'a'`–`'z'`.

### Subtasks
- **Subtask 1 (30% số điểm):** $|S| \le 2\,000$.
- **Subtask 2 (70% số điểm):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- **Ví dụ 1:** $S =$ `acab` có các phép xoay vòng: $R_0 =$ `acab`, $R_1 =$ `caba`, $R_2 =$ `abac`, $R_3 =$ `baca`. Nhỏ nhất là `abac` tại $k = 2$.
- **Ví dụ 2:** $S =$ `bba` có $R_2 =$ `abb` là nhỏ nhất nên đáp án là `2`.
- **Ví dụ 3:** $S =$ `baabaa` có $R_1 = R_4 =$ `aabaab` đều nhỏ nhất theo từ điển; vì cần chỉ số $k$ nhỏ nhất nên đáp án là `1`."""

    hints = r"""**Gợi ý 1:**
Nhân đôi xâu $T = S + S$ độ dài $2N$. Mỗi phép xoay vòng $R_k$ chính là đoạn con $T[k..k + N - 1]$. Với $N \le 50\,000$, nếu so sánh trực tiếp hoặc sắp xếp hậu tố $O(N \log^2 N)$ có thể không đủ nhanh bằng thuật toán tuyến tính $O(N)$.

**Gợi ý 2:**
Có hai thuật toán kinh điển chạy trong $O(N)$:
- **Thuật toán Booth:** Duy trì mảng hàm thất bại kiểu KMP trên $T = S + S$ và cập nhật ứng viên nhỏ nhất `k`.
- **Thuật toán Duval (hai con trỏ):** Duy trì hai ứng viên đang cạnh tranh $i = 0, j = 1$ và độ dài đoạn khớp $k$. So sánh $T[i+k]$ với $T[j+k]$; nếu bằng nhau thì tăng $k$; nếu $T[i+k] > T[j+k]$ thì mọi vị trí trong $[i..i+k]$ đều thua ứng viên bắt đầu từ $j..j+k$, nên ta nhảy thẳng $i \leftarrow i + k + 1$ (nếu trùng $j$ thì tăng thêm $1$), và ngược lại cho $j$.

**Gợi ý 3:**
Trong thuật toán Duval, khi vòng lặp `while i < N and j < N` kết thúc (hoặc khi $k = N$ tức hai vị trí $i, j$ sinh ra xâu xoay vòng giống hệt nhau do $S$ tuần hoàn), mọi chỉ số nhỏ hơn $\min(i, j)$ đều đã bị loại bỏ nghiêm ngặt. Do đó $\min(i, j)$ chính xác là chỉ số $k$ nhỏ nhất cần tìm."""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;

    int n = (int)s.size();
    string ss = s + s;
    int i = 0, j = 1;

    while (i < n && j < n) {
        int k = 0;
        while (k < n && ss[i + k] == ss[j + k]) {
            ++k;
        }
        if (k == n) break;
        if (ss[i + k] > ss[j + k]) {
            i += k + 1;
            if (i == j) ++i;
        } else {
            j += k + 1;
            if (j == i) ++j;
        }
    }

    cout << min(i, j) << '\n';
    return 0;
}"""

    py_sol = r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)
    ss = s + s
    i = 0
    j = 1

    while i < n and j < n:
        k = 0
        while k < n and ss[i + k] == ss[j + k]:
            k += 1
        if k == n:
            break
        if ss[i + k] > ss[j + k]:
            i += k + 1
            if i == j:
                i += 1
        else:
            j += k + 1
            if j == i:
                j += 1

    sys.stdout.write(f"{i if i < j else j}\n")


if __name__ == "__main__":
    solve()"""

    return {
        "slug": "cp17-minimal-rotation-booth",
        "title": "Xoay vòng từ điển nhỏ nhất (Thuật toán Booth)",
        "shortDescription": "Tìm chỉ số bắt đầu nhỏ nhất cho phép xoay vòng nhỏ nhất theo thứ tự từ điển trong O(N).",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.string_trie_z",
        "tags": ["xâu", "tối ưu", "tầng 4"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Độ phức tạp mong đợi: O(|S|) bằng thuật toán Booth / Duval.",
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

    # Enforce strict < 150 KB cap per test
    for p in problems:
        for ti, tc in enumerate(p["tests"], 1):
            b = len(tc["input"].encode("utf-8"))
            if b > SAFE_MAX_BYTES:
                raise ValueError(
                    f"[{p['slug']}] test #{ti} is {b} bytes (> {SAFE_MAX_BYTES})"
                )

    build_and_verify_pack(
        pack_id="17-advanced-strings-trie",
        title="Tầng 4: Xâu nâng cao (Trie, Binary Trie Max-XOR, Z & Manacher)",
        tier="Tầng 4 — Xâu nâng cao",
        description=(
            "10 bài Thuật toán xâu nâng cao chuẩn CSES String & VNOI: Trie đếm tiền tố, "
            "hàm Z, Double Rolling Hash so sánh đoạn con, Manacher O(N), Binary Trie Max-XOR, "
            "Trie + DP ghép từ, KMP Borders, LCS 2 xâu và Booth Minimal Rotation."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
