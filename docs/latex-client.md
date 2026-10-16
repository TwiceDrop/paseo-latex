# Paseo LaTeX client

Keep the personal client on the `paseo-latex` branch. The `upstream` remote points to
`https://github.com/getpaseo/paseo.git`. Merge upstream releases into this branch so
the chat rendering and personal app identity remain in its history.

The Android app is **Paseo LaTeX**, package **`sh.paseo.latex`**. It installs alongside
the official app. Each app keeps its own settings and host credentials; pair the
personal app with your existing host. Both apps accept official `paseo://` pairing
links, so Android can ask which app should open a link. Scan or paste the pairing
link inside the app you want to use.

This client uses the existing daemon protocol. Keep the official daemon if you
want. Check your actual host version when validating a new upstream release;
[protocol compatibility](protocol-compatibility.md) does not promise every new
feature on an older daemon.

## Android file downloads

Open a file link in chat, then choose **Download** in the file preview toolbar.
The file explorer's long-press menu uses the same download action. Android opens
its system **Save as** dialog after receiving the file; choose a location to finish.
Cancelling that dialog does not mark the file as saved.

Native downloads use the daemon's existing binary file frames on the authenticated
connection, including encrypted relay connections. They do not require an exposed
HTTP port or a daemon upgrade. Keep the streaming destination in the client:
buffering a whole APK through `readFile()` duplicates large byte arrays in memory.
The Android document picker lives in `modules/paseo-file-download`; using
`ACTION_CREATE_DOCUMENT` permits saving to Downloads without broad storage access.

## Collapsed sidebar projects

Press a project heading to move the whole group into **Collapsed projects** above
the sidebar footer. Press its name there to restore it in its previous order.
This reuses the device's existing collapsed-project preference; it sends no
archive, remove, or lifecycle command to the host. Project filters still apply
to the bottom section, so clear them to find a filtered-out project.

## Loading and navigation

The floating header and pane content have separate, non-collapsible native hosts
with explicit stacking. Chat loading overlays stay below the header, so sidebar
and tab controls remain reachable while history catches up. Passive initial
loaders do not claim touches.

Agent lookup only runs in a visible pane with a connection. A failed lookup
remains on its retry view instead of immediately resubmitting. Hiding the pane,
changing the agent/host, or disconnecting invalidates its outstanding callback;
a late response cannot overwrite the newer view. This does not cancel shared
transport requests needed by other consumers or restart the host.

## Personal signing

Set `JAVA_HOME` to your JDK 21 directory. On this Windows machine:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
npm run latex:keygen
```

The command creates a persistent personal key in the sibling directory
`../paseo-latex-signing/`, outside this Git checkout. Back up **both**
`release.keystore` and `credentials.json`. Future APK upgrades require the same
key. Running the command again reuses it. `PASEO_LATEX_SIGNING_DIR` can select
another persistent location.

The personal variant does not use the official Expo account, EAS project or
Firebase configuration. Push notifications need your own Expo project's UUID in
`PASEO_LATEX_EAS_PROJECT_ID` and the Android Firebase file for `sh.paseo.latex` in
`GOOGLE_SERVICES_FILE_LATEX`. Without these, use the official app for push
notifications; host pairing and chat remain available in the personal app.

## Build an APK

Install the [Android toolchain](android.md#prerequisites-local-dev), then run from
the repository root:

```powershell
npm run android:latex
```

For a phone-only ARM64 build:

```powershell
npm run android:latex -- --arch arm64-v8a
```

To test the same APK on an ARM64 phone and an x86_64 emulator, include both ABIs:

```powershell
npm run android:latex -- --arch arm64-v8a,x86_64
```

If Hermes exhausts local memory, add `--low-memory`. This serializes Gradle
workers and uses Hermes `-Og` instead of `-O`; it still builds a signed release
APK, with fewer compiler optimizations:

```powershell
npm run android:latex -- --arch arm64-v8a --low-memory
```

The result is `artifacts/paseo-latex-<upstream-version>-r<revision>.apk`, signed
with the personal key. `--prepare-only` regenerates the Android project and
signing configuration without compiling or installing an APK.

For another build of the same upstream version, increase `--revision`:

```powershell
npm run android:latex -- --arch arm64-v8a --revision 2
```

Revisions range from 1 through 99. A newer upstream version starts at revision 1.
Its Android version code exceeds the previous upstream version's revisions.

## Merge an upstream release

Commit local changes before updating. Select a released tag explicitly:

```powershell
npm run latex:update -- --ref v0.11.4
```

Replace the example tag with the release you want. The command fetches upstream,
merges the selected commit, installs dependencies, regenerates math fonts and
runs client typecheck, lint and targeted unit tests. It stops on a merge conflict
or failed check. Resolve and commit a conflict on `paseo-latex`, then rerun the
same command. Commit any regenerated assets before the next update.

To inspect an already fetched target without merging:

```powershell
npm run latex:update -- --ref upstream/main --dry-run
```

After an update, run the existing browser checks and build a test APK:

```powershell
npm run test:browser --workspace=@getpaseo/app -- src/components/markdown/math/math.browser.test.tsx src/components/markdown/math/text-group.browser.test.ts src/assistant-selection-copy/content.browser.test.ts --bail=1
npm run android:latex -- --arch arm64-v8a
```

Check formula rendering, host pairing and chat on the device before using the
new APK. These commands keep the work local; configure your own Git remote or
release hosting separately if you want to distribute builds.
