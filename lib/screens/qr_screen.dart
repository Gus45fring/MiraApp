import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;
import '../services/tflite_service.dart';
import '../services/image_utils.dart';
import '../data/places_data.dart';
import '../screens/place_detail_page.dart';

class QRScreen extends StatefulWidget {
  const QRScreen({super.key});

  @override
  State<QRScreen> createState() => _QRScreenState();
}

class _QRScreenState extends State<QRScreen> {
  CameraController? _controller;
  final TfliteService _tflite = TfliteService();
  bool _isProcessing = false;
  bool _navigating = false; // prevents double navigation
  double _confidence = 0.0;
  String _label = "";
  String _status = "Caricamento...";

  // Minimum confidence to trigger navigation (tweak as needed)
  static const double _threshold = 0.85;

  @override
  void initState() {
    super.initState();
    _setup();
  }

  Future<void> _setup() async {
    try {
      await _tflite.init();
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (mounted) setState(() => _status = "Nessuna camera trovata");
        return;
      }

      _controller = CameraController(cameras[0], ResolutionPreset.low);
      await _controller!.initialize();

      if (mounted) setState(() => _status = "Punta al monumento");

      _controller!.startImageStream((CameraImage image) async {
        if (_isProcessing || _navigating) return;
        _isProcessing = true;
        await _runInference(image);
        _isProcessing = false;
      });
    } catch (e) {
      if (mounted) setState(() => _status = "Errore: $e");
    }
  }

  Future<void> _runInference(CameraImage cameraImage) async {
    img.Image rgb = convertCameraImageToImage(cameraImage);
    img.Image resized = img.copyResize(rgb, width: 224, height: 224);

    final input = List.generate(
      1,
      (_) => List.generate(
        224,
        (y) => List.generate(
          224,
          (x) {
            final p = resized.getPixel(x, y);
            return [p.r / 255.0, p.g / 255.0, p.b / 255.0];
          },
        ),
      ),
    );

    final results = _tflite.runInference(input);
    if (results.isEmpty || !mounted) return;

    // Find best class
    int bestIdx = 0;
    for (int i = 1; i < results.length; i++) {
      if (results[i] > results[bestIdx]) bestIdx = i;
    }

    final confidence = results[bestIdx];
    final label = _tflite.labels.isNotEmpty ? _tflite.labels[bestIdx] : "";

    setState(() {
      _confidence = confidence;
      _label = label;
    });

    // Navigate if confidence is high enough and we have a matching place
    if (confidence >= _threshold && label.isNotEmpty && !_navigating) {
      // Match label to place id
      final match = places.where((p) => p.id == label).firstOrNull;

      if (match != null) {
        _navigating = true;
        await _controller?.stopImageStream();

        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PlaceDetailPage(place: match),
          ),
        );

        // Resume scanning after returning from detail page
        _navigating = false;
        await _controller?.startImageStream((CameraImage image) async {
          if (_isProcessing || _navigating) return;
          _isProcessing = true;
          await _runInference(image);
          _isProcessing = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _controller?.stopImageStream();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: (_controller == null || !_controller!.value.isInitialized)
          ? Center(
              child: Text(_status, style: const TextStyle(color: Colors.white)),
            )
          : Stack(
              children: [
                CameraPreview(_controller!),

                // Scanning frame overlay
                Center(
                  child: Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white54, width: 2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),

                // Bottom info panel
                Align(
                  alignment: Alignment.bottomCenter,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    color: Colors.black54,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_label.isNotEmpty)
                          Text(
                            _label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        const SizedBox(height: 4),
                        Text(
                          _confidence > 0
                              ? "Confidenza: ${(_confidence * 100).toStringAsFixed(1)}%"
                              : _status,
                          style: const TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                        const SizedBox(height: 10),
                        LinearProgressIndicator(
                          value: _confidence,
                          backgroundColor: Colors.white24,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            _confidence >= _threshold ? Colors.green : Colors.orange,
                          ),
                        ),
                        if (_confidence >= _threshold)
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Text(
                              "Monumento riconosciuto! Apertura...",
                              style: TextStyle(color: Colors.greenAccent, fontSize: 13),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}