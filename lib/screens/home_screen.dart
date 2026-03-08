import 'package:flutter/material.dart';
import 'qr_screen.dart';
import 'map_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  void _showInfoDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text("Info"),
        content: const Text(
          "Benvenuto su MiraApp! \n\n"
          "Scansiona QR code nei luoghi storici per scoprire la loro storia \n"
          "Crediti:\n Pino Zaccaria, Wikimedia Commons e Filippo Nisi.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Chiudi"),
          ),
        ],
      ),
    );
  }

  Widget _texturedButton({
    required IconData icon,
    required String text,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Card(
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Stack(
          children: [
            // 🔹 Texture Overlay
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Opacity(
                  opacity: 0.08,
                  child: Image.asset(
                    "assets/images/texture.png",
                    fit: BoxFit.cover,
                  ),
                ),
              ),
            ),

            // 🔹 Button Content
            Padding(
              padding: const EdgeInsets.all(24),
              child: Row(
                children: [
                  Icon(icon, size: 40, color: const Color(0xFF1F3C5A)),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Text(
                      text,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,

      appBar: AppBar(
        backgroundColor: Colors.white.withAlpha(60),
        elevation: 4,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.black),
        title: const Text(
          "MiraApp",
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.black),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline, color: Colors.black),
            onPressed: () => _showInfoDialog(context),
          ),
        ],
      ),

      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 🔹 HERO IMAGE
            SizedBox(
              height: 300,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset("assets/images/home.jpg", fit: BoxFit.cover),

                  Container(color: Colors.black.withAlpha(20)),
                ],
              ),
            ),

            const SizedBox(height: 40),

            // Scan QR
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: _texturedButton(
                icon: Icons.qr_code_scanner,
                text: "Scansiona il QR Code",
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const QRScreen()),
                  );
                },
              ),
            ),

            const SizedBox(height: 20),

            // Look at Map
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: _texturedButton(
                icon: Icons.map,
                text: "Vedi la mappa",
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const MapScreen()),
                  );
                },
              ),
            ),

            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}
