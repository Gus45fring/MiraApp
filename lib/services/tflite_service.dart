import 'package:tflite_flutter/tflite_flutter.dart';
import 'package:flutter/services.dart';

class TfliteService {
  late Interpreter _interpreter;
  late List<String> _labels;

  Future<void> init() async {
    _interpreter = await Interpreter.fromAsset('model_unquant.tflite');
    final labelData = await rootBundle.loadString('assets/labels.txt');
    _labels = labelData.split('\n');
  }

  // This runs the "math" on the image data
  List<double> runInference(List<List<List<int>>> input) {
    var output = List.filled(1 * _labels.length, 0.0).reshape([1, _labels.length]);
    _interpreter.run(input, output);
    return List<double>.from(output[0]);
  }
}