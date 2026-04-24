import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import '../services/tflite_service.dart';

class QRScreen extends StatefulWidget {
  const QRScreen({super.key});

  @override
  State<QRScreen> createState() => _QRScreenState();
}

class _QRScreenState extends State<QRScreen> {
  CameraController? _controller;
  final TfliteService _tflite = TfliteService();
  bool _isProcessing = false;
  String _status = "Caricamento...";

  @override
  void initState() {
    super.initState();
    _setup();
  }

  Future<void> _setup() async {
    try {
      await _tflite.init();
      final cameras = await availableCameras();
      _controller = CameraController(cameras[0], ResolutionPreset.low); // LOW resolution is better for AI
      await _controller!.initialize();
      
      if (mounted) setState(() => _status = "Punta al monumento");
      
      _controller!.startImageStream((image) async {
        if (_isProcessing) return;
        _isProcessing = true;
        
        // --- ADD YOUR INFERENCE CALL HERE ---
        // await _tflite.runInference(processedImage);
        
        _isProcessing = false;
      });
    } catch (e) {
      if (mounted) setState(() => _status = "Errore: ${e.toString()}");
    }
  }

  @override
  void dispose() {
    _controller?.stopImageStream(); // CRITICAL: Stop the stream before disposing
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: (_controller == null || !_controller!.value.isInitialized)
          ? Center(child: Text(_status, style: const TextStyle(color: Colors.white)))
          : Stack(
              children: [
                CameraPreview(_controller!),
                Center(child: Text(_status, style: const TextStyle(color: Colors.white, fontSize: 24))),
              ],
            ),
    );
  }
}