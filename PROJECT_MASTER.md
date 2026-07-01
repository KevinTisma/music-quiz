# Hitster App - Projektmaster

Den här filen är projektets huvudöversikt för Hitster App. Den används som gemensam kontext för planering, tekniska beslut, roadmap och kommande fokuserade byggchattar.

## Roll för den här projektmastern

Den här projektmastern håller koll på:

- projektets mål
- appens struktur
- roadmap
- tekniska beslut
- databasstruktur
- game modes
- prioriteringar
- vad som ska byggas i separata chattar
- vilken version som är aktuell
- vilka problem som finns kvar

Andra chattar kan vara mer fokuserade, till exempel:

- Chat 1: Bygga lobby-system
- Chat 2: Firebase users/playlists
- Chat 3: Party mode - gissa årtal
- Chat 4: Spotify API / Extended Quota
- Chat 5: PWA / deployment / hosting

## Nuvarande projektstatus

Senaste appversion:

- `timeline-game-v63`

PWA-version byggd från:

- `timeline-game-v61`

Nuvarande app är fortfarande främst ett Classic Timeline-spel med:

- Spotify playlist import
- Firebase sparade spellistor
- spelare/profil
- timeline gameplay
- slutresultat med planet-tema
- PWA-stöd
- iOS homescreen-stöd
- lobby-system v63 med dynamiska rum, host-id, player list och delningslänk

Senast byggt 2026-07-02:

- dynamiska room codes skapas med kollisionscheck mot Firebase
- skapa lobby sparar `rooms/{roomId}/meta` med `hostId`, `code`, `status`, `createdAt`, `updatedAt`
- gå med lobby kräver befintlig lobbykod
- URL-param `?room=ABC123` synkas till aktivt rum
- delningslänk visas och kan kopieras
- lobby screen visar aktuell kod, Firebase-path och live player list
- host markeras i lobby och player strip
- start/avsluta spel är låst till host
- spelare markeras offline i gamla rummet vid rumbyte

## Viktig begränsning just nu

Appen är fortfarande byggd runt ett mer lokalt/prototyp-flöde.

Den behöver byggas om för att stödja att vem som helst kan:

- gå in
- skapa lobby
- bjuda in andra
- koppla Spotify
- spara egna spellistor
- spela online

## Projektmål

Bygga en publik webbaserad musikquiz-app, ungefär som:

- skribbl.io
- Hitster
- Jackbox
- Kahoot

Användare ska kunna:

- gå in på en riktig URL
- logga in/koppla Spotify
- skapa lobby
- dela lobbykod/länk
- spela olika game modes
- använda egna spellistor
- spela på mobil, dator eller TV

## Huvuddelar i projektet

### 1. Core App

Basappen:

- UI
- routing
- PWA
- lobby
- player management
- host controls
- game state

### 2. Spotify Integration

- login
- importera spellistor
- hämta låtar
- spara metadata
- playback för host
- Spotify Extended Quota senare

### 3. Firebase Backend

- hosting
- auth/user data
- database
- rooms
- playlists per user
- security rules

### 4. Game Modes

Första versioner:

- Classic Timeline
- Party: Gissa årtal
- Party: Vems spellista

Senare:

- Gissa artist
- Gissa låttitel
- Gissa person + årtal
- Speed rounds
- Team mode

## Rekommenderad Roadmap

### Fas 1: Strukturera om appen

Mål: gå från prototyp till multiplayer-app.

Bygg:

- dynamiska room codes - klart
- skapa lobby - klart
- gå med lobby - klart
- URL-param `?room=ABC123` - klart
- host-roll - klart
- lobby screen - klart
- player list - klart
- share link - klart
- dynamisk Firebase path `rooms/{roomId}` - klart
- start game endast för host - klart

Resultat:

- Appen fungerar nu som riktig lobby-app för Classic Timeline-flödet.

### Fas 2: Flytta spellistor till användare

Mål: spellistor ska inte ligga globalt eller i rummet.

Ny struktur:

- `users/{userId}/playlists/{playlistId}`
- `rooms/{roomId}`

Bygg:

- Spotify user-id
- user profile
- spara spellistor under användaren
- host väljer egen spellista
- room får bara referens eller kopia till spelomgången

Resultat:

- Varje användare har sina egna spellistor.

### Fas 3: Party Mode v1

Mål: första TV/host-baserade spelläget.

Bygg:

- Party: Gissa årtal

Flöde:

- Host visar låt på TV
- Alla spelare svarar på mobil
- Resultat visas
- Poäng uppdateras
- Nästa runda

Resultat:

- Appen börjar kännas som skribbl.io / Jackbox.

### Fas 4: Party Mode v2

Bygg:

- Party: Vems spellista?

Flöde:

- Alla spelare lägger in en spellista
- Spelet blandar låtar
- Alla gissar vem låten tillhör
- Poäng delas ut

Resultat:

- Appen får ett eget socialt party-läge.

### Fas 5: Publik release

Behövs:

- Firebase Hosting
- riktig domän
- privacy policy
- terms of service
- Spotify app review / Extended Quota Mode
- bättre Firebase security rules
- eventuell Blaze-plan

## Viktiga tekniska beslut hittills

### Appen ska bli PWA

Beslut: ja.

Syfte:

- kunna läggas på iOS hemskärm
- kännas mer som app
- fungera bättre på mobil

### Firebase används som backend

Beslut: troligen ja.

Första version:

- Firebase Hosting
- Realtime Database

Senare kan Firestore övervägas om strukturen växer mycket.

### Spotify-data ska inte sparas globalt

Beslut: spellistor ska ligga under användare.

Struktur:

- `users/{userId}/playlists`

### Game modes ska separeras

Beslut: inte blanda allt i timeline-koden.

Exempelstruktur:

```js
if (mode === 'timeline') renderTimelineGame();
if (mode === 'party-year') renderPartyYearGame();
if (mode === 'party-owner') renderPartyOwnerGame();
```

## Nästa konkreta byggsteg

Nästa kodchatt bör vara:

- Flytta spellistor till användare

Målet i den chatten:

- skapa `users/{userId}/playlists/{playlistId}`
- koppla Spotify user-id till lokal/Firebase-profil
- spara importerade spellistor under användaren
- låta host välja egen spellista
- låta rummet få en referens eller kopia till spelomgången
- behålla `rooms/{roomId}` för game state och players

## Aktuell prioritet

Prio 1:

- flytta spellistor till användare

Prio 2:

- bygga första party-läget: Gissa årtal

Prio 3:

- Firebase Hosting / publik testdeploy
