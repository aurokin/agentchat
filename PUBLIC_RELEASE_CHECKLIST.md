# Public Release Checklist

Use this before switching the repository visibility to public.

## Repo Content

- Remove or rotate any credential that may have existed in git history, not just the current working tree.
- Keep only example env files in git. Local files such as `.env*.local` and generated configs should stay ignored.
- Verify no screenshots, logs, build artifacts, or local exports are tracked unintentionally.
- Sanitize machine-specific paths, LAN IPs, and deployment URLs in docs and config examples.

## GitHub Settings

- Choose and add a `LICENSE`.
- Configure repository description, topics, and homepage.
- Enable secret scanning and push protection.
- Enable Dependabot alerts and updates.
- Enable branch protection for the default branch.
- Decide whether to use issue templates, PR templates, and Discussions.
- Add a `SECURITY.md` contact/reporting policy if you want private vulnerability intake.

## Final Verification

- Rewrite history in a fresh clone with `scripts/git/rewrite-public-history.sh --force` after committing the exact `HEAD` tree you want to preserve publicly.
- Run `bun run verify:ci`.
- Run the manual confidence suite you consider release-blocking.
- Review `git status --short` and the staged diff for anything environment-specific.
