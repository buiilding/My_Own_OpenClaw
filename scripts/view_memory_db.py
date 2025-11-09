"""
Script to view the memory database contents.

Usage:
    python scripts/view_memory_db.py
    python scripts/view_memory_db.py --user-id default_user
    python scripts/view_memory_db.py --stats
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import get_config_dir


def get_db_path():
    """Get the path to the memory database."""
    config_dir = get_config_dir()
    memory_dir = config_dir / "memory"
    db_path = memory_dir / "memories.db"
    return db_path


def view_database(user_id=None, stats_only=False):
    """View the memory database contents."""
    db_path = get_db_path()
    
    if not db_path.exists():
        print(f"[!] Database not found at: {db_path}")
        print("\nThe database will be created automatically when you:")
        print("  1. Run the application (npm run electron)")
        print("  2. Send your first query to the assistant")
        print(f"\nExpected location: {db_path}")
        return
    
    print(f"Database location: {db_path}\n")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if stats_only:
        # Show statistics only
        cursor.execute("SELECT COUNT(*) as total FROM memories")
        total = cursor.fetchone()["total"]
        
        cursor.execute("""
            SELECT type, COUNT(*) as count 
            FROM memories 
            GROUP BY type
        """)
        by_type = {row["type"]: row["count"] for row in cursor.fetchall()}
        
        if user_id:
            cursor.execute("SELECT COUNT(*) as total FROM memories WHERE user_id = ?", (user_id,))
            user_total = cursor.fetchone()["total"]
            print(f"[STATS] Statistics for user '{user_id}':")
            print(f"   Total memories: {user_total}")
        else:
            print(f"[STATS] Overall Statistics:")
            print(f"   Total memories: {total}")
        
        print(f"\n   By type:")
        for mem_type, count in by_type.items():
            print(f"     - {mem_type}: {count}")
        
        conn.close()
        return
    
    # Build query
    query = "SELECT * FROM memories"
    params = []
    
    if user_id:
        query += " WHERE user_id = ?"
        params.append(user_id)
    
    query += " ORDER BY created_at DESC LIMIT 50"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    if not rows:
        print("[EMPTY] No memories found in database.")
        if user_id:
            print(f"   (filtered by user_id: {user_id})")
        conn.close()
        return
    
    print(f"[FOUND] {len(rows)} memories (showing latest 50):\n")
    print("=" * 80)
    
    for i, row in enumerate(rows, 1):
        print(f"\n[{i}] Memory ID: {row['id']}")
        print(f"    Type: {row['type']}")
        print(f"    User ID: {row['user_id']}")
        print(f"    Timestamp: {row['timestamp']}")
        
        # Parse metadata
        metadata = json.loads(row['metadata']) if row['metadata'] else {}
        if metadata:
            print(f"    Metadata: {json.dumps(metadata, indent=6)}")
        
        # Show content preview
        content = row['content']
        preview = content[:200] + "..." if len(content) > 200 else content
        print(f"    Content: {preview}")
        
        print("-" * 80)
    
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="View memory database contents")
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        help="Filter by user ID (default: show all users)"
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show statistics only"
    )
    
    args = parser.parse_args()
    
    print("Memory Database Viewer\n")
    view_database(user_id=args.user_id, stats_only=args.stats)


if __name__ == "__main__":
    main()

