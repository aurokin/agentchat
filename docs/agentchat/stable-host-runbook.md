# Stable Host Runbook

Use this runbook for the protected stable Agentchat install on a host.

Current host model:

- dedicated stable checkout
- host-managed files under `~/.config/agentchat/stable/`
- lifecycle driven by `scripts/host/*.sh`
- current LAN HTTPS entrypoint `https://bront.home.arpa:4043`
- dormant public-hostname metadata available in `~/.config/agentchat/config.json` for future cutover planning

The stable checkout is intentionally a host-managed snapshot, not a normal day-to-day branch checkout. `scripts/host/install-stable.sh` clones from the operator's source checkout when needed, fetches the selected source commit, and checks out `FETCH_HEAD` detached. `scripts/host/update-stable.sh` and `scripts/host/rollback-stable.sh` repeat that detached-checkout flow. Do not treat the stable checkout's local `origin` or detached state as the source of truth; use the host scripts from the operator checkout to install, update, roll back, and render stable runtime files.

## Core Commands

Install or refresh the stable checkout:

```bash
scripts/host/install-stable.sh
```

Validate configuration and runtime readiness:

```bash
scripts/host/doctor-stable.sh
scripts/host/smoke-stable.sh
```

Start and stop the stable instance:

```bash
scripts/host/start-stable.sh
scripts/host/stop-stable.sh
```

Update or roll back the stable checkout:

```bash
scripts/host/update-stable.sh
scripts/host/rollback-stable.sh
```

Sync production Convex runtime secrets:

```bash
scripts/host/generate-stable-convex-env.sh
scripts/host/apply-stable-convex-env.sh
```

## Systemd User Service

Install the user service:

```bash
scripts/host/install-stable-user-service.sh --enable-now
```

Useful service commands:

```bash
systemctl --user status agentchat-stable.service
systemctl --user restart agentchat-stable.service
systemctl --user stop agentchat-stable.service
journalctl --user -u agentchat-stable.service -n 200
```

If the service should start before login, enable linger separately:

```bash
sudo loginctl enable-linger "$USER"
```

## Expected Paths

- stable checkout: `$HOME/code/agentchat/stable`
- host config root: `~/.config/agentchat/`
- stable env/config: `~/.config/agentchat/stable/`
- stable state root: `~/.local/state/agentchat/stable/`
- stable logs: `~/.local/state/agentchat/stable/logs/`

Useful host-config metadata fields:

- `stable.lanUrl`
- `stable.publicUrl`
- `stable.secondaryUrls`

Those fields do not switch the live stable host over by themselves. They are there so the future public hostname can be documented and staged before it is activated.

## Fast Triage

1. Check readiness:

```bash
scripts/host/doctor-stable.sh
scripts/host/smoke-stable.sh
```

2. Check processes and logs:

```bash
systemctl --user status agentchat-stable.service
journalctl --user -u agentchat-stable.service -n 200
tail -n 200 ~/.local/state/agentchat/stable/logs/server.log
tail -n 200 ~/.local/state/agentchat/stable/logs/web.log
```

3. Restart cleanly:

```bash
scripts/host/stop-stable.sh
scripts/host/start-stable.sh
```

## Known Failure Patterns

### Stable checkout refuses update

Cause:

- local changes exist in the stable checkout

Check:

```bash
git -C "$HOME/code/agentchat/stable" status --short
```

Fix:

- remove or commit the unexpected local drift
- rerun `scripts/host/update-stable.sh`

### Copy-on-conversation agent fails on send

Cause:

- the agent root contains symlinks, so sandbox creation is rejected

Check:

```bash
scripts/host/doctor-stable.sh
```

Fix:

- replace the symlink with real files/directories inside the agent root
- rerun `scripts/host/doctor-stable.sh`

### Google auth completes but the app stays unauthenticated

Check:

- `SITE_URL` in `~/.config/agentchat/stable/convex-runtime.env`
- local Caddy routing for the public stable entrypoint

Fix:

- update the runtime env
- reapply with `scripts/host/apply-stable-convex-env.sh`
- restart stable

### LAN HTTPS entrypoint fails

Check:

```bash
curl -kI https://bront.home.arpa:4043
```

Fix:

- verify the local Caddy config and deployment
- keep the stable app itself on local HTTP; terminate TLS in Caddy

### Future public hostname is configured in host metadata but should stay inactive

Cause:

- `stable.publicUrl` or related Caddy examples were prepared ahead of time, but the actual public cutover has not happened yet

Fix:

- treat `stable.publicUrl` and `stable.secondaryUrls` as planning metadata only
- leave Convex `SITE_URL`, reverse-proxy routing, and trusted origins on the current live LAN entrypoint until the public rollout is intentional

## Reliability Baseline

The stable host should be considered healthy when all of these pass:

- `scripts/host/doctor-stable.sh`
- `scripts/host/smoke-stable.sh`
- `systemctl --user status agentchat-stable.service`
- the LAN entrypoint loads at `https://bront.home.arpa:4043`
