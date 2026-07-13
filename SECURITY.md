# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**.
Instead, report it privately via GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" under the repository's **Security** tab), or by
contacting the maintainer directly.

Please include:

- A description of the issue and its impact
- Steps to reproduce
- The affected version / commit
- Any suggested remediation, if you have one

You can expect an initial response within a few days.

## Scope

This project generates schemas by extracting facts from the shipped Claude Code
binary and official documentation. Security-relevant areas include:

- **Binary extraction** — the pipeline downloads and inspects third-party
  release artifacts. Extraction runs under hard safety constraints; see
  [`docs/extraction-notes.md`](docs/extraction-notes.md). Report anything that
  could execute untrusted code or exfiltrate data during a run.
- **Config corpus handling** — real-world `settings.json` files used by the
  validation gate must be privacy-scrubbed (no tokens, paths, or PII). Report
  any leak of unscrubbed config.
- **Supply chain** — issues in generated schemas that could mislead downstream
  consumers into unsafe configuration.

## Not in scope

- Vulnerabilities in Claude Code itself — report those to Anthropic.
- Issues in third-party dependencies — report upstream (mention them here if
  they affect this project directly).
