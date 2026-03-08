import 'package:flutter/material.dart';

class AdaptiveImage extends StatelessWidget {
  final String path;
  final BoxFit fit;

  const AdaptiveImage({
    super.key,
    required this.path,
    this.fit = BoxFit.cover,
  });

  bool get isNetwork => path.startsWith('http');

  @override
  Widget build(BuildContext context) {
    if (isNetwork) {
      return Image.network(
        path,
        fit: fit,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return const Center(child: CircularProgressIndicator());
        },
      );
    } else {
      return Image.asset(
        path,
        fit: fit,
      );
    }
  }
}