import { InferenceSession } from 'onnxruntime-react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { Platform } from 'react-native';
import { CONFIG } from '../config';

let cachedSession: InferenceSession | null = null;

/**
 * Android can't run ONNX Runtime directly out of the APK's assets folder -
 * it needs a real file path. So on first launch we copy the bundled model
 * from `android_asset` into the app's document directory, then load it
 * from there. Every launch after that just reuses the copy.
 */
async function resolveModelPath(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('This project is configured for Android only.');
  }

  const destPath = `${RNFS.DocumentDirectoryPath}/${CONFIG.MODEL_ASSET_NAME}`;
  const alreadyCopied = await RNFS.exists(destPath);

  if (!alreadyCopied) {
    await RNFS.copyFileAssets(CONFIG.MODEL_ASSET_NAME, destPath);
  }

  return destPath;
}

export async function getSession(): Promise<InferenceSession> {
  if (cachedSession) {
    return cachedSession;
  }

  const modelPath = await resolveModelPath();
  cachedSession = await InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
  });

  return cachedSession;
}
