import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;

// This function converts the raw camera stream into an RGB image
img.Image convertCameraImageToImage(CameraImage cameraImage) {
  final width = cameraImage.width;
  final height = cameraImage.height;
  final y = cameraImage.planes[0].bytes;
  final u = cameraImage.planes[1].bytes;
  final v = cameraImage.planes[2].bytes;

  img.Image image = img.Image(width: width, height: height);

  for (int yCoord = 0; yCoord < height; yCoord++) {
    for (int xCoord = 0; xCoord < width; xCoord++) {
      final yIdx = yCoord * width + xCoord;
      final uvIdx = (yCoord ~/ 2) * (width ~/ 2) + (xCoord ~/ 2);
      
      final yVal = y[yIdx];
      final uVal = u[uvIdx];
      final vVal = v[uvIdx];

      // Convert YUV to RGB
      int r = (yVal + 1.402 * (vVal - 128)).toInt().clamp(0, 255);
      int g = (yVal - 0.3441 * (uVal - 128) - 0.7141 * (vVal - 128)).toInt().clamp(0, 255);
      int b = (yVal + 1.772 * (uVal - 128)).toInt().clamp(0, 255);
      
      image.setPixelRgb(xCoord, yCoord, r, g, b);
    }
  }
  return image;
}