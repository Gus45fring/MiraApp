// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/place.dart';
import '../widgets/adaptive_image.dart';
import 'gallery_fullscreen.dart';

class PlaceDetailPage extends StatefulWidget {
  final Place place;

  const PlaceDetailPage({super.key, required this.place});

  @override
  State<PlaceDetailPage> createState() => _PlaceDetailPageState();
}

class _PlaceDetailPageState extends State<PlaceDetailPage> {
  final AudioPlayer _audioPlayer = AudioPlayer();

  bool isPlaying = false;
  Duration duration = Duration.zero;
  Duration position = Duration.zero;

  @override
  void initState() {
    super.initState();

    _audioPlayer.onDurationChanged.listen((d) {
      setState(() => duration = d);
    });

    _audioPlayer.onPositionChanged.listen((p) {
      setState(() => position = p);
    });

    _audioPlayer.onPlayerComplete.listen((event) {
      setState(() {
        isPlaying = false;
        position = Duration.zero;
      });
    });
  }

  /// ▶️ Play / Pause
  Future<void> _togglePlayPause() async {
    if (isPlaying) {
      await _audioPlayer.pause();
      setState(() => isPlaying = false);
    } else {
      await _audioPlayer.play(
        AssetSource("audio/${widget.place.audioAsset}"),
      );
      setState(() => isPlaying = true);
    }
  }

  /// ⏹ Stop
  Future<void> _stopAudio() async {
    await _audioPlayer.stop();
    setState(() {
      isPlaying = false;
      position = Duration.zero;
    });
  }

  /// 🎥 Open video
  Future<void> _openVideo() async {
    final url = Uri.parse(widget.place.youtubeUrl);
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  /// ⏱ Format time
  String formatTime(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return "$minutes:$seconds";
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final place = widget.place;

    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            /// 🔹 HERO IMAGE
            Stack(
              children: [
                SizedBox(
                  height: 300,
                  width: double.infinity,
                  child: AdaptiveImage(
                    path: place.imageUrl,
                    fit: BoxFit.cover,
                  ),
                ),
                Container(
                  height: 300,
                  color: Colors.black.withAlpha(100),
                ),
                Positioned(
                  bottom: 20,
                  left: 20,
                  child: Text(
                    place.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Positioned(
                  top: 40,
                  left: 10,
                  child: IconButton(
                    icon:
                        const Icon(Icons.arrow_back, color: Colors.white),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            /// 🔹 DESCRIPTION
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                place.description,
                style: const TextStyle(fontSize: 16, height: 1.5),
              ),
            ),

            const SizedBox(height: 24),

            /// 🔹 GALLERY
            SizedBox(
              height: 160,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.only(left: 24),
                itemCount: place.gallery.length,
                itemBuilder: (context, index) {
                  return Container(
                    width: 240,
                    margin: const EdgeInsets.only(right: 16),
                    child: GestureDetector(
                      onTap: () async {
                        await _stopAudio();

                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => GalleryFullscreen(
                              items: place.gallery,
                              initialIndex: index,
                            ),
                          ),
                        );
                      },
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: AdaptiveImage(
                          path: place.gallery[index].image,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 30),

            /// 🔹 VIDEO BUTTON
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Card(
                child: ListTile(
                  leading: const Icon(Icons.play_circle_fill,
                      color: Color(0xFF1F3C5A)),
                  title: const Text("Guarda video"),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 18),
                  onTap: _openVideo,
                ),
              ),
            ),

            const SizedBox(height: 20),

            /// 🔹 AUDIO PLAYER
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [

                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          "Guida audio",
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),

                      const SizedBox(height: 12),

                      /// 🔹 SLIDER
                      Slider(
                        min: 0,
                        max: duration.inSeconds.toDouble(),
                        value: position.inSeconds
                            .clamp(0, duration.inSeconds)
                            .toDouble(),
                        onChanged: (value) async {
                          final newPosition =
                              Duration(seconds: value.toInt());
                          await _audioPlayer.seek(newPosition);
                        },
                      ),

                      /// 🔹 TIME
                      Row(
                        mainAxisAlignment:
                            MainAxisAlignment.spaceBetween,
                        children: [
                          Text(formatTime(position)),
                          Text(formatTime(duration)),
                        ],
                      ),

                      const SizedBox(height: 10),

                      /// 🔹 CONTROLS
                      Row(
                        mainAxisAlignment:
                            MainAxisAlignment.center,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.stop),
                            iconSize: 32,
                            onPressed: _stopAudio,
                          ),
                          const SizedBox(width: 20),
                          IconButton(
                            icon: Icon(
                              isPlaying
                                  ? Icons.pause
                                  : Icons.play_arrow,
                            ),
                            iconSize: 40,
                            onPressed: _togglePlayPause,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}