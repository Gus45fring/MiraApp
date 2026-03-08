import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static final lightTheme = ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: const Color(0xFFF3EDE2),
    primaryColor: const Color(0xFF1F3C5A),

    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF1F3C5A),
      primary: const Color(0xFF1F3C5A),
      secondary: const Color(0xFFB89B6F),
    ),

    textTheme: GoogleFonts.playfairDisplayTextTheme().copyWith(
      bodyMedium: GoogleFonts.lato(),
    ),

    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 8,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
    ),
  );
}
