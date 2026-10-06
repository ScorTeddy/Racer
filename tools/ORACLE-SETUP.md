# Running Scribble GP on Oracle Cloud (free)

Oracle's "Always Free" server is free for good, much bigger than Render's free plan, and comes with a lot more
data per month. Your accounts stay in Upstash, so nothing is lost by moving.

## 1. Sign up
- Go to oracle.com/cloud/free and sign up. It asks for a card to check you're a real person; it doesn't charge
  as long as you only use "Always Free" things. (Under 18? Ask a parent to do this part.)
- Pick the **home region** closest to your players. You can't change it later.

## 2. Make the server
Menu ☰ › Compute › Instances › **Create instance**:
- **Image:** Change image › Ubuntu › Canonical Ubuntu 24.04.
- **Shape:** Change shape › Ampere › **VM.Standard.A1.Flex**, 2 OCPUs and 12 GB memory (both still free).
  If it says "out of capacity", try again later or pick **VM.Standard.E2.1.Micro** (also free, smaller, still fine).
- **Networking:** keep "Assign a public IPv4 address" on.
- **SSH keys:** "Generate a key pair for me" › **Save private key**. Keep that file safe; it's how you get in.
- Create. Wait until it says **Running**, then copy the **Public IP address**.

## 3. Open the web ports
On the instance page: Subnet (the link) › Security Lists › Default Security List › **Add Ingress Rules**:
- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `80,443` › Add.

## 4. Get into the server
On Windows, open **Terminal** (or PowerShell); on a Mac, open Terminal:
```
ssh -i PATH-TO-THE-KEY-FILE ubuntu@YOUR-IP
```
(Drag the key file into the window to fill in its path. Type `yes` the first time.)
If it says the key's permissions are "too open":
- Mac/Linux: `chmod 600 PATH-TO-THE-KEY-FILE`
- Windows (PowerShell): `icacls PATH-TO-THE-KEY-FILE /inheritance:r /grant:r "$($env:USERNAME):R"`

## 5. Install the game (one line)
```
curl -fsSL https://raw.githubusercontent.com/ScorTeddy/Racer/main/tools/oracle-setup.sh | bash
```
It takes a few minutes and prints your game's address at the end, like `https://1-2-3-4.sslip.io`.

## 6. Put in your settings (the stuff from Render)
```
nano ~/scribble.env
```
Fill in each line from Render › your service › **Environment** (same names). Then save: **Ctrl+O**, Enter, **Ctrl+X**.
If Render had `COMMENTENTATOR_VOICE` (with the typo), put its value on the `COMMENTATOR_VOICE=` line.
Then:
```
sudo systemctl restart scribble
```
These settings live only on your server, never on GitHub.

## 7. Google sign-in
Google Cloud Console › APIs & Services › Credentials › your OAuth client › **Authorized JavaScript origins** ›
add your new address (`https://1-2-3-4.sslip.io`) › Save.

## Done
- Open your address. The first visit can take a minute while it gets its https certificate.
- **Updates are automatic:** every push to `main` is live within about 5 minutes.
- Something wrong? `journalctl -u scribble -n 50` shows the game's log; `sudo systemctl restart scribble` restarts it.
- Want your own name later (like `scribblegp.xyz`)? Buy a domain, point it at your server's IP (an "A record"),
  and change the first line of `/etc/caddy/Caddyfile` to it, then `sudo systemctl restart caddy`, change `SITE_URL`
  in `~/scribble.env`, and add the new address in Google too.

## Good to know
- **Idle servers can be taken back.** Oracle may reclaim an Always Free server that sits almost unused for 7 days
  (very low CPU, network and memory use). A game with players is usually busy enough. If it ever happens, nothing
  is lost (accounts are in Upstash): make a new server and do steps 2-7 again.
- **The first 30 days** come with free trial credit. After that, anything that isn't "Always Free" stops by itself.
  This server is Always Free, so it keeps going. Don't click "Upgrade to Pay As You Go" unless an adult who owns the
  card agrees: that's what lets Oracle charge for anything past the free limits.
- **Keep a copy of your settings** (`~/scribble.env`) somewhere safe, like a password manager, in case you ever need
  to set it up again.

