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

- `timeline-game-v118`

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
- spelinställningspanelen är uppdelad horisontellt på desktop i tre sektioner: mode selection, Spotify-import och spelspecifika inställningar
- mixade spellistor där flera spelare kan lägga till egna sparade spellistor till samma rum
- första Party-mode-flödet för `Vems låt`, där hosten spelar/skärmdelar och spelare svarar i ett enklare Kahoot-liknande UI

Senast byggt 2026-07-11:

- Firebase Auth-stöd har lagts till via anonym inloggning, separat från Spotify OAuth.
- Realtime Database-reglerna har bytts till en striktare `auth.uid`-modell:
  - användare kan bara läsa/skriva sina egna `users/{uid}/playlists`
  - rum får `hostUid`, spelare får `uid`, och medlemskap markeras under `rooms/{roomId}/memberUids/{uid}`
  - host kan styra lobby/spel, medan gäster bara kan skriva i rummet de är medlem i
  - vanliga spelare kan bara ta bort egna/attribuerade entries i `playlistMix`
- Spotify används fortsatt för musik/profil, men Firebase-behörighet baseras nu på Firebase Auth.
- Kvar före deploy av strikta regler: fyll i `apiKey`, `authDomain` och `appId` i `FIREBASE_CONFIG`, och aktivera Anonymous Auth i Firebase Console.

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
- alla tillagda entries i `playlistMix` visas under rubriken `Blandade spellistor` med spellistenamn, spelare och låtantal
- spelinställningar visas som stor central panel när man är inne i lobby/vänteläge
- mode selection visar `Timeline-mode` och `Quiz-mode`; Party är inte längre eget spelläge utan en toggle ovanför quiz-typen
- `Spelspecifika inställningar` har toggle för Party mode och dropdown `Quiz type` med `Vems låt` och `Årtals Quiz`
- hostens val sparas i `rooms/{roomId}/settings` som `gameMode`, `quizType`, `partyMode` och `partyModeEnabled` för bakåtkompatibilitet
- Quiz `Vems låt` kan startas från lobbyinställningarna och Party-toggle styr om host/gäst-vyer ska separeras
- Party `Vems låt` bygger sin kortlek från `playlistMix`, där varje låt får `ownerPlayerId`, `ownerName` och spellistnamn från den spelare som lade till spellistan
- hosten styr Party-rundan med `Dra nytt kort` / `Nästa låt` och `Visa svar`
- spelare får ett enklare mobil-/Kahoot-liknande UI med stora svarsknappar
- Party-svar sparas under `game/answers/{playerId}` och poäng delas ut när hosten visar svaret
- v74: vanlig Quiz-vy visar stor albumcover med titel/artist och svarsalternativ för alla spelare; Party-toggle ger hosten en ren album/status-vy med svarsräkning och reveal-resultat i samma ruta
- `Årtals Quiz` finns som valbar Party-grund och skapar årtalsalternativ för aktuell låt, men behöver fortfarande gameplay-polish och hårdtest
- i Party-läge döljs `utilityMenu`/inställningsknappen för icke-host så spelarvyn blir renare
- modeknapparna är vertikalt staplade i sin sektion och innehåller både stor titel och kort förklarande text
- Spotify-import kräver ett eget `Namn i appen`; namnet behöver inte matcha Spotify och används när spellistan sparas i appen
- icke-host ser samma spelinställningspanel men host-inställningar är nedtonade/oklickbara; spellisteval och `+` är tillgängligt före start
- allmänna app-/lobbyinställningar ligger i den gamla runda/spikiga `Inställningar`-ikonen nere till höger
- allmänna inställningar innehåller lobbykod, version, namnbyte, Spotify-autoplay, `Avsluta spel` och `Avsluta lobby`
- `Avsluta spel` tar endast tillbaka rummet till lobby/spelinställningar och tar inte bort lobbyn
- slutresultatsidan har host-knappar för `Spela igen`, `Ändra spelinställningar` och `Avsluta lobby`
- `Avsluta lobby` markerar rummet som stängt, kopplar bort presence och tar bort `rooms/{roomId}` ur Firebase
- lobby stängs även automatiskt klientdrivet efter 45 minuters inaktivitet eller 4 timmars total livslängd
- viktig UI-fix: `#playlistMenu` flyttas vid appstart till `document.body` så den centrala spelinställningspanelen centreras mot viewporten och inte påverkas av hörnblobben `.playlistArea`
- `#utilityMenu` skapas separat inne vid hörnblobben för den allmänna inställningsmenyn
- Firebase Realtime Database-regler har lagts till i `database.rules.json` och kopplats via `firebase.json`
- första beta-regler finns för `users/{userId}/playlists` och `rooms/{roomId}`
- importerade/demo-spellistor sparas nu med `ownerId` för att matcha rules-strukturen
- rumsuppdateringar märks med `meta/updatedBy` så reglerna kan skilja host- och spelaråtgärder
- host-only-flöden kontrolleras även i funktionerna, inte bara via nedtonade/disabled knappar
- `playlistMix` skrivs per entry (`rooms/{roomId}/playlistMix/{entryId}`) så security rules kan tillåta egna bidrag utan att spelare får skriva över hela mixen
- `Resetta rum` rensar speldata och återgår till lobby i stället för att ta bort hela rumsnoden

Party-polish / hårdtest påbörjat 2026-07-02:

- testades lokalt med tre separata klienter mot samma Firebase-lobby via tre lokala portar
- verifierat att flera klienter kan lägga till varsin sparad spellista till samma `playlistMix` utan att entries tappas; testlobby visade `3 spellistor · 6 låtar`
- verifierat att host kan välja `Party-mode`, starta `Vems låt`, dra låt och visa svar
- verifierat att gäster i Party-läge ser stora svarsknappar och inte ser `utilityMenu`/hörninställningar
- verifierat att poäng skrivs korrekt i databasen när host visar svar
- fixat att Party-spelarlisten visar `score`/poäng i stället för Timeline-låsta kort
- fixat att första dragna Party-låten blir `Runda 1` i stället för `Runda 2`
- fixat att hostens `Nästa låt` efter sista reveal går direkt till slutresultat i stället för ett tomt mellanläge
- ändrat Party-vyn så gäster inte ser vänstra spelarlisten
- ändrat hostens vänstra Party-lista till en svarstatuslista som visar poäng och om varje spelare har svarat eller om hosten väntar på svar
- bumpat appversion till `timeline-game-v64`
- lagt cache-brytare på `party.css`, `main.js`, `render.js`, `player-ui.js`, `result-ui.js` och `config.js`-importer för att minska risken att gamla Party-moduler ligger kvar i browsercache
- Spotify-lobbyfix efter v64: Spotify-login sparar nu en `returnUrl` så spelaren kommer tillbaka till samma lobby efter OAuth, access token refreshas automatiskt med sparad refresh token när den gått ut, och cache-brytare är bumpad till `spotify-lobby-v65`
- v67: icke-host kan nu skapa/importera egna profilspellistor i lobbyn och skapa demo-spellista. Nya spellistor sparas först på spelarens profil; spelaren väljer sedan själv spellistan och trycker `+` för att lägga till den i rummets `playlistMix`. Host-only gäller fortsatt modeval, partyvariant, timeline-visibility och start/avslut.
- v68: modeknapparna, inklusive `Party-mode`, är klickbara för host när rummets `meta/status` är `lobby`; edit-låsningen går nu på lobby-status i stället för enbart `game/status`, som kunde ligga kvar/störa efter testspel.
- v69: fixat mojibake/encoding i spel-UI:t så svenska tecken och punktseparatorer i timeline, knappar, statusar och resultat visas korrekt.
- v70: startskärmens lobbydel byter till Aktivt Rum: <kod> när spelaren redan skapat eller gått med i en lobby; skapa/gå-med-kontrollerna göms för att undvika att samma spelare råkar skapa nya rum i loop.
- v79: Party `Vems låt` är omtestat efter senaste polish. Cache-brytare är uppdaterad till `active-room-start-v79` och appversion till `timeline-game-v79`.
- v80: Quiz-slutskärmen visar inte längre `Ingen tidslinje`; den visar antal rätt i Quiz-mode. Quiz-resultat placeras som planeter längs en centrerad båge runt solens osynliga omloppscirkel, och bågen expanderar symmetriskt från mitten oavsett antal spelare.
- v81: Lobbyinställningar har fått `Antal låtar i Quiz-mode` med valen 25, 50, 100 och `Hela spellistan`. Valet sparas som `settings.quizSongLimit` och quiz-kortleken kapas vid spelstart; standard är fortsatt hela spellistan.
- v82: första entrésidan/startskärmen har fått en mer appnära Wrapped-inspirerad design med färgstark hero-yta, grafiska stegkort och tydligare färgknappar i samma palett som resten av appen.
- v83: startskärmen polerades vidare: vänstra hero-rutan är solid grön med vit text, `Music Timeline`-eyebrow är borttagen, stegnumren är enfärgade, inputs har högre kontrast och hela footer-rutan fungerar som klickbar `Fortsätt till spel`-knapp.
- v84: startskärmen justerades efter visuell review: hero-rutan är gul med svart text, den inre vita hero-linjen är borttagen, nummerbrickorna är transparenta med vit border/siffra och `Fortsätt till spel` är större och centrerad över hela footer-knappen.
- v85: startskärmens bakgrund gjordes lugnare och mer lik appens huvudbakgrund, med fadeade/ur-fokus-former placerade mot kanterna och en renare mitt bakom entrépanelen.
- v111: första powerup-systemet för Timeline-mode är integrerat. Vissa kort får powerup-glow och ger en powerup vid rätt gissning, 3 rätt inom 10 sekunder ger `10 sekunder`-powerup, och högerpanelen visar spelarens powerups. Första-cut innehåller `Sno kort`, `10 sekunder` och `Flytta låst`; `Sno kort` är i denna version avsedd att användas på egen tur när inget kort är draget.
- v112: Timeline-powerups polerade. `Flytta låst` är borttagen och nya powerups är tillagda med egen ikon, titel, beskrivning och färg: `Dubbelchans`, `Årtalsledtråd`, `Skydda rundan`, `Säkra gult kort` och `Tvinga låsning`. `Sno kort` och `10 sekunder` finns kvar. Årtalsledtråd visar till exempel `199X`, Skydda rundan räddar gula kort vid miss/timer, och högerpanelen visar de nya powerup-typerna. Firebase-reglerna är smalt uppdaterade så aktiv spelare kan göra Timeline-powerup-handlingar under sin tur.
- v113: fixat lobbyinställningarnas Spotify-importkort så fältrubrikerna ligger ovanför respektive fält igen. Fixat även Timeline-drag med timer: timer-renderingen bygger inte längre om kort/tidslinje medan spelaren håller i kortet, så kortet hoppar inte tillbaka varje sekund.
- v114: powerups har fått tydligare feedback och mer grafisk stil. När spelaren får en powerup visas en animerad `Ny powerup`-toast, och powerup-korten i högerpanelen är omgjorda med bold typografi, starkare färgfält, count-badge och dramatiska former som matchar appens formspråk bättre.
- v115: spelkort som innehåller powerup har fått glassy/transparent insida så kortets glow syns tydligare. Powerup-signalen ligger nu främst i en starkare animerad glow-ring runt kortet i stället för i färgstark kortbakgrund.
- v116: `Säkra gult kort` använder nu klick-val i tidslinjen i stället för prompt. Spelaren aktiverar powerupen och klickar sedan direkt på ett gult kort; valbara kort markeras med gul puls och `SÄKRA`-badge.
- v117: Timeline-drag har auto-scroll. När spelaren håller ett kort nära vänster/höger kant av den aktiva tidslinjen scrollar raden automatiskt åt det hållet, och scroll-snap stängs av under drag för att placeringen ska kännas lugnare.
- v118: powerup-ikonerna är utbytta från textmarkörer till passande SVG-ikoner: tjuvmask för `Sno kort`, klocka för `10 sekunder`, lås för `Tvinga låsning`, samt egna symboler för dubbelchans, årtalsledtråd, skydd och säkra gult kort.

Party `Vems låt` verifierat 2026-07-03:

- färskt rum `KJQT2` skapades och testades med host + två testgäster mot Firebase
- `playlistMix` fylldes med tre entries, en per spelare, och användes som kortlek för `Vems låt`
- första dragna låten visade `Runda 1`
- hostens Party-vy visade album/status i mitten och vänsterlistan visade poäng + svarstatus
- gäster räknades korrekt som svarande; host räknas inte längre som nödvändigt svar i Party host-läge
- auto-reveal fungerade när alla gäster svarat
- poäng uppdaterades direkt efter reveal
- `Nästa låt` fungerade genom hela kortleken och sista reveal gick vidare till slutresultat
- slutresultatet sorterade Party efter poäng: testet gav `Guest B` först med `6 poäng`
- host-only-flöden är fortsatt skyddade i funktionerna via `requireHost`, inte bara via UI
- gäst-UI är kodverifierat: `body.partyMode.isGuest` döljer vänsterlista/playlist-area, `utilityMenu` och bottom dock
- cache-brytaren kontrollerades lokalt: `index.html` och `src` pekar inte längre på gamla v77/v78-strängar
- svenska tecken kontrollerades efter v79 och trasiga `�`/mojibake-strängar är borta från `index.html` och `src`
- syntaxkontroll kördes på `src/main.js`, `src/ui/render.js`, `src/ui/player-ui.js` och `src/ui/result-ui.js`

Fixat under v79-testet:

- `Vems låt` behåller nu alla aktiva spelare som svarsalternativ hela rundan. Tidigare kunde alternativen krympa till bara låtägaren sent i leken om bara en spelares låtar återstod i decken.
- versions-/cache-bumpen skrevs om som UTF-8 och svenska UI-strängar återställdes efter att några tecken råkat bli ersättningstecken.

Kvar efter v79-testet:

- kör ett riktigt test med 2-3 separata browserprofiler/enheter, eftersom senaste testet använde en riktig host-browser och Firebase-injicerade testgäster
- verifiera deployad/GitHub Pages-miljö efter commit så v79-cachebrytaren verkligen slår igenom utanför lokal server
- kontrollera guest-begränsningar i en riktig gästbrowser, inklusive att starta/avsluta/resetta inte går via UI
- testa direkta debug-/funktionsanrop som guest i en riktig gästprofil om debugytan finns tillgänglig där
- kontrollera att `Årtals Quiz` inte regresserat av Party-score/render-ändringarna

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
- lobbyinställningarna visar alla tillagda spellistor i `playlistMix` under `Blandade spellistor`
- Spotify-import sparar användarens eget appnamn för spellistan, inte ett automatiskt Spotify-id-namn
- legacy-data i `rooms/{roomId}/savedPlaylists` migreras till aktuell användares `users/{userId}/playlists`

Resultat:

- Varje användare har egna spellistor, och ett rum kan skapa en blandad spelomgång från flera användares spellistor.

Kvar/att förbättra senare:

- Firebase security rules finns som beta-version men behöver bytas till `auth.uid` när riktig Firebase Auth införs
- långsiktigt bör rummet helst lagra referenser/urval och inte full låtkopia mer än för aktiv spelomgång
- garanterad automatisk lobby-rensning utan öppen klient kräver server/Firebase Cloud Function
- reglerna skyddar idag struktur och vanliga felvägar, men är inte full publik säkerhet eftersom appen ännu saknar Firebase Auth

### Fas 3: Party Mode v1

Mål: första TV/host-baserade spelläget.

Status:

- Påbörjad. Party-mode kan väljas i lobby och första `Vems låt`-flödet finns.
- `Årtals Quiz` finns som valbar Party-variant och har grundlogik för svarsalternativ, men är inte färdigpolerat.

Bygg vidare:

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

Status:

- Första versionen är byggd som `Vems låt`.
- Spelet använder `playlistMix`, blandar låtar och låter spelare gissa vilken spelare låten tillhör.
- Hosten spelar/skärmdelar och kontrollerar nästa låt samt reveal.

Flöde:

- Alla spelare lägger in en spellista
- Spelet blandar låtar
- Alla gissar vem låten tillhör
- Poäng delas ut

Kvar:

- hårdtesta med flera riktiga klienter
- bättre runda-/slutresultatsvy för Party
- tydligare host-TV-vy när låten spelas
- bättre fallback när bara en spelare/spellista finns i mixen
- bestäm om `Vems låt` ska heta `Vems låt` eller `Vems spellista` i hela UI:t

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

### Firebase Auth

Beslut: lägg till riktig Firebase Auth innan publik beta/testdeploy med okända användare.

Nuvarande app använder fortfarande klientens `player.id` och Spotify-baserad/localStorage-baserad `userId` för ägare och hostmarkering. Det räcker för lokal prototyp och kontrollerade tester, men kan manipuleras av en egen klient.

Rekommenderat införande:

- först hårdtesta nuvarande lobby-, host/guest- och playlist-mix-flöde med 2-3 klienter
- därefter införa anonym Firebase Auth vid appstart
- byt långsiktigt `currentUserId()` till `auth.currentUser.uid`
- behåll `player.id` som spelarsession i rummet, men använd `uid` för ägarskap och regler
- flytta rules från klientmarkerad `ownerId`/`updatedBy` till `auth.uid`
- koppla Spotify-profil till Firebase-användaren senare, eller spara Spotify-profil under den anonyma användaren tills riktig kontolänkning behövs

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

- Deploy/verklig klientverifiering efter v79 + stabilisering av multiplayer/lobby

Målet i den chatten:

- deploya/committa v79 och verifiera att cache-brytaren slår igenom på GitHub Pages
- testa `Vems låt` med minst 2-3 riktiga browserprofiler/enheter
- verifiera gäst-UI i riktig gästbrowser: bara svarsvy, ingen vänsterlista, inget `utilityMenu`
- verifiera att guest inte kan starta/avsluta/resetta via UI eller direkta debug-/funktionsanrop
- förbättra host-TV-vyn om den fortfarande känns för stor eller har överflödiga knappar
- färdigställa/polisha `Årtals Quiz`
- hårdtesta beta-reglerna för `users/{userId}/playlists` och `rooms/{roomId}`
- bestäm exakt policy för room-livslängd och serverstyrd cleanup
- hårdtesta host/icke-host-flödet med flera riktiga klienter
- testa mixad spellista med flera användare och Spotify-konton
- säkerställa att deployad GitHub Pages-version inte cachear gammal CSS/JS vid UI-fixar
- lägga till möjlighet att ta bort sparade spellistor från användarens `users/{userId}/playlists`
- ta bort spellista ska även hantera om spellistan finns i aktuell `playlistMix` eller är vald i rummet
- lägga till Firebase Auth innan publik beta/deploy med okända användare

## Aktuell prioritet

Prio 1:

- verifiera Party `Vems låt` i riktig deployad miljö med 2-3 separata browserprofiler/enheter efter v79

Prio 2:

- hårdtesta Firebase-regler, lobby cleanup och multiplayer-flöden

Prio 3:

- lägga till Firebase Auth inför publik beta

Prio 4:

- färdigställa Party `Årtals Quiz`

Prio 5:

- Firebase Hosting / publik testdeploy

Nästa sak på agendan:
Fortsätt från v79-verifieringen:

- committa/deploya v79 och kontrollera GitHub Pages i vanlig browser
- starta ett nytt rum med 2-3 riktiga klienter/profiler/enheter
- verifiera att gäster i riktig gästbrowser bara ser svarsvyn, utan vänsterlista och utan `utilityMenu`
- verifiera att guest inte kan starta/avsluta/resetta via UI i riktig gästbrowser
- försök direkta debug-/funktionsanrop som guest om debugytan är tillgänglig i profilen
- kör ett snabbt regressionspass på `Årtals Quiz`
