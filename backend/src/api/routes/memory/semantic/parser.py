"""Parsing helpers for semantic summarization responses."""

from __future__ import annotations

import re
from typing import List, Tuple

_FACT_BULLET_PREFIX = r"(?:[-*]|\d+[.)]|fact\s+\d+\s*:)"
_FACT_LINE_PATTERN = re.compile(
    rf"^\s*{_FACT_BULLET_PREFIX}\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_SUMMARY_LABEL_PATTERN = r"(?:\*\*\s*)?SUMMARY\s*:\s*(?:\*\*)?"
_FACTS_LABEL_PATTERN = r"(?:\*\*\s*)?FACTS\s*:\s*(?:\*\*)?"
_NO_DURABLE_MEMORY_MARKERS = {
    "none",
    "no durable memory",
    "no durable memories",
    "no durable fact",
    "no durable facts",
    "nothing durable",
}


def _strip_optional_code_fence(text: str) -> str:
    stripped = text.strip()
    fence_match = re.fullmatch(r"```(?:[^\n]*)\n(.*?)\n```", stripped, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return text


def _normalize_fact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def is_explicit_no_durable_memory_result(summary: str, facts: List[str]) -> bool:
    """Return True when the parsed result explicitly indicates no durable memory."""
    normalized_summary = _normalize_fact_text(summary).lower().rstrip(".!")
    return normalized_summary in _NO_DURABLE_MEMORY_MARKERS and not facts


def parse_summarization_response(response_text: str) -> Tuple[str, List[str]]:
    """Extract structured summary + facts from LLM output."""
    response_text = _strip_optional_code_fence(response_text)
    summary = ""
    facts: List[str] = []

    summary_pattern = re.compile(
        rf"(?:\*\*|##\s*)?{_SUMMARY_LABEL_PATTERN}\s*(.+?)(?:\n\s*\n|\n\s*(?:\*\*\s*)?FACTS(?:\s*\*\*)?\s*:|$)",
        re.IGNORECASE | re.DOTALL,
    )
    summary_match = summary_pattern.search(response_text)
    if summary_match:
        summary = _normalize_fact_text(summary_match.group(1))

    facts_section_pattern = re.compile(
        rf"{_FACTS_LABEL_PATTERN}\s*\n((?:\s*{_FACT_BULLET_PREFIX}\s*.+?(?:\n|$))+)",
        re.IGNORECASE | re.MULTILINE,
    )
    facts_match = facts_section_pattern.search(response_text)

    if facts_match:
        facts_text = facts_match.group(1)
        for match in _FACT_LINE_PATTERN.finditer(facts_text):
            fact = _normalize_fact_text(match.group(1))
            if fact:
                facts.append(fact)
    else:
        facts_marker_pattern = re.compile(rf"{_FACTS_LABEL_PATTERN}\s*\n", re.IGNORECASE)
        marker_match = facts_marker_pattern.search(response_text)
        if marker_match:
            after_marker = response_text[marker_match.end() :]
            for match in _FACT_LINE_PATTERN.finditer(after_marker):
                fact = _normalize_fact_text(match.group(1))
                if fact:
                    facts.append(fact)

    return summary, facts


def extract_fallback_facts(response_text: str) -> List[str]:
    """Fallback extraction for bullet-like facts from free-form output."""
    response_text = _strip_optional_code_fence(response_text)
    facts: List[str] = []
    for match in _FACT_LINE_PATTERN.finditer(response_text):
        fact = _normalize_fact_text(match.group(1))
        if fact and len(fact) > 3:
            facts.append(fact)
    return facts
