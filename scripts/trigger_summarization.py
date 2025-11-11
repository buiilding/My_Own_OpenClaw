"""
Script to manually trigger memory summarization.

Usage:
    python scripts/trigger_summarization.py
    python scripts/trigger_summarization.py --user-id default_user
    python scripts/trigger_summarization.py --user-id default_user --session-id <session_id>
    python scripts/trigger_summarization.py --all-users
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import get_settings
from backend.memory.memory_manager import MemoryManager
from backend.memory.local_store import get_memory_store


async def trigger_summarization(user_id: str, session_id: str = None):
    """Trigger summarization for a specific user and optionally session."""
    cfg = get_settings()

    if not cfg.memory_enabled:
        print("[!] Memory system is disabled in configuration.")
        return

    print(f"Triggering summarization for user: {user_id}")
    if session_id:
        print(f"  Session ID: {session_id}")
    else:
        print("  All sessions")
    print()

    # Create memory manager
    # If no session_id provided, we'll use a placeholder but the summarizer
    # will process all unsummarized memories regardless
    manager_session_id = session_id or "manual_trigger"
    manager = MemoryManager(user_id, manager_session_id, cfg)

    # Check how many unsummarized memories exist
    memory_store = get_memory_store(cfg)
    filters = {"metadata.type": "episodic", "metadata.summarized": "false"}
    if session_id:
        filters["metadata.session_id"] = session_id

    unsummarized = memory_store.search(
        query="",
        user_id=user_id,
        filters=filters,
        limit=1000,
    )

    if not unsummarized:
        print("[INFO] No unsummarized episodic memories found.")
        print("       All memories have already been summarized.")
        return

    # Group by session for display
    sessions = {}
    for memory in unsummarized:
        mem_session_id = memory.get("metadata", {}).get("session_id", "unknown")
        if mem_session_id not in sessions:
            sessions[mem_session_id] = []
        sessions[mem_session_id].append(memory)

    print(f"[FOUND] {len(unsummarized)} unsummarized episodic memories")
    print(f"        across {len(sessions)} session(s):\n")

    for sess_id, memories in sessions.items():
        print(f"  - Session {sess_id}: {len(memories)} interactions")
        # Show first interaction preview
        if memories:
            first_content = memories[0].get("text", "")[:100]
            print(f"    Preview: {first_content}...")

    print("\n[PROCESSING] Starting summarization...\n")

    # Trigger summarization
    try:
        count = await manager.summarize_and_store_semantic_memory()

        if count > 0:
            print(f"[SUCCESS] Created {count} semantic memory/memories!")
            print("\n[INFO] You can now view semantic memories with:")
            print("       python scripts/view_memory_db.py --stats")
            print("       python scripts/view_memory_db.py")
        else:
            print("[INFO] No semantic memories were created.")
            print("       This might mean:")
            print("       - The LLM didn't extract any facts")
            print("       - There was an error during processing")
            print("       - Check server logs for details")
    except Exception as e:
        print(f"[ERROR] Summarization failed: {e}")
        import traceback
        traceback.print_exc()


async def trigger_all_users():
    """Trigger summarization for all users with unsummarized memories."""
    import sqlite3

    cfg = get_settings()

    if not cfg.memory_enabled:
        print("[!] Memory system is disabled in configuration.")
        return

    memory_store = get_memory_store(cfg)

    # Get all unique user_ids with unsummarized memories
    with sqlite3.connect(memory_store.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT user_id
            FROM memories
            WHERE type = 'episodic'
        """)
        all_user_ids = [row[0] for row in cursor.fetchall()]

    # Filter to only users with unsummarized memories
    user_ids = []
    for user_id in all_user_ids:
        filters = {"metadata.type": "episodic", "metadata.summarized": "false"}
        unsummarized = memory_store.search(
            query="",
            user_id=user_id,
            filters=filters,
            limit=1,  # Just check if any exist
        )
        if unsummarized:
            user_ids.append(user_id)

    if not user_ids:
        print("[INFO] No users with unsummarized memories found.")
        return

    print(f"[FOUND] {len(user_ids)} user(s) with unsummarized memories: {user_ids}\n")

    for user_id in user_ids:
        print(f"\n{'='*60}")
        print(f"Processing user: {user_id}")
        print('='*60)
        await trigger_summarization(user_id, session_id=None)
        print()


async def main():
    parser = argparse.ArgumentParser(
        description="Manually trigger memory summarization"
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default="default_user",
        help="User ID to process (default: default_user)",
    )
    parser.add_argument(
        "--session-id",
        type=str,
        default=None,
        help="Optional session ID to process (default: all sessions for user)",
    )
    parser.add_argument(
        "--all-users",
        action="store_true",
        help="Process all users with unsummarized memories",
    )

    args = parser.parse_args()

    print("Memory Summarization Trigger\n")

    if args.all_users:
        await trigger_all_users()
    else:
        await trigger_summarization(args.user_id, args.session_id)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] Interrupted by user")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
