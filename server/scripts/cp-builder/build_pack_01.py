"""
Builder & automated verifier for CodeClass CP Pack 01:
  01-number-theory-sieve — "Tầng 1: Số học & Sàng nguyên tố"

Run from workspace root:
  py -3 server\\scripts\\cp-builder\\build_pack_01.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Any, Dict, List

from pack_lib import build_and_verify_pack

PACK_ID = "01-number-theory-sieve"
PACK_TITLE = "Tầng 1: Số học & Sàng nguyên tố"
PACK_TIER = "Tầng 1 — Nền tảng"
PACK_DESC = (
    "10 bài số học thi đấu từ Dễ đến Khó: ước/bội, GCD/LCM, số chính phương, "
    "phân tích thừa số nguyên tố, sàng Eratosthenes, lũy thừa mô-đun và sàng phân đoạn."
)

REQ_HEADER = "Time: 1s\nMemory: 256MB\nNguồn: CodeClass CP Pack — Số học & Sàng\n"


def _sieve_primes(limit: int) -> List[int]:
    if limit < 2:
        return []
    sieve = bytearray(b"\x01") * (limit + 1)
    sieve[0] = sieve[1] = 0
    for i in range(2, math.isqrt(limit) + 1):
        if sieve[i]:
            sieve[i * i :: i] = bytearray(((limit - i * i) // i) + 1)
    return [i for i, v in enumerate(sieve) if v]


def _is_prime_trial(n: int) -> bool:
    if n < 2:
        return False
    if n % 2 == 0:
        return n == 2
    if n % 3 == 0:
        return n == 3
    d = 5
    while d * d <= n:
        if n % d == 0 or n % (d + 2) == 0:
            return False
        d += 6
    return True


# ============================================================================
# Problem 1: cp01-divisor-count-sum (easy, algo.divisors_multiples)
# ============================================================================
def build_p01() -> Dict[str, Any]:
    rng = random.Random(10101)
    primes_100k = _sieve_primes(100_000)

    def make_inp(nums: List[int]) -> str:
        return f"{len(nums)}\n" + "\n".join(str(x) for x in nums) + "\n"

    def brute_p01(inp: str) -> str:
        toks = inp.split()
        t = int(toks[0])
        out = []
        for i in range(1, t + 1):
            n = int(toks[i])
            cnt = 0
            total = 0
            for d in range(1, n + 1):
                if n % d == 0:
                    cnt += 1
                    total += d
            out.append(f"{cnt} {total}")
        return "\n".join(out)

    # Large tests: diverse up to 10^12, keeping T <= 500 and Python runtime fast
    large_primes_1e12 = [
        999_999_999_989, 999_999_999_961, 999_999_999_959, 999_999_999_887,
        999_999_999_863, 999_999_999_853, 999_999_999_797, 999_999_999_769,
    ]
    # Highly composite numbers up to 10^12
    hcn_list = [
        720_720, 1_441_440, 21_621_600, 735_134_400, 6_983_776_800,
        139_675_536_000, 321_253_732_800, 963_761_198_400,
    ]

    # Build T=500 tests
    t13 = [rng.randint(1, 10**6) for _ in range(500)]
    t14 = [rng.randint(10**6, 10**9) for _ in range(500)]
    t15 = []
    for k in range(500):
        if k < 20:
            t15.append(large_primes_1e12[k % len(large_primes_1e12)])
        elif k < 40:
            p = primes_100k[-1 - k]
            t15.append(p * p)
        elif k < 80:
            t15.append(hcn_list[k % len(hcn_list)])
        else:
            # Composite numbers near 10^12
            base = rng.choice([2, 3, 4, 6, 10, 12, 30, 60, 210])
            t15.append(base * rng.randint(10**9, 10**12 // base))

    t16 = [
        1, 2, 4, 36, 10**12, 999_983 * 999_983, 999_979 * 999_983,
        999_999_999_989, 2**39, 3**25, 5**17, 963_761_198_400,
        2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31,
    ]
    while len(t16) < 500:
        x = rng.randint(10**10, 10**12)
        if x % 2 == 1 and x % 3 != 0:
            x -= x % 6  # mix smooth and arbitrary composites
        t16.append(max(1, x))

    tests = [
        # 3 public samples
        {"input": make_inp([12, 7, 36]), "hidden": False, "expected": "6 28\n2 8\n9 91", "checkBrute": True},
        {"input": make_inp([1, 2, 100]), "hidden": False, "expected": "1 1\n2 3\n9 217", "checkBrute": True},
        {"input": make_inp([1000000000000, 999999999989]), "hidden": False, "expected": "169 2499694822171\n2 999999999990", "checkBrute": False},
        # 5 corner / edge / trap cases
        {"input": make_inp([1]), "hidden": True, "checkBrute": True},
        {"input": make_inp([4, 9, 16, 25, 49, 121, 169, 999983 * 999983]), "hidden": True, "checkBrute": False},
        {"input": make_inp([2**i for i in range(1, 40)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(large_primes_1e12), "hidden": True, "checkBrute": False},
        {"input": make_inp(hcn_list + [10**12, 10**12 - 1, 999_979 * 999_983]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests
        {"input": make_inp(list(range(1, 51))), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(1, 2000) for _ in range(50)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(1, 20000) for _ in range(100)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([p * q for p, q in zip(primes_100k[50:150], primes_100k[200:300])]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t13), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16), "hidden": True, "checkBrute": False},
    ]
    # Exact expected for sample 3:
    # 10^12 = 2^12 * 5^12 -> d = 13 * 13 = 169; sigma = (2^13 - 1) * (5^13 - 1) / 4 = 8191 * 305175781 = 2499694822171
    # 999999999989 is prime -> d = 2, sigma = 999999999990
    tests[2]["expected"] = "169 2499694822171\n2 999999999990"

    extra_stress = [
        make_inp([rng.randint(1, 5000) for _ in range(30)]) for _ in range(5)
    ]

    statement = r"""
Trong sự kiện phát thưởng của câu lạc bộ Tin học, ban tổ chức chuẩn bị $N$ chiếc bánh và muốn chia đều vào các hộp sao cho mỗi hộp có cùng số bánh và không thừa chiếc nào. Số cách chọn số bánh trong mỗi hộp chính là số lượng ước nguyên dương của $N$, đồng thời tổng số bánh tương ứng trên tất cả các phương án chia bằng tổng các ước nguyên dương của $N$.

Cho $T$ truy vấn độc lập. Ở mỗi truy vấn, bạn được cho một số nguyên dương $N$. Hãy tính và in ra:
1. Số lượng ước nguyên dương của $N$, ký hiệu $d(N)$.
2. Tổng các ước nguyên dương của $N$, ký hiệu $\sigma(N)$.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 500$) — số lượng truy vấn.
- $T$ dòng tiếp theo, mỗi dòng chứa một số nguyên dương $N$ ($1 \le N \le 10^{12}$).

### Kết quả
- Gồm $T$ dòng, dòng thứ $i$ in hai số nguyên dương $d(N)$ và $\sigma(N)$ cách nhau bởi một dấu cách.

### Ràng buộc
- $1 \le T \le 500$
- $1 \le N \le 10^{12}$

### Subtasks
- **Subtask 1 (40% số điểm):** $T \le 50,\; N \le 10^6$.
- **Subtask 2 (30% số điểm):** $T \le 50,\; N \le 10^{12}$.
- **Subtask 3 (30% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ở ví dụ 1: $N = 12$ có $6$ ước là $\{1, 2, 3, 4, 6, 12\}$ với tổng $28$; $N = 7$ là số nguyên tố nên có $2$ ước $\{1, 7\}$ tổng $8$; $N = 36$ là số chính phương có $9$ ước $\{1, 2, 3, 4, 6, 9, 12, 18, 36\}$ tổng $91$ (chú ý ước $6$ chỉ tính một lần).
- Ở ví dụ 2: $N = 1$ chỉ có duy nhất $1$ ước là $1$.
- Ở ví dụ 3: Minh họa giá trị lớn $N = 10^{12}$ và số nguyên tố gần $10^{12}$, tổng các ước vượt quá phạm vi kiểu `int` 32-bit.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Các ước của $N$ luôn xuất hiện theo từng cặp $(d, N/d)$ với $d \le \sqrt{N}$. Khi $N$ là số chính phương ($d = N/d$), nhớ chỉ cộng ước $\sqrt{N}$ đúng một lần.

**Gợi ý 2 (Thuật toán):**
Nếu chỉ duyệt $d$ từ $1$ đến $\sqrt{N}$ cho từng truy vấn, với $T = 500$ và $N \approx 10^{12}$ ta có thể tốn tới $5 \cdot 10^8$ phép chia (dễ quá thời gian). Thay vào đó, hãy sàng trước các số nguyên tố đến $10^6$ (chỉ có $78\,498$ số) để phân tích $N = \prod p_i^{e_i}$. Khi đó:
$$d(N) = \prod (e_i + 1), \qquad \sigma(N) = \prod \left(1 + p_i + p_i^2 + \dots + p_i^{e_i}\right)$$

**Gợi ý 3 (Cài đặt & bẫy):**
- Dùng kiểu số nguyên 64-bit (`long long` trong C++) vì $\sigma(N)$ có thể đạt tới $\approx 5 \cdot 10^{12}$.
- Tránh tính tổng cấp số nhân bằng công thức $\frac{p^{e+1}-1}{p-1}$ vì $p^{e+1}$ có thể tràn `long long` khi $p \approx 10^{12}, e = 1$. Hãy cộng dồn trực tiếp `pw *= p; term += pw;` — lúc này `pw` không bao giờ vượt quá $N \le 10^{12}$.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const int LIM = 1000000;
    vector<char> is_prime(LIM + 1, 1);
    is_prime[0] = is_prime[1] = 0;
    vector<int> primes;
    primes.reserve(80000);
    for (int i = 2; i <= LIM; ++i) {
        if (is_prime[i]) {
            primes.push_back(i);
            if (1LL * i * i <= LIM) {
                for (int j = i * i; j <= LIM; j += i) {
                    is_prime[j] = 0;
                }
            }
        }
    }

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        long long n;
        cin >> n;
        long long x = n;
        long long cnt = 1;
        long long sum = 1;

        for (int p : primes) {
            if (1LL * p * p > x) break;
            if (x % p == 0) {
                long long e = 0;
                long long pw = 1;
                long long term = 1;
                while (x % p == 0) {
                    x /= p;
                    ++e;
                    pw *= p;
                    term += pw;
                }
                cnt *= (e + 1);
                sum *= term;
            }
        }
        if (x > 1) {
            cnt *= 2;
            sum *= (1 + x);
        }
        cout << cnt << ' ' << sum << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import math
import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    nums = [int(data[i]) for i in range(1, t + 1)]

    max_n = max(nums)
    lim = math.isqrt(max_n) + 1
    sieve = bytearray(b"\x01") * (lim + 1)
    if lim >= 0:
        sieve[0] = 0
    if lim >= 1:
        sieve[1] = 0
    for i in range(2, math.isqrt(lim) + 1):
        if sieve[i]:
            sieve[i * i :: i] = bytearray(((lim - i * i) // i) + 1)
    primes = [i for i, v in enumerate(sieve) if v]

    out = []
    for n in nums:
        x = n
        cnt = 1
        total = 1
        root = math.isqrt(x)
        for p in primes:
            if p > root:
                break
            if x % p == 0:
                e = 0
                pw = 1
                term = 1
                while x % p == 0:
                    x //= p
                    e += 1
                    pw *= p
                    term += pw
                cnt *= e + 1
                total *= term
                root = math.isqrt(x)
        if x > 1:
            cnt *= 2
            total *= 1 + x
        out.append(f"{cnt} {total}")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-divisor-count-sum",
        "title": "Đếm và tính tổng các ước số",
        "shortDescription": "Trả lời T truy vấn tính số lượng ước và tổng các ước nguyên dương của N lên tới 10^12.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.divisors_multiples",
        "tags": ["số học", "ước bội", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: T <= 500, 1 <= N <= 10^12",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p01,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 2: cp01-bus-cycle-gcd-lcm (easy, algo.gcd_lcm)
# ============================================================================
def build_p02() -> Dict[str, Any]:
    rng = random.Random(10202)

    def make_inp(arr: List[int], a: int, b: int) -> str:
        return f"{len(arr)} {a} {b}\n" + " ".join(str(x) for x in arr) + "\n"

    def factorize_dict(n: int) -> Dict[int, int]:
        res: Dict[int, int] = {}
        d = 2
        while d * d <= n:
            while n % d == 0:
                res[d] = res.get(d, 0) + 1
                n //= d
            d += 1 if d == 2 else 2
        if n > 1:
            res[n] = res.get(n, 0) + 1
        return res

    def brute_p02(inp: str) -> str:
        # Independent oracle using prime factorization instead of Euclidean algorithm
        toks = list(map(int, inp.split()))
        n, a, b = toks[0], toks[1], toks[2]
        arr = toks[3 : 3 + n]

        # GCD of array via prime factors of arr[0]
        f0 = factorize_dict(arr[0])
        g = 1
        for p, max_e in f0.items():
            min_e = max_e
            for x in arr[1:]:
                e = 0
                y = x
                while e < min_e and y % p == 0:
                    y //= p
                    e += 1
                min_e = e
                if min_e == 0:
                    break
            g *= p ** min_e

        # LCM(A, B) via prime factorizations of A and B
        fa = factorize_dict(a)
        fb = factorize_dict(b)
        lcm_val = 1
        for p in set(fa) | set(fb):
            lcm_val *= p ** max(fa.get(p, 0), fb.get(p, 0))
        return f"{g}\n{lcm_val}"

    # Fibonacci near 10^9 for worst-case Euclid
    fibs = [1, 1]
    while fibs[-1] + fibs[-2] <= 10**9:
        fibs.append(fibs[-1] + fibs[-2])
    f_big1, f_big2 = fibs[-1], fibs[-2]  # 701408733, 433494437

    tests = [
        # 3 public samples
        {"input": make_inp([12, 18, 24, 30], 12, 18), "hidden": False, "expected": "6\n36", "checkBrute": True},
        {"input": make_inp([15, 25, 35], 1000000000, 999999999), "hidden": False, "expected": "5\n999999999000000000", "checkBrute": True},
        {"input": make_inp([42], 7, 14), "hidden": False, "expected": "42\n14", "checkBrute": True},
        # 5 corner / edge / overflow cases
        {"input": make_inp([1, 1000000000], 1, 1), "hidden": True, "checkBrute": True},
        {"input": make_inp([1000000000] * 10, 1000000000, 1000000000), "hidden": True, "checkBrute": True},
        {"input": make_inp([999999937, 999999929], 999999937, 999999929), "hidden": True, "checkBrute": True},
        {"input": make_inp([f_big1, f_big2, f_big1], f_big1, f_big2), "hidden": True, "checkBrute": True},
        {"input": make_inp([2**29, 2**28, 2**27, 2**26], 2**29, 3**18), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests (all < 145 KB)
        {"input": make_inp([36 * rng.randint(1, 500) for _ in range(200)], 840, 1260), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(1, 10**6) for _ in range(1000)], 999983, 999979), "hidden": True, "checkBrute": False},
        {"input": make_inp([720720 * rng.randint(1, 1000) for _ in range(5000)], 720720, 999999937), "hidden": True, "checkBrute": False},
        {"input": make_inp([123456 * rng.randint(1, 8000) for _ in range(12000)], 999999998, 999999996), "hidden": True, "checkBrute": False},
        # Large N with 10^9 values (~138 KB)
        {"input": make_inp([999983 * rng.randint(1, 1000) for _ in range(13000)], 999999937, 999999929), "hidden": True, "checkBrute": False},
        # Large N = 40,000 small multiples of 6 (~120 KB)
        {"input": make_inp([6 * rng.randint(1, 15) for _ in range(40000)], 1000000000, 999999997), "hidden": True, "checkBrute": False},
        # Large N = 45,000 all multiples of 12 except last element forces gcd=4 (~135 KB)
        {"input": make_inp([12 * rng.randint(1, 8) for _ in range(44999)] + [8], f_big1, f_big2), "hidden": True, "checkBrute": False},
        # Large N = 13,000 all huge near 10^9 with gcd = 1 at very end (~142 KB)
        {"input": make_inp([1000000000 - 2 * (i % 500) for i in range(12999)] + [999999937], 999999999, 999999998), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp([rng.randint(1, 5000) for _ in range(rng.randint(1, 40))], rng.randint(1, 10**6), rng.randint(1, 10**6))
        for _ in range(6)
    ]

    statement = r"""
Trung tâm điều hành giao thông thành phố quản lý $N$ tuyến xe buýt nội đô, trong đó tuyến thứ $i$ xuất bến đều đặn sau mỗi $a_i$ phút. Để đồng bộ hóa lịch bảo trì đồng hồ trạm, trung tâm cần tìm khoảng thời gian lớn nhất $G$ (tính bằng phút) sao cho mọi chu kỳ $a_i$ đều là bội của $G$ — nói cách khác $G = \gcd(a_1, a_2, \dots, a_N)$.

Ngoài ra, thành phố còn có hai tuyến xe buýt nhanh liên tỉnh cùng xuất phát lúc $0$ giờ với chu kỳ lần lượt là $A$ phút và $B$ phút. Hãy xác định khoảng thời gian ngắn nhất $L$ (tính bằng phút) để hai tuyến xe buýt nhanh này lại cùng xuất phát một lần nữa — tức $L = \operatorname{lcm}(A, B)$.

### Dữ liệu vào
- Dòng đầu tiên chứa ba số nguyên dương $N, A, B$ ($1 \le N \le 10^5,\; 1 \le A, B \le 10^9$).
- Dòng thứ hai chứa $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 10^9$).

### Kết quả
- Dòng thứ nhất in ra $\gcd(a_1, a_2, \dots, a_N)$.
- Dòng thứ hai in ra $\operatorname{lcm}(A, B)$.

### Ràng buộc
- $1 \le N \le 10^5$
- $1 \le a_i, A, B \le 10^9$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 10^3,\; a_i, A, B \le 10^4$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ở ví dụ 1: $\gcd(12, 18, 24, 30) = 6$ và $\operatorname{lcm}(12, 18) = 36$.
- Ở ví dụ 2: $\gcd(15, 25, 35) = 5$; hai số $10^9$ và $10^9 - 1$ nguyên tố cùng nhau nên $\operatorname{lcm} = 10^9 \cdot (10^9 - 1) = 999\,999\,999\,000\,000\,000$.
- Ở ví dụ 3: Với $N = 1$, ước chung lớn nhất của mảng chính là phần tử duy nhất $42$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Phép toán $\gcd$ có tính kết hợp: $\gcd(a_1, a_2, \dots, a_N) = \gcd(\dots \gcd(a_1, a_2), \dots, a_N)$. Đồng thời $\operatorname{lcm}(A, B) = \frac{A \cdot B}{\gcd(A, B)}$.

**Gợi ý 2 (Thuật toán):**
Dùng thuật toán Euclid (hoặc hàm `std::gcd` trong C++17 / `math.gcd` trong Python) để gộp dần $g = \gcd(g, a_i)$ qua một lần duyệt mảng $O(N + \log(\max a_i))$. Khi $g = 1$ có thể dừng sớm.

**Gợi ý 3 (Cài đặt & bẫy):**
- Khi $A, B \approx 10^9$ và $\gcd(A, B) = 1$, tích $A \cdot B \approx 10^{18}$ sẽ **tràn kiểu `int` 32-bit**! Bắt buộc dùng `long long` (64-bit).
- Luôn viết `(A / gcd(A, B)) * B` (chia trước, nhân sau) thay vì `(A * B) / gcd(A, B)` để tránh tràn trung gian ở các bài có giới hạn lớn hơn.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    long long A, B;
    if (!(cin >> n >> A >> B)) return 0;

    long long g = 0;
    for (int i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        g = std::gcd(g, x);
    }
    long long l = (A / std::gcd(A, B)) * B;
    cout << g << '\n' << l << '\n';
    return 0;
}
"""

    py_sol = r"""import math
import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    a = int(data[1])
    b = int(data[2])

    g = 0
    for i in range(3, 3 + n):
        g = math.gcd(g, int(data[i]))
        if g == 1:
            break

    l = (a // math.gcd(a, b)) * b
    sys.stdout.write(f"{g}\n{l}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-bus-cycle-gcd-lcm",
        "title": "Chu kỳ xe buýt: GCD & LCM",
        "shortDescription": "Tính ước chung lớn nhất của mảng N phần tử và bội chung nhỏ nhất của hai số lớn tới 10^9.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.gcd_lcm",
        "tags": ["số học", "gcd-lcm", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 10^5, 1 <= a_i, A, B <= 10^9",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p02,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 3: cp01-perfect-squares-range (easy, algo.special_numbers)
# ============================================================================
def build_p03() -> Dict[str, Any]:
    rng = random.Random(10303)

    def make_inp(pairs: List[tuple[int, int]]) -> str:
        return f"{len(pairs)}\n" + "\n".join(f"{l} {r}" for l, r in pairs) + "\n"

    def brute_p03(inp: str) -> str:
        toks = list(map(int, inp.split()))
        t = toks[0]
        out = []
        idx = 1
        for _ in range(t):
            l, r = toks[idx], toks[idx + 1]
            idx += 2
            cnt = 0
            k = 1
            while k * k <= r:
                if k * k >= l:
                    cnt += 1
                k += 1
            out.append(str(cnt))
        return "\n".join(out)

    # Precision trap pairs where IEEE-754 double (53-bit mantissa) fails!
    double_traps: List[tuple[int, int]] = []
    for k in [
        10**9, 10**9 - 1, 10**9 - 2, 10**9 - 7,
        999_999_937, 949_062_66, 2**26 + 1, 2**27 - 1, 2**29 - 1, 500_000_001,
    ]:
        sq = k * k
        if sq <= 10**18:
            double_traps.append((1, sq - 1))
            double_traps.append((1, sq))
            double_traps.append((sq - 1, sq - 1))
            double_traps.append((sq, sq))
            double_traps.append((sq - 1, sq))
            if sq + 1 <= 10**18:
                double_traps.append((sq, sq + 1))
                double_traps.append((sq + 1, sq + 1))
                double_traps.append((sq - 1, sq + 1))

    # T = 3500 precision traps near 10^18 (~135 KB)
    t14_pairs = list(double_traps)
    while len(t14_pairs) < 3500:
        k = rng.randint(5 * 10**8, 10**9 - 1)
        off1 = rng.randint(-3, 3)
        off2 = rng.randint(-3, 3)
        l = max(1, min(10**18, k * k + off1))
        r = max(1, min(10**18, (k + rng.randint(0, 5)) ** 2 + off2))
        if l > r:
            l, r = r, l
        t14_pairs.append((l, r))

    # T = 10,000 compact max-query test (< 140 KB)
    t15_pairs = list(double_traps[:50])
    while len(t15_pairs) < 10_000:
        l = rng.randint(1, 50_000)
        r = rng.randint(l, 999_999)
        t15_pairs.append((l, r))

    # T = 3500 full random up to 10^18 (~135 KB)
    t16_pairs = [
        (1, 10**18),
        (1, 10**18 - 1),
        (10**18 - 1, 10**18 - 1),
        (10**18 - 1, 10**18),
        (10**18, 10**18),
    ]
    while len(t16_pairs) < 3500:
        a = rng.randint(1, 10**18)
        b = rng.randint(1, 10**18)
        if a > b:
            a, b = b, a
        t16_pairs.append((a, b))

    tests = [
        # 3 public samples
        {"input": make_inp([(1, 10), (4, 16), (5, 8)]), "hidden": False, "expected": "3\n3\n0", "checkBrute": True},
        {"input": make_inp([(1, 10**18), (1, 10**18 - 1)]), "hidden": False, "expected": "1000000000\n999999999", "checkBrute": False},
        {"input": make_inp([(1, 1), (2, 3), (9, 9)]), "hidden": False, "expected": "1\n0\n1", "checkBrute": True},
        # 5 corner / edge / double-precision trap tests
        {"input": make_inp([(10**18, 10**18), (10**18 - 1, 10**18 - 1), (10**18 - 1, 10**18)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(double_traps), "hidden": True, "checkBrute": False},
        {"input": make_inp([(k * k - 1, k * k + 1) for k in range(2, 52)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(k * k + 1, (k + 1) ** 2 - 1) for k in range(1, 51)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(10**16 - 1, 10**16 + 1), (2**53 - 10, 2**53 + 10), (999999998000000000, 999999998000000002)]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests
        {"input": make_inp([(rng.randint(1, 500), rng.randint(500, 10000)) for _ in range(100)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(rng.randint(1, 10**6), rng.randint(1, 10**6)) for _ in range(200)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(min(a, b), max(a, b)) for a, b in ((rng.randint(1, 10**9), rng.randint(1, 10**9)) for _ in range(1000))]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(min(a, b), max(a, b)) for a, b in ((rng.randint(1, 10**15), rng.randint(1, 10**15)) for _ in range(2000))]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(k * k - 1, (k + 100) ** 2) for k in range(10**8, 10**8 + 3000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14_pairs), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15_pairs), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16_pairs), "hidden": True, "checkBrute": False},
    ]
    # Fix test 10 so l <= r
    t10_pairs = []
    for _ in range(200):
        a = rng.randint(1, 10**6)
        b = rng.randint(1, 10**6)
        t10_pairs.append((min(a, b), max(a, b)))
    tests[9]["input"] = make_inp(t10_pairs)

    extra_stress = []
    for _ in range(5):
        ps = []
        for _ in range(40):
            a = rng.randint(1, 5000)
            b = rng.randint(1, 5000)
            ps.append((min(a, b), max(a, b)))
        extra_stress.append(make_inp(ps))

    statement = r"""
Trên một hành lang dài vô hạn, các tủ đồ được đánh số liên tiếp từ $1, 2, 3, \dots$. Một số tủ mang **số chính phương** (tức có dạng $k^2$ với $k$ là số nguyên dương) được sơn màu vàng để làm mốc đánh dấu.

Cho $T$ truy vấn, mỗi truy vấn gồm một đoạn chỉ số $[L, R]$. Hãy đếm xem có bao nhiêu tủ đồ được sơn màu vàng (tức bao nhiêu số chính phương) nằm trong đoạn $[L, R]$ (tính cả hai đầu mút $L$ và $R$).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 10^4$) — số lượng truy vấn.
- $T$ dòng tiếp theo, mỗi dòng chứa hai số nguyên dương $L, R$ ($1 \le L \le R \le 10^{18}$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng in ra một số nguyên là số lượng số chính phương trong đoạn $[L, R]$ tương ứng.

### Ràng buộc
- $1 \le T \le 10^4$
- $1 \le L \le R \le 10^{18}$

### Subtasks
- **Subtask 1 (30% số điểm):** $T \le 100,\; R \le 10^6$.
- **Subtask 2 (30% số điểm):** $R \le 10^{12}$.
- **Subtask 3 (40% số điểm):** Không có ràng buộc bổ sung ($R \le 10^{18}$ — yêu cầu tính căn bậc hai nguyên chính xác tuyệt đối).

**Giải thích ví dụ:**
- Ở ví dụ 1: Trong $[1, 10]$ có $3$ số chính phương là $1, 4, 9$; trong $[4, 16]$ có $4, 9, 16$; trong $[5, 8]$ không có số chính phương nào.
- Ở ví dụ 2: $10^{18} = (10^9)^2$ là số chính phương thứ $10^9$, nên $[1, 10^{18}]$ có $10^9$ số chính phương còn $[1, 10^{18} - 1]$ chỉ có $999\,999\,999$ số.
- Ở ví dụ 3: Kiểm tra biên $L = R$ là số chính phương ($1, 9$) hoặc không ($[2, 3]$).
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Số lượng số chính phương không vượt quá $X$ chính là $\lfloor \sqrt{X} \rfloor$. Vì vậy số lượng số chính phương trong đoạn $[L, R]$ bằng:
$$\lfloor \sqrt{R} \rfloor - \lfloor \sqrt{L - 1} \rfloor$$

**Gợi ý 2 (Thuật toán):**
Trả lời mỗi truy vấn trong $O(1)$ hoặc $O(\log R)$ bằng hàm căn bậc hai nguyên chính xác $\operatorname{isqrt}(X) = \max\{k \ge 0 : k^2 \le X\}$.

**Gợi ý 3 (Cài đặt & bẫy):**
- **Bẫy sai số dấu phẩy động (`double`):** Kiểu `double` 64-bit chỉ giữ chính xác tối đa 53 bit phần định trị ($\approx 9 \cdot 10^{15}$). Khi $X = 10^{18} - 1$, ép kiểu `(double)X` bị làm tròn thành $10^{18}$, dẫn tới `sqrt((double)X)` trả về $10^9$ thay vì $999\,999\,999$!
- **Cách khắc phục:** Trong Python 3 dùng `math.isqrt(x)`. Trong C++ lấy ước lượng ban đầu `r = (long long)sqrtl((long double)x)` rồi hiệu chỉnh chính xác bằng hai vòng lặp `while (r + 1 <= x / (r + 1)) ++r;` và `while (r > 0 && r > x / r) --r;`.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

long long isqrt_exact(long long x) {
    if (x <= 0) return 0;
    long long r = (long long)sqrtl((long double)x);
    while (r + 1 <= x / (r + 1)) ++r;
    while (r > 0 && r > x / r) --r;
    return r;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        long long L, R;
        cin >> L >> R;
        cout << (isqrt_exact(R) - isqrt_exact(L - 1)) << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import math
import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    out = []
    idx = 1
    isqrt = math.isqrt
    for _ in range(t):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        out.append(str(isqrt(r) - isqrt(l - 1)))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-perfect-squares-range",
        "title": "Đếm số chính phương trong đoạn",
        "shortDescription": "Trả lời T truy vấn đếm số lượng số chính phương trong đoạn [L, R] với R lên tới 10^18 mà không bị sai số dấu phẩy động.",
        "difficulty": "easy",
        "estimatedTime": 15,
        "skillId": "algo.special_numbers",
        "tags": ["số học", "toán học", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= T <= 10^4, 1 <= L <= R <= 10^18",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p03,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 4: cp01-prime-factorization-max (medium, algo.prime_factorization)
# ============================================================================
def build_p04() -> Dict[str, Any]:
    rng = random.Random(10404)
    primes_100k = _sieve_primes(100_000)

    def make_inp(nums: List[int]) -> str:
        return f"{len(nums)}\n" + "\n".join(str(x) for x in nums) + "\n"

    def brute_p04(inp: str) -> str:
        # Independent plain trial division without sieve + self-check
        toks = inp.split()
        t = int(toks[0])
        out = []
        for i in range(1, t + 1):
            n = int(toks[i])
            x = n
            parts = []
            d = 2
            while d * d <= x:
                if x % d == 0:
                    e = 0
                    while x % d == 0:
                        x //= d
                        e += 1
                    parts.append(f"{d}^{e}" if e > 1 else str(d))
                d += 1 if d == 2 else 2
            if x > 1:
                parts.append(str(x))
            out.append(" * ".join(parts))
        return "\n".join(out)

    primorial_11 = 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31  # 200560490130
    large_primes = [
        999_999_999_989, 999_999_999_961, 999_999_999_959, 999_999_999_887,
        999_999_999_863, 999_999_999_853, 999_999_999_797, 999_999_999_769,
    ]

    t14 = [rng.randint(10**8, 10**11) for _ in range(200)]
    t15 = []
    for k in range(200):
        if k < 16:
            t15.append(large_primes[k % len(large_primes)])
        elif k < 40:
            p = primes_100k[-1 - k]
            q = primes_100k[-2 - k]
            t15.append(p * q)
        elif k < 70:
            p = primes_100k[-1 - k]
            t15.append(p * p)
        else:
            t15.append(rng.randint(10**11, 10**12))

    t16 = [
        2, 10**12, 999_999_999_989, 999_983 * 999_983, 999_979 * 999_983,
        primorial_11, 2**39, 3**25, 5**17, 7**14, 11**11, 13**10,
        2**20 * 953674, 999_999_937 * 1000,
    ]
    while len(t16) < 200:
        t16.append(rng.randint(5 * 10**11, 10**12))

    tests = [
        # 3 public samples
        {"input": make_inp([12, 13, 360]), "hidden": False, "expected": "2^2 * 3\n13\n2^3 * 3^2 * 5", "checkBrute": True},
        {"input": make_inp([2, 1000000000000, 999999999989]), "hidden": False, "expected": "2\n2^12 * 5^12\n999999999989", "checkBrute": False},
        {"input": make_inp([200560490130, 999966000289]), "hidden": False, "expected": "2 * 3 * 5 * 7 * 11 * 13 * 17 * 19 * 23 * 29 * 31\n999983^2", "checkBrute": False},
        # 5 corner / edge / trap cases
        {"input": make_inp([2, 3, 4, 5, 6, 7, 8, 9, 10]), "hidden": True, "checkBrute": True},
        {"input": make_inp([2**i for i in range(1, 40)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([3**25, 5**17, 7**14, 11**11, 13**10, 17**9, 19**9, 23**8]), "hidden": True, "checkBrute": False},
        {"input": make_inp(large_primes), "hidden": True, "checkBrute": False},
        {"input": make_inp([999_983 * 999_983, 999_979 * 999_983, 999_961 * 999_979, primorial_11, primorial_11 * 4]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests
        {"input": make_inp(list(range(2, 102))), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(2, 100_000) for _ in range(100)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(10**5, 10**7) for _ in range(150)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(10**7, 10**9) for _ in range(200)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([p * q for p, q in zip(primes_100k[-200:], reversed(primes_100k[-200:]))]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp([rng.randint(2, 10**6) for _ in range(50)]) for _ in range(5)
    ]

    statement = r"""
Theo Định lý cơ bản của Số học, mọi số nguyên dương $N \ge 2$ đều có thể biểu diễn duy nhất dưới dạng tích các lũy thừa của các số nguyên tố theo thứ tự tăng dần:
$$N = p_1^{e_1} \cdot p_2^{e_2} \cdots p_k^{e_k} \qquad (p_1 < p_2 < \dots < p_k,\; e_i \ge 1)$$

Cho $T$ số nguyên dương $N$. Với mỗi số, hãy in ra dạng phân tích thừa số nguyên tố chuẩn của nó theo quy ước:
- Các thừa số viết theo thứ tự $p_i$ tăng dần, phân cách nhau bởi chuỗi `" * "` (có dấu cách trước và sau dấu `*`).
- Nếu $e_i > 1$ thì viết `pi^ei`; nếu $e_i = 1$ thì chỉ viết `pi` (không ghi `^1`).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 200$).
- $T$ dòng tiếp theo, mỗi dòng chứa một số nguyên dương $N$ ($2 \le N \le 10^{12}$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng là biểu diễn phân tích thừa số nguyên tố của số $N$ tương ứng.

### Ràng buộc
- $1 \le T \le 200$
- $2 \le N \le 10^{12}$

### Subtasks
- **Subtask 1 (40% số điểm):** $T \le 50,\; N \le 10^6$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung ($T \le 200,\; N \le 10^{12}$).

**Giải thích ví dụ:**
- Ở ví dụ 1: $12 = 2^2 \cdot 3$, $13$ là số nguyên tố nên chỉ ghi `13`, và $360 = 2^3 \cdot 3^2 \cdot 5$.
- Ở ví dụ 2: $10^{12} = 2^{12} \cdot 5^{12}$ và $999\,999\,999\,989$ là số nguyên tố.
- Ở ví dụ 3: $200\,560\,490\,130$ là tích của $11$ số nguyên tố đầu tiên (tối đa số thừa số nguyên tố phân biệt trong phạm vi $10^{12}$), còn $999\,966\,000\,289 = 999\,983^2$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Một số nguyên $N \le 10^{12}$ có tối đa **một** thừa số nguyên tố lớn hơn $\sqrt{N} \le 10^6$. Sau khi chia hết mọi thừa số nguyên tố $p \le \sqrt{N}$, nếu phần còn lại $x > 1$ thì $x$ chắc chắn là số nguyên tố với số mũ $1$.

**Gợi ý 2 (Thuật toán):**
Sàng Eratosthenes trước một lần để lấy danh sách tất cả các số nguyên tố $\le 10^6$ (gồm $78\,498$ số). Với mỗi $N$, chỉ cần duyệt qua danh sách số nguyên tố này và dừng ngay khi $p^2 > x$. Tổng số phép thử giảm hơn $12$ lần so với duyệt mọi số từ $2$ đến $\sqrt{N}$.

**Gợi ý 3 (Cài đặt & bẫy):**
- Chú ý điều kiện dừng `1LL * p * p > x` phải ép kiểu `long long` để tránh tràn `int` khi $p > 46\,340$.
- Kiểm tra kỹ định dạng xuất: không in thừa khoảng trắng ở cuối dòng, không in `^1` khi số mũ bằng $1$, và nhớ xử lý phần dư `x > 1` cuối cùng (đặc biệt khi $N$ chính là số nguyên tố lớn gần $10^{12}$).
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const int LIM = 1000000;
    vector<char> is_prime(LIM + 1, 1);
    is_prime[0] = is_prime[1] = 0;
    vector<int> primes;
    primes.reserve(80000);
    for (int i = 2; i <= LIM; ++i) {
        if (is_prime[i]) {
            primes.push_back(i);
            if (1LL * i * i <= LIM) {
                for (int j = i * i; j <= LIM; j += i) {
                    is_prime[j] = 0;
                }
            }
        }
    }

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        long long x;
        cin >> x;
        bool first = true;
        for (int p : primes) {
            if (1LL * p * p > x) break;
            if (x % p == 0) {
                int e = 0;
                while (x % p == 0) {
                    x /= p;
                    ++e;
                }
                if (!first) cout << " * ";
                first = false;
                cout << p;
                if (e > 1) cout << '^' << e;
            }
        }
        if (x > 1) {
            if (!first) cout << " * ";
            cout << x;
        }
        cout << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import math
import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    nums = [int(data[i]) for i in range(1, t + 1)]

    lim = math.isqrt(max(nums)) + 1
    sieve = bytearray(b"\x01") * (lim + 1)
    if lim >= 0:
        sieve[0] = 0
    if lim >= 1:
        sieve[1] = 0
    for i in range(2, math.isqrt(lim) + 1):
        if sieve[i]:
            sieve[i * i :: i] = bytearray(((lim - i * i) // i) + 1)
    primes = [i for i, v in enumerate(sieve) if v]

    out = []
    for n in nums:
        x = n
        parts = []
        root = math.isqrt(x)
        for p in primes:
            if p > root:
                break
            if x % p == 0:
                e = 0
                while x % p == 0:
                    x //= p
                    e += 1
                parts.append(f"{p}^{e}" if e > 1 else str(p))
                root = math.isqrt(x)
        if x > 1:
            parts.append(str(x))
        out.append(" * ".join(parts))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-prime-factorization-max",
        "title": "Phân tích thừa số nguyên tố",
        "shortDescription": "Phân tích tối đa 200 số nguyên lên tới 10^12 thành tích các lũy thừa nguyên tố tăng dần.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.prime_factorization",
        "tags": ["số học", "thừa số nguyên tố", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= T <= 200, 2 <= N <= 10^12",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p04,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 5: cp01-prime-prefix-queries (medium, algo.sieve_eratosthenes)
# ============================================================================
def build_p05() -> Dict[str, Any]:
    rng = random.Random(10505)

    def make_inp(queries: List[tuple[int, int]]) -> str:
        return f"{len(queries)}\n" + "\n".join(f"{l} {r}" for l, r in queries) + "\n"

    def brute_p05(inp: str) -> str:
        toks = list(map(int, inp.split()))
        q = toks[0]
        out = []
        idx = 1
        for _ in range(q):
            l, r = toks[idx], toks[idx + 1]
            idx += 2
            cnt = 0
            for x in range(l, r + 1):
                if _is_prime_trial(x):
                    cnt += 1
            out.append(str(cnt))
        return "\n".join(out)

    # Large tests strictly < 145 KB (both input and output!)
    def rand_queries(q: int, lo: int, hi: int) -> List[tuple[int, int]]:
        res = []
        for _ in range(q):
            a = rng.randint(lo, hi)
            b = rng.randint(lo, hi)
            res.append((min(a, b), max(a, b)))
        return res

    # Wide range queries to kill O(Q * (R - L)) without prefix sums (~138 KB input, ~60 KB output)
    t14_q = [(rng.randint(1, 50_000), rng.randint(900_000, 1_000_000)) for _ in range(10_000)]
    # Full random across [1, 10^6] (~138 KB input)
    t15_q = rand_queries(10_000, 1, 1_000_000)
    # High-Q test with compact endpoints (Q = 18,000, ~142 KB input, ~50 KB output)
    t16_q = [(1, 1_000_000), (1, 1), (2, 2), (999_983, 999_983), (492_114, 492_226)]
    for _ in range(17_995):
        a = rng.randint(1, 999)
        b = rng.randint(a, 999)
        t16_q.append((a, b))

    tests = [
        # 3 public samples
        {"input": make_inp([(1, 10), (10, 20), (1, 1)]), "hidden": False, "expected": "4\n4\n0", "checkBrute": True},
        {"input": make_inp([(2, 2), (1, 100), (1, 1000000)]), "hidden": False, "expected": "1\n25\n78498", "checkBrute": False},
        {"input": make_inp([(114, 126), (999983, 1000000)]), "hidden": False, "expected": "0\n1", "checkBrute": True},
        # 5 corner / edge / trap cases
        {"input": make_inp([(1, 1), (1, 2), (2, 2), (2, 3), (3, 3), (4, 4)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(492_113, 492_227), (492_114, 492_226), (370_261, 370_373), (370_262, 370_372)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(999_982, 999_982), (999_983, 999_983), (999_984, 1_000_000), (1_000_000, 1_000_000)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(i, i) for i in range(1, 101)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(1, 10**k) for k in range(1, 7)] + [(10**k, 10**k) for k in range(1, 7)]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests
        {"input": make_inp(rand_queries(200, 1, 2000)), "hidden": True, "checkBrute": True},
        {"input": make_inp(rand_queries(500, 1, 10_000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_queries(2000, 1, 100_000)), "hidden": True, "checkBrute": False},
        {"input": make_inp(rand_queries(5000, 1, 1_000_000)), "hidden": True, "checkBrute": False},
        {"input": make_inp([(rng.randint(900_000, 999_000), rng.randint(999_000, 1_000_000)) for _ in range(9500)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14_q), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15_q), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16_q), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [make_inp(rand_queries(60, 1, 1500)) for _ in range(5)]

    statement = r"""
Hệ thống giám sát mạng gán cho mỗi gói tin một mã số nguyên dương từ $1$ đến $10^6$. Những gói tin mang mã số là **số nguyên tố** được đánh dấu là gói tin ưu tiên cao.

Cho $Q$ truy vấn thống kê, mỗi truy vấn gồm một khoảng mã số $[L, R]$. Hãy đếm nhanh số lượng số nguyên tố nằm trong đoạn $[L, R]$ cho từng truy vấn.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $Q$ ($1 \le Q \le 50\,000$) — số lượng truy vấn.
- $Q$ dòng tiếp theo, mỗi dòng chứa hai số nguyên dương $L, R$ ($1 \le L \le R \le 10^6$).

### Kết quả
- Gồm $Q$ dòng, dòng thứ $i$ in ra số lượng số nguyên tố trong đoạn $[L, R]$ của truy vấn thứ $i$.

### Ràng buộc
- $1 \le Q \le 50\,000$
- $1 \le L \le R \le 10^6$

### Subtasks
- **Subtask 1 (30% số điểm):** $Q \le 100,\; R \le 10^4$.
- **Subtask 2 (30% số điểm):** $Q \le 1000,\; R \le 10^5$.
- **Subtask 3 (40% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ở ví dụ 1: Trong $[1, 10]$ có $4$ số nguyên tố $\{2, 3, 5, 7\}$; trong $[10, 20]$ có $4$ số $\{11, 13, 17, 19\}$; số $1$ không phải số nguyên tố nên $[1, 1]$ trả về $0$.
- Ở ví dụ 2: Có đúng $25$ số nguyên tố $\le 100$ và $78\,498$ số nguyên tố $\le 10^6$.
- Ở ví dụ 3: Đoạn $[114, 126]$ không chứa số nguyên tố nào; số nguyên tố lớn nhất không vượt quá $10^6$ là $999\,983$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Nếu kiểm tra từng số trong $[L, R]$ ở mỗi truy vấn, ngay cả khi đã sàng nguyên tố sẵn thì việc duyệt từ $L$ đến $R$ vẫn mất $O(Q \cdot 10^6)$ — chắc chắn quá thời gian.

**Gợi ý 2 (Thuật toán):**
1. Dùng **Sàng Eratosthenes** một lần duy nhất cho giới hạn $M = 10^6$ trong $O(M \log \log M)$ để tạo mảng `is_prime[0..M]`.
2. Xây dựng mảng cộng dồn (prefix sum) `pref[i]` là số lượng số nguyên tố trong $[1, i]$: `pref[i] = pref[i - 1] + is_prime[i]`.
3. Mỗi truy vấn $[L, R]$ trả lời ngay trong $O(1)$ bằng `pref[R] - pref[L - 1]`.

**Gợi ý 3 (Cài đặt & bẫy):**
- Đảm bảo `is_prime[0] = is_prime[1] = 0` và `pref[0] = 0` để truy vấn với $L = 1$ không bị truy cập âm hay đếm nhầm số $1$.
- Trong C++, bật nhập xuất nhanh (`ios::sync_with_stdio(false); cin.tie(nullptr);`) và in `'\n'` thay vì `endl` để tránh TLE do I/O khi $Q$ lớn.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const int MAXN = 1000000;
    vector<char> is_prime(MAXN + 1, 1);
    is_prime[0] = is_prime[1] = 0;
    for (int i = 2; 1LL * i * i <= MAXN; ++i) {
        if (is_prime[i]) {
            for (int j = i * i; j <= MAXN; j += i) {
                is_prime[j] = 0;
            }
        }
    }

    vector<int> pref(MAXN + 1, 0);
    for (int i = 1; i <= MAXN; ++i) {
        pref[i] = pref[i - 1] + is_prime[i];
    }

    int Q;
    if (!(cin >> Q)) return 0;
    while (Q--) {
        int L, R;
        cin >> L >> R;
        cout << (pref[R] - pref[L - 1]) << '\n';
    }
    return 0;
}
"""

    py_sol = r"""import math
import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    q = int(data[0])
    ls = [0] * q
    rs = [0] * q
    max_r = 2
    idx = 1
    for i in range(q):
        l = int(data[idx])
        r = int(data[idx + 1])
        idx += 2
        ls[i] = l
        rs[i] = r
        if r > max_r:
            max_r = r

    is_prime = bytearray(b"\x01") * (max_r + 1)
    is_prime[0] = 0
    is_prime[1] = 0
    for i in range(2, math.isqrt(max_r) + 1):
        if is_prime[i]:
            is_prime[i * i :: i] = bytearray(((max_r - i * i) // i) + 1)

    pref = [0] * (max_r + 1)
    acc = 0
    for i in range(1, max_r + 1):
        if is_prime[i]:
            acc += 1
        pref[i] = acc

    out = [str(pref[rs[i]] - pref[ls[i] - 1]) for i in range(q)]
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-prime-prefix-queries",
        "title": "Truy vấn đếm số nguyên tố trên đoạn",
        "shortDescription": "Kết hợp Sàng Eratosthenes và mảng cộng dồn để trả lời Q truy vấn đếm số nguyên tố trong [L, R] với R <= 10^6.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.sieve_eratosthenes",
        "tags": ["số học", "sàng nguyên tố", "prefix sum", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= Q <= 50000, 1 <= L <= R <= 10^6",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p05,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 6: cp01-super-primes (medium, algo.sieve_eratosthenes)
# ============================================================================
def build_p06() -> Dict[str, Any]:
    rng = random.Random(10606)

    def make_inp(l: int, r: int) -> str:
        return f"{l} {r}\n"

    def brute_p06(inp: str) -> str:
        l, r = map(int, inp.split())
        cnt = 0
        total = 0
        for x in range(l, r + 1):
            y = x
            ok = True
            while y > 0:
                if not _is_prime_trial(y):
                    ok = False
                    break
                y //= 10
            if ok:
                cnt += 1
                total += x
        return f"{cnt} {total}"

    tests = [
        # 3 public samples
        {"input": make_inp(1, 50), "hidden": False, "expected": "8 137", "checkBrute": True},
        {"input": make_inp(10, 20), "hidden": False, "expected": "0 0", "checkBrute": True},
        {"input": make_inp(200, 300), "hidden": False, "expected": "3 765", "checkBrute": True},
        # 5 corner / edge / trap cases
        {"input": make_inp(1, 1), "hidden": True, "checkBrute": True},
        {"input": make_inp(1, 10), "hidden": True, "checkBrute": True},
        {"input": make_inp(239, 239), "hidden": True, "checkBrute": True},
        {"input": make_inp(7393913, 7393913), "hidden": True, "checkBrute": True},
        {"input": make_inp(8_000_000, 10_000_000), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests
        {"input": make_inp(1, 1000), "hidden": True, "checkBrute": True},
        {"input": make_inp(100, 10_000), "hidden": True, "checkBrute": True},
        {"input": make_inp(1, 100_000), "hidden": True, "checkBrute": True},
        {"input": make_inp(2333, 73939), "hidden": True, "checkBrute": True},
        {"input": make_inp(100_000, 1_000_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(1_000_000, 10_000_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(2_000_000, 7_500_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(1, 10_000_000), "hidden": True, "checkBrute": False},
    ]

    extra_stress = []
    for _ in range(8):
        a = rng.randint(1, 5000)
        b = rng.randint(a, 5000)
        extra_stress.append(make_inp(a, b))

    statement = r"""
Một số nguyên dương $X$ được gọi là **số siêu nguyên tố** nếu bản thân $X$ là số nguyên tố và mọi tiền tố thu được bằng cách lần lượt xóa chữ số tận cùng bên phải của $X$ (cho đến khi còn $1$ chữ số) cũng đều là số nguyên tố.

Ví dụ:
- $239$ là số siêu nguyên tố vì $239$, $23$ và $2$ đều là số nguyên tố.
- $19$ **không** phải số siêu nguyên tố vì khi bỏ chữ số $9$ ta được $1$ không phải số nguyên tố.
- $203$ **không** phải số siêu nguyên tố vì $20$ không phải số nguyên tố.

Cho hai số nguyên dương $L, R$. Hãy đếm số lượng số siêu nguyên tố thuộc đoạn $[L, R]$ và tính tổng của chúng. Nếu không có số siêu nguyên tố nào trong đoạn $[L, R]$, in ra `0 0`.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $L, R$ ($1 \le L \le R \le 10^7$).

### Kết quả
- Một dòng gồm hai số nguyên cách nhau bởi dấu cách: số lượng và tổng các số siêu nguyên tố trong đoạn $[L, R]$.

### Ràng buộc
- $1 \le L \le R \le 10^7$

### Subtasks
- **Subtask 1 (40% số điểm):** $R \le 10^5$.
- **Subtask 2 (60% số điểm):** $R \le 10^7$.

**Giải thích ví dụ:**
- Ở ví dụ 1: Trong $[1, 50]$ có $8$ số siêu nguyên tố là $2, 3, 5, 7, 23, 29, 31, 37$; tổng bằng $137$.
- Ở ví dụ 2: Trong $[10, 20]$ mọi số đều bắt đầu bằng chữ số $1$ hoặc là $20$ nên không có số siêu nguyên tố nào, kết quả là `0 0`.
- Ở ví dụ 3: Trong $[200, 300]$ có $3$ số siêu nguyên tố là $233, 239, 293$; tổng bằng $765$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Chữ số đầu tiên của một số siêu nguyên tố bắt buộc thuộc $\{2, 3, 5, 7\}$. Mọi chữ số tiếp theo (khi ghép thêm vào bên phải) chỉ có thể thuộc $\{1, 3, 7, 9\}$ (vì nếu kết thúc bằng chữ số chẵn hoặc $5$ thì số nhiều chữ số đó chia hết cho $2$ hoặc $5$).

**Gợi ý 2 (Thuật toán):**
Có hai cách đạt tốc độ rất cao:
- **Cách 1 (Sàng Eratosthenes + đánh dấu quy hoạch động):** Sàng `is_prime` đến $R$, rồi đặt `is_super[x] = is_prime[x] && (x < 10 || is_super[x / 10])`.
- **Cách 2 (Sàng đến $\sqrt{R}$ + BFS sinh trực tiếp):** Sàng các số nguyên tố $\le \sqrt{10^7} \approx 3163$, khởi tạo hàng đợi bằng $\{2, 3, 5, 7\}$. Với mỗi siêu nguyên tố $u$ lấy ra, thử ghép $v = 10u + d$ ($d \in \{1, 3, 7, 9\}$); nếu $v \le R$ và $v$ nguyên tố thì đưa $v$ vào hàng đợi. Thực tế có chưa tới $100$ số siêu nguyên tố trong toàn hệ thập phân!

**Gợi ý 3 (Cài đặt & bẫy):**
- Dùng kiểu `long long` cho tổng để tránh tràn số.
- Chú ý chỉ cộng vào đáp án những số siêu nguyên tố thỏa mãn đồng thời $L \le u \le R$ (nhưng vẫn phải giữ các siêu nguyên tố $< L$ trong quá trình sinh BFS vì chúng có thể mở rộng thành siêu nguyên tố nằm trong $[L, R]$!).
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long L, R;
    if (!(cin >> L >> R)) return 0;

    const int LIM = 3200; // > sqrt(10^7)
    vector<char> is_prime(LIM + 1, 1);
    is_prime[0] = is_prime[1] = 0;
    vector<int> small_primes;
    for (int i = 2; i <= LIM; ++i) {
        if (is_prime[i]) {
            small_primes.push_back(i);
            for (int j = i * i; j <= LIM; j += i) {
                is_prime[j] = 0;
            }
        }
    }

    auto check_prime = [&](long long x) -> bool {
        if (x <= LIM) return is_prime[x] != 0;
        for (int p : small_primes) {
            if (1LL * p * p > x) break;
            if (x % p == 0) return false;
        }
        return true;
    };

    queue<long long> q;
    for (int d : {2, 3, 5, 7}) {
        if (d <= R) q.push(d);
    }

    long long cnt = 0, sum = 0;
    const int next_digits[4] = {1, 3, 7, 9};
    while (!q.empty()) {
        long long u = q.front();
        q.pop();
        if (u >= L) {
            ++cnt;
            sum += u;
        }
        for (int d : next_digits) {
            long long v = u * 10 + d;
            if (v <= R && check_prime(v)) {
                q.push(v);
            }
        }
    }

    cout << cnt << ' ' << sum << '\n';
    return 0;
}
"""

    py_sol = r"""from collections import deque
import math
import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    l = int(data[0])
    r = int(data[1])

    lim = math.isqrt(r) + 1
    sieve = bytearray(b"\x01") * (lim + 1)
    if lim >= 0:
        sieve[0] = 0
    if lim >= 1:
        sieve[1] = 0
    for i in range(2, math.isqrt(lim) + 1):
        if sieve[i]:
            sieve[i * i :: i] = bytearray(((lim - i * i) // i) + 1)
    small_primes = [i for i, v in enumerate(sieve) if v]

    def is_prime(x: int) -> bool:
        if x <= lim:
            return sieve[x] == 1
        for p in small_primes:
            if p * p > x:
                break
            if x % p == 0:
                return False
        return True

    q = deque(d for d in (2, 3, 5, 7) if d <= r)
    cnt = 0
    total = 0
    while q:
        u = q.popleft()
        if u >= l:
            cnt += 1
            total += u
        base = u * 10
        if base > r:
            continue
        for d in (1, 3, 7, 9):
            v = base + d
            if v <= r and is_prime(v):
                q.append(v)

    sys.stdout.write(f"{cnt} {total}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-super-primes",
        "title": "Số siêu nguyên tố trong đoạn",
        "shortDescription": "Đếm số lượng và tính tổng các số siêu nguyên tố (mọi tiền tố đều nguyên tố) trong đoạn [L, R] tới 10^7.",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.sieve_eratosthenes",
        "tags": ["số học", "sàng nguyên tố", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= L <= R <= 10^7",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p06,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 7: cp01-max-pair-gcd (medium, algo.divisors_multiples)
# ============================================================================
def build_p07() -> Dict[str, Any]:
    rng = random.Random(10707)
    primes_200k = _sieve_primes(200_000)

    def make_inp(arr: List[int]) -> str:
        return f"{len(arr)}\n" + " ".join(str(x) for x in arr) + "\n"

    def brute_p07(inp: str) -> str:
        toks = list(map(int, inp.split()))
        n = toks[0]
        arr = toks[1 : 1 + n]
        best = 1
        for i in range(n):
            ai = arr[i]
            for j in range(i + 1, n):
                g = math.gcd(ai, arr[j])
                if g > best:
                    best = g
        return str(best)

    # Large tests strictly < 145 KB
    # Test 13: 17,000 distinct primes up to 200,000 -> ans = 1 (~115 KB)
    t13 = primes_200k[:17_000]
    rng.shuffle(t13)
    # Test 14: 20,000 values near 200,000 with hidden optimal pair (66666*2, 66666*3) -> ans = 66666 (~138 KB)
    t14 = [rng.randint(100_000, 199_999) for _ in range(19_998)] + [133_332, 199_998]
    # Make sure no larger pair exists? Better: use primes + 133332 & 199998!
    t14 = list(primes_200k[-17_980:]) + [133_332, 199_998]
    rng.shuffle(t14)
    # Test 15: N = 29,000 mixed values <= 9999 plus two 199999s -> ans = 199999 (~140 KB)
    t15 = [rng.randint(1, 9999) for _ in range(28_998)] + [199_999, 199_999]
    rng.shuffle(t15)
    # Test 16: N = 20,000 random values up to 200,000 (~135 KB)
    t16 = [rng.randint(1, 200_000) for _ in range(20_000)]

    tests = [
        # 3 public samples
        {"input": make_inp([3, 14, 15, 7, 9]), "hidden": False, "expected": "7", "checkBrute": True},
        {"input": make_inp([10, 15, 25, 4]), "hidden": False, "expected": "5", "checkBrute": True},
        {"input": make_inp([12, 18, 7]), "hidden": False, "expected": "6", "checkBrute": True},
        # 5 corner / edge / trap cases
        {"input": make_inp([1, 1]), "hidden": True, "checkBrute": True},
        {"input": make_inp([200000, 200000]), "hidden": True, "checkBrute": True},
        {"input": make_inp([99998, 149997, 7, 11, 13]), "hidden": True, "checkBrute": True},  # gcd=49999 not in array!
        {"input": make_inp([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]), "hidden": True, "checkBrute": True},
        {"input": make_inp([100000, 200000, 199999, 199993, 199967]), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests
        {"input": make_inp([rng.randint(1, 1000) for _ in range(100)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(1, 50_000) for _ in range(250)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([rng.randint(1, 200_000) for _ in range(1000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([rng.randint(1, 200_000) for _ in range(5000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t13), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp([rng.randint(1, 500) for _ in range(rng.randint(2, 60))]) for _ in range(8)
    ]

    statement = r"""
Trong một phòng thí nghiệm điện tử, có $N$ bộ phát xung nhịp với tần số nguyên dương lần lượt là $a_1, a_2, \dots, a_N$. Để đạt độ đồng bộ cao nhất, kỹ sư cần chọn ra **hai bộ phát khác nhau** $(i, j)$ với $1 \le i < j \le N$ sao cho ước chung lớn nhất $\gcd(a_i, a_j)$ đạt giá trị lớn nhất có thể.

Hãy tìm giá trị lớn nhất đó.

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $N$ ($2 \le N \le 30\,000$).
- Dòng thứ hai chứa $N$ số nguyên dương $a_1, a_2, \dots, a_N$ ($1 \le a_i \le 2 \cdot 10^5$).

### Kết quả
- Một số nguyên dương duy nhất là giá trị lớn nhất của $\gcd(a_i, a_j)$ với $1 \le i < j \le N$.

### Ràng buộc
- $2 \le N \le 30\,000$
- $1 \le a_i \le 2 \cdot 10^5$

### Subtasks
- **Subtask 1 (40% số điểm):** $N \le 1000$.
- **Subtask 2 (60% số điểm):** Không có ràng buộc bổ sung.

**Giải thích ví dụ:**
- Ở ví dụ 1: Chọn cặp $(14, 7)$ cho $\gcd(14, 7) = 7$ là lớn nhất.
- Ở ví dụ 2: Các cặp $(10, 15), (10, 25), (15, 25)$ đều có $\gcd = 5$.
- Ở ví dụ 3: Chọn cặp $(12, 18)$ cho $\gcd(12, 18) = 6$; lưu ý giá trị $6$ không nhất thiết phải xuất hiện trong mảng ban đầu.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Thay vì duyệt mọi cặp chỉ số $(i, j)$ mất $O(N^2)$, hãy đảo ngược góc nhìn: với một ứng cử viên $g$, tồn tại cặp $(i, j)$ có $\gcd(a_i, a_j)$ là bội của $g$ **khi và chỉ khi** trong mảng có ít nhất $2$ phần tử là bội của $g$.

**Gợi ý 2 (Thuật toán):**
Gọi $M = \max(a_i) \le 2 \cdot 10^5$ và `cnt[v]` là số lần xuất hiện của giá trị $v$ trong mảng. Duyệt $g$ từ $M$ giảm dần về $1$:
- Tính tổng số phần tử chia hết cho $g$ bằng cách duyệt các bội của $g$: `total = cnt[g] + cnt[2g] + cnt[3g] + ...`
- Ngay khi gặp $g$ đầu tiên thỏa mãn `total >= 2`, đó chính là đáp án lớn nhất!
Độ phức tạp thời gian là $O\!\left(N + \sum_{g=1}^{M} \frac{M}{g}\right) = O(N + M \ln M)$.

**Gợi ý 3 (Cài đặt & bẫy):**
- **Không được loại bỏ phần tử trùng nhau!** Nếu cùng một giá trị $x$ xuất hiện $2$ lần trong mảng thì cặp $(x, x)$ hoàn toàn hợp lệ và có $\gcd(x, x) = x$.
- Trong vòng lặp đếm bội của $g$, có thể thoát sớm ngay khi `total >= 2` để chạy nhanh hơn nữa.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    int max_val = 0;
    vector<int> a(n);
    for (int i = 0; i < n; ++i) {
        cin >> a[i];
        if (a[i] > max_val) max_val = a[i];
    }

    vector<int> cnt(max_val + 1, 0);
    for (int x : a) ++cnt[x];

    for (int g = max_val; g >= 1; --g) {
        int mults = 0;
        for (int m = g; m <= max_val; m += g) {
            mults += cnt[m];
            if (mults >= 2) {
                cout << g << '\n';
                return 0;
            }
        }
    }
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    arr = [int(data[i]) for i in range(1, n + 1)]
    max_val = max(arr)

    cnt = [0] * (max_val + 1)
    for x in arr:
        cnt[x] += 1

    for g in range(max_val, 0, -1):
        mults = 0
        for m in range(g, max_val + 1, g):
            c = cnt[m]
            if c:
                mults += c
                if mults >= 2:
                    sys.stdout.write(f"{g}\n")
                    return


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-max-pair-gcd",
        "title": "Cặp số có ước chung lớn nhất cực đại",
        "shortDescription": "Tìm max gcd(a_i, a_j) trên mọi cặp phần tử phân biệt trong mảng bằng kỹ thuật sàng bội O(M log M).",
        "difficulty": "medium",
        "estimatedTime": 20,
        "skillId": "algo.divisors_multiples",
        "tags": ["số học", "ước bội", "tối ưu", "tầng 1"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 2 <= N <= 30000, 1 <= a_i <= 2*10^5",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p07,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 8: cp01-power-tower-mod (hard, algo.divide_conquer_mod)
# ============================================================================
def build_p08() -> Dict[str, Any]:
    rng = random.Random(10808)
    MOD = 1_000_000_007

    def make_inp(triples: List[tuple[int, int, int]]) -> str:
        return f"{len(triples)}\n" + "\n".join(f"{a} {b} {c}" for a, b, c in triples) + "\n"

    def brute_p08(inp: str) -> str:
        # Independent exact big-integer evaluation (for small b^c)
        toks = list(map(int, inp.split()))
        t = toks[0]
        out = []
        idx = 1
        for _ in range(t):
            a, b, c = toks[idx], toks[idx + 1], toks[idx + 2]
            idx += 3
            exp = 1 if c == 0 else (0 if b == 0 else b**c)
            val = 1 if exp == 0 else pow(a, exp, MOD)
            out.append(str(val % MOD))
        return "\n".join(out)

    # All 8 zero/non-zero boundary combinations + tricky Fermat traps
    zero_combos = [
        (0, 0, 0), (0, 0, 1), (0, 0, 10**9),
        (0, 1, 0), (0, 5, 0), (0, 10**9, 0),
        (0, 1, 1), (0, 2, 10**9), (0, 10**9, 10**9),
        (1, 0, 0), (1, 0, 5), (1, 5, 0), (1, 10**9, 10**9),
        (7, 0, 0), (7, 0, 1), (7, 0, 10**9),
        (7, 1, 0), (7, 5, 0), (10**9, 0, 0), (10**9, 0, 1),
    ]

    # Cases where b^c >= MOD - 1 so using mod MOD instead of MOD - 1 FAILS!
    fermat_traps = [
        (2, 2, 30), (2, 10, 9), (3, 10**9, 1), (2, 10**9, 2),
        (5, 999_999_999, 999_999_999), (10**9, 10**9, 10**9),
        (2, 500_000_003, 1), (2, 500_000_003, 2),
        (3, 1_000_000_000, 1_000_000_000), (999_999_937, 999_999_929, 999_999_893),
    ]

    # Large tests strictly < 145 KB:
    # T = 4000 full-scale up to 10^9 (~120 KB)
    t14 = [(rng.randint(0, 10**9), rng.randint(0, 10**9), rng.randint(0, 10**9)) for _ in range(4000)]
    # T = 5000 mixed (0-traps + medium + huge, ~132 KB)
    t15 = list(zero_combos) + list(fermat_traps)
    while len(t15) < 5000:
        if len(t15) % 4 == 0:
            t15.append((rng.randint(0, 10**9), rng.randint(0, 10**9), rng.randint(0, 10**9)))
        else:
            t15.append((rng.randint(0, 10**7), rng.randint(0, 10**7), rng.randint(0, 10**7)))
    # T = 4500 max-value stress (~135 KB)
    t16 = [
        (0, 0, 0), (0, 0, 10**9), (0, 10**9, 0), (0, 10**9, 10**9),
        (10**9, 0, 0), (10**9, 0, 10**9), (10**9, 10**9, 0), (10**9, 10**9, 10**9),
    ]
    while len(t16) < 4500:
        t16.append((rng.randint(10**8, 10**9), rng.randint(10**8, 10**9), rng.randint(10**8, 10**9)))

    tests = [
        # 3 public samples
        {"input": make_inp([(3, 2, 3), (2, 3, 2), (0, 0, 0), (0, 0, 5)]), "hidden": False, "expected": "6561\n512\n0\n1", "checkBrute": True},
        {"input": make_inp([(2, 10, 9), (1000000000, 1000000000, 1000000000)]), "hidden": False, "expected": None, "checkBrute": False},
        {"input": make_inp([(5, 0, 0), (5, 0, 3), (0, 5, 0), (0, 5, 3)]), "hidden": False, "expected": "5\n1\n0\n0", "checkBrute": True},
        # 5 corner / edge / Fermat-trap cases
        {"input": make_inp(zero_combos), "hidden": True, "checkBrute": False},
        {"input": make_inp([(a, b, c) for a in range(4) for b in range(4) for c in range(4)]), "hidden": True, "checkBrute": True},
        {"input": make_inp(fermat_traps), "hidden": True, "checkBrute": False},
        {"input": make_inp([(2, 2, c) for c in range(0, 35)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(rng.randint(2, 10**9), 1, rng.randint(0, 10**9)) for _ in range(50)]), "hidden": True, "checkBrute": False},
        # 8 medium -> large tests
        {"input": make_inp([(rng.randint(0, 100), rng.randint(0, 7), rng.randint(0, 5)) for _ in range(100)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(rng.randint(0, 10**9), rng.randint(0, 6), rng.randint(0, 6)) for _ in range(200)]), "hidden": True, "checkBrute": True},
        {"input": make_inp([(rng.randint(0, 10**9), rng.randint(0, 10**6), rng.randint(0, 10**6)) for _ in range(1000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(rng.randint(1, 10**9), rng.randint(1, 10**9), rng.randint(1, 10**9)) for _ in range(2000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp([(0, rng.randint(0, 10**9), rng.randint(0, 10**9)) for _ in range(2000)]), "hidden": True, "checkBrute": False},
        {"input": make_inp(t14), "hidden": True, "checkBrute": False},
        {"input": make_inp(t15), "hidden": True, "checkBrute": False},
        {"input": make_inp(t16), "hidden": True, "checkBrute": False},
    ]
    # Compute exact sample 2 expected via Python exact modular arithmetic
    s2_1 = pow(2, pow(10, 9, MOD - 1), MOD)
    s2_2 = pow(10**9, pow(10**9, 10**9, MOD - 1), MOD)
    tests[1]["expected"] = f"{s2_1}\n{s2_2}"

    extra_stress = [
        make_inp([(rng.randint(0, 20), rng.randint(0, 6), rng.randint(0, 5)) for _ in range(60)])
        for _ in range(6)
    ]

    statement = r"""
Trong mật mã học mô-đun, các phép lũy thừa lồng nhau (tháp lũy thừa) thường xuất hiện khi tính khóa phiên nhiều tầng.

Cho $T$ truy vấn, mỗi truy vấn gồm ba số nguyên không âm $a, b, c$. Hãy tính giá trị:
$$a^{\left(b^c\right)} \bmod (10^9 + 7)$$
với quy ước toán học $0^0 = 1$ (chú ý phép lũy thừa kết hợp từ phải sang trái: $a^{b^c} = a^{(b^c)}$).

### Dữ liệu vào
- Dòng đầu tiên chứa số nguyên dương $T$ ($1 \le T \le 5000$).
- $T$ dòng tiếp theo, mỗi dòng chứa ba số nguyên không âm $a, b, c$ ($0 \le a, b, c \le 10^9$).

### Kết quả
- Gồm $T$ dòng, mỗi dòng in ra kết quả $a^{(b^c)} \bmod (10^9 + 7)$.

### Ràng buộc
- $1 \le T \le 5000$
- $0 \le a, b, c \le 10^9$

### Subtasks
- **Subtask 1 (30% số điểm):** $b, c \le 5$.
- **Subtask 2 (30% số điểm):** $a, b, c \ge 1$.
- **Subtask 3 (40% số điểm):** Không có ràng buộc bổ sung (bao gồm các trường hợp biên chứa số $0$).

**Giải thích ví dụ:**
- Ở ví dụ 1: $3^{(2^3)} = 3^8 = 6561$; $2^{(3^2)} = 2^9 = 512$; $0^{(0^0)} = 0^1 = 0$; $0^{(0^5)} = 0^0 = 1$.
- Ở ví dụ 2: Minh họa trường hợp số mũ $b^c \ge 10^9 + 6$, cần rút gọn số mũ theo $P - 1 = 10^9 + 6$.
- Ở ví dụ 3: Minh họa đầy đủ các trường hợp biên với $a = 0$ hoặc $b = 0$ hoặc $c = 0$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Đặt $P = 10^9 + 7$ là số nguyên tố. Khi $\gcd(a, P) = 1$, theo **Định lý Fermat nhỏ** ta có $a^{P - 1} \equiv 1 \pmod{P}$. Do đó có thể rút gọn số mũ $b^c$ theo mô-đun $P - 1 = 10^9 + 6$, **không phải** theo mô-đun $P$!

**Gợi ý 2 (Thuật toán):**
Phân chia rành mạch các trường hợp biên trước khi áp dụng định lý Fermat:
1. Nếu $c = 0$: vì $b^0 = 1$ (kể cả khi $b = 0$ theo quy ước $0^0 = 1$), đáp án là $a^1 \bmod P = a \bmod P$.
2. Ngược lại ($c \ge 1$), nếu $b = 0$: vì $0^c = 0$, đáp án là $a^0 = 1$ (kể cả khi $a = 0$).
3. Ngược lại ($b \ge 1, c \ge 1$), ta chắc chắn $b^c \ge 1$:
   - Nếu $a \equiv 0 \pmod{P}$ thì đáp án là $0$.
   - Ngược lại, tính $e = b^c \bmod (P - 1)$ rồi tính $a^e \bmod P$ bằng lũy thừa nhị phân trong $O(\log c + \log P)$.

**Gợi ý 3 (Cài đặt & bẫy):**
- **Bẫy 1:** Quên kiểm tra $a \equiv 0 \pmod{P}$ trước khi rút gọn $e = b^c \bmod (P - 1)$ có thể làm ra $0^0 = 1$ sai khi $b^c > 0$ chia hết cho $P - 1$.
- **Bẫy 2:** Nhầm lẫn thứ tự `0^(0^0) = 0^1 = 0` với `0^(0^5) = 0^0 = 1`.
- **Bẫy 3:** Trong C++, dùng `long long` trong phép nhân `(res * base) % mod` vì $(10^9 + 6)^2 \approx 10^{18}$ vừa khít trong `long long` nhưng tràn `int`.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

static const long long MOD = 1000000007LL;

long long modpow(long long base, long long exp, long long mod) {
    long long res = 1 % mod;
    base %= mod;
    while (exp > 0) {
        if (exp & 1LL) res = (res * base) % mod;
        base = (base * base) % mod;
        exp >>= 1LL;
    }
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int T;
    if (!(cin >> T)) return 0;
    while (T--) {
        long long a, b, c;
        cin >> a >> b >> c;
        if (c == 0) {
            cout << (a % MOD) << '\n';
        } else if (b == 0) {
            cout << 1 << '\n';
        } else if (a % MOD == 0) {
            cout << 0 << '\n';
        } else {
            long long e = modpow(b, c, MOD - 1);
            cout << modpow(a, e, MOD) << '\n';
        }
    }
    return 0;
}
"""

    py_sol = r"""import sys

MOD = 1_000_000_007
PHI = MOD - 1


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    t = int(data[0])
    out = []
    idx = 1
    for _ in range(t):
        a = int(data[idx])
        b = int(data[idx + 1])
        c = int(data[idx + 2])
        idx += 3
        if c == 0:
            out.append(str(a % MOD))
        elif b == 0:
            out.append("1")
        elif a % MOD == 0:
            out.append("0")
        else:
            e = pow(b, c, PHI)
            out.append(str(pow(a, e, MOD)))
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-power-tower-mod",
        "title": "Tháp lũy thừa mô-đun",
        "shortDescription": "Tính a^(b^c) mod (10^9+7) cho tối đa 5000 truy vấn bằng Định lý Fermat nhỏ và xử lý chặt các bẫy số 0.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.divide_conquer_mod",
        "tags": ["số học", "chia để trị", "modulo", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= T <= 5000, 0 <= a, b, c <= 10^9",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p08,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 9: cp01-trailing-zeros-base-k (hard, algo.prime_factorization)
# ============================================================================
def build_p09() -> Dict[str, Any]:
    rng = random.Random(10909)

    def make_inp(n: int, b: int) -> str:
        return f"{n} {b}\n"

    def brute_p09(inp: str) -> str:
        # Independent exact big-integer factorial division
        n, b = map(int, inp.split())
        f = math.factorial(n)
        cnt = 0
        while f % b == 0:
            f //= b
            cnt += 1
        return str(cnt)

    tests = [
        # 3 public samples
        {"input": make_inp(10, 10), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": make_inp(10, 8), "hidden": False, "expected": "2", "checkBrute": True},
        {"input": make_inp(100, 768), "hidden": False, "expected": "12", "checkBrute": True},
        # 5 corner / edge / overflow / bottleneck trap cases
        {"input": make_inp(1, 2), "hidden": True, "checkBrute": True},
        {"input": make_inp(5, 12), "hidden": True, "checkBrute": True},
        {"input": make_inp(6, 12), "hidden": True, "checkBrute": True},
        {"input": make_inp(999_999_999_988, 999_999_999_989), "hidden": True, "checkBrute": False},  # N < B -> 0
        {"input": make_inp(999_999_999_989, 999_999_999_989), "hidden": True, "checkBrute": False},  # N == B -> 1
        # 8 medium -> large tests
        {"input": make_inp(500, 360), "hidden": True, "checkBrute": True},
        {"input": make_inp(1500, 2**10 * 3), "hidden": True, "checkBrute": True},
        {"input": make_inp(10**18, 2), "hidden": True, "checkBrute": False},  # huge answer ~10^18
        {"input": make_inp(10**18, 10**12), "hidden": True, "checkBrute": False},
        {"input": make_inp(10**18, 999_999_999_989), "hidden": True, "checkBrute": False},  # large prime B (tests pw*p overflow!)
        {"input": make_inp(10**18, 999_983 * 999_983), "hidden": True, "checkBrute": False},  # square of prime near 10^6
        {"input": make_inp(10**18, 2**35 * 5), "hidden": True, "checkBrute": False},  # smallest prime p=2 is bottleneck!
        {"input": make_inp(987_654_321_987_654_321, 963_761_198_400), "hidden": True, "checkBrute": False},
    ]

    extra_stress = [
        make_inp(rng.randint(1, 600), rng.randint(2, 5000)) for _ in range(10)
    ]

    statement = r"""
Trong một bài toán mã hóa tổ hợp, người ta biểu diễn giá trị $N!$ dưới hệ đếm cơ số $B$ và quan tâm xem biểu diễn đó kết thúc bằng bao nhiêu chữ số `0` liên tiếp (tức số mũ lớn nhất $k$ sao cho $B^k \mid N!$).

Cho hai số nguyên dương $N$ và $B$. Hãy tìm số chữ số `0` tận cùng của $N!$ trong hệ cơ số $B$.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $N$ và $B$ ($1 \le N \le 10^{18},\; 2 \le B \le 10^{12}$).

### Kết quả
- Một số nguyên không âm duy nhất là số chữ số `0` tận cùng của $N!$ khi viết trong hệ cơ số $B$.

### Ràng buộc
- $1 \le N \le 10^{18}$
- $2 \le B \le 10^{12}$

### Subtasks
- **Subtask 1 (30% số điểm):** $N \le 10^6,\; B = 10$.
- **Subtask 2 (30% số điểm):** $N \le 10^{12},\; B \le 10^6$.
- **Subtask 3 (40% số điểm):** Không có ràng buộc bổ sung ($N \le 10^{18},\; B \le 10^{12}$).

**Giải thích ví dụ:**
- Ở ví dụ 1: $10! = 3\,628\,800$ trong hệ cơ số $10$ có $2$ chữ số `0` tận cùng.
- Ở ví dụ 2: $10!$ chứa thừa số $2$ với số mũ $v_2(10!) = 8$. Vì $B = 8 = 2^3$, số mũ lớn nhất của $8$ chia hết $10!$ là $\lfloor 8 / 3 \rfloor = 2$.
- Ở ví dụ 3: $B = 768 = 2^8 \cdot 3$. Với $N = 100$, ta có $v_2(100!) = 97 \implies \lfloor 97/8 \rfloor = 12$ và $v_3(100!) = 48 \implies \lfloor 48/1 \rfloor = 48$, nên nút thắt nằm ở thừa số $p = 2$ (không phải thừa số nguyên tố lớn nhất) và đáp án là $\min(12, 48) = 12$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Số chữ số `0` tận cùng của $N!$ trong hệ cơ số $B$ chính là số nguyên không âm $k$ lớn nhất sao cho $B^k \mid N!$. Nếu phân tích $B = \prod_{i=1}^{m} p_i^{e_i}$, thì điều kiện $B^k \mid N!$ tương đương với $k \cdot e_i \le v_{p_i}(N!)$ với mọi $i$, tức:
$$k = \min_{1 \le i \le m} \left\lfloor \frac{v_{p_i}(N!)}{e_i} \right\rfloor$$

**Gợi ý 2 (Thuật toán):**
1. Phân tích $B$ thành thừa số nguyên tố trong $O(\sqrt{B})$ ($\sqrt{B} \le 10^6$).
2. Với mỗi thừa số nguyên tố $p$ có số mũ $e$ trong $B$, dùng **Công thức Legendre** để tính số mũ của $p$ trong $N!$:
$$v_p(N!) = \left\lfloor \frac{N}{p} \right\rfloor + \left\lfloor \frac{N}{p^2} \right\rfloor + \left\lfloor \frac{N}{p^3} \right\rfloor + \dots$$
3. Cập nhật `ans = min(ans, cnt / e)`.

**Gợi ý 3 (Cài đặt & bẫy):**
- **Bẫy tràn số cực kỳ phổ biến:** Nếu tính công thức Legendre bằng `for (long long pw = p; pw <= N; pw *= p)` thì khi $p \approx 10^{12}$, phép `pw * p` bằng $10^{24}$ sẽ **tràn `long long`** và gây vòng lặp vô hạn hoặc kết quả sai!
- **Cách viết an toàn tuyệt đối:** Khởi tạo `tmp = N`, lặp `while (tmp > 0) { tmp /= p; cnt += tmp; }`. Cách này chỉ dùng phép chia giảm dần nên không bao giờ tràn `long long`.
- Nhớ kiểm tra tất cả thừa số nguyên tố của $B$ (không chỉ thừa số nguyên tố lớn nhất).
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long N, B;
    if (!(cin >> N >> B)) return 0;

    long long ans = LLONG_MAX;
    long long rem = B;

    auto process_prime = [&](long long p, long long e) {
        long long cnt = 0;
        long long tmp = N;
        while (tmp > 0) {
            tmp /= p;
            cnt += tmp;
        }
        ans = min(ans, cnt / e);
    };

    for (long long d = 2; d * d <= rem; ++d) {
        if (rem % d == 0) {
            long long e = 0;
            while (rem % d == 0) {
                rem /= d;
                ++e;
            }
            process_prime(d, e);
        }
    }
    if (rem > 1) {
        process_prime(rem, 1);
    }

    cout << ans << '\n';
    return 0;
}
"""

    py_sol = r"""import sys


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    b = int(data[1])

    ans = None
    rem = b
    d = 2
    while d * d <= rem:
        if rem % d == 0:
            e = 0
            while rem % d == 0:
                rem //= d
                e += 1
            cnt = 0
            tmp = n
            while tmp > 0:
                tmp //= d
                cnt += tmp
            cand = cnt // e
            ans = cand if ans is None else min(ans, cand)
        d += 1 if d == 2 else 2

    if rem > 1:
        cnt = 0
        tmp = n
        while tmp > 0:
            tmp //= rem
            cnt += tmp
        ans = cnt if ans is None else min(ans, cnt)

    sys.stdout.write(f"{ans}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-trailing-zeros-base-k",
        "title": "Chữ số 0 tận cùng của giai thừa ở cơ số B",
        "shortDescription": "Đếm số chữ số 0 tận cùng của N! trong hệ cơ số B (N <= 10^18, B <= 10^12) bằng phân tích thừa số và công thức Legendre.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.prime_factorization",
        "tags": ["số học", "thừa số nguyên tố", "toán học", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= N <= 10^18, 2 <= B <= 10^12",
        "hints": hints,
        "cppSolution": cpp_sol,
        "pythonSolution": py_sol,
        "tests": tests,
        "brute": brute_p09,
        "extraStressInputs": extra_stress,
    }


# ============================================================================
# Problem 10: cp01-segmented-sieve-range (hard, algo.sieve_eratosthenes)
# ============================================================================
def build_p10() -> Dict[str, Any]:
    rng = random.Random(11010)
    MOD = 1_000_000_007

    def make_inp(l: int, r: int) -> str:
        return f"{l} {r}\n"

    def brute_p10(inp: str) -> str:
        l, r = map(int, inp.split())
        cnt = 0
        total = 0
        for x in range(l, r + 1):
            if _is_prime_trial(x):
                cnt += 1
                total = (total + x) % MOD
        return f"{cnt} {total}"

    tests = [
        # 3 public samples
        {"input": make_inp(1, 10), "hidden": False, "expected": "4 17", "checkBrute": True},
        {"input": make_inp(10, 20), "hidden": False, "expected": "4 60", "checkBrute": True},
        {"input": make_inp(999_999_999_950, 1_000_000_000_000), "hidden": False, "expected": None, "checkBrute": True},
        # 5 corner / edge / classic segmented-sieve bug traps
        {"input": make_inp(1, 1), "hidden": True, "checkBrute": True},
        {"input": make_inp(2, 2), "hidden": True, "checkBrute": True},
        {"input": make_inp(999_999_999_989, 999_999_999_989), "hidden": True, "checkBrute": True},
        {"input": make_inp(999_999_999_990, 1_000_000_000_000), "hidden": True, "checkBrute": True},
        {"input": make_inp(999_983 * 999_983 - 5, 999_983 * 999_983 + 5), "hidden": True, "checkBrute": True},
        # 8 medium -> large tests
        {"input": make_inp(1, 1000), "hidden": True, "checkBrute": True},
        {"input": make_inp(1, 100_001), "hidden": True, "checkBrute": False},
        {"input": make_inp(10**6 - 50_000, 10**6 + 50_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(10**9, 10**9 + 100_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(999_966_000_000, 999_966_100_000), "hidden": True, "checkBrute": False},  # contains 999983^2
        {"input": make_inp(500_000_000_000, 500_000_100_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(999_999_900_000, 1_000_000_000_000), "hidden": True, "checkBrute": False},
        {"input": make_inp(999_999_850_000, 999_999_950_000), "hidden": True, "checkBrute": False},
    ]
    # Verify exact expected for sample 3:
    # Primes in [999999999950, 10^12]: 999999999959, 999999999961, 999999999989 -> 3 primes
    s3_primes = [x for x in range(999_999_999_950, 1_000_000_000_001) if _is_prime_trial(x)]
    tests[2]["expected"] = f"{len(s3_primes)} {sum(s3_primes) % MOD}"

    extra_stress = [
        make_inp(1, 500),
        make_inp(2, 500),
        make_inp(999_900, 1_000_100),
    ]
    for _ in range(5):
        lo = rng.randint(1, 10**8)
        extra_stress.append(make_inp(lo, lo + rng.randint(0, 150)))

    statement = r"""
Trong quá trình sinh tham số cho hệ mật khóa công khai, hệ thống cần khảo sát phân bố các số nguyên tố trong một cửa sổ hẹp $[L, R]$ nằm ở vùng số rất lớn (lên tới $10^{12}$). Vì $R$ quá lớn để tạo mảng sàng trực tiếp kích thước $R$, ta không thể dùng Sàng Eratosthenes thông thường.

Cho hai số nguyên dương $L, R$ thỏa mãn $1 \le L \le R \le 10^{12}$ và $R - L \le 10^5$. Hãy đếm số lượng số nguyên tố trong đoạn $[L, R]$ và tính tổng của chúng theo mô-đun $10^9 + 7$.

### Dữ liệu vào
- Một dòng duy nhất chứa hai số nguyên dương $L, R$ ($1 \le L \le R \le 10^{12},\; R - L \le 10^5$).

### Kết quả
- Một dòng gồm hai số nguyên cách nhau bởi dấu cách: số lượng số nguyên tố trong đoạn $[L, R]$ và tổng của chúng modulo $10^9 + 7$.

### Ràng buộc
- $1 \le L \le R \le 10^{12}$
- $0 \le R - L \le 10^5$

### Subtasks
- **Subtask 1 (30% số điểm):** $R \le 10^6$.
- **Subtask 2 (30% số điểm):** $R \le 10^9$.
- **Subtask 3 (40% số điểm):** Không có ràng buộc bổ sung ($R \le 10^{12},\; R - L \le 10^5$).

**Giải thích ví dụ:**
- Ở ví dụ 1: Trong $[1, 10]$ có $4$ số nguyên tố $\{2, 3, 5, 7\}$ với tổng $17$ (lưu ý $1$ không phải số nguyên tố).
- Ở ví dụ 2: Trong $[10, 20]$ có $4$ số nguyên tố $\{11, 13, 17, 19\}$ với tổng $60$.
- Ở ví dụ 3: Trong $[999\,999\,999\,950, 10^{12}]$ có $3$ số nguyên tố là $999\,999\,999\,959$, $999\,999\,999\,961$ và $999\,999\,999\,989$; tổng của chúng lấy dư cho $10^9 + 7$.
"""

    hints = r"""
**Gợi ý 1 (Nhận xét):**
Mọi hợp số $x \in [L, R]$ đều có ít nhất một ước nguyên tố $p \le \sqrt{R} \le 10^6$. Vì vậy ta chỉ cần sàng trước các số nguyên tố cơ sở đến $\lfloor \sqrt{R} \rfloor$, sau đó dùng chúng để loại bỏ các bội số trong đoạn $[L, R]$ trên một mảng kích thước chỉ $R - L + 1 \le 10^5 + 1$.

**Gợi ý 2 (Thuật toán):**
Sử dụng **Sàng phân đoạn (Segmented Sieve)**:
1. Sàng Eratosthenes lấy danh sách số nguyên tố $p \le \lfloor \sqrt{R} \rfloor$.
2. Khởi tạo mảng đánh dấu `seg[0 .. R - L]` ban đầu đều là `true` (với `seg[i]` đại diện cho số $L + i$).
3. Với mỗi số nguyên tố $p$, tìm bội đầu tiên của $p$ thuộc $[L, R]$ và không nhỏ hơn $p^2$:
$$\text{start} = \max\!\left(p^2,\; \left\lceil \frac{L}{p} \right\rceil \cdot p\right) = \max\!\left(p^2,\; \frac{L + p - 1}{p} \cdot p\right)$$
rồi đánh dấu `seg[m - L] = false` với $m = \text{start}, \text{start} + p, \dots \le R$.
4. Độ phức tạp thời gian: $O(\sqrt{R} \log \log R + (R - L) \log \log R)$, bộ nhớ $O(\sqrt{R} + (R - L))$.

**Gợi ý 3 (Cài đặt & bẫy):**
- **Bẫy 1 ($L = 1$):** Nếu $L = 1$, bắt buộc đặt `seg[0] = false` vì số $1$ không bị bất kỳ bội $m \ge p^2$ nào xóa!
- **Bẫy 2 ($p \in [L, R]$):** Phải lấy `start = max(p * p, ...)`, nếu không sẽ vô tình xóa nhầm chính số nguyên tố $p$ khi $L \le p \le R$.
- **Bẫy 3 (Tràn số & căn bậc hai):** Dùng `long long` cho $L, R, p^2, m$ và lấy cận trên $\lfloor\sqrt{R}\rfloor + 1$ để tránh sai số làm tròn khi $R$ là bình phương của một số nguyên tố lớn (như $999\,983^2$). Cộng tổng theo mô-đun $10^9 + 7$ sau mỗi bước.
"""

    cpp_sol = r"""#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long L, R;
    if (!(cin >> L >> R)) return 0;

    long long lim = (long long)sqrtl((long double)R) + 1;
    vector<char> small(lim + 1, 1);
    small[0] = small[1] = 0;
    vector<long long> primes;
    for (long long i = 2; i <= lim; ++i) {
        if (small[i]) {
            primes.push_back(i);
            if (i * i <= lim) {
                for (long long j = i * i; j <= lim; j += i) {
                    small[j] = 0;
                }
            }
        }
    }

    int len = (int)(R - L + 1);
    vector<char> seg(len, 1);
    if (L == 1) seg[0] = 0;

    for (long long p : primes) {
        if (p * p > R) break;
        long long start = max(p * p, ((L + p - 1) / p) * p);
        for (long long m = start; m <= R; m += p) {
            seg[(int)(m - L)] = 0;
        }
    }

    const long long MOD = 1000000007LL;
    long long cnt = 0, sum = 0;
    for (int i = 0; i < len; ++i) {
        if (seg[i]) {
            ++cnt;
            sum = (sum + (L + i) % MOD) % MOD;
        }
    }

    cout << cnt << ' ' << sum << '\n';
    return 0;
}
"""

    py_sol = r"""import math
import sys

MOD = 1_000_000_007


def main() -> None:
    data = sys.stdin.read().split()
    if not data:
        return
    l = int(data[0])
    r = int(data[1])

    lim = math.isqrt(r)
    small = bytearray(b"\x01") * (lim + 1)
    if lim >= 0:
        small[0] = 0
    if lim >= 1:
        small[1] = 0
    for i in range(2, math.isqrt(lim) + 1):
        if small[i]:
            small[i * i :: i] = bytearray(((lim - i * i) // i) + 1)
    primes = [i for i, v in enumerate(small) if v]

    size = r - l + 1
    seg = bytearray(b"\x01") * size
    if l == 1:
        seg[0] = 0

    for p in primes:
        start = ((l + p - 1) // p) * p
        if start < p * p:
            start = p * p
        if start <= r:
            seg[start - l :: p] = bytearray(((r - start) // p) + 1)

    cnt = 0
    total = 0
    for i, flag in enumerate(seg):
        if flag:
            cnt += 1
            total = (total + l + i) % MOD

    sys.stdout.write(f"{cnt} {total}\n")


if __name__ == "__main__":
    main()
"""

    return {
        "slug": "cp01-segmented-sieve-range",
        "title": "Sàng phân đoạn: Đếm và tính tổng số nguyên tố",
        "shortDescription": "Dùng Sàng phân đoạn (Segmented Sieve) đếm và tính tổng (mod 10^9+7) các số nguyên tố trong [L, R] với R <= 10^12, R - L <= 10^5.",
        "difficulty": "hard",
        "estimatedTime": 30,
        "skillId": "algo.sieve_eratosthenes",
        "tags": ["số học", "sàng nguyên tố", "tối ưu", "tầng 2"],
        "statement": statement,
        "requirementsText": REQ_HEADER + "Giới hạn: 1 <= L <= R <= 10^12, R - L <= 10^5",
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

    # Strict extra checks: exactly 16 tests per problem and every test input < 150KB
    for p in problems:
        slug = p["slug"]
        assert len(p["tests"]) == 16, f"[{slug}] expected 16 tests, got {len(p['tests'])}"
        for ti, tc in enumerate(p["tests"], 1):
            sz = len(tc["input"].encode("utf-8"))
            assert sz < 150_000, f"[{slug}] test #{ti} input is {sz} bytes (>= 150KB)"

    out_path: Path = build_and_verify_pack(
        pack_id=PACK_ID,
        title=PACK_TITLE,
        tier=PACK_TIER,
        description=PACK_DESC,
        problems=problems,
    )
    assert out_path.exists()


if __name__ == "__main__":
    main()
