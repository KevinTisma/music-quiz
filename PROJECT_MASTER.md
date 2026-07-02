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
- Firebase sparade spellistor per användare
- spelare/profil
- timeline gameplay
- slutresultat med planet-tema
- PWA-stöd
- iOS homescreen-stöd
- lobby-system v63 med dynamiska rum, host-id, player list och delningslänk
- central spelinställningspanel i lobby och separat allmän inställningsmeny i hörnet
- mixade spellistor där flera spelare kan lägga till egna sparade spellistor till samma rum

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
- Spotify-profil används för namn/avatar och för stabilt user-id när Spotify är kopplat
- importerade och demo-spellistor sparas under `users/{userId}/playlists/{playlistId}`
- äldre room-baserade spellistor migreras från `rooms/{roomId}/savedPlaylists` till aktuell användares `users/{userId}/playlists`
- appen lyssnar på aktuell användares spellistor och visar dem i lobby/spelinställningar
- rummet får spelomgångens kopia av låtar via `songBank`, `selectedPlaylist` och `playlistMix`
- alla spelare kan lägga till egna sparade spellistor med `+` till `rooms/{roomId}/playlistMix`
- blandad spellista byggs genom att slå ihop alla entries i `playlistMix`; host startar spelet med den mixade kortleken
- spelinställningar visas som stor central panel när man är inne i lobby/vänteläge
- icke-host ser samma spelinställningspanel men host-inställningar är nedtonade/oklickbara; spellisteval och `+` är tillgängligt före start
- allmänna app-/lobbyinställningar ligger i den gamla runda/spikiga `Inställningar`-ikonen nere till höger
- allmänna inställningar innehåller lobbykod, version, namnbyte, Spotify-autoplay och `Avsluta spel`
- `Avsluta spel` tar endast tillbaka rummet till lobby/spelinställningar och tar inte bort lobbyn
- slutresultatsidan har host-knappar för `Spela igen`, `Ändra spelinställningar` och `Avsluta lobby`
- `Avsluta lobby` markerar rummet som stängt, kopplar bort presence och tar bort `rooms/{roomId}` ur Firebase
- lobby stängs även automatiskt klientdrivet efter 45 minuters inaktivitet eller 4 timmars total livslängd
- viktig UI-fix: `#playlistMenu` flyttas vid appstart till `document.body` så den centrala spelinställningspanelen centreras mot viewporten och inte påverkas av hörnblobben `.playlistArea`
- `#utilityMenu` skapas separat inne vid hörnblobben för den allmänna inställningsmenyn

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

Status: huvuddelen är klar i Classic Timeline-flödet.

Mål: spellistor ska inte ligga globalt eller permanent i rummet.

Ny struktur:

- `users/{userId}/playlists/{playlistId}`
- `rooms/{roomId}`

Byggt:

- Spotify user-id används när Spotify-profil finns; annars fallback till lokal player-id
- user profile cache används för namn/avatar och byter aktiv playlist-lyssnare vid user-id-byte
- importerade spellistor sparas under `users/{userId}/playlists/{playlistId}`
- demo-spellista sparas också under användaren
- appen lyssnar på `users/{userId}/playlists`
- room får bara spelomgångens kopia/referensdata: `selectedPlaylist`, `selectedPlaylistId`, `songBank`
- flera spelare kan bidra till rummet via `rooms/{roomId}/playlistMix`
- legacy-data i `rooms/{roomId}/savedPlaylists` migreras till aktuell användares `users/{userId}/playlists`

Resultat:

- Varje användare har egna spellistor, och ett rum kan skapa en blandad spelomgång från flera användares spellistor.

Kvar/att förbättra senare:

- Firebase security rules behöver anpassas till `users/{userId}/playlists` och `rooms/{roomId}`
- långsiktigt bör rummet helst lagra referenser/urval och inte full låtkopia mer än för aktiv spelomgång
- garanterad automatisk lobby-rensning utan öppen klient kräver server/Firebase Cloud Function

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

### Test och verifiering

Beslut: test och verifiering ska prioriteras när viktiga funktioner ändras.

Det gäller särskilt vid ändringar i:

- databasstruktur
- Firebase-logik
- JavaScript-kod som styr appflöde
- lobby, rum, spelare och game state
- Spotify-integration

Vid mindre ändringar, till exempel text, roadmap, enklare styling eller dokumentation, behövs normalt inte full funktionstestning.

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
Max 8–12 spelare per lobby i början
Rensa gamla rooms
Spara spellistor under users
Kopiera inte stora spellistor till varje room i onödan
Lyssna inte på hela databasen
Ha en tydlig “beta”-status

Vi bygger först för Firebase Spark/gratis.
Målet är max 100 samtidiga anslutningar.
Appen optimeras för små rum och låg datatrafik.
När Spotify-auth behöver verifieras server-side eller när vi närmar oss 100 samtidiga anslutningar byter vi till Blaze.

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

- Stabilisering av multiplayer/lobby och Firebase-regler

Målet i den chatten:

- se över Firebase security rules för users/playlists och rooms
- bestäm exakt policy för room-livslängd och serverstyrd cleanup
- hårdtesta host/icke-host-flödet med flera riktiga klienter
- testa mixad spellista med flera användare och Spotify-konton
- säkerställa att deployad GitHub Pages-version inte cachear gammal CSS/JS vid UI-fixar

## Aktuell prioritet

Prio 1:

- stabilisera Firebase-regler, lobby cleanup och multiplayer-flöden

Prio 2:

- bygga första party-läget: Gissa årtal

Prio 3:

- Firebase Hosting / publik testdeploy

Nästa sak på agendan:
Fortsätt jobba med CSS för Lobbyinställningar. 
Justera så att varje gång man lägger till en spellista så ska den också visas under "blandade spellistor". Dvs att Alla spellistor som blir tillagda hamnar på en lista där.
