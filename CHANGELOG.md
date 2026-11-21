# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Follow non-owned (third-party) playlists on destination instead of attempting to clone their tracks (which triggered Spotify 403 Forbidden under Development Mode).
- Add endpoint fallback between `/tracks` and `/items` for fetching playlist tracks.
- Isolate migration errors per item so a failure on one playlist does not halt the entire migration.
- Add granular request diagnostics to Spotify API error messages.
- Playlists, liked songs and followed artists migrate again after Spotify's 2026 Web API changes.
- Source/destination cards (and the header chips) now light up right after a successful login: the auth state was only read once at app start, so it stayed stale after the OAuth callback and `/preview` redirected back to the home page.
- No more flash of "Spotify non ha accettato l'autorizzazione" after login in development: React StrictMode ran the OAuth callback twice and the second token exchange reused the single-use authorization code.
