import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;
import '../services/tflite_service.dart';
import '../services/image_utils.dart';

class QRScreen extends StatefulWidget {
  const QRScreen({super.key});
  @override
  State<QRScreen> createState() => _QRScreenState();
}

class _QRScreenState extends State<QRScreen> {
  late CameraController _controller;
  final TfliteService _tflite = TfliteService();
  bool _isProcessing = false;
  String _result = "Puntare al monumento...";

  @override
  void initState() {
    super.initState();
    _initEverything();
  }

  Future<void> _initEverything() async {
    await _tflite.init();
    final cameras = await availableCameras();
    _controller = CameraController(cameras[0], ResolutionPreset.medium);
    await _controller.initialize();
    
    _controller.startImageStream((CameraImage image) {
      if (!_isProcessing) {
        _isProcessing = true;
        _runInference(image);
      }
    });
    setState(() {});
  }

  void _runInference(CameraImage cameraImage) async {
    // 1. Convert to RGB
    img.Image rgbImage = convertCameraImageToImage(cameraImage);
    // 2. Resize to what your model expects (usually 224x224)
    img.Image resized = img.copyResize(rgbImage, width: 224, height: 224);
    
    // 3. Prepare list for TFLite (a 3D list)
    // Note: This logic assumes a standard float32 model input
    List<List<List<int>>> input = List.generate(224, (y) => 
      List.generate(224, (x) => [resized.getPixel(x, y).r.toInt(), resized.getPixel(x, y).g.toInt(), resized.getPixel(x, y).b.toInt()])
    );

    // 4. Run Model
    final results = _tflite.runInference(input);
    
    // 5. Update UI
    if (results[0] > 0.8) { // Index 0 is your building
      setState(() => _result = "Edificio Trovato!");
    } else {
      setState(() => _result = "Cerco...");
    }
    _isProcessing = false;
  }

  @override
  Widget build(BuildContext context) {
    if (!_controller.value.isInitialized) return const Scaffold();
    return Scaffold(
      body: Stack(
        children: [
          CameraPreview(_controller),
          Center(child: Text(_result, style: TextStyle(color: Colors.white, fontSize: 24))),
        ],
      ),
    );
  }
}