# YOLO26n Class Detector (React Native / Android)

A small React Native app that runs a **YOLO26n ONNX** model fully on-device
(no server, no internet needed at runtime) and tells you whether it
recognizes the trained class in a photo you take or pick.

It was scaffolded with the real React Native CLI (`@react-native-community/cli`,
RN 0.86.2) and type-checks cleanly against the actual installed
`onnxruntime-react-native`, `react-native-image-picker`, and `react-native-fs`
type definitions — I could not run an actual Android/Gradle build in the
sandbox this was built in (no Android SDK / Google Maven access there), so
**you'll need to do the first real build yourself** using the steps below.
Everything else (JS/TS logic, dependency resolution, lint, typecheck) has
already been verified.

## What it does

1. You tap **Take Photo** or **Choose Photo**.
2. The photo is letterbox-resized to your model's input size (640×640 by
   default) and converted to a normalized CHW tensor — the same
   preprocessing Ultralytics uses.
3. `onnxruntime-react-native` runs the model on-device (CPU).
4. The output is parsed and you get **"✅ recognized"** or **"❌ not
   recognized"**, plus a confidence score and a bounding box drawn on the
   photo.

It defaults to parsing YOLO26's **end-to-end (NMS-free)** export format —
output shape `(1, 300, 6)` = `[x1, y1, x2, y2, confidence, class_id]`. If you
exported with `end2end=False` instead, flip one flag in the config (see
below) and it'll run NMS itself on the raw `(1, 4+nc, 8400)` output.

## Project layout

```
App.tsx                 - UI: pick/take photo, show result + box overlay
src/config.ts            - EDIT THIS: input size, class names, thresholds
src/ml/session.ts         - loads the bundled model into onnxruntime
src/ml/preprocess.ts      - JPEG decode + letterbox resize -> tensor
src/ml/postprocess.ts     - parses model output into detections
android/app/src/main/assets/  - put your model.onnx here
```

## 1. Get your model.onnx

```python
from ultralytics import YOLO
model = YOLO("yolo26n.pt")          # or your custom-trained .pt
model.export(format="onnx", imgsz=640)
```

Copy the resulting `.onnx` file to:

```
android/app/src/main/assets/model.onnx
```

(delete the `PUT_MODEL_HERE.txt` placeholder in that folder once you've
added it)

Open the model at [netron.app](https://netron.app) and confirm:
- the input node's name and size (default assumed: `images`, 640×640)
- the output node's name (default assumed: `output0`)

Then edit **`src/config.ts`**:

```ts
export const CONFIG = {
  MODEL_ASSET_NAME: 'model.onnx',
  INPUT_SIZE: 640,          // must match imgsz used at export
  INPUT_NAME: 'images',
  OUTPUT_NAME: 'output0',
  END_TO_END: true,         // false if you exported with end2end=False
  CLASS_NAMES: ['object'],  // your class list, same order as training
  CONFIDENCE_THRESHOLD: 0.5,
  IOU_THRESHOLD: 0.45,      // only used when END_TO_END is false
};
```

## 2. Prerequisites (on your machine, not this sandbox)

- Node.js 22+
- A JDK (17 is the safe choice for current Android Gradle Plugin versions)
- Android Studio, with an SDK platform + build-tools installed (Android
  Studio's SDK Manager will prompt you on first open), **or** just the
  command-line tools if you don't want the IDE
- An Android device with USB debugging on, or an emulator, for testing

Full environment setup (if you've never built a bare RN app before):
https://reactnative.dev/docs/set-up-your-environment (choose Android, and
skip the iOS-only steps since this project doesn't include an `ios/` folder)

## 3. Install & run in debug mode (fastest way to test)

```bash
npm install
npx react-native run-android
```

This builds a debug APK, installs it on your connected device/emulator, and
starts Metro. Debug builds are unsigned/unoptimized but are the quickest way
to confirm everything works end-to-end before building a release APK.

## 4. Build a release APK

```bash
cd android
./gradlew assembleRelease
```

The APK will be at:

```
android/app/build/outputs/apk/release/app-release.apk
```

By default this is signed with the **debug keystore** that ships with the
template (`android/app/debug.keystore`) — installable and fully functional
on any device, just not suitable for the Play Store. For your own signing
key, see the official guide:
https://reactnative.dev/docs/signed-apk-android

## Troubleshooting

**`SDK location not found`** — Gradle can't find your Android SDK. Either
create `android/local.properties` with `sdk.dir=/path/to/your/Android/Sdk`,
or set the `ANDROID_HOME` environment variable. (Standard location on Linux
is `~/Android/Sdk`, on macOS `~/Library/Android/sdk`.)

**`Could not get unknown property 'VersionNumber'`** from
`onnxruntime-react-native`'s build.gradle — this project already ships a fix
for it. Gradle 9 removed the `org.gradle.util.VersionNumber` class that
version's build script relies on; `patches/onnxruntime-react-native+*.patch`
rewrites that one check to plain Groovy so it doesn't need that class. It's
applied automatically by `npm install` (via the `postinstall` script running
`patch-package`) — if you still hit this error, run `npx patch-package`
manually, or confirm the patch actually applied by checking for the word
"patched" in `node_modules/onnxruntime-react-native/android/build.gradle`
around line 250.

**Other `unknown property` / `unknown method` errors from some other
package's `build.gradle`** — same root cause as above: a native module's
Android build script was written against an older Gradle API that's since
been removed (Gradle 9/10 removed several APIs that were still commonly used
as of 2024). The general fix is the same pattern used here: find the
offending line in that package's `node_modules/<package>/android/build.gradle`,
rewrite it without the removed API, then run `npx patch-package <package>`
to save it as a patch that reapplies automatically on every `npm install`.
If you'd rather not patch a specific library, downgrading the project's
Gradle version in `android/gradle/wrapper/gradle-wrapper.properties` to a
Gradle 8.x release is the blunter alternative (check that it stays
compatible with the Android Gradle Plugin version this template pulls in).

I originally used the older `react-native-fs` package for copying the
bundled model out of Android's asset folder, but swapped it for the actively
maintained fork `@dr.pogodin/react-native-fs` — the original hasn't been
meaningfully updated in years and Expo's own docs flag it as a library to
avoid on the New Architecture, which this RN 0.86 template uses by default
(the New Architecture can no longer be disabled as of RN 0.82+). The fork is
a drop-in replacement API-wise; `src/ml/session.ts` already imports from it.

## Notes & limitations

- **JPEG only.** `preprocessJpegBase64` checks for JPEG magic bytes and
  throws a clear error otherwise. Camera photos and most gallery photos are
  JPEG; if you need PNG support, add a decoder call (e.g. `pngjs`) next to
  the JPEG one in `src/ml/preprocess.ts`.
- **Still photos, not live camera feed.** This keeps the dependency list
  small (no `react-native-vision-camera` + frame processors + worklets) so
  the Gradle build has fewer moving parts to go wrong on a first build. If
  you want continuous/live detection later, that's the natural next step.
- **Single input tensor, single output tensor.** If your export has extra
  outputs (segmentation masks, keypoints, etc.) you'll need to extend
  `src/ml/postprocess.ts` — it currently only reads `OUTPUT_NAME`.
- Android only — the `ios/` folder was intentionally removed since you asked
  for an APK; run `npx react-native init` fresh (or re-add the platform) if
  you also want an iOS build later.
