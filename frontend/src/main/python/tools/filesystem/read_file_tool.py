"""
Read File Tool - Python implementation.
"""

import asyncio
import base64
import logging
import mimetypes
import re
from pathlib import Path
from typing import Dict, Any

from core.executors import get_interactive_executor
from tools.path_resolution import resolve_workspace_path
from tools.result import ToolResult
from tools.filesystem.file_utils import is_binary_file, detect_encoding

logger = logging.getLogger(__name__)

DEFAULT_LINE_LIMIT = 2000
MAX_LINE_LENGTH = 500
PDF_MAX_CHARS = 50000
PDF_MIN_PAGE_BODY_CHARS = 60
PDF_TRUNCATION_MARKER = "\n[...truncated]"
PDF_SEARCH_TERM_LIMIT = 8
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".ico",
    ".svg",
}
IMAGE_FALLBACK_CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
}
def _resolve_read_file_path(raw_file_path: object) -> tuple[Path | None, str | None, str | None]:
    resolved_path, normalized_input, path_error = resolve_workspace_path(raw_file_path)
    if path_error:
        return None, None, "file_path parameter is required"
    if resolved_path is None:
        return None, None, "file_path parameter is required"
    if not normalized_input:
        return None, None, "file_path parameter is required"
    return resolved_path, normalized_input, None
PDF_SEARCH_STOPWORDS = {
    "about",
    "after",
    "before",
    "could",
    "from",
    "have",
    "into",
    "just",
    "should",
    "that",
    "their",
    "there",
    "these",
    "this",
    "were",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
}


def _truncate_line_preserving_ending(line: str) -> tuple[str, bool]:
    """Truncate a line body while preserving its original line ending."""
    if line.endswith("\r\n"):
        line_body = line[:-2]
        line_ending = "\r\n"
    elif line.endswith("\n") or line.endswith("\r"):
        line_body = line[:-1]
        line_ending = line[-1]
    else:
        line_body = line
        line_ending = ""

    if len(line_body) <= MAX_LINE_LENGTH:
        return line, False

    return f"{line_body[:MAX_LINE_LENGTH]}{line_ending}", True


def _is_image_file(path: Path) -> bool:
    guessed_type, _ = mimetypes.guess_type(str(path))
    if isinstance(guessed_type, str) and guessed_type.startswith("image/"):
        return True
    return path.suffix.lower() in IMAGE_EXTENSIONS


def _resolve_image_content_type(path: Path) -> str:
    guessed_type, _ = mimetypes.guess_type(str(path))
    if isinstance(guessed_type, str) and guessed_type.startswith("image/"):
        return guessed_type.lower()
    return IMAGE_FALLBACK_CONTENT_TYPES.get(path.suffix.lower(), "image/png")


async def _read_image_file(path: Path) -> ToolResult:
    """
    Read image bytes and return attachment payload for tool output.
    This path intentionally does not perform OCR or text extraction.
    """
    loop = asyncio.get_running_loop()

    def _read_image_bytes() -> bytes:
        return path.read_bytes()

    image_bytes = await loop.run_in_executor(get_interactive_executor(), _read_image_bytes)
    if not image_bytes:
        return ToolResult.error_result(f"Image file is empty: {path}")

    image_base64 = base64.b64encode(image_bytes).decode("ascii")
    image_content_type = _resolve_image_content_type(path)
    output = (
        f"File path: {path}\n\n"
        f"Image file loaded ({image_content_type}, {len(image_bytes)} bytes).\n"
        "Note: OCR/text extraction is not performed by read_file."
    )
    return ToolResult.success_result(
        {
            "content": "",
            "file_path": str(path),
            "total_lines": 0,
            "read_lines": 0,
            "is_truncated": False,
            "line_truncation_limit": MAX_LINE_LENGTH,
            "truncated_line_count": 0,
            "output": output,
            "screenshot": image_base64,
            "image_data": image_base64,
            "screenshot_content_type": image_content_type,
            "image_content_type": image_content_type,
            "image_size_bytes": len(image_bytes),
        }
    )


def _collect_pdf_search_terms(path: Path, args: Dict[str, Any]) -> list[str]:
    """Collect relevance terms from read_file args for PDF truncation selection."""
    candidate_fields = ["query", "search_query", "goal", "context", "explanation"]
    candidate_text_chunks: list[str] = []

    for field in candidate_fields:
        value = args.get(field)
        if isinstance(value, str):
            normalized = value.strip()
            if normalized:
                candidate_text_chunks.append(normalized)

    stem_terms = path.stem.replace("_", " ").replace("-", " ").strip()
    if stem_terms:
        candidate_text_chunks.append(stem_terms)

    if not candidate_text_chunks:
        return []

    term_counts: dict[str, int] = {}
    first_seen: dict[str, int] = {}
    token_index = 0
    token_pattern = re.compile(r"[A-Za-z0-9][A-Za-z0-9_\-]{2,}")

    for chunk in candidate_text_chunks:
        for match in token_pattern.finditer(chunk.lower()):
            token = match.group(0)
            if token in PDF_SEARCH_STOPWORDS or token.isdigit():
                continue
            term_counts[token] = term_counts.get(token, 0) + 1
            if token not in first_seen:
                first_seen[token] = token_index
                token_index += 1

    sorted_terms = sorted(
        term_counts,
        key=lambda token: (-term_counts[token], first_seen[token]),
    )
    return sorted_terms[:PDF_SEARCH_TERM_LIMIT]


def _score_pdf_pages(
    page_entries: list[tuple[int, str]],
    search_terms: list[str],
) -> dict[int, int]:
    """Score PDF pages by search-term occurrences."""
    if not search_terms:
        return {}

    page_scores: dict[int, int] = {}
    for page_number, page_text in page_entries:
        if not page_text:
            continue

        page_score = 0
        for term in search_terms:
            matches = re.findall(re.escape(term), page_text, flags=re.IGNORECASE)
            if matches:
                page_score += min(len(matches), 6)

        if page_score > 0:
            page_scores[page_number] = page_score

    return page_scores


def _build_pdf_page_content(
    page_entries: list[tuple[int, str]],
    max_chars: int,
    search_terms: list[str],
) -> tuple[str, list[int], bool]:
    """
    Build PDF extracted text under char budget with relevance-first page selection.
    Returns (content_text, included_page_numbers, truncated_for_size).
    """
    if not page_entries:
        return "", [], False

    total_chars = sum(len(text) for _, text in page_entries)
    page_order: list[int] = []
    page_lookup = {page_number: page_text for page_number, page_text in page_entries}

    # Always prioritize first page, then relevance-scored pages, then remaining pages.
    first_page_number = page_entries[0][0]
    page_order.append(first_page_number)

    page_scores = _score_pdf_pages(page_entries, search_terms)
    for page_number, _ in sorted(page_scores.items(), key=lambda item: (-item[1], item[0])):
        if page_number not in page_order:
            page_order.append(page_number)

    for page_number, _ in page_entries:
        if page_number not in page_order:
            page_order.append(page_number)

    content_parts: list[str] = []
    included_pages: list[int] = []
    chars_used = 0
    truncated_for_size = total_chars > max_chars

    for page_number in page_order:
        page_text = page_lookup.get(page_number, "")
        normalized_page_text = page_text.strip() if isinstance(page_text, str) else ""
        if not normalized_page_text:
            normalized_page_text = "[No extractable text on this page]"

        page_header = f"--- Page {page_number} ---\n"
        page_content = f"{page_header}{normalized_page_text}"
        remaining = max_chars - chars_used
        min_required = len(page_header) + PDF_MIN_PAGE_BODY_CHARS

        if remaining < min_required:
            truncated_for_size = True
            break

        if len(page_content) > remaining:
            body_budget = remaining - len(page_header) - len(PDF_TRUNCATION_MARKER)
            if body_budget < PDF_MIN_PAGE_BODY_CHARS:
                truncated_for_size = True
                break
            page_content = f"{page_header}{normalized_page_text[:body_budget]}{PDF_TRUNCATION_MARKER}"
            truncated_for_size = True
            content_parts.append(page_content)
            included_pages.append(page_number)
            chars_used += len(page_content)
            break

        content_parts.append(page_content)
        included_pages.append(page_number)
        chars_used += len(page_content)

    return "\n\n".join(content_parts), included_pages, truncated_for_size


async def _read_pdf_file(
    path: Path,
    args: Dict[str, Any],
    page_offset: int,
    page_limit: int,
) -> ToolResult:
    """Read PDF file via pypdf with size-aware truncation and relevance selection."""
    try:
        import pypdf
    except Exception as error:
        logger.error("Failed to import pypdf for read_file PDF extraction: %s", error, exc_info=True)
        return ToolResult.error_result(
            "PDF reading requires the 'pypdf' dependency in the sidecar runtime."
        )

    loop = asyncio.get_running_loop()

    def _extract_pdf_pages() -> list[str]:
        reader = pypdf.PdfReader(str(path))
        return [page.extract_text() or "" for page in reader.pages]

    page_texts = await loop.run_in_executor(get_interactive_executor(), _extract_pdf_pages)
    total_pages = len(page_texts)
    total_pages_all = total_pages

    effective_start = min(page_offset, total_pages_all)
    effective_end = min(effective_start + page_limit, total_pages_all)

    page_entries = [
        (page_number + 1, page_texts[page_number])
        for page_number in range(effective_start, effective_end)
    ]
    search_terms = _collect_pdf_search_terms(path, args)
    content_text, included_pages, truncated_for_size = _build_pdf_page_content(
        page_entries,
        max_chars=PDF_MAX_CHARS,
        search_terms=search_terms,
    )

    windowed = effective_start > 0 or effective_end < total_pages_all
    is_truncated = windowed or truncated_for_size

    llm_header = f"File path: {path}\n\n"
    if is_truncated:
        next_offset = effective_end
        if included_pages:
            shown_range = f"{included_pages[0]}-{included_pages[-1]}"
        else:
            shown_range = "none"

        status_line = (
            f"Status: PDF has {total_pages_all} total pages. "
            f"Current page window: {effective_start + 1}-{effective_end}.\n"
            f"Pages included in this response: {shown_range}.\n"
        ) if effective_end > effective_start else (
            f"Status: Showing 0 pages at or after page {effective_start + 1} "
            f"of {total_pages_all} total pages.\n"
        )

        search_hint = ""
        if search_terms:
            preview_terms = ", ".join(search_terms[:5])
            search_hint = f"Relevance terms used for page selection: {preview_terms}.\n"

        output_text = (
            f"{llm_header}"
            "IMPORTANT: The PDF text has been truncated using size-aware page selection.\n"
            f"{status_line}"
            f"{search_hint}"
            "Action: To read more pages, call 'read_file' again with a higher 'offset' "
            f"(PDF page offset). For example, use offset: {next_offset}.\n\n"
            "--- PDF CONTENT (truncated) ---\n"
            f"{content_text}"
        )
    else:
        if content_text:
            output_text = (
                f"{llm_header}"
                f"PDF extracted text across {total_pages_all} page(s).\n\n"
                f"{content_text}"
            )
        else:
            output_text = (
                f"{llm_header}"
                "PDF contains no extractable text."
            )

    total_lines = sum((page_text.count("\n") + 1) for page_text in page_texts if page_text)
    read_lines = content_text.count("\n") + (1 if content_text else 0)

    return ToolResult.success_result({
        "content": content_text,
        "file_path": str(path),
        "total_lines": total_lines,
        "read_lines": read_lines,
        "is_truncated": is_truncated,
        "line_truncation_limit": MAX_LINE_LENGTH,
        "truncated_line_count": 0,
        "output": output_text,
        "pdf_total_pages": total_pages_all,
        "pdf_pages_included": included_pages,
        "pdf_search_terms": search_terms,
    })


async def read_file(args: Dict[str, Any]) -> ToolResult:
    """
    Read file contents with binary detection and line-based pagination.
    
    Args:
        args: Dictionary with 'file_path', optional 'offset', 'limit'
        
    Returns:
        ToolResult with file data and standardized truncation messages
    """
    raw_file_path = args.get("file_path")
    offset = args.get("offset")
    limit = args.get("limit")
    
    try:
        path, requested_path, path_error = _resolve_read_file_path(raw_file_path)
        if path_error:
            return ToolResult.error_result(path_error)
        assert path is not None
        assert requested_path is not None
        
        # Check if file exists
        if not path.exists():
            return ToolResult.error_result(
                f"File not found: {requested_path} (resolved to {path})"
            )
        
        if not path.is_file():
            return ToolResult.error_result(
                f"Not a file: {requested_path} (resolved to {path})"
            )

        start = offset if offset is not None else 0
        line_limit = limit if limit is not None else DEFAULT_LINE_LIMIT

        if not isinstance(start, int) or start < 0:
            return ToolResult.error_result("offset must be a non-negative integer")
        if not isinstance(line_limit, int) or line_limit <= 0:
            return ToolResult.error_result("limit must be a positive integer")

        if path.suffix.lower() == ".pdf":
            return await _read_pdf_file(path, args, start, line_limit)

        if _is_image_file(path):
            return await _read_image_file(path)

        # Check if binary file
        if is_binary_file(str(path)):
            return ToolResult.error_result(
                f"File appears to be binary and cannot be read as text: {path}"
            )

        # Detect encoding
        encoding = detect_encoding(str(path))

        def _read_file_window() -> tuple[list[str], int, int]:
            collected_lines: list[str] = []
            total_lines = 0
            truncated_line_count = 0

            with path.open(encoding=encoding or "utf-8", errors="replace", newline="") as handle:
                for raw_line in handle:
                    total_lines += 1
                    if total_lines <= start:
                        continue
                    if len(collected_lines) >= line_limit:
                        continue

                    truncated_line, did_truncate = _truncate_line_preserving_ending(raw_line)
                    if did_truncate:
                        truncated_line_count += 1
                    collected_lines.append(truncated_line)

            return collected_lines, total_lines, truncated_line_count

        loop = asyncio.get_running_loop()
        content_lines, total_lines, truncated_line_count = await loop.run_in_executor(
            get_interactive_executor(),
            _read_file_window,
        )

        effective_start = min(start, total_lines)
        end = min(effective_start + line_limit, total_lines)

        content_text = "".join(content_lines)
        is_truncated = effective_start > 0 or end < total_lines

        llm_header = f"File path: {path}\n\n"

        # Build output with exact SDK format if truncated.
        if is_truncated:
            lines_shown = len(content_lines)
            next_offset = end

            if lines_shown > 0:
                status_line = (
                    f"Status: Showing lines {effective_start + 1}-{effective_start + lines_shown} "
                    f"of {total_lines} total lines.\n"
                )
            else:
                status_line = (
                    f"Status: Showing 0 lines at or after line {start + 1} of {total_lines} total lines.\n"
                )

            truncation_note = ""
            if truncated_line_count > 0:
                truncation_note = (
                    f"Note: {truncated_line_count} line(s) were truncated to {MAX_LINE_LENGTH} characters.\n"
                )
            
            output_text = (
                f"{llm_header}"
                "IMPORTANT: The file content has been truncated.\n"
                f"{status_line}"
                "Action: To read more of the file, you can use the 'offset' and 'limit' parameters in a subsequent 'read_file' call. "
                f"For example, to read the next section of the file, use offset: {next_offset}.\n\n"
                f"{truncation_note}"
                "--- FILE CONTENT (truncated) ---\n"
                f"{content_text}"
            )
        else:
            if truncated_line_count > 0:
                output_text = (
                    f"{llm_header}"
                    f"Note: {truncated_line_count} line(s) were truncated to {MAX_LINE_LENGTH} characters.\n\n"
                    f"{content_text}"
                )
            else:
                if content_text:
                    output_text = f"{llm_header}{content_text}"
                else:
                    output_text = f"{llm_header}File is empty."
        
        return ToolResult.success_result({
            "content": content_text,
            "file_path": str(path),
            "total_lines": total_lines,
            "read_lines": len(content_lines),
            "is_truncated": is_truncated,
            "line_truncation_limit": MAX_LINE_LENGTH,
            "truncated_line_count": truncated_line_count,
            "output": output_text,
        })
    except Exception as e:
        logger.error(f"Error reading file: {e}", exc_info=True)
        return ToolResult.error_result(f"Failed to read file: {str(e)}")
