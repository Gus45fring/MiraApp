import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../data/places_data.dart';
import 'place_detail_page.dart';

class QRScreen extends StatefulWidget {
  const QRScreen({super.key});

  @override
  State<QRScreen> createState() => _QRScreenState();
}

class _QRScreenState extends State<QRScreen> {
  bool _isNavigating = false;

  void _handleQRCode(String code) {
    if (_isNavigating) return;

    final cleanedCode = code.trim().toLowerCase();

    try {
      final place = places.firstWhere(
        (p) => p.id.toLowerCase() == cleanedCode,
      );

      setState(() => _isNavigating = true);

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => PlaceDetailPage(place: place),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("QR Code sconosciuto: $cleanedCode")),
      );
    }
  }





  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          MobileScanner(
            onDetect: (barcode) {
              final String? code = barcode.barcodes.firstOrNull?.rawValue;
              if (code != null) {
                _handleQRCode(code);
              }
            },
          ),


          Container(color: Colors.black.withAlpha(20)),

          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(30),
                border: Border.all(color: Colors.white, width: 4),
              ),
            ),
          ),

          Positioned(
            top: 50,
            left: 20,
            child: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => Navigator.pop(context),
            ),
          ),
        ],
      ),
    );
  }
}
