#!/usr/bin/env python3
"""
scripts/py/paddleocr_ocr.py  —  PaddleOCR sidecar for macro-pickle's vision rail.

Standalone shim invoked by scripts/lib/paddleocr.ts (Node). Runs PaddleOCR 3.x on a
single image and writes NORMALIZED JSON to the --out file. We write to a FILE, not
stdout, on purpose: PaddlePaddle / PaddleX emit native C++ (glog) and Python logging
to the console that Python-level stdout redirection can't fully suppress, so stdout
is NOT a safe JSON channel. The temp file is.

This is an OPT-IN complement to the default Gemini OCR (scripts/lib/vision.ts) — it is
never required for the pipeline to run. Its edge over Gemini is high-recall small/CJK
text detection plus per-line geometry (polys), useful for bulk watermark stripping.

Requires (in whatever interpreter runs this — point Node's MACRO_PICKLE_PYTHON at it):
    pip install paddleocr paddlepaddle      # see scripts/py/requirements.txt
First construction downloads the PP-OCR model weights (needs network, cached after).

Usage (normally called by the Node bridge, but runnable directly):
    python paddleocr_ocr.py <image> --out result.json [--lang ch] [--version PP-OCRv5]

Verified against the cloned source at LOGIC/repositories/PaddleOCR:
  - PaddleOCR(lang="ch", ocr_version=...)  (paddleocr/_pipelines/ocr.py)
  - .predict(img) -> list; res[0]["rec_texts"|"rec_scores"|"rec_polys"|"dt_polys"]
    (tests/pipelines/test_ocr.py)
"""
import argparse
import json
import os
import sys

# Quiet PaddlePaddle's native logging best-effort. The temp-file output channel is what
# actually guarantees clean JSON regardless of any console noise.
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("FLAGS_logtostderr", "1")


def _to_list(v):
    """Best-effort numpy/array -> plain JSON-serializable value."""
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if hasattr(v, "tolist"):
        try:
            return v.tolist()
        except Exception:
            pass
    if isinstance(v, (list, tuple)):
        return [_to_list(x) for x in v]
    return v


def _get(res, key, default=None):
    """PaddleOCR result objects are subscriptable; tolerate missing keys."""
    try:
        val = res[key]
    except Exception:
        return default
    return val if val is not None else default


def main() -> int:
    ap = argparse.ArgumentParser(description="PaddleOCR sidecar -> JSON file")
    ap.add_argument("image")
    ap.add_argument("--out", required=True, help="path to write result JSON")
    ap.add_argument("--lang", default="ch", help='PaddleOCR lang id (e.g. "ch", "en", "japan")')
    ap.add_argument("--version", default=None, help="OCR version, e.g. PP-OCRv5 (default: library default)")
    args = ap.parse_args()

    def write(obj):
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)

    if not os.path.isfile(args.image):
        write({"ok": False, "error": f"image not found: {args.image}"})
        return 2

    try:
        from paddleocr import PaddleOCR
    except Exception as e:  # ImportError or a broken install
        write({
            "ok": False,
            "error": f"paddleocr not importable: {e}",
            "hint": "pip install paddleocr paddlepaddle  (see scripts/py/requirements.txt)",
        })
        return 2

    def _build_and_predict(enable_mkldnn):
        kwargs = {"lang": args.lang, "enable_mkldnn": enable_mkldnn}
        if args.version:
            kwargs["ocr_version"] = args.version
        return PaddleOCR(**kwargs).predict(args.image)  # list (one result per image)

    try:
        # oneDNN (MKL-DNN) accelerates CPU inference, but some paddlepaddle CPU builds raise
        # NotImplementedError (PIR/oneDNN attribute conversion) at predict time. Try with it,
        # then fall back without it. MACRO_PICKLE_PADDLE_MKLDNN=0 skips to the safe path.
        pref = os.environ.get("MACRO_PICKLE_PADDLE_MKLDNN", "").lower()
        if pref in ("0", "false", "no", "off"):
            results, mkldnn_used = _build_and_predict(False), False
        else:
            try:
                results, mkldnn_used = _build_and_predict(True), True
            except NotImplementedError:
                results, mkldnn_used = _build_and_predict(False), False

        texts, scores, polys = [], [], []
        for res in results:
            rt = _get(res, "rec_texts", []) or []
            rs = _get(res, "rec_scores", []) or []
            geom = _get(res, "rec_polys", None)
            if geom is None:
                geom = _get(res, "rec_boxes", None)
            if geom is None:
                geom = _get(res, "dt_polys", []) or []
            texts.extend(_to_list(rt))
            scores.extend(_to_list(rs))
            polys.extend(_to_list(geom))

        write({
            "ok": True,
            "engine": "paddleocr",
            "lang": args.lang,
            "ocr_version": args.version,
            "mkldnn": mkldnn_used,
            "count": len(texts),
            "texts": texts,
            "scores": scores,
            "polys": polys,
            "joined_text": "\n".join(t for t in texts if isinstance(t, str)),
        })
        return 0
    except Exception as e:
        write({"ok": False, "error": f"{type(e).__name__}: {e}"})
        return 2


if __name__ == "__main__":
    sys.exit(main())
