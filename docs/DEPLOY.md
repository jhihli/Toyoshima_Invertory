# Deploying from the dev PC

`scripts/deploy.sh` runs the update procedure from CLAUDE.md on the server in one command:
pull `origin/main` → rebuild only what changed → restart the systemd unit(s) → health check.

```bash
git push origin main
ssh toyoshima '~/Toyoshima_Invertory/scripts/deploy.sh'            # normal deploy
ssh toyoshima '~/Toyoshima_Invertory/scripts/deploy.sh --migrate'  # when it reports new migrations
```

Exit codes: `0` deployed / nothing to do · `1` server tree dirty · `2` new migrations, rerun with
`--migrate` (nothing was pulled) · `3` a service failed its health check (journal is printed).

`--migrate` always takes a `pg_dump` to `~/backups/` first. One-off manual steps that a migration
needs (e.g. counting unplaced boards before 0047, deleting `media/boards` after 0048) are still
yours to run — read the migration before passing `--migrate`.

## One-time setup

### 1. SSH alias on the dev PC (done 2026-11-05)

`~/.ssh/config`:

```
Host toyoshima
    HostName 192.168.1.196        # office LAN; switch to the Tailscale IP to deploy from anywhere
    User toyoshimagtech
    IdentityFile ~/.ssh/id_ed25519
```

### 2. Passwordless restart of the two units only (run once on the server)

The deploy user keeps needing a password for every other `sudo` command; only these two exact
command lines are exempt:

```bash
echo 'toyoshimagtech ALL=(root) NOPASSWD: /usr/bin/systemctl restart toyoshima-backend, /usr/bin/systemctl restart toyoshima-frontend' \
  | sudo tee /etc/sudoers.d/toyoshima-deploy
sudo chmod 440 /etc/sudoers.d/toyoshima-deploy
sudo visudo -c                   # must print "parsed OK"
sudo -k; sudo -n systemctl restart toyoshima-backend && echo OK   # no password prompt
```

nginx config changes are not automated — `sudo nginx -t && sudo systemctl reload nginx` by hand.

### 3. Tailscale (optional — deploy from outside the office)

`tailscaled` is already running on the server but logged out. Never open port 22 on the router
instead; Tailscale gives SSH access without exposing anything publicly.

```bash
sudo tailscale up                # on the server; open the printed URL, sign in
tailscale ip -4                  # note the 100.x.y.z address
```

Install Tailscale on the dev PC, sign into the same account, then change `HostName` in the SSH
alias to that `100.x.y.z` address. Review the device list afterwards (docs/SECURITY.md checklist).
