#!/usr/bin/env bash
# Runs the committer workflow for the developer CLI and automation tooling.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/committer.sh "<subject>" --body "<text>" [--body "<text>"]... [--no-verify] -- <files...>

Stages only the listed paths before creating the commit.
Commit bodies are required and must use this exact section structure:

What changed:
Owning layer:
Previous behavior:
New path:
Validation:
Migration/security:
EOF
}

required_body_headers=(
  "What changed:"
  "Owning layer:"
  "Previous behavior:"
  "New path:"
  "Validation:"
  "Migration/security:"
)

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

body_header_index() {
  local line="$1"
  local i

  for i in "${!required_body_headers[@]}"; do
    if [[ "$line" == "${required_body_headers[$i]}" ]]; then
      printf '%s' "$i"
      return 0
    fi
  done

  return 1
}

is_placeholder_body_section() {
  local value
  value="$(trim "$1" | tr '[:upper:]' '[:lower:]')"

  case "$value" in
    "n/a"|"na"|"none"|"todo"|"tbd"|"not applicable")
      return 0
      ;;
  esac

  return 1
}

validate_commit_body_format() {
  local body="$1"
  local current_index=-1
  local expected_index=0
  local line trimmed_line header_index i content trimmed_content
  declare -a section_content=("" "" "" "" "" "")
  declare -a seen_headers=(0 0 0 0 0 0)

  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed_line="$(trim "${line%$'\r'}")"
    if header_index="$(body_header_index "$trimmed_line")"; then
      if [[ "$header_index" -ne "$expected_index" ]]; then
        echo "error: commit body sections must appear in this exact order:" >&2
        printf '  %s\n' "${required_body_headers[@]}" >&2
        exit 1
      fi
      if [[ "${seen_headers[$header_index]}" -eq 1 ]]; then
        echo "error: duplicate commit body section '${required_body_headers[$header_index]}'" >&2
        exit 1
      fi
      seen_headers[$header_index]=1
      current_index="$header_index"
      expected_index=$((expected_index + 1))
      continue
    fi

    if [[ "$current_index" -lt 0 ]]; then
      if [[ -n "$trimmed_line" ]]; then
        echo "error: commit body must start with '${required_body_headers[0]}'" >&2
        exit 1
      fi
      continue
    fi

    section_content[$current_index]+="${line}"$'\n'
  done <<< "$body"

  for i in "${!required_body_headers[@]}"; do
    if [[ "${seen_headers[$i]}" -ne 1 ]]; then
      echo "error: commit body is missing required section '${required_body_headers[$i]}'" >&2
      exit 1
    fi

    content="${section_content[$i]}"
    trimmed_content="$(trim "$content")"
    if [[ -z "$trimmed_content" ]]; then
      echo "error: commit body section '${required_body_headers[$i]}' must include content" >&2
      exit 1
    fi
    if is_placeholder_body_section "$trimmed_content"; then
      echo "error: commit body section '${required_body_headers[$i]}' must not be placeholder-only" >&2
      exit 1
    fi
  done
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

subject="$1"
shift

declare -a bodies=()
declare -a files=()
declare -a commit_args=()
no_verify=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --body)
      if [[ $# -lt 2 ]]; then
        echo "error: --body requires a value" >&2
        exit 1
      fi
      bodies+=("$2")
      shift 2
      ;;
    --no-verify)
      no_verify=1
      shift
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        files+=("$1")
        shift
      done
      ;;
    *)
      files+=("$1")
      shift
      ;;
  esac
done

if [[ ${#files[@]} -eq 0 ]]; then
  echo "error: specify at least one path to stage" >&2
  usage
  exit 1
fi

if [[ ${#bodies[@]} -eq 0 ]]; then
  echo "error: at least one --body value is required" >&2
  usage
  exit 1
fi

for body in "${bodies[@]}"; do
  if [[ -z "${body//[[:space:]]/}" ]]; then
    echo "error: --body value must not be empty" >&2
    exit 1
  fi
done

combined_body=""
for body in "${bodies[@]}"; do
  if [[ -n "$combined_body" ]]; then
    combined_body+=$'\n\n'
  fi
  combined_body+="$body"
done

validate_commit_body_format "$combined_body"

git rev-parse --show-toplevel >/dev/null

git add -- "${files[@]}"

if git diff --cached --quiet -- "${files[@]}"; then
  echo "error: no staged changes found for the listed paths" >&2
  exit 1
fi

commit_args=(-m "$subject")

for body in "${bodies[@]}"; do
  commit_args+=(-m "$body")
done

if [[ "$no_verify" -eq 1 ]]; then
  commit_args+=(--no-verify)
fi

git commit "${commit_args[@]}"
