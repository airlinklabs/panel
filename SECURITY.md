# Security Policy

## Supported Versions

Security fixes are applied to actively maintained releases of Airlink Panel.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest stable release | Yes |
| Older releases | No |

Because Airlink Panel is actively developed, users should run the latest available release whenever possible.

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues, pull requests, discussions, or other public channels.**

For a vulnerability that could affect Airlink Panel or its users, use GitHub's **Private Vulnerability Reporting** / repository security advisory mechanism when it is available for this repository.

GitHub supports private vulnerability reporting for public repositories, allowing maintainers and reporters to coordinate on a fix before public disclosure.

Please include as much of the following information as possible:

- Clear description of the vulnerability.
- Affected component, endpoint, module, or feature.
- Affected versions or commit(s), if known.
- Security impact and realistic attack scenario.
- Reproduction steps or a minimal proof of concept.
- Required configuration, permissions, or environment assumptions.
- Suggested mitigation or fix, if known.
- Logs, screenshots, HTTP requests/responses, or other supporting evidence that is safe to share privately.

Do not include real credentials, API keys, access tokens, personal data, production secrets, or data belonging to other users.

## What to Expect

After receiving a report, maintainers will:

1. Confirm receipt when practical.
2. Triage and validate the report.
3. Determine affected versions and severity.
4. Work on a fix and regression tests where appropriate.
5. Coordinate disclosure timing with the reporter when the issue is confirmed.
6. Publish a security advisory when appropriate, including a fixed version or mitigation when available.

Please do not publicly disclose the vulnerability before a fix or coordinated disclosure has been arranged.

## Disclosure

Security issues should be handled through coordinated disclosure.

When a confirmed vulnerability is fixed, the project may publish a GitHub Security Advisory containing the affected versions, fixed versions, severity, impact, and remediation guidance.

For vulnerabilities eligible for a CVE, the project may request or assign a CVE through the appropriate GitHub security advisory process.

## Security Scope

Security reports are especially valuable for issues involving:

- Authentication or authorization bypasses.
- Session or API-key compromise.
- Privilege escalation.
- Cross-user or cross-server data access.
- Remote code execution.
- Arbitrary file access or file write/delete operations.
- Command injection.
- Server/daemon request validation.
- CSRF or request-forgery issues.
- Sensitive information disclosure.
- WebSocket authorization.
- Unsafe handling of backups, databases, credentials, or node secrets.
- Dependency or supply-chain vulnerabilities that materially affect Airlink Panel.

## Out of Scope

The following generally do not qualify as security vulnerabilities by themselves:

- Issues that require already-compromised administrator access.
- Self-XSS that cannot affect another user.
- Reports without a demonstrated security impact.
- Denial-of-service claims requiring unrealistic resource consumption.
- Vulnerabilities in third-party services that are not caused by Airlink Panel.
- General bugs, feature requests, or performance issues without a security impact.

Reports may still be reviewed when the actual security impact is unclear.

## Safe Testing

Only test against systems you own or have explicit permission to assess.

Do not:

- Access, modify, or delete data belonging to other users.
- Exfiltrate production secrets.
- Disrupt production services or nodes.
- Create persistence or backdoors.
- Perform destructive testing against live systems.

Use the minimum proof necessary to demonstrate impact.

## Security Development Practices

Security-sensitive changes should follow the repository's protected-branch workflow:

- Changes to `main` should go through pull requests.
- Security-sensitive changes should include appropriate tests.
- Authentication and authorization changes should receive careful review.
- Secrets and credentials must not be committed to the repository.
- Dependencies should be kept current and security advisories reviewed.
- Security regressions should include a regression test whenever practical.

## Contact

For a vulnerability report, use the repository's **Security / Private Vulnerability Reporting** interface rather than opening a public issue.

GitHub documentation:

- https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy
- https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting
