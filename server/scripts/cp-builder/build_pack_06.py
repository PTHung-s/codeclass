"""
Builder & automated verifier for Pack 06:
  06-stack-queue-heap — Tầng 2: Ngăn xếp, Hàng đợi, Deque đơn điệu & Heap
"""

from __future__ import annotations

import random
from functools import lru_cache
from typing import Dict, List, Tuple

from pack_lib import build_and_verify_pack

REQ_HEADER = (
    "Time: 1s\n"
    "Memory: 256MB\n"
    "Nguồn: CodeClass CP Pack — Stack, Queue & Heap\n"
)

STRICT_MAX_BYTES = 150_000


# ============================================================================
# Shared deterministic test-generation helpers
# ============================================================================

def _gen_valid_bracket_string(rng: random.Random, pairs_count: int) -> str:
    """Generate a random valid bracket sequence with `pairs_count` pairs."""
    if pairs_count <= 0:
        return ""
    openers = "([{"
    closers = {"(": ")", "[": "]", "{": "}"}
    out: List[str] = []
    st: List[str] = []
    rem_open = pairs_count
    while rem_open > 0 or st:
        if rem_open == 0:
            out.append(closers[st.pop()])
        elif not st:
            ch = rng.choice(openers)
            st.append(ch)
            out.append(ch)
            rem_open -= 1
        else:
            # Bias opening vs closing to create rich nesting depths
            if rng.random() < 0.52:
                ch = rng.choice(openers)
                st.append(ch)
                out.append(ch)
                rem_open -= 1
            else:
                out.append(closers[st.pop()])
    return "".join(out)


def _gen_rpn_expr(
    rng: random.Random,
    num_operands: int,
    val_lo: int,
    val_hi: int,
    mul_prob: float = 0.12,
    style: str = "random",
    limit: int = 10**15,
) -> str:
    """Generate a valid RPN expression whose intermediates stay within [-limit, limit]."""
    assert num_operands >= 1
    tokens: List[str] = []
    stack: List[int] = []
    rem_nums = num_operands
    rem_ops = num_operands - 1

    def push_num() -> None:
        nonlocal rem_nums
        v = rng.randint(val_lo, val_hi)
        tokens.append(str(v))
        stack.append(v)
        rem_nums -= 1

    def push_op() -> None:
        nonlocal rem_ops
        b = stack.pop()
        a = stack.pop()
        candidates: List[Tuple[str, int]] = []
        if abs(a + b) <= limit:
            candidates.append(("+", a + b))
        if abs(a - b) <= limit:
            candidates.append(("-", a - b))
        if abs(a * b) <= limit and rng.random() < mul_prob:
            candidates.append(("*", a * b))
        if not candidates:
            # Fallback: pick whichever of + or - shrinks magnitude
            if abs(a + b) <= abs(a - b):
                op, res = "+", a + b
            else:
                op, res = "-", a - b
        else:
            op, res = rng.choice(candidates)
        tokens.append(op)
        stack.append(res)
        rem_ops -= 1

    if style == "deep":
        while rem_nums > 0:
            push_num()
        while rem_ops > 0:
            push_op()
    elif style == "flat":
        push_num()
        while rem_nums > 0:
            push_num()
            push_op()
    else:
        while rem_nums > 0 or rem_ops > 0:
            if len(stack) < 2:
                push_num()
            elif rem_nums == 0:
                push_op()
            else:
                if rng.random() < 0.52:
                    push_num()
                else:
                    push_op()

    assert len(stack) == 1
    assert abs(stack[0]) <= limit
    return f"{len(tokens)}\n" + " ".join(tokens)


# ============================================================================
# 1. cp06-valid-brackets-multi
# ============================================================================

def build_p01() -> Dict:
    rng = random.Random(601)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        string s;
        cin >> s;
        vector<char> st;
        st.reserve(s.size());
        bool ok = true;
        for (char c : s) {
            if (c == '(') st.push_back(')');
            else if (c == '[') st.push_back(']');
            else if (c == '{') st.push_back('}');
            else {
                if (st.empty() || st.back() != c) {
                    ok = false;
                    break;
                }
                st.pop_back();
            }
        }
        if (!st.empty()) ok = false;
        cout << (ok ? "YES\n" : "NO\n");
    }
    return 0;
}
"""

    py_sol = r"""
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    pair_close = {"(": ")", "[": "]", "{": "}"}
    out = []
    for idx in range(1, t + 1):
        s = data[idx]
        st = []
        ok = True
        for ch in s:
            expected = pair_close.get(ch)
            if expected is not None:
                st.append(expected)
            else:
                if not st or st[-1] != ch:
                    ok = False
                    break
                st.pop()
        out.append("YES" if ok and not st else "NO")
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()
"""

    def brute_brackets(inp: str) -> str:
        """Independent oracle: repeatedly erase adjacent (), [], {} pairs."""
        parts = inp.split()
        t = int(parts[0])
        res = []
        for s in parts[1 : t + 1]:
            if len(s) % 2 == 1:
                res.append("NO")
                continue
            cur = s
            while True:
                nxt = cur.replace("()", "").replace("[]", "").replace("{}", "")
                if len(nxt) == len(cur):
                    break
                cur = nxt
            res.append("YES" if cur == "" else "NO")
        return "\n".join(res)

    def fmt(cases: List[str]) -> str:
        return f"{len(cases)}\n" + "\n".join(cases)

    # Public samples (3)
    t1 = fmt(["()[]{}", "([{}])", "(]", "([)]", "{[]}"])
    t2 = fmt(["(", ")", "((()))", "[{()}]()", "]["])
    t3 = fmt(["({[()]})", "(([]){})", "({[}])", "(((", "{()}[{}]"])

    # Edge cases (5)
    t4 = fmt(["(", ")", "[", "]", "{", "}", "()", "[]", "{}"])
    t5 = fmt(["(()", "())", "[[]", "[]]", "{{}", "{}}", ")(", "][", "}{"])
    t6 = fmt(["([)]", "{[}]", "({)}", "[(])", "{(})", "[{]}", "([{}]))", "(([{}])"])
    t7 = fmt(["(" * 50 + ")" * 50, "[" * 49 + "]" * 50, "{" * 50 + "}" * 49, "()[]{}" * 15])
    # Subtle 1-char corruption in valid string
    base_valid = _gen_valid_bracket_string(rng, 25)
    corrupt_mid = list(base_valid)
    mid = len(corrupt_mid) // 2
    corrupt_mid[mid] = ")" if corrupt_mid[mid] != ")" else "]"
    t8 = fmt([base_valid, "".join(corrupt_mid), base_valid + "(", ")" + base_valid])

    # Medium -> Large tests (8), all strictly < 150KB
    # t9: 100 mixed strings len ~100
    cases9 = []
    for i in range(100):
        s = _gen_valid_bracket_string(rng, rng.randint(10, 60))
        if i % 2 == 1:
            pos = rng.randrange(len(s))
            alt = rng.choice([c for c in "()[]{}" if c != s[pos]])
            s = s[:pos] + alt + s[pos + 1 :]
        cases9.append(s)
    t9 = fmt(cases9)

    # t10: 500 strings total ~30,000
    cases10 = []
    for i in range(500):
        s = _gen_valid_bracket_string(rng, rng.randint(10, 40))
        if i % 3 == 0:
            pos = rng.randrange(len(s))
            s = s[:pos] + rng.choice("()[]{}") + s[pos + 1 :]
        cases10.append(s)
    t10 = fmt(cases10)

    # t11: Single deep valid string of length 100,000
    half = "".join(rng.choice("([{") for _ in range(50_000))
    cmap = {"(": ")", "[": "]", "{": "}"}
    t11 = fmt([half + "".join(cmap[c] for c in reversed(half))])

    # t12: Single deep string of length 100,000 with 1 swapped bracket at the center
    half2 = list(half)
    tail2 = [cmap[c] for c in reversed(half2)]
    tail2[0] = ")" if tail2[0] != ")" else "]"
    t12 = fmt(["".join(half2) + "".join(tail2)])

    # t13: Single flat concatenated valid string of length 100,000
    chunks13 = [_gen_valid_bracket_string(rng, 250) for _ in range(200)]
    t13 = fmt(["".join(chunks13)])

    # t14: Worst-case long unclosed opens & closes, total length 99,998 <= 10^5
    t14 = fmt(["(" * 25_000 + ")" * 24_999, "[" * 24_999 + "]" * 25_000])

    # t15: 500 strings totaling ~95,000 chars
    cases15 = []
    for i in range(500):
        s = _gen_valid_bracket_string(rng, 95)
        if i % 2 == 0 and i % 4 != 0:
            pos = rng.randrange(len(s))
            alt = rng.choice([c for c in "()[]{}" if c != s[pos]])
            s = s[:pos] + alt + s[pos + 1 :]
        cases15.append(s)
    t15 = fmt(cases15)

    # t16: 400 strings totaling ~98,000 chars (varied depths + tricky near-valid)
    cases16 = []
    for i in range(400):
        pairs = 120 if i < 395 else 130
        s = _gen_valid_bracket_string(rng, pairs)
        if i % 3 == 1:
            # Swap two adjacent differing chars
            for j in range(len(s) - 1):
                if s[j] != s[j + 1]:
                    s = s[:j] + s[j + 1] + s[j] + s[j + 2 :]
                    break
        cases16.append(s)
    t16 = fmt(cases16)

    tests = [
        {"input": t1, "hidden": False, "expected": "YES\nYES\nNO\nNO\nYES", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "NO\nNO\nYES\nYES\nNO", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "YES\nYES\nNO\nNO\nYES", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = []
    for _ in range(15):
        batch = []
        for __ in range(12):
            if rng.random() < 0.5:
                batch.append(_gen_valid_bracket_string(rng, rng.randint(1, 15)))
            else:
                L = rng.randint(1, 20)
                batch.append("".join(rng.choice("()[]{}") for _ in range(L)))
        stress.append(fmt(batch))

    return {
        "slug": "cp06-valid-brackets-multi",
        "title": "Kiểm tra đa dạng dãy ngoặc cân bằng",
        "shortDescription": "Kiểm tra tính cân bằng hợp lệ của nhiều xâu chứa ba loại dấu ngoặc (), [], {} bằng ngăn xếp.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.stack_queue",
        "tags": ["ngăn xếp", "xâu", "tầng 2"],
        "statement": (
            "Một trình phân tích cú pháp cần kiểm tra hàng loạt biểu thức chỉ giữ lại các dấu ngoặc gồm ba cặp: "
            "ngoặc tròn `()`, ngoặc vuông `[]` và ngoặc nhọn `{}`.\n\n"
            "Một xâu $S$ được gọi là **dãy ngoặc cân bằng hợp lệ** nếu thỏa mãn đồng thời các điều kiện sau:\n"
            "1. Mọi dấu ngoặc mở đều phải được đóng bởi đúng dấu ngoặc đóng cùng loại.\n"
            "2. Các cặp ngoặc phải được đóng theo đúng thứ tự lồng nhau (dấu mở sau cùng phải được đóng trước tiên).\n"
            "3. Không còn dấu ngoặc mở nào chưa được đóng khi kết thúc xâu.\n\n"
            "Cho $T$ xâu $S_1, S_2, \\dots, S_T$. Hãy xác định với mỗi xâu xem nó có phải là dãy ngoặc cân bằng hợp lệ hay không.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $T$ ($1 \\le T \\le 500$) — số lượng xâu cần kiểm tra.\n"
            "- $T$ dòng tiếp theo, dòng thứ $i$ chứa một xâu khác rỗng $S_i$ chỉ gồm các ký tự `(`, `)`, `[`, `]`, `{`, `}`.\n\n"
            "### Kết quả\n"
            "- In ra $T$ dòng; dòng thứ $i$ ghi `YES` nếu $S_i$ hợp lệ, ngược lại ghi `NO`.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le T \\le 500$.\n"
            "- $|S_i| \\ge 1$ với mọi $i$ và tổng độ dài $\\sum_{i=1}^{T} |S_i| \\le 10^5$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Ngăn xếp (Stack) — Độ phức tạp mục tiêu O(∑|S|).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Khi duyệt xâu từ trái sang phải, dấu ngoặc đóng vừa gặp bắt buộc phải khớp với dấu ngoặc mở *gần nhất chưa được đóng*. Quy tắc \"vào sau ra trước\" (LIFO) chính là bản chất của ngăn xếp.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Duy trì một ngăn xếp ký tự. Khi gặp ngoặc mở `(`, `[`, `{`, đẩy nó (hoặc trực tiếp đẩy ký tự đóng tương ứng `)`, `]`, `}`) vào ngăn xếp. Khi gặp ngoặc đóng, kiểm tra ngăn xếp có khác rỗng và phần tử đỉnh có khớp không; nếu khớp thì loại đỉnh ngăn xếp, ngược lại kết luận ngay `NO`.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Đừng quên kiểm tra `stack.empty()` sau khi duyệt hết xâu (xử lý trường hợp dư ngoặc mở như `(((` hoặc `(()`). Nếu đẩy trực tiếp ký tự đóng kỳ vọng vào ngăn xếp, đoạn so khớp chỉ cần kiểm tra `st.back() == c` rất gọn."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_brackets,
        "extraStressInputs": stress,
    }


# ============================================================================
# 2. cp06-evaluate-rpn
# ============================================================================

def build_p02() -> Dict:
    rng = random.Random(602)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> st;
    st.reserve(n);
    for (int i = 0; i < n; ++i) {
        string tok;
        cin >> tok;
        if (tok == "+" || tok == "-" || tok == "*") {
            long long b = st.back(); st.pop_back();
            long long a = st.back(); st.pop_back();
            if (tok == "+") st.push_back(a + b);
            else if (tok == "-") st.push_back(a - b);
            else st.push_back(a * b);
        } else {
            st.push_back(stoll(tok));
        }
    }
    cout << st.back() << '\n';
    return 0;
}
"""

    py_sol = r"""
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    st = []
    for tok in data[1 : n + 1]:
        if tok == "+":
            b = st.pop()
            a = st.pop()
            st.append(a + b)
        elif tok == "-":
            b = st.pop()
            a = st.pop()
            st.append(a - b)
        elif tok == "*":
            b = st.pop()
            a = st.pop()
            st.append(a * b)
        else:
            st.append(int(tok))
    sys.stdout.write(f"{st[-1]}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_rpn(inp: str) -> str:
        """Independent oracle: repeatedly reduce the leftmost (num, num, op) triple."""
        parts = inp.split()
        n = int(parts[0])
        seq: List[object] = [
            tok if tok in ("+", "-", "*") else int(tok)
            for tok in parts[1 : n + 1]
        ]
        while len(seq) > 1:
            reduced = False
            for i in range(len(seq) - 2):
                if isinstance(seq[i], int) and isinstance(seq[i + 1], int) and isinstance(seq[i + 2], str):
                    a, b, op = seq[i], seq[i + 1], seq[i + 2]
                    val = a + b if op == "+" else (a - b if op == "-" else a * b)
                    seq[i : i + 3] = [val]
                    reduced = True
                    break
            assert reduced, "Invalid RPN expression"
        return str(seq[0])

    # Public samples (3)
    t1 = "5\n2 1 + 3 *"              # (2 + 1) * 3 = 9
    t2 = "5\n10 3 - 4 *"             # (10 - 3) * 4 = 28
    t3 = "7\n5 -2 4 * + 10 -"        # (5 + (-2)*4) - 10 = -13

    # Edge / overflow cases (5)
    t4 = "1\n-1000000000"            # Single negative token
    t5 = "3\n3 10 -"                 # Non-commutative subtraction -> -7
    t6 = "5\n1000000 1000000 * 1000 *"       # 10^15 positive 64-bit boundary
    t7 = "5\n-1000000 1000000 * 1000 *"      # -10^15 negative 64-bit boundary
    t8 = "11\n1000000000 1000000000 + 500000 * 0 * 42 - -7 +"  # Huge intermediate -> zeroed -> -35

    # Medium -> Large tests (8)
    t9 = _gen_rpn_expr(rng, 60, -50, 50, mul_prob=0.18, style="random")
    t10 = _gen_rpn_expr(rng, 250, -100, 100, mul_prob=0.15, style="deep")
    t11 = _gen_rpn_expr(rng, 500, -1000, 1000, mul_prob=0.12, style="flat")
    t12 = _gen_rpn_expr(rng, 2000, -10000, 10000, mul_prob=0.10, style="random")
    t13 = _gen_rpn_expr(rng, 5000, -100000, 100000, mul_prob=0.08, style="random")
    # Deep stack of 9999 operands + 9998 ops = 19,997 tokens
    t14 = _gen_rpn_expr(rng, 9999, -500, 500, mul_prob=0.05, style="deep")
    # Flat expression of 10,000 operands + 9,999 ops = 19,999 tokens
    t15 = _gen_rpn_expr(rng, 10000, -999, 999, mul_prob=0.06, style="flat")
    # Mixed max size 19,999 tokens with large operands
    t16 = _gen_rpn_expr(rng, 10000, -99999, 99999, mul_prob=0.04, style="random")

    tests = [
        {"input": t1, "hidden": False, "expected": "9", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "28", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "-13", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True, "checkBrute": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        _gen_rpn_expr(rng, rng.randint(2, 40), -20, 20, mul_prob=0.25, style=rng.choice(["random", "deep", "flat"]))
        for _ in range(25)
    ]

    return {
        "slug": "cp06-evaluate-rpn",
        "title": "Định giá biểu thức hậu tố (RPN)",
        "shortDescription": "Tính giá trị biểu thức ký pháp Ba Lan ngược gồm số nguyên và ba phép toán +, -, * bằng ngăn xếp.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.stack_queue",
        "tags": ["ngăn xếp", "cài đặt", "tầng 2"],
        "statement": (
            "**Ký pháp Ba Lan ngược (Reverse Polish Notation — RPN)** đặt toán tử ngay sau hai toán hạng của nó, "
            "giúp biểu diễn mọi biểu thức số học hoàn toàn rõ ràng mà không cần dùng dấu ngoặc.\n\n"
            "Cho một biểu thức hậu tố hợp lệ gồm $N$ token cách nhau bởi dấu cách. Mỗi token là một số nguyên hoặc "
            "một trong ba toán tử hai ngôi `+`, `-`, `*`. Quy tắc tính toán từ trái sang phải như sau:\n"
            "- Khi gặp số nguyên, ta lưu giá trị đó chờ tính toán.\n"
            "- Khi gặp toán tử $\\text{op} \\in \\{+, -, *\\}$, ta lấy ra hai giá trị gần nhất chưa dùng: gọi $b$ là giá trị "
            "vừa xuất hiện gần nhất (đỉnh ngăn xếp) và $a$ là giá trị ngay trước $b$, sau đó thay cả hai bằng kết quả "
            "$a \\;\\text{op}\\; b$ (chú ý thứ tự $a - b$ với phép trừ).\n\n"
            "Hãy tính giá trị cuối cùng của biểu thức.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $N$ ($1 \\le N \\le 20\\,000$, $N$ lẻ) — số lượng token.\n"
            "- Dòng thứ hai gồm $N$ token phân tách bằng dấu cách.\n\n"
            "### Kết quả\n"
            "- In ra một số nguyên duy nhất là giá trị của biểu thức.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le N \\le 20\\,000$.\n"
            "- Biểu thức luôn hợp lệ; mỗi toán hạng ban đầu có trị tuyệt đối $\\le 10^9$.\n"
            "- Mọi giá trị trung gian và kết quả cuối cùng đều nằm trong đoạn $[-10^{15}, 10^{15}]$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Ngăn xếp (Stack) & kiểu 64-bit — Độ phức tạp mục tiêu O(N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Duyệt lần lượt từng token từ trái sang phải. Số nguyên thì cất vào ngăn xếp; toán tử thì rút đúng 2 phần tử trên cùng để tính và đẩy kết quả ngược trở lại.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Cẩn thận thứ tự hai toán hạng khi rút khỏi ngăn xếp: phần tử rút đầu tiên là toán hạng **bên phải** `b`, phần tử rút thứ hai là toán hạng **bên trái** `a`. Kết quả phép trừ phải là `a - b`, không phải `b - a`.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Đừng kiểm tra toán tử bằng `tok[0] == '-'` vì số âm như `-5` cũng bắt đầu bằng dấu `-`! Hãy so sánh nguyên xâu `tok == \"-\"` và dùng kiểu số nguyên 64-bit (`long long` trong C++) vì kết quả có thể đạt $\\pm 10^{15}$."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_rpn,
        "extraStressInputs": stress,
    }


# ============================================================================
# 3. cp06-connect-ropes-min-cost
# ============================================================================

def build_p03() -> Dict:
    rng = random.Random(603)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    priority_queue<long long, vector<long long>, greater<long long>> pq;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        pq.push(x);
    }
    long long totalCost = 0;
    while (pq.size() > 1) {
        long long a = pq.top(); pq.pop();
        long long b = pq.top(); pq.pop();
        long long merged = a + b;
        totalCost += merged;
        pq.push(merged);
    }
    cout << totalCost << '\n';
    return 0;
}
"""

    py_sol = r"""
import heapq
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    heap = [int(x) for x in data[1 : n + 1]]
    heapq.heapify(heap)
    total = 0
    while len(heap) > 1:
        a = heapq.heappop(heap)
        b = heapq.heappop(heap)
        s = a + b
        total += s
        heapq.heappush(heap, s)
    sys.stdout.write(f"{total}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_ropes(inp: str) -> str:
        """Exact exhaustive search over all merge orders for N<=7; sort-simulation for larger N."""
        parts = inp.split()
        n = int(parts[0])
        arr = [int(x) for x in parts[1 : n + 1]]
        if n <= 1:
            return "0"
        if n <= 7:
            @lru_cache(maxsize=None)
            def dp(state: Tuple[int, ...]) -> int:
                m = len(state)
                if m == 1:
                    return 0
                best = 10**30
                for i in range(m):
                    for j in range(i + 1, m):
                        cost = state[i] + state[j]
                        nxt = list(state[:i] + state[i + 1 : j] + state[j + 1 :])
                        nxt.append(cost)
                        nxt.sort()
                        cand = cost + dp(tuple(nxt))
                        if cand < best:
                            best = cand
                return best

            return str(dp(tuple(sorted(arr))))
        # Independent O(N^2 log N) simulation without heap
        cur = sorted(arr)
        total = 0
        while len(cur) > 1:
            s = cur[0] + cur[1]
            total += s
            cur = cur[2:]
            cur.append(s)
            cur.sort()
        return str(total)

    def fmt(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    # Public samples (3)
    t1 = fmt([4, 3, 2, 6])           # 2+3=5, 4+5=9, 6+9=15 -> 29
    t2 = fmt([1, 2, 5, 10, 35, 89])  # 3+8+18+53+142 = 224
    t3 = fmt([100])                  # N = 1 -> 0

    # Edge / overflow cases (5)
    t4 = fmt([1000000, 1000000])
    t5 = fmt([5, 5, 5, 5, 5, 5, 5])
    t6 = fmt([1, 1, 2, 3, 5, 8, 13])  # Fibonacci weights
    t7 = fmt([1000000] * 100)         # Overflow check on small N (> 6.7e8)
    t8 = fmt([1000000] * 1000)        # Definitely exceeds 32-bit int (> 9.9e9)

    # Medium -> Large tests (8), strictly < 150KB
    t9 = fmt([rng.randint(1, 50) for _ in range(150)])
    t10 = fmt([rng.randint(1, 10000) for _ in range(2000)])
    t11 = fmt(list(range(1, 8001)))                             # Strictly increasing
    t12 = fmt(list(range(8000, 0, -1)))                         # Strictly decreasing
    t13 = fmt([1] * 29999 + [1000000])                          # Extreme outlier + 30k elements
    t14 = fmt([1000000] * 18000)                                # Max values, 144KB, cost ~2.6e11
    t15 = fmt([rng.randint(1, 999999) for _ in range(19000)])   # Large random near 10^6, ~131KB
    t16 = fmt([rng.randint(1, 9999) for _ in range(30000)])     # Max N=30,000, ~146KB

    tests = [
        {"input": t1, "hidden": False, "expected": "29", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "224", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "0", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        fmt([rng.randint(1, 30) for _ in range(rng.randint(1, 7))])
        for _ in range(20)
    ] + [
        fmt([rng.randint(1, 1000) for _ in range(rng.randint(20, 80))])
        for _ in range(10)
    ]

    return {
        "slug": "cp06-connect-ropes-min-cost",
        "title": "Nối dây với chi phí tối thiểu",
        "shortDescription": "Tìm tổng chi phí nhỏ nhất để nối N sợi dây thành một sợi duy nhất bằng thuật toán tham lam Huffman và Min-Heap.",
        "difficulty": "easy",
        "estimatedTime": 20,
        "skillId": "algo.heap_priority_queue",
        "tags": ["heap", "tham lam", "tầng 2"],
        "statement": (
            "Một xưởng cáp có $N$ sợi dây rời nhau với độ dài lần lượt là $a_1, a_2, \\dots, a_N$. "
            "Người thợ cần nối tất cả $N$ sợi dây này thành **một sợi dây duy nhất**.\n\n"
            "Ở mỗi thao tác, người thợ chọn hai sợi dây bất kỳ có độ dài $x$ và $y$, nối chúng lại để thu được "
            "một sợi dây mới có độ dài $x + y$; chi phí của thao tác này bằng đúng $x + y$. "
            "Nếu ban đầu chỉ có $N = 1$ sợi dây thì không cần thực hiện thao tác nào và tổng chi phí là $0$.\n\n"
            "Hãy tìm tổng chi phí nhỏ nhất để nối toàn bộ $N$ sợi dây lại thành một.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $N$ ($1 \\le N \\le 30\\,000$).\n"
            "- Dòng thứ hai gồm $N$ số nguyên dương $a_1, a_2, \\dots, a_N$ ($1 \\le a_i \\le 10^6$).\n\n"
            "### Kết quả\n"
            "- In ra một số nguyên duy nhất là tổng chi phí nhỏ nhất.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le N \\le 30\\,000$.\n"
            "- $1 \\le a_i \\le 10^6$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Tham lam Huffman & Hàng đợi ưu tiên (Min-Heap) — Độ phức tạp mục tiêu O(N log N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Mỗi sợi dây ban đầu sẽ đóng góp vào tổng chi phí số lần đúng bằng số lần nó bị gộp. Vì vậy, những sợi dây dài nên được gộp muộn nhất có thể, còn hai sợi ngắn nhất nên được gộp sớm nhất.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Đây là bài toán cây Huffman kinh điển: ở mỗi bước, luôn chọn **hai sợi dây ngắn nhất hiện có**, cộng tổng của chúng vào đáp án rồi đưa sợi dây mới vừa tạo trở lại tập hợp. Dùng **Min-Heap** (`priority_queue` đảo dấu hoặc `greater<long long>` trong C++, `heapq` trong Python) để lấy hai phần tử nhỏ nhất và chèn phần tử mới trong $O(\\log N)$.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Lặp trong khi kích thước heap `> 1` (tự động trả về `0` khi $N = 1$). Tổng chi phí có thể vượt $4 \\times 10^{11}$, vượt xa giới hạn 32-bit `int`, do đó cả heap lẫn biến tổng phải dùng kiểu `long long`."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_ropes,
        "extraStressInputs": stress,
    }


# ============================================================================
# 4. cp06-next-greater-element
# ============================================================================

def build_p04() -> Dict:
    rng = random.Random(604)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n), ans(n, -1);
    for (int i = 0; i < n; ++i) cin >> a[i];

    vector<int> st;
    st.reserve(n);
    for (int i = 0; i < n; ++i) {
        while (!st.empty() && a[st.back()] < a[i]) {
            ans[st.back()] = a[i];
            st.pop_back();
        }
        st.push_back(i);
    }

    for (int i = 0; i < n; ++i) {
        if (i) cout << ' ';
        cout << ans[i];
    }
    cout << '\n';
    return 0;
}
"""

    py_sol = r"""
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1 : n + 1]]
    ans = [-1] * n
    st = []
    for i, val in enumerate(a):
        while st and a[st[-1]] < val:
            ans[st.pop()] = val
        st.append(i)
    sys.stdout.write(" ".join(map(str, ans)) + "\n")


if __name__ == "__main__":
    solve()
"""

    def brute_nge(inp: str) -> str:
        parts = inp.split()
        n = int(parts[0])
        a = [int(x) for x in parts[1 : n + 1]]
        ans = [-1] * n
        for i in range(n):
            for j in range(i + 1, n):
                if a[j] > a[i]:
                    ans[i] = a[j]
                    break
        return " ".join(map(str, ans))

    def fmt(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    # Public samples (3)
    t1 = fmt([4, 5, 2, 10, 8])            # 5 10 10 -1 -1
    t2 = fmt([3, 3, 2, 4, 4, 1])          # 4 4 4 -1 -1 -1
    t3 = fmt([-5, -2, -2, -1, 0])         # -2 -1 -1 0 -1

    # Edge cases (5)
    t4 = fmt([42])
    t5 = fmt([7, 7, 7, 7, 7, 7])
    t6 = fmt([-1000000000, 1000000000, -1000000000, 0, 1000000000])
    t7 = fmt([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    t8 = fmt([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    # Medium -> Large tests (8), keeping BOTH input and output < 150KB
    t9 = fmt([rng.randint(-50, 50) for _ in range(300)])
    t10 = fmt([rng.randint(-1000, 1000) for _ in range(1500)])
    # Strictly decreasing with giant element at the end (worst case stack depth = N-1)
    t11 = fmt(list(range(15000, 1, -1)) + [20000])
    # Strictly increasing N=20,000
    t12 = fmt(list(range(1, 20001)))
    # Strictly decreasing N=20,000 (all -1 output)
    t13 = fmt(list(range(20000, 0, -1)))
    # Heavy duplicates N=20,000
    t14 = fmt([rng.choice([-100, -1, 0, 1, 5, 5, 100]) for _ in range(20000)])
    # Full range [-10^9, 10^9] with N=11,500 (~128KB in, ~128KB out)
    t15 = fmt([rng.randint(-10**9, 10**9) for _ in range(11500)])
    # Sawtooth + random peaks N=20,000, values in [-99999, 99999] (~132KB)
    t16 = fmt([rng.randint(-99999, 99999) for _ in range(20000)])

    tests = [
        {"input": t1, "hidden": False, "expected": "5 10 10 -1 -1", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "4 4 4 -1 -1 -1", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "-2 -1 -1 0 -1", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        fmt([rng.randint(-10, 10) for _ in range(rng.randint(1, 80))])
        for _ in range(25)
    ]

    return {
        "slug": "cp06-next-greater-element",
        "title": "Phần tử lớn hơn đầu tiên bên phải",
        "shortDescription": "Tìm phần tử đầu tiên lớn hơn hẳn nằm về phía bên phải cho mọi vị trí trong mảng bằng Monotonic Stack.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.monotonic_stack_deque",
        "tags": ["ngăn xếp", "monotonic stack", "tầng 2"],
        "statement": (
            "Cho mảng $A$ gồm $N$ số nguyên $a_1, a_2, \\dots, a_N$. Với mỗi chỉ số $i$ ($1 \\le i \\le N$), "
            "hãy tìm giá trị của phần tử **đầu tiên** $a_j$ nằm bên phải vị trí $i$ ($j > i$) sao cho $a_j > a_i$ "
            "(lớn hơn hẳn).\n\n"
            "Nếu không tồn tại vị trí $j > i$ nào thỏa mãn $a_j > a_i$, giá trị cần in ra tại vị trí $i$ là `-1`.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $N$ ($1 \\le N \\le 30\\,000$).\n"
            "- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \\dots, a_N$ ($|a_i| \\le 10^9$).\n\n"
            "### Kết quả\n"
            "- In ra $N$ số nguyên trên một dòng, cách nhau bởi dấu cách, trong đó số thứ $i$ là kết quả ứng với vị trí $i$.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le N \\le 30\\,000$.\n"
            "- $-10^9 \\le a_i \\le 10^9$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Ngăn xếp đơn điệu (Monotonic Stack) — Độ phức tạp mục tiêu O(N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Duyệt mảng từ trái sang phải và giữ danh sách những vị trí *chưa tìm thấy* phần tử lớn hơn bên phải. Khi gặp một phần tử $a_i$ mới, nó sẽ lập tức trở thành đáp án cho tất cả những vị trí đang chờ có giá trị nhỏ hơn hẳn $a_i$.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Duy trì một ngăn xếp lưu **chỉ số** sao cho giá trị $a_{\\text{idx}}$ tương ứng trong ngăn xếp luôn giảm dần (không tăng) từ đáy lên đỉnh. Tại vị trí $i$, lặp `while (!st.empty() && a[st.back()] < a[i])`, gán `ans[st.back()] = a[i]` rồi loại đỉnh ngăn xếp, sau đó đẩy $i$ vào.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Mỗi chỉ số được đẩy vào và lấy ra khỏi ngăn xếp tối đa một lần nên tổng độ phức tạp là $O(N)$. Chú ý điều kiện so sánh là **nghiêm ngặt** `<` để hai phần tử bằng nhau không bị nhận nhầm là lớn hơn nhau; khởi tạo toàn bộ mảng `ans` bằng `-1`."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_nge,
        "extraStressInputs": stress,
    }


# ============================================================================
# 5. cp06-sliding-window-maximum
# ============================================================================

def build_p05() -> Dict:
    rng = random.Random(605)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    if (!(cin >> n >> k)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    deque<int> dq;
    long long sumMax = 0;
    long long minOfMax = LLONG_MAX;
    for (int i = 0; i < n; ++i) {
        while (!dq.empty() && dq.front() <= i - k) dq.pop_front();
        while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back();
        dq.push_back(i);
        if (i >= k - 1) {
            long long curMax = a[dq.front()];
            sumMax += curMax;
            if (curMax < minOfMax) minOfMax = curMax;
        }
    }
    cout << sumMax << ' ' << minOfMax << '\n';
    return 0;
}
"""

    py_sol = r"""
from collections import deque
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    a = [int(x) for x in data[2 : n + 2]]

    dq = deque()
    sum_max = 0
    min_of_max = None
    for i, val in enumerate(a):
        while dq and dq[0] <= i - k:
            dq.popleft()
        while dq and a[dq[-1]] <= val:
            dq.pop()
        dq.append(i)
        if i >= k - 1:
            cur = a[dq[0]]
            sum_max += cur
            if min_of_max is None or cur < min_of_max:
                min_of_max = cur
    sys.stdout.write(f"{sum_max} {min_of_max}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_swm(inp: str) -> str:
        parts = inp.split()
        n = int(parts[0])
        k = int(parts[1])
        a = [int(x) for x in parts[2 : n + 2]]
        maxes = [max(a[i : i + k]) for i in range(n - k + 1)]
        return f"{sum(maxes)} {min(maxes)}"

    def fmt(k: int, arr: List[int]) -> str:
        return f"{len(arr)} {k}\n" + " ".join(map(str, arr))

    # Public samples (3)
    # Windows of [1,3,-1,-3,5,3,6,7], K=3: [3, 3, 5, 5, 6, 7] -> sum=29, min=3
    t1 = fmt(3, [1, 3, -1, -3, 5, 3, 6, 7])
    # All negative: [-5, -2, -8, -1, -4], K=2 -> [-2, -2, -1, -1] -> sum=-6, min=-2
    t2 = fmt(2, [-5, -2, -8, -1, -4])
    # K = N: [4, -1, 9, 2], K=4 -> [9] -> sum=9, min=9
    t3 = fmt(4, [4, -1, 9, 2])

    # Edge cases (5)
    t4 = fmt(1, [-1000000000])
    t5 = fmt(1, [5, -3, 10, 0, -7, 8])
    t6 = fmt(4, [7, 7, 7, 7, 7, 7, 7])
    t7 = fmt(5, [-1000000000] * 12)
    t8 = fmt(3, [1000000000, -1000000000] * 15)

    # Medium -> Large tests (8), strictly < 150KB
    t9 = fmt(17, [rng.randint(-100, 100) for _ in range(300)])
    t10 = fmt(250, [rng.randint(-5000, 5000) for _ in range(2500)])
    # Strictly decreasing N=20,000, K=5000 (deque stays full size K!)
    t11 = fmt(5000, list(range(20000, 0, -1)))
    # Strictly increasing N=20,000, K=5000 (deque stays size 1)
    t12 = fmt(5000, list(range(1, 20001)))
    # Full range ±10^9 overflow test (N=12,000, K=100, sum ~ 1.1e13)
    t13 = fmt(100, [rng.randint(5 * 10**8, 10**9) for _ in range(12000)])
    # Full negative ±10^9 test (N=12,000, K=300)
    t14 = fmt(300, [rng.randint(-10**9, -10**8) for _ in range(12000)])
    # Sawtooth pattern N=25,000, K=1000
    t15 = fmt(1000, [(i % 997) - 500 for i in range(25000)])
    # Max N=25,000 random values in [-9999, 9999] (~138KB)
    t16 = fmt(1234, [rng.randint(-9999, 9999) for _ in range(25000)])

    tests = [
        {"input": t1, "hidden": False, "expected": "29 3", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "-6 -2", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "9 9", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = []
    for _ in range(25):
        n = rng.randint(1, 60)
        k = rng.randint(1, n)
        arr = [rng.randint(-20, 20) for _ in range(n)]
        stress.append(fmt(k, arr))

    return {
        "slug": "cp06-sliding-window-maximum",
        "title": "Giá trị lớn nhất trên cửa sổ trượt",
        "shortDescription": "Tính tổng và giá trị nhỏ nhất của các cực đại trên mọi cửa sổ liên tiếp độ dài K bằng Deque đơn điệu.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.monotonic_stack_deque",
        "tags": ["deque", "cửa sổ trượt", "tối ưu", "tầng 2"],
        "statement": (
            "Một hệ thống giám sát ghi lại lưu lượng mạng qua $N$ giây liên tiếp dưới dạng mảng số nguyên "
            "$a_1, a_2, \\dots, a_N$. Với kích thước cửa sổ $K$ ($1 \\le K \\le N$), xét tất cả $N - K + 1$ "
            "cửa sổ liên tiếp độ dài $K$; gọi\n"
            "$$M_i = \\max(a_i, a_{i+1}, \\dots, a_{i+K-1}) \\quad (1 \\le i \\le N - K + 1)$$\n"
            "là giá trị lớn nhất trong cửa sổ thứ $i$.\n\n"
            "Để kiểm định toàn bộ chuỗi cực đại này một cách gọn nhẹ, hãy tính và in ra hai số nguyên:\n"
            "1. Tổng tất cả cực đại cửa sổ: $S = \\sum_{i=1}^{N-K+1} M_i$.\n"
            "2. Giá trị nhỏ nhất trong các cực đại đó: $P = \\min_{1 \\le i \\le N-K+1} M_i$.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm hai số nguyên dương $N$ và $K$ ($1 \\le K \\le N \\le 25\\,000$).\n"
            "- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \\dots, a_N$ ($|a_i| \\le 10^9$).\n\n"
            "### Kết quả\n"
            "- In ra đúng hai số nguyên $S$ và $P$ trên một dòng, cách nhau bởi dấu cách.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le K \\le N \\le 25\\,000$.\n"
            "- $-10^9 \\le a_i \\le 10^9$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Hàng đợi hai đầu đơn điệu (Monotonic Deque) — Độ phức tạp mục tiêu O(N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Nếu hai phần tử $a_p$ và $a_q$ cùng nằm trong một cửa sổ với $p < q$ và $a_p \\le a_q$, thì $a_p$ sẽ không bao giờ có cơ hội trở thành cực đại của cửa sổ hiện tại hay bất kỳ cửa sổ nào sau đó nữa — ta có thể loại bỏ $a_p$ ngay lập tức.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Dùng **Deque** lưu các **chỉ số** ứng viên sao cho giá trị $a_{\\text{idx}}$ giảm dần nghiêm ngặt từ đầu đến cuối deque. Tại mỗi bước $i$: (1) loại đầu deque nếu chỉ số $\\le i - K$ (hết hạn); (2) loại cuối deque chừng nào $a_{\\text{back}} \\le a_i$; (3) đẩy $i$ vào cuối deque. Khi $i \\ge K - 1$, cực đại cửa sổ hiện tại chính là $a_{\\text{front}}$.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Vì mọi phần tử có thể âm (tới $-10^9$), cần khởi tạo biến tìm $\\min M_i$ bằng `LLONG_MAX` (hoặc giá trị cửa sổ đầu tiên), tuyệt đối không khởi tạo bằng `0`. Biến tổng $S$ có thể tới $\\pm 2.5 \\times 10^{13}$ nên bắt buộc dùng kiểu `long long`."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_swm,
        "extraStressInputs": stress,
    }


# ============================================================================
# 6. cp06-running-median-two-heaps
# ============================================================================

def build_p06() -> Dict:
    rng = random.Random(606)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    priority_queue<long long> low;
    priority_queue<long long, vector<long long>, greater<long long>> high;

    long long sumMed = 0;
    long long lastMed = 0;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        if (low.empty() || x <= low.top()) {
            low.push(x);
        } else {
            high.push(x);
        }
        if (low.size() > high.size() + 1) {
            high.push(low.top());
            low.pop();
        } else if (low.size() < high.size()) {
            low.push(high.top());
            high.pop();
        }
        lastMed = low.top();
        sumMed += lastMed;
    }
    cout << sumMed << ' ' << lastMed << '\n';
    return 0;
}
"""

    py_sol = r"""
import heapq
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    low = []   # Max-heap via negated values; size == ceil(i / 2)
    high = []  # Min-heap; size == floor(i / 2)
    sum_med = 0
    last_med = 0
    for tok in data[1 : n + 1]:
        x = int(tok)
        if not low or x <= -low[0]:
            heapq.heappush(low, -x)
        else:
            heapq.heappush(high, x)
        if len(low) > len(high) + 1:
            heapq.heappush(high, -heapq.heappop(low))
        elif len(low) < len(high):
            heapq.heappush(low, -heapq.heappop(high))
        last_med = -low[0]
        sum_med += last_med
    sys.stdout.write(f"{sum_med} {last_med}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_median(inp: str) -> str:
        """Independent oracle: sort prefix explicitly at each step."""
        parts = inp.split()
        n = int(parts[0])
        a = [int(x) for x in parts[1 : n + 1]]
        cur: List[int] = []
        s = 0
        last = 0
        for i, x in enumerate(a, 1):
            cur.append(x)
            cur.sort()
            last = cur[(i - 1) // 2]
            s += last
        return f"{s} {last}"

    def fmt(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    # Public samples (3)
    # [5, 15, 1, 3] -> medians: [5], [5,15]->5, [1,5,15]->5, [1,3,5,15]->3 => sum=18, last=3
    t1 = fmt([5, 15, 1, 3])
    # [2, 1, 5, 7, 2, 0, 5] -> medians: 2, 1, 2, 2, 2, 2, 2 => sum=13, last=2
    t2 = fmt([2, 1, 5, 7, 2, 0, 5])
    # Negative values: [-10, -20, -5, -15] -> -10, -20, -10, -15 => sum=-55, last=-15
    t3 = fmt([-10, -20, -5, -15])

    # Edge / overflow cases (5)
    t4 = fmt([1000000000])
    t5 = fmt([-1000000000, 1000000000])
    t6 = fmt([7, 7, 7, 7, 7, 7, 7, 7])
    t7 = fmt([1000000000] * 10 + [-1000000000] * 10)
    t8 = fmt([1, 100, 2, 99, 3, 98, 4, 97, 5, 96])

    # Medium -> Large tests (8), strictly < 150KB
    t9 = fmt([rng.randint(-50, 50) for _ in range(200)])
    t10 = fmt([rng.randint(-5000, 5000) for _ in range(2000)])
    t11 = fmt(list(range(1, 20001)))                             # Strictly increasing
    t12 = fmt(list(range(20000, 0, -1)))                         # Strictly decreasing
    # Heavy alternating extremes (forces constant rebalancing between both heaps)
    t13 = fmt([1000000000 if i % 2 == 0 else -1000000000 for i in range(11000)])
    # Full range [-10^9, 10^9] overflow test (N=12,000, ~136KB)
    t14 = fmt([rng.randint(-10**9, 10**9) for _ in range(12000)])
    # Heavy duplicates around median (N=25,000, values in [-50, 50])
    t15 = fmt([rng.randint(-50, 50) for _ in range(25000)])
    # Max N=25,000 random values in [-9999, 9999] (~138KB)
    t16 = fmt([rng.randint(-9999, 9999) for _ in range(25000)])

    tests = [
        {"input": t1, "hidden": False, "expected": "18 3", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "13 2", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "-55 -15", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        fmt([rng.randint(-30, 30) for _ in range(rng.randint(1, 70))])
        for _ in range(25)
    ]

    return {
        "slug": "cp06-running-median-two-heaps",
        "title": "Trung vị động bằng hai Heap",
        "shortDescription": "Cập nhật và truy vấn trung vị tức thời trên luồng dữ liệu N số nguyên bằng kỹ thuật hai Heap cân bằng.",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.heap_priority_queue",
        "tags": ["heap", "truy vấn", "tối ưu", "tầng 2"],
        "statement": (
            "Một cảm biến gửi về luồng dữ liệu gồm $N$ số nguyên $a_1, a_2, \\dots, a_N$ theo từng bước. "
            "Ngay sau khi nhận phần tử thứ $i$ ($1 \\le i \\le N$), gọi $m_i$ là **trung vị** của $i$ phần tử đầu tiên "
            "$a_1, a_2, \\dots, a_i$, được định nghĩa là phần tử đứng ở vị trí thứ $\\lceil i / 2 \\rceil$ (đánh số từ $1$) "
            "khi sắp xếp $i$ phần tử này theo thứ tự không giảm (nói cách khác, là phần tử chính giữa nếu $i$ lẻ và là "
            "**phần tử giữa bên trái** nếu $i$ chẵn).\n\n"
            "Hãy tính và in ra hai số nguyên:\n"
            "1. Tổng các trung vị qua mọi bước: $S = \\sum_{i=1}^{N} m_i$.\n"
            "2. Giá trị trung vị cuối cùng: $m_N$.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $N$ ($1 \\le N \\le 25\\,000$).\n"
            "- Dòng thứ hai gồm $N$ số nguyên $a_1, a_2, \\dots, a_N$ ($|a_i| \\le 10^9$).\n\n"
            "### Kết quả\n"
            "- In ra đúng hai số nguyên $S$ và $m_N$ trên một dòng, cách nhau bởi dấu cách.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le N \\le 25\\,000$.\n"
            "- $-10^9 \\le a_i \\le 10^9$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Hai Heap cân bằng (Max-Heap & Min-Heap) — Độ phức tạp mục tiêu O(N log N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Thay vì sắp xếp lại toàn bộ tiền tố sau mỗi lần thêm số, ta chỉ cần chia tập số hiện có thành **hai nửa**: nửa nhỏ hơn chứa $\\lceil i/2 \\rceil$ phần tử và nửa lớn hơn chứa $\\lfloor i/2 \\rfloor$ phần tử. Khi đó trung vị luôn là phần tử lớn nhất của nửa nhỏ hơn.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Dùng một **Max-Heap** `low` cho nửa nhỏ hơn và một **Min-Heap** `high` cho nửa lớn hơn, giữ bất biến: mọi phần tử trong `low` $\\le$ mọi phần tử trong `high` và `size(low) == size(high)` hoặc `size(low) == size(high) + 1`. Khi thêm $x$: nếu `low` rỗng hoặc $x \\le \\text{top}(low)$ thì đẩy vào `low`, ngược lại đẩy vào `high`; sau đó chuyển 1 phần tử đỉnh giữa hai heap nếu mất cân bằng kích thước.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Trong Python, `heapq` là Min-Heap nên lưu `-x` trong `low` để giả lập Max-Heap (nhớ đổi dấu lại khi đọc `-low[0]`). Tổng $S$ có thể đạt $\\pm 2.5 \\times 10^{13}$, cần dùng kiểu 64-bit `long long` trong C++."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_median,
        "extraStressInputs": stress,
    }


# ============================================================================
# 7. cp06-longest-valid-parentheses
# ============================================================================

def build_p07() -> Dict:
    rng = random.Random(607)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    string s;
    if (!(cin >> s)) return 0;
    vector<int> st;
    st.reserve(s.size() + 1);
    st.push_back(-1);

    int ans = 0;
    int n = static_cast<int>(s.size());
    for (int i = 0; i < n; ++i) {
        if (s[i] == '(') {
            st.push_back(i);
        } else {
            st.pop_back();
            if (st.empty()) {
                st.push_back(i);
            } else {
                ans = max(ans, i - st.back());
            }
        }
    }
    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    s = data[0]
    st = [-1]
    ans = 0
    for i, ch in enumerate(s):
        if ch == "(":
            st.append(i)
        else:
            st.pop()
            if not st:
                st.append(i)
            else:
                length = i - st[-1]
                if length > ans:
                    ans = length
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_lvp(inp: str) -> str:
        """Independent O(N^2) balance-scan oracle (no stack/DP)."""
        s = inp.strip()
        n = len(s)
        ans = 0
        for i in range(n):
            bal = 0
            for j in range(i, n):
                bal += 1 if s[j] == "(" else -1
                if bal < 0:
                    break
                if bal == 0 and j - i + 1 > ans:
                    ans = j - i + 1
        return str(ans)

    def gen_paren(length: int, p_open: float = 0.5) -> str:
        return "".join("(" if rng.random() < p_open else ")" for _ in range(length))

    def gen_valid_paren(pairs: int) -> str:
        out: List[str] = []
        opened = 0
        rem = pairs
        while rem > 0 or opened > 0:
            if rem == 0:
                out.append(")")
                opened -= 1
            elif opened == 0:
                out.append("(")
                opened += 1
                rem -= 1
            elif rng.random() < 0.5:
                out.append("(")
                opened += 1
                rem -= 1
            else:
                out.append(")")
                opened -= 1
        return "".join(out)

    # Public samples (3)
    t1 = ")()())"          # 4
    t2 = "()(()"           # 2 (classic trap!)
    t3 = "(()((())())"     # 10 (substring indices 1..10 = "()((())())" has len 10)

    # Edge cases (5)
    t4 = "("
    t5 = ")"
    t6 = ")("
    t7 = "(((((" + ")))))" + "(" + "()" * 4
    t8 = "))()()(((())))((("

    # Medium -> Large tests (8), all <= 100KB
    t9 = gen_paren(300, 0.5)
    t10 = gen_paren(1000, 0.55)
    t11 = "(" * 100_000                                         # All opens -> 0
    t12 = ")" * 100_000                                         # All closes -> 0
    t13 = "(" * 50_000 + ")" * 50_000                           # Full nested -> 100,000
    t14 = "()" * 24_999 + "(" + "()" * 25_000                   # Broken in middle -> 50,000
    # Valid islands separated by single unmatched breakers, total 100,000
    pieces15 = []
    for sz in [8000, 15000, 12000, 14998]:
        pieces15.append(gen_valid_paren(sz))
        pieces15.append(rng.choice("()"))
    t15 = "".join(pieces15)[:100_000]
    # Pure random 100,000
    t16 = gen_paren(100_000, 0.5)

    tests = [
        {"input": t1, "hidden": False, "expected": "4", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "2", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "10", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        gen_paren(rng.randint(1, 80), rng.choice([0.35, 0.5, 0.65]))
        for _ in range(30)
    ]

    return {
        "slug": "cp06-longest-valid-parentheses",
        "title": "Xâu con ngoặc hợp lệ dài nhất",
        "shortDescription": "Tìm độ dài lớn nhất của một xâu con liên tiếp là dãy ngoặc hợp lệ trong xâu chỉ gồm ( và ).",
        "difficulty": "medium",
        "estimatedTime": 25,
        "skillId": "algo.stack_queue",
        "tags": ["ngăn xếp", "xâu", "quy hoạch động", "tầng 2"],
        "statement": (
            "Cho một xâu $S$ có độ dài $N$ chỉ gồm hai ký tự `(` và `)`.\n\n"
            "Hãy tìm độ dài lớn nhất của một **xâu con liên tiếp** (substring) của $S$ tạo thành một dãy ngoặc cân bằng hợp lệ. "
            "Nếu không tồn tại xâu con hợp lệ khác rỗng nào, kết quả là $0$.\n\n"
            "### Dữ liệu vào\n"
            "- Một dòng duy nhất chứa xâu $S$ chỉ gồm các ký tự `(` và `)`.\n\n"
            "### Kết quả\n"
            "- In ra một số nguyên duy nhất là độ dài xâu con ngoặc hợp lệ dài nhất.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le |S| \\le 10^5$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Ngăn xếp lưu chỉ số biên (hoặc Quy hoạch động) — Độ phức tạp mục tiêu O(|S|).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Nếu chỉ đếm tổng số cặp ngoặc khớp được, bạn sẽ sai trên những xâu như `()(()` (hai đoạn hợp lệ bị ngăn cách bởi một dấu `(` dư ở giữa nên độ dài lớn nhất chỉ là `2`, không phải `4`). Cần biết chính xác **chỉ số ranh giới** của ký tự chưa khớp gần nhất bên trái.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Khởi tạo ngăn xếp chỉ số `st = [-1]` (vị trí rào chắn giả trước đầu xâu). Khi gặp `(` tại vị trí `i`, đẩy `i` vào `st`. Khi gặp `)` tại vị trí `i`, loại bỏ đỉnh ngăn xếp: nếu `st` trở nên rỗng thì đẩy `i` vào làm rào chắn mới; ngược lại đoạn hợp lệ dài nhất kết thúc tại `i` có độ dài đúng bằng `i - st.back()`.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Cách ngăn xếp này tự động nối liền các đoạn hợp lệ kề nhau (ví dụ `()()` cùng quay về rào chắn `-1`) và tự ngắt khi có `(` dư (vì chỉ số của `(` dư đó vẫn nằm trên ngăn xếp). Cũng có thể kiểm chứng bằng DP `dp[i]` — độ dài đoạn hợp lệ kết thúc đúng tại `i` — cả hai đều chạy trong $O(|S|)$."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_lvp,
        "extraStressInputs": stress,
    }


# ============================================================================
# 8. cp06-largest-rectangle-histogram
# ============================================================================

def build_p08() -> Dict:
    rng = random.Random(608)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;
    vector<long long> h(n);
    for (int i = 0; i < n; ++i) cin >> h[i];

    vector<int> st;
    st.reserve(n + 1);
    long long ans = 0;
    for (int i = 0; i <= n; ++i) {
        long long cur = (i == n ? 0LL : h[i]);
        while (!st.empty() && h[st.back()] >= cur) {
            long long height = h[st.back()];
            st.pop_back();
            int leftIdx = st.empty() ? -1 : st.back();
            long long width = i - leftIdx - 1;
            ans = max(ans, height * width);
        }
        st.push_back(i);
    }
    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    h = [int(x) for x in data[1 : n + 1]]
    st = []
    ans = 0
    for i in range(n + 1):
        cur = h[i] if i < n else 0
        while st and h[st[-1]] >= cur:
            height = h[st.pop()]
            left = st[-1] if st else -1
            area = height * (i - left - 1)
            if area > ans:
                ans = area
        st.append(i)
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_hist(inp: str) -> str:
        parts = inp.split()
        n = int(parts[0])
        h = [int(x) for x in parts[1 : n + 1]]
        ans = 0
        for l in range(n):
            mn = h[l]
            for r in range(l, n):
                if h[r] < mn:
                    mn = h[r]
                area = mn * (r - l + 1)
                if area > ans:
                    ans = area
        return str(ans)

    def fmt(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    # Public samples (3)
    t1 = fmt([2, 1, 5, 6, 2, 3])     # 10 (5 and 6 -> width 2 * height 5)
    t2 = fmt([2, 4])                  # 4
    t3 = fmt([6, 2, 5, 4, 5, 1, 6])  # 12 (bars 2..4: min=4, width=3)

    # Edge / overflow cases (5)
    t4 = fmt([0])
    t5 = fmt([0, 0, 0, 0, 0])
    t6 = fmt([1000000000])
    t7 = fmt([1000000000, 1000000000, 1000000000, 1000000000])  # 4 * 10^9 > 32-bit int
    t8 = fmt([3, 3, 0, 5, 5, 5, 0, 2, 2, 2, 2, 2, 2])          # Zeros splitting islands -> 15

    # Medium -> Large tests (8), strictly < 150KB
    t9 = fmt([rng.randint(0, 50) for _ in range(250)])
    t10 = fmt([rng.randint(0, 500) for _ in range(2000)])
    # Pyramid (mountain) N=20,000
    t11 = fmt(list(range(1, 10001)) + list(range(10000, 0, -1)))
    # Valley (V-shape) N=20,000
    t12 = fmt(list(range(10000, 0, -1)) + list(range(1, 10001)))
    # All equal 10^9 with N=13,000 -> area = 1.3 * 10^13 (~143KB)
    t13 = fmt([1000000000] * 13000)
    # Random full height [0, 10^9] with N=13,000 (~138KB)
    t14 = fmt([rng.randint(0, 10**9) for _ in range(13000)])
    # Max N=30,000 with zeros as walls and varied heights [0, 9999] (~143KB)
    t15 = fmt([0 if rng.random() < 0.02 else rng.randint(1, 9999) for _ in range(30000)])
    # Max N=30,000 slowly varying noisy heights [1, 4999] (~142KB)
    arr16 = []
    cur_h = 2000
    for _ in range(30000):
        cur_h = max(1, min(4999, cur_h + rng.randint(-150, 150)))
        arr16.append(cur_h)
    t16 = fmt(arr16)

    tests = [
        {"input": t1, "hidden": False, "expected": "10", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "4", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "12", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        fmt([rng.randint(0, 15) for _ in range(rng.randint(1, 60))])
        for _ in range(25)
    ]

    return {
        "slug": "cp06-largest-rectangle-histogram",
        "title": "Hình chữ nhật lớn nhất trong biểu đồ cột",
        "shortDescription": "Tìm diện tích hình chữ nhật lớn nhất nằm hoàn toàn bên trong biểu đồ gồm N cột liên tiếp bằng Monotonic Stack.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.monotonic_stack_deque",
        "tags": ["ngăn xếp", "monotonic stack", "tối ưu", "tầng 2"],
        "statement": (
            "Cho một biểu đồ gồm $N$ cột chữ nhật đặt khít nhau trên trục hoành. Mỗi cột có bề rộng bằng $1$, "
            "và cột thứ $i$ ($1 \\le i \\le N$) có chiều cao $h_i \\ge 0$.\n\n"
            "Hãy tìm diện tích lớn nhất của một hình chữ nhật có các cạnh song song với hai trục tọa độ và "
            "nằm hoàn toàn bên trong phần hợp của $N$ cột trên (tức là chọn đoạn cột liên tiếp $[l, r]$ sao cho "
            "giá trị $(r - l + 1) \\times \\min_{l \\le k \\le r} h_k$ đạt cực đại).\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $N$ ($1 \\le N \\le 30\\,000$).\n"
            "- Dòng thứ hai gồm $N$ số nguyên không âm $h_1, h_2, \\dots, h_N$ ($0 \\le h_i \\le 10^9$).\n\n"
            "### Kết quả\n"
            "- In ra một số nguyên duy nhất là diện tích hình chữ nhật lớn nhất tìm được.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le N \\le 30\\,000$.\n"
            "- $0 \\le h_i \\le 10^9$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Ngăn xếp đơn điệu tăng (Monotonic Stack) & 64-bit — Độ phức tạp mục tiêu O(N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Hình chữ nhật tối ưu luôn có chiều cao bằng đúng chiều cao $h_i$ của ít nhất một cột $i$ nào đó bên trong nó. Nếu cố định cột $i$ làm giới hạn chiều cao, ta cần mở rộng sang trái tới vị trí `L[i]` gần nhất có $h < h_i$ và sang phải tới vị trí `R[i]` gần nhất có $h < h_i$, khi đó bề rộng tối đa là `R[i] - L[i] - 1`.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Duy trì một ngăn xếp lưu chỉ số theo chiều cao tăng dần. Khi duyệt đến cột `i` có chiều cao `cur` nhỏ hơn hoặc bằng cột ở đỉnh ngăn xếp `top`, ta biết ngay biên phải của cột `top` là `i`, còn biên trái của nó chính là phần tử nằm ngay dưới `top` trên ngăn xếp (hoặc `-1` nếu ngăn xếp rỗng sau khi rút `top`).\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Thêm một cột lính canh chiều cao `0` ở cuối (vị trí `i = n`) để tự động xả sạch mọi cột còn lại trong ngăn xếp. Diện tích tối đa lên tới $30\\,000 \\times 10^9 = 3 \\times 10^{13}$, bắt buộc dùng kiểu 64-bit `long long` khi nhân `height * width`."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_hist,
        "extraStressInputs": stress,
    }


# ============================================================================
# 9. cp06-sum-subarray-minimums
# ============================================================================

def build_p09() -> Dict:
    rng = random.Random(609)
    MOD = 10**9 + 7

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const long long MOD = 1000000007LL;
    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    vector<int> leftPos(n), rightPos(n);
    vector<int> st;
    st.reserve(n);

    // Nearest index to the left with a[j] <= a[i] (strict > popped)
    for (int i = 0; i < n; ++i) {
        while (!st.empty() && a[st.back()] > a[i]) st.pop_back();
        leftPos[i] = st.empty() ? -1 : st.back();
        st.push_back(i);
    }

    st.clear();
    // Nearest index to the right with a[j] < a[i] (non-strict >= popped)
    for (int i = n - 1; i >= 0; --i) {
        while (!st.empty() && a[st.back()] >= a[i]) st.pop_back();
        rightPos[i] = st.empty() ? n : st.back();
        st.push_back(i);
    }

    long long ans = 0;
    for (int i = 0; i < n; ++i) {
        long long cnt = 1LL * (i - leftPos[i]) * (rightPos[i] - i) % MOD;
        long long contrib = cnt * (a[i] % MOD) % MOD;
        ans = (ans + contrib) % MOD;
    }
    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""
import sys


def solve() -> None:
    MOD = 1000000007
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = [int(x) for x in data[1 : n + 1]]

    left_pos = [-1] * n
    right_pos = [n] * n

    st = []
    for i in range(n):
        ai = a[i]
        while st and a[st[-1]] > ai:
            st.pop()
        left_pos[i] = st[-1] if st else -1
        st.append(i)

    st.clear()
    for i in range(n - 1, -1, -1):
        ai = a[i]
        while st and a[st[-1]] >= ai:
            st.pop()
        right_pos[i] = st[-1] if st else n
        st.append(i)

    ans = 0
    for i in range(n):
        cnt = (i - left_pos[i]) * (right_pos[i] - i) % MOD
        ans = (ans + cnt * (a[i] % MOD)) % MOD
    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_ssm(inp: str) -> str:
        parts = inp.split()
        n = int(parts[0])
        a = [int(x) for x in parts[1 : n + 1]]
        total = 0
        for l in range(n):
            mn = a[l]
            for r in range(l, n):
                if a[r] < mn:
                    mn = a[r]
                total += mn
            total %= MOD
        return str(total % MOD)

    def fmt(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(map(str, arr))

    # Public samples (3)
    # [3, 1, 2, 4]: subarrays min -> 3,1,2,4, 1,1,2, 1,1, 1 -> sum = 17
    t1 = fmt([3, 1, 2, 4])
    # Duplicates! [2, 2, 2] -> 6 subarrays * 2 = 12
    t2 = fmt([2, 2, 2])
    # [11, 81, 94, 43, 3] -> 444
    t3 = fmt([11, 81, 94, 43, 3])

    # Edge / duplicate / modulo cases (5)
    t4 = fmt([1000000000])
    t5 = fmt([5, 5, 1, 5, 5, 1, 5])
    t6 = fmt([1000000000] * 5)                         # 15 * 10^9 mod (10^9+7)
    t7 = fmt([1, 2, 3, 2, 1, 2, 3, 2, 1])
    t8 = fmt([1000000000, 999999999, 1000000000, 999999999, 1000000000])

    # Medium -> Large tests (8), strictly < 150KB
    t9 = fmt([rng.randint(1, 20) for _ in range(250)])
    t10 = fmt([rng.randint(1, 1000) for _ in range(2000)])
    # Strictly increasing N=20,000
    t11 = fmt(list(range(1, 20001)))
    # Strictly decreasing N=20,000
    t12 = fmt(list(range(20000, 0, -1)))
    # All equal 10^9 with N=13,000 (ultimate duplicate + modulo test, ~143KB)
    t13 = fmt([1000000000] * 13000)
    # Full range [1, 10^9] random N=13,000 (~139KB)
    t14 = fmt([rng.randint(1, 10**9) for _ in range(13000)])
    # Max N=30,000 with heavy duplicates {1..5} (~60KB)
    t15 = fmt([rng.randint(1, 5) for _ in range(30000)])
    # Max N=30,000 random values in [1, 9999] (~146KB)
    t16 = fmt([rng.randint(1, 9999) for _ in range(30000)])

    tests = [
        {"input": t1, "hidden": False, "expected": "17", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "12", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "444", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = [
        fmt([rng.randint(1, 6) for _ in range(rng.randint(1, 60))])
        for _ in range(30)
    ]

    return {
        "slug": "cp06-sum-subarray-minimums",
        "title": "Tổng giá trị nhỏ nhất của mọi đoạn con",
        "shortDescription": "Tính tổng phần tử nhỏ nhất trên toàn bộ đoạn con liên tiếp của mảng modulo 10^9 + 7 bằng Monotonic Stack có phá hòa.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.monotonic_stack_deque",
        "tags": ["ngăn xếp", "monotonic stack", "tối ưu", "tầng 2"],
        "statement": (
            "Cho mảng $A$ gồm $N$ số nguyên dương $a_1, a_2, \\dots, a_N$. Xét tất cả $\\frac{N(N+1)}{2}$ "
            "đoạn con liên tiếp khác rỗng $[l, r]$ ($1 \\le l \\le r \\le N$) của mảng.\n\n"
            "Hãy tính tổng giá trị nhỏ nhất trên mọi đoạn con liên tiếp, chia lấy dư cho $10^9 + 7$:\n"
            "$$\\left(\\sum_{1 \\le l \\le r \\le N} \\min(a_l, a_{l+1}, \\dots, a_r)\\right) \\bmod (10^9 + 7).$$\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm số nguyên dương $N$ ($1 \\le N \\le 30\\,000$).\n"
            "- Dòng thứ hai gồm $N$ số nguyên dương $a_1, a_2, \\dots, a_N$ ($1 \\le a_i \\le 10^9$).\n\n"
            "### Kết quả\n"
            "- In ra một số nguyên duy nhất là phần dư của tổng cần tìm khi chia cho $10^9 + 7$.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le N \\le 30\\,000$.\n"
            "- $1 \\le a_i \\le 10^9$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Kỹ thuật đếm đóng góp (Contribution) + Monotonic Stack phá hòa — Độ phức tạp mục tiêu O(N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Thay vì duyệt từng đoạn con $[l, r]$, hãy đảo góc nhìn: với mỗi phần tử $a_i$, đếm xem có bao nhiêu đoạn con nhận $a_i$ làm giá trị nhỏ nhất. Nếu số đoạn con đó là $C_i$, phần tử $a_i$ đóng góp $a_i \\times C_i$ vào tổng.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Cạm bẫy lớn nhất nằm ở các phần tử **bằng nhau** (ví dụ `[2, 2]`): nếu cả hai biên đều dùng so sánh chặt `<`, đoạn `[2, 2]` sẽ bị đếm hai lần! Để mỗi đoạn con được quy về duy nhất **phần tử nhỏ nhất ngoài cùng bên trái** của nó, ta quy ước **phá hòa bất đối xứng**:\n"
            "- `L[i]`: vị trí gần nhất bên trái có $a_j \\le a_i$ (ngăn xếp loại khi `>`).\n"
            "- `R[i]`: vị trí gần nhất bên phải có $a_j < a_i$ (ngăn xếp loại khi `>=`).\n"
            "Khi đó số đoạn con là $C_i = (i - L[i]) \\times (R[i] - i)$.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Tích $(i - L[i]) \\times (R[i] - i)$ có thể lên tới $9 \\times 10^8$, còn $a_i$ lên tới $10^9$; hãy lấy modulo $10^9 + 7$ sau mỗi phép nhân bằng kiểu `long long` để tránh tràn số."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_ssm,
        "extraStressInputs": stress,
    }


# ============================================================================
# 10. cp06-ipo-maximize-capital
# ============================================================================

def build_p10() -> Dict:
    rng = random.Random(610)

    cpp_sol = r"""
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, k;
    long long w;
    if (!(cin >> n >> k >> w)) return 0;
    vector<pair<long long, long long>> projects(n);
    for (int i = 0; i < n; ++i) {
        cin >> projects[i].first >> projects[i].second;
    }
    sort(projects.begin(), projects.end());

    priority_queue<long long> maxProfit;
    int ptr = 0;
    for (int step = 0; step < k; ++step) {
        while (ptr < n && projects[ptr].first <= w) {
            maxProfit.push(projects[ptr].second);
            ++ptr;
        }
        if (maxProfit.empty()) break;
        w += maxProfit.top();
        maxProfit.pop();
    }
    cout << w << '\n';
    return 0;
}
"""

    py_sol = r"""
import heapq
import sys


def solve() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    k = int(data[1])
    w = int(data[2])
    projects = []
    idx = 3
    for _ in range(n):
        c = int(data[idx])
        p = int(data[idx + 1])
        projects.append((c, p))
        idx += 2
    projects.sort(key=lambda x: x[0])

    max_heap = []
    ptr = 0
    for _ in range(k):
        while ptr < n and projects[ptr][0] <= w:
            heapq.heappush(max_heap, -projects[ptr][1])
            ptr += 1
        if not max_heap:
            break
        w += -heapq.heappop(max_heap)
    sys.stdout.write(f"{w}\n")


if __name__ == "__main__":
    solve()
"""

    def brute_ipo(inp: str) -> str:
        """Exact exhaustive search for N<=8; independent O(K*N) scan (no sort/heap) for medium N."""
        parts = inp.split()
        n = int(parts[0])
        k = int(parts[1])
        w = int(parts[2])
        projs = [(int(parts[3 + 2 * i]), int(parts[4 + 2 * i])) for i in range(n)]
        if n <= 8:
            best = w
            used = [False] * n

            def dfs(rem: int, cur_w: int) -> None:
                nonlocal best
                if cur_w > best:
                    best = cur_w
                if rem == 0:
                    return
                for i in range(n):
                    if not used[i] and projs[i][0] <= cur_w:
                        used[i] = True
                        dfs(rem - 1, cur_w + projs[i][1])
                        used[i] = False

            dfs(k, w)
            return str(best)

        used = [False] * n
        cur_w = w
        for _ in range(k):
            best_idx = -1
            best_p = -1
            for i, (c, p) in enumerate(projs):
                if not used[i] and c <= cur_w and p > best_p:
                    best_p = p
                    best_idx = i
            if best_idx == -1:
                break
            used[best_idx] = True
            cur_w += best_p
        return str(cur_w)

    def fmt(k: int, w: int, projs: List[Tuple[int, int]]) -> str:
        lines = [f"{len(projs)} {k} {w}"]
        lines.extend(f"{c} {p}" for c, p in projs)
        return "\n".join(lines)

    # Public samples (3)
    # Classic IPO: K=2, W=0, (0,1), (1,2), (1,3) -> take (0,1) W=1 -> take (1,3) W=4
    t1 = fmt(2, 0, [(0, 1), (1, 2), (1, 3)])
    # K=3, W=0, (0,1), (1,2), (2,3) -> W = 0+1+2+3 = 6
    t2 = fmt(3, 0, [(0, 1), (1, 2), (2, 3)])
    # Blocked early: W=5, K=3, (8,100), (2,2), (9,50) -> only (2,2) -> W=7, cannot reach 8 -> 7
    t3 = fmt(3, 5, [(8, 100), (2, 2), (9, 50)])

    # Edge / overflow cases (5)
    t4 = fmt(1, 0, [(1, 100), (5, 200)])                         # Cannot start any -> 0
    t5 = fmt(4, 10, [(0, 0), (5, 0), (10, 0), (10, 0)])          # All zero profit -> 10
    t6 = fmt(1, 10, [(0, 5), (10, 100), (10, 50), (11, 999)])    # K=1, tie on c_i=W -> 110
    t7 = fmt(5, 10**9, [(0, 10**9), (10**9, 10**9), (10**9, 10**9), (10**9, 10**9), (10**9, 10**9)])  # 6e9 > 32-bit
    # Chain unlocking strictly in reverse input order
    t8 = fmt(6, 0, [(15, 20), (10, 5), (6, 4), (3, 3), (1, 2), (0, 1)])  # 0+1+2+3+4+5+20 = 35

    # Medium -> Large tests (8), strictly < 150KB
    t9 = fmt(40, 10, [(rng.randint(0, 300), rng.randint(0, 40)) for _ in range(100)])
    t10 = fmt(500, 50, [(rng.randint(0, 5000), rng.randint(0, 200)) for _ in range(1500)])

    # t11: Same c_i groups + progressive staircase, N=8000
    projs11 = []
    for i in range(8000):
        c = (i // 10) * 50
        p = rng.randint(1, 40)
        projs11.append((c, p))
    rng.shuffle(projs11)
    t11 = fmt(4000, 0, projs11)

    # t12: Full 64-bit overflow test with c_i, p_i up to 10^9, N=6500 (~136KB)
    projs12 = [(rng.randint(0, 10**9), rng.randint(10**8, 10**9)) for _ in range(6500)]
    t12 = fmt(6500, 5 * 10**8, projs12)

    # t13: Large N=12,000 where capital grows slowly and hits a dead-end midway
    projs13 = [(i * 5, rng.randint(0, 9)) for i in range(6000)] + [
        (900000 + i, 9999) for i in range(6000)
    ]
    rng.shuffle(projs13)
    t13 = fmt(10000, 10, projs13)

    # t14: Large N=15,000 random medium values (~128KB)
    projs14 = [(rng.randint(0, 50000), rng.randint(0, 99)) for _ in range(15000)]
    t14 = fmt(7500, 500, projs14)

    # t15: Max N=25,000, K=25,000 tight chain unlocking (c in [0, 999], p in [0, 9], ~140KB)
    projs15 = [(rng.randint(0, 999), rng.randint(0, 9)) for _ in range(25000)]
    projs15[0] = (0, 5)
    t15 = fmt(25000, 0, projs15)

    # t16: Max N=25,000, K=12,500 random (c in [0, 999], p in [0, 9], ~140KB)
    projs16 = [(rng.randint(0, 999), rng.randint(0, 9)) for _ in range(25000)]
    t16 = fmt(12500, 20, projs16)

    tests = [
        {"input": t1, "hidden": False, "expected": "4", "checkBrute": True},
        {"input": t2, "hidden": False, "expected": "6", "checkBrute": True},
        {"input": t3, "hidden": False, "expected": "7", "checkBrute": True},
        {"input": t4, "hidden": True, "checkBrute": True},
        {"input": t5, "hidden": True, "checkBrute": True},
        {"input": t6, "hidden": True, "checkBrute": True},
        {"input": t7, "hidden": True, "checkBrute": True},
        {"input": t8, "hidden": True, "checkBrute": True},
        {"input": t9, "hidden": True, "checkBrute": True},
        {"input": t10, "hidden": True},
        {"input": t11, "hidden": True},
        {"input": t12, "hidden": True},
        {"input": t13, "hidden": True},
        {"input": t14, "hidden": True},
        {"input": t15, "hidden": True},
        {"input": t16, "hidden": True},
    ]

    stress = []
    for _ in range(18):
        n = rng.randint(1, 7)
        k = rng.randint(1, n)
        w = rng.randint(0, 6)
        projs = [(rng.randint(0, 12), rng.randint(0, 6)) for _ in range(n)]
        stress.append(fmt(k, w, projs))
    for _ in range(10):
        n = rng.randint(30, 80)
        k = rng.randint(1, n)
        w = rng.randint(0, 30)
        projs = [(rng.randint(0, 150), rng.randint(0, 25)) for _ in range(n)]
        stress.append(fmt(k, w, projs))

    return {
        "slug": "cp06-ipo-maximize-capital",
        "title": "Tối đa hóa nguồn vốn đầu tư (IPO)",
        "shortDescription": "Chọn tối đa K dự án đủ điều kiện vốn để đạt nguồn vốn cuối cùng lớn nhất bằng sắp xếp kết hợp Max-Heap.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.heap_priority_queue",
        "tags": ["heap", "tham lam", "sắp xếp", "tối ưu", "tầng 2"],
        "statement": (
            "Trước đợt chào bán cổ phiếu lần đầu ra công chúng (IPO), một công ty khởi nghiệp đang có số vốn ban đầu là $W$ "
            "và được phép thực hiện **tối đa $K$ dự án khác nhau** trong danh sách $N$ dự án khả dụng.\n\n"
            "Dự án thứ $i$ ($1 \\le i \\le N$) gồm hai thông số:\n"
            "- $c_i$: nguồn vốn tối thiểu cần có để bắt đầu dự án (chỉ được thực hiện khi vốn hiện tại $\\ge c_i$; "
            "số vốn này **không bị trừ đi** sau khi chạy dự án).\n"
            "- $p_i$: lợi nhuận thuần thu về sau khi hoàn thành dự án, được cộng trực tiếp vào nguồn vốn hiện tại.\n\n"
            "Mỗi dự án chỉ được chọn tối đa một lần. Nếu tại một thời điểm không còn dự án nào đủ điều kiện vốn, "
            "công ty buộc phải dừng lại sớm. Hãy tìm tổng nguồn vốn lớn nhất công ty có thể đạt được.\n\n"
            "### Dữ liệu vào\n"
            "- Dòng đầu tiên gồm ba số nguyên $N, K, W$ ($1 \\le K \\le N \\le 25\\,000$, $0 \\le W \\le 10^9$).\n"
            "- $N$ dòng tiếp theo, dòng thứ $i$ gồm hai số nguyên không âm $c_i$ và $p_i$ ($0 \\le c_i, p_i \\le 10^9$).\n\n"
            "### Kết quả\n"
            "- In ra một số nguyên duy nhất là nguồn vốn lớn nhất đạt được.\n\n"
            "### Ràng buộc\n"
            "- $1 \\le K \\le N \\le 25\\,000$.\n"
            "- $0 \\le W, c_i, p_i \\le 10^9$ với mọi $1 \\le i \\le N$."
        ),
        "requirementsText": REQ_HEADER + "Kỹ thuật: Tham lam kết hợp Sắp xếp & Max-Heap — Độ phức tạp mục tiêu O((N + K) log N).",
        "hints": (
            "**Gợi ý 1 (Ý tưởng cơ bản):** Vì lợi nhuận $p_i \\ge 0$ và không bị trừ vốn khi khởi chạy, nguồn vốn $W$ chỉ có tăng dần (không giảm). Do đó ở mỗi lượt, trong tất cả các dự án *đủ điều kiện vốn* ($c_i \\le W$) chưa làm, lựa chọn tối ưu luôn là dự án có lợi nhuận $p_i$ lớn nhất.\n\n"
            "**Gợi ý 2 (Cấu trúc dữ liệu & Thuật toán):** Sắp xếp toàn bộ $N$ dự án theo yêu cầu vốn $c_i$ tăng dần và dùng một con trỏ `ptr` duy nhất quét từ đầu đến cuối mảng. Ở mỗi lượt trong $K$ lượt: đẩy lợi nhuận $p_i$ của mọi dự án mới mở khóa (`projects[ptr].c <= W`) vào một **Max-Heap**, rồi lấy ra phần tử lớn nhất cộng vào $W$.\n\n"
            "**Gợi ý 3 (Chi tiết cài đặt & Trường hợp biên):** Nếu Max-Heap rỗng ngay sau bước mở khóa thì dừng vòng lặp ngay (không thể mở khóa thêm dự án nào nữa). Chú ý biến vốn `W` có thể vượt xa $2^{31} - 1$ (tối đa $2.5 \\times 10^{13}$), cần khai báo kiểu 64-bit `long long`."
        ),
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_ipo,
        "extraStressInputs": stress,
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

    # Enforce strict 16 tests & < 150KB input budget before running pack_lib
    for p in problems:
        assert len(p["tests"]) == 16, f"[{p['slug']}] expected 16 tests, got {len(p['tests'])}"
        for idx, tc in enumerate(p["tests"], 1):
            in_bytes = len(tc["input"].encode("utf-8"))
            assert in_bytes < STRICT_MAX_BYTES, (
                f"[{p['slug']}] test #{idx} input too large: {in_bytes} >= {STRICT_MAX_BYTES}"
            )

    out_path = build_and_verify_pack(
        pack_id="06-stack-queue-heap",
        title="Tầng 2: Ngăn xếp, Hàng đợi, Deque đơn điệu & Heap",
        tier="Tầng 2 — Kỹ thuật lõi",
        description=(
            "10 bài cấu trúc dữ liệu tuyến tính thi đấu: ngoặc hợp lệ, RPN, Huffman Min-Heap, "
            "Monotonic Stack, Sliding Window Max Deque, Trung vị 2 Heap, Histogram và bài toán IPO."
        ),
        problems=problems,
    )

    # Also verify every generated output is strictly < 150KB
    import json
    with open(out_path, "r", encoding="utf-8") as f:
        pack = json.load(f)
    max_in_b = 0
    max_out_b = 0
    for prob in pack["problems"]:
        for ti, tc in enumerate(prob["testCases"], 1):
            ib = len(tc["input"].encode("utf-8"))
            ob = len(tc["output"].encode("utf-8"))
            max_in_b = max(max_in_b, ib)
            max_out_b = max(max_out_b, ob)
            assert ib < STRICT_MAX_BYTES, f"[{prob['slug']}] test #{ti} input {ib}B >= 150KB"
            assert ob < STRICT_MAX_BYTES, f"[{prob['slug']}] test #{ti} output {ob}B >= 150KB"
    print(f"Size check OK: max_input={max_in_b} B, max_output={max_out_b} B (< {STRICT_MAX_BYTES} B)")


if __name__ == "__main__":
    main()
