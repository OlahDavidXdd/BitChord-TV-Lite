# Android TV visual reference

The Tizen shell follows the checked-out Android TV implementation at upstream BitChord revision `b690dc146009d4815825fa4a20815ef2e4ee8898`.

| Element | Android TV source | Tizen implementation |
| --- | --- | --- |
| Canvas | `TvTheme.kt`: #26272C → #101012 | Same gradient on a 960×540 logical stage |
| Top bar | `TvApp.kt`: 18 dp top, 38 dp side margins | Same positions, proportional scaling to the display |
| Navigation | Home, Explore, Library, Now Playing, Search, Settings | Same tab order and pill shape; original vector logo |
| Pills | `TvKit.kt`: 29 dp high, 16 dp horizontal padding, 13 sp semibold | Same sizes and subset of the original display font |
| Cards | `TvHomeScreen.kt`: 163 dp wide; `TvComponents.kt`: square art, 51 dp footer, 11 dp radius | Same geometry with real addon artwork |
| Focus | `TvKit.kt`: white platters, no outline; card lift 1.07 | White controls and 1.07 card scale with shadow |
| Settings | `TvSettingsScreen.kt`: 42% mark/blurb, 58% rows | Same split, 120 dp mark and 42 dp rows |
| Player | `TvNowPlayingParts.kt`: centered artwork, caption, overlay transport | Full-screen cover/caption and transport layout |
| Typography | `TvTheme.kt`: display regular/medium/semibold/bold | Original font subsets: Latin, Greek, Cyrillic, punctuation |

This is a visual translation from source, not a certified pixel-for-pixel reproduction. Compose spring motion, artwork-derived color, every preference/theme, platform font fallback and device rendering can differ. No paired Samsung device or browser-control tool was available for screenshot comparison. DOM tests verify behavior, not visual equality.

It is also not a complete Android runtime port: YouTube, lyrics, AI Automix, native effects, account-library sync and other unimplemented services are not represented as working features. Actual music appears after connecting a source and searching/playing; the signed-out Home page intentionally has the same empty-state structure rather than invented recommendations.

Performance deviations for Tizen 5: the blurred full-screen backdrop is now a plain artwork-tinted colour, card focus uses a 3 px white ring instead of a blurred shadow, and card colours are no longer derived per card.
