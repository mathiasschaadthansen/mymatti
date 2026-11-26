"""Generér allergens.ts til Claude-forbindelsen ud fra mymatti/core.py, så reglerne kun vedligeholdes ét sted.

Kør: python scripts/gen_allergens.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from mymatti import core  # noqa: E402

WORD = r"[\p{L}\p{N}_]"


def to_js(src: str) -> str:
    """Oversæt et Python-regex til JavaScript, hvor \\w og \\b ellers ikke kender æ, ø og å."""
    out, i = [], 0
    while i < len(src):
        if src.startswith(r"\b", i):
            nxt = src[i + 2:i + 3]
            out.append(f"(?!{WORD})" if nxt in ("", "|", ")") else f"(?<!{WORD})")
            i += 2
        elif src.startswith(r"\w", i):
            out.append(WORD)
            i += 2
        else:
            out.append(src[i])
            i += 1
    return "".join(out)


def build() -> str:
    allergens = {
        key: {"label": spec["label"],
              **{k: to_js(spec[k].pattern) for k in ("pattern", "ignore", "free") if spec.get(k)}}
        for key, spec in core.ALLERGENS.items()
    }
    return ("// GENERERET af scripts/gen_allergens.py ud fra mymatti/core.py – ret ikke i hånden.\n"
            "export const ALLERGENS: Record<string, { label: string; pattern: string; ignore?: string; free?: string }> = "
            + json.dumps(allergens, ensure_ascii=False, indent=1) + ";\n\n"
            "export const FREE_TEXT_ALIASES: Record<string, string[]> = "
            + json.dumps(core._FREE_TEXT_ALIASES, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    target = ROOT / "supabase" / "functions" / "mymatti-mcp" / "allergens.ts"
    target.write_text(build(), encoding="utf-8")
    assert not re.search(r"\\[bw]", build()), "uoversat \\b eller \\w"
    print("skrev", target.relative_to(ROOT))
