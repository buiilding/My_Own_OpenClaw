"""Parsing helpers for semantic summarization responses."""

from __future__ import annotations

import re
from typing import List, Tuple

_FACT_BULLET_PREFIX = r"(?:[-*]|\d+[.)])"
_FACT_LINE_PATTERN = re.compile(
    rf"{_FACT_BULLET_PREFIX}\s*(.+?)(?:\n|$)",
    re.MULTILINE,
)


def parse_summarization_response(response_text: str) -> Tuple[str, List[str]]:
    """Extract structured summary + facts from LLM output."""
    summary = ""
    facts: List[str] = []

    summary_pattern = re.compile(
        r"(?:\*\*|##\s*)?SUMMARY:?\s*(.+?)(?:\n\n|\nFACTS:|$)",
        re.IGNORECASE | re.DOTALL,
    )
    summary_match = summary_pattern.search(response_text)
    if summary_match:
        summary = summary_match.group(1).strip()

    facts_section_pattern = re.compile(
        rf"FACTS:\s*\n((?:{_FACT_BULLET_PREFIX}\s*.+?(?:\n|$))+)",
        re.IGNORECASE | re.MULTILINE,
    )
    facts_match = facts_section_pattern.search(response_text)

    if facts_match:
        facts_text = facts_match.group(1)
        for match in _FACT_LINE_PATTERN.finditer(facts_text):
            fact = match.group(1).strip()
            if fact:
                facts.append(fact)
    else:
        facts_marker_pattern = re.compile(r"FACTS:\s*\n", re.IGNORECASE)
        marker_match = facts_marker_pattern.search(response_text)
        if marker_match:
            after_marker = response_text[marker_match.end() :]
            for match in _FACT_LINE_PATTERN.finditer(after_marker):
                fact = match.group(1).strip()
                if fact:
                    facts.append(fact)

    return summary, facts


def extract_fallback_facts(response_text: str) -> List[str]:
    """Fallback extraction for bullet-like facts from free-form output."""
    facts: List[str] = []
    for match in _FACT_LINE_PATTERN.finditer(response_text):
        fact = match.group(1).strip()
        if fact and len(fact) > 3:
            facts.append(fact)
    return facts
