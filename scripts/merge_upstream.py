#!/usr/bin/env python3
"""
Hermes-Bot-Mode merge script
=============================
Fetch upstream changes and re-apply custom A2A feedback loop code.
When upstream has equivalent features, prefer upstream implementation
with custom enhancements merged in.

Usage:
    python scripts/merge_upstream.py --repo-path . [--dry-run] [--no-tests]
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path


# ── Custom test files to preserve ─────────────────────────────────────────────
CUSTOM_TEST_FILES = [
    "tests/a2a-feedback.test.mjs",
]


def run(cmd, cwd=None, check=True):
    """Run a shell command and return stdout. Args as list to avoid shell injection."""
    import shlex
    if isinstance(cmd, str):
        cmd = shlex.split(cmd)
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"Command failed: {' '.join(cmd)}\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def has_upstream_a2a(content: str) -> bool:
    """Check upstream already has A2A feedback functionality."""
    return "A2AFeedbackPane" in content or "a2a-feedback" in content


def merge_plugin(upstream_content: str, custom_plugin: str) -> str:
    """
    Merge custom A2A code into upstream plugin.js.
    Extracts custom sections from the full custom plugin and inserts into upstream.
    """
    result = upstream_content

    # If upstream already has A2A, keep upstream version
    if has_upstream_a2a(upstream_content):
        print("Upstream already has A2A feedback — keeping upstream version")
        return result

    # Extract A2A section from custom plugin
    a2a_start = custom_plugin.find("// ── A2A feedback loop ────")
    roster_marker = "// ── roster pane ─────────────────"
    a2a_end = custom_plugin.find(roster_marker)

    if a2a_start == -1 or a2a_end == -1:
        print("WARNING: Could not extract A2A section from custom plugin")
        return result

    a2a_section = custom_plugin[a2a_start:a2a_end]

    # Insert before roster pane in upstream
    insert_pos = result.find(roster_marker)
    if insert_pos == -1:
        print("WARNING: Could not find roster pane marker")
        return result

    result = result[:insert_pos] + a2a_section + result[insert_pos:]
    print("Inserted A2A feedback loop functions")

    # Extract pane registration from custom plugin
    reg_marker = "// A2A Feedback — shows heartbeat results"
    reg_start = custom_plugin.find(reg_marker)
    reg_end = custom_plugin.find("\n    })", reg_start) + len("\n    })")

    if reg_start == -1:
        print("WARNING: Could not extract A2A registration from custom plugin")
        return result

    reg_block = custom_plugin[reg_start:reg_end]

    # Insert after routines registration
    routines_marker = "render: () => jsx(RoutinesPane, {})"
    routines_pos = result.find(routines_marker)
    if routines_pos != -1:
        end_brace = result.find("\n    })", routines_pos)
        if end_brace != -1:
            insert_at = end_brace + len("\n    })")
            result = result[:insert_at] + "\n\n" + reg_block + result[insert_at:]
            print("Inserted A2A pane registration")

    # Extract palette command from custom plugin
    palette_marker = "id: 'a2a-feedback-cmd'"
    palette_start = custom_plugin.find(palette_marker)
    if palette_start != -1:
        # Find the enclosing ctx.register block
        ctx_start = custom_plugin.rfind("ctx.register({", 0, palette_start)
        ctx_end = custom_plugin.find("\n    })", palette_start) + len("\n    })")
        palette_block = custom_plugin[ctx_start:ctx_end]

        # Insert after new-agent palette command
        new_agent_pos = result.find("id: 'new-agent'")
        if new_agent_pos != -1:
            new_agent_end = result.find("\n    })", new_agent_pos) + len("\n    })")
            result = result[:new_agent_end] + "\n\n" + palette_block + result[new_agent_end:]
            print("Inserted A2A palette command")

    return result


def main():
    parser = argparse.ArgumentParser(description="Merge upstream into custom fork")
    parser.add_argument("--repo-path", default=".", help="Path to the cloned repo")
    parser.add_argument("--upstream-url", help="Upstream URL (if not already added as remote)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    parser.add_argument("--no-tests", action="store_true", help="Skip running tests")
    args = parser.parse_args()

    repo = Path(args.repo_path).resolve()

    # 1. Ensure upstream remote exists
    remotes = run("git remote", cwd=repo)
    if "upstream" not in remotes:
        if not args.upstream_url:
            print("Error: --upstream-url required when 'upstream' remote missing", file=sys.stderr)
            sys.exit(1)
        run(f"git remote add upstream {args.upstream_url}", cwd=repo)
        print(f"Added upstream remote: {args.upstream_url}")

    # 2. Fetch latest upstream
    print("Fetching upstream...")
    run("git fetch upstream main", cwd=repo)

    # 3. Check if upstream has new commits
    local_head = run("git rev-parse main", cwd=repo)
    upstream_head = run("git rev-parse upstream/main", cwd=repo)

    if local_head == upstream_head:
        print("Already up to date with upstream.")
        return

    ahead_count = run("git rev-list --count main..upstream/main", cwd=repo)
    print(f"Upstream is {ahead_count} commits ahead.")

    # 4. Back up custom test files
    test_backups = {}
    for test_file in CUSTOM_TEST_FILES:
        test_path = repo / test_file
        if test_path.exists():
            test_backups[test_file] = test_path.read_text(encoding="utf-8")
            print(f"Backed up: {test_file}")

    # 5. Create a backup branch
    run(f"git branch -f custom-backup main", cwd=repo)
    print("Created backup branch: custom-backup")

    # 6. Reset plugin.js to upstream
    run("git checkout upstream/main -- plugin.js", cwd=repo)
    print("Reset plugin.js to upstream version")

    # 7. Merge custom A2A code into upstream
    plugin_path = repo / "plugin.js"
    upstream_content = plugin_path.read_text(encoding="utf-8")
    custom_plugin = current_plugin

    merged_content = merge_plugin(upstream_content, custom_plugin)

    if not args.dry_run:
        plugin_path.write_text(merged_content, encoding="utf-8")
        print("Wrote merged plugin.js")
    else:
        print("[DRY RUN] Would write merged plugin.js")

    # 8. Restore custom test files
    for test_file, content in test_backups.items():
        test_path = repo / test_file
        if not args.dry_run:
            test_path.write_text(content, encoding="utf-8")
            print(f"Restored: {test_file}")

    # 9. Stage and commit
    if not args.dry_run:
        run("git add plugin.js", cwd=repo)
        for test_file in CUSTOM_TEST_FILES:
            run(f"git add {test_file}", cwd=repo)

        commit_msg = (
            f"merge: integrate upstream {upstream_head[:8]} + preserve A2A feedback\n\n"
            f"Upstream: {upstream_head[:8]}\n"
            f"Local:    {local_head[:8]}"
        )
        run(f'git commit -m "{commit_msg}"', cwd=repo)
        print("Committed merge")

    # 10. Run tests
    if not args.dry_run and not args.no_tests:
        print("\nRunning tests...")
        result = subprocess.run(["node", "--test"], cwd=repo, capture_output=True, text=True)
        print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
        if result.returncode != 0:
            print(result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr, file=sys.stderr)
            print("\nTests failed. Fix manually or run: git reset --hard custom-backup")
            sys.exit(1)
        print("\nAll tests passed!")

    print(f"\nDone. Backup branch: custom-backup")


if __name__ == "__main__":
    main()
