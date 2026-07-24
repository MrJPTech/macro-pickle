/**
 * scripts/lib/paddleocr.ts
 *
 * Node bridge to the PaddleOCR Python sidecar (scripts/py/paddleocr_ocr.py). OPT-IN
 * complement to the default Gemini OCR in vision.ts — never required for the pipeline.
 * Its edge: high-recall small/CJK text + per-line geometry for bulk watermark work.
 *
 * Transport is a TEMP FILE, not stdout: PaddlePaddle's native (glog) logging can leak
 * onto stdout and corrupt JSON parsing, so the shim writes JSON to a file we read back.
 *
 * The interpreter is resolved from (in order): opts.python, MACRO_PICKLE_PYTHON, "python".
 * For the MCP server, set MACRO_PICKLE_PYTHON in the Claude Desktop config `env` block
 * (the spawned process inherits that, not your shell). The shim path is resolved relative
 * to THIS module (import.meta.url), so it works regardless of the caller's cwd.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIM = path.resolve(HERE, "../py/paddleocr_ocr.py");

let counter = 0;

export interface PaddleOcrResult {
  /** Recognized text lines, in detection order. */
  texts: string[];
  /** Per-line confidence scores (parallel to texts), when available. */
  scores: number[];
  /** Per-line geometry: each poly is an array of [x, y] points. */
  polys: number[][][];
  /** texts joined with newlines — convenient single-string read. */
  joinedText: string;
  engine: string;
  lang: string;
  ocrVersion?: string;
}

export interface PaddleOcrOptions {
  imagePath: string;
  /** PaddleOCR lang id. Default "ch" (Chinese + English — right for dropship watermarks). */
  lang?: string;
  /** OCR version (e.g. "PP-OCRv5"). Omit to use the library default. */
  ocrVersion?: string;
  /** Python interpreter override (else MACRO_PICKLE_PYTHON, else "python"). */
  python?: string;
}

/**
 * Run the PaddleOCR sidecar on one image. Throws a clear, actionable error if Python or
 * paddleocr isn't available — callers that want PaddleOCR to be optional should catch.
 */
export async function runPaddleOcr(opts: PaddleOcrOptions): Promise<PaddleOcrResult> {
  if (!fs.existsSync(opts.imagePath)) throw new Error(`image not found: ${opts.imagePath}`);
  if (!fs.existsSync(SHIM)) throw new Error(`PaddleOCR shim missing: ${SHIM}`);

  const python = opts.python ?? process.env.MACRO_PICKLE_PYTHON ?? "python";
  const lang = opts.lang ?? "ch";
  const outPath = path.join(os.tmpdir(), `paddleocr-${process.pid}-${++counter}.json`);
  const argv = [SHIM, opts.imagePath, "--out", outPath, "--lang", lang];
  if (opts.ocrVersion) argv.push("--version", opts.ocrVersion);

  const stderr = await new Promise<string>((resolve, reject) => {
    let err = "";
    const proc = spawn(python, argv, { windowsHide: true });
    proc.on("error", (e) =>
      reject(
        new Error(
          `failed to launch Python ('${python}'): ${e.message}. ` +
            `Set MACRO_PICKLE_PYTHON to a Python that has paddleocr installed.`
        )
      )
    );
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("close", () => resolve(err));
  });

  // stdout is intentionally ignored (glog noise); the temp file is the clean channel.
  let raw: string;
  try {
    raw = fs.readFileSync(outPath, "utf8");
  } catch {
    const tail = stderr.trim().split("\n").slice(-6).join("\n");
    throw new Error(
      `PaddleOCR produced no output. Is paddleocr installed for '${python}'? ` +
        `(pip install -r scripts/py/requirements.txt)` +
        (tail ? `\n--- python stderr ---\n${tail}` : "")
    );
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* best-effort cleanup */
    }
  }

  let parsed: {
    ok?: boolean;
    error?: string;
    hint?: string;
    texts?: string[];
    scores?: number[];
    polys?: number[][][];
    joined_text?: string;
    engine?: string;
    lang?: string;
    ocr_version?: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`PaddleOCR returned unparseable output: ${raw.slice(0, 300)}`);
  }

  if (!parsed.ok) {
    const hint = parsed.hint ? `\n${parsed.hint}` : "";
    throw new Error(`PaddleOCR failed: ${parsed.error ?? "unknown error"}${hint}`);
  }

  return {
    texts: parsed.texts ?? [],
    scores: parsed.scores ?? [],
    polys: parsed.polys ?? [],
    joinedText: parsed.joined_text ?? "",
    engine: parsed.engine ?? "paddleocr",
    lang: parsed.lang ?? lang,
    ocrVersion: parsed.ocr_version ?? undefined,
  };
}
