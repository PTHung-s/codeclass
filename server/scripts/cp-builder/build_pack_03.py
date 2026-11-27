"""
Build & verify CodeClass CP Pack 03: Strings, KMP & Rolling Hash (10 problems).

Run from repository root:
    py -3 server/scripts/cp-builder/build_pack_03.py
"""

from __future__ import annotations

import itertools
import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_lib import build_and_verify_pack  # noqa: E402

REQ_HEADER = (
    "Time: 1s\n"
    "Memory: 256MB\n"
    "Nguồn: CodeClass CP Pack — Xử lý xâu & Hashing\n"
)


def make_thue_morse(n: int) -> str:
    return "".join("a" if (i.bit_count() & 1) == 0 else "b" for i in range(n))


def invert_ab(s: str) -> str:
    return "".join("b" if c == "a" else "a" for c in s)


def make_fibonacci_string(target_len: int) -> str:
    a, b = "a", "ab"
    while len(b) < target_len:
        a, b = b, b + a
    return b[:target_len]


# ============================================================================
# Independent Brute-Force / Exact Oracles (for automated verification)
# ============================================================================

def brute_p1_anagram_min_changes(inp: str) -> str:
    toks = inp.split()
    t = int(toks[0])
    out = []
    idx = 1
    for _ in range(t):
        a, b = toks[idx], toks[idx + 1]
        idx += 2
        rem = list(b)
        changes = 0
        for ch in a:
            if ch in rem:
                rem.remove(ch)
            else:
                changes += 1
        out.append(str(changes))
    return "\n".join(out)


def brute_p2_rle(inp: str) -> str:
    s = inp.split()[0]
    return "".join(f"{ch}{sum(1 for _ in grp)}" for ch, grp in itertools.groupby(s))


def brute_p3_almost_palindrome(inp: str) -> str:
    toks = inp.split()
    t = int(toks[0])
    out = []
    for i in range(1, t + 1):
        s = toks[i]
        if s == s[::-1]:
            out.append("YES")
            continue
        ok = False
        for k in range(len(s)):
            cand = s[:k] + s[k + 1:]
            if cand == cand[::-1]:
                ok = True
                break
        out.append("YES" if ok else "NO")
    return "\n".join(out)


def brute_p4_group_anagrams(inp: str) -> str:
    toks = inp.split()
    n = int(toks[0])
    groups: List[Tuple[Tuple[int, ...], int]] = []
    for w in toks[1:n + 1]:
        sig = tuple(w.count(chr(97 + c)) for c in range(26))
        found = False
        for idx, (gsig, gcnt) in enumerate(groups):
            if gsig == sig:
                groups[idx] = (gsig, gcnt + 1)
                found = True
                break
        if not found:
            groups.append((sig, 1))
    return f"{len(groups)} {max(c for _, c in groups)}"


def brute_p5_subsequence_queries(inp: str) -> str:
    toks = inp.split()
    s = toks[0]
    q = int(toks[1])
    out = []
    for p in toks[2:2 + q]:
        i = 0
        m = len(p)
        for ch in s:
            if i < m and ch == p[i]:
                i += 1
        out.append("YES" if i == m else "NO")
    return "\n".join(out)


def brute_p6_longest_palindrome_build(inp: str) -> str:
    s = inp.split()[0]
    freq: Dict[str, int] = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    chars = sorted(freq.keys())
    best = ""

    def dfs(left: List[str], rem: Dict[str, int]) -> None:
        nonlocal best
        # Even-length palindrome from current left half
        l_str = "".join(left)
        cand_even = l_str + l_str[::-1]
        if len(cand_even) > len(best) or (len(cand_even) == len(best) and cand_even < best):
            best = cand_even
        # Odd-length palindrome with one remaining middle char
        for ch in chars:
            if rem[ch] >= 1:
                cand_odd = l_str + ch + l_str[::-1]
                if len(cand_odd) > len(best) or (len(cand_odd) == len(best) and cand_odd < best):
                    best = cand_odd
                break
        # Extend left half by a pair
        for ch in chars:
            if rem[ch] >= 2:
                rem[ch] -= 2
                left.append(ch)
                dfs(left, rem)
                left.pop()
                rem[ch] += 2

    dfs([], freq)
    return best


def brute_p7_longest_palindromic_substring(inp: str) -> str:
    s = inp.split()[0]
    n = len(s)
    best_len = 1
    best_pos = 1
    for i in range(n):
        for j in range(i + best_len, n + 1):
            sub = s[i:j]
            if sub == sub[::-1]:
                cur_len = j - i
                if cur_len > best_len:
                    best_len = cur_len
                    best_pos = i + 1
    return f"{best_len} {best_pos}"


def brute_p8_kmp_pattern_count(inp: str) -> str:
    toks = inp.split()
    t, p = toks[0], toks[1]
    n, m = len(t), len(p)
    cnt = 0
    first_pos = 0
    last_pos = 0
    for i in range(n - m + 1):
        if t[i:i + m] == p:
            cnt += 1
            if first_pos == 0:
                first_pos = i + 1
            last_pos = i + 1
    return f"{cnt} {first_pos} {last_pos}"


def brute_p9_smallest_period(inp: str) -> str:
    toks = inp.split()
    t = int(toks[0])
    out = []
    for s in toks[1:t + 1]:
        n = len(s)
        best_p = n
        for p in range(1, n + 1):
            if all(s[i] == s[i - p] for i in range(p, n)):
                best_p = p
                break
        best_q = n
        for q in range(1, n + 1):
            if n % q == 0 and s[:q] * (n // q) == s:
                best_q = q
                break
        out.append(f"{best_p} {best_q}")
    return "\n".join(out)


def exact_sa_lrs(s: str) -> int:
    """Exact Suffix Array (prefix doubling) + Kasai LCP oracle (zero hashing)."""
    n = len(s)
    if n <= 1:
        return 0
    sa = list(range(n))
    rank = [ord(c) for c in s]
    tmp = [0] * n
    k = 1
    while k < n:
        sa.sort(key=lambda i: (rank[i], rank[i + k] if i + k < n else -1))
        tmp[sa[0]] = 0
        for idx in range(1, n):
            a, b = sa[idx - 1], sa[idx]
            ra = (rank[a], rank[a + k] if a + k < n else -1)
            rb = (rank[b], rank[b + k] if b + k < n else -1)
            tmp[b] = tmp[a] + (1 if rb != ra else 0)
        rank, tmp = tmp, rank
        if rank[sa[-1]] == n - 1:
            break
        k <<= 1

    inv = [0] * n
    for i, pos in enumerate(sa):
        inv[pos] = i
    lcp = 0
    best = 0
    for i in range(n):
        r = inv[i]
        if r == n - 1:
            lcp = 0
            continue
        j = sa[r + 1]
        while i + lcp < n and j + lcp < n and s[i + lcp] == s[j + lcp]:
            lcp += 1
        if lcp > best:
            best = lcp
        if lcp > 0:
            lcp -= 1
    return best


def brute_p10_lrs(inp: str) -> str:
    s = inp.split()[0]
    n = len(s)
    if n <= 180:
        for length in range(n - 1, 0, -1):
            seen = set()
            for i in range(n - length + 1):
                sub = s[i:i + length]
                if sub in seen:
                    return str(length)
                seen.add(sub)
        return "0"
    return str(exact_sa_lrs(s))


# ============================================================================
# Problem Builders (10 problems, 16 verified tests each)
# ============================================================================

def build_p1() -> dict:
    rng = random.Random(301)

    def rand_str(length: int, alpha: str = "abcdefghijklmnopqrstuvwxyz") -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    def fmt_cases(pairs: List[Tuple[str, str]]) -> str:
        lines = [str(len(pairs))]
        for a, b in pairs:
            lines.append(a)
            lines.append(b)
        return "\n".join(lines)

    def mutate_anagram(s: str, flips: int) -> str:
        arr = list(s)
        rng.shuffle(arr)
        for _ in range(flips):
            pos = rng.randrange(len(arr))
            arr[pos] = rng.choice("abcdefghijklmnopqrstuvwxyz")
        return "".join(arr)

    # Test 15: 100 varying-length pairs with guaranteed sum(|A|+|B|) <= 100000
    t15_pairs = []
    rem_budget = 50000
    for i in range(100):
        max_l = min(900, rem_budget - (99 - i))
        length = rng.randint(1, max(1, max_l))
        rem_budget -= length
        t15_pairs.append((rand_str(length), rand_str(length)))

    tests = [
        # 2 public samples
        {
            "input": fmt_cases([("abc", "cba"), ("abcc", "aabb"), ("xyz", "abc")]),
            "expected": "0\n2\n3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([("listen", "silent"), ("codeclass", "algorithm")]),
            "expected": "0\n6",
            "hidden": False,
            "checkBrute": True,
        },
        # 5 edge/corner cases
        {
            "input": fmt_cases([("a", "a"), ("a", "z"), ("m", "m"), ("k", "p")]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([("a" * 500, "a" * 500), ("a" * 500, "z" * 500), ("z" * 100, "y" * 100)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([
                ("abcdefghijklmnopqrstuvwxyz" * 5, "zyxwvutsrqponmlkjihgfedcba" * 5),
                ("abcdefghijklm" * 10, "nopqrstuvwxyz" * 10),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([
                ("aaabbb", "aaaaab"),
                ("aaaaab", "aaabbb"),
                ("abacaba", "bbccaaa"),
                ("zzzzzz", "zzzzza"),
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([(rand_str(15, "abc"), rand_str(15, "abc")) for _ in range(15)]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests (all strictly < 150KB, sum(|A|+|B|) <= 10^5)
        {
            "input": fmt_cases([(rand_str(50), rand_str(50)) for _ in range(20)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt_cases([(rand_str(200, "abc"), rand_str(200, "abc")) for _ in range(40)]),
            "hidden": True,
        },
        {
            "input": fmt_cases([
                (s := rand_str(300), mutate_anagram(s, rng.randint(0, 15)))
                for _ in range(50)
            ]),
            "hidden": True,
        },
        {
            "input": fmt_cases([(rand_str(5000), rand_str(5000)) for _ in range(10)]),
            "hidden": True,
        },
        {
            "input": fmt_cases([
                (rand_str(250), rand_str(250)) if i % 3 == 0
                else ((s := rand_str(250)), mutate_anagram(s, 0 if i % 3 == 1 else 5))
                for i in range(200)
            ]),
            "hidden": True,
        },
        {
            "input": fmt_cases([
                (s := rand_str(5000), mutate_anagram(s, i))
                for i in range(10)
            ]),
            "hidden": True,
        },
        {
            "input": fmt_cases([
                ("a" * 4000 + "b" * 1000, "b" * 4000 + "a" * 1000),
                ("a" * 5000, "a" * 2500 + "b" * 2500),
                ("c" * 5000, "d" * 5000),
                (rand_str(5000, "ab"), rand_str(5000, "bc")),
                (rand_str(5000, "xyz"), rand_str(5000, "xyz")),
                ("a" * 4999 + "z", "z" + "a" * 4999),
                (rand_str(5000, "abcd"), rand_str(5000, "cdef")),
                ("m" * 5000, "m" * 4999 + "n"),
                (rand_str(5000), rand_str(5000)),
                (s := rand_str(5000), s[::-1]),
            ]),
            "hidden": True,
        },
        {
            "input": fmt_cases(t15_pairs),
            "hidden": True,
        },
        {
            "input": fmt_cases([
                (rand_str(5000, "abcdefghij"), rand_str(5000, "fghijklmno"))
                for _ in range(10)
            ]),
            "hidden": True,
        },
    ]

    stress = []
    for _ in range(25):
        pairs = []
        for _ in range(10):
            length = rng.randint(1, 30)
            pairs.append((rand_str(length, "abcde"), rand_str(length, "abcde")))
        stress.append(fmt_cases(pairs))

    return {
        "slug": "cp03-anagram-min-changes",
        "title": "Biến đổi tối thiểu thành Anagram",
        "shortDescription": "Tìm số phép thay đổi ký tự ít nhất trên xâu A để A trở thành hoán vị (anagram) của xâu B.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.char_frequency",
        "tags": ["xâu", "tần suất", "tầng 1"],
        "statement": r"""Hai xâu $A$ và $B$ có cùng độ dài được gọi là **anagram** (hoán vị ký tự) của nhau nếu ta có thể sắp xếp lại các ký tự của $A$ để thu được đúng xâu $B$.

Cho $T$ bộ test, mỗi bộ test gồm hai xâu $A$ và $B$ chỉ chứa các chữ cái tiếng Anh viết thường (`'a'..'z'`) có cùng độ dài $|A| = |B|$. Trong một thao tác, bạn được chọn một vị trí bất kỳ trong xâu $A$ và đổi ký tự tại vị trí đó thành một chữ cái thường bất kỳ khác.

Hãy tìm **số thao tác ít nhất** cần thực hiện trên $A$ để $A$ trở thành một anagram của $B$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 200$) — số lượng bộ test.
- Tiếp theo là $T$ bộ test, mỗi bộ test gồm hai dòng:
  - Dòng thứ nhất chứa xâu $A$.
  - Dòng thứ hai chứa xâu $B$.

### Dữ liệu ra
- Gồm $T$ dòng, dòng thứ $i$ in ra một số nguyên duy nhất là số thao tác thay đổi ký tự ít nhất của bộ test thứ $i$.

### Ràng buộc
- $1 \le T \le 200$.
- $1 \le |A| = |B| \le 5000$.
- Tổng độ dài tất cả các xâu trong toàn bộ dữ liệu vào không vượt quá $10^5$ ($\sum (|A| + |B|) \le 10^5$).
- Các xâu chỉ gồm ký tự `'a'..'z'`.

### Subtasks
- **Subtask 1 (40%):** $T \le 20, |A| \le 100$.
- **Subtask 2 (60%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
- Với bộ test `("abc", "cba")`: Hai xâu đã có cùng tần suất ký tự nên không cần đổi ký tự nào (đáp án `0`).
- Với bộ test `("abcc", "aabb")`: Xâu $A$ dư 2 ký tự `'c'`, thiếu 1 ký tự `'a'` và 1 ký tự `'b'`. Ta chỉ cần đổi 2 ký tự `'c'` thành `'a'` và `'b'` (đáp án `2`).
- Với bộ test `("xyz", "abc")`: Không có ký tự chung nào nên phải đổi cả 3 ký tự (đáp án `3`).""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(sum(|A| + |B|) + 26T), bộ nhớ O(26).",
        "hints": r"""**Gợi ý 1:** Thứ tự các ký tự trong $A$ và $B$ không quan trọng khi kiểm tra tính chất anagram — điều duy nhất cần quan tâm là số lần xuất hiện của mỗi chữ cái từ `'a'` đến `'z'`.

**Gợi ý 2:** Gọi $\text{cnt}_A[c]$ và $\text{cnt}_B[c]$ là số lần xuất hiện của ký tự $c$ trong $A$ và $B$. Mỗi ký tự $c$ mà $\text{cnt}_A[c] > \text{cnt}_B[c]$ đang bị thừa ra đúng $\text{cnt}_A[c] - \text{cnt}_B[c]$ bản sao trong $A$.

**Gợi ý 3:** Mỗi thao tác thay đổi một ký tự bị thừa trong $A$ thành một ký tự còn thiếu sẽ đồng thời giảm 1 đơn vị dư và giảm 1 đơn vị thiếu. Do đó đáp án chính bằng $\sum_{c='a'}^{'z'} \max(0, \text{cnt}_A[c] - \text{cnt}_B[c])$, tương đương $\frac{1}{2}\sum_{c} |\text{cnt}_A[c] - \text{cnt}_B[c]|$.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        string a, b;
        cin >> a >> b;
        array<int, 26> cntA{}, cntB{};
        for (char c : a) cntA[c - 'a']++;
        for (char c : b) cntB[c - 'a']++;
        long long ans = 0;
        for (int i = 0; i < 26; ++i) {
            if (cntA[i] > cntB[i]) ans += cntA[i] - cntB[i];
        }
        cout << ans << '\n';
    }
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    out = []
    idx = 1
    for _ in range(t):
        a = data[idx]
        b = data[idx + 1]
        idx += 2
        cnt_a = [0] * 26
        cnt_b = [0] * 26
        for ch in a:
            cnt_a[ord(ch) - 97] += 1
        for ch in b:
            cnt_b[ord(ch) - 97] += 1
        ans = 0
        for i in range(26):
            if cnt_a[i] > cnt_b[i]:
                ans += cnt_a[i] - cnt_b[i]
        out.append(str(ans))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p1_anagram_min_changes,
        "extraStressInputs": stress,
    }


def build_p2() -> dict:
    rng = random.Random(302)
    UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    def make_runs(total_len: int, lo: int, hi: int) -> str:
        parts = []
        cur = 0
        prev = ""
        while cur < total_len:
            ch = rng.choice(UPPER)
            while ch == prev:
                ch = rng.choice(UPPER)
            prev = ch
            run = min(total_len - cur, rng.randint(lo, hi))
            parts.append(ch * run)
            cur += run
        return "".join(parts)

    tests = [
        # 3 public samples
        {"input": "AAABBC", "expected": "A3B2C1", "hidden": False, "checkBrute": True},
        {"input": "ABCD", "expected": "A1B1C1D1", "hidden": False, "checkBrute": True},
        {"input": "ZZZZZ", "expected": "Z5", "hidden": False, "checkBrute": True},
        # 5 edge/corner cases
        {"input": "A", "hidden": True, "checkBrute": True},
        {"input": "MM", "hidden": True, "checkBrute": True},
        {"input": "AZ", "hidden": True, "checkBrute": True},
        {"input": "A" * 100000, "hidden": True, "checkBrute": True},
        {"input": "AB" * 35000, "hidden": True, "checkBrute": True},  # 70KB in -> 140KB out (<150KB)
        # 8 medium -> large tests
        {"input": "B" + "A" * 99998 + "C", "hidden": True, "checkBrute": True},
        {"input": "A" * 1 + "B" * 9 + "C" * 10 + "D" * 99 + "E" * 100 + "F" * 999 + "G" * 1000, "hidden": True, "checkBrute": True},
        {"input": UPPER * 50, "hidden": True, "checkBrute": True},
        {"input": make_runs(10000, 1, 20), "hidden": True, "checkBrute": True},
        {"input": make_runs(100000, 2, 15), "hidden": True, "checkBrute": True},
        {"input": "".join(rng.choice(UPPER) for _ in range(70000)), "hidden": True, "checkBrute": True},
        {"input": "".join(UPPER[i % 26] * 100 for i in range(1000)), "hidden": True, "checkBrute": True},
        {
            "input": ("A" * 25000) + make_runs(25000, 1, 3) + ("Z" * 25000) + make_runs(25000, 5, 50),
            "hidden": True,
            "checkBrute": True,
        },
    ]

    stress = [
        "".join(rng.choice("ABCD") for _ in range(rng.randint(1, 200)))
        for _ in range(30)
    ]

    return {
        "slug": "cp03-rle-compress-decode",
        "title": "Nén xâu Run-Length Encoding",
        "shortDescription": "Nén xâu chữ cái in hoa theo thuật toán Run-Length Encoding (RLE) bằng cách ghi ký tự kèm độ dài từng đoạn liên tiếp giống nhau.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "cài đặt", "tầng 1"],
        "statement": r"""**Run-Length Encoding (RLE)** là một kỹ thuật nén dữ liệu không mất mát kinh điển, thường dùng cho dữ liệu có nhiều ký tự lặp lại liên tiếp.

Cho một xâu $S$ có độ dài $N$ chỉ gồm các chữ cái tiếng Anh in hoa (`'A'..'Z'`). Hãy nén xâu $S$ theo quy tắc: chia $S$ thành các đoạn liên tiếp dài nhất gồm các ký tự giống hệt nhau; mỗi đoạn gồm $k$ ký tự $c$ giống nhau được thay thế bằng chính ký tự $c$ viết liền sau bởi biểu diễn thập phân của số nguyên dương $k$ (không có khoảng trắng, kể cả khi $k = 1$).

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ chỉ gồm các ký tự in hoa `'A'..'Z'`.

### Dữ liệu ra
- Một dòng duy nhất là xâu kết quả sau khi nén RLE.

### Ràng buộc
- $1 \le |S| \le 10^5$.

### Subtasks
- **Subtask 1 (40%):** $|S| \le 1000$.
- **Subtask 2 (60%):** $|S| \le 10^5$.

### Giải thích ví dụ
- Với `AAABBC`: Có 3 ký tự `'A'` liên tiếp, 2 ký tự `'B'` liên tiếp và 1 ký tự `'C'` $\rightarrow$ `A3B2C1`.
- Với `ABCD`: Mỗi ký tự đứng thành một đoạn độ dài 1 $\rightarrow$ `A1B1C1D1`.
- Với `ZZZZZ`: Cả xâu gồm một đoạn duy nhất dài 5 ký tự `'Z'` $\rightarrow$ `Z5`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(|S|), lưu ý xử lý đoạn cuối cùng và dùng buffer tránh nối xâu O(|S|^2).",
        "hints": r"""**Gợi ý 1:** Duyệt xâu $S$ từ trái sang phải, dùng một con trỏ $i$ đánh dấu đầu mỗi đoạn ký tự giống nhau.

**Gợi ý 2:** Với mỗi vị trí bắt đầu $i$, tăng con trỏ $j$ chừng nào $j < |S|$ và $S[j] = S[i]$. Khi dừng lại, đoạn hiện tại có ký tự $S[i]$ lặp đúng $j - i$ lần, sau đó cập nhật $i \leftarrow j$.

**Gợi ý 3:** Trong Python, không nên nối chuỗi bằng `res += ...` trong vòng lặp; hãy đưa từng mảnh vào một `list` rồi dùng `"".join(parts)` ở cuối để đạt $O(|S|)$. Trong C++, dùng `res.push_back(...)` và `res += to_string(...)` với `res.reserve(...)`.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    int n = (int)s.size();
    string res;
    res.reserve(n * 2);
    for (int i = 0; i < n; ) {
        int j = i;
        while (j < n && s[j] == s[i]) ++j;
        res.push_back(s[i]);
        res += to_string(j - i);
        i = j;
    }
    cout << res << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)
    parts = []
    i = 0
    while i < n:
        ch = s[i]
        j = i + 1
        while j < n and s[j] == ch:
            j += 1
        parts.append(ch)
        parts.append(str(j - i))
        i = j
    sys.stdout.write("".join(parts) + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p2_rle,
        "extraStressInputs": stress,
    }


def build_p3() -> dict:
    rng = random.Random(303)

    def make_pal(length: int, alpha: str = "abcdefghijklmnopqrstuvwxyz") -> str:
        half = "".join(rng.choice(alpha) for _ in range(length // 2))
        if length % 2 == 1:
            return half + rng.choice(alpha) + half[::-1]
        return half + half[::-1]

    def insert_char(s: str, pos: int, ch: str) -> str:
        return s[:pos] + ch + s[pos:]

    def fmt(arr: List[str]) -> str:
        return "\n".join([str(len(arr))] + arr)

    # Classic 2-branch traps where BOTH s[l+1]==s[r] and s[l]==s[r-1]
    two_branch_left_only = "ab" + "a" + "c" + "ab"   # abacab -> skip left 'a' -> bacab (YES)
    two_branch_right_only = two_branch_left_only[::-1]  # bacaba -> skip right 'a' -> bacab (YES)
    two_branch_neither = "abccab"  # NO

    big_mid = make_pal(49995, "abcde")
    big_trap_left = "ab" + big_mid + "ab"  # wait: check!
    # For skip-left to work: s = 'a' + P where P starts with 'b' and ends with 'b' and P[-2] == 'a'
    # So P = 'ba' + inner_pal + 'ab', then s = 'a' + P = 'aba' + inner_pal + 'ab'
    # Notice s[0]='a', s[1]='b', s[-2]='a', s[-1]='b'!
    # Skip left -> P = 'ba'+inner+'ab' (PAL!). Skip right -> 'aba'+inner+'a' -> inner starts with ? if inner='cd...dc', check!
    inner_pal = make_pal(49990, "cdefg")
    trap_l = "a" + ("ba" + inner_pal + "ab")        # skip left works, skip right fails
    trap_r = trap_l[::-1]                           # skip right works, skip left fails

    tests = [
        # 2 public samples
        {
            "input": fmt(["aba", "abca", "abc", "deeee"]),
            "expected": "YES\nYES\nNO\nYES",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": fmt(["racecar", "racexcar", "abccda"]),
            "expected": "YES\nYES\nNO",
            "hidden": False,
            "checkBrute": True,
        },
        # 5 edge/corner cases
        {
            "input": fmt(["a", "z", "aa", "ab", "ba", "zz"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt(["aaa", "aab", "aba", "baa", "abb", "bba", "abc", "xyz"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                two_branch_left_only,
                two_branch_right_only,
                two_branch_neither,
                "ebcbbececabbacecbbcbe",
                "ab" + "ac" + "ba",
                "a" + "ba" + "cdc" + "ab",
                ("a" + "ba" + "cdc" + "ab")[::-1],
                "cupuufxoohdfpgjdmysgvhmvffcnqxjjxqncffvmhvgsymdjgpfdhooxfuupucu",
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                "a" * 1000,
                "b" + "a" * 999,
                "a" * 999 + "b",
                "a" * 500 + "b" + "a" * 499,
                "b" + "a" * 998 + "c",
                "a" * 498 + "bc" + "a" * 500,
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                insert_char(insert_char(make_pal(40), 5, "x"), 25, "y")
                for _ in range(15)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {
            "input": fmt([
                make_pal(L := rng.randint(10, 80)) if i % 3 == 0
                else (
                    insert_char(make_pal(L), rng.randint(0, L), rng.choice("abcdefghijklmnopqrstuvwxyz"))
                    if i % 3 == 1
                    else insert_char(insert_char(make_pal(L), rng.randint(0, L // 2), "q"), rng.randint(0, L), "w")
                )
                for i in range(40)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                make_pal(L := rng.randint(20, 120), "ab") if i % 3 == 0
                else (
                    insert_char(make_pal(L, "ab"), rng.randint(0, L), rng.choice("ab"))
                    if i % 3 == 1
                    else "".join(rng.choice("ab") for _ in range(L))
                )
                for i in range(50)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                ("a" + "ba" + make_pal(rng.randint(10, 80), "cde") + "ab") if i % 2 == 0
                else ("a" + "ba" + make_pal(rng.randint(10, 80), "cde") + "ab")[::-1]
                for i in range(60)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([make_pal(100000)]),
            "hidden": True,
        },
        {
            "input": fmt([insert_char(make_pal(99999), 50000, "z")]),
            "hidden": True,
        },
        {
            "input": fmt(["x" + make_pal(99998, "abcdefghij") + "y"]),
            "hidden": True,
        },
        {
            "input": fmt([trap_l, trap_r]),
            "hidden": True,
        },
        {
            "input": fmt([
                make_pal(500) if i % 4 == 0
                else (
                    insert_char(make_pal(499), rng.randint(0, 499), rng.choice("abcdefghijklmnopqrstuvwxyz"))
                    if i % 4 in (1, 2)
                    else "a" + make_pal(498, "bcdefg") + "z"
                )
                for i in range(200)
            ]),
            "hidden": True,
        },
        {
            "input": fmt([
                insert_char(make_pal(9999), rng.randint(0, 9999), rng.choice("abcdefghijklmnopqrstuvwxyz"))
                if i % 2 == 0
                else insert_char(insert_char(make_pal(9998, "abcde"), 1234, "x"), 7777, "y")
                for i in range(10)
            ]),
            "hidden": True,
        },
    ]

    stress = [
        fmt(["".join(rng.choice("abc") for _ in range(rng.randint(1, 25))) for _ in range(20)])
        for _ in range(25)
    ]

    return {
        "slug": "cp03-almost-palindrome",
        "title": "Xâu gần đối xứng",
        "shortDescription": "Kiểm tra với mỗi xâu có thể xóa tối đa một ký tự để thu được xâu đối xứng hay không.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "hai con trỏ", "tầng 1"],
        "statement": r"""Một xâu được gọi là **đối xứng (palindrome)** nếu đọc xuôi từ trái sang phải hay đọc ngược từ phải sang trái đều thu được cùng một xâu (ví dụ: `"aba"`, `"abba"`, `"z"`).

Cho $T$ xâu $S$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`). Với mỗi xâu $S$, hãy kiểm tra xem có thể **xóa tối đa $1$ ký tự** khỏi $S$ (tức là giữ nguyên hoặc xóa đúng $1$ ký tự tại một vị trí bất kỳ) để xâu còn lại trở thành xâu đối xứng hay không.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 200$) — số lượng xâu cần kiểm tra.
- $T$ dòng tiếp theo, mỗi dòng chứa một xâu $S$ không rỗng chỉ gồm các ký tự `'a'..'z'`.

### Dữ liệu ra
- Gồm $T$ dòng, dòng thứ $i$ in `YES` nếu xâu thứ $i$ có thể trở thành xâu đối xứng sau khi xóa tối đa $1$ ký tự, ngược lại in `NO`.

### Ràng buộc
- $1 \le T \le 200$.
- Tổng độ dài các xâu $\sum |S| \le 10^5$.

### Subtasks
- **Subtask 1 (40%):** $\sum |S| \le 2000$.
- **Subtask 2 (60%):** $\sum |S| \le 10^5$.

### Giải thích ví dụ
- `"aba"` đã đối xứng sẵn (xóa $0$ ký tự) $\rightarrow$ `YES`.
- `"abca"` xóa `'b'` thành `"aca"` (hoặc xóa `'c'` thành `"aba"`) $\rightarrow$ `YES`.
- `"abc"` dù xóa bất kỳ $1$ ký tự nào cũng thành `"ab"`, `"ac"` hoặc `"bc"`, không đối xứng $\rightarrow$ `NO`.
- `"deeee"` xóa `'d'` thành `"eeee"` $\rightarrow$ `YES`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(sum |S|) bằng kỹ thuật hai con trỏ, tránh thử xóa mọi vị trí O(|S|^2).",
        "hints": r"""**Gợi ý 1:** Dùng hai con trỏ $l = 0$ và $r = |S| - 1$ chạy dần vào giữa chừng nào $S[l] = S[r]$.

**Gợi ý 2:** Nếu hai con trỏ gặp nhau ($l \ge r$), bản thân $S$ đã là xâu đối xứng. Ngược lại, tại cặp lệch đầu tiên $S[l] \ne S[r]$, ta **bắt buộc** phải xóa đúng một trong hai ký tự $S[l]$ hoặc $S[r]$ (xóa ký tự nằm giữa $l$ và $r$ sẽ không làm $S[l]$ khớp $S[r]$).

**Gợi ý 3:** Đừng tham lam chọn chỉ một nhánh khi thấy cả $S[l+1] = S[r]$ lẫn $S[l] = S[r-1]$ (ví dụ `"abacab"`). Hãy kiểm tra **cả hai** xâu con $S[l+1 \dots r]$ và $S[l \dots r-1]$; chỉ cần một trong hai đối xứng thì đáp án là `YES`.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

bool isPalindrome(const string& s, int l, int r) {
    while (l < r) {
        if (s[l] != s[r]) return false;
        ++l;
        --r;
    }
    return true;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        string s;
        cin >> s;
        int l = 0, r = (int)s.size() - 1;
        while (l < r && s[l] == s[r]) {
            ++l;
            --r;
        }
        bool ok = (l >= r) || isPalindrome(s, l + 1, r) || isPalindrome(s, l, r - 1);
        cout << (ok ? "YES\n" : "NO\n");
    }
    return 0;
}""",
        "pythonSolution": r"""import sys


def is_pal(s: str, l: int, r: int) -> bool:
    while l < r:
        if s[l] != s[r]:
            return False
        l += 1
        r -= 1
    return True


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    out = []
    for i in range(1, t + 1):
        s = data[i]
        l, r = 0, len(s) - 1
        while l < r and s[l] == s[r]:
            l += 1
            r -= 1
        ok = (l >= r) or is_pal(s, l + 1, r) or is_pal(s, l, r - 1)
        out.append("YES" if ok else "NO")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p3_almost_palindrome,
        "extraStressInputs": stress,
    }


def build_p4() -> dict:
    rng = random.Random(304)

    def fmt(words: List[str]) -> str:
        return "\n".join([str(len(words))] + words)

    def rand_word(length: int, alpha: str = "abcdefghijklmnopqrstuvwxyz") -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    def shuf(w: str) -> str:
        a = list(w)
        rng.shuffle(a)
        return "".join(a)

    # Distinct 6-char non-anagrams using base-26 combinations (sorted strictly non-decreasing tuples)
    distinct_sigs: List[str] = []
    seen_s = set()
    while len(distinct_sigs) < 15000:
        w = rand_word(6)
        k = "".join(sorted(w))
        if k not in seen_s:
            seen_s.add(k)
            distinct_sigs.append(w)

    # 300 anagram groups spread across 15000 words of length 5
    bases_300 = [rand_word(5) for _ in range(300)]
    words_15k_300 = [shuf(bases_300[rng.randrange(300)]) for _ in range(15000)]

    # 10 very long words (len 10000 each) in 3 groups (sizes 5, 3, 2)
    long_b1 = rand_word(10000)
    long_b2 = rand_word(10000)
    long_b3 = rand_word(10000)
    long_words = [shuf(long_b1) for _ in range(5)] + [shuf(long_b2) for _ in range(3)] + [shuf(long_b3) for _ in range(2)]
    rng.shuffle(long_words)

    # Skewed Zipf-like 10000 words (~90KB)
    zipf_bases = [rand_word(rng.randint(6, 10)) for _ in range(200)]
    zipf_words = []
    for i in range(10000):
        # heavily favor index 0..5
        r = rng.random()
        if r < 0.35:
            b = zipf_bases[0]
        elif r < 0.55:
            b = zipf_bases[1]
        elif r < 0.70:
            b = zipf_bases[rng.randint(2, 10)]
        else:
            b = zipf_bases[rng.randrange(len(zipf_bases))]
        zipf_words.append(shuf(b))

    tests = [
        # 2 public samples
        {
            "input": fmt(["eat", "tea", "tan", "ate", "nat", "bat"]),
            "expected": "3 3",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": fmt(["abc", "abc", "cab", "xy", "yx"]),
            "expected": "2 3",
            "hidden": False,
            "checkBrute": True,
        },
        # 5 edge/corner cases
        {"input": fmt(["a"]), "hidden": True, "checkBrute": True},
        {"input": fmt(["aaaa"] * 100), "hidden": True, "checkBrute": True},
        {"input": fmt([chr(97 + i) for i in range(26)]), "hidden": True, "checkBrute": True},
        {
            # Traps buggy set-of-chars solutions
            "input": fmt(["aab", "abb", "aba", "bab", "aaab", "aabb", "abbb", "ab", "ba"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            # Traps buggy ASCII-sum / XOR / length-only solutions
            "input": fmt(["ac", "bb", "ad", "bc", "az", "by", "cx", "dw", "ev", "fu", "aabb", "abcc", "bbdd", "ca", "cb"]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {
            "input": fmt([shuf(bases_300[rng.randrange(20)]) for _ in range(300)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([rand_word(rng.randint(1, 4), "abcde") for _ in range(400)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                shuf(b := rand_word(rng.randint(20, 40))) if i % 2 == 0 else rand_word(rng.randint(20, 40))
                for i in range(500)
            ]),
            "hidden": True,
        },
        {
            "input": fmt([shuf("codeclass")] * 500 + [shuf("algorithm")] * 500 + [shuf("structure")] * 500),
            "hidden": True,
        },
        {
            "input": fmt(words_15k_300),
            "hidden": True,
        },
        {
            "input": fmt(distinct_sigs),
            "hidden": True,
        },
        {
            "input": fmt([shuf("abcdef") for _ in range(15000)]),
            "hidden": True,
        },
        {
            "input": fmt(long_words),
            "hidden": True,
        },
        {
            "input": fmt(zipf_words),
            "hidden": True,
        },
    ]

    stress = [
        fmt([rand_word(rng.randint(1, 5), "abcd") for _ in range(rng.randint(1, 60))])
        for _ in range(25)
    ]

    return {
        "slug": "cp03-group-anagrams-stats",
        "title": "Thống kê nhóm Anagram",
        "shortDescription": "Gom N từ chữ thường vào các nhóm anagram, đếm tổng số nhóm và tìm kích thước nhóm lớn nhất.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.frequency_grouping",
        "tags": ["xâu", "map-set", "sắp xếp", "tầng 1"],
        "statement": r"""Cho danh sách gồm $N$ từ $W_1, W_2, \dots, W_N$, mỗi từ là một xâu không rỗng chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`).

Ta gom các từ là **anagram** (hoán vị ký tự) của nhau vào cùng một nhóm. Hai từ giống hệt nhau cũng được xem là anagram của nhau và nằm chung một nhóm (mỗi lần xuất hiện trong danh sách đầu vào đều được tính vào kích thước nhóm).

Hãy xác định hai giá trị:
1. Tổng số nhóm anagram phân biệt tạo thành.
2. Kích thước (số lượng từ) của nhóm lớn nhất.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($1 \le N \le 15\,000$).
- $N$ dòng tiếp theo, dòng thứ $i$ chứa từ $W_i$ chỉ gồm ký tự `'a'..'z'`.

### Dữ liệu ra
- In ra hai số nguyên trên cùng một dòng cách nhau bởi một dấu cách: **tổng số nhóm** và **kích thước nhóm lớn nhất**.

### Ràng buộc
- $1 \le N \le 15\,000$.
- Tổng độ dài các từ $\sum_{i=1}^{N} |W_i| \le 10^5$.

### Subtasks
- **Subtask 1 (40%):** $N \le 500, \sum |W_i| \le 5000$.
- **Subtask 2 (60%):** $N \le 15\,000, \sum |W_i| \le 10^5$.

### Giải thích ví dụ
- Với $6$ từ `eat`, `tea`, `tan`, `ate`, `nat`, `bat`:
  - Nhóm 1: `{eat, tea, ate}` (kích thước $3$).
  - Nhóm 2: `{tan, nat}` (kích thước $2$).
  - Nhóm 3: `{bat}` (kích thước $1$).
  - Tổng cộng có `3` nhóm, kích thước nhóm lớn nhất là `3`.
- Với $5$ từ `abc`, `abc`, `cab`, `xy`, `yx`: có `2` nhóm là `{abc, abc, cab}` (kích thước `3`) và `{xy, yx}` (kích thước `2`).""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(sum |W_i| log |W_i|) hoặc O(sum |W_i| + 26N) dùng chuẩn hóa khóa + bảng băm.",
        "hints": """**Gợi ý 1:** Hai từ thuộc cùng một nhóm anagram khi và chỉ khi chúng có cùng một **khóa chuẩn hóa (canonical key)** sau khi sắp xếp lại các ký tự theo thứ tự tăng dần từ `'a'` đến `'z'`.

**Gợi ý 2:** Với mỗi từ $W_i$, tạo khóa chuẩn hóa `key = sort(W_i)` (hoặc bộ 26 số đếm tần suất ký tự) rồi tăng bộ đếm `freq[key] += 1` trong `unordered_map` / `dict`.

**Gợi ý 3:** Sau khi duyệt hết $N$ từ, tổng số nhóm chính là số lượng khóa khác nhau trong bảng băm (`freq.size()` / `len(freq)`), còn kích thước nhóm lớn nhất là giá trị lớn nhất trong các giá trị đếm (`max(freq.values())`).""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    unordered_map<string, int> freq;
    freq.reserve((size_t)n * 2);
    int maxGroup = 0;
    for (int i = 0; i < n; ++i) {
        string w;
        cin >> w;
        sort(w.begin(), w.end());
        int c = ++freq[w];
        if (c > maxGroup) maxGroup = c;
    }
    cout << freq.size() << ' ' << maxGroup << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    freq = {}
    for w in data[1:n + 1]:
        key = "".join(sorted(w))
        freq[key] = freq.get(key, 0) + 1
    sys.stdout.write(f"{len(freq)} {max(freq.values())}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p4_group_anagrams,
        "extraStressInputs": stress,
    }


def build_p5() -> dict:
    rng = random.Random(305)
    LOWER = "abcdefghijklmnopqrstuvwxyz"

    def fmt(s: str, qs: List[str]) -> str:
        return "\n".join([s, str(len(qs))] + qs)

    def rand_str(length: int, alpha: str = LOWER) -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    def sample_subseq(s: str, k: int) -> str:
        idxs = sorted(rng.sample(range(len(s)), k))
        return "".join(s[i] for i in idxs)

    # Medium test 8
    s8 = rand_str(1000)
    q8 = [
        sample_subseq(s8, rng.randint(5, 25)) if i % 2 == 0 else rand_str(rng.randint(5, 15))
        for i in range(150)
    ]

    # Medium test 9 (binary)
    s9 = rand_str(3000, "ab")
    q9 = [
        sample_subseq(s9, rng.randint(20, 60)) if i % 2 == 0 else rand_str(rng.randint(20, 60), "ab")
        for i in range(150)
    ]

    # Medium test 10 (fail on last char)
    s10 = rand_str(8000, "abcdefghijklmnopqrstuvwxy")  # no 'z'
    q10 = [
        sample_subseq(s10, rng.randint(15, 30)) + ("z" if i % 2 == 0 else "")
        for i in range(400)
    ]

    # Large test 11 (Anti-O(Q|S|) killer: |S|=50000, Q=10000)
    s11 = "a" * 49999 + "b"
    q11 = ["ba" if i % 3 == 0 else ("ab" if i % 3 == 1 else "bb") for i in range(10000)]

    # Large test 12 (|S|=50000 random, Q=10000, sum|P| ~ 75000 -> total ~135KB)
    s12 = rand_str(50000)
    q12 = [
        sample_subseq(s12, rng.randint(5, 9)) if i % 2 == 0 else rand_str(rng.randint(5, 9))
        for i in range(10000)
    ]

    # Large test 13 (periodic |S|=50000, Q=2000, len 30..45 -> ~127KB)
    s13 = "abcde" * 10000
    q13 = [
        rand_str(rng.randint(30, 45), "abcde") if i % 3 != 0 else ("e" * 10000 if i == 0 else rand_str(35, "abcdef"))
        for i in range(1800)
    ]
    # Keep q13 well under 140KB: replace the 10000-len query with a moderate one
    q13[0] = "abcde" * 10

    # Large test 14 (|S|=25000, Q=50 very long queries ~2000 each -> ~125KB)
    s14 = rand_str(25000)
    q14 = []
    for i in range(50):
        sub = sample_subseq(s14, 1999)
        if i % 2 == 0:
            q14.append(sub + s14[-1])
        else:
            # Make it likely non-subseq by reversing half
            q14.append(sub[::-1])

    # Large test 15 (|S|=50000 skewed alphabet, Q=5000 -> ~125KB)
    skew_alpha = "a" * 20 + "bcdefghij"
    s15 = rand_str(50000, skew_alpha)
    q15 = [
        sample_subseq(s15, rng.randint(10, 18)) if i % 2 == 0 else rand_str(rng.randint(10, 18), "abcdefghij")
        for i in range(5000)
    ]

    # Large test 16 (|S|=20000, Q=10000, sum|P|=100000 -> ~130KB)
    s16 = rand_str(20000)
    q16 = [
        sample_subseq(s16, 10) if i % 2 == 0 else rand_str(10)
        for i in range(10000)
    ]

    tests = [
        # 2 public samples
        {
            "input": fmt("abacaba", ["aaa", "cba", "cbaa", "abcb"]),
            "expected": "YES\nYES\nNO\nYES",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": fmt("codeclass", ["ccl", "cass", "cssa"]),
            "expected": "YES\nYES\nNO",
            "hidden": False,
            "checkBrute": True,
        },
        # 5 edge/corner cases
        {"input": fmt("z", ["z", "a", "zz"]), "hidden": True, "checkBrute": True},
        {
            "input": fmt("a" * 30000, ["a" * 29999, "a" * 30000, "a" * 30001, "b", "a" * 10 + "b"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt(LOWER, [LOWER, LOWER[::-1], "az", "za", "acegikmoqsuwy", "z", "a", "aa"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt("abcdefghij", ["abcdefghijk", "a" * 50, "abcdefghij", "jihgfedcba", "aj"]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt("abcdefghijklm" * 20, ["z", "abcz", "zabc", "mmmmmmmmmmmmmmmmmmmm", "mmmmmmmmmmmmmmmmmmmmm"]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {"input": fmt(s8, q8), "hidden": True, "checkBrute": True},
        {"input": fmt(s9, q9), "hidden": True, "checkBrute": True},
        {"input": fmt(s10, q10), "hidden": True},
        {"input": fmt(s11, q11), "hidden": True},
        {"input": fmt(s12, q12), "hidden": True},
        {"input": fmt(s13, q13), "hidden": True},
        {"input": fmt(s14, q14), "hidden": True},
        {"input": fmt(s15, q15), "hidden": True},
        {"input": fmt(s16, q16), "hidden": True},
    ]

    stress = [
        fmt(
            (s := rand_str(rng.randint(5, 60), "abcde")),
            [
                sample_subseq(s, rng.randint(1, len(s))) if j % 2 == 0 else rand_str(rng.randint(1, 15), "abcdef")
                for j in range(15)
            ],
        )
        for _ in range(25)
    ]

    return {
        "slug": "cp03-subsequence-queries",
        "title": "Truy vấn dãy con không liên tiếp",
        "shortDescription": "Tiền xử lý xâu gốc S để trả lời nhanh Q truy vấn kiểm tra xâu P có là dãy con không liên tiếp (subsequence) của S hay không.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "tìm kiếm nhị phân", "truy vấn", "tầng 2"],
        "statement": r"""Xâu $P$ được gọi là **dãy con không nhất thiết liên tiếp (subsequence)** của xâu $S$ nếu ta có thể xóa đi một số ký tự (có thể không xóa ký tự nào) của $S$ và giữ nguyên thứ tự các ký tự còn lại để thu được đúng $P$.

Cho trước một xâu gốc $S$ và $Q$ truy vấn. Mỗi truy vấn cho một xâu $P_i$, bạn cần trả lời xem $P_i$ có phải là dãy con không liên tiếp của $S$ hay không.

### Dữ liệu vào
- Dòng đầu tiên chứa xâu gốc $S$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`).
- Dòng thứ hai chứa số nguyên dương $Q$ ($1 \le Q \le 10\,000$) — số lượng truy vấn.
- $Q$ dòng tiếp theo, dòng thứ $i$ chứa xâu truy vấn $P_i$ không rỗng chỉ gồm ký tự `'a'..'z'`.

### Dữ liệu ra
- Gồm $Q$ dòng, dòng thứ $i$ in `YES` nếu $P_i$ là dãy con của $S$, ngược lại in `NO`.

### Ràng buộc
- $1 \le |S| \le 50\,000$.
- $1 \le Q \le 10\,000$.
- Tổng độ dài các xâu truy vấn $\sum_{i=1}^{Q} |P_i| \le 10^5$.

### Subtasks
- **Subtask 1 (30%):** $|S| \le 1000, Q \le 500$.
- **Subtask 2 (70%):** Không có ràng buộc bổ sung.

### Giải thích ví dụ
Với xâu gốc `S = "abacaba"` (chỉ số 1-based: `1:a, 2:b, 3:a, 4:c, 5:a, 6:b, 7:a`):
- `"aaa"` xuất hiện tại các vị trí `(1, 3, 5)` $\rightarrow$ `YES`.
- `"cba"` xuất hiện tại các vị trí `(4, 6, 7)` $\rightarrow$ `YES`.
- `"cbaa"`: ký tự `'c'` sớm nhất ở vị trí `4`, `'b'` tiếp theo ở `6`, `'a'` tiếp theo ở `7`, không còn `'a'` nào sau `7` $\rightarrow$ `NO`.
- `"abcb"` xuất hiện tại `(1, 2, 4, 6)` $\rightarrow$ `YES`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(|S| + (sum |P_i|) log |S|) hoặc O(26|S| + sum |P_i|). Thuật toán duyệt thẳng O(Q|S|) sẽ bị TLE.",
        "hints": r"""**Gợi ý 1:** Cách duyệt hai con trỏ từng truy vấn mất $O(|S|)$ cho mỗi truy vấn, dẫn đến tổng thời gian $O(Q \cdot |S|) \approx 5 \times 10^8$ phép toán — quá chậm! Ta cần **tiền xử lý** xâu $S$ một lần duy nhất.

**Gợi ý 2:** Lưu $26$ danh sách tăng dần `pos[c]` chứa tất cả các vị trí xuất hiện của chữ cái $c$ trong $S$. Khi ghép tham lam từng ký tự của $P$, ta luôn chọn vị trí **nhỏ nhất** lớn hơn vị trí vừa khớp trước đó `cur`.

**Gợi ý 3:** Để tìm nhanh vị trí đầu tiên trong `pos[c]` lớn hơn `cur`, dùng tìm kiếm nhị phân (`upper_bound` trong C++ hoặc `bisect_right` trong Python). Nếu không tồn tại vị trí nào như vậy thì trả lời `NO` ngay lập tức.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    vector<vector<int>> pos(26);
    for (int i = 0; i < (int)s.size(); ++i) {
        pos[s[i] - 'a'].push_back(i);
    }

    int q;
    cin >> q;
    while (q--) {
        string p;
        cin >> p;
        int cur = -1;
        bool ok = true;
        for (char ch : p) {
            const auto& v = pos[ch - 'a'];
            auto it = upper_bound(v.begin(), v.end(), cur);
            if (it == v.end()) {
                ok = false;
                break;
            }
            cur = *it;
        }
        cout << (ok ? "YES\n" : "NO\n");
    }
    return 0;
}""",
        "pythonSolution": r"""import bisect
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    q = int(data[1])
    pos = [[] for _ in range(26)]
    for i, ch in enumerate(s):
        pos[ord(ch) - 97].append(i)

    out = []
    for p in data[2:2 + q]:
        cur = -1
        ok = True
        for ch in p:
            lst = pos[ord(ch) - 97]
            idx = bisect.bisect_right(lst, cur)
            if idx == len(lst):
                ok = False
                break
            cur = lst[idx]
        out.append("YES" if ok else "NO")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p5_subsequence_queries,
        "extraStressInputs": stress,
    }


def build_p6() -> dict:
    rng = random.Random(306)
    LOWER = "abcdefghijklmnopqrstuvwxyz"

    def rand_str(length: int, alpha: str = LOWER) -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    # Construct length 100000 all-even frequencies
    even_100k = []
    for i in range(26):
        cnt = 3846 if i < 24 else (3848 if i == 24 else 3848)
        # 24 * 3846 + 2 * 3848 = 92304 + 7696 = 100000 (all even!)
        even_100k.append(LOWER[i] * cnt)
    even_100k_list = list("".join(even_100k))
    rng.shuffle(even_100k_list)

    # Construct length 100000 all-26-odd frequencies (sum of 26 odds is even!)
    odd_100k = []
    for i in range(26):
        cnt = 3845 if i < 20 else (3847 if i < 24 else 3857)
        # 20*3845 = 76900, 4*3847 = 15388, 2*3857 = 7714 -> 76900+15388+7714 = 100002 -> adjust:
        # 22*3845 = 84590, 4*3853 = 15412 -> 100002 -> 23*3845 = 88435, 3*3855 = 11565 -> 100000! (all odd!)
        cnt = 3845 if i < 23 else 3855
        odd_100k.append(LOWER[i] * cnt)
    odd_100k_list = list("".join(odd_100k))
    rng.shuffle(odd_100k_list)

    tests = [
        # 3 public samples
        {"input": "abccccdd", "expected": "ccdadcc", "hidden": False, "checkBrute": True},
        {"input": "dcba", "expected": "a", "hidden": False, "checkBrute": True},
        {"input": "bbaa", "expected": "abba", "hidden": False, "checkBrute": True},
        # 5 edge/corner cases
        {"input": "z", "hidden": True, "checkBrute": True},
        {"input": "mm", "hidden": True, "checkBrute": True},
        {"input": "zyxwvutsrqponmlkjihgfedcba", "hidden": True},
        {"input": "zyxwvutsrqponmlkjihgfedcba" * 2, "hidden": True},
        {"input": "aabbccddeeffgghhiijjkkllmmnnooppqqrrssttuuvvwwxxyyz", "hidden": True},
        # 8 medium -> large tests
        {"input": "zzbbaa", "hidden": True, "checkBrute": True},
        {"input": "zzabcc", "hidden": True, "checkBrute": True},
        {"input": "k" * 99999, "hidden": True},
        {"input": "a" * 100000, "hidden": True},
        {"input": rand_str(5000, "abcde"), "hidden": True},
        {"input": rand_str(50000), "hidden": True},
        {"input": "".join(even_100k_list), "hidden": True},
        {"input": "".join(odd_100k_list), "hidden": True},
    ]

    stress = [
        rand_str(rng.randint(1, 9), "abcde")
        for _ in range(30)
    ]

    return {
        "slug": "cp03-longest-palindrome-build",
        "title": "Xây dựng xâu đối xứng dài nhất nhỏ nhất từ điển",
        "shortDescription": "Chọn ra một số ký tự từ xâu S và sắp xếp lại để tạo thành xâu đối xứng dài nhất, có thứ tự từ điển nhỏ nhất.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.char_frequency",
        "tags": ["xâu", "tham lam", "tần suất", "tầng 1"],
        "statement": r"""Cho một xâu $S$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`). Bạn được phép chọn ra một tập con các ký tự từ $S$ (bỏ đi những ký tự không dùng) rồi sắp xếp lại chúng theo thứ tự tùy ý để tạo thành một **xâu đối xứng (palindrome)**.

Hãy xây dựng xâu đối xứng có **độ dài lớn nhất có thể**. Nếu có nhiều xâu đối xứng cùng đạt độ dài lớn nhất, hãy in ra xâu **nhỏ nhất theo thứ tự từ điển**.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ chỉ gồm các ký tự `'a'..'z'`.

### Dữ liệu ra
- Một dòng duy nhất là xâu đối xứng thỏa mãn yêu cầu đề bài.

### Ràng buộc
- $1 \le |S| \le 10^5$.

### Subtasks
- **Subtask 1 (40%):** $|S| \le 1000$.
- **Subtask 2 (60%):** $|S| \le 10^5$.

### Giải thích ví dụ
- Với `"abccccdd"`: Có 4 chữ `'c'`, 2 chữ `'d'`, 1 chữ `'a'` và 1 chữ `'b'`. Độ dài lớn nhất của xâu đối xứng là $7$ (dùng 2 cặp `'c'`, 1 cặp `'d'` và 1 ký tự lẻ ở giữa). Để nhỏ nhất theo thứ tự từ điển, nửa đầu phải là `"ccd"`, ký tự ở giữa là `'a'` (nhỏ hơn `'b'`), nửa cuối đối xứng là `"dcc"` $\rightarrow$ `"ccdadcc"`.
- Với `"dcba"`: Mọi ký tự đều chỉ xuất hiện 1 lần nên độ dài lớn nhất là $1$, ký tự nhỏ nhất là `"a"`.
- Với `"bbaa"`: Mọi ký tự đều có tần suất chẵn nên dùng toàn bộ 4 ký tự $\rightarrow$ `"abba"`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(|S| + 26) bằng đếm tần suất và tham lam.",
        "hints": r"""**Gợi ý 1:** Trong một xâu đối xứng, mọi ký tự nằm ở nửa đầu đều phải có một bản sao đối xứng tương ứng ở nửa cuối; riêng vị trí chính giữa (nếu độ dài xâu lẻ) có thể đặt thêm tối đa $1$ ký tự đơn lẻ.

**Gợi ý 2:** Với mỗi chữ cái $c$ xuất hiện $\text{cnt}[c]$ lần, để đạt **độ dài lớn nhất**, ta luôn phải sử dụng hết tất cả $\lfloor \text{cnt}[c]/2 \rfloor$ cặp ký tự $c$ cho hai nửa đối xứng. Nếu tồn tại ít nhất một chữ cái có $\text{cnt}[c]$ lẻ, ta cộng thêm $1$ vào độ dài bằng cách đặt $1$ chữ cái có tần suất lẻ vào chính giữa.

**Gợi ý 3:** Để kết quả **nhỏ nhất theo thứ tự từ điển**, nửa đầu phải xếp các chữ cái tăng dần từ `'a'` đến `'z'` (mỗi chữ cái $c$ xuất hiện $\lfloor \text{cnt}[c]/2 \rfloor$ lần), và ký tự chính giữa (nếu có) phải là chữ cái **nhỏ nhất** có tần suất lẻ. Nửa sau chính là đảo ngược của nửa đầu.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    array<int, 26> cnt{};
    for (char c : s) cnt[c - 'a']++;

    string half;
    half.reserve(s.size() / 2);
    char mid = 0;
    for (int c = 0; c < 26; ++c) {
        half.append(cnt[c] / 2, char('a' + c));
        if ((cnt[c] & 1) && mid == 0) {
            mid = char('a' + c);
        }
    }
    string rev = half;
    reverse(rev.begin(), rev.end());
    if (mid != 0) {
        cout << half << mid << rev << '\n';
    } else {
        cout << half << rev << '\n';
    }
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    cnt = [0] * 26
    for ch in s:
        cnt[ord(ch) - 97] += 1

    half_parts = []
    mid = ""
    for c in range(26):
        ch = chr(97 + c)
        if cnt[c] >= 2:
            half_parts.append(ch * (cnt[c] // 2))
        if (cnt[c] & 1) and not mid:
            mid = ch

    half = "".join(half_parts)
    sys.stdout.write(half + mid + half[::-1] + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p6_longest_palindrome_build,
        "extraStressInputs": stress,
    }


def build_p7() -> dict:
    rng = random.Random(307)
    LOWER = "abcdefghijklmnopqrstuvwxyz"

    def rand_str(length: int, alpha: str = LOWER) -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    def make_pal(length: int, alpha: str = LOWER) -> str:
        half = rand_str(length // 2, alpha)
        if length % 2 == 1:
            return half + rng.choice(alpha) + half[::-1]
        return half + half[::-1]

    tests = [
        # 3 public samples
        {"input": "babad", "expected": "3 1", "hidden": False, "checkBrute": True},
        {"input": "cbbd", "expected": "2 2", "hidden": False, "checkBrute": True},
        {"input": "abacdfgdcaba", "expected": "3 1", "hidden": False, "checkBrute": True},
        # 5 edge/corner cases
        {"input": "x", "hidden": True, "checkBrute": True},
        {"input": LOWER, "hidden": True, "checkBrute": True},
        {"input": "a" * 3000, "hidden": True},
        {"input": "a" * 1000 + "bcdef" + "z" * 1500, "hidden": True},
        {"input": "abccba" + "xyz" + "deffed", "hidden": True, "checkBrute": True},
        # 8 medium -> large tests
        {"input": "a" * 1499 + "b" + "a" * 1500, "hidden": True},
        {"input": rand_str(100, "ab"), "hidden": True, "checkBrute": True},
        {"input": "ab" * 250, "hidden": True},
        {"input": rand_str(350) + make_pal(300) + rand_str(350), "hidden": True},
        {"input": rand_str(3000), "hidden": True},
        {"input": rand_str(3000, "ab"), "hidden": True},
        {
            "input": rand_str(500) + make_pal(800) + rand_str(400) + make_pal(801) + rand_str(499),
            "hidden": True,
        },
        {"input": make_pal(3000), "hidden": True},
    ]

    stress = [
        rand_str(rng.randint(1, 70), "abc")
        for _ in range(30)
    ]

    return {
        "slug": "cp03-longest-palindromic-substring",
        "title": "Xâu con đối xứng dài nhất",
        "shortDescription": "Tìm độ dài xâu con liên tiếp đối xứng dài nhất và vị trí bắt đầu nhỏ nhất (1-indexed) của nó.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "tối ưu", "tầng 2"],
        "statement": r"""Cho một xâu $S$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`).

Hãy tìm một **xâu con liên tiếp** của $S$ thỏa mãn:
1. Là một xâu đối xứng (palindrome).
2. Có độ dài lớn nhất có thể.
3. Nếu có nhiều xâu con liên tiếp đối xứng cùng đạt độ dài lớn nhất, hãy chọn xâu có **vị trí bắt đầu nhỏ nhất** (đánh số từ $1$).

In ra hai số nguyên: độ dài lớn nhất tìm được và vị trí bắt đầu nhỏ nhất (1-indexed) tương ứng.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ chỉ gồm các ký tự `'a'..'z'`.

### Dữ liệu ra
- Hai số nguyên `len pos` trên một dòng, cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le |S| \le 3000$.

### Subtasks
- **Subtask 1 (40%):** $|S| \le 200$.
- **Subtask 2 (60%):** $|S| \le 3000$.

### Giải thích ví dụ
- Với `"babad"`: Có hai xâu con đối xứng độ dài lớn nhất là `"bab"` (bắt đầu tại vị trí $1$) và `"aba"` (bắt đầu tại vị trí $2$). Ta chọn vị trí bắt đầu nhỏ nhất $\rightarrow$ `3 1`.
- Với `"cbbd"`: Xâu con đối xứng dài nhất là `"bb"` bắt đầu tại vị trí $2$ $\rightarrow$ `2 2`.
- Với `"abacdfgdcaba"`: Lưu ý `"abac"` xuất hiện trong cả $S$ và đảo ngược của $S$, nhưng `"abac"` không phải xâu đối xứng; xâu con đối xứng dài nhất là `"aba"` tại vị trí $1$ $\rightarrow$ `3 1`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(|S|^2) với kỹ thuật mở rộng từ tâm (bộ nhớ O(1)) hoặc O(|S|) với thuật toán Manacher.",
        "hints": r"""**Gợi ý 1:** Duyệt mọi cặp $(l, r)$ rồi kiểm tra đối xứng mất $O(|S|^3)$ — quá chậm với $|S| = 3000$. Thay vì kiểm tra từng đoạn, hãy cố định **tâm đối xứng** và mở rộng đều sang hai bên!

**Gợi ý 2:** Có hai loại tâm đối xứng: tâm lẻ tại đúng một ký tự $(i, i)$ cho xâu đối xứng độ dài lẻ, và tâm chẵn nằm giữa hai ký tự liên tiếp $(i, i+1)$ cho xâu đối xứng độ dài chẵn. Tổng cộng chỉ có $2|S| - 1$ tâm.

**Gợi ý 3:** Với mỗi tâm $(l, r)$, giảm $l$ và tăng $r$ chừng nào $0 \le l, r < |S|$ và $S[l] = S[r]$. Khi dừng lại, đoạn đối xứng là $[l+1, r-1]$ có độ dài $r - l - 1$ và vị trí bắt đầu 1-indexed là $l + 2$. Cập nhật đáp án khi độ dài lớn hơn, hoặc độ dài bằng nhau nhưng vị trí bắt đầu nhỏ hơn. (Nâng cao: có thể giải trong $O(|S|)$ bằng thuật toán Manacher.)""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    int n = (int)s.size();
    int bestLen = 1, bestStart = 0;

    auto expand = [&](int l, int r) {
        while (l >= 0 && r < n && s[l] == s[r]) {
            --l;
            ++r;
        }
        int len = r - l - 1;
        int start = l + 1;
        if (len > bestLen || (len == bestLen && start < bestStart)) {
            bestLen = len;
            bestStart = start;
        }
    };

    for (int i = 0; i < n; ++i) {
        expand(i, i);
        expand(i, i + 1);
    }

    cout << bestLen << ' ' << (bestStart + 1) << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    n = len(s)
    # Manacher's algorithm in O(N) guarantees blazing speed even on worst-case 'a'*3000
    # Transform: ^#s[0]#s[1]#...#s[n-1]#$
    t = "^#" + "#".join(s) + "#$"
    m = len(t)
    p = [0] * m
    center = 0
    right = 0
    best_len = 1
    best_start = 0

    for i in range(1, m - 1):
        if i < right:
            mirror = 2 * center - i
            p[i] = min(right - i, p[mirror])
        while t[i + p[i] + 1] == t[i - p[i] - 1]:
            p[i] += 1
        if i + p[i] > right:
            center = i
            right = i + p[i]
        cur_len = p[i]
        if cur_len >= best_len:
            start = (i - cur_len) // 2
            if cur_len > best_len or start < best_start:
                best_len = cur_len
                best_start = start

    sys.stdout.write(f"{best_len} {best_start + 1}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p7_longest_palindromic_substring,
        "extraStressInputs": stress,
    }


def build_p8() -> dict:
    rng = random.Random(308)
    LOWER = "abcdefghijklmnopqrstuvwxyz"

    def rand_str(length: int, alpha: str = LOWER) -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    def fmt(t: str, p: str) -> str:
        return f"{t}\n{p}"

    # Test 16: T len 100000 with 3 planted occurrences of a 2000-char pattern
    p16 = rand_str(2000)
    t16_chunks = [
        rand_str(12345),
        p16,
        rand_str(30000),
        p16,
        rand_str(40000),
        p16,
        rand_str(11655),
    ]
    t16 = "".join(t16_chunks)  # len 100000

    fib_t = make_fibonacci_string(2584)
    fib_p = make_fibonacci_string(377)

    tests = [
        # 3 public samples
        {"input": fmt("ababa", "aba"), "expected": "2 1 3", "hidden": False, "checkBrute": True},
        {"input": fmt("codeclass", "xyz"), "expected": "0 0 0", "hidden": False, "checkBrute": True},
        {"input": fmt("aaaaa", "aa"), "expected": "4 1 4", "hidden": False, "checkBrute": True},
        # 5 edge/corner cases
        {"input": fmt("abc", "abcd"), "hidden": True, "checkBrute": True},
        {"input": fmt("a", "a"), "hidden": True, "checkBrute": True},
        {"input": fmt("xyzabcdef", "xyz"), "hidden": True, "checkBrute": True},
        {"input": fmt("xyzabcdef", "def"), "hidden": True, "checkBrute": True},
        {"input": fmt("a" * 100000, "a" * 40000), "hidden": True},  # 140KB naive killer
        # 8 medium -> large tests
        {"input": fmt("a" * 99999 + "b", "a" * 39999 + "b"), "hidden": True},  # 140KB naive killer (1 match at end)
        {"input": fmt("a" * 100000, "a" * 39999 + "b"), "hidden": True},  # 140KB naive killer (0 match)
        {"input": fmt(fib_t, fib_p), "hidden": True, "checkBrute": True},
        {"input": fmt("abac" * 500, "abacabac"), "hidden": True, "checkBrute": True},
        {"input": fmt(rand_str(5000, "ab"), rand_str(8, "ab")), "hidden": True, "checkBrute": True},
        {"input": fmt(rand_str(100000, "ab"), rand_str(12, "ab")), "hidden": True},
        {"input": fmt(("a" * 99 + "b") * 1000, "a" * 99 + "b" + "a" * 99), "hidden": True},
        {"input": fmt(t16, p16), "hidden": True},
    ]

    stress = [
        fmt(rand_str(rng.randint(1, 80), "ab"), rand_str(rng.randint(1, 20), "ab"))
        for _ in range(30)
    ]

    return {
        "slug": "cp03-kmp-pattern-count",
        "title": "Đếm mẫu xuất hiện bằng KMP",
        "shortDescription": "Sử dụng thuật toán KMP đếm số lần xuất hiện (cho phép chồng lấn) cùng vị trí đầu tiên và cuối cùng của mẫu P trong văn bản T.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "kmp", "tối ưu", "tầng 2"],
        "statement": r"""Cho văn bản $T$ và xâu mẫu $P$, cả hai chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`).

Hãy tìm tất cả các lần xuất hiện của mẫu $P$ dưới dạng xâu con liên tiếp trong văn bản $T$ (**cho phép các lần xuất hiện chồng lấn lên nhau**). Cụ thể, hãy in ra ba số nguyên:
1. Tổng số lần $P$ xuất hiện trong $T$.
2. Vị trí bắt đầu (1-indexed) của lần xuất hiện **đầu tiên**.
3. Vị trí bắt đầu (1-indexed) của lần xuất hiện **cuối cùng**.

Nếu $P$ không xuất hiện lần nào trong $T$, hãy in ra `0 0 0`.

### Dữ liệu vào
- Dòng thứ nhất chứa xâu văn bản $T$.
- Dòng thứ hai chứa xâu mẫu $P$.

### Dữ liệu ra
- Ba số nguyên trên một dòng cách nhau bởi dấu cách: `count first_pos last_pos`.

### Ràng buộc
- $1 \le |T| \le 10^5$, $1 \le |P| \le 10^5$.
- Các xâu chỉ gồm ký tự `'a'..'z'`.

### Subtasks
- **Subtask 1 (30%):** $|T|, |P| \le 2000$.
- **Subtask 2 (70%):** $|T|, |P| \le 10^5$.

### Giải thích ví dụ
- Với `T = "ababa"`, `P = "aba"`: Mẫu `"aba"` xuất hiện $2$ lần (chồng lấn tại ký tự `'a'` giữa) tại các vị trí bắt đầu $1$ và $3$ $\rightarrow$ `2 1 3`.
- Với `T = "codeclass"`, `P = "xyz"`: Mẫu không xuất hiện $\rightarrow$ `0 0 0`.
- Với `T = "aaaaa"`, `P = "aa"`: Mẫu xuất hiện $4$ lần tại các vị trí $1, 2, 3, 4$ $\rightarrow$ `4 1 4`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(|T| + |P|) bằng thuật toán Knuth-Morris-Pratt (KMP). Cách khớp trực tiếp O(|T||P|) bị TLE trên test toàn ký tự 'a'.",
        "hints": r"""**Gợi ý 1:** Khi so khớp trực tiếp thất bại ở vị trí $j$ của mẫu $P$, thay vì quay lại kiểm tra từ đầu mẫu, ta có thể tận dụng phần tiền tố đã khớp bằng **hàm tiền tố (prefix function / mảng $\pi$)** của $P$.

**Gợi ý 2:** Định nghĩa $\pi[i]$ là độ dài lớn nhất của tiền tố thực sự (khác toàn bộ xâu) của $P[0 \dots i]$ mà đồng thời cũng là hậu tố của $P[0 \dots i]$. Mảng $\pi$ được xây dựng trong $O(|P|)$.

**Gợi ý 3:** Duyệt $i$ qua từng ký tự của $T$ và duy trì độ dài đang khớp $j$. Mỗi khi $j = |P|$, ta ghi nhận một lần khớp tại vị trí 1-indexed $i - |P| + 2$, sau đó **đặt lại $j \leftarrow \pi[j - 1]$** (không đặt về $0$!) để không bỏ sót các lần xuất hiện chồng lấn.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string t, p;
    if (!(cin >> t >> p)) return 0;
    int n = (int)t.size();
    int m = (int)p.size();
    if (m > n) {
        cout << "0 0 0\n";
        return 0;
    }

    vector<int> pi(m, 0);
    for (int i = 1; i < m; ++i) {
        int j = pi[i - 1];
        while (j > 0 && p[i] != p[j]) j = pi[j - 1];
        if (p[i] == p[j]) ++j;
        pi[i] = j;
    }

    long long cnt = 0;
    int firstPos = 0, lastPos = 0;
    int j = 0;
    for (int i = 0; i < n; ++i) {
        while (j > 0 && t[i] != p[j]) j = pi[j - 1];
        if (t[i] == p[j]) ++j;
        if (j == m) {
            int pos = i - m + 2;
            ++cnt;
            if (firstPos == 0) firstPos = pos;
            lastPos = pos;
            j = pi[j - 1];
        }
    }

    cout << cnt << ' ' << firstPos << ' ' << lastPos << '\n';
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if len(data) < 2:
        return
    t, p = data[0], data[1]
    n, m = len(t), len(p)
    if m > n:
        sys.stdout.write("0 0 0\n")
        return

    pi = [0] * m
    j = 0
    for i in range(1, m):
        ch = p[i]
        while j > 0 and ch != p[j]:
            j = pi[j - 1]
        if ch == p[j]:
            j += 1
        pi[i] = j

    cnt = 0
    first_pos = 0
    last_pos = 0
    j = 0
    for i, ch in enumerate(t):
        while j > 0 and ch != p[j]:
            j = pi[j - 1]
        if ch == p[j]:
            j += 1
            if j == m:
                pos = i - m + 2
                cnt += 1
                if first_pos == 0:
                    first_pos = pos
                last_pos = pos
                j = pi[j - 1]

    sys.stdout.write(f"{cnt} {first_pos} {last_pos}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p8_kmp_pattern_count,
        "extraStressInputs": stress,
    }


def build_p9() -> dict:
    rng = random.Random(309)
    LOWER = "abcdefghijklmnopqrstuvwxyz"

    def rand_str(length: int, alpha: str = LOWER) -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    def fmt(arr: List[str]) -> str:
        return "\n".join([str(len(arr))] + arr)

    def periodic_str(base: str, target_len: int) -> str:
        reps = (target_len + len(base) - 1) // len(base)
        return (base * reps)[:target_len]

    # Test 15: T=50, len=2000 each (100KB)
    t15 = []
    for i in range(50):
        mode = i % 5
        if mode == 0:
            d = rng.choice([1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 200, 500, 1000])
            t15.append(periodic_str(rand_str(d, "abcd"), 2000))
        elif mode == 1:
            d = rng.choice([3, 7, 11, 13, 37, 111, 777, 1333])
            t15.append(periodic_str(rand_str(d, "abcd"), 2000))
        elif mode == 2:
            t15.append(make_fibonacci_string(2000))
        elif mode == 3:
            s = list(periodic_str(rand_str(20, "abc"), 2000))
            s[rng.randrange(2000)] = "z"
            t15.append("".join(s))
        else:
            t15.append(rand_str(2000))

    # Test 16: T=10, len=10000 each (100KB)
    t16 = [
        periodic_str(rand_str(125, "abcde"), 10000),
        periodic_str(rand_str(123, "abcde"), 10000),
        periodic_str(rand_str(5000), 10000),
        periodic_str(rand_str(5001), 10000),
        "a" * 9999 + "b",
        "b" + "a" * 9999,
        make_fibonacci_string(10000),
        periodic_str("aabaa", 10000),
        periodic_str("aabaa", 9998) + "aa",
        rand_str(10000),
    ]

    tests = [
        # 2 public samples
        {
            "input": fmt(["ababab", "ababa", "aaaa", "abcd"]),
            "expected": "2 2\n2 5\n1 1\n4 4",
            "hidden": False,
            "checkBrute": True,
        },
        {
            "input": fmt(["abcabca", "abcabc", "abacaba"]),
            "expected": "3 7\n3 3\n4 7",
            "hidden": False,
            "checkBrute": True,
        },
        # 5 edge/corner cases
        {"input": fmt(["a", "aa", "ab", "aba", "aab", "baa", "aaa"]), "hidden": True, "checkBrute": True},
        {"input": fmt(["z" * 100000]), "hidden": True},
        {"input": fmt(["ab" * 49999 + "ac"]), "hidden": True},
        {
            "input": fmt([make_fibonacci_string(k) for k in [2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                periodic_str("abc", 1001),
                periodic_str("abcde", 1000),
                "a" * 50 + "b" + "a" * 50,
                "ababa" * 10 + "ab",
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        # 9 medium -> large tests
        {
            "input": fmt([rand_str(rng.randint(1, 35), "ab") for _ in range(50)]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                periodic_str(rand_str(rng.randint(2, 15), "abc"), rng.randint(20, 100))
                for _ in range(50)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {
            "input": fmt([
                periodic_str(rand_str(rng.randint(3, 40), "ab"), rng.randint(100, 400))
                for _ in range(25)
            ]),
            "hidden": True,
            "checkBrute": True,
        },
        {"input": fmt([periodic_str(rand_str(13, "abcde"), 100000)]), "hidden": True},
        {"input": fmt([periodic_str(rand_str(25, "abcde"), 100000)]), "hidden": True},
        {"input": fmt([periodic_str(rand_str(50000), 100000)]), "hidden": True},
        {"input": fmt([periodic_str(rand_str(60000), 100000)]), "hidden": True},
        {"input": fmt(t15), "hidden": True},
        {"input": fmt(t16), "hidden": True},
    ]

    stress = [
        fmt([rand_str(rng.randint(1, 45), "ab") for _ in range(20)])
        for _ in range(30)
    ]

    return {
        "slug": "cp03-smallest-string-period",
        "title": "Chu kỳ nhỏ nhất của xâu",
        "shortDescription": "Tìm độ dài chu kỳ tiền tố nhỏ nhất p và chu kỳ lặp chia hết nhỏ nhất q của mỗi xâu bằng hàm tiền tố KMP.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "kmp", "tối ưu", "tầng 2"],
        "statement": r"""Cho $T$ xâu $S$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`). Với mỗi xâu $S$ có độ dài $N = |S|$ (đánh số ký tự từ $1$ đến $N$), hãy tìm hai số nguyên dương $p$ và $q$:

1. **$p$ (chu kỳ tiền tố nhỏ nhất):** Số nguyên dương nhỏ nhất ($1 \le p \le N$) sao cho $S$ là tiền tố của xâu lặp vô hạn $S[1..p]S[1..p]S[1..p]\dots$ (tương đương $S[i] = S[i - p]$ với mọi $p < i \le N$).
2. **$q$ (chu kỳ chia hết nhỏ nhất):** Ước số nguyên dương nhỏ nhất của $N$ ($q \mid N$) sao cho $S$ bằng đúng $\frac{N}{q}$ lần lặp liên tiếp của tiền tố $S[1..q]$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 50$) — số lượng bộ test.
- $T$ dòng tiếp theo, mỗi dòng chứa một xâu $S$ không rỗng chỉ gồm các ký tự `'a'..'z'`.

### Dữ liệu ra
- Gồm $T$ dòng, mỗi dòng in hai số nguyên `p q` cách nhau bởi một dấu cách tương ứng với từng xâu.

### Ràng buộc
- $1 \le T \le 50$.
- Tổng độ dài các xâu $\sum |S| \le 10^5$.

### Subtasks
- **Subtask 1 (30%):** $\sum |S| \le 2000$.
- **Subtask 2 (70%):** $\sum |S| \le 10^5$.

### Giải thích ví dụ
- `"ababab"` ($N = 6$): lặp `"ab"` đúng $3$ lần $\rightarrow p = 2, q = 2$.
- `"ababa"` ($N = 5$): là tiền tố độ dài $5$ của `"ababab..."` nên $p = 2$, nhưng $2 \nmid 5$ và không thể viết dưới dạng lặp nguyên lần một xâu ngắn hơn $\rightarrow q = 5$.
- `"aaaa"` ($N = 4$): lặp `"a"` đúng $4$ lần $\rightarrow p = 1, q = 1$.
- `"abcd"` ($N = 4$): không có chu kỳ thực sự $\rightarrow p = 4, q = 4$.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(sum |S|) bằng hàm tiền tố KMP và định lý tuần hoàn (Periodicity Lemma).",
        "hints": r"""**Gợi ý 1:** Hãy tính mảng hàm tiền tố $\pi$ của KMP cho xâu $S$ (độ dài $N$). Giá trị $b = \pi[N-1]$ là độ dài lớn nhất của tiền tố thực sự đồng thời là hậu tố của $S$ (còn gọi là *border* dài nhất).

**Gợi ý 2:** Một tính chất kinh điển của xâu: $d$ là một chu kỳ của $S$ khi và chỉ khi $N - d$ là độ dài một border của $S$. Do đó, chu kỳ tiền tố **nhỏ nhất** chính là $p = N - \pi[N-1]$.

**Gợi ý 3:** Đối với chu kỳ chia hết $q \mid N$: nếu $N \bmod p = 0$ thì hiển nhiên $q = p$. Ngược lại, nếu $N \bmod p \ne 0$, theo Bổ đề Tuần hoàn (Fine–Wilf), không thể tồn tại bất kỳ ước thực sự $q \le N/2$ nào là chu kỳ của $S$ (vì khi đó $\gcd(p, q)$ cũng là chu kỳ, suy ra $p \mid q \mid N$, mâu thuẫn!). Vậy $q = p$ nếu $p \mid N$, ngược lại $q = N$.""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        string s;
        cin >> s;
        int n = (int)s.size();
        vector<int> pi(n, 0);
        for (int i = 1; i < n; ++i) {
            int j = pi[i - 1];
            while (j > 0 && s[i] != s[j]) j = pi[j - 1];
            if (s[i] == s[j]) ++j;
            pi[i] = j;
        }
        int p = n - pi[n - 1];
        int q = (n % p == 0) ? p : n;
        cout << p << ' ' << q << '\n';
    }
    return 0;
}""",
        "pythonSolution": r"""import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    out = []
    for s in data[1:t + 1]:
        n = len(s)
        pi = [0] * n
        j = 0
        for i in range(1, n):
            ch = s[i]
            while j > 0 and ch != s[j]:
                j = pi[j - 1]
            if ch == s[j]:
                j += 1
            pi[i] = j
        p = n - pi[n - 1]
        q = p if n % p == 0 else n
        out.append(f"{p} {q}")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p9_smallest_period,
        "extraStressInputs": stress,
    }


def build_p10() -> dict:
    rng = random.Random(310)
    LOWER = "abcdefghijklmnopqrstuvwxyz"

    def rand_str(length: int, alpha: str = LOWER) -> str:
        return "".join(rng.choice(alpha) for _ in range(length))

    # Anti-ULL-single-hash test: Thue-Morse of length 8192 + 'c' + inverted Thue-Morse
    tm = make_thue_morse(8192)
    anti_ull_hash = tm + "c" + invert_ab(tm)  # len 16385

    # Two disjoint identical blocks separated by 'z'
    block15k = rand_str(15000, "abcdefghijklmnopqrstuvwxy")
    two_blocks = block15k + "z" + block15k  # len 30001 -> LRS = 15000

    # Planted overlapping repeat of length 12345 inside 40000-char string
    # Make A + B + A where len(A) = 8000, len(B) = 4345 -> A+B+A has len 20345, repeat A+B? Wait:
    # Simply take X (len 8000), repeat = X + Y (len 12345) where X is prefix of X+Y...
    # Easier: take block R of length 12345, place at pos 5000 and pos 10000 -> overlapping! Wait if we overlap arbitrarily they must agree on overlap!
    # An overlapping repeat of length L at shift d has period d on length L + d!
    # Pick period d = 5000, L = 12345 -> total span L + d = 17345
    period_part = rand_str(5000)
    planted_span = (period_part * 4)[:17345]  # repeat of length 12345 overlapping by 7345!
    t15 = rand_str(11000) + planted_span + rand_str(11655)  # len 40000

    # Medium test 11: planted repeat of length 40 in 300-char string
    rep40 = rand_str(40)
    t11 = rand_str(60) + rep40 + rand_str(100) + rep40 + rand_str(60)  # len 300

    tests = [
        # 3 public samples
        {"input": "banana", "expected": "3", "hidden": False, "checkBrute": True},
        {"input": "abcdef", "expected": "0", "hidden": False, "checkBrute": True},
        {"input": "abababa", "expected": "5", "hidden": False, "checkBrute": True},
        # 5 edge/corner cases
        {"input": "ab", "hidden": True, "checkBrute": True},
        {"input": "aa", "hidden": True, "checkBrute": True},
        {"input": LOWER, "hidden": True, "checkBrute": True},
        {"input": "a" * 40000, "hidden": True, "checkBrute": True},
        {"input": anti_ull_hash, "hidden": True, "checkBrute": True},  # Anti-ULL-hash Thue-Morse
        # 8 medium -> large tests (all cross-checked against exact Suffix Array + Kasai LCP!)
        {"input": "abc" * 10000, "hidden": True, "checkBrute": True},
        {"input": two_blocks, "hidden": True, "checkBrute": True},
        {"input": rand_str(100, "ab"), "hidden": True, "checkBrute": True},
        {"input": t11, "hidden": True, "checkBrute": True},
        {"input": make_fibonacci_string(2000), "hidden": True, "checkBrute": True},
        {"input": rand_str(40000), "hidden": True, "checkBrute": True},
        {"input": rand_str(40000, "ab"), "hidden": True, "checkBrute": True},
        {"input": t15, "hidden": True, "checkBrute": True},
    ]

    stress = [
        rand_str(rng.randint(2, 60), "abc")
        for _ in range(30)
    ]

    return {
        "slug": "cp03-longest-repeated-substring",
        "title": "Xâu con lặp lại dài nhất",
        "shortDescription": "Tìm độ dài lớn nhất của một xâu con liên tiếp xuất hiện ít nhất 2 lần (cho phép chồng lấn) bằng Binary Search và Double Rolling Hash.",
        "difficulty": "hard",
        "estimatedTime": 35,
        "skillId": "algo.string_processing",
        "tags": ["xâu", "hash", "tìm kiếm nhị phân", "tối ưu", "tầng 2"],
        "statement": r"""Cho một xâu $S$ độ dài $N$ chỉ gồm các chữ cái tiếng Anh viết thường (`'a'..'z'`).

Hãy tìm **độ dài lớn nhất** $L$ sao cho tồn tại ít nhất một xâu con liên tiếp độ dài $L$ xuất hiện ít nhất **2 lần** tại các vị trí bắt đầu khác nhau trong $S$ (**cho phép hai lần xuất hiện chồng lấn lên nhau**). Nếu không tồn tại xâu con lặp lại nào (mọi ký tự trong $S$ đều đôi một khác nhau), hãy in ra `0`.

### Dữ liệu vào
- Một dòng duy nhất chứa xâu $S$ chỉ gồm các ký tự `'a'..'z'`.

### Dữ liệu ra
- Một số nguyên duy nhất $L$ — độ dài lớn nhất của xâu con lặp lại.

### Ràng buộc
- $2 \le |S| \le 40\,000$.

### Subtasks
- **Subtask 1 (30%):** $|S| \le 500$.
- **Subtask 2 (70%):** $|S| \le 40\,000$.

### Giải thích ví dụ
- Với `"banana"`: Xâu con `"ana"` có độ dài $3$ xuất hiện tại vị trí $2$ và vị trí $4$ (chồng lấn tại chữ `'a'` thứ tư). Không có xâu con độ dài $\ge 4$ nào xuất hiện 2 lần $\rightarrow$ `3`.
- Với `"abcdef"`: Mọi ký tự đều khác nhau $\rightarrow$ `0`.
- Với `"abababa"`: Xâu con `"ababa"` độ dài $5$ xuất hiện tại vị trí $1$ và vị trí $3$ $\rightarrow$ `5`.""",
        "requirementsText": REQ_HEADER + "Độ phức tạp kỳ vọng: O(|S| log |S|) hoặc O(|S| log^2 |S|) dùng Tìm kiếm nhị phân trên đáp án + Double Rolling Hash (chống đụng độ băm đơn).",
        "hints": r"""**Gợi ý 1:** Bài toán có tính **đơn điệu**: nếu tồn tại xâu con độ dài $L$ xuất hiện ít nhất 2 lần thì mọi tiền tố độ dài $L-1$ của nó cũng xuất hiện ít nhất 2 lần. Ta có thể **tìm kiếm nhị phân** đáp án $L \in [0, N-1]$.

**Gợi ý 2:** Để kiểm tra xem có tồn tại hai xâu con độ dài $L$ giống nhau hay không trong $O(N)$ hoặc $O(N \log N)$, ta tiền xử lý mảng **Rolling Hash** (hàm băm đa thức tiền tố) để lấy mã băm của mọi đoạn $[i, i+L-1]$ trong $O(1)$, rồi kiểm tra xem có hai mã băm nào trùng nhau không.

**Gợi ý 3:** Dùng **Double Rolling Hash** với hai cặp cơ số và số nguyên tố modulo lớn khác nhau (ví dụ $M_1 = 10^9 + 7, B_1 = 311$ và $M_2 = 10^9 + 9, B_2 = 317$) rồi ghép thành một khóa 64-bit `(h1 << 32) | h2` để loại bỏ hoàn toàn nguy cơ đụng độ (như trên dãy Thue–Morse đánh bại băm `unsigned long long`).""",
        "cppSolution": r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    int n = (int)s.size();

    const long long M1 = 1000000007LL;
    const long long M2 = 1000000009LL;
    const long long B1 = 311LL;
    const long long B2 = 317LL;

    vector<long long> h1(n + 1, 0), h2(n + 1, 0), p1(n + 1, 1), p2(n + 1, 1);
    for (int i = 0; i < n; ++i) {
        long long v = (s[i] - 'a' + 1);
        h1[i + 1] = (h1[i] * B1 + v) % M1;
        h2[i + 1] = (h2[i] * B2 + v) % M2;
        p1[i + 1] = (p1[i] * B1) % M1;
        p2[i + 1] = (p2[i] * B2) % M2;
    }

    auto hasDuplicate = [&](int len) -> bool {
        if (len == 0) return true;
        int m = n - len + 1;
        vector<unsigned long long> keys(m);
        long long pw1 = p1[len], pw2 = p2[len];
        for (int i = 0; i < m; ++i) {
            long long x1 = (h1[i + len] - h1[i] * pw1 % M1 + M1) % M1;
            long long x2 = (h2[i + len] - h2[i] * pw2 % M2 + M2) % M2;
            keys[i] = ((unsigned long long)x1 << 32) | (unsigned long long)x2;
        }
        sort(keys.begin(), keys.end());
        for (int i = 1; i < m; ++i) {
            if (keys[i] == keys[i - 1]) return true;
        }
        return false;
    };

    int lo = 0, hi = n - 1, ans = 0;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (hasDuplicate(mid)) {
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
    s = data[0]
    n = len(s)

    M1 = 1000000007
    M2 = 1000000009
    B1 = 311
    B2 = 317

    h1 = [0] * (n + 1)
    h2 = [0] * (n + 1)
    p1 = [1] * (n + 1)
    p2 = [1] * (n + 1)

    v1 = 0
    v2 = 0
    w1 = 1
    w2 = 1
    for i, ch in enumerate(s):
        c = ord(ch) - 96
        v1 = (v1 * B1 + c) % M1
        v2 = (v2 * B2 + c) % M2
        w1 = (w1 * B1) % M1
        w2 = (w2 * B2) % M2
        h1[i + 1] = v1
        h2[i + 1] = v2
        p1[i + 1] = w1
        p2[i + 1] = w2

    def has_dup(length: int) -> bool:
        if length == 0:
            return True
        pw1 = p1[length]
        pw2 = p2[length]
        seen = set()
        seen_add = seen.add
        for i in range(n - length + 1):
            x1 = (h1[i + length] - h1[i] * pw1) % M1
            x2 = (h2[i + length] - h2[i] * pw2) % M2
            key = (x1 << 30) | x2
            if key in seen:
                return True
            seen_add(key)
        return False

    lo, hi, ans = 0, n - 1, 0
    while lo <= hi:
        mid = (lo + hi) >> 1
        if has_dup(mid):
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()""",
        "tests": tests,
        "brute": brute_p10_lrs,
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
    build_and_verify_pack(
        pack_id="03-strings-hashing",
        title="Tầng 1–2: Xử lý xâu ký tự, KMP & Rolling Hash",
        tier="Tầng 1–2 — Nền tảng & Lõi",
        description=(
            "10 bài xử lý xâu thi đấu: tần suất ký tự, nén RLE, đối xứng, "
            "gom nhóm anagram, truy vấn xâu con, KMP tìm mẫu, chu kỳ xâu và Rolling Hash."
        ),
        problems=problems,
    )


if __name__ == "__main__":
    main()
