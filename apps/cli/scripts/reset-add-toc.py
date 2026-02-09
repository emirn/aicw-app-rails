#!/usr/bin/env python3
"""Reset add_toc from applied_actions and revert last_pipeline to 'generate'
so articles can be re-enhanced with the new add_toc that generates toc attribute."""

import json, sys
from pathlib import Path

data_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("blogpostgen-data/data/projects")
dry_run = "--dry-run" in sys.argv

updated = 0
for index_file in data_root.rglob("index.json"):
    with open(index_file) as f:
        data = json.load(f)

    applied = data.get("applied_actions", [])
    if "add_toc" not in applied:
        continue

    # Remove add_toc from applied_actions
    applied = [a for a in applied if a != "add_toc"]
    data["applied_actions"] = applied

    # Revert last_pipeline to 'generate'
    old_pipeline = data.get("last_pipeline")
    data["last_pipeline"] = "generate"

    if dry_run:
        print(f"[DRY] {index_file}: {old_pipeline} -> generate, removed add_toc")
    else:
        with open(index_file, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"[OK] {index_file}: {old_pipeline} -> generate")
    updated += 1

print(f"\n{'Would update' if dry_run else 'Updated'} {updated} articles")
