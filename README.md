# MiraApp AI





## How the debug HUD works

To enable the debug HUD, press the button in the bottom of the screen.

'TARGET' is the target FPS defined by the buttons in the bottom left corner.
'Actual' is the actual FPS the model is running at



The latency rows show:

- `snap`: copy the current preview frame.
- `resize`: native aspect-preserving downscale.
- `raw`: copy packed CPU pixel data from Nitro Image.
- `prep`: read the reported pixel layout, letterbox, normalize, and convert to
  an NCHW float tensor.
- `infer`: ONNX Runtime model execution.
- `post`: output parsing and NMS when configured.
- `total`: end-to-end time for one analyzed frame.
- `prep+infer`: self explanatory.

## Performance
MiraApp AI runs fairly well in many devices. I'll mainly consider the 'total' and the "prep+infer" metric in the debug UI, as 30 FPS at 640p should be fairly archivable by any phone newer than 2005. all the metrics will be recorded at 6 frames sent to the model. Although 3 frames are plenty enough, this is just a test.

### Samsung A71 (running Android 13, Snapdragon 730)
- Actual FPS: ~2 fps
- `total`: 470ms
- `prep+infer`: 330ms
### Redmi Note 14 Pro (running Android 17, Dimensity 7300 Ultra)
- Actual FPS: ~1.2 fps
- `total`: 750ms
- `prep+infer`: 600ms
### Xiaomi 15T (running Android 17, Dimensity 8400 Ultra)
- Actual FPS: ~3 fps
- `total`: ~310ms
- `prep+infer`:~190ms


i honestly have no clue why the A71, a phone 5 years older than the redmi note 14 pro performs better than it. 


## Install and run

```bash
npm install
npx react-native run-android
```
or, if you want to export the file into an .apk file

```bash
cd android
./gradlew assembleRelease
```

The dependecies are:

- `react-native-vision-camera` 5.1.1
- `react-native-nitro-modules` 0.36.1
- `react-native-nitro-image` 0.15.1
- `onnxruntime-react-native`


## Model & config

The bundled model remains at:

```text
android/app/src/main/assets/model.onnx
```

The main config file is located at `src/config.ts`. 

To open links for recognized classes, edit this section in `src/config.ts`:

```ts
LINK_OPEN_CONFIDENCE_THRESHOLD: 0.7,
CLASS_LINKS: {
  class1: 'https://example.com',
  class2: 'https://example.com/another-page',
},
```

The key must exactly match a name in `CLASS_NAMES`. A link is opened only when
the class confidence is greater than 70% with the default setting.


## Map waypoints

The map starts centered at `37.325634592258346, 14.442785873423631`.
To replace the temporary markers, edit `MAP_WAYPOINTS` near the top of `App.tsx`:

```ts
const MAP_WAYPOINTS: MapWaypoint[] = [
  {
    id: 'example',
    title: 'My waypoint',
    latitude: 37.3256,
    longitude: 14.4428,
  },
];
```

The map uses standard OpenStreetMap tiles, so the device needs an internet connection to load the map background.
