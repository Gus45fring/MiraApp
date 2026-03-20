import 'package:flutter/material.dart';
import '../widgets/adaptive_image.dart';

class GalleryFullscreen extends StatefulWidget {
  final List<String> images;
  final int initialIndex;

  const GalleryFullscreen({
    super.key,
    required this.images,
    required this.initialIndex,
  });

  @override
  State<GalleryFullscreen> createState() => _GalleryFullscreenState();
}

class _GalleryFullscreenState extends State<GalleryFullscreen> {
  late PageController _controller;
  late int currentIndex;

  @override
  void initState() {
    super.initState();
    currentIndex = widget.initialIndex;
    _controller = PageController(initialPage: currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,

      body: Stack(
        children: [

          /// 🔹 IMAGE VIEWER
          PageView.builder(
            controller: _controller,
            itemCount: widget.images.length,
            onPageChanged: (index) {
              setState(() => currentIndex = index);
            },
            itemBuilder: (context, index) {
              return InteractiveViewer(
                child: Center(
                  child: AdaptiveImage(
                    path: widget.images[index],
                    fit: BoxFit.contain,
                  ),
                ),
              );
            },
          ),

          /// 🔹 CLOSE BUTTON
          Positioned(
            top: 40,
            right: 20,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 30),
              onPressed: () => Navigator.pop(context),
            ),
          ),

          /// 🔹 IMAGE COUNTER
          Positioned(
            bottom: 30,
            left: 0,
            right: 0,
            child: Center(
              child: Text(
                "${currentIndex + 1} / ${widget.images.length}",
                style: const TextStyle(color: Colors.white, fontSize: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}