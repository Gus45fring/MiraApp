class Place {
  final String id;
  final String name;
  final String description;
  final String imageUrl;
  final List<GalleryItem> gallery;
  final String youtubeUrl;
  final String audioAsset;

  const Place({
    required this.id,
    required this.name,
    required this.description,
    required this.imageUrl,
    required this.gallery,
    required this.youtubeUrl,
    required this.audioAsset,
  });
}
class GalleryItem {
  final String image;
  final String? audio; // optional
  final bool hasAudio;

  const GalleryItem({
    required this.image,
    this.audio = "",
    this.hasAudio = false,
  });
}