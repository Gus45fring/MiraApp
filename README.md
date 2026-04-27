# MiraApp
Cultural heritage app written with flutter and dart for a project of mine.
Uses QR codes (for now only the church uses image recognition) to recognize the current building.
Current codes are
- chiesa
- palazzo-biscari
---
## App is divided in 4 main pages:
- Home: this is the home page. the file is home_screen.dart
- Map: this is the page used for maps. the file is map_screen.dart
- Place: scalable page screen. fetches data from places_data.dart. file is place_detail_page.dart
- QR: qr code screen. file is qr_screen.dart.

Furthermore, i use the adaptive_image.dart to fetch images both from the internet and local files.

## Place data:
as found in place.dart, this is the way to use the places_data.dart:
```class Place``` uses:
- ```String id```: this is the text in the qr code for the place.
- ```String name```: this is the name of the place, used for the top text in the place.
- ```String description```: description of the place.
- ```String imageURL```: URL of the banner (uses adaptive_image.dart so both local and online images).
- ```List<GalleryItem> gallery```: uses the GalleryItem to show the gallery.
- ```String youtubeURL```: video link.
- ```String audioAsset```: audio file. audio must be local and only the name of the file should be written and not the directory. (so not audio/file.mp3 but file.mp3)
### GalleryItem
- ```String image```: image. both local and online images.
- ```String? audio```: optional audio per image. default has no audio.
- ```bool hasAudio```: if the audio button per image should be shown. default is hidden.


<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>

i vibe coded 80% of this app, it was for a school project 🙏
