import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;

img.Image convertCameraImageToImage(CameraImage cameraImage) {
  final width = cameraImage.width;
  final height = cameraImage.height;

  final yPlane = cameraImage.planes[0];
  final uPlane = cameraImage.planes[1];
  final vPlane = cameraImage.planes[2];

  final yBytes = yPlane.bytes;
  final uBytes = uPlane.bytes;
  final vBytes = vPlane.bytes;

  // FIX: Use actual row stride and pixel stride from the camera planes.
  // Android cameras often interleave UV with a pixel stride of 2,
  // so ignoring these causes color corruption and washed-out images.
  final yRowStride = yPlane.bytesPerRow;
  final uvRowStride = uPlane.bytesPerRow;
  final uvPixelStride = uPlane.bytesPerPixel ?? 1;

  img.Image image = img.Image(width: width, height: height);

  for (int yCoord = 0; yCoord < height; yCoord++) {
    for (int xCoord = 0; xCoord < width; xCoord++) {
      final yIdx = yCoord * yRowStride + xCoord;
      final uvIdx = (yCoord ~/ 2) * uvRowStride + (xCoord ~/ 2) * uvPixelStride;

      final yVal = yBytes[yIdx];
      final uVal = uBytes[uvIdx];
      final vVal = vBytes[uvIdx];

      int r = (yVal + 1.402 * (vVal - 128)).toInt().clamp(0, 255);
      int g = (yVal - 0.3441 * (uVal - 128) - 0.7141 * (vVal - 128)).toInt().clamp(0, 255);
      int b = (yVal + 1.772 * (uVal - 128)).toInt().clamp(0, 255);

      image.setPixelRgb(xCoord, yCoord, r, g, b);
    }
  }

  return image;
}