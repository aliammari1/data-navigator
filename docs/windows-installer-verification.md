# Verify the Data Navigator Windows installer

The `v1.0.9` Windows MSI and EXE are signed for direct distribution to the
project owner and supervisor. The signing certificate is self-signed, so Windows
does not trust it automatically. The private key is never distributed. These
steps apply only to a PC whose owner has independently confirmed the certificate
fingerprint with the project owner.

1. Download `data-navigator-signing.cer` and the MSI or EXE from the same GitHub
   release. Ask the project owner for the certificate's SHA-256 fingerprint
   through a separate trusted channel. The expected fingerprint for this key is
   `F184780D4E767EBCC49F61DF060023A0F7B69DBD0327EAEE54139AFDF0C31DE4`.
2. In PowerShell, from the download directory, run:

   ```powershell
   (Get-FileHash .\data-navigator-signing.cer -Algorithm SHA256).Hash
   ```

   Stop if the result differs from the independently confirmed fingerprint.
3. Inspect the certificate's subject and validity period:

   ```powershell
   $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path .\data-navigator-signing.cer))
   $cert.Subject
   $cert.NotBefore
   $cert.NotAfter
   $cert.Thumbprint
   ```

   The subject is `CN=Data Navigator`. Its SHA-1 Authenticode thumbprint is
   `4B875D68FC061F20110AE78EC70159FBDE395536`.
4. After verifying the certificate, import only this public certificate into
   the current user's Trusted People store:

   ```powershell
   Import-Certificate -FilePath .\data-navigator-signing.cer -CertStoreLocation Cert:\CurrentUser\TrustedPeople
   ```

5. Before running either installer, verify its signature:

   ```powershell
   $installer = '.\Data-Navigator-Setup.exe' # substitute the downloaded EXE or MSI name
   $sig = Get-AuthenticodeSignature $installer
   $sig.Status
   $sig.SignerCertificate.Thumbprint
   ```

   Proceed only when the status is `Valid` and the thumbprint matches the value
   in step 3.

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

When this certificate is no longer needed, remove that exact thumbprint from
the current user's Trusted People store. Later releases intended for general
public distribution will use a publicly trusted signing provider instead.
