import 'package:tflite_flutter/tflite_flutter.dart';
import 'package:flutter/services.dart' show rootBundle;

class TfliteService {
  Interpreter? _interpreter;
  List<String> _labels = [];

  int get labelCount => _labels.length;
  List<String> get labels => _labels;

  Future<void> init() async {
    try {
      // FIX 1: Use the full asset path, not just the filename
      _interpreter = await Interpreter.fromAsset('assets/model_unquant.tflite');

      final labelData = await rootBundle.loadString('assets/labels.txt');
      _labels = labelData
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .map((l) => l.contains(' ') ? l.split(' ').sublist(1).join(' ') : l) // 👈 strip "0 ", "1 " etc.
        .toList();
      print("TFLite: Initialized. Labels (${_labels.length}): $_labels");

      // Log tensor shapes so you can verify input/output dimensions
      print("TFLite: Input tensor: ${_interpreter!.getInputTensor(0).shape}");
      print("TFLite: Output tensor: ${_interpreter!.getOutputTensor(0).shape}");
    } catch (e) {
      print("TFLite ERROR: Could not init: $e");
      rethrow;
    }
  }

  // FIX 2: Input is now float32 with batch dimension [1, 224, 224, 3]
  List<double> runInference(List<List<List<List<double>>>> input) {
    if (_interpreter == null || _labels.isEmpty) return [];

    // Output shape: [1, numLabels]
    final numClasses = _labels.length;
    // Was hardcoded to 2 — must match label count
    var output = List.generate(1, (_) => List.filled(_labels.length, 0.0));
    _interpreter!.run(input, output);

    final results = List<double>.from(output[0]);
    print("TFLite: Raw output: $results");
    return results;
  }

  // Returns the label with the highest confidence
  String topLabel(List<double> results) {
    if (results.isEmpty || _labels.isEmpty) return "Sconosciuto";
    int bestIdx = 0;
    for (int i = 1; i < results.length; i++) {
      if (results[i] > results[bestIdx]) bestIdx = i;
    }
    return _labels[bestIdx];
  }
}