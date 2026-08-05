/**
 * YOLO26n ONNX single-class detector.
 * Pick or take a photo -> runs on-device inference -> tells you whether
 * the trained class was recognized.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
} from 'react-native-image-picker';
import { Tensor } from 'onnxruntime-react-native';

import { CONFIG } from './src/config';
import { getSession } from './src/ml/session';
import { preprocessJpegBase64 } from './src/ml/preprocess';
import { parseModelOutput, type Detection } from './src/ml/postprocess';

type ModelState = 'loading' | 'ready' | 'error';

function App() {
  const [modelState, setModelState] = useState<ModelState>('loading');
  const [modelError, setModelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<Asset | null>(null);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    getSession()
      .then(() => setModelState('ready'))
      .catch(err => {
        console.error('Failed to load model', err);
        setModelError(String(err?.message ?? err));
        setModelState('error');
      });
  }, []);

  const runDetection = useCallback(async (asset: Asset) => {
    if (!asset.base64) {
      Alert.alert('No image data', 'Could not read the selected photo.');
      return;
    }
    setBusy(true);
    setDetections(null);
    try {
      const { tensorData, dims, letterbox } = preprocessJpegBase64(
        asset.base64,
        CONFIG.INPUT_SIZE,
      );

      const session = await getSession();
      const inputTensor = new Tensor('float32', tensorData, dims);
      const results = await session.run({ [CONFIG.INPUT_NAME]: inputTensor });
      const output = results[CONFIG.OUTPUT_NAME];

      if (!output) {
        throw new Error(
          `Output "${CONFIG.OUTPUT_NAME}" not found. Open your model in netron.app and update OUTPUT_NAME in src/config.ts. Available outputs: ${Object.keys(
            results,
          ).join(', ')}`,
        );
      }

      const found = parseModelOutput(
        output.data as Float32Array,
        output.dims,
        letterbox,
      );
      setDetections(found);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Detection failed', String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = useCallback(
    async (source: 'camera' | 'library') => {
      const options = {
        mediaType: 'photo' as const,
        includeBase64: true,
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.9 as const,
      };

      const result =
        source === 'camera'
          ? await launchCamera(options)
          : await launchImageLibrary(options);

      if (result.didCancel || !result.assets?.length) return;

      const asset = result.assets[0];
      setPhoto(asset);
      await runDetection(asset);
    },
    [runDetection],
  );

  const best = detections?.[0] ?? null;
  const recognized = !!best;

  // Layout the preview image + a box overlay for the top detection.
  const containerWidth = screenWidth - 32;
  const displayW = photo?.width
    ? Math.min(containerWidth, photo.width)
    : containerWidth;
  const displayScale = photo?.width ? displayW / photo.width : 1;
  const displayH = photo?.height ? photo.height * displayScale : displayW;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>YOLO26n Class Detector</Text>

        {modelState === 'loading' && (
          <View style={styles.statusRow}>
            <ActivityIndicator />
            <Text style={styles.statusText}>Loading model…</Text>
          </View>
        )}
        {modelState === 'error' && (
          <Text style={styles.errorText}>
            Model failed to load: {modelError}
            {'\n'}Make sure android/app/src/main/assets/model.onnx exists.
          </Text>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, modelState !== 'ready' && styles.buttonDisabled]}
            disabled={modelState !== 'ready' || busy}
            onPress={() => pick('camera')}>
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, modelState !== 'ready' && styles.buttonDisabled]}
            disabled={modelState !== 'ready' || busy}
            onPress={() => pick('library')}>
            <Text style={styles.buttonText}>Choose Photo</Text>
          </TouchableOpacity>
        </View>

        {busy && (
          <View style={styles.statusRow}>
            <ActivityIndicator />
            <Text style={styles.statusText}>Running inference…</Text>
          </View>
        )}

        {photo?.uri && (
          <View
            style={[
              styles.imageWrap,
              { width: displayW, height: displayH },
            ]}>
            <Image
              source={{ uri: photo.uri }}
              style={{ width: displayW, height: displayH }}
              resizeMode="contain"
            />
            {best && (
              <View
                style={[
                  styles.box,
                  {
                    left: best.box.x1 * displayScale,
                    top: best.box.y1 * displayScale,
                    width: (best.box.x2 - best.box.x1) * displayScale,
                    height: (best.box.y2 - best.box.y1) * displayScale,
                  },
                ]}
              />
            )}
          </View>
        )}

        {detections !== null && (
          <View
            style={[
              styles.resultCard,
              recognized ? styles.resultGood : styles.resultBad,
            ]}>
            <Text style={styles.resultText}>
              {recognized
                ? `✅ ${best!.className} recognized (${Math.round(
                    best!.score * 100,
                  )}% confidence)`
                : '❌ Not recognized'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 16, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statusText: { marginLeft: 8, color: '#444' },
  errorText: { color: '#b00020', marginBottom: 12, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  buttonDisabled: { backgroundColor: '#a9c6f5' },
  buttonText: { color: '#fff', fontWeight: '600' },
  imageWrap: { marginBottom: 16, backgroundColor: '#eee' },
  box: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#00e676',
    borderRadius: 2,
  },
  resultCard: {
    width: '100%',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  resultGood: { backgroundColor: '#e6f4ea' },
  resultBad: { backgroundColor: '#fce8e6' },
  resultText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

export default App;
