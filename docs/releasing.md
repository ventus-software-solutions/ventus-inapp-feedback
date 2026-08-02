# Releasing Ventus In-App Feedback

The browser integration packages and MCP adapter are published as public npm
packages. The self-hosted API is distributed through the repository and the
versioned `ghcr.io/ventus-software-solutions/feedback-api` image, not npm.

## One-time npm setup

1. Confirm access to the
   [`@ventus-software-solutions` npm organization](https://www.npmjs.com/org/ventus-software-solutions).
2. Add the maintainers who are allowed to publish the packages.
3. Require two-factor authentication for the organization and packages.
4. Bootstrap each package with a controlled prerelease if npm requires the
   package to exist before trusted publishing can be configured.
5. On every package's npm settings page, configure GitHub Actions as its trusted
   publisher:
   - organization: `ventus-software-solutions`
   - repository: `ventus-inapp-feedback`
   - workflow: `publish-npm.yml`
   - environment: `npm`
6. In the GitHub repository, create an `npm` environment and require a
   maintainer's approval before deployment.
7. After trusted publishing works, disallow traditional npm publishing tokens.

The workflow uses OpenID Connect and must not receive a long-lived `NPM_TOKEN`.

## Package set and order

All public packages use one version and are published in dependency order:

1. `@ventus-software-solutions/feedback-contracts`
2. `@ventus-software-solutions/feedback-api-client`
3. `@ventus-software-solutions/feedback-browser`
4. `@ventus-software-solutions/feedback-widget`
5. `@ventus-software-solutions/feedback-react`
6. `@ventus-software-solutions/feedback-mcp`

Internal package dependencies must use the exact release version. The release
script checks this before publishing and safely skips an already-published
package when a partially completed release is retried.

## Beta release

1. Choose a SemVer prerelease version such as `0.1.0-beta.1`.
2. Update all six public package versions and their internal dependency versions.
3. Run `npm ci --ignore-scripts` in a clean checkout, followed by
   `npm run verify`.
4. Commit the version change and create tag `v0.1.0-beta.1` on that commit.
5. Create a GitHub Release for the tag and mark it as a prerelease.
6. Approve the `npm` environment deployment after the workflow's verification
   job passes.
7. Install the published packages using the `beta` tag in the in-repository demo
   and complete the dogfooding acceptance flow.

Prereleases are published under npm's `beta` dist-tag and therefore do not
replace the stable `latest` version.

## Stable release

Use a version without a prerelease suffix, create the matching `vX.Y.Z` tag, and
publish a non-prerelease GitHub Release. The workflow publishes that package set
under npm's `latest` dist-tag.

Never reuse or overwrite an npm version. If a release is defective, fix it and
publish a new version.

## Ventus attribution in release documentation

Keep one natural Ventus attribution link in the repository README and each
published package README. The widget's visible `Made by Ventus` badge is the
runtime attribution for applications that use the default UI.

Do not add the same promotional backlink to every changelog entry, GitHub
Release, migration note, or generated API page. Release documentation should
prioritize the change summary, compatibility notes, upgrade instructions, and
links to the repository or relevant package documentation. Link to
`ventus.works` from a release only when the company, support, or commercial
licensing context is directly relevant.
