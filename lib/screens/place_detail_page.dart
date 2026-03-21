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

  Future<void> _playAudio() async {
    if (!isPlaying) {
      await _audioPlayer.play(AssetSource(widget.place.audioAsset));
      setState(() => isPlaying = true);
    } else {
      await _audioPlayer.stop();
      setState(() => isPlaying = false);
    }
  }

  Future<void> _openVideo() async {
    final url = Uri.parse(widget.place.youtubeUrl);
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  Widget _actionCard({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Icon(icon, size: 28, color: const Color(0xFF1F3C5A)),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Icon(Icons.arrow_forward_ios, size: 18),
            ],
          ),
        ),
      ),
    );
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
                  color: Colors.black.withAlpha(102),
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
                      onTap: () {
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

            /// 🔹 ACTION BUTTONS
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  _actionCard(
                    icon: Icons.play_circle_fill,
                    title: "Watch Video",
                    onTap: _openVideo,
                  ),
                  const SizedBox(height: 16),
                  _actionCard(
                    icon: Icons.headphones,
                    title: isPlaying
                        ? "Stop Audio Guide"
                        : "Listen to Audio Guide",
                    onTap: _playAudio,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}