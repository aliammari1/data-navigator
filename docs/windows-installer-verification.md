# Verify an unsigned Data Navigator Windows installer

Data Navigator Windows installers are intentionally distributed without an
Authenticode publisher signature. Windows can therefore show **Unknown publisher**,
SmartScreen warnings, or an organization-policy block. Do not install a private
root certificate and do not disable company security controls to work around a
block.

Before using an installer, verify that its SHA-256 hash matches the release
provenance file delivered with the same release.

In PowerShell:

```powershell
$installer = '.\Data.Navigator.Setup.1.0.10.exe' # or the MSI filename
$actual = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = Get-Content .\release-provenance.json -Raw | ConvertFrom-Json
$artifact = $manifest.artifacts | Where-Object { $_.name -eq (Split-Path $installer -Leaf) }

if (-not $artifact) {
  throw 'Installer is not listed in release-provenance.json.'
}

if ($actual -ne $artifact.sha256) {
  throw 'Installer SHA-256 does not match release-provenance.json.'
}

"SHA-256 verified: $actual"
```

The provenance file also records the release tag, source commit, repository,
GitHub Actions run, package sizes, and hashes. Hash verification protects against
accidental corruption or an unexpected byte-for-byte change, but it does **not**
identify or authenticate a Windows publisher.

If Windows or company policy blocks the application, stop and use the approved
company process. Do not ask the user to disable SmartScreen, application control,
antivirus, or other endpoint protections.
