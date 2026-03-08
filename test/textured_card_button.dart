import 'package:flutter/material.dart';

class TexturedCardButton extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  const TexturedCardButton({
    super.key,
    required this.icon,
    required this.text,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Card(
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        child: Stack(
          children: [

            // 🔹 Background Texture
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Opacity(
                  opacity: 0.08, // subtle texture
                  child: Image.asset(
                    "assets/images/texture.png", // <-- your texture file
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
}
