import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';

import '../models/place.dart';
import '../widgets/adaptive_image.dart';

class GalleryFullscreen extends StatefulWidget {
  final List<GalleryItem> items;
  final int initialIndex;

  const GalleryFullscreen({
    super.key,
    required this.items,
    required this.initialIndex,
  });

  @override
  State<GalleryFullscreen> createState() => _GalleryFullscreenState();
}

class _GalleryFullscreenState extends State<GalleryFullscreen> {
  late PageController _controller;
  late int currentIndex;

  final AudioPlayer _audioPlayer = AudioPlayer();
  bool isPlaying = false;

  @override
  void initState() {
    super.initState();
    currentIndex = widget.initialIndex;
    _controller = PageController(initialPage: currentIndex);
  }

  Future<void> _playAudio(String path) async {
    if (!isPlaying) {
      await _audioPlayer.play(
        AssetSource("audio/$path"),
      );
      setState(() => isPlaying = true);
    } else {
      await _audioPlayer.stop();
      setState(() => isPlaying = false);
    }
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentItem = widget.items[currentIndex];

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.items.length,
            onPageChanged: (index) {
              setState(() {
                currentIndex = index;
                isPlaying = false;
                _audioPlayer.stop();
              });
            },
            itemBuilder: (context, index) {
              return InteractiveViewer(
                child: Center(
                  child: AdaptiveImage(
                    path: widget.items[index].image,
                    fit: BoxFit.contain,
                  ),
                ),
              );
            },
          ),

          Positioned(
            top: 40,
            right: 20,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white),
              onPressed: () => Navigator.pop(context),
            ),
          ),

          if (currentItem.hasAudio && currentItem.audio != null)
            Positioned(
              bottom: 30,
              right: 20,
              child: FloatingActionButton(
                backgroundColor: Colors.white,
                onPressed: () => _playAudio(currentItem.audio!),
                child: Icon(
                  isPlaying ? Icons.stop : Icons.play_arrow,
                  color: Colors.black,
                ),
              ),
            ),
        ],
      ),
    );
  }
}