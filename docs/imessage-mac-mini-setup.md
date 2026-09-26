# iMessage Setup — Mac Mini (BlueBubbles + Cloudflare Tunnel)

This is the one-time setup you run on the **Mac Mini**. Takes ~15 minutes.

---

## Step 1 — Sign into iMessage on the Mac Mini

1. Open **Messages.app** on Mac Mini
2. Go to **Messages → Settings → iMessage**
3. Sign in with your Apple ID
4. Wait for iMessage to show "Connected" ✓

---

## Step 2 — Install Homebrew (if not already)

Open **Terminal** on Mac Mini and run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## Step 3 — Download and Install BlueBubbles Server

1. Go to **https://bluebubbles.app** → Download the server `.dmg`
2. Open the `.dmg` and drag BlueBubbles to **Applications**
3. Open it — macOS may block it since it's unsigned. Fix:
   - Go to **System Settings → Privacy & Security**
   - Scroll down and click **"Open Anyway"** for BlueBubbles
4. Grant permissions when prompted:
   - ✅ **Full Disk Access** (required — reads the iMessage database)
   - ✅ **Accessibility** (recommended)
   - ✅ **Contacts** (for name resolution)

---

## Step 4 — Configure BlueBubbles Server

In the BlueBubbles Server app:

1. **Set a Password** — remember this, you'll enter it in the dashboard
2. **Proxy Service** → Select **"Cloudflare Tunnel"**
   - Click "Start" — it will generate a URL like `https://xyz.trycloudflare.com`
   - ⚠️ This random URL changes on restart — we'll fix that in Step 6
3. **Webhooks** → Click "Add Webhook"
   - URL: `https://your-host.example.com/webhook/imessage`
   - Events: check **"New Message"** (and optionally "Updated Message")
   - Click Save

---

## Step 5 — Prevent Mac Mini from Sleeping

```bash
# Run in Terminal on Mac Mini — prevents sleep while power is connected
sudo pmset -c sleep 0 displaysleep 10 disksleep 0
```

---

## Step 6 — Set Up a Fixed Cloudflare Tunnel URL

Instead of a random URL that changes, we'll give it a permanent subdomain:
`imessage.outboundos.space`

### Install cloudflared on Mac Mini

```bash
brew install cloudflare/cloudflare/cloudflared
```

### Login to Cloudflare

```bash
cloudflared tunnel login
# Opens browser — log in with your Cloudflare account
```

### Create a named tunnel

```bash
cloudflared tunnel create imessage-mac
# Note the tunnel ID printed (looks like: abc123de-f456-...)
```

### Create the config file

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/imessage.yml
```

Paste this content (replace `TUNNEL_ID` with the ID from previous step):

```yaml
tunnel: TUNNEL_ID
credentials-file: /Users/YOUR_USERNAME/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: imessage.outboundos.space
    service: http://localhost:1234
    # 1234 is the default BlueBubbles server port — check yours in BB settings
  - service: http_status:404
```

### Add DNS record in Cloudflare

```bash
cloudflared tunnel route dns imessage-mac imessage.outboundos.space
```

### Run the tunnel (test first)

```bash
cloudflared tunnel --config ~/.cloudflared/imessage.yml run imessage-mac
```

Visit `https://imessage.outboundos.space/api/v1/ping` — you should see a JSON response.

### Run as a background service (auto-start on boot)

```bash
cloudflared service install
# Then start it:
sudo launchctl start com.cloudflare.cloudflared
```

---

## Step 7 — Add Account in Outbound OS Dashboard

1. Go to your Outbound OS dashboard
2. Navigate to **Settings → iMessage Accounts**
3. Click **"Add Account"**
4. Fill in:
   - **Name**: `Mac Mini`
   - **Server URL**: `https://imessage.outboundos.space`
   - **Password**: (the one you set in BlueBubbles)
   - **Apple ID**: (your Apple ID email, for reference)
5. Click **Save** → it will ping the server immediately and show **"Online"** ✓

---

## Verify Everything Works

```bash
# From your VPS or locally — should return {"status":"ok",...}
curl https://imessage.outboundos.space/api/v1/ping \
  -H "Authorization: Basic $(echo -n 'YOUR_BLUEBUBBLES_PASSWORD' | base64)"
```

---

## Notes for macOS Tahoe

- **Private API helper** has known injection issues on arm64 Tahoe — this is fine.
- We use `apple-script` method in our service which works perfectly on Tahoe.
- Send and receive both work. Message editing is disabled (broken on Tahoe, we don't need it).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Ping returns 401 | Wrong password in dashboard settings |
| Ping returns connection refused | BlueBubbles server not running on Mac Mini |
| Cloudflare tunnel offline | Run `sudo launchctl start com.cloudflare.cloudflared` on Mac Mini |
| Messages not sending | Check BlueBubbles logs, ensure iMessage is signed in |
| Webhook not firing | Check BlueBubbles → Webhooks tab, verify URL is correct |
