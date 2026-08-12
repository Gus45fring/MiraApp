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
type AppScreen = 'menu' | 'camera';
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
const PREVIEW_ASPECT_RATIO = 9 / 16;
const PREVIEW_MARGIN = 12;
const CONTROLS_RESERVED_HEIGHT = 80;
const INFO_TEXT =
  'Sviluppo da Filippo Nisi, modello YOLO26n da Ultralytics e contenuti da Pino Zaccaria e Giuseppe Nisi';

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

const elapsed = (startedAt: number) => Math.round(performance.now() - startedAt);

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

  // Keep the preview at a portrait 9:16 ratio and fit it inside the available
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
        console.error('Failed to load model', error);
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
        console.error('Camera permission request failed', error);
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
            const linkMessage = `Could not open link for ${
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
      console.error('Live detection failed', error);
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
  const stageLabel = isAnalyzing ? pipelineStage.toUpperCase() : 'IDLE';
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

  if (screen === 'menu') {
    return (
      <View style={styles.menuPage}>
        <StatusBar barStyle="dark-content" backgroundColor="#f7f2e8" />
        {infoControls}

        <View style={styles.menuContent}>
          <Text style={styles.menuTitle}>MiraApp AI</Text>
          <Image
            source={require('./src/assets/miraapp-banner.png')}
            resizeMode="cover"
            style={styles.menuBanner}
          />
          <TouchableOpacity style={styles.startButton} onPress={openMainUi}>
            <Text style={styles.startButtonText}>Apri MiraApp AI</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.menuFooter}>
          con il patrocino del comune di mirabella imbaccari
        </Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.centeredPage, { paddingTop: TOP_INSET + 24 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        {infoControls}
        <Text style={styles.title}>MiraApp AI</Text>
        <Text style={styles.message}>
          Camera access is required for the live preview and frame analysis.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={[styles.centeredPage, { paddingTop: TOP_INSET + 24 }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        {infoControls}
        <ActivityIndicator />
        <Text style={styles.message}>Looking for a back camera…</Text>
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
      {infoControls}

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
            console.error('Camera error', error);
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
              <Text style={styles.liveBadge}>LIVE · {PREVIEW_FPS} FPS</Text>
              <Text style={styles.feedBadge}>
                TARGET · {analysisTargetFps} FPS
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
                <Text style={styles.debugTitle}>PIPELINE DEBUG</Text>
                <Text
                  style={[
                    styles.stageText,
                    isAnalyzing && styles.stageTextBusy,
                  ]}>
                  {stageLabel}
                </Text>
              </View>
              <Text style={styles.debugText}>
                Actual {debugStats.actualFps.toFixed(1)} fps · analyzed{' '}
                {debugStats.analyzed} · dropped {debugStats.skipped} · errors{' '}
                {debugStats.errors}
              </Text>
              <Text style={styles.debugText}>
                snap {debugStats.snapshotMs} ms · resize {debugStats.resizeMs} ms ·
                raw {debugStats.rawMs} ms
              </Text>
              <Text style={styles.debugText}>
                prep {debugStats.preprocessMs} ms
              </Text>
              <Text style={styles.debugText}>
                infer {debugStats.inferenceMs} ms · post{' '}
                {debugStats.postprocessMs} ms
              </Text>
              <Text style={styles.debugText}>
                total {debugStats.totalMs} ms · prep+infer{' '}
                {debugStats.prepInferMs} ms
              </Text>
              <Text style={styles.debugText}>
                frame {debugStats.frameWidth || '—'}×
                {debugStats.frameHeight || '—'} {debugStats.pixelFormat} · input {CONFIG.INPUT_SIZE}×
                {CONFIG.INPUT_SIZE} · detections {detections?.length ?? 0}
              </Text>
            </View>
          </View>
        )}

        <View pointerEvents="none" style={styles.bottomOverlay}>
          {modelState === 'loading' && (
            <View style={styles.statusRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.statusText}>Loading model…</Text>
            </View>
          )}

          {modelState === 'error' && (
            <Text style={styles.errorText}>
              Model failed to load: {modelLoadError}
            </Text>
          )}

          {runtimeError && modelState === 'ready' && (
            <Text style={styles.errorText}>Runtime error: {runtimeError}</Text>
          )}

          {modelState === 'ready' && (
            <View style={styles.resultCard}>
              <View style={styles.statusRow}>
                {isAnalyzing && <ActivityIndicator color="#fff" />}
                <Text style={styles.resultText}>
                  {detections === null
                    ? 'Waiting for first analyzed frame…'
                    : best
                      ? `${best.className} · ${Math.round(best.score * 100)}%`
                      : 'No object recognized'}
                </Text>
              </View>
              {debugVisible && (
                <Text style={styles.timestampText}>
                  {lastAnalyzedAt
                    ? `Last result: ${lastAnalyzedAt.toLocaleTimeString()} · frame #${debugStats.analyzed}`
                    : `Target cadence: ${analysisTargetFps} frames per second`}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        {debugVisible && (
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
        )}

        <TouchableOpacity
          style={styles.debugButton}
          onPress={() => setDebugVisible(value => !value)}>
          <Text style={styles.buttonText}>
            {debugVisible ? 'Hide debug' : 'Show debug'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !isStreaming && styles.resumeButton]}
          onPress={() => setIsStreaming(value => !value)}>
          <Text style={styles.buttonText}>
            {isStreaming ? 'Pause' : 'Resume'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuPage: {
    flex: 1,
    backgroundColor: '#f7f2e8',
    paddingTop: TOP_INSET + 24,
    paddingHorizontal: 20,
    paddingBottom: 22,
    justifyContent: 'space-between',
  },
  menuContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: {
    color: '#173a35',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 24,
  },
  menuBanner: {
    width: '100%',
    maxWidth: 560,
    aspectRatio: 1200 / 520,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(23, 58, 53, 0.18)',
    marginBottom: 30,
  },
  startButton: {
    minWidth: 210,
    backgroundColor: '#176b5b',
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  menuFooter: {
    color: '#52645f',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    textTransform: 'none',
    paddingHorizontal: 28,
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
  liveBadge: {
    color: '#fff',
    backgroundColor: 'rgba(180, 0, 0, 0.86)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    fontSize: 11,
    fontWeight: '800',
  },
  feedBadge: {
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 7,
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
