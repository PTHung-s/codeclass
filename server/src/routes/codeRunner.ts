import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { judgePythonCode, parseTestCases, runPythonCode, pythonQueuePosition } from "../utils/pythonRunner";
import { cppQueuePosition, judgeCppCode, runCppCode } from "../utils/cppRunner";
import { getSandboxStatus } from "../utils/codeSandbox";

const router = Router();
const MAX_CODE_LENGTH = 50_000;
const MAX_STDIN_LENGTH = 8_000_000;

router.get("/sandbox-status", authenticate, requireRole("admin", "teacher", "teaching_assistant"), (_req: Request, res: Response) => {
  res.json(getSandboxStatus());
});

router.post("/run/python", authenticate, async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.body.code === "string" ? req.body.code : "";
  const stdin = typeof req.body.stdin === "string" ? req.body.stdin : "";

  if (!code.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  if (code.length > MAX_CODE_LENGTH) {
    res.status(400).json({ error: "Code is too large" });
    return;
  }

  if (stdin.length > MAX_STDIN_LENGTH) {
    res.status(400).json({ error: "Input is too large" });
    return;
  }

  try {
    res.setHeader("X-Run-Queue-Position", pythonQueuePosition());
    const result = await runPythonCode(code, stdin);
    res.json({
      ...result,
      // Backward compatibility for older UI paths.
      output: result.output,
    });
  } catch {
    res.status(500).json({ error: "Failed to run code" });
  }
});

router.post("/run/python/tests", authenticate, async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.body.code === "string" ? req.body.code : "";
  const rawTestCases = req.body.testCases;

  if (!code.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  if (code.length > MAX_CODE_LENGTH) {
    res.status(400).json({ error: "Code is too large" });
    return;
  }

  try {
    const testCases = Array.isArray(rawTestCases)
      ? rawTestCases.map((tc) => ({
          input: typeof tc.input === "string" ? tc.input : "",
          output: typeof tc.output === "string" ? tc.output : "",
          hidden: Boolean(tc.hidden),
        }))
      : parseTestCases(JSON.stringify(rawTestCases || []));

    res.setHeader("X-Run-Queue-Position", pythonQueuePosition());
    const result = await judgePythonCode(code, testCases.filter((tc) => tc.output.length > 0));
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to run tests" });
  }
});

// ─── C++ endpoints ───

router.post("/run/cpp", authenticate, async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.body.code === "string" ? req.body.code : "";
  const stdin = typeof req.body.stdin === "string" ? req.body.stdin : "";

  if (!code.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  if (code.length > MAX_CODE_LENGTH) {
    res.status(400).json({ error: "Code is too large" });
    return;
  }

  if (stdin.length > MAX_STDIN_LENGTH) {
    res.status(400).json({ error: "Input is too large" });
    return;
  }

  try {
    res.setHeader("X-Run-Queue-Position", cppQueuePosition());
    const result = await runCppCode(code, stdin);
    res.json({ ...result });
  } catch {
    res.status(500).json({ error: "Failed to run C++ code" });
  }
});

router.post("/run/cpp/tests", authenticate, async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.body.code === "string" ? req.body.code : "";
  const rawTestCases = req.body.testCases;

  if (!code.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  if (code.length > MAX_CODE_LENGTH) {
    res.status(400).json({ error: "Code is too large" });
    return;
  }

  try {
    const testCases = Array.isArray(rawTestCases)
      ? rawTestCases.map((tc: any) => ({
          input: typeof tc.input === "string" ? tc.input : "",
          output: typeof tc.output === "string" ? tc.output : "",
          hidden: Boolean(tc.hidden),
        }))
      : [];

    res.setHeader("X-Run-Queue-Position", cppQueuePosition());
    const result = await judgeCppCode(code, testCases.filter((tc) => tc.output.length > 0));
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to run C++ tests" });
  }
});

export default router;
