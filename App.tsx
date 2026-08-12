/**
 * 30 FPS native camera preview with fast, throttled on-device YOLO inference.
 *
 * Android preview snapshots are used instead of full-resolution photo capture.
 * Debug mode can target 3 or 6 analyzed frames per second, defaulting to 3.
 * Inference is guarded so calls never overlap; the debug HUD exposes dropped
 * ticks and real latency.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Modal,
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Camera,
  type CameraRef,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { Tensor } from 'onnxruntime-react-native';

import { CONFIG } from './src/config';
import { getSession } from './src/ml/session';
import { preprocessRawPixelData } from './src/ml/preprocess';
import { parseModelOutput, type Detection } from './src/ml/postprocess';

type ModelState = 'loading' | 'ready' | 'error';
type AnalysisFps = 3 | 6;
type AppScreen = 'menu' | 'camera' | 'map';
type PipelineStage =
  | 'idle'
  | 'snapshot'
  | 'resize'
  | 'raw'
  | 'preprocess'
  | 'inference'
  | 'postprocess'
  | 'done'
  | 'error';

type Size = { width: number; height: number };

type MapWaypoint = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  url: string;
};

type ProjectedPoint = { x: number; y: number };

type DebugStats = {
  attempted: number;
  analyzed: number;
  skipped: number;
  errors: number;
  actualFps: number;
  snapshotMs: number;
  resizeMs: number;
  rawMs: number;
  pixelFormat: string;
  preprocessMs: number;
  inferenceMs: number;
  prepInferMs: number;
  postprocessMs: number;
  totalMs: number;
  frameWidth: number;
  frameHeight: number;
};

const PREVIEW_FPS = 30;
const DEFAULT_ANALYSIS_FPS: AnalysisFps = 3;
const TOP_INSET = StatusBar.currentHeight ?? 0;
const PREVIEW_ASPECT_RATIO = 3 / 4;
const PREVIEW_MARGIN = 12;
const CONTROLS_RESERVED_HEIGHT = 80;
const INFO_TEXT =
  'Sviluppato da Filippo Nisi, con modello YOLO26n di Ultralytics e contenuti di Pino Zaccaria e Giuseppe Nisi';

const MAP_CENTER = {
  latitude: 37.325634592258346,
  longitude: 14.442785873423631,
};
const MAP_TILE_SIZE = 256;
const MAP_MIN_ZOOM = 13;
const MAP_MAX_ZOOM = 18;
const MAP_DEFAULT_ZOOM = 15;
const MAP_TILE_USER_AGENT = 'MiraApp/1.0 (+https://www.miraapp.it)';

const MAP_WAYPOINTS: MapWaypoint[] = [
  {
    id: 'chiesa-matrice',
    title: 'Chiesa Matrice',
    latitude: 37.32416257403393,
    longitude: 14.446193933205047,
    url: 'https://www.miraapp.it/chiesa-matrice',
  },
  {
    id: 'palazzo-biscari',
    title: 'Palazzo Biscari',
    latitude: 37.32487925961751,
    longitude: 14.448191927721844,
    url: 'https://www.miraapp.it/palazzo-biscari',
  },
  {
    id: 'chiesa-sacro-cuore',
    title: 'Chiesa Sacro Cuore',
    latitude: 37.32596114782867,
    longitude: 14.448269337066405,
    url: 'https://www.miraapp.it/chiesa-sacro-cuore',
  },
];

const INITIAL_STATS: DebugStats = {
  attempted: 0,
  analyzed: 0,
  skipped: 0,
  errors: 0,
  actualFps: 0,
  snapshotMs: 0,
  resizeMs: 0,
  rawMs: 0,
  pixelFormat: '—',
  preprocessMs: 0,
  inferenceMs: 0,
  prepInferMs: 0,
  postprocessMs: 0,
  totalMs: 0,
  frameWidth: 0,
  frameHeight: 0,
};

const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  idle: 'IN ATTESA',
  snapshot: 'ACQUISIZIONE',
  resize: 'RIDIMENSIONAMENTO',
  raw: 'PIXEL GREZZI',
  preprocess: 'PREPARAZIONE',
  inference: 'INFERENZA',
  postprocess: 'POST-ELABORAZIONE',
  done: 'COMPLETATO',
  error: 'ERRORE',
};

const elapsed = (startedAt: number) => Math.round(performance.now() - startedAt);

function projectMapCoordinate(
  latitude: number,
  longitude: number,
  zoom: number,
): ProjectedPoint {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  const worldSize = MAP_TILE_SIZE * 2 ** zoom;
  const x = ((longitude + 180) / 360) * worldSize;
  const y =
    ((1 -
      Math.log(
        Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians),
      ) /
        Math.PI) /
      2) *
    worldSize;

  return { x, y };
}

type TiledMapProps = {
  zoom: number;
  waypoints: MapWaypoint[];
};

function TiledMap({ zoom, waypoints }: TiledMapProps) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [panOffset, setPanOffset] = useState<ProjectedPoint>({ x: 0, y: 0 });
  const panOffsetRef = useRef<ProjectedPoint>({ x: 0, y: 0 });
  const dragOrigin = useRef<ProjectedPoint>({ x: 0, y: 0 });
  const center = projectMapCoordinate(
    MAP_CENTER.latitude,
    MAP_CENTER.longitude,
    zoom,
  );
  const effectiveCenter = {
    x: center.x - panOffset.x,
    y: center.y - panOffset.y,
  };
  const tileCount = 2 ** zoom;
  const tiles: React.ReactNode[] = [];

  useEffect(() => {
    const resetOffset = { x: 0, y: 0 };
    panOffsetRef.current = resetOffset;
    setPanOffset(resetOffset);
  }, [zoom]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragOrigin.current = panOffsetRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        setPanOffset({
          x: dragOrigin.current.x + gesture.dx,
          y: dragOrigin.current.y + gesture.dy,
        });
      },
      onPanResponderRelease: (_event, gesture) => {
        const nextOffset = {
          x: dragOrigin.current.x + gesture.dx,
          y: dragOrigin.current.y + gesture.dy,
        };
        panOffsetRef.current = nextOffset;
        setPanOffset(nextOffset);
      },
      onPanResponderTerminate: (_event, gesture) => {
        const nextOffset = {
          x: dragOrigin.current.x + gesture.dx,
          y: dragOrigin.current.y + gesture.dy,
        };
        panOffsetRef.current = nextOffset;
        setPanOffset(nextOffset);
      },
    }),
  ).current;

  if (size.width > 0 && size.height > 0) {
    const minTileX = Math.floor(
      (effectiveCenter.x - size.width / 2) / MAP_TILE_SIZE,
    );
    const maxTileX = Math.floor(
      (effectiveCenter.x + size.width / 2) / MAP_TILE_SIZE,
    );
    const minTileY = Math.floor(
      (effectiveCenter.y - size.height / 2) / MAP_TILE_SIZE,
    );
    const maxTileY = Math.floor(
      (effectiveCenter.y + size.height / 2) / MAP_TILE_SIZE,
    );

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
      for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
        if (tileY < 0 || tileY >= tileCount) continue;
        const left =
          tileX * MAP_TILE_SIZE - effectiveCenter.x + size.width / 2;
        const top =
          tileY * MAP_TILE_SIZE - effectiveCenter.y + size.height / 2;

        tiles.push(
          <Image
            key={`${zoom}-${tileX}-${tileY}`}
            source={{
              uri: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
              headers: { 'User-Agent': MAP_TILE_USER_AGENT },
              cache: 'force-cache',
            }}
            style={[
              styles.mapTile,
              { left, top, width: MAP_TILE_SIZE, height: MAP_TILE_SIZE },
            ]}
          />,
        );
      }
    }
  }

  return (
    <View
      style={styles.mapViewport}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}
      {...panResponder.panHandlers}>
      {tiles}

      {size.width > 0 &&
        size.height > 0 &&
        waypoints.map((waypoint, index) => {
          const point = projectMapCoordinate(
            waypoint.latitude,
            waypoint.longitude,
            zoom,
          );
          const left = point.x - effectiveCenter.x + size.width / 2;
          const top = point.y - effectiveCenter.y + size.height / 2;

          return (
            <TouchableOpacity
              key={waypoint.id}
              activeOpacity={0.82}
              accessibilityRole="link"
              accessibilityLabel={`Apri ${waypoint.title}`}
              style={[styles.mapMarkerWrap, { left, top }]}
              onPress={() => {
                Linking.openURL(waypoint.url).catch(error =>
                  console.error(`Impossibile aprire ${waypoint.title}`, error),
                );
              }}>
              <View style={styles.mapMarker}>
                <Text style={styles.mapMarkerNumber}>{index + 1}</Text>
              </View>
              <View style={styles.mapMarkerLabel}>
                <Text numberOfLines={1} style={styles.mapMarkerLabelText}>
                  {waypoint.title}
                </Text>
                <Text style={styles.mapMarkerOpenText}>Apri ›</Text>
              </View>
            </TouchableOpacity>
          );
        })}

      <View pointerEvents="none" style={styles.mapCenterCrosshair}>
        <View style={styles.mapCenterCrosshairHorizontal} />
        <View style={styles.mapCenterCrosshairVertical} />
      </View>

      <Text style={styles.mapAttribution}>© collaboratori di OpenStreetMap</Text>
    </View>
  );
}

function ScanMenuIcon() {
  return (
    <View style={styles.scanIcon}>
      <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
      <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
      <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
      <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
      <View style={[styles.scanDot, { left: 13, top: 13 }]} />
      <View style={[styles.scanDot, { right: 13, top: 13 }]} />
      <View style={[styles.scanDot, { left: 13, bottom: 13 }]} />
      <View style={[styles.scanDotSmall, { right: 11, bottom: 10 }]} />
      <View style={[styles.scanDotSmall, { right: 17, bottom: 16 }]} />
    </View>
  );
}

function MapMenuIcon() {
  return (
    <View style={styles.mapMenuIcon}>
      <View style={[styles.mapFold, styles.mapFoldLeft]} />
      <View style={[styles.mapFold, styles.mapFoldMiddle]} />
      <View style={[styles.mapFold, styles.mapFoldRight]} />
    </View>
  );
}

type InfoModalProps = {
  visible: boolean;
  onClose: () => void;
};

function InfoModal({ visible, onClose }: InfoModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={styles.infoPopup}>
          <Text style={styles.infoPopupTitle}>Info</Text>
          <Text style={styles.infoPopupText}>{INFO_TEXT}</Text>
          <TouchableOpacity style={styles.infoCloseButton} onPress={onClose}>
            <Text style={styles.infoCloseButtonText}>Chiudi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function App() {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [modelState, setModelState] = useState<ModelState>('loading');
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>('menu');
  const [infoVisible, setInfoVisible] = useState(false);
  const [mapZoom, setMapZoom] = useState(MAP_DEFAULT_ZOOM);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === 'active',
  );
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<Date | null>(null);
  const [analysisTargetFps, setAnalysisTargetFps] =
    useState<AnalysisFps>(DEFAULT_ANALYSIS_FPS);
  const [debugVisible, setDebugVisible] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('idle');
  const [debugStats, setDebugStats] = useState<DebugStats>(INITIAL_STATS);
  const [previewSize, setPreviewSize] = useState<Size>({ width: 0, height: 0 });
  const [sourceFrameSize, setSourceFrameSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const [capturePulse, setCapturePulse] = useState(0);

  const cameraRef = useRef<CameraRef>(null);
  const inferenceInFlight = useRef(false);
  const cameraReady = useRef(false);
  const completionTimes = useRef<number[]>([]);
  const openedLinkKey = useRef<string | null>(null);

  // Keep the preview at a portrait 3:4 ratio and fit it inside the available
  // screen space, leaving room around it and for the controls below.
  const maxPreviewWidth = Math.max(1, windowWidth - PREVIEW_MARGIN * 2);
  const maxPreviewHeight = Math.max(
    1,
    windowHeight - TOP_INSET - CONTROLS_RESERVED_HEIGHT - PREVIEW_MARGIN * 2,
  );
  const previewWidth = Math.min(
    maxPreviewWidth,
    maxPreviewHeight * PREVIEW_ASPECT_RATIO,
  );
  const previewHeight = previewWidth / PREVIEW_ASPECT_RATIO;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      setAppIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    getSession()
      .then(() => setModelState('ready'))
      .catch(error => {
        console.error('Caricamento del modello non riuscito', error);
        setModelLoadError(String(error?.message ?? error));
        setModelState('error');
      });
  }, []);

  const setStage = useCallback(
    (stage: PipelineStage) => {
      if (debugVisible) setPipelineStage(stage);
    },
    [debugVisible],
  );

  const openMainUi = useCallback(() => {
    setScreen('camera');
    if (!hasPermission) {
      requestPermission().catch(error => {
        console.error('Richiesta di autorizzazione della fotocamera non riuscita', error);
      });
    }
  }, [hasPermission, requestPermission]);

  const analyzeOneFrame = useCallback(async () => {
    if (
      !cameraReady.current ||
      screen !== 'camera' ||
      !isStreaming ||
      !appIsActive ||
      modelState !== 'ready'
    ) {
      return;
    }

    if (inferenceInFlight.current) {
      setDebugStats(previous => ({
        ...previous,
        attempted: previous.attempted + 1,
        skipped: previous.skipped + 1,
      }));
      return;
    }

    const camera = cameraRef.current;
    if (camera == null) return;

    inferenceInFlight.current = true;
    setIsAnalyzing(true);
    setRuntimeError(null);
    setDebugStats(previous => ({
      ...previous,
      attempted: previous.attempted + 1,
    }));

    const totalStartedAt = performance.now();

    try {
      setStage('snapshot');
      const snapshotStartedAt = performance.now();
      const snapshot = await camera.takeSnapshot();
      const snapshotMs = elapsed(snapshotStartedAt);
      const snapshotWidth = snapshot.width;
      const snapshotHeight = snapshot.height;

      // Shrink the preview snapshot natively before copying raw pixels into
      // JavaScript. This removes most of the pixel work on high-resolution
      // phone screens without introducing an encoded image format.
      setStage('resize');
      const resizeStartedAt = performance.now();
      const resizeScale = Math.min(
        1,
        CONFIG.INPUT_SIZE / Math.max(snapshotWidth, snapshotHeight),
      );
      const frameWidth = Math.max(1, Math.round(snapshotWidth * resizeScale));
      const frameHeight = Math.max(1, Math.round(snapshotHeight * resizeScale));
      const modelImage =
        resizeScale < 1
          ? await snapshot.resizeAsync(frameWidth, frameHeight)
          : snapshot;
      const resizeMs = elapsed(resizeStartedAt);

      // Nitro Image exposes the snapshot as packed native pixels. Read those
      // directly instead of encoding to JPEG/PNG and decoding again in JS.
      // allowGpu=false guarantees a normal CPU ArrayBuffer on Android.
      setStage('raw');
      const rawStartedAt = performance.now();
      const rawPixels = await modelImage.toRawPixelDataAsync(false);
      const rawMs = elapsed(rawStartedAt);

      setStage('preprocess');
      const preprocessStartedAt = performance.now();
      const { tensorData, dims, letterbox } = preprocessRawPixelData(
        rawPixels,
        CONFIG.INPUT_SIZE,
      );
      const preprocessMs = elapsed(preprocessStartedAt);

      setStage('inference');
      const inferenceStartedAt = performance.now();
      const session = await getSession();
      const inputTensor = new Tensor('float32', tensorData, dims);
      const results = await session.run({ [CONFIG.INPUT_NAME]: inputTensor });
      const inferenceMs = elapsed(inferenceStartedAt);
      const prepInferMs = preprocessMs + inferenceMs;
      const output = results[CONFIG.OUTPUT_NAME];

      if (!output) {
        throw new Error(
          `Output "${CONFIG.OUTPUT_NAME}" not found. Available outputs: ${Object.keys(
            results,
          ).join(', ')}`,
        );
      }

      setStage('postprocess');
      const postprocessStartedAt = performance.now();
      const found = parseModelOutput(
        output.data as Float32Array,
        output.dims,
        letterbox,
      );
      const postprocessMs = elapsed(postprocessStartedAt);
      const totalMs = elapsed(totalStartedAt);
      const completedAt = Date.now();

      completionTimes.current = completionTimes.current
        .filter(timestamp => timestamp >= completedAt - 3000)
        .concat(completedAt);
      const times = completionTimes.current;
      const actualFps =
        times.length > 1
          ? ((times.length - 1) * 1000) / (times[times.length - 1] - times[0])
          : 0;

      setDetections(found);
      setSourceFrameSize({ width: rawPixels.width, height: rawPixels.height });
      setLastAnalyzedAt(new Date(completedAt));

      const linkCandidate = found.find(detection => {
        const configuredLink = CONFIG.CLASS_LINKS[detection.className];
        return (
          detection.score > CONFIG.LINK_OPEN_CONFIDENCE_THRESHOLD &&
          Boolean(configuredLink)
        );
      });

      if (linkCandidate) {
        const link = CONFIG.CLASS_LINKS[linkCandidate.className];
        const linkKey = `${linkCandidate.className}:${link}`;

        // Open only once while this configured class remains recognized. The
        // trigger is armed again after it drops below the threshold/disappears.
        if (openedLinkKey.current !== linkKey) {
          openedLinkKey.current = linkKey;
          try {
            await Linking.openURL(link);
          } catch (linkError: any) {
            const linkMessage = `Impossibile aprire il link per ${
              linkCandidate.className
            }: ${String(linkError?.message ?? linkError)}`;
            console.error(linkMessage, linkError);
            setRuntimeError(linkMessage);
          }
        }
      } else {
        openedLinkKey.current = null;
      }

      setCapturePulse(value => value + 1);
      setDebugStats(previous => ({
        ...previous,
        analyzed: previous.analyzed + 1,
        actualFps,
        snapshotMs,
        resizeMs,
        rawMs,
        pixelFormat: rawPixels.pixelFormat,
        preprocessMs,
        inferenceMs,
        prepInferMs,
        postprocessMs,
        totalMs,
        frameWidth: rawPixels.width,
        frameHeight: rawPixels.height,
      }));
      setStage('done');
    } catch (error: any) {
      console.error('Rilevamento in tempo reale non riuscito', error);
      setRuntimeError(String(error?.message ?? error));
      setDebugStats(previous => ({
        ...previous,
        errors: previous.errors + 1,
        totalMs: elapsed(totalStartedAt),
      }));
      setStage('error');
    } finally {
      inferenceInFlight.current = false;
      setIsAnalyzing(false);
    }
  }, [appIsActive, isStreaming, modelState, screen, setStage]);

  useEffect(() => {
    if (
      screen !== 'camera' ||
      !isStreaming ||
      !appIsActive ||
      modelState !== 'ready'
    ) {
      return;
    }

    void analyzeOneFrame();
    const timer = setInterval(() => {
      void analyzeOneFrame();
    }, 1000 / analysisTargetFps);

    return () => clearInterval(timer);
  }, [
    analyzeOneFrame,
    analysisTargetFps,
    appIsActive,
    isStreaming,
    modelState,
    screen,
  ]);

  const best = detections?.[0] ?? null;
  const cameraActive =
    screen === 'camera' && isStreaming && appIsActive && hasPermission;
  const stageLabel = isAnalyzing
    ? PIPELINE_STAGE_LABELS[pipelineStage]
    : PIPELINE_STAGE_LABELS.idle;
  // VisionCamera fills the view using a center-crop/cover transform. Apply
  // the same transform to model coordinates so debug boxes line up with the
  // visible preview instead of being stretched independently on each axis.
  const boxScale =
    sourceFrameSize.width > 0 && sourceFrameSize.height > 0
      ? Math.max(
          previewSize.width / sourceFrameSize.width,
          previewSize.height / sourceFrameSize.height,
        )
      : 0;
  const boxOffsetX =
    (previewSize.width - sourceFrameSize.width * boxScale) / 2;
  const boxOffsetY =
    (previewSize.height - sourceFrameSize.height * boxScale) / 2;

  const infoControls = (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Informazioni sull'app"
        style={styles.infoButton}
        onPress={() => setInfoVisible(true)}>
        <Text style={styles.infoButtonText}>Info</Text>
      </TouchableOpacity>
      <InfoModal visible={infoVisible} onClose={() => setInfoVisible(false)} />
    </>
  );

  const cameraBackControl = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Torna al menu principale"
      style={styles.cameraBackButton}
      onPress={() => setScreen('menu')}>
      <Text style={styles.cameraBackText}>‹</Text>
    </TouchableOpacity>
  );

  const resetDebugInfo = useCallback(() => {
    completionTimes.current = [];
    setDebugStats(INITIAL_STATS);
    setLastAnalyzedAt(null);
    setRuntimeError(null);
    setPipelineStage('idle');
  }, []);

  if (screen === 'menu') {
    return (
      <View style={styles.menuPage}>
        <StatusBar
          translucent
          barStyle="dark-content"
          backgroundColor="transparent"
        />

        <View style={styles.menuHero}>
          <Image
            source={require('./src/assets/chiesa-banner.jpg')}
            resizeMode="contain"
            style={styles.menuHeroImage}
          />
          <View style={styles.menuHeroTitleBackdrop}>
            <Text style={styles.menuHeroTitle}>MiraApp</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Informazioni sull'app"
            style={styles.menuInfoButton}
            onPress={() => setInfoVisible(true)}>
            <Text style={styles.menuInfoText}>i</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuActions}>
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.menuActionCard}
            onPress={openMainUi}>
            <ScanMenuIcon />
            <Text style={styles.menuActionText}>Scansiona il monumento</Text>
            <Text style={styles.menuChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.menuActionCard}
            onPress={() => setScreen('map')}>
            <MapMenuIcon />
            <Text style={styles.menuActionText}>Vedi la mappa</Text>
            <Text style={styles.menuChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuPatronage}>
          <Text style={styles.menuPatronageText}>
            Con il patrocinio di Mirabella Imbaccari
          </Text>
          <Image
            source={require('./src/assets/mirabella-imbaccari-stemma.png')}
            resizeMode="contain"
            style={styles.menuPatronageLogo}
          />
        </View>

        <InfoModal visible={infoVisible} onClose={() => setInfoVisible(false)} />
      </View>
    );
  }

  if (screen === 'map') {
    return (
      <View style={styles.mapPage}>
        <StatusBar barStyle="dark-content" backgroundColor="#f7f2e8" />
        <View style={styles.mapHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Torna al menu"
            style={styles.mapBackButton}
            onPress={() => setScreen('menu')}>
            <Text style={styles.mapBackText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.mapTitle}>Mappa</Text>
          <View style={styles.mapHeaderSpacer} />
        </View>

        <View style={styles.mapBody}>
          <View style={styles.mapCanvas}>
            <TiledMap zoom={mapZoom} waypoints={MAP_WAYPOINTS} />
            <View style={styles.mapZoomControls}>
              <TouchableOpacity
                style={styles.mapZoomButton}
                onPress={() =>
                  setMapZoom(value => Math.min(MAP_MAX_ZOOM, value + 1))
                }>
                <Text style={styles.mapZoomText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mapZoomButton}
                onPress={() =>
                  setMapZoom(value => Math.max(MAP_MIN_ZOOM, value - 1))
                }>
                <Text style={styles.mapZoomText}>−</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mapPlacesPanel}>
            {MAP_WAYPOINTS.map((waypoint, index) => (
              <TouchableOpacity
                key={waypoint.id}
                activeOpacity={0.84}
                accessibilityRole="link"
                accessibilityLabel={`Apri ${waypoint.title}`}
                style={styles.mapPlaceButton}
                onPress={() => {
                  Linking.openURL(waypoint.url).catch(error =>
                    console.error(`Impossibile aprire ${waypoint.title}`, error),
                  );
                }}>
                <View style={styles.mapPlaceNumber}>
                  <Text style={styles.mapPlaceNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.mapPlaceButtonText}>{waypoint.title}</Text>
                <Text style={styles.mapPlaceChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.centeredPage, { paddingTop: TOP_INSET + 24 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        {cameraBackControl}
        {infoControls}
        <Text style={styles.title}>MiraApp AI</Text>
        <Text style={styles.message}>
          È necessario autorizzare l’accesso alla fotocamera per l’anteprima in
          tempo reale e l’analisi dei fotogrammi.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Autorizza la fotocamera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={[styles.centeredPage, { paddingTop: TOP_INSET + 24 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        {cameraBackControl}
        {infoControls}
        <ActivityIndicator />
        <Text style={styles.message}>Ricerca della fotocamera posteriore…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: TOP_INSET + PREVIEW_MARGIN }]}>
      <StatusBar
        translucent
        barStyle="light-content"
        backgroundColor="transparent"
      />
      {cameraBackControl}
      {infoControls}

      <View style={styles.cameraStage}>
        <View
          style={[
            styles.cameraContainer,
            { width: previewWidth, height: previewHeight },
          ]}
          onLayout={event => {
            const { width, height } = event.nativeEvent.layout;
            setPreviewSize({ width, height });
          }}>
          <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={cameraActive}
          constraints={[{ fps: PREVIEW_FPS }]}
          onStarted={() => {
            cameraReady.current = true;
            setPipelineStage('idle');
          }}
          onStopped={() => {
            cameraReady.current = false;
            setPipelineStage('idle');
          }}
          onError={error => {
            console.error('Errore della fotocamera', error);
            setRuntimeError(error.message);
          }}
        />

        <View pointerEvents="none" style={styles.reticle}>
          <View style={styles.reticleHorizontal} />
          <View style={styles.reticleVertical} />
        </View>

        {detections?.slice(0, 12).map((detection, index) => {
          if (boxScale <= 0) return null;
          const left = detection.box.x1 * boxScale + boxOffsetX;
          const top = detection.box.y1 * boxScale + boxOffsetY;
          const width = Math.max(
            2,
            (detection.box.x2 - detection.box.x1) * boxScale,
          );
          const height = Math.max(
            2,
            (detection.box.y2 - detection.box.y1) * boxScale,
          );

          return (
            <View
              pointerEvents="none"
              key={`${capturePulse}-${index}-${detection.classId}`}
              style={[styles.detectionBox, { left, top, width, height }]}>
              <Text style={styles.detectionLabel}>
                {detection.className} {Math.round(detection.score * 100)}%
              </Text>
            </View>
          );
        })}

        {debugVisible && (
          <View pointerEvents="none" style={styles.topOverlay}>
            <View style={styles.badgeRow}>
              <Text style={styles.feedBadge}>
                OBIETTIVO · {analysisTargetFps} FPS
              </Text>
              <View
                style={[
                  styles.activityDot,
                  isAnalyzing
                    ? styles.activityDotBusy
                    : styles.activityDotIdle,
                ]}
              />
            </View>

            <View style={styles.debugPanel}>
              <View style={styles.debugHeaderRow}>
                <Text style={styles.debugTitle}>DEBUG DELLA PIPELINE</Text>
                <Text
                  style={[
                    styles.stageText,
                    isAnalyzing && styles.stageTextBusy,
                  ]}>
                  {stageLabel}
                </Text>
              </View>
              <Text style={styles.debugText}>
                Effettivi {debugStats.actualFps.toFixed(1)} fps · analizzati{' '}
                {debugStats.analyzed} · saltati {debugStats.skipped} · errori{' '}
                {debugStats.errors}
              </Text>
              <Text style={styles.debugText}>
                scatto {debugStats.snapshotMs} ms · ridim. {debugStats.resizeMs} ms ·
                grezzi {debugStats.rawMs} ms
              </Text>
              <Text style={styles.debugText}>
                prep. {debugStats.preprocessMs} ms
              </Text>
              <Text style={styles.debugText}>
                inferenza {debugStats.inferenceMs} ms · post{' '}
                {debugStats.postprocessMs} ms
              </Text>
              <Text style={styles.debugText}>
                totale {debugStats.totalMs} ms · prep.+inferenza{' '}
                {debugStats.prepInferMs} ms
              </Text>
              <Text style={styles.debugText}>
                fotogramma {debugStats.frameWidth || '—'}×
                {debugStats.frameHeight || '—'} {debugStats.pixelFormat} · ingresso {CONFIG.INPUT_SIZE}×
                {CONFIG.INPUT_SIZE} · rilevamenti {detections?.length ?? 0}
              </Text>
            </View>
          </View>
        )}

        <View pointerEvents="none" style={styles.bottomOverlay}>
          {modelState === 'loading' && (
            <View style={styles.statusRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.statusText}>Caricamento del modello…</Text>
            </View>
          )}

          {modelState === 'error' && (
            <Text style={styles.errorText}>
              Caricamento del modello non riuscito: {modelLoadError}
            </Text>
          )}

          {runtimeError && modelState === 'ready' && (
            <Text style={styles.errorText}>Errore di esecuzione: {runtimeError}</Text>
          )}

          {modelState === 'ready' && (
            <View style={styles.resultCard}>
              <View style={styles.statusRow}>
                {isAnalyzing && <ActivityIndicator color="#fff" />}
                <Text style={styles.resultText}>
                  {detections === null
                    ? 'In attesa del primo fotogramma analizzato…'
                    : best
                      ? `${best.className} · ${Math.round(best.score * 100)}%`
                      : 'Nessun oggetto riconosciuto'}
                </Text>
              </View>
              {debugVisible && (
                <Text style={styles.timestampText}>
                  {lastAnalyzedAt
                    ? `Ultimo risultato: ${lastAnalyzedAt.toLocaleTimeString()} · fotogramma #${debugStats.analyzed}`
                    : `Frequenza obiettivo: ${analysisTargetFps} fotogrammi al secondo`}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
      </View>

      <View style={styles.controls}>
        {debugVisible && (
          <>
            <View style={styles.rateGroup}>
              {([3, 6] as AnalysisFps[]).map(rate => (
                <TouchableOpacity
                  key={rate}
                  style={[
                    styles.rateButton,
                    analysisTargetFps === rate && styles.rateButtonSelected,
                  ]}
                  onPress={() => setAnalysisTargetFps(rate)}>
                  <Text
                    style={[
                      styles.rateButtonText,
                      analysisTargetFps === rate && styles.rateButtonTextSelected,
                    ]}>
                    {rate} FPS
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.resetDebugButton}
              onPress={resetDebugInfo}>
              <Text style={styles.buttonText}>Azzera debug</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.debugButton}
          onPress={() => setDebugVisible(value => !value)}>
          <Text style={styles.buttonText}>
            {debugVisible ? 'Nascondi debug' : 'Mostra debug'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !isStreaming && styles.resumeButton]}
          onPress={() => setIsStreaming(value => !value)}>
          <Text style={styles.buttonText}>
            {isStreaming ? 'Pausa' : 'Riprendi'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuPage: {
    flex: 1,
    backgroundColor: '#f4f0e5',
  },
  menuHero: {
    width: '100%',
    aspectRatio: 680 / 453,
    backgroundColor: '#d8e8ef',
    position: 'relative',
  },
  menuHeroImage: {
    width: '100%',
    height: '100%',
  },
  menuHeroTitleBackdrop: {
    position: 'absolute',
    top: TOP_INSET + 28,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  menuHeroTitle: {
    color: '#111',
    fontFamily: 'serif',
    fontSize: 31,
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  menuInfoButton: {
    position: 'absolute',
    top: TOP_INSET + 32,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#111',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuInfoText: {
    color: '#111',
    fontSize: 27,
    lineHeight: 29,
    fontFamily: 'serif',
    fontWeight: '900',
  },
  menuActions: {
    flex: 1,
    paddingTop: 72,
    paddingHorizontal: 28,
    justifyContent: 'flex-start',
  },
  menuPatronage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 14,
  },
  menuPatronageText: {
    color: '#4e4a42',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  menuPatronageLogo: {
    width: 46,
    height: 54,
  },
  menuActionCard: {
    minHeight: 96,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 25,
    marginBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  menuActionText: {
    flex: 1,
    color: '#171717',
    fontSize: 21,
    fontWeight: '700',
    marginLeft: 24,
  },
  menuChevron: {
    color: '#181818',
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '300',
    marginLeft: 10,
    marginTop: -4,
  },
  scanIcon: {
    width: 48,
    height: 48,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: '#214f78',
  },
  scanCornerTopLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
  },
  scanCornerTopRight: {
    right: 0,
    top: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
  },
  scanCornerBottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
  },
  scanCornerBottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
  scanDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderWidth: 3,
    borderColor: '#214f78',
  },
  scanDotSmall: {
    position: 'absolute',
    width: 5,
    height: 5,
    backgroundColor: '#214f78',
  },
  mapMenuIcon: {
    width: 50,
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFold: {
    width: 15,
    height: 38,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#214f78',
  },
  mapFoldLeft: {
    borderLeftWidth: 4,
    transform: [{ skewY: '-10deg' }],
  },
  mapFoldMiddle: {
    borderLeftWidth: 4,
    transform: [{ skewY: '10deg' }],
  },
  mapFoldRight: {
    borderLeftWidth: 4,
    borderRightWidth: 4,
    transform: [{ skewY: '-10deg' }],
  },
  mapPage: {
    flex: 1,
    backgroundColor: '#f7f2e8',
    paddingTop: TOP_INSET,
  },
  mapHeader: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f2e8',
  },
  mapBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBackText: {
    color: '#172c3f',
    fontSize: 45,
    lineHeight: 46,
    marginTop: -5,
  },
  mapTitle: {
    color: '#171717',
    fontSize: 24,
    fontWeight: '800',
  },
  mapHeaderSpacer: {
    width: 44,
    height: 44,
  },
  mapBody: {
    flex: 1,
    backgroundColor: '#f7f2e8',
  },
  mapCanvas: {
    flex: 1,
    minHeight: 300,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#d9e4e7',
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#d9e4e7',
  },
  mapTile: {
    position: 'absolute',
  },
  mapMarkerWrap: {
    position: 'absolute',
    width: 148,
    marginLeft: -19,
    marginTop: -38,
    alignItems: 'flex-start',
  },
  mapMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#214f78',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  mapMarkerNumber: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  mapMarkerLabel: {
    maxWidth: 148,
    marginTop: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    elevation: 2,
  },
  mapMarkerLabelText: {
    color: '#172c3f',
    fontSize: 10,
    fontWeight: '800',
  },
  mapMarkerOpenText: {
    color: '#214f78',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 1,
  },
  mapCenterCrosshair: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#173a35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCenterCrosshairHorizontal: {
    position: 'absolute',
    width: 26,
    height: 2,
    backgroundColor: '#173a35',
  },
  mapCenterCrosshairVertical: {
    position: 'absolute',
    width: 2,
    height: 26,
    backgroundColor: '#173a35',
  },
  mapAttribution: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontSize: 9,
  },
  mapZoomControls: {
    position: 'absolute',
    right: 14,
    top: 14,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 5,
  },
  mapZoomButton: {
    width: 46,
    height: 46,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d7d7d7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapZoomText: {
    color: '#172c3f',
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '500',
  },
  mapPlacesPanel: {
    backgroundColor: '#f7f2e8',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  mapPlaceButton: {
    minHeight: 48,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  mapPlaceNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#214f78',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  mapPlaceNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  mapPlaceButtonText: {
    flex: 1,
    color: '#172c3f',
    fontSize: 15,
    fontWeight: '800',
  },
  mapPlaceChevron: {
    color: '#172c3f',
    fontSize: 32,
    lineHeight: 34,
    marginLeft: 8,
    marginTop: -2,
  },
  cameraBackButton: {
    position: 'absolute',
    top: TOP_INSET + 12,
    left: 12,
    zIndex: 31,
    elevation: 9,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(20, 47, 43, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBackText: {
    color: '#fff',
    fontSize: 40,
    lineHeight: 41,
    fontWeight: '300',
    marginTop: -4,
  },
  infoButton: {
    position: 'absolute',
    top: TOP_INSET + 12,
    right: 12,
    zIndex: 30,
    elevation: 8,
    backgroundColor: 'rgba(20, 47, 43, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  infoButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  infoPopup: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#fffdf8',
    borderRadius: 16,
    padding: 20,
    elevation: 10,
  },
  infoPopupTitle: {
    color: '#173a35',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 10,
  },
  infoPopupText: {
    color: '#2d3734',
    fontSize: 15,
    lineHeight: 22,
  },
  infoCloseButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#176b5b',
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 18,
  },
  infoCloseButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  page: {
    flex: 1,
    backgroundColor: '#101010',
    alignItems: 'center',
  },
  centeredPage: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  cameraStage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraContainer: {
    backgroundColor: '#000',
    overflow: 'hidden',
    borderRadius: 12,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  message: { textAlign: 'center', color: '#444', marginBottom: 20 },
  topOverlay: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedBadge: {
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    fontSize: 11,
    fontWeight: '700',
  },
  activityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
    marginLeft: 8,
  },
  activityDotBusy: { backgroundColor: '#ffcf33' },
  activityDotIdle: { backgroundColor: '#34d058' },
  debugPanel: {
    marginTop: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(76, 215, 255, 0.8)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  debugHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  debugTitle: {
    color: '#4cd7ff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  stageText: {
    color: '#7dff9b',
    fontSize: 10,
    fontWeight: '900',
  },
  stageTextBusy: { color: '#ffcf33' },
  debugText: {
    color: '#f2f2f2',
    fontSize: 10,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  reticle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 42,
    height: 42,
    marginLeft: -21,
    marginTop: -21,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleHorizontal: {
    position: 'absolute',
    width: 58,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  reticleVertical: {
    position: 'absolute',
    width: 1,
    height: 58,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  detectionBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#39ff88',
    backgroundColor: 'rgba(57, 255, 136, 0.06)',
  },
  detectionLabel: {
    position: 'absolute',
    left: -2,
    top: -22,
    color: '#06140c',
    backgroundColor: '#39ff88',
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '900',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  resultCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { color: '#fff', marginLeft: 8, fontWeight: '600' },
  resultText: { color: '#fff', marginLeft: 8, fontSize: 17, fontWeight: '700' },
  timestampText: { color: '#ddd', marginTop: 5, fontSize: 11 },
  errorText: {
    color: '#fff',
    backgroundColor: 'rgba(176, 0, 32, 0.9)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 7,
  },
  controls: {
    minHeight: 62,
    width: '100%',
    marginTop: 8,
    backgroundColor: '#101010',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rateGroup: {
    flexDirection: 'row',
    backgroundColor: '#282828',
    borderRadius: 8,
    padding: 3,
  },
  rateButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 6,
  },
  rateButtonSelected: { backgroundColor: '#fff' },
  rateButtonText: { color: '#bbb', fontSize: 12, fontWeight: '800' },
  rateButtonTextSelected: { color: '#111' },
  resetDebugButton: {
    backgroundColor: '#5b3a2f',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  debugButton: {
    backgroundColor: '#343434',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  resumeButton: { backgroundColor: '#137333' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

export default App;
