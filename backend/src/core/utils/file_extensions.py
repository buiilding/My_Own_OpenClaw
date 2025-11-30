"""
File Extension Constants.

Defines sets of file extensions for different file types.
Used for file type detection and filtering.
"""

# Default encoding to try for text files
DEFAULT_ENCODING = "utf-8"
FALLBACK_ENCODINGS = ["utf-8", "latin-1", "cp1252"]

# Common text file extensions
TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".log",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
    ".sql",
    ".csv",
    ".tsv",
    ".r",
    ".R",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".java",
    ".scala",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".pl",
    ".lua",
    ".dart",
    ".kt",
    ".swift",
}

# Image file extensions
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".tiff",
    ".tif",
}

# PDF file extensions
PDF_EXTENSIONS = {".pdf"}

# Audio file extensions
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"}

# Video file extensions
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"}

# Binary file extensions (files we should skip)
BINARY_EXTENSIONS = {
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".dat",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".7z",
    ".rar",
    ".jar",
    ".war",
    ".ear",
    ".class",
    ".pyc",
    ".pyo",
    ".o",
    ".obj",
    ".lib",
    ".a",
    ".deb",
    ".rpm",
}
