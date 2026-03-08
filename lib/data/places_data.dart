import '../models/place.dart';

final List<Place> places = [
  const Place(
    id: "palazzo-biscari",
    name: "Palazzo Biscari",
    description:
        "È il monumento più insigne, unitamente alla Chiesa Madre, che c'è nel Comune di Mirabella. In esso attualmente ha sede l'Istituto delle Suore di Santa Dorotea. Sorge sul punto più alto del paese, sullo sfondo della via Trigona, che è l'arteria più centrale e più antica. ",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Palazzo_Biscari_%28Mirabella_Imbaccari%29_2.jpg",
    galleryImages: [
      "https://www.vita.it/wp-content/uploads/2023/07/d18b5535-cff1-4ca9-8dc9-c889f4746ee9_large.jpeg",
      "assets/images/PalazzoInterno.jpeg",
      "https://fdcmessina.org/wp-content/uploads/2024/10/IMG_7279-1200x600.jpg",
    ],
    youtubeUrl: "https://youtu.be/lICKD7hjg4o",
    audioAsset: "audio/palazzo.mp3",
  ),
  const Place(
    id: "chiesa",
    name: "Chiesa Madre",
    description:
        "La Chiesa Madre è dedicata alla Madonna delle Grazie, insigne monumento di architettura barocco-dialettale che s'innalza, fronteggiando il palazzo Biscari lungo la via Trigona, sulla piazza principale del paese. Vi si accede attraverso un'ampia scalinata.",
    imageUrl: "https://lh3.googleusercontent.com/p/AF1QipPxCK0rxrCVdN8PFU-tZXAKN7FdIxDkUr1uSI7t=s680-w680-h510",
    galleryImages: [
      "https://annuariocattolico.it/pf/AC/media/enti/BW79222.jpg?",
      "assets/images/ChiesaInterno.jpeg",
      "https://upload.wikimedia.org/wikipedia/commons/7/74/Mirabella_Chiesa_S_Maria_Grazie.JPG",
    ],
    youtubeUrl: "https://youtu.be/O6rr-xiTuH0",
    audioAsset: "audio/chiesa.mp3",
  ),
];
