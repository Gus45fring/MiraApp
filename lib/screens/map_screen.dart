import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadHtmlString(_htmlContent());
  }

  String _htmlContent() {
    return '''
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  body { margin:0; padding:0; }
  #map { height:100vh; width:100vw; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map').setView([37.3245, 14.4475], 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  var marker1 = L.marker([37.32416744152161, 14.446215106940475]).addTo(map);
  marker1.bindPopup("Chiesa Sacro Cuore di Maria");

  var marker2 = L.marker([37.324927400665956, 14.448356588728489]).addTo(map);
  marker2.bindPopup("Palazzo Biscari");
</script>
</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Mappa"),
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}
