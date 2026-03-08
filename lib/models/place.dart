class Place {
  final String id;
  final String name;
  final String description;
  final String imageUrl;
  final List<String> galleryImages;
  final String youtubeUrl;
  final String audioAsset;

  const Place({
    required this.id,
    required this.name,
    required this.description,
    required this.imageUrl,
    required this.galleryImages,
    required this.youtubeUrl,
    required this.audioAsset,
  });
}
