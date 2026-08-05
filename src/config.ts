/**
 * Edit this file to match how YOU exported your model.
 * Open model.onnx in https://netron.app to confirm input/output names and shapes.
 */

export const CONFIG = {
  // Name of the .onnx file bundled in android/app/src/main/assets/
  MODEL_ASSET_NAME: 'model.onnx',

  // Square input size the model was exported with (yolo export imgsz=...).
  // YOLO26n default is 640.
  INPUT_SIZE: 640,

  // Name of the model's input node. Ultralytics ONNX exports use "images".
  INPUT_NAME: 'images',

  // Name of the model's output node. Ultralytics ONNX exports use "output0".
  OUTPUT_NAME: 'output0',

  // true  -> model was exported with the default end-to-end head
  //          (output shape [1, 300, 6], already NMS-filtered)
  // false -> model was exported with end2end=False
  //          (output shape [1, 4+numClasses, numBoxes], needs NMS)
  END_TO_END: true,

  // Your class list, in the same order used during training (data.yaml `names`).
  // For a single-class model this is just one entry.
  CLASS_NAMES: ['object'],

  // Minimum confidence to count as "recognized".
  CONFIDENCE_THRESHOLD: 0.5,

  // Only used when END_TO_END is false: IoU threshold for NMS.
  IOU_THRESHOLD: 0.45,
};
