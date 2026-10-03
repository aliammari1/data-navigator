# Verify the Data Navigator Windows installer

The Windows MSI and EXE are signed for direct distribution to the project owner
and supervisor. The signer is issued by a private Data Navigator code-signing
root, which Windows does not trust automatically. The root certificate contains
only a public key; neither private key is distributed. Follow these steps only
after independently confirming the root fingerprint with the project owner.

1. Download `data-navigator-signing-root.cer` and the MSI or EXE from the same
   GitHub release. Ask the project owner for the root's SHA-256 fingerprint
   through a separate trusted channel. The expected fingerprint for this key is
   `7237D443A8D69F6146A95FEE4B4CEF8ADB50801457226FB8501CB634C80BD138`.
2. In PowerShell, from the download directory, run:

   ```powershell
   (Get-FileHash .\data-navigator-signing-root.cer -Algorithm SHA256).Hash
   ```

   Stop if the result differs from the independently confirmed fingerprint.
3. Inspect the root's subject, validity, and CA status:

   ```powershell
   $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path .\data-navigator-signing-root.cer))
   $cert.Subject
   $cert.NotBefore
   $cert.NotAfter
   $cert.Thumbprint
   $cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.19' } | ForEach-Object { $_.Format($true) }
   ```

   The root subject is `CN=Data Navigator Private Code Signing Root 2026,
   O=Data Navigator`, its SHA-1 thumbprint is
   `12B05CA207AA2CC9A71BC391F4D0B4265FEEA002`, and Basic Constraints must
   say `CA=True`. The root is restricted to code signing.
4. After verifying the root, import its public certificate into the current
   user's Trusted Root Certification Authorities store:

   ```powershell
   Import-Certificate -FilePath .\data-navigator-signing-root.cer -CertStoreLocation Cert:\CurrentUser\Root
   ```

5. Before running either installer, verify its signature:

   ```powershell
   $installer = '.\Data Navigator Setup 1.0.10.exe' # substitute the downloaded EXE or MSI name
   $sig = Get-AuthenticodeSignature $installer
   $sig.Status
   $sig.SignerCertificate.Thumbprint
   $sig.SignerCertificate.Subject
   ```

   Proceed only when the status is `Valid`, the signer subject is
   `CN=Data Navigator, O=Ali Ammari`, and the signer thumbprint is
   `1956F63398744EF3D2A88348371753B60A3F1390`.

6. Download `release-signing-key.asc`, `release-provenance.json`, its `.asc`
   signature, and the installer's matching `.asc` signature from the same
   release. Independently confirm the release GPG key fingerprint with the
   publisher; the expected fingerprint is
   `BAD14B8D11A5A8751BC71FABEDD42B597D58CCEB`. With GnuPG installed, run:

   ```powershell
   gpg --import .\release-signing-key.asc
   gpg --fingerprint BAD14B8D11A5A8751BC71FABEDD42B597D58CCEB
   gpg --verify .\release-provenance.json.asc .\release-provenance.json
   gpg --verify "${installer}.asc" $installer
   $manifest = Get-Content .\release-provenance.json -Raw | ConvertFrom-Json
   $artifact = $manifest.artifacts | Where-Object { $_.name -eq (Split-Path $installer -Leaf) }
   if (-not $artifact -or (Get-FileHash $installer -Algorithm SHA256).Hash -ne $artifact.sha256) {
     throw 'Installer hash does not match the signed release provenance.'
   }
   ```

   Both `gpg --verify` commands must report a good signature from the
   independently confirmed key. The manifest records the tagged source commit
   and GitHub Actions run alongside the installer hashes. Publisher GPG
   signatures are used because GitHub-hosted attestations are unavailable for
   this private repository.

When this private root is no longer needed, remove only the certificate with
thumbprint `12B05CA207AA2CC9A71BC391F4D0B4265FEEA002` from the current
user's Root store. Trusting a private root lets it validate certificates it
issues, so keep it only on devices whose owners have confirmed the fingerprint.
General public distribution requires a publicly trusted signing provider.
