# Verify the Data Navigator Windows installer

The `v1.0.8` Windows MSI and EXE are signed for direct distribution to the
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
   $sig = Get-AuthenticodeSignature .\Data-Navigator-Setup.exe # substitute the downloaded EXE or MSI name
   $sig.Status
   $sig.SignerCertificate.Thumbprint
   ```

   Proceed only when the status is `Valid` and the thumbprint matches the value
   in step 3. Confirm the installer hash against its GitHub build attestation
   when available.

When this certificate is no longer needed, remove that exact thumbprint from
the current user's Trusted People store. Later releases intended for general
public distribution will use a publicly trusted signing provider instead.
