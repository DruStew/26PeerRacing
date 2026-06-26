# Run once as Administrator so phones/tablets on your Wi-Fi can reach `npm run dev` (port 3000).
# Right-click PowerShell → Run as administrator, then:
#   cd C:\26_PR_dev\peer-racing-web
#   .\scripts\allow-dev-lan-firewall.ps1

$ruleName = "Peer Racing Dev Server 3000"

$existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Firewall rule already exists: $ruleName"
  exit 0
}

netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=3000 profile=private,public enable=yes
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to add firewall rule. Run this script as Administrator."
  exit 1
}

Write-Host "Added inbound TCP 3000 rule for Private networks. Restart npm run dev if needed."
