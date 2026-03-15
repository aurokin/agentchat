#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" != "--force" ]]; then
    echo "Usage: scripts/git/rewrite-public-history.sh --force" >&2
    echo "Run this only from a fresh disposable clone after committing the repo state you want to keep." >&2
    exit 1
fi

if [[ "$(git rev-parse --is-inside-work-tree)" != "true" ]]; then
    echo "This script must run inside a non-bare git working tree." >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is dirty. Run this from a clean clone." >&2
    exit 1
fi

backup_ref="refs/rewrites/pre-public-$(date +%Y%m%d%H%M%S)"
git update-ref "${backup_ref}" HEAD

# Remote-tracking refs are local clone state, not publish targets.
git for-each-ref --format='%(refname)' refs/remotes | while IFS= read -r remote_ref; do
    git update-ref -d "${remote_ref}"
done

temp_dir="$(mktemp -d)"
trap 'rm -rf "${temp_dir}"' EXIT

current_paths_file="${temp_dir}/current-paths.txt"
historical_paths_file="${temp_dir}/historical-paths.txt"
deleted_paths_file="${temp_dir}/deleted-paths.txt"
deleted_paths_nul_file="${temp_dir}/deleted-paths.nul"

git ls-tree -r --name-only HEAD | sort -u > "${current_paths_file}"
git log --branches --tags --format=%T \
    | sort -u \
    | while IFS= read -r tree_id; do
        git ls-tree -r --name-only "${tree_id}"
    done \
    | sed '/^$/d' \
    | sort -u \
    > "${historical_paths_file}"
comm -23 "${historical_paths_file}" "${current_paths_file}" > "${deleted_paths_file}"
tr '\n' '\0' < "${deleted_paths_file}" > "${deleted_paths_nul_file}"

deleted_paths_count="$(wc -l < "${deleted_paths_file}" | tr -d ' ')"
export AGENTCHAT_REWRITE_DELETED_PATHS_NUL_FILE="${deleted_paths_nul_file}"

export FILTER_BRANCH_SQUELCH_WARNING=1

if [ "${deleted_paths_count}" -gt 0 ]; then
    git filter-branch --force --index-filter "
if [ -s \"\$AGENTCHAT_REWRITE_DELETED_PATHS_NUL_FILE\" ]; then
    git rm -r --cached --ignore-unmatch --pathspec-from-file=\"\$AGENTCHAT_REWRITE_DELETED_PATHS_NUL_FILE\" --pathspec-file-nul >/dev/null 2>&1 || true
fi
" --prune-empty --tag-name-filter cat -- --branches --tags
fi

git filter-branch --force --tree-filter "
if [ -f apps/mobile/eas.json ]; then
    perl -0pi -e 's#https://adorable-llama-814\\.convex\\.cloud#https://your-deployment.convex.cloud#g; s#http://192\\.168\\.50\\.11:3030#http://your-lan-host:3030#g;' apps/mobile/eas.json
fi
" --prune-empty --tag-name-filter cat -- --branches --tags

rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

cat <<EOF
History rewrite complete.
Backup ref: ${backup_ref}
Removed history for ${deleted_paths_count} path(s) that are absent from HEAD.

Next steps:
1. Audit the rewritten history with:
   comm -23 <(git log --branches --tags --format=%T | sort -u | while IFS= read -r tree_id; do git ls-tree -r --name-only "\$tree_id"; done | sed '/^$/d' | sort -u) <(git ls-tree -r --name-only HEAD | sort -u)
   git log --branches --tags -p -- apps/mobile/eas.json | rg "adorable-llama-814|192\\.168\\.50\\.11"
2. Force-push only after verifying the rewritten clone:
   git push --force --all
   git push --force --tags
EOF
