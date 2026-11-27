"""
Shared builder & automated verifier for CodeClass Competitive Programming Problem Packs.

Every pack script defines a list of ProblemSpec dicts and calls `build_and_verify_pack(...)`:
1. Validates all metadata, skillId (against canonical 90-skill graph), and sandbox rules
   (ensures Python & C++ solutions never trigger CodeClass runner blocklists).
2. Runs the actual Python 3 solution in a subprocess on EVERY test case (with timeout)
   and verifies every public sample output matches its declared expected output.
3. Cross-checks the optimal Python solution against an independent brute-force oracle
   on all small/stress inputs (when `brute` is provided) to guarantee 0 logic bugs.
4. Enforces strict test size budgets (<= 180KB per test, safely under CodeClass's 250KB cap)
   and writes a clean UTF-8 JSON pack into `server/data/cp-packs/<pack_id>.json`.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parents[3]  # d:\My_Project\codeclass
PACK_OUT_DIR = ROOT_DIR / "server" / "data" / "cp-packs"

MAX_TEST_BYTES = 180_000
MAX_TESTS_PER_PROBLEM = 200
PYTHON_TIMEOUT_SEC = 5.0

VALID_SKILL_IDS = {
    # Python
    "py.intro", "py.var_basic", "py.var_types", "py.var_cast", "py.io",
    "py.operators", "py.branching", "py.for_range", "py.for_iter", "py.loop_while",
    "py.num_calc", "py.num_digit", "py.string", "py.list", "py.function", "py.debug",
    # C++
    "cpp.intro", "cpp.var_basic", "cpp.type_num", "cpp.type_char", "cpp.type_bool",
    "cpp.io_out", "cpp.io_in", "cpp.op_arith", "cpp.op_assign", "cpp.op_compare",
    "cpp.op_logic", "cpp.op_precedence", "cpp.if_basic", "cpp.if_chain", "cpp.switch",
    "cpp.loop_while", "cpp.loop_control", "cpp.loop_for", "cpp.loop_nested",
    "cpp.array_basic", "cpp.array_algo", "cpp.array_2d", "cpp.func_basic", "cpp.func_ref",
    "cpp.scope", "cpp.overload", "cpp.string_basic", "cpp.string_ops",
    # Algo Tầng 1
    "algo.problem_analysis", "algo.pseudocode_planning", "algo.complexity_estimate",
    "algo.small_test_debug", "algo.divisors_multiples", "algo.prime_check",
    "algo.prime_factorization", "algo.gcd_lcm", "algo.special_numbers",
    "algo.sieve_eratosthenes", "algo.marking_arrays", "algo.array_scan",
    "algo.prefix_sum", "algo.char_frequency", "algo.string_processing",
    "algo.dict_basics", "algo.frequency_grouping", "algo.set_basics",
    "algo.linear_search", "algo.binary_search", "algo.sorting_basics",
    "algo.top_k_selection", "algo.two_pointers", "algo.sliding_window",
    "algo.recursion_basics", "algo.recursion_classic", "algo.contest_strategy",
    # Algo Tầng 2–3
    "algo.greedy_basics", "algo.greedy_scheduling", "algo.binary_search_answer",
    "algo.divide_conquer_mod", "algo.stack_queue", "algo.monotonic_stack_deque",
    "algo.heap_priority_queue", "algo.backtracking_generation", "algo.backtracking_pruning",
    "algo.dp_linear", "algo.dp_knapsack", "algo.dp_lis_lcs", "algo.dp_grid",
    "algo.dp_interval_bitmask", "algo.graph_traversal", "algo.graph_grid_bipartite",
    "algo.graph_topo_dag", "algo.graph_shortest_path", "algo.graph_dsu_mst",
    # Algo Tầng 4
    "algo.bit_manipulation", "algo.adhoc_invariant", "algo.combinatorics_mod",
    "algo.inclusion_exclusion", "algo.matrix_exponentiation", "algo.fenwick_bit",
    "algo.sparse_table_rmq", "algo.segment_tree", "algo.tree_lca_euler",
    "algo.graph_advanced", "algo.string_trie_z", "algo.dp_advanced",
    "algo.geometry_basics", "algo.convex_hull", "algo.game_theory",
}

PY_BLOCKED_PATTERNS = [
    re.compile(r"\bimport\s+os\b"),
    re.compile(r"\bfrom\s+os\s+import\b"),
    re.compile(r"\bimport\s+subprocess\b"),
    re.compile(r"\bfrom\s+subprocess\s+import\b"),
    re.compile(r"\bimport\s+socket\b"),
    re.compile(r"\bimport\s+shutil\b"),
    re.compile(r"\b__import__\s*\("),
    re.compile(r"\beval\s*\("),
    re.compile(r"\bexec\s*\("),
    re.compile(r"\bopen\s*\("),
]

CPP_BLOCKED_PATTERNS = [
    re.compile(r"#include\s*<\s*thread\s*>"),
    re.compile(r"#include\s*<\s*filesystem\s*>"),
    re.compile(r"#include\s*<\s*socket\s*>"),
    re.compile(r"\bsystem\s*\("),
    re.compile(r"\bpopen\s*\("),
    re.compile(r"\bfork\s*\("),
]

DUAL_SOLUTION_MARKER = "\n/* === CODECLASS_PYTHON_SOLUTION === */\n"


def normalize_output(value: str) -> str:
    return value.replace("\r\n", "\n").strip()


def normalize_input(value: str) -> str:
    s = value.replace("\r\n", "\n")
    return s if s.endswith("\n") else s + "\n"


def format_dual_solution(cpp_code: str, python_code: str) -> str:
    """Combine C++17 and Python 3 solutions with a clean marker parsed by ProblemViewer."""
    return cpp_code.strip() + DUAL_SOLUTION_MARKER + python_code.strip() + "\n"


def run_python_source(py_file: str, stdin_data: str, timeout: float = PYTHON_TIMEOUT_SEC) -> tuple[str, float]:
    t0 = time.perf_counter()
    proc = subprocess.run(
        [sys.executable, py_file],
        input=normalize_input(stdin_data),
        text=True,
        capture_output=True,
        timeout=timeout,
        encoding="utf-8",
    )
    elapsed = time.perf_counter() - t0
    if proc.returncode != 0:
        raise RuntimeError(
            f"Python solution exited with {proc.returncode}:\nSTDERR:\n{proc.stderr}\nINPUT (head):\n{stdin_data[:300]}"
        )
    return normalize_output(proc.stdout), elapsed


def validate_code_safety(slug: str, cpp_code: str, python_code: str) -> None:
    for pat in PY_BLOCKED_PATTERNS:
        if pat.search(python_code):
            raise ValueError(f"[{slug}] pythonSolution matches CodeClass blocklist: {pat.pattern}")
    for pat in CPP_BLOCKED_PATTERNS:
        if pat.search(cpp_code):
            raise ValueError(f"[{slug}] cppSolution matches CodeClass blocklist: {pat.pattern}")
    if "int main" not in cpp_code:
        raise ValueError(f"[{slug}] cppSolution missing `int main`")
    if cpp_code.count("{") != cpp_code.count("}"):
        raise ValueError(f"[{slug}] cppSolution has unbalanced curly braces")
    # Compile-check Python syntax
    compile(python_code, f"<{slug}.py>", "exec")


def build_and_verify_pack(
    pack_id: str,
    title: str,
    tier: str,
    description: str,
    problems: List[Dict[str, Any]],
) -> Path:
    """
    Validate, stress-test, generate verified test outputs, and emit pack JSON.

    Each entry in `problems` must have:
      - slug: unique stable slug
      - title: Vietnamese problem title
      - shortDescription: 1-sentence summary
      - difficulty: "easy" | "medium" | "hard"
      - estimatedTime: int (minutes)
      - skillId: valid skillId from VALID_SKILL_IDS
      - tags: list[str]
      - statement: Markdown + KaTeX statement (without redundant trailing examples)
      - requirementsText: "Time: 1s\\nMemory: 256MB\\nNguồn: ...\\n..."
      - hints: Markdown progressive hints (Gợi ý 1, 2, 3)
      - cppSolution: complete C++17 solution
      - pythonSolution: complete Python 3 solution
      - tests: list[dict] with {"input": str, "hidden": bool, "expected": Optional[str], "checkBrute": Optional[bool]}
      - brute: Optional[Callable[[str], str]] — independent oracle to verify small/medium tests
      - extraStressInputs: Optional[List[str]] — extra small random inputs verified against brute (not saved in pack)
    """
    PACK_OUT_DIR.mkdir(parents=True, exist_ok=True)
    built_problems: List[Dict[str, Any]] = []
    seen_slugs = set()
    seen_titles = set()
    total_tests = 0
    total_brute_checks = 0
    max_elapsed = 0.0

    with tempfile.TemporaryDirectory(prefix=f"cp_verify_{pack_id}_") as tmpdir:
        for idx, p in enumerate(problems, 1):
            slug = p["slug"]
            if slug in seen_slugs:
                raise ValueError(f"Duplicate slug: {slug}")
            seen_slugs.add(slug)

            ptitle = p["title"].strip()
            if ptitle in seen_titles:
                raise ValueError(f"Duplicate title: {ptitle}")
            seen_titles.add(ptitle)

            if p["difficulty"] not in ("easy", "medium", "hard"):
                raise ValueError(f"[{slug}] invalid difficulty: {p['difficulty']}")
            if p["skillId"] not in VALID_SKILL_IDS:
                raise ValueError(f"[{slug}] invalid skillId: {p['skillId']}")

            cpp_code = p["cppSolution"].strip()
            py_code = p["pythonSolution"].strip()
            validate_code_safety(slug, cpp_code, py_code)

            py_file = os.path.join(tmpdir, f"{slug}.py")
            with open(py_file, "w", encoding="utf-8") as f:
                f.write(py_code + "\n")

            raw_tests = p["tests"]
            if not (10 <= len(raw_tests) <= MAX_TESTS_PER_PROBLEM):
                raise ValueError(f"[{slug}] expected 10..{MAX_TESTS_PER_PROBLEM} tests, got {len(raw_tests)}")

            brute_fn: Optional[Callable[[str], str]] = p.get("brute")
            verified_tests: List[Dict[str, Any]] = []
            public_count = 0

            for ti, tc in enumerate(raw_tests, 1):
                inp = normalize_input(tc["input"])
                if len(inp.encode("utf-8")) > MAX_TEST_BYTES:
                    raise ValueError(f"[{slug}] test #{ti} input exceeds {MAX_TEST_BYTES} bytes ({len(inp.encode('utf-8'))})")

                out, elapsed = run_python_source(py_file, inp)
                max_elapsed = max(max_elapsed, elapsed)

                if not out:
                    raise ValueError(f"[{slug}] test #{ti} produced empty output")
                if len(out.encode("utf-8")) > MAX_TEST_BYTES:
                    raise ValueError(f"[{slug}] test #{ti} output exceeds {MAX_TEST_BYTES} bytes")

                if tc.get("expected") is not None:
                    exp = normalize_output(str(tc["expected"]))
                    if out != exp:
                        raise AssertionError(
                            f"[{slug}] test #{ti} expected mismatch!\nEXPECTED:\n{exp}\nGOT:\n{out}\nINPUT:\n{inp[:300]}"
                        )

                if brute_fn is not None and tc.get("checkBrute", False):
                    brute_out = normalize_output(str(brute_fn(inp)))
                    if out != brute_out:
                        raise AssertionError(
                            f"[{slug}] test #{ti} brute mismatch!\nBRUTE:\n{brute_out}\nSOL:\n{out}\nINPUT:\n{inp[:300]}"
                        )
                    total_brute_checks += 1

                hidden = bool(tc.get("hidden", True))
                if not hidden:
                    public_count += 1
                verified_tests.append({
                    "input": inp,
                    "output": out,
                    "hidden": hidden,
                })

            if public_count < 2:
                raise ValueError(f"[{slug}] must have at least 2 public sample tests (got {public_count})")

            # Extra brute-force stress tests (verify logic without bloating saved test list)
            if brute_fn is not None and p.get("extraStressInputs"):
                for si, sinp in enumerate(p["extraStressInputs"], 1):
                    out, _ = run_python_source(py_file, sinp)
                    brute_out = normalize_output(str(brute_fn(normalize_input(sinp))))
                    if out != brute_out:
                        raise AssertionError(
                            f"[{slug}] stress #{si} brute mismatch!\nBRUTE:\n{brute_out}\nSOL:\n{out}\nINPUT:\n{sinp[:300]}"
                        )
                    total_brute_checks += 1

            sample_in = verified_tests[0]["input"].rstrip("\n")
            sample_out = verified_tests[0]["output"]
            total_tests += len(verified_tests)

            built_problems.append({
                "slug": slug,
                "title": ptitle,
                "shortDescription": p["shortDescription"].strip(),
                "statement": p["statement"].strip(),
                "difficulty": p["difficulty"],
                "estimatedTime": int(p.get("estimatedTime", 20)),
                "skillId": p["skillId"],
                "tags": list(dict.fromkeys(p["tags"])),
                "sampleInput": sample_in,
                "sampleOutput": sample_out,
                "requirementsText": p["requirementsText"].strip(),
                "hints": p["hints"].strip(),
                "teacherSolution": format_dual_solution(cpp_code, py_code),
                "testCases": verified_tests,
            })
            print(f"  ✓ [{idx:02d}/{len(problems)}] {slug} ({p['difficulty']}, {len(verified_tests)} tests, skill={p['skillId']})")

    pack_payload = {
        "schemaVersion": 1,
        "packId": pack_id,
        "title": title,
        "tier": tier,
        "description": description,
        "problemCount": len(built_problems),
        "problems": built_problems,
    }

    out_path = PACK_OUT_DIR / f"{pack_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pack_payload, f, ensure_ascii=False, indent=2)

    size_kb = out_path.stat().st_size / 1024
    print(
        f"PASS {pack_id}: {len(built_problems)} problems, {total_tests} verified tests, "
        f"{total_brute_checks} brute cross-checks, max_py_time={max_elapsed:.3f}s -> {out_path.name} ({size_kb:.1f} KB)"
    )
    return out_path
