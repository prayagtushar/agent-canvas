# Releasing

Tagging is the whole process. GitHub builds macOS, Windows and Linux in
parallel and opens a draft release with all of them attached. Check it and
publish by hand.

```sh
bun pm version 0.2.0 --no-git-tag-version
git commit -am "Release 0.2.0"
git tag v0.2.0
git push --follow-tags
```

`package.json` is the only version to bump. `tauri.conf.json` reads it.

Every push already builds the app on all three platforms, so a tag should not be
the first time a Windows build is attempted. Running the Release workflow by
hand from the Actions tab builds the same bundles and leaves them as workflow
artifacts, without cutting a release.

## Turning on in-app updates

The app checks for a newer release on launch, and the ··· menu has a manual
check. Both are inert until the build carries an update key, because an unsigned
update is one anybody who controls the release host could write.

One command, once:

```sh
bun run tauri signer generate -w ~/.tauri/agent-canvas.key
```

Then, in `src-tauri/tauri.conf.json`, set both of these together:

- `plugins.updater.pubkey` to the **public** key it printed
- `bundle.createUpdaterArtifacts` to `true`

and add the **private** key and its password as the repository secrets
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The
release workflow already reads both, and `includeUpdaterJson: true` on the
`tauri-action` step publishes the manifest the app checks against.

They have to move together. With `createUpdaterArtifacts` on and no key, a
release builds both installers and then fails trying to sign them: a red release
with perfectly good bundles inside it. That is why it ships off.

Keep the private key. Losing it means existing installs can never be updated
again, only reinstalled.

Until then the app says plainly that it cannot check, rather than failing at
people with a dialog.

## Code signing

Neither build is signed. Signing macOS needs a paid Apple Developer account and
`APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID` and `APPLE_PASSWORD`
as repository secrets. Windows needs a code-signing certificate and
`WINDOWS_CERTIFICATE`. `tauri-action` picks all of those up from the environment
on its own, so adding them is the only change needed.
