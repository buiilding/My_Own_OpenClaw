#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
INPUT_MD="${CONTRACT_DIR}/CODE_EVALUATION_AND_CONFIDENTIALITY_AGREEMENT.md"
OUTPUT_PDF="${CONTRACT_DIR}/CODE_EVALUATION_AND_CONFIDENTIALITY_AGREEMENT.pdf"
CSS_FILE="${CONTRACT_DIR}/contract-print.css"
MD_TO_PDF_LAUNCH_OPTIONS='{"args":["--no-sandbox"]}'

if [[ ! -f "${INPUT_MD}" ]]; then
  echo "Error: contract markdown not found: ${INPUT_MD}" >&2
  exit 1
fi

if command -v pandoc >/dev/null 2>&1; then
  if ! command -v xelatex >/dev/null 2>&1; then
    echo "Error: pandoc found, but xelatex is missing." >&2
    echo "Install a TeX engine (e.g., texlive-xetex) or use md-to-pdf instead." >&2
    exit 1
  fi

  pandoc "${INPUT_MD}" \
    -o "${OUTPUT_PDF}" \
    --pdf-engine=xelatex \
    -V papersize=letter \
    -V geometry:margin=0.75in \
    -V fontsize=12pt \
    -V linestretch=1.15 \
    -V mainfont="Times New Roman"

  echo "PDF built with pandoc: ${OUTPUT_PDF}"
  exit 0
fi

if command -v md-to-pdf >/dev/null 2>&1; then
  md-to-pdf "${INPUT_MD}" --stylesheet "${CSS_FILE}" --launch-options "${MD_TO_PDF_LAUNCH_OPTIONS}"
  echo "PDF built with md-to-pdf: ${OUTPUT_PDF}"
  exit 0
fi

if command -v npx >/dev/null 2>&1; then
  npx --yes md-to-pdf "${INPUT_MD}" --stylesheet "${CSS_FILE}" --launch-options "${MD_TO_PDF_LAUNCH_OPTIONS}"
  echo "PDF built with npx md-to-pdf: ${OUTPUT_PDF}"
  exit 0
fi

echo "Error: no PDF builder found in PATH." >&2
echo "Install one of: pandoc + xelatex, md-to-pdf, or npm/npx." >&2
exit 1
