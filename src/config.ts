export const CONFIG = {
  // Name of the .onnx file bundled in android/app/src/main/assets/
  MODEL_ASSET_NAME: 'model.onnx',

  // Square input size the model was exported with (yolo export imgsz=...).
  INPUT_SIZE: 640,

  INPUT_NAME: 'images',

  OUTPUT_NAME: 'output0',

  END_TO_END: true,

  // The class list, in the same order used during training (data.yaml `names`).
  CLASS_NAMES: ['chiesa'],

  // Minimum confidence to count as "recognized".
  CONFIDENCE_THRESHOLD: 0.5,

  // A configured link opens when its class is detected ABOVE this confidence.
  // 0.7 means strictly greater than 70%.
  LINK_OPEN_CONFIDENCE_THRESHOLD: 0.7,

  // Map model class names to the links they should open. The class name must
  // exactly match an entry in CLASS_NAMES. Remove an entry to disable it.
  CLASS_LINKS: {
	  chiesa: 'https://www.miraapp.it/chiesa-matrice',
    // another_class: 'https://example.com/another-page',
  } as Record<string, string>,

  IOU_THRESHOLD: 0.45,
};
