# Groundstate release checklist

Use this checklist before labeling a build stable or publishing a release.

## Product behavior

- [ ] The application starts from a clean checkout using the documented command or launcher.
- [ ] The primary create, edit, save, reopen, import, and export flows work.
- [ ] User-owned data remains outside tracked source files and survives application updates.
- [ ] Offline behavior is documented; network failures produce a useful message.
- [ ] Optional Groundstate integration can be disabled and is never required for standalone use.

## Safety and recovery

- [ ] Invalid or malformed input is rejected without corrupting stored data.
- [ ] Database or file migrations preserve existing user records.
- [ ] Backups and recovery instructions have been tested.
- [ ] Secrets, tokens, personal inventories, health records, payroll records, and credentials are ignored by Git.
- [ ] Security-sensitive changes have regression tests.

## Packaging and usability

- [ ] First-run requirements are explained in plain language.
- [ ] Windows and Linux launch paths are tested where the product supports them.
- [ ] The packaged build is tested, not only the source tree.
- [ ] Demo data is visibly labeled and removable.
- [ ] Version, status, keyboard access, scrolling, empty states, and error messages have been checked.

## Repository readiness

- [ ] Automated validation passes.
- [ ] README installation and usage instructions match the current build.
- [ ] Product status is labeled prototype, beta, or stable.
- [ ] Release notes describe user-visible changes and known limitations.
- [ ] No generated caches, local databases, credentials, or user data are included.
